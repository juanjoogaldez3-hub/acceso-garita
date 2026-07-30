'use strict';

/**
 * ============================================================================
 *  SERVIDOR TCP  —  recibe a los trackers y orquesta todo
 * ============================================================================
 *  Flujo por cada aparato conectado:
 *    1. Llegan bytes -> imprimimos el HEX crudo (clave para depurar el LL301).
 *    2. Sacamos las tramas completas del "stream" TCP.
 *    3. Desarmamos cada trama (login / heartbeat / ubicación / alarma).
 *    4. Respondemos el ACK que corresponda (login, heartbeat, alarma, hora).
 *    5. Si hay ubicación y Supabase está activo, guardamos la posición.
 * ----------------------------------------------------------------------------
 */

const net = require('net');
const config = require('./config');
const gt06 = require('./gt06');
const db = require('./supabase');

// --- Ayudas de log con hora local -------------------------------------------
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

/**
 * Cierra el programa, pero si estamos en la versión .exe (doble clic en
 * Windows) espera un ENTER primero. Si no, la ventana negra se cerraría de
 * golpe y no alcanzarías a leer el mensaje de error.
 */
function salirConPausa(codigo) {
  if (process.pkg && process.stdin.isTTY) {
    console.error('\n   (presioná ENTER para cerrar esta ventana)');
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(codigo));
  } else {
    process.exit(codigo);
  }
}

/**
 * Procesa UNA trama ya desarmada para una conexión dada.
 * `sock.ctx` guarda el estado de esa conexión (imei, tracker, visita).
 */
async function manejarTrama(sock, parsed) {
  const etiqueta = sock.ctx.imei ? `IMEI ${sock.ctx.imei}` : sock.remoteLabel;

  // Log resumido y legible de lo que entendimos.
  const crcTxt = parsed.crcOk === false ? '  ⚠ CRC NO COINCIDE' : '';
  log(`   ↳ ${parsed.kind.toUpperCase()} (proto ${parsed.protocolHex})${crcTxt}`);

  switch (parsed.kind) {
    case 'login': {
      sock.ctx.imei = parsed.data.imei;
      log(`   ↳ LOGIN de IMEI ${parsed.data.imei}`);
      // Respondemos SIEMPRE el ACK de login (si no, el aparato se desconecta).
      responder(sock, gt06.buildAck(gt06.PROTO.LOGIN, parsed.serial), 'ACK login');

      // Si hay base, buscamos el tracker y su visita activa y lo cacheamos.
      if (db.habilitado()) {
        const tracker = await db.getTrackerByImei(parsed.data.imei);
        if (tracker) {
          sock.ctx.tracker = tracker;
          const visita = await db.getVisitaActiva(tracker.id);
          sock.ctx.visita = visita;
          log(
            `   ↳ tracker #${tracker.id} (${tracker.etiqueta || 's/etiqueta'})` +
              (visita
                ? `, visita activa #${visita.id} placa ${visita.placa}`
                : ', SIN visita "adentro"')
          );
        } else {
          log(`   ↳ ⚠ ese IMEI no está en la tabla 'trackers'. Agregalo para guardar posiciones.`);
        }
      }
      break;
    }

    case 'heartbeat': {
      log(
        `   ↳ estado: bateria≈${parsed.data.bateriaPct ?? '?'}% ` +
          `(nivel ${parsed.data.voltageLevel ?? '?'}), señal GSM ${parsed.data.gsmSignal ?? '?'}`
      );
      responder(sock, gt06.buildAck(parsed.protocol, parsed.serial), 'ACK heartbeat');
      // Aprovechamos para actualizar batería/última conexión.
      if (db.habilitado() && sock.ctx.tracker) {
        await db.updateTracker(sock.ctx.tracker.id, {
          bateria: parsed.data.bateriaPct,
          ultimaConexion: new Date().toISOString(),
        });
      }
      break;
    }

    case 'location': {
      await manejarUbicacion(sock, parsed, etiqueta);
      // Nota: las ubicaciones GPS normalmente NO requieren ACK en GT06.
      // Si con el aparato real vemos que sí lo espera, se descomenta:
      // responder(sock, gt06.buildAck(parsed.protocol, parsed.serial), 'ACK location');
      break;
    }

    case 'alarm': {
      log(`   ↳ 🚨 ALARMA: ${parsed.data.alarmName}`);
      // La alarma también trae ubicación: la guardamos igual.
      await manejarUbicacion(sock, parsed, etiqueta);
      // Registramos el evento (best-effort).
      if (db.habilitado() && sock.ctx.tracker) {
        await db.insertEvento({
          trackerId: sock.ctx.tracker.id,
          visitaId: sock.ctx.visita ? sock.ctx.visita.id : null,
          tipo: 'alarma',
          detalle: parsed.data.alarmName,
          hora: new Date().toISOString(),
        });
      }
      // Las alarmas SÍ se responden.
      responder(sock, gt06.buildAck(parsed.protocol, parsed.serial), 'ACK alarma');
      break;
    }

    case 'time': {
      // El aparato pide la hora del servidor.
      responder(sock, gt06.buildTimeAck(parsed.serial), 'respuesta de hora');
      break;
    }

    default: {
      log(`   ↳ ⚠ paquete DESCONOCIDO (proto ${parsed.protocolHex}). Guardá este hex para afinarlo:`);
      log(`      ${parsed.hex}`);
      // Muchos paquetes desconocidos igual esperan un ACK con su mismo proto.
      // Lo intentamos para no perder la conexión; es inofensivo si no lo usa.
      responder(sock, gt06.buildAck(parsed.protocol, parsed.serial), 'ACK genérico');
      break;
    }
  }
}

/**
 * Guarda una ubicación en la base (si corresponde) y la muestra en consola.
 */
async function manejarUbicacion(sock, parsed, etiqueta) {
  const d = parsed.data;
  if (d.gpsIncompleto || d.lat === undefined) {
    log(`   ↳ ubicación sin GPS decodificable (¿WiFi/LBS?). Revisá el hex de arriba.`);
    return;
  }

  const fixTxt = d.gpsValido ? 'GPS OK' : 'GPS sin fix';
  log(
    `   ↳ 📍 ${d.lat}, ${d.lng}  | ${d.velocidad} km/h | ${d.satelites} sat | ` +
      `${fixTxt} | ${d.horaUTC}`
  );

  if (!db.habilitado()) return;

  if (!sock.ctx.tracker) {
    // Puede pasar si el login trajo un IMEI que no está cargado en 'trackers'.
    return;
  }

  // Refrescamos la visita activa por si entró/salió mientras estaba conectado.
  if (!sock.ctx.visita) {
    sock.ctx.visita = await db.getVisitaActiva(sock.ctx.tracker.id);
  }

  await db.insertPosicion({
    trackerId: sock.ctx.tracker.id,
    visitaId: sock.ctx.visita ? sock.ctx.visita.id : null,
    lat: d.lat,
    lng: d.lng,
    velocidad: d.velocidad,
    bateria: d.bateriaPct ?? null,
    hora: d.horaUTC,
  });

  await db.updateTracker(sock.ctx.tracker.id, {
    bateria: d.bateriaPct,
    ultimaConexion: new Date().toISOString(),
  });
}

/** Envía bytes al aparato e imprime el hex de salida. */
function responder(sock, buffer, descripcion) {
  sock.write(buffer);
  log(`   ↳ >> enviado ${descripcion}: ${gt06.toHex(buffer)}`);
}

/**
 * Crea y arranca el servidor TCP.
 */
function iniciarServidor() {
  const server = net.createServer((sock) => {
    sock.remoteLabel = `${sock.remoteAddress}:${sock.remotePort}`;
    sock.ctx = { imei: null, tracker: null, visita: null };
    sock.buffer = Buffer.alloc(0);

    log(`🔌 NUEVA CONEXIÓN de ${sock.remoteLabel}`);

    sock.on('data', async (chunk) => {
      // 1) HEX CRUDO: esto es lo que pediste como clave para depurar.
      log(`<< ${sock.remoteLabel} (${chunk.length} bytes): ${gt06.toHex(chunk)}`);

      // 2) Acumular y sacar todas las tramas completas que haya.
      sock.buffer = Buffer.concat([sock.buffer, chunk]);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { frame, rest } = gt06.extractFrame(sock.buffer);
        sock.buffer = rest;
        if (!frame) break;
        const parsed = gt06.parseFrame(frame);
        try {
          await manejarTrama(sock, parsed);
        } catch (e) {
          log(`   ↳ ⚠ error manejando trama: ${e.message}`);
        }
      }
    });

    sock.on('close', () => log(`❌ cerró la conexión ${sock.remoteLabel}`));
    sock.on('error', (e) => log(`⚠ error de socket ${sock.remoteLabel}: ${e.message}`));
  });

  server.on('error', (e) => {
    console.error(`\n💥 No se pudo abrir el servidor en el puerto ${config.tcpPort}: ${e.message}`);
    if (e.code === 'EADDRINUSE') {
      console.error(
        `   Ese puerto ya está ocupado por otro programa.\n` +
          `   Solución: cerrá la otra ventana del receptor, o cambiá TCP_PORT en el archivo .env`
      );
    }
    salirConPausa(1);
  });

  server.listen(config.tcpPort, '0.0.0.0', () => {
    imprimirBanner();
  });

  return server;
}

function imprimirBanner() {
  const modo = db.habilitado()
    ? `MODO COMPLETO — Supabase [${config.ambiente}] conectado`
    : 'MODO DIAGNÓSTICO — solo hex + ACK (Supabase NO configurado)';
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  RECEPTOR DE TRACKERS  (Concox / GT06 · Jimi IoT LL301)');
  console.log('════════════════════════════════════════════════════════════════');
  log(`✅ Escuchando en el puerto TCP ${config.tcpPort}`);
  log(`   ${modo}`);
  log(`   Apuntá el tracker a:  <IP-o-dominio-de-tu-servidor>:${config.tcpPort}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

module.exports = { iniciarServidor, salirConPausa };
