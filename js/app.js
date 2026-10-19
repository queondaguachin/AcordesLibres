/* ============================================================
   app.js — lógica de AcordesLibres
   ------------------------------------------------------------
   Router por hash, vistas, búsqueda, favoritos, transporte,
   autoscroll, afinador y envío de transcripciones.
   Sin dependencias externas.
   ============================================================ */

/* ------------------------------------------------------------
   1. Utilidades
   ------------------------------------------------------------ */

const $  = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    /* almacenamiento no disponible */
  }
}

function formatViews(number) {
  return new Intl.NumberFormat("es-ES").format(Number(number) || 0);
}

function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso + "T00:00:00");
  if (isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", { month: "short", year: "numeric" }).format(date);
}

function signed(value) {
  return value > 0 ? "+" + value : String(value);
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function avatarGradient(name) {
  const hue = hashString(name) % 360;
  return "linear-gradient(135deg, hsl(" + hue + " 58% 44%), hsl(" + ((hue + 42) % 360) + " 64% 36%))";
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

let toastTimer = null;
function toast(message) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2600);
}

/* ------------------------------------------------------------
   2. Estado y almacenamiento local
   ------------------------------------------------------------ */

const KEYS = {
  theme: "al_theme",
  prefs: "al_prefs",
  favorites: "al_favorites",
  recent: "al_recent",
  legacySubmissions: "al_submissions"
};

let favorites = loadJSON(KEYS.favorites, []);
let recent = loadJSON(KEYS.recent, []);

/* Sesión y datos del servidor */
let currentUser = null;
let serverSongs = [];
let apiAvailable = false;

const savedPrefs = loadJSON(KEYS.prefs, {});
let prefs = {
  fontSize: 20,
  notation: "anglo",
  chordsOnly: false,
  scrollSpeed: 40,
  ...savedPrefs
};

let songView = null;          // { song, transpose, capo }
let autoscrollActive = false;
let autoscrollAcc = 0;
let autoscrollLast = 0;
let autoscrollRAF = null;
let autoscrollTouchStart = null;

function savePrefs() { saveJSON(KEYS.prefs, prefs); }
function saveFavorites() { saveJSON(KEYS.favorites, favorites); }
function saveRecent() { saveJSON(KEYS.recent, recent); }

function isFavorite(id) { return favorites.indexOf(id) !== -1; }

function toggleFavorite(id) {
  const index = favorites.indexOf(id);
  if (index === -1) favorites.push(id);
  else favorites.splice(index, 1);
  saveFavorites();
  return isFavorite(id);
}

function rememberRecent(id) {
  recent = recent.filter((item) => item !== id);
  recent.unshift(id);
  recent = recent.slice(0, 8);
  saveRecent();
}

/* ------------------------------------------------------------
   3. Acceso a datos
   ------------------------------------------------------------ */

function allSongs() { return SONGS.concat(serverSongs); }

function getSong(id) { return allSongs().find((song) => song.id === id) || null; }

function songsByArtist(slug) { return allSongs().filter((song) => song.artist === slug); }

function getArtists() {
  const map = new Map();
  ARTISTS.forEach((artist) => map.set(artist.slug, artist));
  allSongs().forEach((song) => {
    if (!map.has(song.artist)) {
      map.set(song.artist, {
        slug: song.artist,
        name: song.artistName || song.artist,
        country: song.country || "",
        genre: song.genre || "",
        bio: "Artista creado a partir de las transcripciones publicadas.",
        custom: true
      });
    }
  });
  return Array.from(map.values());
}

function getArtist(slug) {
  return getArtists().find((artist) => artist.slug === slug) || null;
}

function artistCount(slug) { return songsByArtist(slug).length; }

function getRhythm(id) { return RHYTHMS.find((rhythm) => rhythm.id === id) || null; }

function allCountries() {
  return Array.from(new Set(allSongs().map((song) => song.country).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

function allGenres() {
  return Array.from(new Set(allSongs().map((song) => song.genre).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

function searchSongs(query, country, genre, sort) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);

  let result = allSongs().filter((song) => {
    if (country && song.country !== country) return false;
    if (genre && song.genre !== genre) return false;
    if (!words.length) return true;

    const artist = getArtist(song.artist);
    const haystack = normalizeText([
      song.title,
      song.artistName,
      artist ? artist.name : "",
      song.composer,
      song.genre,
      song.country
    ].join(" "));

    return words.every((word) => haystack.indexOf(word) !== -1);
  });

  return sortSongs(result, sort);
}

function sortSongs(list, sort) {
  const copy = list.slice();
  if (sort === "views") copy.sort((a, b) => (b.views || 0) - (a.views || 0));
  else if (sort === "newest") copy.sort((a, b) => String(b.added).localeCompare(String(a.added)));
  else if (sort === "title") copy.sort((a, b) => a.title.localeCompare(b.title, "es"));
  else if (sort === "artist") copy.sort((a, b) => String(a.artistName).localeCompare(String(b.artistName), "es"));
  return copy;
}

function sortArtists(list) {
  return list.slice().sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/* ------------------------------------------------------------
   3b. API, sesión y permisos
   ------------------------------------------------------------ */

async function api(path, options) {
  const opts = Object.assign({ credentials: "same-origin", headers: {} }, options || {});
  if (opts.body && !opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, opts);
  let data = null;
  try { data = await response.json(); } catch (error) { data = null; }
  if (!response.ok) {
    if (response.status === 401 && path.indexOf("/api/auth/") !== 0) {
      currentUser = null;
      renderAccountArea();
    }
    const message = (data && data.error) || ("Error " + response.status);
    throw new Error(message);
  }
  return data || {};
}

async function loadServerData() {
  if (location.protocol !== "http:" && location.protocol !== "https:") {
    apiAvailable = false;
    return;
  }
  try {
    const me = await api("/api/auth/me");
    currentUser = me.user || null;
    apiAvailable = true;
  } catch (error) {
    apiAvailable = false;
    currentUser = null;
    return;
  }
  try {
    const data = await api("/api/songs");
    serverSongs = Array.isArray(data.songs) ? data.songs : [];
  } catch (error) {
    serverSongs = [];
  }
}

async function refreshServerSongs() {
  if (!apiAvailable) return;
  try {
    const data = await api("/api/songs");
    serverSongs = Array.isArray(data.songs) ? data.songs : [];
  } catch (error) {
    /* mantener la copia en memoria */
  }
}

function isAdmin() { return !!currentUser && currentUser.role === "admin"; }

function canEdit(song) {
  if (!currentUser || !song || !song.custom) return false;
  return isAdmin() || song.ownerId === currentUser.id;
}

function renderAccountArea() {
  const area = $("#account-area");
  if (!area) return;

  if (!apiAvailable) {
    area.innerHTML = '<a class="btn ghost small" href="#/login">Entrar</a>';
    return;
  }
  if (currentUser) {
    area.innerHTML = '<a class="account-chip" href="#/cuenta" title="Mi cuenta">' +
      '<span class="avatar" style="background:' + avatarGradient(currentUser.username) + '">' + esc(initials(currentUser.username)) + "</span>" +
      '<span class="account-name">' + esc(currentUser.username) + "</span>" +
      (isAdmin() ? '<span class="role">admin</span>' : "") +
    "</a>";
    return;
  }
  area.innerHTML = '<a class="btn ghost small" href="#/login">Entrar</a>';
}

function formError(form, message) {
  let element = form.querySelector(".form-error");
  if (!element) {
    element = document.createElement("div");
    element.className = "form-error";
    form.prepend(element);
  }
  element.textContent = message || "";
  element.hidden = !message;
}

function authRequired(message) {
  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Cuenta</span></div>' +
      '<h1>Necesitas una cuenta</h1>' +
      '<p>' + esc(message) + '</p>' +
    '</div>' +
    emptyState("Inicia sesión para continuar",
      "Con una cuenta puedes publicar tus transcripciones y editar o borrar solo las tuyas.",
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<a class="btn" href="#/login">Entrar</a>' +
        '<a class="btn secondary" href="#/registro">Crear cuenta</a>' +
      "</div>");
}

/* ------------------------------------------------------------
   4. Componentes reutilizables
   ------------------------------------------------------------ */

function artistAvatar(artist, extraClass) {
  return '<span class="avatar ' + (extraClass || "") + '" style="background:' + avatarGradient(artist.name) + '">' +
    esc(initials(artist.name)) + "</span>";
}

function songRow(song, index) {
  const rhythm = getRhythm(song.rhythm);
  return '<a class="song-row" href="#/cancion/' + encodeURIComponent(song.id) + '">' +
    (typeof index === "number" ? '<span class="rank">' + (index + 1) + "</span>" : "") +
    '<span class="info"><strong>' + esc(song.title) + "</strong><span>" + esc(song.artistName) + "</span></span>" +
    '<span class="meta">' +
      '<span class="chip">' + esc(song.key) + "</span>" +
      (rhythm ? '<span class="chip tab-only-desktop">' + esc(rhythm.name) + "</span>" : "") +
    "</span>" +
  "</a>";
}

function songCard(song) {
  return '<a class="song-card" href="#/cancion/' + encodeURIComponent(song.id) + '">' +
    '<span class="cover" style="background:' + avatarGradient(song.title) + '">' + esc(song.title.charAt(0).toUpperCase()) + "</span>" +
    '<span class="info"><strong>' + esc(song.title) + "</strong><span>" + esc(song.artistName) + " · " + esc(song.key) + "</span></span>" +
    '<span class="arrow" aria-hidden="true">→</span>' +
  "</a>";
}

function artistCard(artist) {
  return '<a class="artist-card" href="#/artistas/' + encodeURIComponent(artist.slug) + '">' +
    artistAvatar(artist) +
    '<span class="info"><strong>' + esc(artist.name) + "</strong><span>" + esc(artist.country || artist.genre || "Artista") + "</span></span>" +
    '<span class="count">' + artistCount(artist.slug) + "</span>" +
  "</a>";
}

function chordFigure(chord, label) {
  const display = label || chord;
  return '<button type="button" class="chord-fig" data-action="open-chord" data-chord="' + esc(chord) + '" title="Ver posición de ' + esc(display) + '">' +
    diagramSVG(chord) + "<span>" + esc(display) + "</span></button>";
}

function emptyState(title, text, actionHtml) {
  return '<div class="empty">' +
    '<div class="empty-icon" aria-hidden="true">♪</div>' +
    "<h2>" + esc(title) + "</h2>" +
    "<p>" + esc(text) + "</p>" +
    (actionHtml || "") +
  "</div>";
}

/* ------------------------------------------------------------
   5. Router
   ------------------------------------------------------------ */

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const questionIndex = raw.indexOf("?");
  const path = questionIndex === -1 ? raw : raw.slice(0, questionIndex);
  const query = questionIndex === -1 ? "" : raw.slice(questionIndex + 1);
  const parts = path.split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch (error) { return part; }
  });
  return { path, parts, params: new URLSearchParams(query) };
}

function updateNav(parts) {
  const map = {
    artistas: "artistas",
    artista: "artistas",
    artist: "artistas",
    canciones: "canciones",
    cancion: "canciones",
    acordes: "acordes",
    buscar: "canciones",
    ritmos: "ritmos",
    afinador: "afinador",
    favoritos: "favoritos"
  };
  const current = map[parts[0]] || "home";
  $$(".main-nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === current);
  });
}

function navigate(path) {
  location.hash = path;
}

function render(html, title) {
  const main = $("#main");
  main.innerHTML = html;
  document.title = title ? title + " · AcordesLibres" : "AcordesLibres — Letras y acordes en español";
  main.focus({ preventScroll: true });
}

/* ------------------------------------------------------------
   6. Vista: inicio
   ------------------------------------------------------------ */

function viewHome() {
  const songs = sortSongs(allSongs(), "views");
  const popular = songs.slice(0, 8);
  const newest = sortSongs(allSongs(), "newest").slice(0, 4);
  const artists = sortArtists(getArtists());
  const featured = artists.filter((artist) => artist.featured).slice(0, 8);
  const recentSongs = recent.map(getSong).filter(Boolean).slice(0, 4);
  const genres = allGenres();

  const genreChips = genres.map((genre) => {
    const count = allSongs().filter((song) => song.genre === genre).length;
    return '<a class="chip" href="#/buscar?genre=' + encodeURIComponent(genre) + '">' + esc(genre) + " · " + count + "</a>";
  }).join("");

  return '' +
    '<section class="hero">' +
      '<div class="hero-copy">' +
        '<span class="eyebrow">Cancionero colaborativo</span>' +
        '<h1>Letras y acordes<br>para <span class="highlight">tocar hoy</span></h1>' +
        '<p class="hero-lead">Busca una canción, ajusta el tono y el capo, activa el autoscroll y ponte a tocar. Todo funciona en tu navegador, sin cuentas ni anuncios.</p>' +
        '<form class="hero-search" id="hero-search" role="search">' +
          '<span class="field">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.3 4.3 1.4-1.4-4.3-4.3A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" fill="currentColor"/></svg>' +
            '<label class="sr-only" for="hero-search-input">Buscar canción o artista</label>' +
            '<input id="hero-search-input" type="search" name="q" placeholder="Ej.: La Bamba, villancicos, La Tarara…" autocomplete="off">' +
          '</span>' +
          '<button class="btn" type="submit">Buscar</button>' +
        '</form>' +
        '<div class="hero-quick"><span>Prueba:</span>' +
          '<a href="#/cancion/la-bamba">La Bamba</a> · ' +
          '<a href="#/cancion/noche-de-paz">Noche de paz</a> · ' +
          '<a href="#/acordes">Diccionario</a> · ' +
          '<a href="#/afinador">Afinador</a>' +
        '</div>' +
      '</div>' +
      '<div class="hero-visual" aria-hidden="true">' +
        '<span class="hero-float a">Capo · Transporte</span>' +
        '<figure class="hero-chord">' + diagramSVG("G") + "<figcaption>Sol mayor</figcaption></figure>" +
        '<span class="hero-float b">Autoscroll · Afinador</span>' +
      '</div>' +
    '</section>' +

    '<div class="stats-strip">' +
      '<div class="stat"><strong>' + allSongs().length + '</strong><span>canciones</span></div>' +
      '<div class="stat"><strong>' + getArtists().length + '</strong><span>artistas</span></div>' +
      '<div class="stat"><strong>' + Object.keys(CHORD_DB).length + '</strong><span>posiciones de acordes</span></div>' +
      '<div class="stat"><strong>' + RHYTHMS.length + '</strong><span>ritmos explicados</span></div>' +
    '</div>' +

    (recentSongs.length ?
      '<section class="section">' +
        '<div class="section-head"><div><h2>Sigue donde lo dejaste</h2><p>Tus últimas canciones visitadas.</p></div></div>' +
        '<div class="song-grid">' + recentSongs.map(songCard).join("") + '</div>' +
      '</section>' : "") +

    '<section class="section">' +
      '<div class="section-head">' +
        '<div><h2>Las más populares</h2><p>Lo que más se está tocando esta semana.</p></div>' +
        '<a class="link-more" href="#/canciones?sort=views">Ver todas →</a>' +
      '</div>' +
      '<div class="song-list">' + popular.map((song, index) => songRow(song, index)).join("") + '</div>' +
    '</section>' +

    '<section class="section">' +
      '<div class="section-head"><div><h2>Novedades</h2><p>Transcripciones recién añadidas.</p></div><a class="link-more" href="#/canciones?sort=newest">Más nuevas →</a></div>' +
      '<div class="grid cols-4">' + newest.map(songCard).join("") + '</div>' +
    '</section>' +

    '<section class="section">' +
      '<div class="section-head"><div><h2>Artistas</h2><p>Voces y tradiciones del cancionero.</p></div><a class="link-more" href="#/artistas">Todos los artistas →</a></div>' +
      '<div class="artist-grid">' + featured.map(artistCard).join("") + '</div>' +
    '</section>' +

    '<section class="section">' +
      '<div class="section-head"><div><h2>Explora por género</h2><p>Encuentra rápido lo que te apetece tocar.</p></div></div>' +
      '<div class="hero-quick">' + genreChips + '</div>' +
    '</section>' +

    '<section class="section">' +
      '<div class="section-head"><div><h2>Herramientas</h2><p>Todo lo que necesitas además del cifrado.</p></div></div>' +
      '<div class="grid cols-4">' +
        '<a class="card" href="#/acordes"><h3>Diccionario de acordes</h3><p>Más de ' + Object.keys(CHORD_DB).length + ' posiciones con diagramas para guitarra.</p></a>' +
        '<a class="card" href="#/afinador"><h3>Afinador online</h3><p>Afinación estándar con micrófono y tonos de referencia.</p></a>' +
        '<a class="card" href="#/ritmos"><h3>Ritmos y rasgueos</h3><p>Patrones de balada, rock, vals, huayno y mucho más.</p></a>' +
        '<a class="card" href="#/enviar"><h3>Envía tu transcripción</h3><p>Crea una cuenta y añade tus propias canciones al cancionero.</p></a>' +
      '</div>' +
    '</section>';
}

/* ------------------------------------------------------------
   7. Vista: navegador de canciones y búsqueda
   ------------------------------------------------------------ */

function filterForm(basePath, params) {
  const q = params.get("q") || "";
  const country = params.get("country") || "";
  const genre = params.get("genre") || "";
  const sort = params.get("sort") || "";

  const countryOptions = allCountries().map((item) =>
    '<option value="' + esc(item) + '"' + (item === country ? " selected" : "") + ">" + esc(item) + "</option>"
  ).join("");

  const genreOptions = allGenres().map((item) =>
    '<option value="' + esc(item) + '"' + (item === genre ? " selected" : "") + ">" + esc(item) + "</option>"
  ).join("");

  const sortOptions = [
    ["", "Relevancia"],
    ["views", "Más populares"],
    ["newest", "Más recientes"],
    ["title", "Título (A–Z)"],
    ["artist", "Artista (A–Z)"]
  ].map(([value, label]) =>
    '<option value="' + value + '"' + (value === sort ? " selected" : "") + ">" + label + "</option>"
  ).join("");

  return '<form class="filter-bar" id="browser-form" data-base="' + basePath + '">' +
    '<div class="field-group grow"><label for="filter-q">Buscar</label>' +
      '<input class="input" id="filter-q" type="search" name="q" value="' + esc(q) + '" placeholder="Canción, artista, compositor…">' +
    '</div>' +
    '<div class="field-group"><label for="filter-country">País</label>' +
      '<select class="select" id="filter-country" name="country"><option value="">Todos</option>' + countryOptions + '</select>' +
    '</div>' +
    '<div class="field-group"><label for="filter-genre">Género</label>' +
      '<select class="select" id="filter-genre" name="genre"><option value="">Todos</option>' + genreOptions + '</select>' +
    '</div>' +
    '<div class="field-group"><label for="filter-sort">Ordenar</label>' +
      '<select class="select" id="filter-sort" name="sort">' + sortOptions + '</select>' +
    '</div>' +
    '<button class="btn" type="submit">Buscar</button>' +
    '<a class="btn ghost" href="' + basePath + '">Limpiar</a>' +
  '</form>';
}

function browserView(config) {
  const params = config.params;
  const q = params.get("q") || "";
  const country = params.get("country") || "";
  const genre = params.get("genre") || "";
  const sort = params.get("sort") || "";

  const results = searchSongs(q, country, genre, sort);

  let artistMatches = "";
  if (q) {
    const matches = sortArtists(getArtists().filter((artist) => normalizeText(artist.name).indexOf(normalizeText(q)) !== -1));
    if (matches.length) {
      artistMatches = '<section class="section">' +
        '<div class="section-head"><div><h2>Artistas</h2><p>' + matches.length + ' coincidencia' + (matches.length === 1 ? "" : "s") + '.</p></div></div>' +
        '<div class="artist-grid">' + matches.map(artistCard).join("") + '</div>' +
      '</section>';
    }
  }

  const countText = results.length === 1 ? "1 canción" : results.length + " canciones";

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>' + esc(config.title) + '</span></div>' +
      '<h1>' + esc(config.title) + '</h1>' +
      '<p>' + esc(config.subtitle) + '</p>' +
    '</div>' +
    filterForm(config.basePath, params) +
    artistMatches +
    '<div class="section-head"><div><h2>' + esc(q ? "Resultados" : "Todas las canciones") + '</h2><p>' + countText + (q ? ' para «' + esc(q) + '»' : "") + '.</p></div></div>' +
    (results.length
      ? '<div class="song-list">' + results.map((song, index) => songRow(song, index)).join("") + '</div>'
      : emptyState("Sin resultados", "Prueba con otra búsqueda o quita los filtros de país y género.", '<a class="btn" href="#/canciones">Ver todas las canciones</a>'));
}

function viewSongs(params) {
  return browserView({
    title: "Canciones",
    subtitle: "Todo el cancionero, ordenado como prefieras.",
    basePath: "#/canciones",
    params
  });
}

function viewSearch(params) {
  return browserView({
    title: "Buscar",
    subtitle: "Encuentra por título, artista, compositor, país o género.",
    basePath: "#/buscar",
    params
  });
}

/* ------------------------------------------------------------
   8. Vista: artistas
   ------------------------------------------------------------ */

function viewArtists(params) {
  const artists = sortArtists(getArtists());
  const letter = (params.get("letra") || "").toUpperCase();
  const letters = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");

  const available = {};
  artists.forEach((artist) => {
    const first = normalizeText(artist.name).charAt(0).toUpperCase();
    available[first] = true;
  });

  const filtered = letter
    ? artists.filter((artist) => normalizeText(artist.name).charAt(0).toUpperCase() === letter)
    : artists;

  const letterNav = letters.map((item) => {
    const has = !!available[item];
    const active = item === letter;
    if (!has) return '<span class="letter-nav"><button class="disabled" type="button" disabled>' + item + "</button></span>";
    return '<a class="' + (active ? "active" : "") + '" href="#/artistas?letra=' + item + '">' + item + "</a>";
  }).join("");

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Artistas</span></div>' +
      '<h1>Artistas</h1>' +
      '<p>' + artists.length + ' artistas en el cancionero. Elige una letra para filtrar.</p>' +
    '</div>' +
    '<nav class="letter-nav" aria-label="Filtrar por letra">' +
      '<a class="' + (letter ? "" : "active") + '" href="#/artistas">Todos</a>' + letterNav +
    '</nav>' +
    (filtered.length
      ? '<div class="artist-grid">' + filtered.map(artistCard).join("") + '</div>'
      : emptyState("No hay artistas con esa letra", "Prueba con otra letra o vuelve al listado completo.", '<a class="btn" href="#/artistas">Ver todos</a>'));
}

function viewArtist(slug) {
  const artist = getArtist(slug);
  if (!artist) return notFound("Artista no encontrado");

  const songs = sortSongs(songsByArtist(slug), "title");
  const related = sortArtists(getArtists().filter((item) => item.slug !== slug && item.genre === artist.genre)).slice(0, 4);
  const totalViews = songs.reduce((sum, song) => sum + (Number(song.views) || 0), 0);

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><a href="#/artistas">Artistas</a><span class="sep">/</span><span>' + esc(artist.name) + '</span></div>' +
      '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
        artistAvatar(artist, "lg") +
        '<div>' +
          '<h1 style="margin-bottom:4px">' + esc(artist.name) + '</h1>' +
          '<p style="margin:0">' + esc([artist.country, artist.genre].filter(Boolean).join(" · ")) + '</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="grid cols-2" style="margin-bottom:26px">' +
      '<div class="card"><h3>Sobre el artista</h3><p>' + esc(artist.bio || "Sin biografía.") + '</p></div>' +
      '<div class="grid cols-2">' +
        '<div class="stat"><strong>' + songs.length + '</strong><span>canciones</span></div>' +
        '<div class="stat"><strong>' + formatViews(totalViews) + '</strong><span>reproducciones</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="section-head"><div><h2>Canciones</h2><p>' + (songs.length === 1 ? "1 transcripción" : songs.length + " transcripciones") + '.</p></div></div>' +
    (songs.length
      ? '<div class="song-list">' + songs.map((song, index) => songRow(song, index)).join("") + '</div>'
      : emptyState("Aún no hay canciones", "Este artista todavía no tiene transcripciones publicadas.", "")) +
    (related.length
      ? '<section class="section"><div class="section-head"><div><h2>Artistas relacionados</h2><p>Mismo género: ' + esc(artist.genre || "—") + '.</p></div></div><div class="artist-grid">' + related.map(artistCard).join("") + '</div></section>'
      : "");
}

/* ------------------------------------------------------------
   9. Vista: canción
   ------------------------------------------------------------ */

function currentShift() {
  return songView ? songView.transpose - songView.capo : 0;
}

function renderedSongText() {
  if (!songView) return "";
  const song = songView.song;
  const shift = currentShift();
  const flats = keyPrefersFlats(song.key, shift);
  let text = transposeText(song.content, shift, flats);
  if (prefs.notation === "latino") text = latinizeText(text);
  if (prefs.chordsOnly) text = chordsOnlyText(text);
  return text;
}

function chordsOnlyText(text) {
  const output = [];
  String(text).split("\n").forEach((line) => {
    if (isSection(line)) {
      output.push(line);
      output.push("");
    } else if (isChordLine(line)) {
      output.push(line);
    }
  });
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function chartHTML(text) {
  return String(text).split("\n").map((line) => {
    if (!line.trim()) return '<span class="chart-line chart-empty">&nbsp;</span>';
    const isSec = isSection(line);
    const isChord = isChordLine(line);
    const classes = "chart-line" + (isSec ? " section" : "") + (!isSec && isChord ? " chord-line" : "");
    return '<span class="' + classes + '">' + esc(line) + "</span>";
  }).join("");
}

function currentKeyName() {
  if (!songView) return "—";
  const song = songView.song;
  const shift = currentShift();
  const flats = keyPrefersFlats(song.key, shift);
  const minor = /m$/.test(song.key);
  const root = song.key.replace(/m$/, "");
  return transposeNote(root, shift, flats) + (minor ? "m" : "");
}

function capoOptionsHtml(selected) {
  let html = "";
  for (let i = 0; i <= 9; i++) {
    html += '<option value="' + i + '"' + (i === selected ? " selected" : "") + ">" + (i === 0 ? "Sin capo" : "Traste " + i) + "</option>";
  }
  return html;
}

function viewSong(id) {
  const song = getSong(id);
  if (!song) { songView = null; return notFound("Canción no encontrada"); }

  rememberRecent(id);
  songView = { song, transpose: 0, capo: Number(song.capo) || 0 };

  const artist = getArtist(song.artist);
  const rhythm = getRhythm(song.rhythm);
  const related = sortSongs(allSongs().filter((item) => item.id !== song.id && (item.artist === song.artist || item.genre === song.genre)), "views").slice(0, 4);
  const favorite = isFavorite(song.id);
  const root = song.key.replace(/m$/, "");

  return '<div class="breadcrumbs">' +
      '<a href="#/">Inicio</a><span class="sep">/</span>' +
      '<a href="#/canciones">Canciones</a><span class="sep">/</span>' +
      '<a href="#/artistas/' + encodeURIComponent(song.artist) + '">' + esc(song.artistName) + '</a><span class="sep">/</span>' +
      '<span>' + esc(song.title) + '</span>' +
    '</div>' +

    '<div class="song-head">' +
      '<div>' +
        '<h1>' + esc(song.title) + '</h1>' +
        '<p class="song-artist">de <a href="#/artistas/' + encodeURIComponent(song.artist) + '">' + esc(song.artistName) + '</a>' +
          (song.composer ? " · " + esc(song.composer) : "") + '</p>' +
        '<div class="song-badges">' +
          '<span class="chip accent">' + esc(song.key) + '</span>' +
          '<span class="chip">' + esc(song.genre) + '</span>' +
          '<span class="chip">' + esc(song.country) + '</span>' +
          '<span class="chip blue">' + esc(song.difficulty) + '</span>' +
          '<span class="chip green">' + esc(song.license || "Dominio público") + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="song-actions">' +
        '<button class="btn secondary small" type="button" data-action="toggle-fav" data-id="' + esc(song.id) + '" aria-pressed="' + favorite + '">' +
          (favorite ? "★ En favoritos" : "☆ Favorito") +
        '</button>' +
        '<button class="btn ghost small" type="button" data-action="print">Imprimir</button>' +
        '<button class="btn ghost small" type="button" data-action="share">Compartir</button>' +
        '<button class="btn ghost small" type="button" data-action="download">Descargar .txt</button>' +
        '<button class="btn ghost small" type="button" data-action="fullscreen">Pantalla completa</button>' +
        (canEdit(song)
          ? '<a class="btn secondary small" href="#/editar/' + encodeURIComponent(song.id) + '">Editar</a>' +
            '<button class="btn danger small" type="button" data-action="delete-song" data-id="' + esc(song.id) + '">Eliminar</button>'
          : "") +
      '</div>' +
    '</div>' +

    '<div class="song-layout">' +
      '<div class="song-main">' +
        '<div class="toolbar" id="song-toolbar">' +
          '<div class="tool"><span class="tool-label">Tono</span>' +
            '<div class="stepper">' +
              '<button type="button" data-action="transpose-down" aria-label="Bajar medio tono">−</button>' +
              '<output id="transpose-value">0</output>' +
              '<button type="button" data-action="transpose-up" aria-label="Subir medio tono">+</button>' +
            '</div>' +
          '</div>' +
          '<div class="tool"><label for="capo-select">Capo</label>' +
            '<select class="select" id="capo-select">' + capoOptionsHtml(songView.capo) + '</select>' +
          '</div>' +
          '<div class="tool"><label for="notation-select">Notación</label>' +
            '<select class="select" id="notation-select">' +
              '<option value="anglo"' + (prefs.notation === "anglo" ? " selected" : "") + '>C D E F G A B</option>' +
              '<option value="latino"' + (prefs.notation === "latino" ? " selected" : "") + '>Do Re Mi Fa Sol La Si</option>' +
            '</select>' +
          '</div>' +
          '<div class="tool"><span class="tool-label">Texto</span>' +
            '<div class="stepper">' +
              '<button type="button" data-action="font-down" aria-label="Reducir texto">A−</button>' +
              '<output id="font-value">' + prefs.fontSize + '</output>' +
              '<button type="button" data-action="font-up" aria-label="Aumentar texto">A+</button>' +
            '</div>' +
          '</div>' +
          '<button class="toggle" type="button" data-action="toggle-chords-only" aria-pressed="' + prefs.chordsOnly + '">Solo acordes</button>' +
          '<button class="toggle" type="button" data-action="toggle-autoscroll" aria-pressed="false">Autoscroll</button>' +
          '<div class="tool" id="scroll-speed-wrap"' + (autoscrollActive ? "" : " hidden") + '>' +
            '<label for="scroll-speed">Velocidad</label>' +
            '<input id="scroll-speed" type="range" min="10" max="140" step="5" value="' + prefs.scrollSpeed + '">' +
          '</div>' +
        '</div>' +

        '<div class="chart-wrap">' +
          '<pre class="chart" id="chart" style="font-size:' + prefs.fontSize + 'px"></pre>' +
          '<p class="chart-tip">Consejo: usa «Solo acordes» para una vista limpia y activa el autoscroll mientras tocas.</p>' +
        '</div>' +
      '</div>' +

      '<aside class="song-side">' +
        '<div class="side-card">' +
          '<h3>Información</h3>' +
          '<div class="kv"><span>Tono original</span><strong>' + esc(song.key) + '</strong></div>' +
          '<div class="kv"><span>Tono actual</span><strong id="current-key">' + esc(currentKeyName()) + '</strong></div>' +
          '<div class="kv"><span>Capo</span><strong id="capo-info">' + (songView.capo ? "Traste " + songView.capo : "Sin capo") + '</strong></div>' +
          '<div class="kv"><span>Compás</span><strong>' + esc(song.time) + '</strong></div>' +
          '<div class="kv"><span>Tempo</span><strong>' + esc(song.bpm) + ' BPM</strong></div>' +
          '<div class="kv"><span>Afinación</span><strong>' + esc(song.tuning) + '</strong></div>' +
          '<div class="kv"><span>Dificultad</span><strong>' + esc(song.difficulty) + '</strong></div>' +
          '<div class="kv"><span>Añadida</span><strong>' + esc(formatDate(song.added)) + '</strong></div>' +
          (song.ownerName ? '<div class="kv"><span>Publicada por</span><strong>' + esc(song.ownerName) + '</strong></div>' : "") +
        '</div>' +

        '<div class="side-card">' +
          '<h3>Acordes usados</h3>' +
          '<div class="chord-diagrams" id="chord-diagrams"></div>' +
        '</div>' +

        (rhythm ?
          '<div class="side-card">' +
            '<h3>Ritmo sugerido</h3>' +
            '<p style="margin:0 0 6px"><strong>' + esc(rhythm.name) + '</strong> <span class="chip">' + esc(rhythm.time) + '</span></p>' +
            '<pre style="font-family:var(--mono);font-size:1.15rem;color:var(--accent);margin:0 0 8px">' + esc(rhythm.pattern) + '</pre>' +
            '<p style="margin:0;font-size:.84rem;color:var(--muted)">' + esc(rhythm.desc) + '</p>' +
            '<p style="margin:10px 0 0"><a href="#/ritmos">Ver todos los ritmos →</a></p>' +
          '</div>' : "") +
      '</aside>' +
    '</div>' +

    (related.length ?
      '<section class="section">' +
        '<div class="section-head"><div><h2>También te puede gustar</h2><p>Mismo artista o género.</p></div></div>' +
        '<div class="song-grid">' + related.map(songCard).join("") + '</div>' +
      '</section>' : "");
}

function refreshChart() {
  if (!songView) return;
  const chart = $("#chart");
  if (!chart) return;

  const shift = currentShift();
  const song = songView.song;

  chart.innerHTML = chartHTML(renderedSongText());
  chart.style.fontSize = prefs.fontSize + "px";

  const transposeOutput = $("#transpose-value");
  if (transposeOutput) transposeOutput.textContent = signed(songView.transpose);

  const fontOutput = $("#font-value");
  if (fontOutput) fontOutput.textContent = prefs.fontSize;

  const keyOutput = $("#current-key");
  if (keyOutput) keyOutput.textContent = currentKeyName();

  const capoInfo = $("#capo-info");
  if (capoInfo) capoInfo.textContent = songView.capo ? "Traste " + songView.capo : "Sin capo";

  const diagrams = $("#chord-diagrams");
  if (diagrams) {
    const flats = keyPrefersFlats(song.key, shift);
    const chords = extractChords(song.content).map((chord) => transposeChord(chord, shift, flats));
    diagrams.innerHTML = chords.length
      ? chords.map((chord) => chordFigure(chord, prefs.notation === "latino" ? chordToLatin(chord) : chord)).join("")
      : '<p style="color:var(--muted);font-size:.85rem;margin:0">Esta transcripción no contiene acordes.</p>';
  }

  const chordsOnlyButton = $('[data-action="toggle-chords-only"]');
  if (chordsOnlyButton) chordsOnlyButton.setAttribute("aria-pressed", String(prefs.chordsOnly));

  const speedWrap = $("#scroll-speed-wrap");
  if (speedWrap) speedWrap.hidden = !autoscrollActive;
}

/* ------------------------------------------------------------
   10. Vista: diccionario de acordes
   ------------------------------------------------------------ */

const ROOT_CHOICES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "Db", "Eb", "Gb", "Ab", "Bb"];

const QUALITY_CHOICES = [
  { id: "", label: "Mayor" },
  { id: "m", label: "Menor" },
  { id: "7", label: "Séptima" },
  { id: "m7", label: "Menor séptima" },
  { id: "maj7", label: "Mayor séptima" },
  { id: "sus4", label: "Sus4" },
  { id: "dim", label: "Disminuido" },
  { id: "aug", label: "Aumentado" }
];

function viewChords(params) {
  const requested = params.get("chord") || "C";
  const parsed = parseChordName(requested) || { root: "C", suffix: "" };
  const chord = parsed.root + parsed.suffix;
  const notes = chordNotes(chord);
  const hasShape = !!CHORD_DB[chord];
  const notation = prefs.notation;

  const rootOptions = ROOT_CHOICES.map((root) =>
    '<option value="' + root + '"' + (root === parsed.root ? " selected" : "") + ">" +
      (notation === "latino" ? chordToLatin(root) : root) + "</option>"
  ).join("");

  const qualityOptions = QUALITY_CHOICES.map((quality) =>
    '<option value="' + quality.id + '"' + (quality.id === parsed.suffix ? " selected" : "") + ">" + quality.label + "</option>"
  ).join("");

  const gallery = Object.keys(CHORD_DB).sort((a, b) => a.localeCompare(b, "es")).map((name) => {
    return chordFigure(name, notation === "latino" ? chordToLatin(name) : name);
  }).join("");

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Acordes</span></div>' +
      '<h1>Diccionario de acordes</h1>' +
      '<p> Consulta la posición de cada acorde y las notas que lo forman. Haz clic en un diagrama para ampliarlo.</p>' +
    '</div>' +

    '<form class="chord-builder" id="chord-form">' +
      '<div class="field-group"><label for="chord-root">Nota fundamental</label>' +
        '<select class="select" id="chord-root" name="root">' + rootOptions + '</select>' +
      '</div>' +
      '<div class="field-group"><label for="chord-quality">Tipo de acorde</label>' +
        '<select class="select" id="chord-quality" name="quality">' + qualityOptions + '</select>' +
      '</div>' +
      '<button class="btn" type="submit">Ver acorde</button>' +
    '</form>' +

    '<div class="chord-hero">' +
      '<div class="big-diagram">' + diagramSVG(chord) + '</div>' +
      '<div>' +
        '<h2>' + esc(notation === "latino" ? chordToLatin(chord) : chord) + '</h2>' +
        '<p style="color:var(--muted);margin:0">' + esc(hasShape ? "Posición para guitarra en afinación estándar." : "Todavía no hay una posición guardada para este acorde.") + '</p>' +
        '<div class="chord-notes">' + notes.map((note) => '<span class="note-pill">' + esc(notation === "latino" ? chordToLatin(note) : note) + "</span>").join("") + '</div>' +
        '<p style="margin:0;color:var(--muted);font-size:.88rem">Notas del acorde: ' + esc(notes.map((note) => notation === "latino" ? chordToLatin(note) : note).join(" · ")) + '</p>' +
        (hasShape ? "" : '<p style="margin:12px 0 0"><a href="#/enviar">¿Quieres añadir una posición?</a></p>') +
      '</div>' +
    '</div>' +

    '<section class="section">' +
      '<div class="section-head"><div><h2>Todos los acordes</h2><p>' + Object.keys(CHORD_DB).length + ' posiciones disponibles.</p></div></div>' +
      '<div class="chord-gallery">' + gallery + '</div>' +
    '</section>';
}

/* ------------------------------------------------------------
   11. Vista: ritmos
   ------------------------------------------------------------ */

function viewRhythms() {
  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Ritmos</span></div>' +
      '<h1>Ritmos y rasgueos</h1>' +
      '<p>Patrones de mano derecha para acompañar cada estilo. ↓ = abajo, ↑ = arriba, · = silencio.</p>' +
    '</div>' +
    '<div class="grid cols-2">' + RHYTHMS.map((rhythm) =>
      '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<h3 style="margin:0">' + esc(rhythm.name) + '</h3>' +
          '<span class="chip">' + esc(rhythm.time) + '</span>' +
        '</div>' +
        '<pre style="font-family:var(--mono);font-size:1.5rem;color:var(--accent);margin:14px 0">' + esc(rhythm.pattern) + '</pre>' +
        '<p>' + esc(rhythm.desc) + '</p>' +
        '<p style="margin-top:10px"><span class="chip green">' + esc(rhythm.genres.join(" · ")) + '</span></p>' +
      '</div>'
    ).join("") + '</div>';
}

/* ------------------------------------------------------------
   12. Vista: favoritos
   ------------------------------------------------------------ */

function viewFavorites() {
  const songs = favorites.map(getSong).filter(Boolean);

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Favoritos</span></div>' +
      '<h1>Mis favoritos</h1>' +
      '<p>' + (songs.length ? songs.length + (songs.length === 1 ? " canción guardada" : " canciones guardadas") + " en este navegador." : "Guarda canciones para tenerlas siempre a mano.") + '</p>' +
    '</div>' +
    (songs.length
      ? '<div class="song-list">' + songs.map((song, index) => songRow(song, index)).join("") + '</div>' +
        '<p style="margin-top:18px"><button class="btn danger" type="button" data-action="clear-favorites">Vaciar favoritos</button></p>'
      : emptyState("Todavía no tienes favoritos", "Entra en una canción y pulsa «☆ Favorito». Se guardará solo en este navegador.", '<a class="btn" href="#/canciones">Explorar canciones</a>'));
}

/* ------------------------------------------------------------
   13. Vista: afinador
   ------------------------------------------------------------ */

const GUITAR_STRINGS = [
  { label: "6ª cuerda", note: "E2", freq: 82.41, latin: "Mi" },
  { label: "5ª cuerda", note: "A2", freq: 110.00, latin: "La" },
  { label: "4ª cuerda", note: "D3", freq: 146.83, latin: "Re" },
  { label: "3ª cuerda", note: "G3", freq: 196.00, latin: "Sol" },
  { label: "2ª cuerda", note: "B3", freq: 246.94, latin: "Si" },
  { label: "1ª cuerda", note: "E4", freq: 329.63, latin: "Mi" }
];

let audioContext = null;
let analyserNode = null;
let micStream = null;
let tunerRAF = null;
let tunerRunning = false;
let toneOscillator = null;
let toneGain = null;
let toneTimer = null;

function viewTuner() {
  const isFile = location.protocol === "file:";

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Afinador</span></div>' +
      '<h1>Afinador de guitarra</h1>' +
      '<p>Afina de oído con los tonos de referencia o usa el micrófono para detectar la nota.</p>' +
    '</div>' +
    '<div class="tuner-layout">' +
      '<div class="tuner-card">' +
        '<div class="tuner-note" id="tuner-note">—</div>' +
        '<div class="tuner-status" id="tuner-status">Pulsa «Encender micrófono» y toca una cuerda.</div>' +
        '<div class="tuner-needle"><span class="marker" id="tuner-marker"></span></div>' +
        '<div class="tuner-cents" id="tuner-cents">0 cents</div>' +
        '<div class="tuner-actions">' +
          '<button class="btn" type="button" data-action="tuner-start">Encender micrófono</button>' +
          '<button class="btn secondary" type="button" data-action="tuner-stop">Detener</button>' +
        '</div>' +
        '<p class="chart-tip">' + (isFile
          ? "Estás abriendo el archivo directamente. El micrófono solo funciona con http://localhost o https; los tonos de referencia sí funcionan."
          : "El micrófono se procesa en tu dispositivo. No se envía audio a ningún servidor.") + '</p>' +
      '</div>' +

      '<div class="side-card">' +
        '<h3>Afinación estándar</h3>' +
        '<div class="strings">' + GUITAR_STRINGS.map((string) =>
          '<div class="string-row">' +
            '<span class="note">' + string.note + '</span>' +
            '<span><strong>' + string.label + '</strong><br><span class="freq">' + string.freq.toFixed(2) + ' Hz</span></span>' +
            '<button class="btn secondary small" type="button" data-action="play-tone" data-freq="' + string.freq + '" data-note="' + string.note + '">▶ Oír</button>' +
          '</div>'
        ).join("") + '</div>' +
        '<p class="chart-tip">Standard tuning: E A D G B E.</p>' +
      '</div>' +
    '</div>';
}

function getAudioContext() {
  if (!audioContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function stopTone() {
  if (toneTimer) { clearTimeout(toneTimer); toneTimer = null; }
  if (toneGain) {
    try {
      toneGain.gain.cancelScheduledValues(audioContext.currentTime);
      toneGain.gain.setValueAtTime(toneGain.gain.value, audioContext.currentTime);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.15);
    } catch (error) { /* ignorar */ }
  }
  if (toneOscillator) {
    const osc = toneOscillator;
    setTimeout(() => { try { osc.stop(); } catch (error) { /* ignorar */ } }, 200);
    toneOscillator = null;
  }
}

function playTone(freq, note) {
  const ctx = getAudioContext();
  if (!ctx) { toast("Tu navegador no soporta audio"); return; }
  stopTone();

  toneOscillator = ctx.createOscillator();
  toneGain = ctx.createGain();
  toneOscillator.type = "sine";
  toneOscillator.frequency.value = freq;
  toneGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  toneGain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
  toneOscillator.connect(toneGain).connect(ctx.destination);
  toneOscillator.start();

  toast("Tono de referencia: " + note);
  toneTimer = setTimeout(stopTone, 2000);
}

function autoCorrelate(buffer, sampleRate) {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return -1;

  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;

  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) { r1 = i; break; }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < threshold) { r2 = size - i; break; }
  }

  const trimmed = buffer.slice(r1, r2);
  const length = trimmed.length;
  if (length < 32) return -1;

  const correlations = new Float32Array(length).fill(0);
  for (let i = 0; i < length; i++) {
    for (let j = 0; j < length - i; j++) {
      correlations[i] += trimmed[j] * trimmed[j + i];
    }
  }

  let d = 0;
  while (d < length - 1 && correlations[d] > correlations[d + 1]) d++;

  let maxValue = -1;
  let maxPosition = -1;
  for (let i = d; i < length; i++) {
    if (correlations[i] > maxValue) {
      maxValue = correlations[i];
      maxPosition = i;
    }
  }

  let t0 = maxPosition;
  if (t0 <= 0 || t0 >= length - 1) return -1;

  const x1 = correlations[t0 - 1];
  const x2 = correlations[t0];
  const x3 = correlations[t0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a !== 0) t0 = t0 - b / (2 * a);

  return sampleRate / t0;
}

function freqToNote(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = names[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  const cents = Math.max(-50, Math.min(50, Math.round((midi - rounded) * 100)));
  return { name, octave, cents };
}

async function startTuner() {
  if (tunerRunning) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Este navegador no permite acceder al micrófono");
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });

    const ctx = getAudioContext();
    if (!ctx) throw new Error("Audio no disponible");

    const source = ctx.createMediaStreamSource(micStream);
    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 2048;
    source.connect(analyserNode);

    tunerRunning = true;
    const buffer = new Float32Array(analyserNode.fftSize);

    const noteElement = $("#tuner-note");
    const statusElement = $("#tuner-status");
    const markerElement = $("#tuner-marker");
    const centsElement = $("#tuner-cents");

    if (statusElement) statusElement.textContent = "Escuchando… toca una cuerda al aire.";

    const loop = () => {
      if (!tunerRunning || !analyserNode) return;
      analyserNode.getFloatTimeDomainData(buffer);
      const freq = autoCorrelate(buffer, ctx.sampleRate);

      if (freq > 50 && freq < 500) {
        const note = freqToNote(freq);
        if (noteElement) noteElement.textContent = note.name + note.octave;
        if (centsElement) centsElement.textContent = (note.cents > 0 ? "+" : "") + note.cents + " cents";
        if (markerElement) markerElement.style.left = (50 + (note.cents / 50) * 45) + "%";
        if (statusElement) {
          const diff = Math.abs(note.cents);
          statusElement.textContent = diff <= 3 ? "Afinado ✓" : (note.cents < 0 ? "Demasiado grave" : "Demasiado agudo");
        }
      } else {
        if (statusElement) statusElement.textContent = "Escuchando…";
        if (markerElement) markerElement.style.left = "50%";
        if (centsElement) centsElement.textContent = "0 cents";
      }

      tunerRAF = requestAnimationFrame(loop);
    };

    loop();
    toast("Micrófono activado");
  } catch (error) {
    tunerRunning = false;
    const statusElement = $("#tuner-status");
    if (statusElement) {
      statusElement.textContent = "No se pudo acceder al micrófono. Revisa los permisos o abre la web con http://localhost.";
    }
    toast("Permiso de micrófono denegado o no disponible");
  }
}

function stopTuner() {
  tunerRunning = false;
  if (tunerRAF) { cancelAnimationFrame(tunerRAF); tunerRAF = null; }
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
  analyserNode = null;

  const noteElement = $("#tuner-note");
  const statusElement = $("#tuner-status");
  const centsElement = $("#tuner-cents");
  const markerElement = $("#tuner-marker");
  if (noteElement) noteElement.textContent = "—";
  if (statusElement) statusElement.textContent = "Micrófono detenido. Pulsa «Encender micrófono» para volver a empezar.";
  if (centsElement) centsElement.textContent = "0 cents";
  if (markerElement) markerElement.style.left = "50%";
}

/* ------------------------------------------------------------
   14. Vista: enviar canción
   ------------------------------------------------------------ */

function songFormHtml(song) {
  const current = song || {};
  const rhythmOptions = RHYTHMS.map((rhythm) =>
    '<option value="' + rhythm.id + '"' + (rhythm.id === current.rhythm ? " selected" : "") + ">" + esc(rhythm.name) + " (" + esc(rhythm.time) + ")</option>"
  ).join("");

  const countryOptions = allCountries().map((country) =>
    '<option value="' + esc(country) + '"' + (country === current.country ? " selected" : "") + ">" + esc(country) + "</option>"
  ).join("");

  const genreOptions = allGenres().map((genre) =>
    '<option value="' + esc(genre) + '"' + (genre === current.genre ? " selected" : "") + ">" + esc(genre) + "</option>"
  ).join("");

  const difficultyOptions = ["Principiante", "Fácil", "Intermedio", "Avanzado"].map((level) =>
    '<option' + (level === (current.difficulty || "Fácil") ? " selected" : "") + ">" + level + "</option>"
  ).join("");

  const editing = !!current.id;

  return '<form id="submit-form" class="grid cols-2" style="align-items:start">' +
    (editing ? '<input type="hidden" name="song-id" value="' + esc(current.id) + '">' : "") +
    '<div class="form-error" style="grid-column:1/-1" hidden></div>' +
    '<div class="field-group"><label for="song-title">Título *</label><input class="input" id="song-title" name="title" required maxlength="120" placeholder="Nombre de la canción" value="' + esc(current.title || "") + '"></div>' +
    '<div class="field-group"><label for="song-artist">Artista *</label><input class="input" id="song-artist" name="artist" required maxlength="120" placeholder="Intérprete o autor" value="' + esc(current.artistName || "") + '"></div>' +
    '<div class="field-group"><label for="song-composer">Compositor</label><input class="input" id="song-composer" name="composer" maxlength="120" placeholder="Opcional" value="' + esc(current.composer || "") + '"></div>' +
    '<div class="field-group"><label for="song-year">Año</label><input class="input" id="song-year" name="year" maxlength="20" placeholder="Opcional" value="' + esc(current.year || "") + '"></div>' +
    '<div class="field-group"><label for="song-country">País</label><select class="select" id="song-country" name="country"><option value="">Sin especificar</option>' + countryOptions + '<option value="Otro"' + (current.country === "Otro" ? " selected" : "") + '>Otro</option></select></div>' +
    '<div class="field-group"><label for="song-genre">Género</label><select class="select" id="song-genre" name="genre"><option value="">Sin especificar</option>' + genreOptions + '<option value="Otro"' + (current.genre === "Otro" ? " selected" : "") + '>Otro</option></select></div>' +
    '<div class="field-group"><label for="song-key">Tono *</label><input class="input" id="song-key" name="key" required maxlength="6" placeholder="C, Am, F#m…" value="' + esc(current.key || "C") + '"></div>' +
    '<div class="field-group"><label for="song-capo">Capo</label><select class="select" id="song-capo" name="capo">' + capoOptionsHtml(Number(current.capo) || 0) + '</select></div>' +
    '<div class="field-group"><label for="song-time">Compás</label><input class="input" id="song-time" name="time" maxlength="10" value="' + esc(current.time || "4/4") + '"></div>' +
    '<div class="field-group"><label for="song-bpm">Tempo (BPM)</label><input class="input" id="song-bpm" name="bpm" type="number" min="30" max="300" value="' + esc(current.bpm || 100) + '"></div>' +
    '<div class="field-group"><label for="song-rhythm">Ritmo</label><select class="select" id="song-rhythm" name="rhythm">' + rhythmOptions + '</select></div>' +
    '<div class="field-group"><label for="song-difficulty">Dificultad</label><select class="select" id="song-difficulty" name="difficulty">' + difficultyOptions + '</select></div>' +
    '<div class="field-group" style="grid-column:1/-1"><label for="song-content">Transcripción *</label><textarea class="textarea" id="song-content" name="content" required placeholder="[Intro]\\nC  G  Am  F\\n\\n[Verso 1]\\nC                 G\\nAquí va la letra…">' + esc(current.content || "") + '</textarea></div>' +
    '<div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<button class="btn" type="submit">' + (editing ? "Guardar cambios" : "Publicar canción") + '</button>' +
      '<span style="color:var(--muted);font-size:.82rem">' + (editing ? "Se actualizará tu transcripción." : "Quedará guardada en el servidor y solo tú podrás editarla.") + '</span>' +
    '</div>' +
  '</form>';
}

function formatHelpCard() {
  return '<div class="card" style="margin-bottom:26px">' +
      '<p style="margin:0;color:var(--muted);font-size:.9rem"><strong>Formato:</strong> escribe los acordes en la línea de arriba y la letra debajo, usando espacios para alinear. Ejemplo:</p>' +
      '<pre style="font-family:var(--mono);font-size:.86rem;background:var(--surface-2);padding:14px;border-radius:8px;overflow:auto;margin:12px 0 0">[Verso 1]\\nC                 F\\nAquí va la letra de la canción\\nG                 C\\ny aquí sigue el siguiente verso</pre>' +
    '</div>';
}

function songManageRow(song) {
  return '<div class="song-manage">' +
    '<span class="info"><strong>' + esc(song.title) + '</strong><span>' + esc(song.artistName) + ' · ' + esc(song.key) + (song.ownerName ? ' · ' + esc(song.ownerName) : "") + '</span></span>' +
    '<span class="actions">' +
      '<a class="btn secondary small" href="#/cancion/' + encodeURIComponent(song.id) + '">Ver</a>' +
      '<a class="btn secondary small" href="#/editar/' + encodeURIComponent(song.id) + '">Editar</a>' +
      '<button class="btn danger small" type="button" data-action="delete-song" data-id="' + esc(song.id) + '">Eliminar</button>' +
    '</span>' +
  '</div>';
}

function editableSongs() { return serverSongs.filter(canEdit); }

function mySongsSection() {
  const list = editableSongs();
  if (!list.length) return "";
  return '<section class="section">' +
    '<div class="section-head"><div><h2>Mis canciones</h2><p>Puedes editarlas o borrarlas cuando quieras.</p></div></div>' +
    '<div class="song-list">' + list.map(songManageRow).join("") + '</div>' +
  '</section>';
}

function offlineNotice() {
  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Cuenta</span></div>' +
      '<h1>Cuentas y edición</h1>' +
      '<p>Esta parte necesita el servidor local con la API.</p>' +
    '</div>' +
    emptyState("Abre la web con el servidor",
      "Arranca node server.js y entra en http://localhost:8080 para usar cuentas, publicar canciones y editarlas o borrarlas.",
      '<a class="btn" href="#/">Volver al inicio</a>');
}

function viewSubmit() {
  if (!apiAvailable) return offlineNotice();
  if (!currentUser) {
    return authRequired("Para publicar una transcripción necesitas una cuenta. Así solo tú podrás editarla o borrarla después.");
  }

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Enviar canción</span></div>' +
      '<h1>Envía tu transcripción</h1>' +
      '<p>Añade una canción con tus propios acordes. Queda guardada en el servidor y solo tú podrás editarla o borrarla.</p>' +
    '</div>' +
    formatHelpCard() +
    songFormHtml(null) +
    mySongsSection();
}

function viewEdit(id) {
  if (!apiAvailable) return offlineNotice();
  if (!currentUser) return authRequired("Inicia sesión con la cuenta propietaria para editar esta canción.");

  const song = getSong(id);
  if (!song || !song.custom) return notFound("Canción no encontrada");
  if (!canEdit(song)) return authRequired("Esta canción pertenece a otra cuenta, así que no puedes editarla.");

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span>' +
        '<a href="#/cancion/' + encodeURIComponent(song.id) + '">' + esc(song.title) + '</a><span class="sep">/</span><span>Editar</span></div>' +
      '<h1>Editar «' + esc(song.title) + '»</h1>' +
      '<p>Modifica los datos y guarda. Solo tú (y los administradores) podéis cambiar esta transcripción.</p>' +
    '</div>' +
    songFormHtml(song);
}

function viewLogin(params) {
  if (!apiAvailable) return offlineNotice();
  if (currentUser) {
    return '<div class="auth-wrap">' + emptyState("Ya has iniciado sesión",
      "Estás conectado como " + currentUser.username + ".",
      '<a class="btn" href="#/cuenta">Ir a mi cuenta</a>') + '</div>';
  }
  const ok = params && params.get("ok") === "1";
  return '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>Entrar</h1>' +
      '<p>Accede para publicar tus transcripciones y gestionarlas.</p>' +
      (ok ? '<p class="form-success">Contraseña actualizada. Ya puedes entrar con la nueva.</p>' : "") +
      '<form class="auth-form" id="login-form">' +
        '<div class="field-group"><label for="login-username">Usuario</label><input class="input" id="login-username" name="username" required maxlength="24" autocomplete="username"></div>' +
        '<div class="field-group"><label for="login-password">Contraseña</label><input class="input" id="login-password" name="password" type="password" required autocomplete="current-password"></div>' +
        '<button class="btn" type="submit">Entrar</button>' +
      '</form>' +
      '<p class="auth-alt"><a href="#/recuperar">¿Olvidaste tu contraseña?</a></p>' +
      '<p class="auth-alt">¿No tienes cuenta? <a href="#/registro">Crear una</a></p>' +
    '</div></div>';
}

function viewForgot(params) {
  if (!apiAvailable) return offlineNotice();
  if (params && params.get("sent") === "1") {
    return '<div class="auth-wrap">' + emptyState("Revisa tu correo",
      "Si ese correo está registrado, te hemos enviado un enlace para elegir una nueva contraseña. Caduca en 60 minutos y solo sirve una vez.",
      '<a class="btn" href="#/login">Volver a entrar</a>') + '</div>';
  }
  return '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>Recuperar contraseña</h1>' +
      '<p>Escribe el correo con el que creaste tu cuenta y te enviaremos un enlace.</p>' +
      '<form class="auth-form" id="forgot-form">' +
        '<div class="field-group"><label for="forgot-email">Correo electrónico</label><input class="input" id="forgot-email" name="email" type="email" required maxlength="120" autocomplete="email"></div>' +
        '<button class="btn" type="submit">Enviar enlace</button>' +
      '</form>' +
      '<p class="auth-alt"><a href="#/login">Volver a entrar</a></p>' +
    '</div></div>';
}

function viewReset(params) {
  if (!apiAvailable) return offlineNotice();
  const token = params ? String(params.get("token") || "") : "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return '<div class="auth-wrap">' + emptyState("Enlace no válido",
      "Este enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.",
      '<a class="btn" href="#/recuperar">Pedir otro enlace</a>') + '</div>';
  }
  return '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>Nueva contraseña</h1>' +
      '<p>Elige una contraseña nueva para tu cuenta. Al guardarla se cerrarán todas las sesiones abiertas.</p>' +
      '<form class="auth-form" id="reset-form">' +
        '<input type="hidden" name="token" value="' + esc(token) + '">' +
        '<div class="field-group"><label for="reset-password">Nueva contraseña</label><input class="input" id="reset-password" name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="Mínimo 10 caracteres"></div>' +
        '<div class="field-group"><label for="reset-confirm">Repite la nueva contraseña</label><input class="input" id="reset-confirm" name="confirm" type="password" required minlength="10" autocomplete="new-password"></div>' +
        '<button class="btn" type="submit">Guardar contraseña</button>' +
      '</form>' +
      '<p class="form-note">El enlace caduca en 60 minutos y solo sirve una vez.</p>' +
    '</div></div>';
}

function viewRegister() {
  if (!apiAvailable) return offlineNotice();
  if (currentUser) {
    return '<div class="auth-wrap">' + emptyState("Ya has iniciado sesión",
      "Estás conectado como " + currentUser.username + ".",
      '<a class="btn" href="#/cuenta">Ir a mi cuenta</a>') + '</div>';
  }
  return '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>Crear cuenta</h1>' +
      '<p>Con una cuenta puedes publicar transcripciones y editar o borrar solo las tuyas.</p>' +
      '<form class="auth-form" id="register-form">' +
        '<div class="field-group"><label for="register-username">Usuario</label><input class="input" id="register-username" name="username" required maxlength="24" minlength="3" autocomplete="username" placeholder="De 3 a 24 caracteres"></div>' +
        '<div class="field-group"><label for="register-email">Correo electrónico</label><input class="input" id="register-email" name="email" type="email" required maxlength="120" autocomplete="email" placeholder="Para recuperar tu contraseña"></div>' +
        '<div class="field-group"><label for="register-password">Contraseña</label><input class="input" id="register-password" name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="Mínimo 10 caracteres"></div>' +
        '<div class="field-group"><label for="register-confirm">Repite la contraseña</label><input class="input" id="register-confirm" name="confirm" type="password" required minlength="10" autocomplete="new-password"></div>' +
        '<button class="btn" type="submit">Crear cuenta</button>' +
      '</form>' +
      '<p class="form-note">La contraseña debe tener al menos 10 caracteres. No uses tu nombre de usuario ni contraseñas obvias.</p>' +
      '<p class="form-note">Guardamos tu correo solo para la cuenta y la recuperación de contraseña. No se muestra en público ni se comparte.</p>' +
      '<p class="auth-alt">¿Ya tienes cuenta? <a href="#/login">Entrar</a></p>' +
      '<p class="form-note">El primer usuario registrado se convierte en administrador.</p>' +
    '</div></div>';
}

function viewAccount() {
  if (!apiAvailable) return offlineNotice();
  if (!currentUser) return authRequired("Inicia sesión para ver tu cuenta y gestionar tus transcripciones.");

  const mine = editableSongs();
  const created = String(currentUser.createdAt || "").slice(0, 10);

  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Mi cuenta</span></div>' +
      '<h1>Mi cuenta</h1>' +
      '<p>Gestiona tus transcripciones. Solo tú y los administradores podéis modificarlas.</p>' +
    '</div>' +
    '<div class="card">' +
      '<div class="profile-head">' +
        '<span class="avatar lg" style="background:' + avatarGradient(currentUser.username) + '">' + esc(initials(currentUser.username)) + '</span>' +
        '<div>' +
          '<h2 style="margin:0">' + esc(currentUser.username) + '</h2>' +
          '<p style="margin:0;color:var(--muted)">' + (isAdmin() ? "Administrador" : "Usuario") + (created ? " · desde " + esc(formatDate(created)) : "") + '</p>' +
          '<p style="margin:0;color:var(--muted)">' + (currentUser.email ? esc(currentUser.email) : "Sin correo de recuperación") + '</p>' +
        '</div>' +
        '<div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">' +
          '<a class="btn" href="#/enviar">Nueva canción</a>' +
          '<button class="btn secondary" type="button" data-action="logout">Cerrar sesión</button>' +
        '</div>' +
      '</div>' +
      '<div class="stats-strip" style="margin-top:8px">' +
        '<div class="stat"><strong>' + mine.length + '</strong><span>' + (isAdmin() ? "gestionables" : "canciones propias") + '</span></div>' +
        '<div class="stat"><strong>' + favorites.length + '</strong><span>favoritos</span></div>' +
        '<div class="stat"><strong>' + allSongs().length + '</strong><span>canciones en total</span></div>' +
        '<div class="stat"><strong>' + getArtists().length + '</strong><span>artistas</span></div>' +
      '</div>' +
    '</div>' +
    securitySection() +
    (mine.length
      ? mySongsSection()
      : '<section class="section">' + emptyState("Aún no has publicado nada",
          "Cuando envíes una transcripción aparecerá aquí y solo tú podrás editarla.",
          '<a class="btn" href="#/enviar">Enviar una canción</a>') + '</section>');
}

function securitySection() {
  return '<section class="section" id="seguridad">' +
    '<div class="section-head"><div><h2>Seguridad</h2><p>Cambia tu contraseña, tu correo de recuperación o cierra las sesiones abiertas en otros dispositivos.</p></div></div>' +
    '<div class="card">' +
      '<h3 style="margin:0 0 6px">Correo de recuperación</h3>' +
      '<p class="form-note" style="margin-top:0">' + (currentUser.email
        ? "Actualmente: <strong>" + esc(currentUser.email) + "</strong>. Si olvidas la contraseña, podrás recuperarla desde este correo."
        : "No tienes correo configurado: no podrás recuperar la contraseña si la olvidas.") + '</p>' +
      '<form class="auth-form" id="email-form" style="margin-top:0;max-width:460px">' +
        '<div class="field-group"><label for="email-new">Nuevo correo</label><input class="input" id="email-new" name="email" type="email" required maxlength="120" autocomplete="email" value="' + esc(currentUser.email || "") + '"></div>' +
        '<div class="field-group"><label for="email-password">Contraseña actual</label><input class="input" id="email-password" name="password" type="password" required autocomplete="current-password"></div>' +
        '<button class="btn secondary" type="submit">Guardar correo</button>' +
      '</form>' +
    '</div>' +
    '<div class="card" style="margin-top:14px">' +
      '<h3 style="margin:0 0 6px">Contraseña</h3>' +
      '<form class="auth-form" id="password-form" style="margin-top:0;max-width:460px">' +
        '<div class="field-group"><label for="pw-current">Contraseña actual</label><input class="input" id="pw-current" name="current" type="password" required autocomplete="current-password"></div>' +
        '<div class="field-group"><label for="pw-next">Nueva contraseña</label><input class="input" id="pw-next" name="next" type="password" required minlength="10" autocomplete="new-password" placeholder="Mínimo 10 caracteres"></div>' +
        '<div class="field-group"><label for="pw-confirm">Repite la nueva contraseña</label><input class="input" id="pw-confirm" name="confirm" type="password" required minlength="10" autocomplete="new-password"></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="btn" type="submit">Cambiar contraseña</button>' +
          '<button class="btn secondary" type="button" data-action="logout-all">Cerrar todas las sesiones</button>' +
        '</div>' +
      '</form>' +
      '<p class="form-note" style="margin-bottom:0">Al cambiarla se cierran las demás sesiones y se conserva esta. La sesión caduca a las 24 h de inactividad.</p>' +
    '</div>' +
  '</section>';
}

/* ------------------------------------------------------------
   15. Vista: legal y 404
   ------------------------------------------------------------ */

function viewLegal() {
  return '<div class="page-head">' +
      '<div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>Legal</span></div>' +
      '<h1>Aviso legal y privacidad</h1>' +
    '</div>' +
    '<div class="prose card">' +
      '<h2>Contenido</h2>' +
      '<p>Las canciones incluidas inicialmente son de <strong>dominio público</strong> y se ofrecen como demostración y material de aprendizaje. Las transcripciones que añadas tú son responsabilidad tuya: asegúrate de tener los derechos necesarios para publicarlas.</p>' +
      '<p>Este proyecto no aloja ni reproduce letras o acordes de obras protegidas sin autorización. Si eres titular de derechos y crees que algún contenido infringe, contacta con el responsable del sitio para retirarlo.</p>' +
      '<h2>Cuentas y datos</h2>' +
      '<ul>' +
        '<li>El catálogo de demostración y las herramientas funcionan sin cuenta, directamente en el navegador.</li>' +
        '<li>Para publicar transcripciones y poder editarlas o borrarlas hace falta una cuenta. Las cuentas se guardan en el servidor (<code>data/users.json</code>).</li>' +
        '<li>El <strong>correo electrónico</strong> se guarda solo para identificar la cuenta y permitir la recuperación de contraseña. No se muestra en las páginas públicas, no se comparte con terceros y puedes cambiarlo desde Mi cuenta.</li>' +
        '<li>Las contraseñas se guardan como <strong>hash scrypt</strong> con sal aleatoria y un secreto del servidor (pimienta): no son reversibles y nunca se almacenan en texto plano.</li>' +
        '<li>La sesión usa una cookie <code>HttpOnly</code>, <code>SameSite=Lax</code> y <code>Secure</code> bajo HTTPS. Caduca a las 24 h de inactividad y al cerrar sesión se invalida.</li>' +
        '<li>La recuperación de contraseña usa un enlace de un solo uso que caduca en 60 minutos. Al usarlo se cierran todas las sesiones abiertas. En el servidor solo se guarda un hash del enlace.</li>' +
        '<li>Desde <strong>Mi cuenta</strong> puedes cambiar la contraseña (cierra las demás sesiones), cambiar el correo de recuperación y cerrar todas las sesiones abiertas.</li>' +
        '<li>Cada canción guarda quién la publicó: solo el propietario (o un administrador) puede editarla o borrarla.</li>' +
        '<li>Favoritos y preferencias siguen guardándose solo en <code>localStorage</code>, en tu navegador.</li>' +
        '<li>El micrófono del afinador solo se usa en tu dispositivo y no se envía audio a ninguna parte.</li>' +
      '</ul>' +
      '<h2>Tecnología</h2>' +
      '<p>HTML, CSS y JavaScript sin frameworks ni procesos de compilación. Los diagramas de acordes se generan como SVG en el propio navegador.</p>' +
      '<p>El servidor aplica HTTPS, cabeceras de seguridad (HSTS, CSP, <code>X-Frame-Options</code>, <code>Referrer-Policy</code>) y limita los intentos de acceso.</p>' +
      '<h2>Uso del material</h2>' +
      '<p>Puedes usar el código como base para tu propio cancionero. Respeta las licencias del contenido que añadas.</p>' +
    '</div>';
}

function notFound(message) {
  return '<div class="page-head"><div class="breadcrumbs"><a href="#/">Inicio</a><span class="sep">/</span><span>No encontrado</span></div></div>' +
    emptyState(message || "Página no encontrada", "La dirección no existe o el contenido se ha eliminado.", '<a class="btn" href="#/">Volver al inicio</a>');
}

/* ------------------------------------------------------------
   16. Autoscroll
   ------------------------------------------------------------ */

function updateAutoscrollButtons() {
  const buttons = $$('[data-action="toggle-autoscroll"]');
  buttons.forEach((button) => {
    if (!button.classList.contains("scroll-fab")) {
      button.setAttribute("aria-pressed", String(autoscrollActive));
      button.textContent = autoscrollActive ? "Pausar autoscroll" : "Autoscroll";
    }
  });

  const speedWrap = $("#scroll-speed-wrap");
  if (speedWrap) speedWrap.hidden = !autoscrollActive;

  let fab = $("#autoscroll-fab");
  if (autoscrollActive) {
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "autoscroll-fab";
      fab.className = "scroll-fab show";
      fab.type = "button";
      fab.dataset.action = "toggle-autoscroll";
      document.body.appendChild(fab);
    }
    fab.textContent = "⏸ Detener autoscroll";
    fab.classList.add("show");
  } else if (fab) {
    fab.classList.remove("show");
  }
}

function startAutoscroll() {
  if (autoscrollActive) return;
  autoscrollActive = true;
  autoscrollAcc = 0;
  autoscrollLast = performance.now();
  // El desplazamiento suave global no debe frenar el autoscroll (móvil)
  document.documentElement.classList.add("autoscrolling");

  const step = (now) => {
    if (!autoscrollActive) return;
    const delta = Math.min(now - autoscrollLast, 120);
    autoscrollLast = now;
    autoscrollAcc += (prefs.scrollSpeed * delta) / 1000;

    const pixels = Math.floor(autoscrollAcc);
    if (pixels > 0) {
      window.scrollBy(0, pixels);
      autoscrollAcc -= pixels;
    }

    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      stopAutoscroll();
      return;
    }
    autoscrollRAF = requestAnimationFrame(step);
  };

  autoscrollRAF = requestAnimationFrame(step);
  updateAutoscrollButtons();
  toast("Autoscroll activado · " + prefs.scrollSpeed + " px/s");
}

function stopAutoscroll() {
  autoscrollActive = false;
  document.documentElement.classList.remove("autoscrolling");
  if (autoscrollRAF) { cancelAnimationFrame(autoscrollRAF); autoscrollRAF = null; }
  updateAutoscrollButtons();
}

function toggleAutoscroll() {
  if (autoscrollActive) stopAutoscroll();
  else startAutoscroll();
}

/* ------------------------------------------------------------
   17. Acciones
   ------------------------------------------------------------ */

function songShare(song) {
  const url = location.href;
  const title = song.title + " — " + song.artistName + " · AcordesLibres";

  if (navigator.share) {
    navigator.share({ title, text: "Letras y acordes de " + song.title, url }).catch(() => {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => toast("Enlace copiado al portapapeles"),
      () => toast("No se pudo copiar el enlace")
    );
  } else {
    toast("Copia la dirección de la barra del navegador");
  }
}

function songDownload(song) {
  const text = [
    song.title,
    song.artistName,
    song.composer ? "Compositor: " + song.composer : "",
    "Tono: " + song.key + " · Capo: " + (song.capo || 0),
    "Afinación: " + song.tuning + " · " + song.time + " · " + song.bpm + " BPM",
    "",
    $("#chart") ? $("#chart").innerText : song.content,
    "",
    "— Descargado de AcordesLibres"
  ].filter((line) => line !== "").join("\n");

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = slugify(song.title) + "-acordes.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Archivo descargado");
}

async function handleAction(action, element) {
  switch (action) {
    case "toggle-theme": {
      const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = current;
      try { localStorage.setItem(KEYS.theme, current); } catch (error) { /* ignorar */ }
      break;
    }
    case "toggle-menu": {
      const nav = $("#main-nav");
      const button = $("#menu-toggle");
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      break;
    }
    case "transpose-down":
    case "transpose-up": {
      if (!songView) break;
      const delta = action === "transpose-up" ? 1 : -1;
      songView.transpose = Math.max(-11, Math.min(11, songView.transpose + delta));
      refreshChart();
      break;
    }
    case "font-down":
    case "font-up": {
      prefs.fontSize = Math.max(13, Math.min(34, prefs.fontSize + (action === "font-up" ? 1 : -1)));
      savePrefs();
      refreshChart();
      break;
    }
    case "toggle-chords-only": {
      prefs.chordsOnly = !prefs.chordsOnly;
      savePrefs();
      refreshChart();
      toast(prefs.chordsOnly ? "Mostrando solo acordes" : "Mostrando letra y acordes");
      break;
    }
    case "toggle-autoscroll":
      toggleAutoscroll();
      break;
    case "toggle-fav": {
      const id = element.dataset.id;
      const active = toggleFavorite(id);
      element.textContent = active ? "★ En favoritos" : "☆ Favorito";
      element.setAttribute("aria-pressed", String(active));
      toast(active ? "Añadida a favoritos" : "Eliminada de favoritos");
      break;
    }
    case "clear-favorites": {
      if (!favorites.length) break;
      if (confirm("¿Vaciar todos los favoritos de este navegador?")) {
        favorites = [];
        saveFavorites();
        route();
        toast("Favoritos vaciados");
      }
      break;
    }
    case "print":
      window.print();
      break;
    case "fullscreen": {
      if (!document.fullscreenElement) {
        const request = document.documentElement.requestFullscreen;
        if (request) request.call(document.documentElement).catch(() => toast("El navegador no permite pantalla completa"));
        else toast("El navegador no permite pantalla completa");
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      break;
    }
    case "share": {
      const route = parseRoute();
      const song = route.parts[0] === "cancion" ? getSong(route.parts[1]) : null;
      if (song) songShare(song);
      break;
    }
    case "download": {
      const route = parseRoute();
      const song = route.parts[0] === "cancion" ? getSong(route.parts[1]) : null;
      if (song) songDownload(song);
      break;
    }
    case "open-chord": {
      const chord = element.dataset.chord;
      if (chord) navigate("#/acordes?chord=" + encodeURIComponent(chord));
      break;
    }
    case "tuner-start":
      startTuner();
      break;
    case "tuner-stop":
      stopTuner();
      break;
    case "play-tone": {
      const freq = parseFloat(element.dataset.freq);
      if (freq) playTone(freq, element.dataset.note || "");
      break;
    }
    case "delete-song": {
      const id = element.dataset.id;
      const song = getSong(id);
      if (!song || !canEdit(song)) break;
      if (!confirm("¿Eliminar «" + song.title + "»? Esta acción no se puede deshacer.")) break;
      try {
        await api("/api/songs/" + encodeURIComponent(id), { method: "DELETE" });
        serverSongs = serverSongs.filter((item) => item.id !== id);
        favorites = favorites.filter((favorite) => favorite !== id);
        saveFavorites();
        recent = recent.filter((item) => item !== id);
        saveRecent();
        toast("Canción eliminada");
        if (parseRoute().parts[0] === "cuenta") route();
        else navigate("#/cuenta");
      } catch (error) {
        toast(error.message);
      }
      break;
    }
    case "logout": {
      await logout();
      break;
    }
    case "logout-all": {
      if (!confirm("¿Cerrar la sesión en todos los dispositivos, incluido este?")) break;
      try {
        await api("/api/auth/logout-all", { method: "POST" });
      } catch (error) {
        /* la sesión local se cierra igualmente */
      }
      currentUser = null;
      renderAccountArea();
      toast("Todas las sesiones cerradas");
      navigate("#/");
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------
   18. Formularios
   ------------------------------------------------------------ */

function browserSubmit(form) {
  const data = new FormData(form);
  const base = form.dataset.base || "#/buscar";
  const params = new URLSearchParams();
  ["q", "country", "genre", "sort"].forEach((key) => {
    const value = String(data.get(key) || "").trim();
    if (value) params.set(key, value);
  });
  const query = params.toString();
  navigate(base + (query ? "?" + query : ""));
}

function chordSubmit(form) {
  const data = new FormData(form);
  const root = String(data.get("root") || "C");
  const quality = String(data.get("quality") || "");
  navigate("#/acordes?chord=" + encodeURIComponent(root + quality));
}

async function submitForm(form) {
  const data = new FormData(form);
  const id = String(data.get("song-id") || "").trim();
  const payload = {
    title: String(data.get("title") || "").trim(),
    artist: String(data.get("artist") || "").trim(),
    composer: String(data.get("composer") || "").trim(),
    year: String(data.get("year") || "").trim(),
    country: String(data.get("country") || "").trim(),
    genre: String(data.get("genre") || "").trim(),
    key: String(data.get("key") || "C").trim() || "C",
    capo: Number(data.get("capo")) || 0,
    tuning: "E A D G B E",
    time: String(data.get("time") || "4/4").trim(),
    bpm: Number(data.get("bpm")) || 100,
    rhythm: String(data.get("rhythm") || "").trim(),
    difficulty: String(data.get("difficulty") || "Fácil"),
    content: String(data.get("content") || "").trim()
  };

  if (!payload.title || !payload.artist || !payload.content) {
    formError(form, "El título, el artista y la transcripción son obligatorios.");
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  formError(form, "");

  try {
    const response = await api(id ? "/api/songs/" + encodeURIComponent(id) : "/api/songs", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    const song = response.song;
    const index = serverSongs.findIndex((item) => item.id === song.id);
    if (index === -1) serverSongs.push(song);
    else serverSongs[index] = song;
    toast(id ? "Cambios guardados" : "Canción publicada");
    navigate("#/cancion/" + song.id);
  } catch (error) {
    formError(form, error.message);
    if (button) button.disabled = false;
  }
}

async function loginSubmit(form) {
  const data = new FormData(form);
  const username = String(data.get("username") || "").trim();
  const password = String(data.get("password") || "");
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  formError(form, "");

  try {
    const response = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    currentUser = response.user;
    await refreshServerSongs();
    renderAccountArea();
    toast("Bienvenido, " + currentUser.username);
    navigate("#/cuenta");
  } catch (error) {
    formError(form, error.message);
    if (button) button.disabled = false;
  }
}

async function registerSubmit(form) {
  const data = new FormData(form);
  const username = String(data.get("username") || "").trim();
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  const confirm = String(data.get("confirm") || "");

  if (password !== confirm) {
    formError(form, "Las contraseñas no coinciden.");
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  formError(form, "");

  try {
    const response = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password })
    });
    currentUser = response.user;
    await refreshServerSongs();
    renderAccountArea();
    toast(currentUser.role === "admin" ? "Cuenta creada como administrador" : "Cuenta creada");
    navigate("#/cuenta");
  } catch (error) {
    formError(form, error.message);
    if (button) button.disabled = false;
  }
}

async function forgotSubmit(form) {
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  formError(form, "");

  try {
    await api("/api/auth/forgot", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    navigate("#/recuperar?sent=1");
  } catch (error) {
    formError(form, error.message);
    if (button) button.disabled = false;
  }
}

async function resetSubmit(form) {
  const data = new FormData(form);
  const token = String(data.get("token") || "");
  const password = String(data.get("password") || "");
  const confirm = String(data.get("confirm") || "");

  if (password !== confirm) {
    formError(form, "Las contraseñas no coinciden.");
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  formError(form, "");

  try {
    await api("/api/auth/reset", {
      method: "POST",
      body: JSON.stringify({ token, password })
    });
    currentUser = null;
    renderAccountArea();
    toast("Contraseña actualizada. Entra con la nueva.");
    navigate("#/login?ok=1");
  } catch (error) {
    formError(form, error.message);
    if (button) button.disabled = false;
  }
}

async function emailSubmit(form) {
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  formError(form, "");

  try {
    const response = await api("/api/auth/email", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    currentUser = response.user;
    form.reset();
    formError(form, "");
    toast("Correo de recuperación actualizado");
    renderAccountArea();
    route();
  } catch (error) {
    formError(form, error.message);
    if (button) button.disabled = false;
  }
}

async function passwordSubmit(form) {
  const data = new FormData(form);
  const current = String(data.get("current") || "");
  const next = String(data.get("next") || "");
  const confirm = String(data.get("confirm") || "");

  if (next !== confirm) {
    formError(form, "Las contraseñas nuevas no coinciden.");
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  formError(form, "");

  try {
    await api("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ current, next })
    });
    form.reset();
    toast("Contraseña actualizada. Las demás sesiones se han cerrado.");
  } catch (error) {
    formError(form, error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function logout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch (error) { /* ignorar */ }
  currentUser = null;
  renderAccountArea();
  toast("Sesión cerrada");
  navigate("#/");
}

/* ------------------------------------------------------------
   19. Router principal
   ------------------------------------------------------------ */

function jumpToTop() {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previous;
}

function route() {
  const parsed = parseRoute();
  const parts = parsed.parts;
  const params = parsed.params;
  const view = parts[0] || "";

  stopAutoscroll();
  if (view !== "afinador") stopTuner();

  let html = "";
  let title = "";

  if (!view) {
    html = viewHome();
    title = "";
  } else if (view === "artistas") {
    if (parts[1]) {
      html = viewArtist(parts[1]);
      title = "Artista";
    } else {
      html = viewArtists(params);
      title = "Artistas";
    }
  } else if (view === "canciones") {
    html = viewSongs(params);
    title = "Canciones";
  } else if (view === "cancion") {
    html = viewSong(parts[1]);
    title = songView ? "Canción" : "No encontrado";
  } else if (view === "buscar") {
    html = viewSearch(params);
    title = "Buscar";
  } else if (view === "acordes") {
    html = viewChords(params);
    title = "Acordes";
  } else if (view === "ritmos") {
    html = viewRhythms();
    title = "Ritmos y rasgueos";
  } else if (view === "favoritos") {
    html = viewFavorites();
    title = "Favoritos";
  } else if (view === "afinador") {
    html = viewTuner();
    title = "Afinador";
  } else if (view === "enviar") {
    html = viewSubmit();
    title = "Enviar canción";
  } else if (view === "editar") {
    html = viewEdit(parts[1]);
    title = "Editar canción";
  } else if (view === "login") {
    html = viewLogin(params);
    title = "Entrar";
  } else if (view === "registro") {
    html = viewRegister();
    title = "Crear cuenta";
  } else if (view === "recuperar") {
    html = viewForgot(params);
    title = "Recuperar contraseña";
  } else if (view === "restablecer") {
    html = viewReset(params);
    title = "Nueva contraseña";
  } else if (view === "cuenta") {
    html = viewAccount();
    title = "Mi cuenta";
  } else if (view === "legal") {
    html = viewLegal();
    title = "Aviso legal";
  } else {
    html = notFound();
    title = "No encontrado";
  }

  render(html, title);
  updateNav(parts);

  if (view === "cancion" && songView) {
    refreshChart();
    document.title = songView.song.title + " — " + songView.song.artistName + " · AcordesLibres";
  } else {
    songView = null;
  }

  jumpToTop();

  const nav = $("#main-nav");
  if (nav) nav.classList.remove("open");
  const menuButton = $("#menu-toggle");
  if (menuButton) menuButton.setAttribute("aria-expanded", "false");

  const fab = $("#autoscroll-fab");
  if (fab) fab.classList.remove("show");
}

/* ------------------------------------------------------------
   20. Inicialización
   ------------------------------------------------------------ */

async function init() {
  const yearElement = $("#year");
  if (yearElement) yearElement.textContent = new Date().getFullYear();

  const savedTheme = document.documentElement.dataset.theme;
  if (!savedTheme) {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
  }

  await loadServerData();
  renderAccountArea();

  const globalSearch = $("#global-search-form");
  if (globalSearch) {
    globalSearch.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = $("#global-search");
      const query = input ? input.value.trim() : "";
      navigate("#/buscar" + (query ? "?q=" + encodeURIComponent(query) : ""));
      if (input) input.blur();
    });
  }

  document.addEventListener("click", (event) => {
    const actionElement = event.target.closest("[data-action]");
    if (actionElement) {
      const action = actionElement.dataset.action;
      if (action === "toggle-theme") {
        // El botón de tema no usa data-action en el HTML; se mantiene por compatibilidad.
      }
      handleAction(action, actionElement);
      return;
    }

    const menuLink = event.target.closest(".main-nav a");
    if (menuLink) {
      const nav = $("#main-nav");
      if (nav) nav.classList.remove("open");
    }
  });

  const themeButton = $("#theme-toggle");
  if (themeButton) {
    themeButton.addEventListener("click", () => handleAction("toggle-theme", themeButton));
  }

  const menuButton = $("#menu-toggle");
  if (menuButton) {
    menuButton.addEventListener("click", () => handleAction("toggle-menu", menuButton));
  }

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "capo-select" && songView) {
      songView.capo = Number(target.value) || 0;
      refreshChart();
    }
    if (target.id === "notation-select" && songView) {
      prefs.notation = target.value === "latino" ? "latino" : "anglo";
      savePrefs();
      refreshChart();
    }
    if (target.id === "scroll-speed") {
      prefs.scrollSpeed = Number(target.value) || 40;
      savePrefs();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "scroll-speed") {
      prefs.scrollSpeed = Number(event.target.value) || 40;
      savePrefs();
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (form.id === "hero-search") {
      event.preventDefault();
      const data = new FormData(form);
      const query = String(data.get("q") || "").trim();
      navigate("#/buscar" + (query ? "?q=" + encodeURIComponent(query) : ""));
      return;
    }
    if (form.id === "browser-form") {
      event.preventDefault();
      browserSubmit(form);
      return;
    }
    if (form.id === "chord-form") {
      event.preventDefault();
      chordSubmit(form);
      return;
    }
    if (form.id === "login-form") {
      event.preventDefault();
      loginSubmit(form);
      return;
    }
    if (form.id === "register-form") {
      event.preventDefault();
      registerSubmit(form);
      return;
    }
    if (form.id === "forgot-form") {
      event.preventDefault();
      forgotSubmit(form);
      return;
    }
    if (form.id === "reset-form") {
      event.preventDefault();
      resetSubmit(form);
      return;
    }
    if (form.id === "email-form") {
      event.preventDefault();
      emailSubmit(form);
      return;
    }
    if (form.id === "password-form") {
      event.preventDefault();
      passwordSubmit(form);
      return;
    }
    if (form.id === "submit-form") {
      event.preventDefault();
      submitForm(form);
    }
  });

  window.addEventListener("hashchange", route);
  window.addEventListener("wheel", () => { if (autoscrollActive) stopAutoscroll(); }, { passive: true });
  window.addEventListener("touchstart", (event) => {
    const touch = event.touches && event.touches[0];
    autoscrollTouchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  window.addEventListener("touchmove", (event) => {
    if (!autoscrollActive || !autoscrollTouchStart) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - autoscrollTouchStart.x;
    const dy = touch.clientY - autoscrollTouchStart.y;
    // Un toque normal (sin arrastre) no detiene el autoscroll; un deslizamiento sí.
    if (Math.hypot(dx, dy) < 10) return;
    stopAutoscroll();
  }, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      const input = $("#global-search") || $("#hero-search-input");
      if (input && input.offsetParent !== null) {
        event.preventDefault();
        input.focus();
      }
    }
  });

  route();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
