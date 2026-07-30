-- ============================================================================
--  PERMISOS PARA LA PANTALLA DE LA GARITA
-- ============================================================================
--  CORRÉ ESTE ARCHIVO EN LOS DOS AMBIENTES (producción y pruebas),
--  DESPUÉS de haber corrido  dashboard-seguridad.sql
--
--  ¿Por qué hace falta?
--  El dashboard solo MIRA, entonces le alcanzaba con permiso de lectura.
--  La garita además ESCRIBE: da de alta la visita cuando el carro entra y la
--  cierra cuando sale. Este script le da esos permisos, siempre solo a
--  usuarios que hayan iniciado sesión.
-- ----------------------------------------------------------------------------


-- ────────────────────────────────────────────────────────────────────────────
--  1) VALORES QUE USA EL SISTEMA  (importante que sean siempre estos)
-- ────────────────────────────────────────────────────────────────────────────
--
--    visitas.estado    'adentro'  → el carro está dentro de la colonia
--                      'afuera'   → ya salió
--
--    trackers.estado   'disponible' → libre, se le puede poner a un carro
--                      'asignado'   → puesto en un carro que está adentro
--
--  ⚠️ El receptor busca exactamente  estado = 'adentro'  para saber a qué
--     visita pertenece cada posición. Si cambiás esa palabra, hay que
--     cambiarla también en  receptor/src/supabase.js
-- ----------------------------------------------------------------------------


-- ────────────────────────────────────────────────────────────────────────────
--  2) PERMISOS DE ESCRITURA (solo para usuarios con sesión iniciada)
-- ────────────────────────────────────────────────────────────────────────────

-- Registrar el ingreso de una visita
DROP POLICY IF EXISTS alta_autenticada ON visitas;
CREATE POLICY alta_autenticada ON visitas
  FOR INSERT TO authenticated WITH CHECK (true);

-- Marcar la salida de una visita
DROP POLICY IF EXISTS cambio_autenticado ON visitas;
CREATE POLICY cambio_autenticado ON visitas
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Marcar el tracker como asignado / disponible
DROP POLICY IF EXISTS cambio_autenticado ON trackers;
CREATE POLICY cambio_autenticado ON trackers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

--  A propósito NO damos permiso de DELETE a nadie: las visitas no se borran,
--  se cierran. Así queda el historial completo para la junta.


-- ────────────────────────────────────────────────────────────────────────────
--  3) PROTECCIÓN CONTRA ERRORES: un tracker no puede estar en dos carros
-- ────────────────────────────────────────────────────────────────────────────
--  Si dos guardias registran al mismo tiempo y eligen el mismo tracker, la
--  base lo rechaza en vez de dejar los datos revueltos. La pantalla muestra
--  un mensaje claro cuando pasa.
--
--  ⚠️ Si este renglón te da error, es porque YA tenés dos visitas 'adentro'
--     con el mismo tracker (datos viejos de prueba). Arreglá esas filas y
--     volvé a correrlo. Para encontrarlas:
--
--       SELECT tracker_id, count(*) FROM visitas
--        WHERE estado = 'adentro' AND tracker_id IS NOT NULL
--        GROUP BY tracker_id HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS visitas_un_tracker_adentro_idx
  ON visitas (tracker_id)
  WHERE estado = 'adentro' AND tracker_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
--  4) ÍNDICE PARA BUSCAR POR PLACA (el buscador de la garita)
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS visitas_placa_idx ON visitas (placa);


-- ────────────────────────────────────────────────────────────────────────────
--  5) DEJAR LOS TRACKERS EN UN ESTADO COHERENTE
-- ────────────────────────────────────────────────────────────────────────────
--  Por si quedaron trackers marcados como 'asignado' cuya visita ya salió,
--  o sin estado por ser filas viejas.

UPDATE trackers SET estado = 'disponible'
 WHERE (estado IS NULL OR estado = '' OR estado = 'asignado')
   AND id NOT IN (
     SELECT tracker_id FROM visitas
      WHERE estado = 'adentro' AND tracker_id IS NOT NULL
   );

UPDATE trackers SET estado = 'asignado'
 WHERE id IN (
   SELECT tracker_id FROM visitas
    WHERE estado = 'adentro' AND tracker_id IS NOT NULL
 );


-- ────────────────────────────────────────────────────────────────────────────
--  6) Recargar el esquema (según tu patrón de siempre)
-- ────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
