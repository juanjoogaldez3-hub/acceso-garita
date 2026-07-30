'use strict';

/**
 * Punto de entrada del receptor.
 * Se corre con:  npm start   (o)   node index.js
 */

const { iniciarServidor } = require('./src/server');

iniciarServidor();

// Cierre ordenado si te pide detenerse (Ctrl+C, o el hosting lo reinicia).
process.on('SIGINT', () => {
  console.log('\n👋 Cerrando el receptor...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  process.exit(0);
});
