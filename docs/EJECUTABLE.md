# La versión `.exe` (programa para Windows, sin instalar nada)

Sí, se puede. Ya está hecho: **`receptor-trackers.exe`**, un solo archivo que
lleva Node adentro. **No hay que instalar Node ni saber usar la terminal**: se
hace doble clic y se abre una ventana negra mostrando lo que mandan los
trackers.

---

## ⚠️ LEÉ ESTO PRIMERO (es lo más importante)

El `.exe` resuelve **"cómo lo ejecuto fácil"**, pero **NO resuelve el problema
de fondo**, que es: *¿cómo hace el tracker, que anda por la calle con su chip
4G, para encontrar tu computadora?*

Cuando el tracker se conecta, necesita una **dirección pública fija** en
internet. Una PC normal (en tu casa o en la garita) **no la tiene**:

| Problema | Por qué te afecta |
|---|---|
| Tu PC está detrás del router (NAT) | El tracker no puede "entrar" desde afuera |
| Tu IP de internet cambia sola | Hoy configurás una dirección, mañana ya no sirve |
| Muchos planes en Guatemala usan CGNAT | Ni abriendo puertos en el router funciona |
| La PC tendría que estar encendida 24/7 | Si se apaga o se reinicia, perdés el rastreo |

**Conclusión:** el `.exe` es **excelente para PROBAR**, pero para que la colonia
lo use en serio, el receptor tiene que vivir en un **servidor con IP fija**
(el VPS de ~US$4/mes que te expliqué en [HOSTING.md](HOSTING.md)).

> **Regla simple:**
> `.exe` en tu PC → para probar y ver el hex del aparato. ✅
> VPS con IP fija → para el sistema real de la colonia. ✅

---

## Cómo usar el `.exe` (3 pasos)

1. Poné `receptor-trackers.exe` en una carpeta, por ejemplo `C:\receptor\`.
2. *(Opcional, solo si querés que guarde en Supabase)* poné el archivo `.env`
   **en esa misma carpeta**, al lado del `.exe`.
3. **Doble clic** en el `.exe`.

Se abre la ventana negra y vas a ver:

```
  RECEPTOR DE TRACKERS  (Concox / GT06 · Jimi IoT LL301)
  ✅ Escuchando en el puerto TCP 5000
     MODO DIAGNÓSTICO — solo hex + ACK (Supabase NO configurado)
```

**Dejá esa ventana abierta.** Ahí van a ir apareciendo los paquetes del tracker
en hex. Para cerrarlo: cerrá la ventana, o `Ctrl + C`.

### La primera vez Windows te va a advertir

Como el `.exe` no está "firmado digitalmente" (eso cuesta dinero), Windows
Defender muestra una pantalla azul que dice *"Windows protegió su PC"*.
Es normal. Hacé clic en **"Más información"** → **"Ejecutar de todas formas"**.

También te va a preguntar por el **Firewall de Windows**: tenés que darle
**"Permitir acceso"**, porque el programa necesita recibir conexiones.

---

## 🔌 Cómo probar el aparato real el día que llegue (sin comprar servidor)

Este es el truco que te va a servir. Se usa **ngrok**, que crea un "túnel":
te da una dirección pública de internet que apunta a tu PC, sin tocar el router.

1. Descargá ngrok de [ngrok.com/download](https://ngrok.com/download) (es gratis,
   pedís una cuenta y te dan un token).
2. Abrí el `receptor-trackers.exe` (queda escuchando en el puerto 5000).
3. En una ventana de comandos, corré:

   ```
   ngrok tcp 5000
   ```

4. ngrok te va a mostrar algo así:

   ```
   Forwarding   tcp://8.tcp.ngrok.io:14872 -> localhost:5000
   ```

5. Esa es tu dirección pública temporal: el **servidor** es `8.tcp.ngrok.io` y el
   **puerto** es `14872`. Al tracker le configurás **esos** datos.

Con eso, el LL301 se conecta a tu PC desde la calle y vas a ver los bytes en
hex al instante. 🎉

> Ojo: la dirección de ngrok **cambia cada vez** que lo abrís (en el plan
> gratis). Por eso sirve para probar, no para el uso diario de la colonia.

---

## Si el `.exe` no está en la carpeta `dist/`

El ejecutable **no se sube a GitHub** porque pesa 64 MB (los repos no deben
cargar archivos tan pesados). Para volver a generarlo, en una computadora con
Node instalado:

```bash
cd receptor
npm install
npm run build:exe
```

Queda en `receptor/dist/receptor-trackers.exe`.

¿Lo querés para **Mac** o **Linux** en vez de Windows? Cambiá el objetivo:

```bash
npx pkg . --targets node22-macos-x64  --output dist/receptor-trackers-mac
npx pkg . --targets node22-linux-x64  --output dist/receptor-trackers-linux
```

---

## ¿Y si quiero el `.exe` corriendo siempre en la garita?

Se puede, pero **solo tiene sentido si resolvés lo de la dirección pública**
(o sea, si el internet de la colonia te da una **IP fija** y podés abrir el
puerto en el router — preguntale eso a tu proveedor de internet).

Si te dan IP fija, entonces sí: dejás el `.exe` en una PC de la garita, le
configurás el puerto en el router, y funciona. Para que arranque solo al
prender la PC, se pone un acceso directo en la carpeta:

```
shell:startup
```

(pegá eso en el buscador de Windows y se abre la carpeta de inicio automático).

Aun así, mi recomendación sigue siendo el VPS: por US$4 al mes te evitás que el
sistema dependa de que una PC de la garita esté prendida y de que el internet
de la colonia no cambie.
