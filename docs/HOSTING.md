# ¿Dónde alojar el receptor? (explicado fácil)

## El problema en una frase

El tracker LL301 **no habla HTTP** (no es una página web). Abre una **conexión
TCP directa** a `TU_SERVIDOR:PUERTO` y manda bytes. Necesitás un servidor con
un **puerto TCP abierto al público**.

Por eso **Render "Web Service" NO sirve** para este receptor: Render Web Service
solo expone HTTP/HTTPS (puertos 80/443 para páginas web), no un puerto TCP
crudo para aparatos. Tu backend HTTP de Render puede seguir donde está; esto es
otra cosa.

> Regla simple: el **dashboard** (página web) va bien en GitHub Pages / Render.
> El **receptor** (que escucha aparatos) necesita otro tipo de hosting.

---

## Mi recomendación para vos: **un VPS chiquito** (la más simple y estable)

Un VPS es una "computadorcita en la nube" que está siempre prendida y tiene una
**IP fija pública**. Es lo que mejor le queda a un aparato GPS, porque al
tracker se le configura una IP + puerto y listo, no cambia.

Opciones baratas y confiables (elegí una):

| Proveedor            | Precio aprox. | Por qué                                  |
|----------------------|---------------|------------------------------------------|
| **Hetzner Cloud**    | ~US$4/mes     | Barato y muy estable. IP fija incluida.  |
| **DigitalOcean**     | ~US$4-6/mes   | Muy popular, mucha documentación.        |
| **Vultr / Linode**   | ~US$5/mes     | Similares, IP fija.                      |

Con cualquiera de esos tenés una IP fija (ej. `203.0.113.45`) y al tracker le
ponés `203.0.113.45:5000`.

### Alternativa sin servidor propio: **Railway** o **Fly.io**

- **Railway** y **Fly.io** SÍ permiten exponer un puerto TCP (a diferencia de
  Render Web Service). Son "más automáticos" que un VPS (no manejás Linux).
- Contra: la dirección puede ser un dominio (ej. `algo.up.railway.app`) o un
  puerto asignado, y a veces cambia. Para un tracker es preferible una **IP
  fija**, así que si podés, el VPS es más a prueba de sorpresas. Railway sirve
  muy bien para **empezar a probar rápido** sin comprar servidor.

**Resumen de mi consejo:** para probar ya mismo → Railway. Para dejarlo montado
en serio para la colonia → un VPS chiquito (Hetzner o DigitalOcean) con IP fija.

---

## Cómo dejarlo corriendo en un VPS (guía cortita)

Estos pasos los podemos hacer juntos cuando decidas el proveedor. Resumen:

1. Creás el VPS (Ubuntu). Te dan una **IP fija**.
2. Instalás Node y subís esta carpeta `receptor/`.
3. Abrís el puerto en el firewall (ej. 5000):
   ```
   sudo ufw allow 5000/tcp
   ```
4. Ponés tus credenciales en `.env`.
5. Lo dejás corriendo para siempre con **PM2** (reinicia solo si se cae):
   ```
   npm install -g pm2
   pm2 start index.js --name receptor
   pm2 save
   pm2 startup
   ```
6. En la configuración del tracker (por SMS o app de Jimi), apuntás el servidor
   a `TU_IP:5000`.

---

## Sobre configurar el LL301 para que apunte a tu servidor

El LL301 por defecto reporta a la nube de Jimi. Se le cambia el servidor con un
**comando SMS** al chip del tracker (o desde la app/plataforma de Jimi). El
comando típico de la familia Concox es del estilo:

```
SERVER,1,TU_IP_O_DOMINIO,5000,0#
```

⚠️ El formato exacto depende del firmware del LL301. Cuando tengas el aparato en
la mano, conseguimos el comando correcto del manual del modelo y lo probamos.
Como el receptor imprime TODO en hex, vamos a ver al instante si el aparato se
conectó, aunque el parser todavía necesite ajustes.
