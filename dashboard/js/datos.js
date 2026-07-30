/* ============================================================================
   DATOS — sesión, consultas a Supabase y tiempo real
   ----------------------------------------------------------------------------
   Todo lo que habla con la base de datos vive acá. El resto del programa
   solo pide "dame las visitas" y no le importa de dónde salen.

   Nota sobre cómo unimos la información: hacemos tres consultas simples
   (visitas, trackers, posiciones) y las juntamos acá en el navegador, en vez
   de pedirle a la base que haga el cruce. Es a propósito: así funciona igual
   aunque las tablas no tengan declaradas las llaves foráneas entre sí.
   ========================================================================== */

const Datos = (() => {

  let sb = null;              // cliente de Supabase
  let canales = [];           // suscripciones de tiempo real abiertas

  /* ─────────────────────────────────────────────────────────────────────
     ARRANQUE
     ───────────────────────────────────────────────────────────────────── */

  function iniciar() {
    if (!CONFIG.supabaseListo) return false;
    if (sb) return true;
    sb = window.supabase.createClient(CONFIG.activo.url, CONFIG.activo.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return true;
  }

  function disponible() { return sb !== null; }

  /* ─────────────────────────────────────────────────────────────────────
     SESIÓN
     ───────────────────────────────────────────────────────────────────── */

  async function sesionActual() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function iniciarSesion(correo, clave) {
    if (!sb) throw new Error('Supabase no está configurado.');
    const { data, error } = await sb.auth.signInWithPassword({
      email: correo,
      password: clave,
    });
    if (error) throw new Error(traducirErrorLogin(error.message));
    return data.session;
  }

  async function cerrarSesion() {
    desuscribir();
    if (sb) await sb.auth.signOut();
  }

  function alCambiarSesion(callback) {
    if (!sb) return;
    sb.auth.onAuthStateChange((evento, sesion) => callback(evento, sesion));
  }

  /** Traduce los errores de Supabase a algo que se entienda en español. */
  function traducirErrorLogin(mensaje) {
    const m = (mensaje || '').toLowerCase();
    if (m.includes('invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (m.includes('email not confirmed')) {
      return 'Ese usuario no está confirmado. En Supabase, creálo con la casilla "Auto Confirm User" activada.';
    }
    if (m.includes('failed to fetch') || m.includes('networkerror')) {
      return 'No hay conexión con el servidor. Revisá tu internet.';
    }
    return mensaje || 'No se pudo entrar.';
  }

  /* ─────────────────────────────────────────────────────────────────────
     CONSULTAS
     ───────────────────────────────────────────────────────────────────── */

  /**
   * Trae todas las visitas que están adentro, cada una con los datos de su
   * tracker y su última posición conocida.
   * @returns {Promise<Array>} lista de visitas listas para mostrar
   */
  async function cargarVisitasActivas() {
    if (!sb) return [];

    // 1) Las visitas que están adentro.
    const { data: visitas, error: e1 } = await sb
      .from('visitas')
      .select('id, placa, visitante, casa_destino, tracker_id, hora_ingreso, estado')
      .eq('estado', 'adentro')
      .order('hora_ingreso', { ascending: false });

    if (e1) throw new Error('No se pudieron leer las visitas: ' + e1.message);
    if (!visitas || !visitas.length) return [];

    const idsVisita  = visitas.map((v) => v.id);
    const idsTracker = [...new Set(visitas.map((v) => v.tracker_id).filter(Boolean))];

    // 2) Los trackers de esas visitas (batería, última conexión).
    let trackers = [];
    if (idsTracker.length) {
      const { data, error } = await sb
        .from('trackers')
        .select('id, imei, etiqueta, estado, bateria, ultima_conexion')
        .in('id', idsTracker);
      if (error) throw new Error('No se pudieron leer los trackers: ' + error.message);
      trackers = data || [];
    }
    const porTracker = new Map(trackers.map((t) => [t.id, t]));

    // 3) Las posiciones recientes de esas visitas (sirven para el punto y el
    //    recorrido). Pedimos un bloque y lo repartimos acá.
    const tope = Math.max(200, idsVisita.length * CONFIG.puntosDeRecorrido);
    const { data: posiciones, error: e3 } = await sb
      .from('posiciones')
      .select('visita_id, tracker_id, lat, lng, velocidad, bateria, hora')
      .in('visita_id', idsVisita)
      .order('hora', { ascending: false })
      .limit(tope);

    if (e3) throw new Error('No se pudieron leer las posiciones: ' + e3.message);

    // Agrupamos las posiciones por visita (ya vienen de más nueva a más vieja).
    const porVisita = new Map();
    (posiciones || []).forEach((p) => {
      if (!porVisita.has(p.visita_id)) porVisita.set(p.visita_id, []);
      const lista = porVisita.get(p.visita_id);
      if (lista.length < CONFIG.puntosDeRecorrido) lista.push(p);
    });

    // 4) Juntamos todo en un solo objeto por visita.
    return visitas.map((v) => {
      const tracker = porTracker.get(v.tracker_id) || {};
      const puntos  = porVisita.get(v.id) || [];
      const ultima  = puntos[0] || null;

      return {
        visita_id:    v.id,
        placa:        v.placa,
        visitante:    v.visitante,
        casa_destino: v.casa_destino,
        hora_ingreso: v.hora_ingreso,

        tracker_id:      v.tracker_id,
        etiqueta:        tracker.etiqueta || null,
        bateria:         ultima?.bateria ?? tracker.bateria ?? null,
        ultima_conexion: tracker.ultima_conexion || null,

        lat:           ultima ? Number(ultima.lat) : null,
        lng:           ultima ? Number(ultima.lng) : null,
        velocidad:     ultima ? Number(ultima.velocidad || 0) : null,
        hora_posicion: ultima ? ultima.hora : null,

        // El recorrido va de más viejo a más nuevo, para dibujar la línea.
        recorrido: puntos.slice().reverse().map((p) => [Number(p.lat), Number(p.lng)]),

        alerta: false,
      };
    });
  }

  /**
   * Trae las alarmas recientes (remoción del imán, etc.).
   * Si la tabla 'eventos' todavía no existe, devuelve una lista vacía en
   * lugar de romper el dashboard.
   */
  async function cargarAlertasRecientes(desdeMinutos = 60) {
    if (!sb) return [];
    const desde = new Date(Date.now() - desdeMinutos * 60000).toISOString();
    const { data, error } = await sb
      .from('eventos')
      .select('id, tracker_id, visita_id, tipo, detalle, hora')
      .gte('hora', desde)
      .order('hora', { ascending: false })
      .limit(50);
    if (error) return [];   // la tabla es opcional
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────────────────
     GARITA — registrar ingresos y salidas
     ───────────────────────────────────────────────────────────────────── */

  /** Correo de quien tiene la sesión abierta (queda como guardia responsable). */
  async function correoUsuario() {
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data?.user?.email || null;
  }

  /**
   * Trackers que se le pueden poner a un carro ahora mismo.
   * "Disponible" lo calculamos de la verdad (que no esté en una visita
   * adentro), no del campo 'estado', que se puede desincronizar.
   */
  async function cargarTrackersDisponibles() {
    if (!sb) return [];

    const { data: trackers, error } = await sb
      .from('trackers')
      .select('id, imei, etiqueta, estado, bateria, ultima_conexion')
      .order('etiqueta', { ascending: true });
    if (error) throw new Error('No se pudieron leer los trackers: ' + error.message);

    const { data: ocupadas, error: e2 } = await sb
      .from('visitas')
      .select('tracker_id')
      .eq('estado', 'adentro')
      .not('tracker_id', 'is', null);
    if (e2) throw new Error('No se pudieron leer las visitas: ' + e2.message);

    const ocupados = new Set((ocupadas || []).map((v) => v.tracker_id));
    return (trackers || []).filter((t) => !ocupados.has(t.id));
  }

  /** Lista simple de las visitas que están adentro (para la garita). */
  async function cargarVisitasAdentro() {
    if (!sb) return [];
    const { data, error } = await sb
      .from('visitas')
      .select('id, placa, visitante, casa_destino, tracker_id, hora_ingreso, guardia_ingreso')
      .eq('estado', 'adentro')
      .order('hora_ingreso', { ascending: false });
    if (error) throw new Error('No se pudieron leer las visitas: ' + error.message);

    const ids = [...new Set((data || []).map((v) => v.tracker_id).filter(Boolean))];
    let porTracker = new Map();
    if (ids.length) {
      const { data: trackers } = await sb
        .from('trackers')
        .select('id, etiqueta, bateria, ultima_conexion')
        .in('id', ids);
      porTracker = new Map((trackers || []).map((t) => [t.id, t]));
    }

    return (data || []).map((v) => ({
      ...v,
      tracker: porTracker.get(v.tracker_id) || null,
    }));
  }

  /**
   * Da de alta una visita: el carro entró a la colonia.
   * También marca el tracker como 'asignado'.
   */
  async function registrarIngreso({ placa, visitante, casaDestino, trackerId }) {
    if (!sb) throw new Error('Supabase no está configurado.');

    const guardia = await correoUsuario();

    const { data, error } = await sb
      .from('visitas')
      .insert({
        placa: (placa || '').trim().toUpperCase(),
        visitante: (visitante || '').trim() || null,
        casa_destino: (casaDestino || '').trim() || null,
        tracker_id: trackerId || null,
        hora_ingreso: new Date().toISOString(),
        estado: 'adentro',
        guardia_ingreso: guardia,
      })
      .select()
      .single();

    if (error) throw new Error(traducirErrorEscritura(error));

    if (trackerId) {
      await sb.from('trackers').update({ estado: 'asignado' }).eq('id', trackerId);
    }
    return data;
  }

  /**
   * Cierra una visita: el carro salió y se recuperó el tracker.
   */
  async function registrarSalida(visitaId, trackerId) {
    if (!sb) throw new Error('Supabase no está configurado.');

    const guardia = await correoUsuario();

    const { error } = await sb
      .from('visitas')
      .update({
        estado: 'afuera',
        hora_salida: new Date().toISOString(),
        guardia_salida: guardia,
      })
      .eq('id', visitaId);

    if (error) throw new Error(traducirErrorEscritura(error));

    if (trackerId) {
      await sb.from('trackers').update({ estado: 'disponible' }).eq('id', trackerId);
    }
  }

  /** Convierte los errores de la base en algo que se entienda. */
  function traducirErrorEscritura(error) {
    const codigo = error.code || '';
    const msg = (error.message || '').toLowerCase();

    if (codigo === '23505' || msg.includes('duplicate key')) {
      return 'Ese tracker ya está puesto en otro carro que está adentro. ' +
             'Actualizá la lista y elegí otro.';
    }
    if (codigo === '42501' || msg.includes('row-level security')) {
      return 'No tenés permiso para escribir. ¿Corriste el archivo ' +
             'sql/garita-permisos.sql en este ambiente?';
    }
    if (msg.includes('failed to fetch')) {
      return 'No hay conexión con el servidor. Revisá tu internet.';
    }
    return error.message || 'No se pudo guardar.';
  }

  /* ─────────────────────────────────────────────────────────────────────
     TIEMPO REAL
     ───────────────────────────────────────────────────────────────────── */

  /**
   * Se queda escuchando los cambios de la base.
   * @param {object} manejadores  { alNuevaPosicion, alCambioVisita, alNuevaAlerta, alEstado }
   */
  function suscribir(manejadores) {
    if (!sb) return;
    desuscribir();

    const canal = sb
      .channel('tablero-garita')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posiciones' },
        (msg) => manejadores.alNuevaPosicion?.(msg.new))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'visitas' },
        (msg) => manejadores.alCambioVisita?.(msg.eventType, msg.new, msg.old))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'eventos' },
        (msg) => manejadores.alNuevaAlerta?.(msg.new))
      .subscribe((estado) => {
        // estado: SUBSCRIBED · CHANNEL_ERROR · TIMED_OUT · CLOSED
        manejadores.alEstado?.(estado);
      });

    canales.push(canal);
  }

  function desuscribir() {
    canales.forEach((c) => { try { sb?.removeChannel(c); } catch (_) {} });
    canales = [];
  }

  /* ───────────────────────────────────────────────────────────────────── */
  return {
    iniciar, disponible,
    sesionActual, iniciarSesion, cerrarSesion, alCambiarSesion, correoUsuario,
    cargarVisitasActivas, cargarAlertasRecientes,
    cargarTrackersDisponibles, cargarVisitasAdentro,
    registrarIngreso, registrarSalida,
    suscribir, desuscribir,
  };
})();
