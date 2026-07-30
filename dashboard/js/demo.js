/* ============================================================================
   MODO DEMOSTRACIÓN
   ----------------------------------------------------------------------------
   Inventa visitas que se mueven por el mapa. Sirve para:
     · Ver cómo se ve el sistema antes de tener los trackers.
     · Mostrárselo a la junta directiva sin necesidad de hardware.

   Entrega los datos con LA MISMA FORMA que los datos reales de Supabase,
   así que el resto del programa ni se entera de la diferencia.
   ========================================================================== */

const Demo = (() => {

  const NOMBRES = [
    'Ana Lucía Morales', 'Carlos Estrada', 'María José Pineda',
    'Jorge Alvarado', 'Sofía Ramírez', 'Luis Fernando Cabrera',
    'Gabriela Herrera', 'Diego Solís',
  ];

  const CASAS = ['Casa 14', 'Casa 32', 'Casa 87', 'Casa 105', 'Casa 6', 'Casa 213'];

  /** Genera una placa con formato guatemalteco: P123ABC */
  function placaAlAzar(i) {
    const letras = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const l = () => letras[Math.floor(Math.random() * letras.length)];
    return `P${String(100 + Math.floor(Math.random() * 899))}${l()}${l()}${l()}`;
  }

  let visitas = [];
  let temporizador = null;
  let alEmitir = null;

  /** Crea una visita falsa que arranca cerca del centro de la colonia. */
  function crearVisita(id) {
    const centro = CONFIG.centro;
    const desvio = () => (Math.random() - 0.5) * 0.006;   // ~300 m
    const entroHace = Math.floor(Math.random() * 55) + 3;  // minutos

    return {
      visita_id: id,
      tracker_id: id,
      placa: placaAlAzar(id),
      visitante: NOMBRES[(id - 1) % NOMBRES.length],
      casa_destino: CASAS[(id - 1) % CASAS.length],
      hora_ingreso: new Date(Date.now() - entroHace * 60000).toISOString(),
      bateria: Math.floor(Math.random() * 45) + 55,
      lat: centro.lat + desvio(),
      lng: centro.lng + desvio(),
      velocidad: 0,
      hora_posicion: new Date().toISOString(),
      ultima_conexion: new Date().toISOString(),
      alerta: false,
      // estado interno del simulador (no forma parte de los datos reales)
      _rumbo: Math.random() * Math.PI * 2,
      _detenido: Math.random() < 0.3,
    };
  }

  /** Mueve una visita un pasito, como si el carro anduviera por la colonia. */
  function moverVisita(v) {
    // De vez en cuando el carro arranca o se detiene.
    if (Math.random() < 0.04) v._detenido = !v._detenido;

    if (v._detenido) {
      v.velocidad = 0;
    } else {
      // Giro suave, para que el recorrido se vea natural y no en zigzag.
      v._rumbo += (Math.random() - 0.5) * 0.7;
      v.velocidad = Math.floor(Math.random() * 22) + 8;

      const paso = v.velocidad * 0.0000045;
      v.lat += Math.cos(v._rumbo) * paso;
      v.lng += Math.sin(v._rumbo) * paso;

      // Si se aleja mucho de la colonia, lo hacemos volver.
      const dLat = v.lat - CONFIG.centro.lat;
      const dLng = v.lng - CONFIG.centro.lng;
      if (Math.hypot(dLat, dLng) > 0.009) {
        v._rumbo = Math.atan2(-dLng, -dLat);
      }
    }

    v.hora_posicion = new Date().toISOString();
    v.ultima_conexion = v.hora_posicion;

    // Cada tanto, la batería baja un puntito.
    if (Math.random() < 0.02 && v.bateria > 5) v.bateria--;

    return v;
  }

  return {
    /**
     * Arranca la simulación.
     * @param {function} callback  recibe la lista de visitas en cada actualización
     */
    iniciar(callback) {
      alEmitir = callback;
      visitas = [1, 2, 3, 4].map(crearVisita);

      // Primera entrega inmediata, para que el mapa no arranque vacío.
      alEmitir(visitas.map((v) => ({ ...v })));

      temporizador = setInterval(() => {
        visitas.forEach(moverVisita);
        alEmitir(visitas.map((v) => ({ ...v })));
      }, 2000);
    },

    detener() {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    },

    /**
     * Dispara una alarma de remoción del imán en una visita al azar.
     * Sirve para mostrar cómo se ve una alerta real.
     */
    simularAlarma() {
      if (!visitas.length) return null;
      const v = visitas[Math.floor(Math.random() * visitas.length)];
      v.alerta = true;
      return { placa: v.placa, detalle: 'remoción del imán (simulada)' };
    },
  };
})();
