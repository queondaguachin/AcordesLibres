/* ============================================================
   AcordesLibres — servidor local / producción
   ------------------------------------------------------------
   Sirve la web estática y expone una API con autenticación
   para que solo las cuentas con permiso puedan crear, editar
   o borrar canciones.

   Uso:
     node server.js
     → http://localhost:8080

   Variables de entorno:
     PORT=8080                 Puerto
     HOST=0.0.0.0              Interfaz (usa 127.0.0.1 tras un proxy)
     AL_REGISTRATION=closed    Cierra el registro de nuevas cuentas
     AL_PEPPER=...             Secreto del servidor para las contraseñas
     AL_TRUST_PROXY=1          Confía en X-Forwarded-Proto / X-Forwarded-For
     AL_TLS_CERT / AL_TLS_KEY  Sirve HTTPS directamente con estos archivos
     AL_SECURE_COOKIE=1        Fuerza cookies Secure
     AL_LOGIN_USER_LIMIT=5     Intentos por IP+usuario cada 10 min
     AL_LOGIN_IP_LIMIT=30      Intentos por IP cada 15 min
     AL_REGISTER_IP_LIMIT=5    Registros por IP cada hora

   Sin dependencias: solo módulos nativos de Node.
   Los datos se guardan en ./data (users.json y songs.json).
   El primer usuario registrado se convierte en administrador.
   ============================================================ */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sendMail, mailInfo } = require("./lib/mailer");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SONGS_FILE = path.join(DATA_DIR, "songs.json");
const RESETS_FILE = path.join(DATA_DIR, "resets.json");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const REGISTRATION_OPEN = process.env.AL_REGISTRATION !== "closed";
const SECURE_COOKIE = process.env.AL_SECURE_COOKIE === "1";
const TRUST_PROXY = process.env.AL_TRUST_PROXY === "1";
const TLS_CERT = process.env.AL_TLS_CERT || "";
const TLS_KEY = process.env.AL_TLS_KEY || "";
const PEPPER = process.env.AL_PEPPER || "";

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;      // duración máxima absoluta
const SESSION_IDLE = 24 * 60 * 60 * 1000;         // caducidad por inactividad
const MAX_SESSIONS_PER_USER = 10;
const MAX_BODY = 200 * 1024;                      // 200 KB
const MAX_CONTENT = 60000;                        // caracteres de transcripción

const LOGIN_USER_LIMIT = Number(process.env.AL_LOGIN_USER_LIMIT) || 5;
const LOGIN_IP_LIMIT = Number(process.env.AL_LOGIN_IP_LIMIT) || 30;
const REGISTER_IP_LIMIT = Number(process.env.AL_REGISTER_IP_LIMIT) || 5;
const FORGOT_LIMIT = Number(process.env.AL_FORGOT_LIMIT) || 3;
const RESET_IP_LIMIT = Number(process.env.AL_RESET_IP_LIMIT) || 20;
const RESET_TTL = (Number(process.env.AL_RESET_TTL_MINUTES) || 60) * 60 * 1000;
const PUBLIC_URL = String(process.env.AL_PUBLIC_URL || "").replace(/\/+$/, "");

/* Parámetros actuales de scrypt (N=2^15, ~32 MB, ~100 ms) */
const CURRENT_KDF = { algo: "scrypt", N: 1 << 15, r: 8, p: 1, keylen: 64, pepper: !!PEPPER };
/* Cuentas creadas con la versión anterior (sin parámetros guardados) */
const LEGACY_KDF = { algo: "scrypt", N: 1 << 14, r: 8, p: 1, keylen: 64, pepper: false };

const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "media-src 'self'"
].join("; ");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8"
};

/* ------------------------------------------------------------
   Almacenamiento
   ------------------------------------------------------------ */

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) writeJson(USERS_FILE, []);
  if (!fs.existsSync(SONGS_FILE)) writeJson(SONGS_FILE, []);
  if (!fs.existsSync(RESETS_FILE)) writeJson(RESETS_FILE, []);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

ensureData();

let users = readJson(USERS_FILE, []);
let songs = readJson(SONGS_FILE, []);
let resets = readJson(RESETS_FILE, []);
if (!Array.isArray(users)) users = [];
if (!Array.isArray(songs)) songs = [];
if (!Array.isArray(resets)) resets = [];

/* ------------------------------------------------------------
   Utilidades de red y seguridad
   ------------------------------------------------------------ */

function clientIp(request) {
  if (TRUST_PROXY) {
    const forwarded = request.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim() || "desconocida";
  }
  return (request.socket && request.socket.remoteAddress) || "desconocida";
}

function isSecure(request) {
  if (SECURE_COOKIE) return true;
  if (request.socket && request.socket.encrypted) return true;
  if (TRUST_PROXY) {
    const proto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
    if (proto === "https") return true;
  }
  return false;
}

function securityHeaders(request) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": CSP
  };
  if (isSecure(request)) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return headers;
}

function sendJson(request, response, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  response.writeHead(status, Object.assign(securityHeaders(request), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  }, extraHeaders || {}));
  response.end(body);
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("El contenido es demasiado grande"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(Object.assign(new Error("JSON no válido"), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function isJson(request) {
  const type = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  return type === "application/json";
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true; // clientes no navegador: la sesión sigue siendo obligatoria
  try {
    return new URL(origin).host === request.headers.host;
  } catch (error) {
    return false;
  }
}

/* ------------------------------------------------------------
   Limitadores de intentos
   ------------------------------------------------------------ */

const userFailures = new Map();   // IP + usuario
const ipFailures = new Map();     // IP
const registrationHits = new Map();
const forgotHits = new Map();
const resetHits = new Map();

function isLimited(map, key, limit) {
  const record = map.get(key);
  if (!record) return false;
  if (Date.now() > record.reset) {
    map.delete(key);
    return false;
  }
  return record.count >= limit;
}

function addHit(map, key, windowMs) {
  const now = Date.now();
  const record = map.get(key);
  if (!record || now > record.reset) {
    map.set(key, { count: 1, reset: now + windowMs });
  } else {
    record.count += 1;
  }
  if (map.size > 2000) {
    for (const [itemKey, item] of map) {
      if (now > item.reset) map.delete(itemKey);
    }
  }
}

function clearHits(map, key) {
  map.delete(key);
}

/* ------------------------------------------------------------
   Contraseñas
   ------------------------------------------------------------ */

function kdfOptions(kdf) {
  return { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * kdf.N * kdf.r };
}

function hashPassword(password, salt, kdf) {
  const input = kdf.pepper ? PEPPER + "\u0000" + password : password;
  return crypto.scryptSync(input, salt, kdf.keylen, kdfOptions(kdf)).toString("hex");
}

function verifyPassword(password, user) {
  const kdf = user.kdf || LEGACY_KDF;
  if (kdf.pepper && !PEPPER) return false;
  try {
    const candidate = Buffer.from(hashPassword(password, user.salt, kdf), "hex");
    const stored = Buffer.from(user.hash, "hex");
    if (candidate.length !== stored.length) return false;
    return crypto.timingSafeEqual(candidate, stored);
  } catch (error) {
    return false;
  }
}

function needsRehash(user) {
  const kdf = user.kdf;
  if (!kdf) return true;
  return kdf.N !== CURRENT_KDF.N ||
    kdf.r !== CURRENT_KDF.r ||
    kdf.p !== CURRENT_KDF.p ||
    kdf.keylen !== CURRENT_KDF.keylen ||
    !!kdf.pepper !== !!CURRENT_KDF.pepper;
}

function rehashUser(user, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  user.salt = salt;
  user.hash = hashPassword(password, salt, CURRENT_KDF);
  user.kdf = Object.assign({}, CURRENT_KDF);
}

const DUMMY_SALT = crypto.randomBytes(16).toString("hex");
function burnTime(password) {
  // Mismo coste que una verificación real para no revelar si el usuario existe
  try { hashPassword(password, DUMMY_SALT, CURRENT_KDF); } catch (error) { /* ignorar */ }
}

const COMMON_PASSWORDS = new Set([
  "1234567890", "12345678910", "password", "password1", "password123",
  "contraseña", "contrasena", "contraseña1", "qwertyuiop", "qwerty123",
  "iloveyou", "administrador", "administrator", "acordeslibres",
  "micontraseña", "holamundo", "bienvenido", "soyadmin", "admin1234"
]);

function passwordProblem(password, username) {
  if (typeof password !== "string") return "La contraseña no es válida";
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres";
  if (password.length > 200) return "La contraseña es demasiado larga";
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "Esa contraseña es demasiado común; elige otra";
  if (username && username.length >= 3 && lower.indexOf(username.toLowerCase()) !== -1) {
    return "La contraseña no puede contener tu nombre de usuario";
  }
  if (/^(.)\1+$/.test(password)) return "La contraseña no puede ser el mismo carácter repetido";
  if (/^(?:0123456789|1234567890|abcdefghij|qwertyuiop|asdfghjkl)/.test(lower)) {
    return "Evita secuencias obvias de teclado o números";
  }
  return null;
}

/* ------------------------------------------------------------
   Sesiones (en memoria)
   ------------------------------------------------------------ */

const sessions = new Map(); // sha256(token) -> { userId, created, lastSeen }

function tokenKey(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createSession(userId) {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastSeen > SESSION_IDLE || now - session.created > SESSION_TTL) {
      sessions.delete(key);
    }
  }

  const own = Array.from(sessions.entries())
    .filter(([, session]) => session.userId === userId)
    .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  while (own.length >= MAX_SESSIONS_PER_USER) {
    sessions.delete(own.shift()[0]);
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(tokenKey(token), { userId, created: now, lastSeen: now });
  return token;
}

function sessionToken(request) {
  const cookies = parseCookies(request.headers.cookie);
  return cookies.al_session || null;
}

function parseCookies(header) {
  const result = {};
  String(header || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) return;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) {
      try { result[name] = decodeURIComponent(value); } catch (error) { result[name] = value; }
    }
  });
  return result;
}

function sessionCookie(token, maxAgeSeconds, secure) {
  let cookie = "al_session=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + maxAgeSeconds;
  if (secure) cookie += "; Secure";
  return cookie;
}

function authFromRequest(request) {
  const token = sessionToken(request);
  if (!token) return null;
  const key = tokenKey(token);
  const session = sessions.get(key);
  if (!session) return null;

  const now = Date.now();
  if (now - session.lastSeen > SESSION_IDLE || now - session.created > SESSION_TTL) {
    sessions.delete(key);
    return null;
  }

  const user = users.find((item) => item.id === session.userId) || null;
  if (!user) {
    sessions.delete(key);
    return null;
  }

  session.lastSeen = now;
  return { user, key, token };
}

function revokeUserSessions(userId, keepKey) {
  for (const [key, session] of sessions) {
    if (session.userId === userId && key !== keepKey) sessions.delete(key);
  }
}

/* ------------------------------------------------------------
   Saneamiento y validación
   ------------------------------------------------------------ */

function text(value, max) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim().slice(0, max);
}

function slugify(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function validateSongInput(input) {
  const title = text(input.title, 120);
  const artistName = text(input.artist, 120);
  const content = text(input.content, MAX_CONTENT);

  if (!title) throw Object.assign(new Error("El título es obligatorio"), { status: 400 });
  if (!artistName) throw Object.assign(new Error("El artista es obligatorio"), { status: 400 });
  if (!content) throw Object.assign(new Error("La transcripción es obligatoria"), { status: 400 });

  const capo = Math.max(0, Math.min(9, Number(input.capo) || 0));
  const bpm = Math.max(30, Math.min(300, Number(input.bpm) || 100));

  return {
    title,
    artist: slugify(artistName) || "artista",
    artistName,
    composer: text(input.composer, 120),
    year: text(input.year, 20),
    country: text(input.country, 60),
    genre: text(input.genre, 60),
    key: text(input.key, 10) || "C",
    capo,
    tuning: text(input.tuning, 40) || "E A D G B E",
    time: text(input.time, 10) || "4/4",
    bpm,
    rhythm: text(input.rhythm, 40),
    difficulty: text(input.difficulty, 20) || "Fácil",
    license: text(input.license, 60) || "Transcripción propia",
    content
  };
}

function normalizeEmail(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length >= 5 && email.length <= 120 &&
    /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function publicBase(request) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = isSecure(request) ? "https" : "http";
  let host = String(request.headers.host || "localhost");
  if (TRUST_PROXY && request.headers["x-forwarded-host"]) {
    host = String(request.headers["x-forwarded-host"]).split(",")[0].trim();
  }
  return proto + "://" + host;
}

function writeResets() {
  writeJson(RESETS_FILE, resets);
}

function pruneResets() {
  const now = Date.now();
  const before = resets.length;
  resets = resets.filter((item) => item && item.expiresAt > now && item.tokenHash && item.userId);
  if (resets.length !== before) writeResets();
}

function removeResetsFor(userId) {
  const before = resets.length;
  resets = resets.filter((item) => item.userId !== userId);
  if (resets.length !== before) writeResets();
}

pruneResets();

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    email: user.email || null
  };
}

function canEditSong(user, song) {
  if (!user || !song) return false;
  return user.role === "admin" || song.ownerId === user.id;
}

/* ------------------------------------------------------------
   API
   ------------------------------------------------------------ */

async function handleApi(request, response, pathname) {
  const method = request.method;

  if (method !== "GET" && method !== "HEAD" && !sameOrigin(request)) {
    return sendJson(request, response, 403, { error: "Origen no permitido" });
  }

  // --- Sesión actual ---
  if (pathname === "/api/auth/me" && method === "GET") {
    const auth = authFromRequest(request);
    return sendJson(request, response, 200, { user: publicUser(auth ? auth.user : null) });
  }

  // --- Registro ---
  if (pathname === "/api/auth/register" && method === "POST") {
    if (!REGISTRATION_OPEN) {
      return sendJson(request, response, 403, { error: "El registro está cerrado" });
    }
    if (!isJson(request)) {
      return sendJson(request, response, 415, { error: "Se requiere Content-Type: application/json" });
    }
    const ipKey = "reg:" + clientIp(request);
    if (isLimited(registrationHits, ipKey, REGISTER_IP_LIMIT)) {
      return sendJson(request, response, 429, { error: "Demasiados registros desde esta conexión. Inténtalo más tarde." });
    }
    addHit(registrationHits, ipKey, 60 * 60 * 1000);

    const body = await readBody(request, MAX_BODY);
    const username = text(body.username, 24);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
      return sendJson(request, response, 400, { error: "El usuario debe tener entre 3 y 24 caracteres (letras, números, . _ -)" });
    }
    if (users.some((user) => user.usernameLower === username.toLowerCase())) {
      return sendJson(request, response, 409, { error: "Ese nombre de usuario ya existe" });
    }
    if (!isValidEmail(email)) {
      return sendJson(request, response, 400, { error: "Introduce un correo electrónico válido" });
    }
    if (users.some((user) => user.email === email)) {
      return sendJson(request, response, 409, { error: "Ese correo ya está registrado" });
    }
    const problem = passwordProblem(password, username);
    if (problem) {
      return sendJson(request, response, 400, { error: problem });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const user = {
      id: crypto.randomUUID(),
      username,
      usernameLower: username.toLowerCase(),
      email,
      salt,
      hash: hashPassword(password, salt, CURRENT_KDF),
      kdf: Object.assign({}, CURRENT_KDF),
      role: users.length === 0 ? "admin" : "user",
      createdAt: new Date().toISOString(),
      passwordChangedAt: new Date().toISOString()
    };
    users.push(user);
    writeJson(USERS_FILE, users);

    const token = createSession(user.id);
    return sendJson(request, response, 201, { user: publicUser(user) }, {
      "Set-Cookie": sessionCookie(token, SESSION_TTL / 1000, isSecure(request))
    });
  }

  // --- Inicio de sesión ---
  if (pathname === "/api/auth/login" && method === "POST") {
    if (!isJson(request)) {
      return sendJson(request, response, 415, { error: "Se requiere Content-Type: application/json" });
    }
    const body = await readBody(request, MAX_BODY);
    const username = text(body.username, 24);
    const password = String(body.password || "");

    const ip = clientIp(request);
    const ipKey = "login:" + ip;
    const userKey = ip + ":" + username.toLowerCase();

    if (isLimited(ipFailures, ipKey, LOGIN_IP_LIMIT) || isLimited(userFailures, userKey, LOGIN_USER_LIMIT)) {
      return sendJson(request, response, 429, { error: "Demasiados intentos. Espera unos minutos." });
    }

    const user = users.find((item) => item.usernameLower === username.toLowerCase());

    if (!user) {
      burnTime(password);
      addHit(userFailures, userKey, 10 * 60 * 1000);
      addHit(ipFailures, ipKey, 15 * 60 * 1000);
      return sendJson(request, response, 401, { error: "Usuario o contraseña incorrectos" });
    }

    if (!verifyPassword(password, user)) {
      addHit(userFailures, userKey, 10 * 60 * 1000);
      addHit(ipFailures, ipKey, 15 * 60 * 1000);
      return sendJson(request, response, 401, { error: "Usuario o contraseña incorrectos" });
    }

    clearHits(userFailures, userKey);

    // Migración transparente a parámetros más costosos o con pimienta
    if (needsRehash(user)) {
      rehashUser(user, password);
      writeJson(USERS_FILE, users);
    }

    const token = createSession(user.id);
    return sendJson(request, response, 200, { user: publicUser(user) }, {
      "Set-Cookie": sessionCookie(token, SESSION_TTL / 1000, isSecure(request))
    });
  }

  // --- Cerrar sesión ---
  if (pathname === "/api/auth/logout" && method === "POST") {
    const auth = authFromRequest(request);
    if (auth) sessions.delete(auth.key);
    return sendJson(request, response, 200, { ok: true }, {
      "Set-Cookie": sessionCookie("", 0, isSecure(request))
    });
  }

  // --- Cerrar todas las sesiones ---
  if (pathname === "/api/auth/logout-all" && method === "POST") {
    const auth = authFromRequest(request);
    if (!auth) return sendJson(request, response, 401, { error: "Necesitas iniciar sesión" });
    revokeUserSessions(auth.user.id, null);
    removeResetsFor(auth.user.id);
    return sendJson(request, response, 200, { ok: true }, {
      "Set-Cookie": sessionCookie("", 0, isSecure(request))
    });
  }

  // --- Cambiar contraseña ---
  if (pathname === "/api/auth/password" && method === "POST") {
    const auth = authFromRequest(request);
    if (!auth) return sendJson(request, response, 401, { error: "Necesitas iniciar sesión" });
    if (!isJson(request)) {
      return sendJson(request, response, 415, { error: "Se requiere Content-Type: application/json" });
    }

    const passwordKey = "pw:" + auth.user.id;
    if (isLimited(userFailures, passwordKey, LOGIN_USER_LIMIT)) {
      return sendJson(request, response, 429, { error: "Demasiados intentos. Espera unos minutos." });
    }

    const body = await readBody(request, MAX_BODY);
    const current = String(body.current || "");
    const next = String(body.next || "");

    if (!verifyPassword(current, auth.user)) {
      addHit(userFailures, passwordKey, 10 * 60 * 1000);
      return sendJson(request, response, 400, { error: "La contraseña actual no es correcta" });
    }
    if (current === next) {
      return sendJson(request, response, 400, { error: "La nueva contraseña debe ser distinta de la actual" });
    }
    const problem = passwordProblem(next, auth.user.username);
    if (problem) {
      return sendJson(request, response, 400, { error: problem });
    }

    clearHits(userFailures, passwordKey);
    rehashUser(auth.user, next);
    auth.user.passwordChangedAt = new Date().toISOString();
    writeJson(USERS_FILE, users);
    removeResetsFor(auth.user.id);

    // Se conserva la sesión actual y se cierran las demás
    revokeUserSessions(auth.user.id, auth.key);
    return sendJson(request, response, 200, { ok: true });
  }

  // --- Cambiar correo ---
  if (pathname === "/api/auth/email" && method === "POST") {
    const auth = authFromRequest(request);
    if (!auth) return sendJson(request, response, 401, { error: "Necesitas iniciar sesión" });
    if (!isJson(request)) {
      return sendJson(request, response, 415, { error: "Se requiere Content-Type: application/json" });
    }

    const emailKey = "email:" + auth.user.id;
    if (isLimited(userFailures, emailKey, LOGIN_USER_LIMIT)) {
      return sendJson(request, response, 429, { error: "Demasiados intentos. Espera unos minutos." });
    }

    const body = await readBody(request, MAX_BODY);
    const password = String(body.password || "");
    const email = normalizeEmail(body.email);

    if (!verifyPassword(password, auth.user)) {
      addHit(userFailures, emailKey, 10 * 60 * 1000);
      return sendJson(request, response, 400, { error: "La contraseña no es correcta" });
    }
    if (!isValidEmail(email)) {
      return sendJson(request, response, 400, { error: "Introduce un correo electrónico válido" });
    }
    if (users.some((user) => user.id !== auth.user.id && user.email === email)) {
      return sendJson(request, response, 409, { error: "Ese correo ya está registrado" });
    }

    clearHits(userFailures, emailKey);
    auth.user.email = email;
    writeJson(USERS_FILE, users);
    removeResetsFor(auth.user.id);
    return sendJson(request, response, 200, { user: publicUser(auth.user) });
  }

  // --- Solicitar recuperación de contraseña ---
  if (pathname === "/api/auth/forgot" && method === "POST") {
    if (!isJson(request)) {
      return sendJson(request, response, 415, { error: "Se requiere Content-Type: application/json" });
    }

    const ipKey = "forgot:" + clientIp(request);
    if (isLimited(forgotHits, ipKey, FORGOT_LIMIT)) {
      return sendJson(request, response, 429, { error: "Demasiadas solicitudes. Espera unos minutos." });
    }
    addHit(forgotHits, ipKey, 15 * 60 * 1000);

    const body = await readBody(request, MAX_BODY);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      return sendJson(request, response, 400, { error: "Introduce un correo electrónico válido" });
    }

    const generic = {
      ok: true,
      message: "Si ese correo está registrado, recibirás un enlace en unos minutos."
    };

    const user = users.find((item) => item.email === email);
    if (!user) return sendJson(request, response, 200, generic);

    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    resets = resets.filter((item) => item.userId !== user.id);
    resets.push({
      tokenHash: tokenKey(token),
      userId: user.id,
      createdAt: now,
      expiresAt: now + RESET_TTL
    });
    writeResets();

    let link = "";
    if (PUBLIC_URL) {
      link = PUBLIC_URL + "/#/restablecer?token=" + token;
    } else if (mailInfo().transport === "console") {
      link = publicBase(request) + "/#/restablecer?token=" + token;
    }
    if (!link) {
      console.error("No se envía el correo de recuperación: define AL_PUBLIC_URL con tu dominio público.");
      return sendJson(request, response, 200, generic);
    }
    const minutes = Math.max(1, Math.round(RESET_TTL / 60000));
    const text = [
      "Hola " + user.username + ",",
      "",
      "Has pedido restablecer tu contraseña en AcordesLibres.",
      "Abre este enlace para elegir una nueva (caduca en " + minutes + " minuto" + (minutes === 1 ? "" : "s") + " y solo sirve una vez):",
      "",
      link,
      "",
      "Si no has sido tú, ignora este mensaje: tu contraseña no cambiará."
    ].join("\n");
    const html = [
      "<p>Hola <strong>" + escapeHtml(user.username) + "</strong>,</p>",
      "<p>Has pedido restablecer tu contraseña en AcordesLibres.</p>",
      "<p><a href=\"" + escapeHtml(link) + "\">Elegir una nueva contraseña</a></p>",
      "<p>El enlace caduca en " + minutes + " minuto" + (minutes === 1 ? "" : "s") + " y solo sirve una vez.</p>",
      "<p>Si no has sido tú, ignora este mensaje: tu contraseña no cambiará.</p>"
    ].join("");

    sendMail({
      to: user.email,
      subject: "Restablecer tu contraseña — AcordesLibres",
      text,
      html
    }).catch((error) => {
      console.error("No se pudo enviar el correo de recuperación: " + error.message);
    });

    return sendJson(request, response, 200, generic);
  }

  // --- Restablecer contraseña con token ---
  if (pathname === "/api/auth/reset" && method === "POST") {
    if (!isJson(request)) {
      return sendJson(request, response, 415, { error: "Se requiere Content-Type: application/json" });
    }

    const ipKey = "reset:" + clientIp(request);
    if (isLimited(resetHits, ipKey, RESET_IP_LIMIT)) {
      return sendJson(request, response, 429, { error: "Demasiados intentos. Espera unos minutos." });
    }
    addHit(resetHits, ipKey, 15 * 60 * 1000);

    const body = await readBody(request, MAX_BODY);
    const token = String(body.token || "").trim();
    const password = String(body.password || "");

    const invalid = { error: "El enlace no es válido o ha caducado. Solicita uno nuevo." };
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return sendJson(request, response, 400, invalid);
    }

    const entry = resets.find((item) => item.tokenHash === tokenKey(token) && item.expiresAt > Date.now());
    if (!entry) return sendJson(request, response, 400, invalid);

    const user = users.find((item) => item.id === entry.userId);
    if (!user) {
      removeResetsFor(entry.userId);
      return sendJson(request, response, 400, invalid);
    }

    const problem = passwordProblem(password, user.username);
    if (problem) {
      return sendJson(request, response, 400, { error: problem });
    }
    if (verifyPassword(password, user)) {
      return sendJson(request, response, 400, { error: "La nueva contraseña debe ser distinta de la actual" });
    }

    rehashUser(user, password);
    user.passwordChangedAt = new Date().toISOString();
    writeJson(USERS_FILE, users);
    removeResetsFor(user.id);

    // Un enlace de recuperación cierra todas las sesiones abiertas
    revokeUserSessions(user.id, null);
    return sendJson(request, response, 200, { ok: true }, {
      "Set-Cookie": sessionCookie("", 0, isSecure(request))
    });
  }

  // --- Canciones ---
  if (pathname === "/api/songs" && method === "GET") {
    return sendJson(request, response, 200, { songs });
  }

  if (pathname === "/api/songs" && method === "POST") {
    const auth = authFromRequest(request);
    if (!auth) return sendJson(request, response, 401, { error: "Necesitas iniciar sesión" });
    if (!isJson(request)) {
      return sendJson(request, response, 415, { error: "Se requiere Content-Type: application/json" });
    }

    const body = await readBody(request, MAX_BODY);
    const data = validateSongInput(body);
    const user = auth.user;

    let id = slugify(data.title) || "cancion";
    if (songs.some((song) => song.id === id)) {
      id = id + "-" + crypto.randomBytes(3).toString("hex");
    }

    const now = new Date().toISOString();
    const song = Object.assign({}, data, {
      id,
      views: 0,
      added: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
      ownerId: user.id,
      ownerName: user.username,
      custom: true
    });

    songs.push(song);
    writeJson(SONGS_FILE, songs);
    return sendJson(request, response, 201, { song });
  }

  const songMatch = pathname.match(/^\/api\/songs\/([^/]+)$/);
  if (songMatch) {
    const id = decodeURIComponent(songMatch[1]);
    const index = songs.findIndex((song) => song.id === id);
    if (index === -1) return sendJson(request, response, 404, { error: "Canción no encontrada" });

    const auth = authFromRequest(request);
    if (!auth) return sendJson(request, response, 401, { error: "Necesitas iniciar sesión" });

    const song = songs[index];
    if (!canEditSong(auth.user, song)) {
      return sendJson(request, response, 403, { error: "No tienes permiso para modificar esta canción" });
    }

    if (method === "PUT") {
      if (!isJson(request)) {
        return sendJson(request, response, 415, { error: "Se requiere Content-Type: application/json" });
      }
      const body = await readBody(request, MAX_BODY);
      const data = validateSongInput(body);
      const updated = Object.assign({}, song, data, {
        id: song.id,
        ownerId: song.ownerId,
        ownerName: song.ownerName,
        views: song.views,
        added: song.added,
        createdAt: song.createdAt,
        updatedAt: new Date().toISOString(),
        custom: true
      });
      songs[index] = updated;
      writeJson(SONGS_FILE, songs);
      return sendJson(request, response, 200, { song: updated });
    }

    if (method === "DELETE") {
      songs.splice(index, 1);
      writeJson(SONGS_FILE, songs);
      return sendJson(request, response, 200, { ok: true });
    }

    return sendJson(request, response, 405, { error: "Método no permitido" });
  }

  return sendJson(request, response, 404, { error: "Ruta no encontrada" });
}

/* ------------------------------------------------------------
   Archivos estáticos
   ------------------------------------------------------------ */

function serveStatic(request, response, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relative);

  // Nunca servir datos privados ni el propio servidor
  const lower = relative.toLowerCase();
  const blocked = lower.startsWith("data/") ||
    lower === "data" ||
    lower === "server.js" ||
    lower.startsWith("deploy/") ||
    lower === "deploy" ||
    lower.startsWith(".") ||
    lower.includes("/.");

  if (blocked || !filePath.startsWith(ROOT)) {
    response.writeHead(404, Object.assign(securityHeaders(request), { "Content-Type": "text/plain; charset=utf-8" }));
    response.end("404 — No encontrado");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, Object.assign(securityHeaders(request), { "Content-Type": "text/plain; charset=utf-8" }));
      response.end("404 — No encontrado");
      return;
    }
    response.writeHead(200, Object.assign(securityHeaders(request), {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": data.length
    }));
    response.end(data);
  });
}

/* ------------------------------------------------------------
   Servidor
   ------------------------------------------------------------ */

function handleRequest(request, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch (error) {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (pathname.startsWith("/api/")) {
    handleApi(request, response, pathname).catch((error) => {
      const status = error && error.status ? error.status : 500;
      if (!response.headersSent) {
        sendJson(request, response, status, { error: error.message || "Error del servidor" });
      }
    });
    return;
  }

  serveStatic(request, response, pathname);
}

let server;
let protocol = "http";
if (TLS_CERT && TLS_KEY) {
  server = https.createServer({
    cert: fs.readFileSync(TLS_CERT),
    key: fs.readFileSync(TLS_KEY)
  }, handleRequest);
  protocol = "https";
} else {
  server = http.createServer(handleRequest);
}

server.listen(PORT, HOST, () => {
  const base = protocol + "://localhost:" + PORT;
  console.log("AcordesLibres en " + base);
  console.log("Usuarios registrados: " + users.length + " · Canciones guardadas: " + songs.length);
  if (users.length === 0) console.log("El primer usuario que se registre será administrador.");
  if (!REGISTRATION_OPEN) console.log("El registro está cerrado (AL_REGISTRATION=closed).");
  if (!PEPPER) {
    console.log("AVISO: AL_PEPPER no está definida. Define un secreto largo en producción.");
  }
  if (users.some((user) => (user.kdf || {}).pepper) && !PEPPER) {
    console.log("ERROR: hay cuentas protegidas con pimienta y AL_PEPPER no está definida: no podrán iniciar sesión.");
  }
  if (protocol === "http" && HOST !== "127.0.0.1" && HOST !== "localhost") {
    console.log("AVISO: sirviendo por HTTP. En producción usa HTTPS (proxy inverso o AL_TLS_CERT/AL_TLS_KEY).");
  }
  if (protocol === "https" || SECURE_COOKIE || TRUST_PROXY) {
    console.log("Cookies Secure: " + (protocol === "https" || SECURE_COOKIE || TRUST_PROXY ? "sí (según la petición)" : "no"));
  }

  const mail = mailInfo();
  console.log("Correo: transporte " + mail.transport + (mail.from ? " · remitente " + mail.from : ""));
  if (mail.transport === "console") {
    console.log("AVISO: los correos se escriben en data/outbox.log. Configura AL_MAIL_TRANSPORT (resend, brevo o smtp) para enviarlos de verdad.");
  } else if (!mail.from) {
    console.log("ERROR: falta AL_MAIL_FROM; no se podrán enviar correos.");
  }
  if (!PUBLIC_URL) {
    console.log("AVISO: define AL_PUBLIC_URL (https://tudominio.com) para que los enlaces de recuperación usen tu dominio.");
    if (mail.transport !== "console") console.log("ERROR: sin AL_PUBLIC_URL no se enviarán correos de recuperación con el transporte " + mail.transport + ".");
  }
});
