# Publicar el dashboard en GitHub Pages

Para que guardias y junta entren desde cualquier navegador con un link, sin
descargar nada.

---

## Encenderlo (una sola vez, 3 clics)

1. Entrá a tu repositorio:
   <https://github.com/juanjoogaldez3-hub/acceso-garita>
2. **Settings** (arriba a la derecha) → en el menú de la izquierda, **Pages**
3. En **Source** elegí **"Deploy from a branch"**, y abajo:
   - **Branch:** `claude/tcp-tracker-receiver-uy8d3z`
   - **Carpeta:** `/ (root)`  ← dejala en la raíz, no en `/docs`
4. **Save**

Esperá 1 o 2 minutos (GitHub tarda un poquito la primera vez) y recargá esa
misma página: te va a mostrar el link en verde.

---

## Tus direcciones

| Para qué | Dirección |
|---|---|
| Entrada (lleva al mapa) | `https://juanjoogaldez3-hub.github.io/acceso-garita/` |
| Mapa de monitoreo | `https://juanjoogaldez3-hub.github.io/acceso-garita/dashboard/` |
| Pantalla de la garita | `https://juanjoogaldez3-hub.github.io/acceso-garita/dashboard/garita.html` |

Esos links son los que le pasás a los guardias y a la junta. Se pueden guardar
en el celular o en el escritorio de la compu de la garita.

---

## ⚠️ MUY IMPORTANTE: el orden importa

Tu repositorio es **público**, así que todo lo que subís se puede leer. Eso
está bien y es normal **siempre que hagas las cosas en este orden**:

1. **Primero** corré en Supabase (en los **dos** ambientes):
   - `sql/dashboard-seguridad.sql`
   - `sql/garita-permisos.sql`
2. **Recién después** pegá las credenciales reales en `dashboard/js/config.js`
   y subilas.

**¿Por qué?** La llave `anon` que va en `config.js` queda visible para
cualquiera — eso es inevitable en cualquier página estática y no es un
problema... **siempre que RLS esté activo**. RLS es lo que exige iniciar
sesión para poder leer datos. Si subís la llave *antes* de correr el SQL,
durante ese rato cualquiera podría leer el historial de las visitas.

> Mientras `config.js` tenga los valores de ejemplo, la página publicada
> funciona en **modo demostración** con datos inventados. Es completamente
> seguro dejarla así mientras terminás de configurar.

Lo que **nunca** va en el dashboard es la llave `service_role`: esa es solo
para el receptor, que corre en un servidor y no se publica.

---

## Cómo actualizar la página después

Cada vez que se suba un cambio a la rama, GitHub Pages se actualiza solo en
uno o dos minutos. No hay que hacer nada más.

Si no ves el cambio, es casi siempre el caché del navegador:
**Ctrl + Shift + R** (o **Cmd + Shift + R** en Mac) para forzar la recarga.

---

## Notas técnicas

- El archivo `.nojekyll` en la raíz desactiva Jekyll, el procesador que GitHub
  usa por defecto. No lo necesitamos (nuestro sitio es HTML puro) y sin él
  la publicación es más rápida y predecible.
- El `index.html` de la raíz solo redirige a `dashboard/`, para que la
  dirección corta funcione.
- Se publica desde la raíz y no desde `/docs` porque GitHub solo permite esas
  dos opciones, y nuestro dashboard vive en `dashboard/`.
