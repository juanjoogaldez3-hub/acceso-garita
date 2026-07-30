'use strict';

/**
 * ============================================================================
 *  SIMULADOR / AUTO-TEST   (no necesita el aparato ni Supabase)
 * ============================================================================
 *  Sirve para dos cosas:
 *
 *   1) VALIDAR el parser sin hardware:
 *        node test-simulador.js
 *      Comprueba que el CRC, el ACK y la decodificación de ubicación estén
 *      bien, usando el ejemplo oficial del manual GT06.
 *
 *   2) SIMULAR UN TRACKER contra tu receptor ya corriendo:
 *        node test-simulador.js conectar [host] [puerto]
 *      Se conecta, manda un login y una ubicación falsa (Guatemala) y muestra
 *      lo que responde el servidor. Ideal para probar la cadena completa.
 * ----------------------------------------------------------------------------
 */

const net = require('net');
const { crc16ITU } = require('./src/crc');
const gt06 = require('./src/gt06');

// ---------------------------------------------------------------------------
//  1) AUTO-TEST
// ---------------------------------------------------------------------------
function autotest() {
  let ok = 0;
  let fail = 0;
  const check = (nombre, condicion, extra = '') => {
    if (condicion) {
      console.log(`  ✅ ${nombre}`);
      ok++;
    } else {
      console.log(`  ❌ ${nombre}   ${extra}`);
      fail++;
    }
  };

  console.log('\n── AUTO-TEST del parser ──────────────────────────────────\n');

  // (a) CRC contra el ejemplo canónico del manual GT06:
  //     el ACK de login con serial 0x0001 es  78 78 05 01 00 01 D9 DC 0D 0A
  //     => el CRC sobre [05 01 00 01] debe dar 0xD9DC.
  const crc = crc16ITU(Buffer.from([0x05, 0x01, 0x00, 0x01]));
  check(
    'CRC-ITU coincide con el ejemplo oficial (0xD9DC)',
    crc === 0xd9dc,
    `obtuve 0x${crc.toString(16).toUpperCase()}`
  );

  // (b) buildAck arma exactamente esa trama.
  const ack = gt06.buildAck(0x01, Buffer.from([0x00, 0x01]));
  const ackEsperado = '78 78 05 01 00 01 D9 DC 0D 0A';
  check('buildAck(login, 0x0001) da la trama oficial', gt06.toHex(ack) === ackEsperado, gt06.toHex(ack));

  // (c) parseFrame reconoce un login y saca el IMEI.
  //     IMEI 0868200400458054 (BCD) -> últimos 15 dígitos.
  const loginFrame = construirLogin('0868200400458054', 0x0001);
  const p1 = gt06.parseFrame(loginFrame);
  check('parseFrame detecta login', p1.kind === 'login', p1.kind);
  check('parseFrame CRC del login OK', p1.crcOk === true);
  check('parseFrame saca IMEI correcto', p1.data.imei === '868200400458054', p1.data.imei);

  // (d) parseFrame decodifica una ubicación en Guatemala.
  const gtLat = 14.634915; // aprox. Ciudad de Guatemala
  const gtLng = -90.506882;
  const locFrame = construirUbicacion(gtLat, gtLng, 42, 0x0002);
  const p2 = gt06.parseFrame(locFrame);
  check('parseFrame detecta ubicación', p2.kind === 'location', p2.kind);
  check('parseFrame CRC de la ubicación OK', p2.crcOk === true);
  check(
    'latitud decodificada ≈ correcta (Norte, +)',
    Math.abs(p2.data.lat - gtLat) < 0.001,
    `lat=${p2.data.lat}`
  );
  check(
    'longitud decodificada ≈ correcta (Oeste, −)',
    Math.abs(p2.data.lng - gtLng) < 0.001,
    `lng=${p2.data.lng}`
  );
  check('velocidad decodificada', p2.data.velocidad === 42, `vel=${p2.data.velocidad}`);
  check('GPS marcado como válido', p2.data.gpsValido === true);

  // (e) extractFrame separa dos tramas pegadas (como pasa en TCP real).
  const pegadas = Buffer.concat([loginFrame, locFrame]);
  const e1 = gt06.extractFrame(pegadas);
  const e2 = gt06.extractFrame(e1.rest);
  check('extractFrame separa 2 tramas pegadas', Boolean(e1.frame) && Boolean(e2.frame));
  check('extractFrame no deja sobras', e2.rest.length === 0);

  console.log(`\n── Resultado: ${ok} OK, ${fail} fallidos ──\n`);
  process.exit(fail === 0 ? 0 : 1);
}

// --- Constructores de tramas de prueba (encoder de juguete) -----------------

function armarTrama(protocolo, contenido, serial) {
  const serialBuf = Buffer.from([(serial >> 8) & 0xff, serial & 0xff]);
  const body = Buffer.concat([Buffer.from([protocolo]), contenido, serialBuf]);
  const len = body.length + 2; // + CRC
  const paraCrc = Buffer.concat([Buffer.from([len]), body]);
  const crc = crc16ITU(paraCrc);
  const crcBuf = Buffer.from([(crc >> 8) & 0xff, crc & 0xff]);
  return Buffer.concat([Buffer.from([0x78, 0x78, len]), body, crcBuf, Buffer.from([0x0d, 0x0a])]);
}

function construirLogin(imeiHex16, serial) {
  const imei = Buffer.from(imeiHex16, 'hex'); // 8 bytes
  return armarTrama(0x01, imei, serial);
}

function construirUbicacion(lat, lng, velocidad, serial) {
  const now = new Date();
  const fecha = Buffer.from([
    now.getUTCFullYear() - 2000,
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
  ]);
  const sats = Buffer.from([0xc9]); // nibble alto = largo, nibble bajo = 9 satélites

  const latRaw = Math.round(Math.abs(lat) * 1800000);
  const lngRaw = Math.round(Math.abs(lng) * 1800000);
  const latBuf = Buffer.alloc(4);
  latBuf.writeUInt32BE(latRaw);
  const lngBuf = Buffer.alloc(4);
  lngBuf.writeUInt32BE(lngRaw);

  const velBuf = Buffer.from([velocidad & 0xff]);

  // banderas: bit12 válido, bit10 Norte, bit11 Oeste, rumbo 90
  let flags = 90;
  flags |= 0x1000; // válido
  if (lat >= 0) flags |= 0x0400; // Norte
  if (lng < 0) flags |= 0x0800; // Oeste
  const flagsBuf = Buffer.from([(flags >> 8) & 0xff, flags & 0xff]);

  const contenido = Buffer.concat([fecha, sats, latBuf, lngBuf, velBuf, flagsBuf]);
  return armarTrama(0x12, contenido, serial);
}

// ---------------------------------------------------------------------------
//  2) MODO "CONECTAR": simular un tracker contra el receptor
// ---------------------------------------------------------------------------
function conectar(host, puerto) {
  const sock = net.connect(puerto, host, () => {
    console.log(`\n🔗 Conectado a ${host}:${puerto} — simulando tracker...\n`);
    const login = construirLogin('0868200400458054', 0x0001);
    console.log(`>> login:     ${gt06.toHex(login)}`);
    sock.write(login);

    setTimeout(() => {
      const loc = construirUbicacion(14.634915, -90.506882, 42, 0x0002);
      console.log(`>> ubicación: ${gt06.toHex(loc)}`);
      sock.write(loc);
    }, 800);

    setTimeout(() => {
      console.log('\n✅ Listo. Cerrando simulador.');
      sock.end();
      process.exit(0);
    }, 2000);
  });

  sock.on('data', (d) => console.log(`<< respuesta: ${gt06.toHex(d)}`));
  sock.on('error', (e) => {
    console.error(`\n❌ No me pude conectar: ${e.message}`);
    console.error('   ¿Está corriendo el receptor?  ->  npm start');
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
const modo = process.argv[2];
if (modo === 'conectar') {
  conectar(process.argv[3] || '127.0.0.1', parseInt(process.argv[4] || '5000', 10));
} else {
  autotest();
}
