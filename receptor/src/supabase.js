'use strict';

/**
 * ============================================================================
 *  CAPA DE SUPABASE
 * ============================================================================
 *  Acá está todo lo que toca la base de datos. Si Supabase no está
 *  configurado (modo diagnóstico), estas funciones simplemente no hacen nada,
 *  así el receptor puede probarse sin base.
 *
 *  Tablas que usa (según tu esquema):
 *    trackers   (id, imei, etiqueta, estado, bateria, ultima_conexion)
 *    visitas    (id, placa, visitante, casa_destino, tracker_id,
 *                hora_ingreso, hora_salida, estado, guardia_ingreso, guardia_salida)
 *    posiciones (id, tracker_id, visita_id, lat, lng, velocidad, bateria, hora)
 *    eventos    (opcional, para alarmas/tamper — ver sql/eventos.sql)
 * ----------------------------------------------------------------------------
 */

const config = require('./config');

let client = null;

if (config.supabaseHabilitado) {
  // Se importa acá adentro para que, en modo diagnóstico, ni siquiera haga
  // falta tener instalada la librería.
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false },
  });
}

/** ¿Está la base conectada? */
function habilitado() {
  return client !== null;
}

/**
 * Busca un tracker por su IMEI. Devuelve la fila o null.
 */
async function getTrackerByImei(imei) {
  if (!client) return null;
  const { data, error } = await client
    .from('trackers')
    .select('id, imei, etiqueta, estado')
    .eq('imei', imei)
    .maybeSingle();
  if (error) {
    console.error('   [supabase] error buscando tracker:', error.message);
    return null;
  }
  return data;
}

/**
 * Busca la visita "adentro" asociada a un tracker. Devuelve la fila o null.
 * Si hay más de una (no debería), toma la más reciente por hora_ingreso.
 */
async function getVisitaActiva(trackerId) {
  if (!client) return null;
  const { data, error } = await client
    .from('visitas')
    .select('id, placa, visitante, casa_destino, estado')
    .eq('tracker_id', trackerId)
    .eq('estado', 'adentro')
    .order('hora_ingreso', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('   [supabase] error buscando visita activa:', error.message);
    return null;
  }
  return data;
}

/**
 * Inserta una posición nueva. Si no hay visita activa, visitaId puede ser null
 * (útil para pruebas con el aparato sobre el escritorio).
 */
async function insertPosicion({ trackerId, visitaId, lat, lng, velocidad, bateria, hora }) {
  if (!client) return;
  const { error } = await client.from('posiciones').insert({
    tracker_id: trackerId,
    visita_id: visitaId,
    lat,
    lng,
    velocidad,
    bateria,
    hora,
  });
  if (error) {
    console.error('   [supabase] error insertando posicion:', error.message);
  }
}

/**
 * Actualiza batería y última conexión del tracker.
 */
async function updateTracker(trackerId, { bateria, ultimaConexion }) {
  if (!client) return;
  const cambios = { ultima_conexion: ultimaConexion };
  if (bateria !== null && bateria !== undefined) cambios.bateria = bateria;
  const { error } = await client.from('trackers').update(cambios).eq('id', trackerId);
  if (error) {
    console.error('   [supabase] error actualizando tracker:', error.message);
  }
}

/**
 * Registra un evento (por ejemplo, remoción del imán). Es "best-effort":
 * si la tabla 'eventos' todavía no existe, no rompe nada, solo avisa una vez.
 */
let avisoEventosMostrado = false;
async function insertEvento({ trackerId, visitaId, tipo, detalle, hora }) {
  if (!client) return;
  const { error } = await client.from('eventos').insert({
    tracker_id: trackerId,
    visita_id: visitaId,
    tipo,
    detalle,
    hora,
  });
  if (error) {
    if (!avisoEventosMostrado) {
      console.error(
        "   [supabase] no se pudo guardar el evento (¿existe la tabla 'eventos'? mirá sql/eventos.sql):",
        error.message
      );
      avisoEventosMostrado = true;
    }
  }
}

module.exports = {
  habilitado,
  getTrackerByImei,
  getVisitaActiva,
  insertPosicion,
  updateTracker,
  insertEvento,
};
