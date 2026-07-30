'use strict';

/**
 * ============================================================================
 *  PARSER DEL PROTOCOLO CONCOX / GT06   (para el tracker Jimi IoT LL301)
 * ============================================================================
 *
 *  ¿Qué hace este archivo?
 *  El tracker no manda texto: manda "paquetes" de bytes con una forma fija.
 *  Acá desarmamos esos paquetes (login, latido/heartbeat, ubicación, alarma)
 *  y también armamos las respuestas (ACK) que el aparato necesita recibir
 *  para no cortar la conexión.
 *
 *  FORMA DE UNA TRAMA (paquete) GT06
 *  ---------------------------------
 *  Trama corta (la mayoría de paquetes):
 *
 *    78 78 | LEN | PROTO | ...contenido... | SERIAL(2) | CRC(2) | 0D 0A
 *    └arranque┘  │       │                 │           │        └fin
 *                │       │                 │           └ firma de validación
 *                │       │                 └ número de serie del paquete
 *                │       └ tipo de paquete (0x01 = login, etc.)
 *                └ largo = cuenta desde PROTO hasta el final del CRC
 *
 *  Trama larga (empieza con 79 79): igual pero el LARGO son 2 bytes.
 *  La usan los paquetes con mucha info (por ejemplo WiFi/LBS del LL301).
 *
 *  NOTA sobre el LL301: es un "asset tracker" con protocolo Concox NUEVO.
 *  Además de los tipos clásicos usa otros propios:
 *    - heartbeat/estado:  0x23  y  0x36
 *    - ubicación por 4G:  0xA0
 *    - calibración de hora: 0x8A
 *    - paquetes de WiFi/LBS (posición aproximada sin GPS)
 *  Por eso, además de decodificar lo conocido, SIEMPRE imprimimos los bytes
 *  crudos en hex: cuando llegue el aparato real vamos a ver exactamente qué
 *  manda y afinamos este parser con datos de verdad.
 * ----------------------------------------------------------------------------
 */

const { crc16ITU } = require('./crc');

// --- Números de protocolo (tipo de paquete) --------------------------------
const PROTO = {
  LOGIN: 0x01,

  // Heartbeat / estado (batería, señal). Clásico + los del LL301.
  HEARTBEAT_CLASSIC: 0x13,
  HEARTBEAT_LL301_A: 0x23,
  HEARTBEAT_LL301_B: 0x36,

  // Ubicación GPS. Clásicos + el del LL301 por 4G.
  GPS_LBS_1: 0x12,
  GPS_LBS_2: 0x22,
  GPS_LBS_LL301_4G: 0xa0,

  // Alarmas (incluye remoción del imán / tamper).
  ALARM_1: 0x16,
  ALARM_2: 0x26,
  ALARM_LL301: 0x27,

  // Calibración de hora: el aparato pide la hora del servidor.
  TIME_CHECK: 0x8a,

  // Información general (a veces trae WiFi, ICCID, etc.).
  INFO_TRANSMISSION: 0x94,
};

// --- Categorías (para que el server sepa cómo tratar cada paquete) ----------
const HEARTBEAT_TYPES = new Set([
  PROTO.HEARTBEAT_CLASSIC,
  PROTO.HEARTBEAT_LL301_A,
  PROTO.HEARTBEAT_LL301_B,
]);

const LOCATION_TYPES = new Set([
  PROTO.GPS_LBS_1,
  PROTO.GPS_LBS_2,
  PROTO.GPS_LBS_LL301_4G,
]);

const ALARM_TYPES = new Set([
  PROTO.ALARM_1,
  PROTO.ALARM_2,
  PROTO.ALARM_LL301,
]);

// Códigos de alarma conocidos en la familia Concox. El de remoción del imán
// puede variar según firmware; por eso siempre logueamos el código crudo.
const ALARM_NAMES = {
  0x01: 'SOS',
  0x02: 'corte de corriente',
  0x03: 'vibracion',
  0x09: 'remocion / tamper (iman removido)',
  0x0e: 'bateria baja',
  0x13: 'remocion / tamper',
  0x14: 'remocion / tamper',
};

/**
 * Convierte un Buffer a texto hexadecimal legible, separado por espacios.
 * Ej: <Buffer 78 78 05 01> -> "78 78 05 01"
 */
function toHex(buffer) {
  return buffer.toString('hex').toUpperCase().replace(/(..)/g, '$1 ').trim();
}

/**
 * Decodifica un IMEI que viene en formato BCD (8 bytes = 16 dígitos).
 * El IMEI real tiene 15 dígitos, así que tomamos los últimos 15.
 */
function decodeImei(buf8) {
  const digits = buf8.toString('hex'); // 16 dígitos hex, que son los dígitos del IMEI
  return digits.slice(-15);
}

/**
 * Mapea el "nivel de voltaje" (0..6) que reporta el aparato a un porcentaje
 * aproximado de batería. OJO: es una estimación; el nivel real lo vamos a
 * ajustar cuando veamos qué manda el LL301 de verdad (por eso el hex).
 */
function voltageLevelToPercent(level) {
  const tabla = { 0: 0, 1: 10, 2: 25, 3: 50, 4: 70, 5: 85, 6: 100 };
  return tabla[level] !== undefined ? tabla[level] : null;
}

/**
 * Toma el "stream" TCP acumulado y saca de adelante UNA trama completa.
 * Devuelve { frame, rest } donde:
 *   - frame = Buffer de la trama completa (o null si todavía no está entera)
 *   - rest  = lo que queda del buffer para la próxima vuelta
 * También descarta "basura" hasta encontrar un arranque válido (78 78 / 79 79).
 */
function extractFrame(buffer) {
  // Buscar el próximo arranque válido y descartar lo de antes.
  let start = -1;
  for (let i = 0; i + 1 < buffer.length; i++) {
    const a = buffer[i];
    const b = buffer[i + 1];
    if ((a === 0x78 && b === 0x78) || (a === 0x79 && b === 0x79)) {
      start = i;
      break;
    }
  }
  if (start === -1) {
    // No hay arranque; si hay bytes sueltos, dejamos solo el último por si
    // era la primera mitad de un "78".
    return { frame: null, rest: buffer.length > 0 ? buffer.slice(-1) : buffer };
  }
  if (start > 0) {
    buffer = buffer.slice(start); // tirar basura del principio
  }

  const isLong = buffer[0] === 0x79;

  // Necesitamos al menos el arranque + el/los byte(s) de largo.
  if (buffer.length < (isLong ? 4 : 3)) {
    return { frame: null, rest: buffer };
  }

  let contentLen; // valor del campo LARGO (desde PROTO hasta fin de CRC)
  let headerLen; // bytes de arranque + campo largo
  if (isLong) {
    contentLen = buffer.readUInt16BE(2);
    headerLen = 4;
  } else {
    contentLen = buffer[2];
    headerLen = 3;
  }

  // Trama total = arranque(2) + campoLargo(1 o 2) + contentLen + fin(2)
  const totalLen = headerLen + contentLen + 2;
  if (buffer.length < totalLen) {
    return { frame: null, rest: buffer }; // todavía no llegó completa
  }

  const frame = buffer.slice(0, totalLen);
  const rest = buffer.slice(totalLen);
  return { frame, rest };
}

/**
 * Desarma una trama completa y devuelve un objeto con lo que pudimos entender.
 * Nunca lanza excepción: si algo no cuadra, devuelve lo que se pueda y marca
 * el error, porque preferimos ver el hex antes que romper el servidor.
 */
function parseFrame(frame) {
  const result = {
    hex: toHex(frame),
    length: frame.length,
    isLong: frame[0] === 0x79,
    protocol: null,
    protocolHex: null,
    kind: 'desconocido',
    serial: null, // Buffer de 2 bytes (lo necesitamos para el ACK)
    crcOk: null,
    data: {}, // info decodificada (imei, lat, lng, etc.)
    error: null,
  };

  try {
    const headerLen = result.isLong ? 4 : 3;
    result.protocol = frame[headerLen];
    result.protocolHex = '0x' + result.protocol.toString(16).padStart(2, '0');

    // Contenido = desde después del protocolo hasta antes de serial+crc.
    // Los últimos 6 bytes son: serial(2) + crc(2) + fin(2).
    const content = frame.slice(headerLen + 1, frame.length - 6);
    result.serial = frame.slice(frame.length - 6, frame.length - 4);

    // Validar CRC: se calcula desde el campo LARGO hasta antes del propio CRC.
    const crcRecibido = frame.readUInt16BE(frame.length - 4);
    const crcCalculado = crc16ITU(frame.slice(2, frame.length - 4));
    result.crcOk = crcRecibido === crcCalculado;

    const p = result.protocol;

    if (p === PROTO.LOGIN) {
      result.kind = 'login';
      // Los primeros 8 bytes del contenido son el IMEI en BCD.
      result.data.imei = decodeImei(content.slice(0, 8));
    } else if (HEARTBEAT_TYPES.has(p)) {
      result.kind = 'heartbeat';
      parseStatus(content, result.data);
    } else if (LOCATION_TYPES.has(p)) {
      result.kind = 'location';
      parseLocation(content, result.data);
    } else if (ALARM_TYPES.has(p)) {
      result.kind = 'alarm';
      // Las alarmas traen ubicación + estado + un byte de tipo de alarma.
      parseLocation(content, result.data);
      // El byte de alarma suele venir después del bloque de estado; como su
      // posición varía por modelo, lo buscamos de forma tolerante y de todos
      // modos dejamos el hex para confirmarlo con el aparato real.
      const alarmByte = guessAlarmByte(content);
      result.data.alarmCode = alarmByte;
      result.data.alarmName =
        alarmByte != null && ALARM_NAMES[alarmByte]
          ? ALARM_NAMES[alarmByte]
          : 'alarma (codigo ' + (alarmByte != null ? '0x' + alarmByte.toString(16) : '?') + ')';
    } else if (p === PROTO.TIME_CHECK) {
      result.kind = 'time';
    } else {
      result.kind = 'desconocido';
    }
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

/**
 * Bloque de ESTADO (heartbeat): info de terminal, nivel de batería y señal GSM.
 * Estructura típica:  [infoTerminal(1)] [nivelVoltaje(1)] [señalGSM(1)] [alarma/idioma(2)]
 */
function parseStatus(content, out) {
  if (content.length >= 1) out.terminalInfo = content[0];
  if (content.length >= 2) {
    out.voltageLevel = content[1];
    out.bateriaPct = voltageLevelToPercent(content[1]);
  }
  if (content.length >= 3) out.gsmSignal = content[2];
}

/**
 * Bloque de UBICACIÓN GPS. La parte de adelante (fecha/hora, lat, lng,
 * velocidad, rumbo) es estable en toda la familia Concox, así que la
 * decodificamos con confianza. La "cola" (LBS/estado) varía por modelo y la
 * dejamos como opcional.
 *
 * Estructura del frente:
 *   fecha/hora(6) | satélites(1) | lat(4) | lng(4) | velocidad(1) | rumbo+estado(2)
 */
function parseLocation(content, out) {
  if (content.length < 18) {
    out.gpsIncompleto = true;
    return;
  }

  // Fecha/hora: AA MM DD HH MM SS (viene en UTC, año = 2000 + AA)
  const yy = content[0];
  const mm = content[1];
  const dd = content[2];
  const hh = content[3];
  const mi = content[4];
  const ss = content[5];
  // Date.UTC evita líos de zona horaria: guardamos siempre en UTC (ISO con Z).
  out.horaUTC = new Date(Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss)).toISOString();

  // Cantidad de satélites (nibble bajo del byte 6).
  out.satelites = content[6] & 0x0f;

  // Latitud y longitud: enteros que se dividen entre 1 800 000 para dar grados.
  let lat = content.readUInt32BE(7) / 1800000;
  let lng = content.readUInt32BE(11) / 1800000;

  out.velocidad = content[15]; // km/h

  // Rumbo + estado (2 bytes de banderas):
  //   bits 0-9  -> rumbo (0..360)
  //   bit 10    -> 1 = latitud Norte (positiva), 0 = Sur (negativa)
  //   bit 11    -> 1 = longitud Oeste (negativa), 0 = Este (positiva)
  //   bit 12    -> 1 = posición GPS válida (fix)
  const flags = content.readUInt16BE(16);
  out.rumbo = flags & 0x03ff;
  out.gpsValido = Boolean(flags & 0x1000);
  if (!(flags & 0x0400)) lat = -lat; // hemisferio sur
  if (flags & 0x0800) lng = -lng; // hemisferio oeste (Guatemala está al Oeste)

  out.lat = Number(lat.toFixed(6));
  out.lng = Number(lng.toFixed(6));
}

/**
 * Intenta ubicar el byte de tipo de alarma dentro del contenido. Como su
 * posición exacta depende del modelo/firmware, hacemos una estimación
 * razonable. Lo importante es que el hex crudo siempre queda impreso para
 * confirmar el valor real cuando probemos el LL301.
 */
function guessAlarmByte(content) {
  // En muchos paquetes de alarma Concox, tras el bloque de estado
  // (infoTerminal, voltaje, gsm) viene el byte de alarma. Heurística simple:
  // si el paquete es más largo que el bloque GPS puro (18), miramos cerca del
  // final, antes del posible bloque de idioma.
  if (content.length >= 20) {
    // posición aproximada: después de GPS(18) + infoTerminal/voltaje/gsm.
    const idx = Math.min(content.length - 3, 21);
    return content[idx];
  }
  return null;
}

/**
 * Arma una respuesta (ACK) para el aparato. Repite el mismo número de
 * protocolo y el mismo serial que llegó, y agrega el CRC correcto.
 *
 *   78 78 | LEN | PROTO | SERIAL(2) | CRC(2) | 0D 0A
 */
function buildAck(protocol, serialBuf) {
  // cuerpo que va después del LEN: protocolo(1) + serial(2)
  const body = Buffer.concat([Buffer.from([protocol]), serialBuf]);
  const len = body.length + 2; // + 2 bytes de CRC
  const paraCrc = Buffer.concat([Buffer.from([len]), body]);
  const crc = crc16ITU(paraCrc);
  const crcBuf = Buffer.from([(crc >> 8) & 0xff, crc & 0xff]);
  return Buffer.concat([
    Buffer.from([0x78, 0x78, len]),
    body,
    crcBuf,
    Buffer.from([0x0d, 0x0a]),
  ]);
}

/**
 * Respuesta al paquete de calibración de hora (0x8A): el servidor devuelve
 * su fecha/hora actual en UTC (6 bytes AA MM DD HH MM SS).
 */
function buildTimeAck(serialBuf) {
  const now = new Date();
  const timeBytes = Buffer.from([
    now.getUTCFullYear() - 2000,
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
  ]);
  const body = Buffer.concat([Buffer.from([PROTO.TIME_CHECK]), timeBytes, serialBuf]);
  const len = body.length + 2;
  const paraCrc = Buffer.concat([Buffer.from([len]), body]);
  const crc = crc16ITU(paraCrc);
  const crcBuf = Buffer.from([(crc >> 8) & 0xff, crc & 0xff]);
  return Buffer.concat([
    Buffer.from([0x78, 0x78, len]),
    body,
    crcBuf,
    Buffer.from([0x0d, 0x0a]),
  ]);
}

module.exports = {
  PROTO,
  HEARTBEAT_TYPES,
  LOCATION_TYPES,
  ALARM_TYPES,
  toHex,
  extractFrame,
  parseFrame,
  buildAck,
  buildTimeAck,
};
