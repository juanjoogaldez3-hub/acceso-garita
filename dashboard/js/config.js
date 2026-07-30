/* ============================================================================
   CONFIGURACIÓN DEL DASHBOARD
   ----------------------------------------------------------------------------
   ⚠️  ESTE ES EL ÚNICO ARCHIVO QUE TENÉS QUE EDITAR.
       Los demás archivos .js no se tocan.
   ========================================================================== */

const CONFIG = {

  /* ─────────────────────────────────────────────────────────────────────
     1) CREDENCIALES DE SUPABASE
     ─────────────────────────────────────────────────────────────────────
     Dónde las conseguís:
       supabase.com  →  tu proyecto  →  Settings  →  API
         · "Project URL"          →  va en  url
         · "anon" / "public" key  →  va en  anonKey

     ⚠️ IMPORTANTE: acá va la llave "anon" (pública), NUNCA la "service_role".
        La service_role solo se usa en el receptor, que corre en el servidor.

     ⚠️ Esta llave queda visible para cualquiera que abra la página. Eso es
        normal y no es un problema SIEMPRE Y CUANDO hayas corrido el archivo
        sql/dashboard-seguridad.sql, que exige iniciar sesión para leer datos.
     ───────────────────────────────────────────────────────────────────── */

  ambiente: 'pruebas',   // poné 'produccion' o 'pruebas'

  produccion: {
    url:     'https://xxxxxxxxxxxx.supabase.co',
    anonKey: 'pega_aqui_la_anon_key_de_produccion',
  },

  pruebas: {
    url:     'https://yyyyyyyyyyyy.supabase.co',
    anonKey: 'pega_aqui_la_anon_key_de_pruebas',
  },


  /* ─────────────────────────────────────────────────────────────────────
     2) UBICACIÓN DE LA COLONIA
     ─────────────────────────────────────────────────────────────────────
     Es donde se centra el mapa al abrir, antes de que haya visitas.

     Cómo sacar las coordenadas de tu colonia:
       1. Abrí Google Maps y buscá la entrada de la colonia
       2. Clic derecho justo en la garita
       3. El primer renglón del menú son los números: copialos acá
          (el primero es lat, el segundo es lng)
     ───────────────────────────────────────────────────────────────────── */

  centro: {
    lat:  14.634915,    // ejemplo: Ciudad de Guatemala
    lng: -90.506882,
    zoom: 16,           // más alto = más cerca (16 ó 17 va bien para una colonia)
  },


  /* ─────────────────────────────────────────────────────────────────────
     3) AJUSTES DE OPERACIÓN
     ───────────────────────────────────────────────────────────────────── */

  // Si un tracker no reporta en estos minutos, se marca "SIN SEÑAL" (gris).
  minutosSinSenal: 5,

  // Cuántos puntos del recorrido se dibujan detrás de cada carro.
  puntosDeRecorrido: 40,

  // A partir de cuántos km/h se considera que el carro va "en movimiento".
  velocidadMinima: 3,


  /* ─────────────────────────────────────────────────────────────────────
     4) MODO DEMOSTRACIÓN
     ─────────────────────────────────────────────────────────────────────
     En 'auto' el dashboard se comporta así:
        · Si Supabase está configurado  → usa datos REALES.
        · Si todavía no lo configuraste → inventa visitas que se mueven,
          para que puedas ver cómo se ve y mostrárselo a la junta.

     Otras opciones:  'siempre'  (fuerza los datos inventados)
                      'nunca'    (nunca inventa; si falla, muestra el error)
     ───────────────────────────────────────────────────────────────────── */

  modoDemo: 'auto',
};


/* ── De acá para abajo no hace falta tocar nada ───────────────────────── */

CONFIG.activo = CONFIG[CONFIG.ambiente] || CONFIG.pruebas;

// ¿Están puestas las credenciales de verdad? (ignoramos los valores de ejemplo)
CONFIG.supabaseListo = Boolean(
  CONFIG.activo &&
  CONFIG.activo.url &&
  CONFIG.activo.url.startsWith('https://') &&
  !CONFIG.activo.url.includes('xxxxxxxxxxxx') &&
  !CONFIG.activo.url.includes('yyyyyyyyyyyy') &&
  CONFIG.activo.anonKey &&
  !CONFIG.activo.anonKey.startsWith('pega_aqui')
);
