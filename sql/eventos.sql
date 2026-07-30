-- ============================================================================
--  TABLA: eventos   (opcional, para alarmas del tracker: remoción del imán, etc.)
-- ============================================================================
--  Seguí tu convención de siempre:  CREATE + DISABLE RLS + NOTIFY.
--  CORRÉ ESTE SCRIPT EN LOS DOS AMBIENTES (producción y pruebas).
--
--  Para qué sirve: el LL301 tiene alerta de remoción del imán (tamper). Cuando
--  llega una alarma, el receptor guarda un renglón acá para que quede registro
--  y el dashboard/junta pueda verlo.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS eventos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tracker_id  BIGINT REFERENCES trackers (id),
  visita_id   BIGINT REFERENCES visitas (id),
  tipo        TEXT NOT NULL,             -- ej: 'alarma'
  detalle     TEXT,                      -- ej: 'remocion / tamper (iman removido)'
  hora        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deshabilitar RLS (según tu patrón).
ALTER TABLE eventos DISABLE ROW LEVEL SECURITY;

-- Índices útiles para consultar por tracker o por visita.
CREATE INDEX IF NOT EXISTS eventos_tracker_idx ON eventos (tracker_id);
CREATE INDEX IF NOT EXISTS eventos_visita_idx  ON eventos (visita_id);

-- Recargar el esquema (según tu patrón).
NOTIFY pgrst, 'reload schema';
