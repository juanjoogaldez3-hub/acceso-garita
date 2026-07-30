/* ============================================================================
   MAPA — todo lo que dibuja sobre Leaflet
   ----------------------------------------------------------------------------
   Se encarga de los puntitos, los recorridos y el encuadre. No sabe nada de
   Supabase: solo recibe una lista de visitas y la dibuja.
   ========================================================================== */

const Mapa = (() => {

  let mapa = null;
  let capaMarcadores = null;
  let capaRecorridos = null;

  const marcadores = new Map();   // visita_id -> L.Marker
  const recorridos = new Map();   // visita_id -> L.Polyline

  let mostrarRecorridos = true;
  let alHacerClic = null;
  let yaEncuadro = false;

  /* ─────────────────────────────────────────────────────────────────── */

  function iniciar(idElemento) {
    mapa = L.map(idElemento, {
      center: [CONFIG.centro.lat, CONFIG.centro.lng],
      zoom: CONFIG.centro.zoom,
      zoomControl: true,
      attributionControl: true,
    });

    // Mapa oscuro, para que combine con la consola y no encandile de noche.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(mapa);

    capaRecorridos = L.layerGroup().addTo(mapa);
    capaMarcadores = L.layerGroup().addTo(mapa);

    // Marca de la garita (el punto de referencia de la colonia).
    L.circleMarker([CONFIG.centro.lat, CONFIG.centro.lng], {
      radius: 5,
      color: '#5aa9ff',
      weight: 2,
      fillColor: '#5aa9ff',
      fillOpacity: 0.35,
    }).addTo(mapa).bindTooltip('Garita', { direction: 'top', offset: [0, -6] });

    return mapa;
  }

  /* ─────────────────────────────────────────────────────────────────── */

  /** Decide de qué color va el puntito según el estado de la visita. */
  function claseDePin(visita, seleccionada) {
    const clases = ['pin'];
    if (visita.alerta)          clases.push('pin--alerta');
    else if (visita.sinSenal)   clases.push('pin--sinsenal');
    if (seleccionada)           clases.push('pin--activo');
    return clases.join(' ');
  }

  function crearIcono(visita, seleccionada) {
    return L.divIcon({
      className: '',      // vacío: el estilo lo pone nuestro HTML de adentro
      iconSize: [0, 0],
      html:
        `<div class="${claseDePin(visita, seleccionada)}">` +
          `<div class="pin__aro"></div>` +
          `<div class="pin__punto"></div>` +
          `<div class="pin__placa">${escapar(visita.placa || 's/placa')}</div>` +
        `</div>`,
    });
  }

  function escapar(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /**
   * Sincroniza el mapa con la lista de visitas: agrega las nuevas,
   * mueve las que cambiaron y borra las que ya salieron.
   */
  function actualizar(visitas, seleccionadaId) {
    if (!mapa) return;

    const vistas = new Set();

    visitas.forEach((v) => {
      if (v.lat === null || v.lng === null || isNaN(v.lat) || isNaN(v.lng)) return;
      vistas.add(v.visita_id);

      const posicion = [v.lat, v.lng];
      const seleccionada = v.visita_id === seleccionadaId;

      // --- Marcador ---
      let marcador = marcadores.get(v.visita_id);
      if (!marcador) {
        marcador = L.marker(posicion, {
          icon: crearIcono(v, seleccionada),
          keyboard: false,
          riseOnHover: true,
        });
        marcador.on('click', () => alHacerClic?.(v.visita_id));
        marcador.addTo(capaMarcadores);
        marcadores.set(v.visita_id, marcador);
      } else {
        marcador.setLatLng(posicion);
        marcador.setIcon(crearIcono(v, seleccionada));
      }

      // --- Recorrido ---
      if (mostrarRecorridos && v.recorrido && v.recorrido.length > 1) {
        let linea = recorridos.get(v.visita_id);
        if (!linea) {
          linea = L.polyline(v.recorrido, {
            color: v.alerta ? '#ff5252' : '#ffa629',
            weight: 2,
            opacity: 0.42,
            smoothFactor: 1.4,
          }).addTo(capaRecorridos);
          recorridos.set(v.visita_id, linea);
        } else {
          linea.setLatLngs(v.recorrido);
          linea.setStyle({
            color: v.alerta ? '#ff5252' : '#ffa629',
            opacity: seleccionada ? 0.85 : 0.42,
            weight: seleccionada ? 3 : 2,
          });
        }
      }
    });

    // --- Limpiar lo que ya no está (visitas que salieron) ---
    marcadores.forEach((m, id) => {
      if (!vistas.has(id)) { capaMarcadores.removeLayer(m); marcadores.delete(id); }
    });
    recorridos.forEach((l, id) => {
      if (!vistas.has(id) || !mostrarRecorridos) {
        capaRecorridos.removeLayer(l); recorridos.delete(id);
      }
    });

    // La primera vez que hay datos, encuadramos solos.
    if (!yaEncuadro && marcadores.size > 0) {
      yaEncuadro = true;
      verTodas();
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */

  /** Centra el mapa en una visita concreta. */
  function enfocar(visitaId) {
    const m = marcadores.get(visitaId);
    if (!m) return;
    mapa.flyTo(m.getLatLng(), Math.max(mapa.getZoom(), 17), { duration: 0.7 });
  }

  /** Acomoda el zoom para que se vean todas las visitas a la vez. */
  function verTodas() {
    if (!mapa) return;
    if (!marcadores.size) {
      mapa.flyTo([CONFIG.centro.lat, CONFIG.centro.lng], CONFIG.centro.zoom, { duration: 0.6 });
      return;
    }
    const limites = L.latLngBounds([...marcadores.values()].map((m) => m.getLatLng()));
    mapa.flyToBounds(limites, { padding: [70, 70], maxZoom: 18, duration: 0.7 });
  }

  function alternarRecorridos(mostrar) {
    mostrarRecorridos = mostrar;
    if (!mostrar) {
      recorridos.forEach((l) => capaRecorridos.removeLayer(l));
      recorridos.clear();
    }
  }

  function alClic(callback) { alHacerClic = callback; }

  /** Reajusta el mapa si cambió el tamaño de la ventana. */
  function reajustar() { if (mapa) mapa.invalidateSize(); }

  return { iniciar, actualizar, enfocar, verTodas, alternarRecorridos, alClic, reajustar };
})();
