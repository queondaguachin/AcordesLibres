# AcordesLibres

Cancionero web de **letras y acordes** hecho con **HTML, CSS y JavaScript puro**. Sin frameworks, sin build y sin dependencias.

> Proyecto creado en `F:\Proyecto`.
> Incluye 12 canciones de **dominio público** como demostración. Con el servidor local puedes crear una cuenta y publicar tus propias transcripciones, que solo tú (o un administrador) podrás editar o borrar.

Dos modos de uso:

| Modo | Cómo se arranca | Cuentas y publicación |
| --- | --- | --- |
| Estático | Abrir `index.html` | No: catálogo y herramientas |
| Servidor local | `node server.js` | Sí: registro, publicar, editar y borrar |

---

## Puesta en marcha

### Opción 1 — Abrir directamente

Haz doble clic en `index.html`. Funciona el catálogo y las herramientas, pero **no las cuentas ni la publicación de canciones** (necesitan la API). El micrófono del afinador tampoco: los navegadores lo bloquean en `file://`.

### Opción 2 — Servidor local (recomendado)

Requiere Node.js (ya instalado en el equipo).

```powershell
cd F:\Proyecto
node server.js
```

Abre **http://localhost:8080**.

Así funcionan también el micrófono del afinador, las cuentas y la publicación de canciones. El **primer usuario que se registre será administrador**.

---

## Funciones incluidas

### Catálogo
- Inicio con populares, novedades, artistas destacados, géneros y estadísticas.
- Índice de artistas A–Z con filtro por letra.
- Página de artista con biografía, canciones y artistas relacionados.
- Explorador de canciones con búsqueda y filtros por **país**, **género** y orden.
- Buscador global en la cabecera (atajo: tecla `/`).

### Página de canción
- Cifrado en monoespaciado con acordes resaltados y secciones.
- **Transporte** ±11 semitonos.
- **Capo** del 0 al 9 (los acordes se ajustan automáticamente).
- Notación **americana** (C D E) o **latina** (Do Re Mi).
- Tamaño de letra ajustable.
- **Solo acordes** (oculta la letra).
- **Autoscroll** con velocidad regulable y botón flotante para detenerlo.
- Diagramas SVG de todos los acordes usados.
- Información: tono, compás, tempo, afinación, dificultad, licencia.
- Ritmo sugerido con patrón de rasgueo.
- Favoritos, imprimir, compartir, descargar `.txt` y modo **pantalla completa** para tocar.

### Herramientas
- **Diccionario de acordes**: 69 posiciones de guitarra, notas que forman cada acorde y diagramas generados en SVG.
- **Afinador**: tonos de referencia para las seis cuerdas y detección de nota por micrófono (con aguja de cents).
- **Ritmos**: 9 patrones de rasgueo explicados.
- **Favoritos** e historial de canciones vistas (guardados en el navegador).
- **Cuentas**: registro e inicio de sesión; cada usuario publica y gestiona sus propias transcripciones.
- Tema claro/oscuro y diseño responsive.

---

## Cuentas y permisos

Las cuentas solo funcionan con `node server.js`, porque necesitan la API.

1. Abre **Entrar → Crear una** y registra un usuario (3–24 caracteres, un correo válido y contraseña de **10 o más**).
2. El **primer usuario registrado es administrador**; los siguientes son usuarios normales.
3. Cada canción guarda quién la publicó:
   - el **propietario** puede editar y borrar su transcripción;
   - un **administrador** puede editar y borrar cualquiera;
   - el resto solo puede leerla.
4. Las canciones base de `js/data.js` son de solo lectura.
5. En **Mi cuenta → Seguridad** puedes cambiar la contraseña, cambiar el correo de recuperación y cerrar todas las sesiones.

### Recuperación de contraseña

El correo es obligatorio al registrarse y se guarda solo para la cuenta: no aparece en las páginas públicas ni en la API de canciones. En **Entrar → ¿Olvidaste tu contraseña?** se pide el correo y se envía un enlace de un solo uso.

- El enlace caduca a los **60 minutos** y solo sirve una vez.
- En el servidor solo se guarda el **SHA-256 del token**, nunca el enlace completo.
- Al usarlo se **cierran todas las sesiones** abiertas y se eliminan los enlaces pendientes.
- La respuesta es siempre la misma exista o no el correo (no se puede averiguar qué cuentas hay).
- Límite: 3 solicitudes por IP cada 15 minutos.

#### Configurar el envío de correo

Sin configuración, el transporte `console` escribe los correos en `data/outbox.log` (útil para probar en local). Para enviarlos de verdad elige un transporte:

| Transporte | Variables | Notas |
| --- | --- | --- |
| `resend` | `AL_MAIL_TRANSPORT=resend`, `AL_RESEND_KEY`, `AL_MAIL_FROM` | API HTTPS, plan gratuito. Verifica el dominio y configura SPF/DKIM |
| `brevo` | `AL_MAIL_TRANSPORT=brevo`, `AL_BREVO_KEY`, `AL_MAIL_FROM` | API HTTPS, plan gratuito |
| `smtp` | `AL_MAIL_TRANSPORT=smtp`, `AL_SMTP_HOST`, `AL_SMTP_PORT`, `AL_SMTP_USER`, `AL_SMTP_PASS`, `AL_SMTP_SECURE=1` | Requiere `npm install nodemailer` |

```powershell
$env:AL_PUBLIC_URL="https://tudominio.com"   # dominio real para los enlaces
$env:AL_MAIL_TRANSPORT="resend"
$env:AL_RESEND_KEY="re_..."
$env:AL_MAIL_FROM="no-reply@tudominio.com"
$env:AL_MAIL_NAME="AcordesLibres"            # opcional
```

> `AL_PUBLIC_URL` es imprescindible con un transporte real (`resend`, `brevo`, `smtp`): sin ella no se envían los enlaces, para evitar que una cabecera `Host` falsificada redirija el enlace a otro dominio. En modo `console` se usa la dirección local. Configura SPF y DKIM en tu proveedor para que los correos no acaben en spam.

### Seguridad implementada

| Medida | Detalle |
| --- | --- |
| Hash de contraseñas | `scrypt` N=2¹⁵, r=8, p=1 (~32 MB, ~100 ms) + sal de 16 bytes por usuario |
| Pimienta | `AL_PEPPER`: secreto del servidor mezclado con la contraseña; sin él, un robo de `data/` no permite usar los hashes |
| Política | Mínimo 10 caracteres; rechaza contraseñas comunes, secuencias y las que contienen el nombre de usuario |
| Sesiones | Token de 32 bytes; en memoria solo se guarda su SHA-256. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` bajo HTTPS, 7 días máximo y 24 h de inactividad |
| Cambio de contraseña | Exige la actual, cierra el resto de sesiones y conserva la actual |
| Recuperación | Token de 32 bytes, solo se guarda su SHA-256, caduca en 60 min, un solo uso y cierra todas las sesiones |
| Límites | 5 intentos por IP+usuario/10 min · 30 por IP/15 min · 5 registros por IP/hora · 3 recuperaciones por IP/15 min |
| Enumeración | Login y recuperación responden igual exista o no el usuario o el correo |
| CSRF | `SameSite=Lax` + comprobación de `Origin` + exigir `Content-Type: application/json` |
| Cabeceras | CSP estricta, HSTS bajo HTTPS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` |
| Archivos | `data/` y `server.js` no se sirven por HTTP; escritura atómica de los JSON |
| Permisos | Validados siempre en el servidor, no solo ocultando botones |

### Variables de entorno

```powershell
$env:PORT=8080                  # puerto (por defecto 8080)
$env:HOST="127.0.0.1"           # tras un proxy; no expongas el puerto directamente
$env:AL_REGISTRATION="closed"   # ciérralo DESPUÉS de crear tu cuenta de administrador
$env:AL_PEPPER="..."            # secreto largo; genera uno con el comando de abajo
$env:AL_TRUST_PROXY="1"         # confía en X-Forwarded-Proto / X-Forwarded-For
$env:AL_SECURE_COOKIE="1"       # fuerza cookies Secure
$env:AL_PUBLIC_URL="https://tudominio.com"  # dominio para los enlaces de correo
$env:AL_TLS_CERT="C:\ruta\fullchain.pem"   # HTTPS directo (opcional)
$env:AL_TLS_KEY="C:\ruta\privkey.pem"
node server.js
```

Genera la pimienta **una sola vez** y guárdala fuera del proyecto:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Si pierdes `AL_PEPPER`, las cuentas creadas con ella no podrán iniciar sesión. Guárdala en un gestor de contraseñas o en el entorno del servidor, nunca en `data/`.

Límites opcionales: `AL_LOGIN_USER_LIMIT` (5), `AL_LOGIN_IP_LIMIT` (30), `AL_REGISTER_IP_LIMIT` (5), `AL_FORGOT_LIMIT` (3), `AL_RESET_IP_LIMIT` (20), `AL_RESET_TTL_MINUTES` (60).

### Dónde se guardan los datos

```
data
├── users.json    Usuarios (hash y sal, nunca la contraseña; incluye el correo)
├── songs.json    Canciones publicadas desde la web
├── resets.json   Enlaces de recuperación pendientes (solo su hash)
└── outbox.log    Correos del transporte "console" (solo desarrollo)
```

El servidor **no** sirve `data/` ni `server.js` por HTTP. Las sesiones viven en memoria: al reiniciar el servidor hay que volver a iniciar sesión, pero las cuentas y las canciones se conservan.

Para empezar de cero, detén el servidor y borra la carpeta `data`; al arrancar se creará vacía y el siguiente registro será administrador.

---

## Cómo añadir tus transcripciones

### Desde la web (recomendado)

1. Inicia sesión con tu cuenta.
2. Entra en **Enviar una canción**.
3. Rellena título, artista, tono y pega la transcripción.
4. Pulsa **Publicar canción**.

Se guarda en el servidor (`data/songs.json`) y aparece al instante en el catálogo, el buscador y la página del artista. Después puedes editarla o borrarla desde **Mi cuenta** o desde la propia canción.

### En el catálogo base

Edita `js/data.js`:

1. Añade el artista a `ARTISTS` (si no existe):

```js
{
  slug: "mi-artista",
  name: "Mi Artista",
  country: "España",
  genre: "Rock",
  featured: false,
  bio: "Biografía breve."
}
```

2. Añade la canción al final de `SONGS`:

```js
{
  id: "mi-cancion",              // único, sin espacios ni acentos
  title: "Mi canción",
  artist: "mi-artista",          // slug del artista
  artistName: "Mi Artista",
  composer: "Autor",
  year: "2026",
  country: "España",
  genre: "Rock",
  key: "G",
  capo: 0,
  tuning: "E A D G B E",
  time: "4/4",
  bpm: 120,
  rhythm: "rock",                // id de RHYTHMS
  difficulty: "Fácil",
  license: "Transcripción propia",
  views: 0,
  added: "2026-10-19",
  content: `[Intro]
G   D   Em   C

[Verso 1]
G                 D
Aquí va la letra de la canción
Em                C
y aquí sigue el siguiente verso`
}
```

### Formato del cifrado

- **Los acordes van en la línea de arriba** y la letra debajo.
- Alinea con espacios: la web conserva el formato original.
- Las secciones se escriben entre corchetes: `[Intro]`, `[Verso 1]`, `[Estribillo]`.
- Acordes admitidos: `C`, `Am`, `F#m`, `Bb7`, `Cmaj7`, `Dsus4`, `C/G`, etc.
- Líneas que solo contienen acordes se detectan y transportan automáticamente.
- Las líneas con letra nunca se modifican.

El motor está en `js/chords.js`; el diccionario de posiciones es `CHORD_DB`.

---

## Estructura del proyecto

```
F:\Proyecto
├── index.html          Estructura y cabecera/pie
├── favicon.svg
├── server.js           Servidor estático + API, cuentas y recuperación
├── lib
│   └── mailer.js       Envío de correo (consola, Resend, Brevo o SMTP)
├── README.md
├── .gitignore          Excluye data/, secretos y certificados
├── deploy
│   ├── Caddyfile               Proxy HTTPS automático
│   ├── acordeslibres.service   Servicio systemd
│   └── acordeslibres.env.example
├── css
│   └── styles.css      Diseño, temas y responsive
├── js
│   ├── data.js         Artistas, canciones y ritmos base
│   ├── chords.js       Transporte, notación y diagramas SVG
│   ├── theme.js          Tema antes del primer render
│   └── app.js            Router, vistas e interacciones
└── data                  (se crea al arrancar el servidor)
    ├── users.json
    ├── songs.json
    ├── resets.json       Enlaces de recuperación (hash)
    └── outbox.log        Correos en modo consola (desarrollo)
```

---

## Almacenamiento local

| Clave              | Contenido                          |
| ------------------ | ---------------------------------- |
| `al_theme`         | Tema claro/oscuro                  |
| `al_prefs`         | Tamaño de letra, notación, etc.    |
| `al_favorites`     | Canciones favoritas                |
| `al_recent`        | Últimas canciones visitadas        |

Las transcripciones ya **no** se guardan aquí: van al servidor. `al_submissions` era la clave de la versión anterior y se ignora.

Además, con el servidor se usa la cookie de sesión `al_session` (`HttpOnly`, `SameSite=Lax`, `Secure` bajo HTTPS). No hay analítica ni cookies de terceros.

---

## Publicar en internet

### Sin cuentas (solo lectura)

Es una web estática: puedes subir la carpeta a Netlify, Vercel, Cloudflare Pages, GitHub Pages o cualquier hosting. No necesita build. El router por hash (`#/cancion/...`) funciona sin configuración extra. En este modo la web avisa de que las cuentas necesitan el servidor.

### Con cuentas y publicación

Necesitas un servidor que ejecute Node.js (VPS, Render, Railway, Fly.io…). El servidor escucha en `8080`; del HTTPS se encarga un proxy inverso o el propio Node.

#### Opción A — Caddy (recomendado)

Caddy obtiene y renueva el certificado automáticamente. `Caddyfile`:

```
tudominio.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
```

Arranca la web:

```powershell
$env:HOST="127.0.0.1"
$env:AL_TRUST_PROXY="1"
$env:AL_PEPPER="la-cadena-que-generaste"
$env:AL_REGISTRATION="closed"
node server.js
```

Con `AL_TRUST_PROXY=1`, Caddy envía `X-Forwarded-Proto: https`: la cookie se marca `Secure` y se añade HSTS automáticamente.

#### Archivos de ejemplo en `deploy/`

- `Caddyfile` — proxy inverso con HTTPS automático.
- `acordeslibres.service` — servicio systemd endurecido.
- `acordeslibres.env.example` — variables de entorno (cópialo a `/etc/acordeslibres.env` y aplica `chmod 600`).

Pasos típicos en un VPS Linux:

```bash
sudo useradd -r -s /usr/sbin/nologin acordes
sudo mkdir -p /opt/acordeslibres
sudo cp -r . /opt/acordeslibres
sudo chown -R acordes:acordes /opt/acordeslibres
sudo chmod 700 /opt/acordeslibres/data
sudo cp deploy/acordeslibres.env.example /etc/acordeslibres.env
sudo chmod 600 /etc/acordeslibres.env
sudo nano /etc/acordeslibres.env        # escribe tu AL_PEPPER
sudo cp deploy/acordeslibres.service /etc/systemd/system/
sudo systemctl enable --now acordeslibres
```

En Linux/macOS las variables se definen con `export VAR=valor`; en systemd, con `EnvironmentFile`.

#### Opción B — HTTPS directo con Node

```powershell
$env:AL_TLS_CERT="C:\certs\fullchain.pem"
$env:AL_TLS_KEY="C:\certs\privkey.pem"
$env:AL_PEPPER="..."
node server.js
```

#### Opción C — Cloudflare Tunnel (sin abrir puertos)

Útil si sirves desde casa: `cloudflared tunnel --url http://localhost:8080`. Usa `HOST=127.0.0.1` y `AL_TRUST_PROXY=1`.

#### Lista de comprobación antes de publicar

- [ ] `AL_PEPPER` definida y guardada aparte (si la pierdes, hay que resetear contraseñas).
- [ ] `AL_REGISTRATION=closed` si solo publicas tú.
- [ ] `AL_PUBLIC_URL` con tu dominio real y transporte de correo configurado (`resend`, `brevo` o `smtp`).
- [ ] Envía una recuperación de contraseña de prueba y comprueba que llega (revisa spam y SPF/DKIM).
- [ ] HTTPS funcionando (candado) y cabecera `Strict-Transport-Security` presente.
- [ ] `HOST=127.0.0.1` y el puerto 8080 cerrado en el firewall; públicos solo 443/80.
- [ ] Crea tu cuenta de administrador **antes** de cerrar el registro.
- [ ] Copias de seguridad de `data/` cifradas y fuera del servidor.
- [ ] Disco cifrado (BitLocker/LUKS) y permisos restringidos sobre `data/`.
- [ ] Entra desde el móvil y prueba a cambiar la contraseña.

Para que siga arrancado tras cerrar la sesión, usa un gestor de procesos: `pm2`, `systemd` o NSSM en Windows.

---

## Aviso sobre derechos de autor

- Las 12 canciones incluidas son de **dominio público** y sirven como demostración.
- **No** se ha copiado contenido, diseño ni base de datos de LaCuerda.net ni de ningún otro sitio.
- Si añades canciones, asegúrate de tener derechos para publicar la letra y los acordes, o de que la obra sea de dominio público.
- Para un sitio público con contenido de terceros necesitarás licencias o acuerdos con los titulares.

---

## Qué falta para una paridad total con un portal grande

Estas funciones aún requieren más trabajo de backend o contenido con licencia:

- Base de datos real (Postgres/MySQL) en lugar de archivos JSON.
- Verificación de correo al registrarse (la recuperación de contraseña ya está incluida).
- Perfiles públicos, favoritos sincronizados entre dispositivos.
- Comentarios, valoraciones y moderación.
- Panel de administración con listado global de usuarios y canciones.
- Varias instrumentaciones por canción (guitarra, piano, ukelele).
- Vídeos, tutoriales y cursos.
- SEO por canción con URLs limpias y renderizado en servidor.

La base actual está preparada para migrar a ese modelo sin reescribir la interfaz.
