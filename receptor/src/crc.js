'use strict';

/**
 * CRC-ITU (también llamado CRC-16/X.25) — es el que usa el protocolo
 * Concox/GT06 para validar cada paquete y para firmar las respuestas.
 *
 * Si este número no coincide con el que espera el aparato, el tracker
 * IGNORA la respuesta y se desconecta. Por eso tiene que estar perfecto.
 *
 * Parámetros del algoritmo:
 *   - polinomio reflejado: 0x8408
 *   - valor inicial: 0xFFFF
 *   - resultado final invertido (XOR con 0xFFFF)
 *
 * @param {Buffer} buffer  Los bytes sobre los que se calcula el CRC.
 * @returns {number}       Un entero de 16 bits (0..65535).
 */
function crc16ITU(buffer) {
  let crc = 0xffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 1) {
        crc = (crc >> 1) ^ 0x8408;
      } else {
        crc >>= 1;
      }
    }
  }
  return (~crc) & 0xffff;
}

module.exports = { crc16ITU };
