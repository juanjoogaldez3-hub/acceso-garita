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
4. **Dashboard** — mapa Leaflet que lee de Supabase (Realtime). *(Se conecta
   después; ya tenés la demo con datos simulados.)*

## ¿Por dónde empiezo?

Todo lo del receptor está listo y probado. Andá a
**[`receptor/README.md`](receptor/README.md)** para levantarlo en 3 pasos y
probarlo sin necesidad del aparato.

- Cómo alojarlo (¡Render Web Service no sirve para esto!):
  [`docs/HOSTING.md`](docs/HOSTING.md)
- Tabla opcional para alarmas (remoción del imán):
  [`sql/eventos.sql`](sql/eventos.sql) — correr en los **dos** ambientes.

## Estado actual

- [x] Receptor TCP que acepta conexiones e imprime los bytes crudos en hex.
- [x] Parser Concox/GT06 escrito a mano (login, heartbeat, GPS, hora, alarmas).
- [x] Respuestas (ACK) con CRC correcto — validado contra el ejemplo oficial.
- [x] Inserción en Supabase (posiciones) + actualización del tracker.
- [x] Selección de ambiente (producción / pruebas) por variable de entorno.
- [x] Auto-test y simulador de tracker para probar sin hardware.
- [ ] Afinar con el **aparato real**: código de alarma del imán, paquetes
      WiFi/LBS, y el mapa de batería (por eso el receptor imprime todo en hex).
- [ ] Conectar el dashboard a datos reales vía Supabase Realtime.
