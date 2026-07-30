# Receptor de trackers (Concox / GT06 · Jimi IoT LL301)

Servidor en Node que **escucha a los trackers GPS** por TCP, entiende el
protocolo Concox/GT06, **imprime en pantalla los bytes crudos** de cada paquete
(clave para afinar el aparato real) y guarda las posiciones en Supabase.

---

## Arranque rápido (3 pasos)

```bash
# 1) Instalar dependencias (una sola vez)
cd receptor
npm install

# 2) Probar que el parser está bien (no necesita ni aparato ni base)
node test-simulador.js

# 3) Levantar el receptor
npm start
```

Vas a ver algo así:

```
  RECEPTOR DE TRACKERS  (Concox / GT06 · Jimi IoT LL301)
  ✅ Escuchando en el puerto TCP 5000
     MODO DIAGNÓSTICO — solo hex + ACK (Supabase NO configurado)
```

### Probar la cadena completa sin el aparato

En **otra terminal**, con el receptor ya corriendo:

```bash
node test-simulador.js conectar
```

Simula un tracker: manda un login y una ubicación falsa de Guatemala. Deberías
ver en la terminal del receptor el hex, el IMEI, el ACK y la coordenada.

---

## Los dos modos

El receptor detecta solo en qué modo arranca:

- **MODO DIAGNÓSTICO** (sin credenciales de Supabase en `.env`):
  solo imprime el hex y responde el ACK de login/heartbeat. Es **justo lo que
  necesitás para la primera prueba** cuando llegue el LL301.

- **MODO COMPLETO** (con credenciales de Supabase):
  además de lo anterior, por cada ubicación busca el tracker por IMEI, la visita
  con `estado='adentro'`, e inserta en `posiciones`; y actualiza `bateria` y
  `ultima_conexion` del tracker.

---

## Configurar Supabase (para el modo completo)

1. Copiá `.env.example` a `.env`.
2. Pegá las credenciales (URL + **service_role key**) de cada ambiente.
3. Elegí el ambiente con `SUPABASE_ENV=produccion` o `SUPABASE_ENV=pruebas`.

> Nunca subas el archivo `.env` (ya está ignorado en `.gitignore`).

Si vas a registrar alarmas (remoción del imán), corré también
[`../sql/eventos.sql`](../sql/eventos.sql) **en los dos ambientes**.

---

## ¿Qué entiende hoy y qué falta afinar?

**Ya funciona y está probado con test automático:**
- Framing GT06 (tramas cortas `78 78` y largas `79 79`, incluso pegadas en TCP).
- CRC-ITU (validado contra el ejemplo oficial del manual).
- Login `0x01`: saca el IMEI y responde el ACK correcto.
- Heartbeat `0x13 / 0x23 / 0x36`: batería (estimada) y señal, con ACK.
- Ubicación GPS `0x12 / 0x22 / 0xA0`: fecha/hora, lat, lng, velocidad, satélites.
- Calibración de hora `0x8A`: responde la hora del servidor.
- Alarmas `0x16 / 0x26 / 0x27`: las detecta y (si existe la tabla) las guarda.

**A afinar con el aparato real (por eso el hex):**
- El **código exacto** de la alarma de remoción del imán del LL301.
- Los paquetes de **WiFi/LBS** (posición aproximada sin GPS): hoy se imprimen en
  hex y se responde un ACK genérico; el decodificado fino lo hacemos cuando
  veamos ejemplos reales.
- El **mapa batería** (nivel 0–6 → %). Cuando veamos qué reporta el LL301 lo
  ajustamos en `src/gt06.js` (función `voltageLevelToPercent`).

Cada vez que llegue un paquete que no entienda, lo vas a ver marcado como
`⚠ paquete DESCONOCIDO` con su hex, y ese hex es lo que necesito para ajustarlo.

---

## Estructura de archivos

```
receptor/
├── index.js              # arranca todo
├── test-simulador.js     # auto-test + simulador de tracker
├── .env.example          # plantilla de configuración (copiar a .env)
└── src/
    ├── config.js         # lee .env y elige ambiente (prod/pruebas)
    ├── crc.js            # cálculo del CRC del protocolo
    ├── gt06.js           # parser Concox/GT06 + armado de respuestas (ACK)
    ├── supabase.js       # lectura/escritura en la base
    └── server.js         # servidor TCP y orquestación
```

---

## Hosting

Ojo: este receptor necesita un **puerto TCP público**, y el "Web Service" de
Render **no sirve** para eso (es solo HTTP). Leé
[`../docs/HOSTING.md`](../docs/HOSTING.md) para la recomendación (VPS chiquito o
Railway/Fly.io) y el paso a paso.
