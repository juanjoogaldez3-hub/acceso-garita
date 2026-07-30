'use strict';

/**
 * Carga la configuración desde el archivo .env y elige el ambiente de
 * Supabase (producción o pruebas) según la variable SUPABASE_ENV.
 *
 * Si las credenciales del ambiente elegido están vacías, el receptor arranca
 * igual en MODO DIAGNÓSTICO (solo hex + ACK de login), sin tocar Supabase.
 */

require('dotenv').config();

const rawEnv = (process.env.SUPABASE_ENV || 'pruebas').toLowerCase().trim();

// Aceptamos varias formas de escribirlo para que no falle por una tilde.
const esProduccion = ['produccion', 'producción', 'production', 'prod'].includes(rawEnv);
const ambiente = esProduccion ? 'produccion' : 'pruebas';

const supabaseUrl = esProduccion
  ? process.env.SUPABASE_URL_PROD
  : process.env.SUPABASE_URL_TEST;

const supabaseKey = esProduccion
  ? process.env.SUPABASE_SERVICE_KEY_PROD
  : process.env.SUPABASE_SERVICE_KEY_TEST;

// ¿Tenemos credenciales reales? (ignoramos los valores de ejemplo)
const supabaseHabilitado = Boolean(
  supabaseUrl &&
    supabaseKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseKey.startsWith('pega_aqui')
);

const config = {
  tcpPort: parseInt(process.env.TCP_PORT || '5000', 10),
  ambiente,
  supabaseUrl,
  supabaseKey,
  supabaseHabilitado,
};

module.exports = config;
