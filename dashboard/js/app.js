/* ============================================================================
   APLICACIÓN — une todas las piezas
   ----------------------------------------------------------------------------
   Decide si mostramos datos reales o la demostración, maneja el inicio de
   sesión, dibuja el panel lateral y mantiene todo actualizado.
   ========================================================================== */

(() => {

  /* ─────────────────────────────────────────────────────────────────────
     ESTADO
     ───────────────────────────────────────────────────────────────────── */
  const estado = {
    visitas: [],
    seleccionada: null,
    filtro: '',
    enDemo: false,
    alertasVistas: new Set(),
  };

  const $ = (sel) => document.querySelector(sel);

  const el = {
    login:        $('#pantalla-login'),
    formLogin:    $('#form-login'),
    correo:       $('#correo'),
    clave:        $('#clave'),
    btnEntrar:    $('#btn-entrar'),
    loginError:   $('#login-error'),

    app:          $('#app'),
    senal:        $('#indicador-senal'),
    textoConexion:$('#texto-conexion'),
    mAdentro:     $('#m-adentro'),
    mSinSenal:    $('#m-sinsenal'),
    mAlertas:     $('#m-alertas'),
    reloj:        $('#reloj'),
    btnSalir:     $('#btn-salir'),

    lista:        $('#lista-visitas'),
    panelVacio:   $('#panel-vacio'),
    buscador:     $('#buscador'),
    btnCentrar:   $('#btn-centrar'),
    btnRastros:   $('#btn-rastros'),
    bannerDemo:   $('#banner-demo'),
    avisos:       $('#avisos'),
  };

  /* ─────────────────────────────────────────────────────────────────────
     UTILIDADES
     ───────────────────────────────────────────────────────────────────── */

  function escapar(t) {
    return String(t ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /** Convierte una cantidad de minutos en algo legible: "2h 15m". */
  function duracionLegible(desdeISO) {
    if (!desdeISO) return '—';
    const minutos = Math.max(0, Math.floor((Date.now() - new Date(desdeISO)) / 60000));
    if (minutos < 60) return `${minutos}m`;
    return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, '0')}m`;
  }

  function minutosDesde(iso) {
    if (!iso) return Infinity;
    return (Date.now() - new Date(iso)) / 60000;
  }

  /** Agrega los datos calculados que necesita la pantalla. */
  function enriquecer(v) {
    const desdeUltima = minutosDesde(v.hora_posicion || v.ultima_conexion);
    v.sinSenal     = desdeUltima > CONFIG.minutosSinSenal;
    v.enMovimiento = !v.sinSenal && Number(v.velocidad || 0) >= CONFIG.velocidadMinima;
    return v;
  }

  /* ─────────────────────────────────────────────────────────────────────
     AVISOS FLOTANTES
     ───────────────────────────────────────────────────────────────────── */

  function avisar(titulo, texto, tipo = '') {
    const div = document.createElement('div');
    div.className = 'aviso' + (tipo ? ` aviso--${tipo}` : '');
    div.innerHTML =
      `<div class="aviso__cuerpo">` +
        `<div class="aviso__titulo">${escapar(titulo)}</div>` +
        `<div class="aviso__texto">${escapar(texto)}</div>` +
      `</div>`;
    el.avisos.appendChild(div);

    setTimeout(() => {
      div.classList.add('saliendo');
      setTimeout(() => div.remove(), 300);
    }, tipo === 'alerta' ? 12000 : 6000);
  }

  /* ─────────────────────────────────────────────────────────────────────
     DIBUJAR EL PANEL LATERAL
     ───────────────────────────────────────────────────────────────────── */

  function tarjetaHTML(v) {
    const clases = ['tarjeta'];
    if (v.alerta)   clases.push('tarjeta--alerta');
    if (v.sinSenal) clases.push('tarjeta--sinsenal');

    let insignia;
    if (v.alerta)           insignia = '<span class="insignia insignia--alerta">Alerta</span>';
    else if (v.sinSenal)    insignia = '<span class="insignia insignia--sinsenal">Sin señal</span>';
    else if (v.enMovimiento)insignia = '<span class="insignia insignia--movimiento">En marcha</span>';
    else                    insignia = '<span class="insignia insignia--detenido">Detenido</span>';

    const bateria = v.bateria === null || v.bateria === undefined ? '—' : `${v.bateria}%`;
    const claseBat = (v.bateria !== null && v.bateria <= 20) ? ' dato--aviso' : '';
    const velocidad = v.sinSenal || v.velocidad === null ? '—' : `${Math.round(v.velocidad)} km/h`;

    return (
      `<li class="${clases.join(' ')}" role="option" tabindex="0" ` +
          `aria-selected="${v.visita_id === estado.seleccionada}" ` +
          `data-id="${v.visita_id}">` +
        `<div class="tarjeta__fila1">` +
          `<span class="tarjeta__placa">${escapar(v.placa || 'SIN PLACA')}</span>` +
          `<span class="tarjeta__tiempo">${duracionLegible(v.hora_ingreso)} adentro</span>` +
        `</div>` +
        `<div class="tarjeta__visitante">${escapar(v.visitante || 'Visitante no registrado')}</div>` +
        `<div class="tarjeta__casa">→ ${escapar(v.casa_destino || 'sin destino')}</div>` +
        `<div class="tarjeta__pie">` +
          `<span class="dato">${velocidad}</span>` +
          `<span class="dato${claseBat}">🔋 ${bateria}</span>` +
          insignia +
        `</div>` +
      `</li>`
    );
  }

  function visitasFiltradas() {
    const f = estado.filtro.trim().toLowerCase();
    if (!f) return estado.visitas;
    return estado.visitas.filter((v) =>
      `${v.placa} ${v.visitante} ${v.casa_destino}`.toLowerCase().includes(f)
    );
  }

  function dibujar() {
    estado.visitas.forEach(enriquecer);

    // Las que tienen alerta primero, después las que están en movimiento.
    const lista = visitasFiltradas().slice().sort((a, b) => {
      if (a.alerta !== b.alerta) return a.alerta ? -1 : 1;
      if (a.sinSenal !== b.sinSenal) return a.sinSenal ? 1 : -1;
      return new Date(a.hora_ingreso) - new Date(b.hora_ingreso);
    });

    el.lista.innerHTML = lista.map(tarjetaHTML).join('');
    el.panelVacio.classList.toggle('visible', lista.length === 0);

    // Métricas de la barra superior
    const sinSenal = estado.visitas.filter((v) => v.sinSenal).length;
    const alertas  = estado.visitas.filter((v) => v.alerta).length;
    el.mAdentro.textContent  = estado.visitas.length;
    el.mSinSenal.textContent = sinSenal;
    el.mAlertas.textContent  = alertas;
    el.mSinSenal.closest('.metrica').classList.toggle('activa', sinSenal > 0);
    el.mAlertas.closest('.metrica').classList.toggle('activa', alertas > 0);

    Mapa.actualizar(estado.visitas, estado.seleccionada);
  }

  /* ─────────────────────────────────────────────────────────────────────
     CONEXIÓN (el puntito de la barra superior)
     ───────────────────────────────────────────────────────────────────── */

  function marcarConexion(tipo, texto) {
    el.senal.dataset.estado = tipo;
    el.textoConexion.textContent = texto;
  }

  /* ─────────────────────────────────────────────────────────────────────
     MODO DEMOSTRACIÓN
     ───────────────────────────────────────────────────────────────────── */

  function arrancarDemo(motivo) {
    estado.enDemo = true;
    el.bannerDemo.hidden = false;
    el.btnSalir.hidden = true;
    marcarConexion('demo', motivo || 'Datos de demostración');

    Demo.iniciar((visitas) => {
      // Le armamos el recorrido acumulando las posiciones que va inventando.
      visitas.forEach((nueva) => {
        const previa = estado.visitas.find((v) => v.visita_id === nueva.visita_id);
        const recorrido = previa ? previa.recorrido.slice() : [];
        recorrido.push([nueva.lat, nueva.lng]);
        if (recorrido.length > CONFIG.puntosDeRecorrido) recorrido.shift();
        nueva.recorrido = recorrido;
      });
      estado.visitas = visitas;
      dibujar();
    });

    // A los 20 segundos disparamos una alarma de ejemplo, para que se vea
    // cómo avisa el sistema cuando alguien quita el imán.
    setTimeout(() => {
      const a = Demo.simularAlarma();
      if (a) {
        avisar('Remoción de tracker', `${a.placa} — ${a.detalle}`, 'alerta');
        dibujar();
      }
    }, 20000);
  }

  /* ─────────────────────────────────────────────────────────────────────
     MODO REAL
     ───────────────────────────────────────────────────────────────────── */

  async function arrancarReal() {
    estado.enDemo = false;
    el.bannerDemo.hidden = true;
    el.btnSalir.hidden = false;
    marcarConexion('', 'Cargando…');

    try {
      estado.visitas = await Datos.cargarVisitasActivas();

      // Marcamos las visitas que tienen una alarma reciente.
      const alertas = await Datos.cargarAlertasRecientes(60);
      const conAlerta = new Set(alertas.map((a) => a.visita_id).filter(Boolean));
      estado.visitas.forEach((v) => { v.alerta = conAlerta.has(v.visita_id); });

      dibujar();
      marcarConexion('vivo', `En vivo · ${CONFIG.ambiente}`);
    } catch (e) {
      marcarConexion('caido', 'Error al cargar');
      avisar('No se pudieron cargar los datos', e.message, 'error');
      return;
    }

    // Nos quedamos escuchando los cambios.
    Datos.suscribir({
      alNuevaPosicion: (fila) => {
        const v = estado.visitas.find((x) => x.visita_id === fila.visita_id);
        if (!v) { recargar(); return; }   // visita nueva: recargamos todo

        v.lat = Number(fila.lat);
        v.lng = Number(fila.lng);
        v.velocidad = Number(fila.velocidad || 0);
        v.hora_posicion = fila.hora;
        if (fila.bateria !== null && fila.bateria !== undefined) v.bateria = fila.bateria;

        v.recorrido = v.recorrido || [];
        v.recorrido.push([v.lat, v.lng]);
        if (v.recorrido.length > CONFIG.puntosDeRecorrido) v.recorrido.shift();

        dibujar();
      },

      alCambioVisita: () => recargar(),

      alNuevaAlerta: (fila) => {
        if (estado.alertasVistas.has(fila.id)) return;
        estado.alertasVistas.add(fila.id);

        const v = estado.visitas.find((x) => x.visita_id === fila.visita_id);
        if (v) v.alerta = true;

        avisar(
          fila.tipo === 'alarma' ? 'Alarma del tracker' : 'Evento',
          `${v ? v.placa : 'Tracker ' + fila.tracker_id} — ${fila.detalle || 'sin detalle'}`,
          'alerta'
        );
        dibujar();
      },

      alEstado: (s) => {
        if (s === 'SUBSCRIBED')       marcarConexion('vivo', `En vivo · ${CONFIG.ambiente}`);
        else if (s === 'CHANNEL_ERROR') marcarConexion('caido', 'Sin tiempo real');
        else if (s === 'TIMED_OUT')     marcarConexion('caido', 'Conexión perdida');
      },
    });
  }

  /** Vuelve a leer todo desde la base (cuando entra o sale una visita). */
  let recargando = false;
  async function recargar() {
    if (recargando || estado.enDemo) return;
    recargando = true;
    try {
      const frescas = await Datos.cargarVisitasActivas();
      // Conservamos las alertas que ya estaban marcadas.
      const conAlerta = new Set(estado.visitas.filter((v) => v.alerta).map((v) => v.visita_id));
      frescas.forEach((v) => { v.alerta = conAlerta.has(v.visita_id); });
      estado.visitas = frescas;
      dibujar();
    } catch (e) {
      avisar('Error al actualizar', e.message, 'error');
    } finally {
      recargando = false;
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     SESIÓN
     ───────────────────────────────────────────────────────────────────── */

  function mostrarLogin() {
    el.login.style.display = '';
    el.app.hidden = true;
  }

  function mostrarApp() {
    el.login.style.display = 'none';
    el.app.hidden = false;
    Mapa.reajustar();
  }

  el.formLogin.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    el.loginError.hidden = true;
    el.btnEntrar.disabled = true;
    el.btnEntrar.querySelector('.boton__texto').textContent = 'Entrando…';

    try {
      await Datos.iniciarSesion(el.correo.value.trim(), el.clave.value);
      el.clave.value = '';
      mostrarApp();
      await arrancarReal();
    } catch (e) {
      el.loginError.textContent = e.message;
      el.loginError.hidden = false;
      // Reiniciamos la animación de "temblor" del mensaje de error.
      el.loginError.style.animation = 'none';
      void el.loginError.offsetWidth;
      el.loginError.style.animation = '';
    } finally {
      el.btnEntrar.disabled = false;
      el.btnEntrar.querySelector('.boton__texto').textContent = 'Entrar';
    }
  });

  el.btnSalir.addEventListener('click', async () => {
    await Datos.cerrarSesion();
    estado.visitas = [];
    estado.seleccionada = null;
    dibujar();
    mostrarLogin();
  });

  /* ─────────────────────────────────────────────────────────────────────
     INTERACCIÓN
     ───────────────────────────────────────────────────────────────────── */

  function seleccionar(id) {
    estado.seleccionada = estado.seleccionada === id ? null : id;
    dibujar();
    if (estado.seleccionada) Mapa.enfocar(id);
  }

  el.lista.addEventListener('click', (ev) => {
    const tarjeta = ev.target.closest('.tarjeta');
    if (tarjeta) seleccionar(Number(tarjeta.dataset.id));
  });

  el.lista.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const tarjeta = ev.target.closest('.tarjeta');
    if (tarjeta) { ev.preventDefault(); seleccionar(Number(tarjeta.dataset.id)); }
  });

  el.buscador.addEventListener('input', (ev) => {
    estado.filtro = ev.target.value;
    dibujar();
  });

  el.btnCentrar.addEventListener('click', () => Mapa.verTodas());

  el.btnRastros.addEventListener('click', () => {
    const activo = el.btnRastros.getAttribute('aria-pressed') === 'true';
    el.btnRastros.setAttribute('aria-pressed', String(!activo));
    Mapa.alternarRecorridos(!activo);
    dibujar();
  });

  Mapa.alClic((id) => seleccionar(id));

  window.addEventListener('resize', () => Mapa.reajustar());

  /* ─────────────────────────────────────────────────────────────────────
     RELOJ  +  REFRESCO DE TIEMPOS
     ───────────────────────────────────────────────────────────────────── */

  setInterval(() => {
    const ahora = new Date();
    el.reloj.textContent = ahora.toLocaleTimeString('es-GT', { hour12: false });
    el.reloj.dateTime = ahora.toISOString();
  }, 1000);

  // Cada 20 s repintamos para que "tiempo adentro" y "sin señal" se actualicen
  // aunque no llegue ningún dato nuevo.
  setInterval(() => { if (estado.visitas.length) dibujar(); }, 20000);

  /* ─────────────────────────────────────────────────────────────────────
     ARRANQUE
     ───────────────────────────────────────────────────────────────────── */

  /**
   * Muestra un error grave a pantalla completa, en español y con la solución.
   * Se usa cuando falta algo sin lo cual el dashboard no puede funcionar.
   */
  function errorGrave(titulo, explicacion) {
    el.app.hidden = true;
    el.login.style.display = '';
    el.formLogin.innerHTML =
      `<div class="login__marca">` +
        `<span class="login__senal" style="background:#ff5252;box-shadow:0 0 12px #ff5252"></span>` +
        `<div><h1 class="login__titulo">${escapar(titulo)}</h1></div>` +
      `</div>` +
      `<p class="login__error" style="display:block">${explicacion}</p>`;
  }

  async function arrancar() {
    // Si las librerías no cargaron, avisamos claramente en vez de dejar la
    // pantalla en blanco (le pasa a quien descarga el proyecto incompleto).
    if (typeof L === 'undefined') {
      errorGrave('No cargó el mapa',
        'Falta el archivo <code>vendor/leaflet/leaflet.js</code>.<br><br>' +
        'Asegurate de haber subido la carpeta <strong>vendor/</strong> completa junto con el resto del dashboard.');
      return;
    }
    if (typeof window.supabase === 'undefined' && CONFIG.supabaseListo) {
      errorGrave('No cargó Supabase',
        'Falta el archivo <code>vendor/supabase.js</code>.<br><br>' +
        'Asegurate de haber subido la carpeta <strong>vendor/</strong> completa junto con el resto del dashboard.');
      return;
    }

    Mapa.iniciar('mapa');

    const forzarDemo = CONFIG.modoDemo === 'siempre';
    const hayCredenciales = CONFIG.supabaseListo && Datos.iniciar();

    // Caso 1: hay que usar la demostración.
    if (forzarDemo || !hayCredenciales) {
      if (CONFIG.modoDemo === 'nunca') {
        el.loginError.textContent =
          'Falta configurar Supabase en el archivo js/config.js.';
        el.loginError.hidden = false;
        mostrarLogin();
        return;
      }
      mostrarApp();
      arrancarDemo(forzarDemo ? 'Demostración forzada' : 'Supabase sin configurar');
      return;
    }

    // Caso 2: datos reales. ¿Ya había una sesión abierta?
    const sesion = await Datos.sesionActual();
    if (sesion) {
      mostrarApp();
      await arrancarReal();
    } else {
      mostrarLogin();
      el.correo.focus();
    }

    // Si la sesión se vence o se cierra en otra pestaña, volvemos al login.
    Datos.alCambiarSesion((evento) => {
      if (evento === 'SIGNED_OUT') mostrarLogin();
    });
  }

  arrancar();
})();
