# Dashboard de monitoreo

Mapa en tiempo real con la posición de los vehículos visitantes. Pensado como
una **consola de sala de control**: oscuro (los guardias trabajan de noche),
alto contraste y datos en letra monoespaciada para leer las placas de un
vistazo.

![Estructura](https://img.shields.io/badge/HTML%2FJS-vanilla-informational) ![Sin build](https://img.shields.io/badge/sin-compilaci%C3%B3n-success)

---

## Probalo ahora mismo (sin configurar nada)

**Doble clic en `index.html`** y listo. No hace falta instalar ni levantar nada
(probado: funciona abriéndolo directo desde el disco).

Sin credenciales arranca en **modo demostración**: inventa cuatro visitas que se
mueven por el mapa, y a los 20 segundos dispara una alarma de ejemplo. Sirve
para mostrarle el sistema a la junta directiva antes de tener trackers.

> Lo único que necesita internet son las imágenes del mapa (las calles) y las
> tipografías. Sin internet el dashboard igual abre y los puntos se mueven,
> solo que sobre un fondo vacío.

---

## Ponerlo con datos reales (4 pasos)

### 1. Correr los dos archivos SQL

Andá al **SQL Editor** de Supabase y corré, **en este orden** y **en los dos
ambientes** (producción y pruebas):

1. [`../sql/dashboard-seguridad.sql`](../sql/dashboard-seguridad.sql) — protege
   los datos (nadie lee sin iniciar sesión), crea índices y activa el tiempo real.
2. [`../sql/garita-permisos.sql`](../sql/garita-permisos.sql) — le da permiso a
   la garita para registrar ingresos y salidas, e impide que un mismo tracker
   quede puesto en dos carros a la vez.

### 2. Crear los usuarios de los guardias

En Supabase, con clics (no hay que programar):

1. **Authentication** → **Users** → **Add user** → **Create new user**
2. Poné el correo y la contraseña
3. ✅ Activá la casilla **"Auto Confirm User"** — si no, no van a poder entrar
4. Repetí para cada guardia y cada miembro de la junta

### 3. Configurar `js/config.js`

Es **el único archivo que tenés que editar**. Adentro está explicado renglón
por renglón. Necesitás:

| Qué | De dónde sale |
|---|---|
| `url` | Supabase → Settings → API → *Project URL* |
| `anonKey` | Supabase → Settings → API → llave **anon / public** |
| `centro` | Google Maps: clic derecho en la garita → copiar coordenadas |
| `ambiente` | `'produccion'` o `'pruebas'` |

> ⚠️ Acá va la llave **anon**, nunca la *service_role*. La service_role es
> solo para el receptor, que corre en el servidor.

### 4. Publicar en GitHub Pages

En tu repositorio de GitHub: **Settings** → **Pages** → en *Source* elegí la
rama, y en la carpeta elegí `/dashboard` (o subí el contenido a la raíz).

---

## Qué se ve en pantalla

| Zona | Qué muestra |
|---|---|
| **Barra de arriba** | Cuántas visitas hay adentro, cuántas sin señal, cuántas con alerta, y el reloj |
| **Puntito verde** (arriba a la izquierda) | Verde = conectado en vivo · Ámbar = demostración · Rojo = se perdió la conexión |
| **Mapa** | Un punto por visita, con su placa. Detrás, la línea del recorrido |
| **Panel derecho** | Placa, visitante, casa destino, tiempo adentro, velocidad y batería |

**Colores de los puntos:**
- 🟢 Verde — reportando normal
- 🟡 Ámbar — es el que tenés seleccionado
- ⚪ Gris — **sin señal** (no reporta hace más de 5 minutos)
- 🔴 Rojo — **alerta**, le quitaron el imán al tracker

**Cosas que podés hacer:** clic en una tarjeta o en un punto para seguirlo,
buscar por placa/nombre/casa, "Ver todas" para encuadrar el mapa, y
"Recorridos" para mostrar u ocultar las líneas.

---

---

## Las dos pantallas

| Archivo | Para quién | Para qué |
|---|---|---|
| `index.html` | Guardias y junta | **Mapa**: ver dónde está cada visita |
| `garita.html` | Guardia de la entrada | **Registro**: dar de alta el ingreso y marcar la salida |

Se pasa de una a otra con los botones **"Garita"** y **"Ver mapa"** de la barra
de arriba. Usan el mismo usuario y contraseña.

### Cómo se usa la pantalla de la garita

**Cuando entra un carro:**
1. Escribí la **placa** (se pone en mayúsculas sola)
2. Nombre del visitante y casa destino
3. Elegí **qué tracker** le vas a poner (la lista muestra la batería de cada uno)
4. **Registrar ingreso** → aparece en el mapa al toque

**Cuando sale:**
1. Buscalo en la lista de la derecha
2. Botón **"Salida"** → pide confirmar (para no marcarlo sin querer)
3. Retirá el tracker del carro: queda libre para la próxima visita

> Si registrás una visita **sin tracker**, la pantalla te avisa: esa visita no
> se va a ver en el mapa, porque no hay nada que reporte su posición.

> La base impide que un mismo tracker quede en dos carros a la vez. Si dos
> guardias eligen el mismo al mismo tiempo, el segundo recibe un aviso claro.

---

## Archivos

```
dashboard/
├── index.html          pantalla del mapa
├── garita.html         pantalla de registro de ingresos/salidas
├── css/estilos.css     todo el diseño (de las dos pantallas)
├── js/
│   ├── config.js       ← EL ÚNICO QUE EDITÁS
│   ├── demo.js         datos inventados para la demostración
│   ├── datos.js        sesión, consultas y escritura en Supabase
│   ├── mapa.js         los puntitos y recorridos sobre Leaflet
│   ├── app.js          arma la pantalla del mapa
│   └── garita.js       arma la pantalla de la garita
└── vendor/             Leaflet y Supabase guardados acá a propósito
```

**¿Por qué `vendor/`?** Las librerías van guardadas dentro del proyecto en vez
de bajarlas de internet cada vez. Así el dashboard funciona aunque el internet
de la garita esté lento o algún servicio externo se caiga. **Subila completa**
junto con el resto.

> Las tipografías sí vienen de internet (Google Fonts). Si no cargan, la página
> funciona igual, solo se ve con otra letra. Los mosaicos del mapa también
> necesitan internet — eso no se puede evitar, son las imágenes del mapa.

---

## Ajustes que quizá quieras cambiar

En `js/config.js`, al final:

```js
minutosSinSenal: 5,      // a los cuántos minutos se marca "sin señal"
puntosDeRecorrido: 40,   // largo de la colita que deja cada carro
velocidadMinima: 3,      // desde qué km/h se considera "en marcha"
```

---

## Solución de problemas

| Qué ves | Qué pasa |
|---|---|
| "Correo o contraseña incorrectos" | Revisá los datos, o creá el usuario en Supabase |
| "Ese usuario no está confirmado" | Al crearlo faltó marcar **Auto Confirm User** |
| Entra pero no hay visitas | Normal si no hay ninguna con `estado = 'adentro'` |
| Dice "Sin tiempo real" | Faltó correr el SQL, o el proyecto de Supabase está pausado |
| Todo gris / "sin señal" | El receptor no está corriendo o los trackers no reportan |
| Pantalla con "No cargó el mapa" | Faltó subir la carpeta `vendor/` |
