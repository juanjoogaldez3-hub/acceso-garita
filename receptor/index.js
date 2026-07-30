'use strict';

/**
 * Punto de entrada del receptor.
 *
 * Se puede correr de dos formas:
 *   - Con Node:      npm start    (o)   node index.js
 *   - Como programa: doble clic en  receptor-trackers.exe  (Windows)
 */

const { iniciarServidor, salirConPausa } = require('./src/server');

// Si algo falla feo, mostramos el error y (en el .exe) esperamos un ENTER,
// para que la ventana no se cierre sin que puedas leer qué pasó.
process.on('uncaughtException', (e) => {
  console.error('\n💥 Error inesperado:', e.message);
  console.error(e.stack);
  salirConPausa(1);
});
process.on('unhandledRejection', (e) => {
  console.error('\n💥 Error inesperado (promesa):', e && e.message ? e.message : e);
  salirConPausa(1);
});

iniciarServidor();

// Cierre ordenado si te pide detenerse (Ctrl+C, o el hosting lo reinicia).
process.on('SIGINT', () => {
  console.log('\n👋 Cerrando el receptor...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  process.exit(0);
});
