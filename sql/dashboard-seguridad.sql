-- ============================================================================
--  SEGURIDAD DEL DASHBOARD  +  TIEMPO REAL
-- ============================================================================
--  CORRÉ ESTE ARCHIVO EN LOS DOS AMBIENTES (producción y pruebas).
--
--  ¿Qué hace y por qué?
--  El dashboard vive en GitHub Pages, que es una página pública. La "llave"
--  de Supabase (la anon key) queda visible en el código de la página; eso es
--  inevitable en cualquier página estática.
--
--  Con las tablas SIN RLS, esa llave le daría a cualquiera acceso total:
--  podría leer el historial completo de ubicaciones, placas y casas
--  visitadas, e incluso borrar datos.
--
--  Este script arregla eso: activa RLS y deja pasar SOLO a usuarios que
--  hayan iniciado sesión, y únicamente para LEER.
--
--  ⚠️ ¿Y el receptor de trackers? Sigue funcionando igual. Usa la
--     "service_role key", que por diseño pasa por encima de RLS. No hay que
--     tocarle nada.
-- ----------------------------------------------------------------------------


-- ────────────────────────────────────────────────────────────────────────────
--  1) ACTIVAR RLS  (a partir de acá, nadie entra si no tiene permiso)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE trackers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE posiciones ENABLE ROW LEVEL SECURITY;

-- La tabla 'eventos' es opcional (ver eventos.sql). Si todavía no la creaste,
-- este bloque no hace nada en vez de dar error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'eventos') THEN
    EXECUTE 'ALTER TABLE eventos ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
--  2) PERMISO DE LECTURA PARA USUARIOS CON SESIÓN INICIADA
-- ────────────────────────────────────────────────────────────────────────────
--  'authenticated' = cualquiera que haya entrado con correo y contraseña.
--  Nadie más (ni siquiera con la llave pública) puede leer nada.

DROP POLICY IF EXISTS lectura_autenticada ON trackers;
CREATE POLICY lectura_autenticada ON trackers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS lectura_autenticada ON visitas;
CREATE POLICY lectura_autenticada ON visitas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS lectura_autenticada ON posiciones;
CREATE POLICY lectura_autenticada ON posiciones
  FOR SELECT TO authenticated USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'eventos') THEN
    EXECUTE 'DROP POLICY IF EXISTS lectura_autenticada ON eventos';
    EXECUTE 'CREATE POLICY lectura_autenticada ON eventos FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

--  NOTA: a propósito NO damos permiso de INSERT/UPDATE/DELETE al dashboard.
--  Hoy el dashboard solo mira. Cuando hagamos la pantalla de la garita para
--  registrar ingresos y salidas, agregamos ahí los permisos que hagan falta.


-- ────────────────────────────────────────────────────────────────────────────
--  3) ÍNDICES  (para que el mapa cargue rápido cuando haya muchos datos)
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS posiciones_visita_hora_idx
  ON posiciones (visita_id, hora DESC);

CREATE INDEX IF NOT EXISTS posiciones_tracker_hora_idx
  ON posiciones (tracker_id, hora DESC);

CREATE INDEX IF NOT EXISTS visitas_estado_idx
  ON visitas (estado);


-- ────────────────────────────────────────────────────────────────────────────
--  4) TIEMPO REAL  (para que el puntito se mueva solo, sin recargar)
-- ────────────────────────────────────────────────────────────────────────────
--  Le avisamos a Supabase que queremos "escuchar" los cambios de estas tablas.
--  Si alguna ya estaba agregada, el bloque lo ignora sin dar error.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE posiciones;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE visitas;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'eventos') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE eventos;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
--  5) Recargar el esquema (según tu patrón de siempre)
-- ────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ============================================================================
--  DESPUÉS DE CORRER ESTO, TE FALTA UN PASO MANUAL (con clics, sin código):
-- ============================================================================
--  Crear los usuarios de los guardias y de la junta:
--
--    1. Entrá a tu proyecto en supabase.com
--    2. Menú izquierdo →  Authentication  →  Users
--    3. Botón  "Add user"  →  "Create new user"
--    4. Poné el correo y la contraseña del guardia
--    5. IMPORTANTE: activá la casilla  "Auto Confirm User"
--       (si no, Supabase le manda un correo de confirmación y no podrá entrar)
--    6. Repetí para cada persona que deba ver el mapa
--
--  Eso es todo: con ese correo y contraseña ya pueden entrar al dashboard.
-- ============================================================================
