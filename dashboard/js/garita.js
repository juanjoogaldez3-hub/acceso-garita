/* ============================================================================
   GARITA — registrar el ingreso y la salida de las visitas
   ----------------------------------------------------------------------------
   Esta es la pantalla que usa el guardia. El flujo es:

     ENTRA UN CARRO →  anota placa, visitante y casa
                    →  elige qué tracker le va a poner
                    →  "Registrar ingreso"

     SALE EL CARRO  →  lo busca en la lista de la derecha
                    →  botón "Salida" (pide confirmar)
                    →  el tracker queda libre para el próximo

   Sin esta pantalla el sistema no funciona: el receptor busca la visita
   'adentro' de cada tracker, y es acá donde esa visita se crea.
   ========================================================================== */

(() => {

  const estado = {
    adentro: [],        // visitas que están dentro de la colonia
    disponibles: [],    // trackers libres
    filtro: '',
    enDemo: false,
    proximoIdDemo: 1,
  };

  const $ = (s) => document.querySelector(s);

  const el = {
    login:      $('#pantalla-login'),
    formLogin:  $('#form-login'),
    correo:     $('#correo'),
    clave:      $('#clave'),
    btnEntrar:  $('#btn-entrar'),
    loginError: $('#login-error'),

    app:        $('#app'),
    senal:      $('#indicador-senal'),
    conexion:   $('#texto-conexion'),
    mAdentro:   $('#m-adentro'),
    mLibres:    $('#m-libres'),
    reloj:      $('#reloj'),
    btnSalir:   $('#btn-salir'),

    formIngreso: $('#form-ingreso'),
    placa:       $('#placa'),
    visitante:   $('#visitante'),
    casa:        $('#casa'),
    tracker:     $('#tracker'),
    ayudaTracker:$('#ayuda-tracker'),
    btnIngresar: $('#btn-ingresar'),
    btnRefrescar:$('#btn-refrescar'),
    msgIngreso:  $('#msg-ingreso'),

    lista:       $('#lista-adentro'),
    panelVacio:  $('#panel-vacio'),
    buscador:    $('#buscador'),
    avisos:      $('#avisos'),
  };

  /* ─────────────────────────────────────────────────────────────────────
     UTILIDADES
     ───────────────────────────────────────────────────────────────────── */

  function escapar(t) {
    return String(t ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function duracionLegible(desdeISO) {
    if (!desdeISO) return '—';
    const min = Math.max(0, Math.floor((Date.now() - new Date(desdeISO)) / 60000));
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
  }

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
    }, 5000);
  }

  function mensajeIngreso(texto, ok) {
    el.msgIngreso.textContent = texto;
    el.msgIngreso.className = 'mensaje ' + (ok ? 'mensaje--ok' : 'mensaje--mal');
    el.msgIngreso.hidden = false;
    if (ok) setTimeout(() => { el.msgIngreso.hidden = true; }, 6000);
  }

  function marcarConexion(tipo, texto) {
    el.senal.dataset.estado = tipo;
    el.conexion.textContent = texto;
  }

  /* ─────────────────────────────────────────────────────────────────────
     DIBUJAR
     ───────────────────────────────────────────────────────────────────── */

  function dibujarTrackers() {
    const previo = el.tracker.value;

    el.tracker.innerHTML =
      '<option value="">— Sin tracker —</option>' +
      estado.disponibles.map((t) => {
        const nombre = t.etiqueta || `Tracker ${t.id}`;
        const bat = (t.bateria === null || t.bateria === undefined) ? '' : ` · ${t.bateria}%`;
        return `<option value="${t.id}">${escapar(nombre)}${escapar(bat)}</option>`;
      }).join('');

    // Si el que estaba elegido sigue disponible, lo dejamos elegido.
    if (previo && estado.disponibles.some((t) => String(t.id) === previo)) {
      el.tracker.value = previo;
    }

    el.mLibres.textContent = estado.disponibles.length;

    el.ayudaTracker.textContent = estado.disponibles.length
      ? 'Elegí uno con buena batería.'
      : 'No hay trackers libres. Cargá alguno en la tabla "trackers" o esperá a que salga una visita.';
  }

  function filaHTML(v) {
    const tracker = v.tracker
      ? (v.tracker.etiqueta || `Tracker ${v.tracker_id}`)
      : (v.tracker_id ? `Tracker ${v.tracker_id}` : 'sin tracker');
    const bateria = v.tracker && v.tracker.bateria != null ? ` · ${v.tracker.bateria}%` : '';

    return (
      `<li class="fila" data-id="${v.id}" data-tracker="${v.tracker_id || ''}">` +
        `<div class="fila__datos">` +
          `<div class="fila__placa">${escapar(v.placa || 'SIN PLACA')}</div>` +
          `<div class="fila__detalle">${escapar(v.visitante || 'Visitante no registrado')}</div>` +
          `<div class="fila__meta">` +
            `<span class="fila__casa">→ ${escapar(v.casa_destino || 'sin destino')}</span>` +
            `<span>${duracionLegible(v.hora_ingreso)} adentro</span>` +
            `<span>📡 ${escapar(tracker)}${escapar(bateria)}</span>` +
          `</div>` +
        `</div>` +
        `<button class="boton-salida" data-confirmar="no">Salida</button>` +
      `</li>`
    );
  }

  function dibujarLista() {
    const f = estado.filtro.trim().toLowerCase();
    const lista = f
      ? estado.adentro.filter((v) =>
          `${v.placa} ${v.visitante} ${v.casa_destino}`.toLowerCase().includes(f))
      : estado.adentro;

    el.lista.innerHTML = lista.map(filaHTML).join('');
    el.panelVacio.classList.toggle('visible', lista.length === 0);
    el.mAdentro.textContent = estado.adentro.length;
  }

  function dibujar() { dibujarTrackers(); dibujarLista(); }

  /* ─────────────────────────────────────────────────────────────────────
     CARGAR DATOS
     ───────────────────────────────────────────────────────────────────── */

  async function refrescar(silencioso = false) {
    if (estado.enDemo) { dibujar(); return; }
    try {
      const [adentro, libres] = await Promise.all([
        Datos.cargarVisitasAdentro(),
        Datos.cargarTrackersDisponibles(),
      ]);
      estado.adentro = adentro;
      estado.disponibles = libres;
      dibujar();
      marcarConexion('vivo', `Conectado · ${CONFIG.ambiente}`);
    } catch (e) {
      marcarConexion('caido', 'Error de conexión');
      if (!silencioso) avisar('No se pudo actualizar', e.message, 'error');
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     REGISTRAR INGRESO
     ───────────────────────────────────────────────────────────────────── */

  el.placa.addEventListener('input', () => {
    el.placa.value = el.placa.value.toUpperCase();
  });

  el.formIngreso.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const placa = el.placa.value.trim();
    if (!placa) { mensajeIngreso('Falta la placa del vehículo.', false); el.placa.focus(); return; }

    const datos = {
      placa,
      visitante: el.visitante.value.trim(),
      casaDestino: el.casa.value.trim(),
      trackerId: el.tracker.value ? Number(el.tracker.value) : null,
    };

    el.btnIngresar.disabled = true;
    el.btnIngresar.querySelector('.boton__texto').textContent = 'Guardando…';

    try {
      if (estado.enDemo) {
        registrarIngresoDemo(datos);
      } else {
        await Datos.registrarIngreso(datos);
        await refrescar(true);
      }

      // Avisamos si quedó sin tracker: si no, después nadie entiende por qué
      // ese carro no sale en el mapa.
      if (datos.trackerId) {
        mensajeIngreso(`✓ ${placa} registrado. Ya aparece en el mapa.`, true);
      } else {
        mensajeIngreso(
          `✓ ${placa} registrado, pero SIN tracker: no se va a ver en el mapa.`, true);
      }
      el.formIngreso.reset();
      el.placa.focus();     // listo para el siguiente carro
      dibujar();
    } catch (e) {
      mensajeIngreso(e.message, false);
      // Si el tracker se ocupó mientras tanto, refrescamos la lista.
      if (/tracker/i.test(e.message)) refrescar(true);
    } finally {
      el.btnIngresar.disabled = false;
      el.btnIngresar.querySelector('.boton__texto').textContent = 'Registrar ingreso';
    }
  });

  el.btnRefrescar.addEventListener('click', async () => {
    el.btnRefrescar.classList.add('girando');
    await refrescar();
    setTimeout(() => el.btnRefrescar.classList.remove('girando'), 400);
  });

  /* ─────────────────────────────────────────────────────────────────────
     REGISTRAR SALIDA  (dos pasos, para no marcarla sin querer)
     ───────────────────────────────────────────────────────────────────── */

  let temporizadorConfirmacion = null;

  el.lista.addEventListener('click', async (ev) => {
    const boton = ev.target.closest('.boton-salida');
    if (!boton) return;

    const fila = boton.closest('.fila');
    const visitaId = Number(fila.dataset.id);
    const trackerId = fila.dataset.tracker ? Number(fila.dataset.tracker) : null;

    // Primer clic: pedimos confirmación.
    if (boton.dataset.confirmar === 'no') {
      // Cancelamos cualquier otra confirmación pendiente.
      el.lista.querySelectorAll('.boton-salida[data-confirmar="si"]').forEach((b) => {
        b.dataset.confirmar = 'no';
        b.textContent = 'Salida';
      });
      boton.dataset.confirmar = 'si';
      boton.textContent = '¿Confirmar?';
      clearTimeout(temporizadorConfirmacion);
      temporizadorConfirmacion = setTimeout(() => {
        boton.dataset.confirmar = 'no';
        boton.textContent = 'Salida';
      }, 4000);
      return;
    }

    // Segundo clic: la marcamos.
    clearTimeout(temporizadorConfirmacion);
    boton.disabled = true;
    boton.textContent = 'Saliendo…';

    const visita = estado.adentro.find((v) => v.id === visitaId);
    const placa = visita ? visita.placa : '';

    try {
      if (estado.enDemo) {
        estado.adentro = estado.adentro.filter((v) => v.id !== visitaId);
        if (visita && visita.tracker) estado.disponibles.push(visita.tracker);
      } else {
        await Datos.registrarSalida(visitaId, trackerId);
        await refrescar(true);
      }
      avisar('Salida registrada', `${placa} — no olvidés retirar el tracker del carro.`);
      dibujar();
    } catch (e) {
      avisar('No se pudo registrar la salida', e.message, 'error');
      boton.disabled = false;
      boton.dataset.confirmar = 'no';
      boton.textContent = 'Salida';
    }
  });

  el.buscador.addEventListener('input', (ev) => {
    estado.filtro = ev.target.value;
    dibujarLista();
  });

  /* ─────────────────────────────────────────────────────────────────────
     MODO DEMOSTRACIÓN  (no guarda nada; es solo para ver la pantalla)
     ───────────────────────────────────────────────────────────────────── */

  function registrarIngresoDemo(datos) {
    const tracker = estado.disponibles.find((t) => t.id === datos.trackerId) || null;
    estado.adentro.unshift({
      id: estado.proximoIdDemo++,
      placa: datos.placa,
      visitante: datos.visitante,
      casa_destino: datos.casaDestino,
      tracker_id: datos.trackerId,
      hora_ingreso: new Date().toISOString(),
      tracker,
    });
    if (tracker) {
      estado.disponibles = estado.disponibles.filter((t) => t.id !== tracker.id);
    }
  }

  function arrancarDemo(motivo) {
    estado.enDemo = true;
    el.btnSalir.hidden = true;
    marcarConexion('demo', motivo);

    estado.disponibles = [
      { id: 1, etiqueta: 'Tracker A', bateria: 96 },
      { id: 2, etiqueta: 'Tracker B', bateria: 81 },
      { id: 3, etiqueta: 'Tracker C', bateria: 67 },
      { id: 4, etiqueta: 'Tracker D', bateria: 34 },
    ];
    estado.adentro = [{
      id: 1000,
      placa: 'P482BKD',
      visitante: 'Ana Lucía Morales',
      casa_destino: 'Casa 14',
      tracker_id: 9,
      hora_ingreso: new Date(Date.now() - 26 * 60000).toISOString(),
      tracker: { id: 9, etiqueta: 'Tracker E', bateria: 88 },
    }];
    estado.proximoIdDemo = 1001;

    dibujar();
    avisar('Modo demostración', 'Podés registrar ingresos y salidas, pero no se guardan.');
  }

  /* ─────────────────────────────────────────────────────────────────────
     SESIÓN
     ───────────────────────────────────────────────────────────────────── */

  function mostrarLogin() { el.login.style.display = ''; el.app.hidden = true; }
  function mostrarApp()   { el.login.style.display = 'none'; el.app.hidden = false; }

  el.formLogin.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    el.loginError.hidden = true;
    el.btnEntrar.disabled = true;
    el.btnEntrar.querySelector('.boton__texto').textContent = 'Entrando…';

    try {
      await Datos.iniciarSesion(el.correo.value.trim(), el.clave.value);
      el.clave.value = '';
      mostrarApp();
      await refrescar();
      el.placa.focus();
    } catch (e) {
      el.loginError.textContent = e.message;
      el.loginError.hidden = false;
    } finally {
      el.btnEntrar.disabled = false;
      el.btnEntrar.querySelector('.boton__texto').textContent = 'Entrar';
    }
  });

  el.btnSalir.addEventListener('click', async () => {
    await Datos.cerrarSesion();
    estado.adentro = [];
    estado.disponibles = [];
    dibujar();
    mostrarLogin();
  });

  /* ─────────────────────────────────────────────────────────────────────
     RELOJ Y REFRESCO
     ───────────────────────────────────────────────────────────────────── */

  setInterval(() => {
    const ahora = new Date();
    el.reloj.textContent = ahora.toLocaleTimeString('es-GT', { hour12: false });
    el.reloj.dateTime = ahora.toISOString();
  }, 1000);

  // Refresco periódico: si otro guardia registra algo desde otra computadora,
  // acá se ve solo. También mantiene al día el "tiempo adentro".
  setInterval(() => {
    if (!el.app.hidden && !estado.enDemo) refrescar(true);
    else if (estado.enDemo) dibujarLista();
  }, 25000);

  /* ─────────────────────────────────────────────────────────────────────
     ARRANQUE
     ───────────────────────────────────────────────────────────────────── */

  async function arrancar() {
    const hayCredenciales = CONFIG.supabaseListo && Datos.iniciar();

    if (CONFIG.modoDemo === 'siempre' || !hayCredenciales) {
      if (CONFIG.modoDemo === 'nunca') {
        el.loginError.textContent = 'Falta configurar Supabase en el archivo js/config.js.';
        el.loginError.hidden = false;
        mostrarLogin();
        return;
      }
      mostrarApp();
      arrancarDemo(hayCredenciales ? 'Demostración forzada' : 'Supabase sin configurar');
      el.placa.focus();
      return;
    }

    const sesion = await Datos.sesionActual();
    if (sesion) {
      mostrarApp();
      await refrescar();
      el.placa.focus();
    } else {
      mostrarLogin();
      el.correo.focus();
    }

    Datos.alCambiarSesion((evento) => {
      if (evento === 'SIGNED_OUT') mostrarLogin();
    });
  }

  arrancar();
})();
