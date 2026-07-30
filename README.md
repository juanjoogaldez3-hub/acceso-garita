# Acceso Garita — rastreo de visitas de una colonia

Sistema para ver en un mapa, en tiempo real, dónde están los vehículos de las
visitas que ingresan a la colonia. En la garita se le coloca (discreto) un
tracker GPS magnético a cada carro visitante y se recupera al salir. Guardias y
junta ven un dashboard con el puntito de cada visita.

## Piezas del sistema

```
   Tracker LL301  ──TCP──►  RECEPTOR (Node)  ──►  Supabase  ──►  Dashboard (mapa)
   (en el carro)            (este repo)           (base)         (GitHub Pages)
```

1. **Tracker Jimi IoT LL301** — habla protocolo **Concox/GT06**, se conecta por
   TCP y manda su posición.
2. **Receptor** — 👉 lo que está construido en la carpeta [`receptor/`](receptor/).
   Escucha a los trackers, entiende el protocolo y guarda posiciones en Supabase.
3. **Supabase** — base de datos (tablas `trackers`, `visitas`, `posiciones`, y
   opcional `eventos`). Dos ambientes en paralelo: **producción** y **pruebas**.
4. **Dashboard** — 👉 en la carpeta [`dashboard/`](dashboard/). Mapa en tiempo
   real con login, para guardias y junta.

## ¿Por dónde empiezo?

- **Ver el sistema funcionando ya:** abrí `dashboard/index.html` en tu
  navegador. Sin configurar nada arranca en modo demostración, con visitas que
  se mueven por el mapa. Ideal para mostrárselo a la junta.
- **Levantar el receptor:** [`receptor/README.md`](receptor/README.md), 3 pasos,
  se prueba sin necesidad del aparato.

- **Configurar el dashboard con datos reales:**
  [`dashboard/README.md`](dashboard/README.md)
- **Versión `.exe` para Windows** (doble clic, sin instalar nada):
  [`docs/EJECUTABLE.md`](docs/EJECUTABLE.md)
- Cómo alojar el receptor (¡Render Web Service no sirve para esto!):
  [`docs/HOSTING.md`](docs/HOSTING.md)

### Scripts SQL (correr **siempre en los dos ambientes**)

Correlos **en este orden**:

| # | Archivo | Para qué |
|---|---|---|
| 1 | [`sql/dashboard-seguridad.sql`](sql/dashboard-seguridad.sql) | Protege los datos (login obligatorio), índices y tiempo real |
| 2 | [`sql/garita-permisos.sql`](sql/garita-permisos.sql) | Permite registrar ingresos y salidas; evita que un tracker quede en dos carros |
| 3 | [`sql/eventos.sql`](sql/eventos.sql) | Tabla opcional para alarmas de remoción del imán |

## Estado actual

- [x] Receptor TCP que acepta conexiones e imprime los bytes crudos en hex.
- [x] Parser Concox/GT06 escrito a mano (login, heartbeat, GPS, hora, alarmas).
- [x] Respuestas (ACK) con CRC correcto — validado contra el ejemplo oficial.
- [x] Inserción en Supabase (posiciones) + actualización del tracker.
- [x] Selección de ambiente (producción / pruebas) por variable de entorno.
- [x] Auto-test y simulador de tracker para probar sin hardware.
- [x] Versión `.exe` de Windows (un archivo, sin instalar Node).
- [x] Dashboard con mapa, login, tiempo real, alertas y modo demostración.
- [x] Pantalla de la garita para registrar ingresos y salidas.
- [ ] Afinar con el **aparato real**: código de alarma del imán, paquetes
      WiFi/LBS, y el mapa de batería (por eso el receptor imprime todo en hex).
- [ ] Elegir hosting del receptor y dejarlo corriendo 24/7.
- [ ] Cargar los trackers reales (su IMEI) en la tabla `trackers`.

## Cómo se usa, de punta a punta

1. **Llega una visita** → el guardia abre `garita.html`, anota placa, visitante
   y casa, elige un tracker de la lista y registra el ingreso.
2. **Le coloca el tracker** al carro (imán, discreto).
3. **El tracker reporta** su posición al receptor, que la guarda en Supabase.
4. **Guardias y junta ven el puntito** moverse en `index.html`.
5. **Sale la visita** → el guardia marca la salida y retira el tracker, que
   queda libre para el próximo carro.
