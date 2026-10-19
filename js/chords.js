/* ============================================================
   chords.js — motor de acordes
   ------------------------------------------------------------
   - Diccionario de posiciones de guitarra (CHORD_DB)
   - Detección de líneas de acordes
   - Transporte (cambio de tono) y capo
   - Notación americana / latina
   - Generación de diagramas SVG
   ============================================================ */

const NOTE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const ROOT_INDEX = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "E#": 5,
  "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10,
  "Bb": 10, "B": 11, "B#": 0, "Cb": 11, "Fb": 4
};

const LATIN_NAMES = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };

/* Sufijos admitidos en un token de acorde */
const CHORD_RE = /^([A-G])([#b]?)([^/\s]*)(?:\/([A-G])([#b]?))?$/;
const SUFFIX_RE = /^(?:maj|min|m|M|dim|aug|sus|add|°|ø|Δ|no|b|#|\+|-|\d|\(|\))*$/;
const NEUTRAL_RE = /^(?:x\d+|\d+x|\(x\d+\)|N\.?C\.?|%|→|[-–—]+|\|+)$/i;

/* ------------------------------------------------------------
   Diccionario de posiciones
   frets: 6ª cuerda → 1ª cuerda. -1 = mute, 0 = al aire.
   barres: [{fret, from, to}] con índices de cuerda 0..5
   ------------------------------------------------------------ */

const CHORD_DB = {
  "C":      { frets: [-1, 3, 2, 0, 1, 0], barres: [] },
  "Cm":     { frets: [-1, 3, 5, 5, 4, 3], barres: [{ fret: 3, from: 1, to: 5 }] },
  "C7":     { frets: [-1, 3, 2, 3, 1, 0], barres: [] },
  "Cmaj7":  { frets: [-1, 3, 2, 0, 0, 0], barres: [] },
  "Cm7":    { frets: [-1, 3, 5, 3, 4, 3], barres: [{ fret: 3, from: 1, to: 5 }] },
  "Csus4":  { frets: [-1, 3, 3, 0, 1, 1], barres: [] },
  "Cadd9":  { frets: [-1, 3, 2, 0, 3, 0], barres: [] },

  "C#":     { frets: [-1, 4, 6, 6, 6, 4], barres: [{ fret: 4, from: 1, to: 5 }] },
  "C#m":    { frets: [-1, 4, 6, 6, 5, 4], barres: [{ fret: 4, from: 1, to: 5 }] },
  "C#7":    { frets: [-1, 4, 6, 4, 6, 4], barres: [{ fret: 4, from: 1, to: 5 }] },
  "C#m7":   { frets: [-1, 4, 6, 4, 5, 4], barres: [{ fret: 4, from: 1, to: 5 }] },
  "Db":     { frets: [-1, 4, 6, 6, 6, 4], barres: [{ fret: 4, from: 1, to: 5 }] },

  "D":      { frets: [-1, -1, 0, 2, 3, 2], barres: [] },
  "Dm":     { frets: [-1, -1, 0, 2, 3, 1], barres: [] },
  "D7":     { frets: [-1, -1, 0, 2, 1, 2], barres: [] },
  "Dmaj7":  { frets: [-1, -1, 0, 2, 2, 2], barres: [] },
  "Dm7":    { frets: [-1, -1, 0, 2, 1, 1], barres: [] },
  "Dsus4":  { frets: [-1, -1, 0, 2, 3, 3], barres: [] },

  "D#":     { frets: [-1, 6, 8, 8, 8, 6], barres: [{ fret: 6, from: 1, to: 5 }] },
  "Eb":     { frets: [-1, 6, 8, 8, 8, 6], barres: [{ fret: 6, from: 1, to: 5 }] },
  "Ebm":    { frets: [-1, 6, 8, 8, 7, 6], barres: [{ fret: 6, from: 1, to: 5 }] },

  "E":      { frets: [0, 2, 2, 1, 0, 0], barres: [] },
  "Em":     { frets: [0, 2, 2, 0, 0, 0], barres: [] },
  "E7":     { frets: [0, 2, 0, 1, 0, 0], barres: [] },
  "Emaj7":  { frets: [0, 2, 1, 1, 0, 0], barres: [] },
  "Em7":    { frets: [0, 2, 0, 0, 0, 0], barres: [] },
  "Esus4":  { frets: [0, 2, 2, 2, 0, 0], barres: [] },

  "F":      { frets: [1, 3, 3, 2, 1, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "Fm":     { frets: [1, 3, 3, 1, 1, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "F7":     { frets: [1, 3, 1, 2, 1, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "Fmaj7":  { frets: [-1, -1, 3, 2, 1, 0], barres: [] },
  "Fm7":    { frets: [1, 3, 1, 1, 1, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "Fsus4":  { frets: [1, 3, 3, 3, 1, 1], barres: [{ fret: 1, from: 1, to: 5 }] },

  "F#":     { frets: [2, 4, 4, 3, 2, 2], barres: [{ fret: 2, from: 1, to: 5 }] },
  "F#m":    { frets: [2, 4, 4, 2, 2, 2], barres: [{ fret: 2, from: 1, to: 5 }] },
  "F#7":    { frets: [2, 4, 2, 3, 2, 2], barres: [{ fret: 2, from: 1, to: 5 }] },
  "F#m7":   { frets: [2, 4, 2, 2, 2, 2], barres: [{ fret: 2, from: 1, to: 5 }] },
  "Gb":     { frets: [2, 4, 4, 3, 2, 2], barres: [{ fret: 2, from: 1, to: 5 }] },

  "G":      { frets: [3, 2, 0, 0, 0, 3], barres: [] },
  "Gm":     { frets: [3, 5, 5, 3, 3, 3], barres: [{ fret: 3, from: 1, to: 5 }] },
  "G7":     { frets: [3, 2, 0, 0, 0, 1], barres: [] },
  "Gmaj7":  { frets: [3, 2, 0, 0, 0, 2], barres: [] },
  "Gm7":    { frets: [3, 5, 3, 3, 3, 3], barres: [{ fret: 3, from: 1, to: 5 }] },
  "Gsus4":  { frets: [3, 3, 0, 0, 1, 3], barres: [] },

  "G#":     { frets: [4, 6, 6, 5, 4, 4], barres: [{ fret: 4, from: 1, to: 5 }] },
  "Ab":     { frets: [4, 6, 6, 5, 4, 4], barres: [{ fret: 4, from: 1, to: 5 }] },
  "G#m":    { frets: [4, 6, 6, 4, 4, 4], barres: [{ fret: 4, from: 1, to: 5 }] },
  "Abm":    { frets: [4, 6, 6, 4, 4, 4], barres: [{ fret: 4, from: 1, to: 5 }] },

  "A":      { frets: [-1, 0, 2, 2, 2, 0], barres: [] },
  "Am":     { frets: [-1, 0, 2, 2, 1, 0], barres: [] },
  "A7":     { frets: [-1, 0, 2, 0, 2, 0], barres: [] },
  "Amaj7":  { frets: [-1, 0, 2, 1, 2, 0], barres: [] },
  "Am7":    { frets: [-1, 0, 2, 0, 1, 0], barres: [] },
  "Asus4":  { frets: [-1, 0, 2, 2, 3, 0], barres: [] },

  "Bb":     { frets: [-1, 1, 3, 3, 3, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "A#":     { frets: [-1, 1, 3, 3, 3, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "Bbm":    { frets: [-1, 1, 3, 3, 2, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "Bb7":    { frets: [-1, 1, 3, 1, 3, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "Bbmaj7": { frets: [-1, 1, 3, 2, 3, 1], barres: [{ fret: 1, from: 1, to: 5 }] },
  "Bbm7":   { frets: [-1, 1, 3, 1, 2, 1], barres: [{ fret: 1, from: 1, to: 5 }] },

  "B":      { frets: [-1, 2, 4, 4, 4, 2], barres: [{ fret: 2, from: 1, to: 5 }] },
  "Bm":     { frets: [-1, 2, 4, 4, 3, 2], barres: [{ fret: 2, from: 1, to: 5 }] },
  "B7":     { frets: [-1, 2, 1, 2, 0, 2], barres: [] },
  "Bmaj7":  { frets: [-1, 2, 4, 3, 4, 2], barres: [{ fret: 2, from: 1, to: 5 }] },
  "Bm7":    { frets: [-1, 2, 0, 2, 0, 2], barres: [] },

  "Bdim":   { frets: [-1, 2, 3, 4, 3, -1], barres: [] },
  "Baug":   { frets: [-1, 2, 1, 0, 0, 3], barres: [] },
  "Cdim":   { frets: [-1, 3, 4, 5, 4, -1], barres: [] },
  "Ddim":   { frets: [-1, -1, 0, 1, 3, 1], barres: [] }
};

/* ------------------------------------------------------------
   Utilidades de tokens
   ------------------------------------------------------------ */

function cleanChordToken(token) {
  return String(token)
    .replace(/^[|(\[]+/, "")
    .replace(/[)\]|,;:.]+$/, "");
}

function parseChordName(name) {
  const m = String(name).match(CHORD_RE);
  if (!m) return null;
  const suffix = m[3] || "";
  if (!SUFFIX_RE.test(suffix)) return null;
  const root = m[1] + (m[2] || "");
  if (ROOT_INDEX[root] === undefined) return null;
  const bass = m[4] ? m[4] + (m[5] || "") : null;
  if (bass && ROOT_INDEX[bass] === undefined) return null;
  return { root, accidental: m[2] || "", suffix, bass };
}

function isChordToken(token) {
  const clean = cleanChordToken(token);
  if (!clean) return false;
  return parseChordName(clean) !== null;
}

function isSection(line) {
  const t = String(line).trim();
  return /^\[.+\]$/.test(t) || /^\{.+\}$/.test(t);
}

function isChordLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed || isSection(trimmed) || /^\(.+\)$/.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/);
  let chords = 0;

  for (const token of tokens) {
    if (NEUTRAL_RE.test(token)) continue;
    if (isChordToken(token)) { chords++; continue; }
    return false;
  }
  return chords > 0;
}

/* ------------------------------------------------------------
   Transporte
   ------------------------------------------------------------ */

function transposeNote(note, semitones, preferFlats) {
  const m = String(note).match(/^([A-G])([#b]?)$/);
  if (!m) return note;
  let index = ROOT_INDEX[m[1] + (m[2] || "")];
  if (index === undefined) return note;
  index = ((index + semitones) % 12 + 12) % 12;
  const flats = preferFlats || m[2] === "b";
  return (flats ? NOTE_FLAT : NOTE_SHARP)[index];
}

function transposeChord(name, semitones, preferFlats) {
  if (!semitones) return name;
  const parsed = parseChordName(name);
  if (!parsed) return name;

  const flats = preferFlats || parsed.accidental === "b";
  const root = transposeNote(parsed.root, semitones, flats);
  const bass = parsed.bass ? "/" + transposeNote(parsed.bass, semitones, flats) : "";
  return root + parsed.suffix + bass;
}

function transposeText(text, semitones, preferFlats) {
  if (!semitones) return text;
  return String(text).split("\n").map((line) => {
    if (!isChordLine(line)) return line;
    return line.split(/(\s+)/).map((part) => {
      if (!part || /^\s+$/.test(part)) return part;
      const m = part.match(/^([|(\[]*)([^|)\],;]+?)([|)\],;]*)$/);
      if (!m) return part;
      if (!isChordToken(m[2])) return part;
      return m[1] + transposeChord(m[2], semitones, preferFlats) + m[3];
    }).join("");
  }).join("\n");
}

function extractChords(text) {
  const found = new Set();
  String(text).split("\n").forEach((line) => {
    if (!isChordLine(line)) return;
    line.split(/\s+/).forEach((token) => {
      const clean = cleanChordToken(token);
      if (isChordToken(clean)) found.add(clean);
    });
  });
  return Array.from(found);
}

/* ------------------------------------------------------------
   Notación latina
   ------------------------------------------------------------ */

function chordToLatin(name) {
  return String(name).replace(/([A-G])([#b]?)/g, (_, letter, acc) => {
    return (LATIN_NAMES[letter] || letter) + (acc || "");
  });
}

function latinizeText(text) {
  return String(text).split("\n").map((line) => {
    if (!isChordLine(line)) return line;
    return line.split(/(\s+)/).map((part) => {
      if (!part || /^\s+$/.test(part)) return part;
      const m = part.match(/^([|(\[]*)([^|)\],;]+?)([|)\],;]*)$/);
      if (!m || !isChordToken(m[2])) return part;
      return m[1] + chordToLatin(m[2]) + m[3];
    }).join("");
  }).join("\n");
}

function noteName(index, preferFlats) {
  return (preferFlats ? NOTE_FLAT : NOTE_SHARP)[((index % 12) + 12) % 12];
}

function keyPrefersFlats(key, semitones) {
  if (String(key).indexOf("b") !== -1) return true;
  const idx = ROOT_INDEX[String(key).replace(/m$/, "")];
  if (idx === undefined) return false;
  const now = ((idx + (semitones || 0)) % 12 + 12) % 12;
  return [1, 3, 6, 8, 10].indexOf(now) !== -1;
}

/* ------------------------------------------------------------
   Notas de un acorde (para el diccionario)
   ------------------------------------------------------------ */

const QUALITY_INTERVALS = {
  "": [0, 4, 7],
  "m": [0, 3, 7],
  "7": [0, 4, 7, 10],
  "m7": [0, 3, 7, 10],
  "maj7": [0, 4, 7, 11],
  "6": [0, 4, 7, 9],
  "m6": [0, 3, 7, 9],
  "sus4": [0, 5, 7],
  "sus2": [0, 2, 7],
  "dim": [0, 3, 6],
  "dim7": [0, 3, 6, 9],
  "aug": [0, 4, 8],
  "add9": [0, 4, 7, 14],
  "9": [0, 4, 7, 10, 14]
};

function chordNotes(name, preferFlats) {
  const parsed = parseChordName(name);
  if (!parsed) return [];
  const base = ROOT_INDEX[parsed.root];
  const intervals = QUALITY_INTERVALS[parsed.suffix] || [0, 4, 7];
  return intervals.map((i) => noteName(base + i, preferFlats));
}

/* ------------------------------------------------------------
   Diagramas SVG
   ------------------------------------------------------------ */

function diagramSVG(name, options) {
  const opts = options || {};
  const W = 92;
  const H = 116;
  const L = 14;
  const R = 10;
  const T = 22;
  const FRET_H = 15;
  const STRING_GAP = (W - L - R) / 5;
  const data = CHORD_DB[name];

  const stroke = "currentColor";

  if (!data) {
    return '<svg width="92" height="116" viewBox="0 0 92 116" role="img" aria-label="' +
      escapeXml(name) + ' (posición no disponible)">' +
      '<rect x="1" y="1" width="90" height="114" rx="8" fill="none" stroke="' + stroke + '" opacity=".15"/>' +
      '<text x="46" y="62" text-anchor="middle" fill="' + stroke + '" opacity=".55" font-size="11" font-family="var(--mono)">sin forma</text>' +
      "</svg>";
  }

  const frets = data.frets.slice();
  const positives = frets.filter((f) => f > 0);
  const minFret = positives.length ? Math.min.apply(null, positives) : 1;
  const baseFret = minFret <= 4 ? 1 : minFret;
  const top = baseFret > 1 ? T + 4 : T;

  let svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + escapeXml(name) + '">';

  // Cejilla / cejilla superior
  if (baseFret === 1) {
    svg += '<rect x="' + L + '" y="' + top + '" width="' + (W - L - R) + '" height="3.2" rx="1.4" fill="' + stroke + '"/>';
  } else {
    svg += '<line x1="' + L + '" y1="' + top + '" x2="' + (W - R) + '" y2="' + top + '" stroke="' + stroke + '" stroke-width="1" opacity=".45"/>';
    svg += '<text x="' + (L - 4) + '" y="' + (top + FRET_H * 0.7) + '" text-anchor="end" font-size="9" font-family="var(--mono)" fill="' + stroke + '" opacity=".8">' + baseFret + "fr</text>";
  }

  // Trastes horizontales
  for (let f = 0; f <= 5; f++) {
    const y = top + f * FRET_H;
    svg += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" stroke="' + stroke + '" stroke-width="1" opacity="' + (f === 0 ? ".55" : ".35") + '"/>';
  }

  // Cuerdas verticales
  for (let s = 0; s < 6; s++) {
    const x = L + s * STRING_GAP;
    svg += '<line x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + (top + 5 * FRET_H) + '" stroke="' + stroke + '" stroke-width="1" opacity=".5"/>';
  }

  // Cejillas
  (data.barres || []).forEach((barre) => {
    const y = top + (barre.fret - baseFret + 0.5) * FRET_H;
    const x1 = L + barre.from * STRING_GAP;
    const x2 = L + barre.to * STRING_GAP;
    svg += '<rect x="' + (x1 - 3.2) + '" y="' + (y - 3.2) + '" width="' + (x2 - x1 + 6.4) + '" height="6.4" rx="3.2" fill="var(--accent)"/>';
  });

  // Puntos
  frets.forEach((fret, s) => {
    const x = L + s * STRING_GAP;
    if (fret === -1) {
      svg += '<path d="M' + (x - 3) + " " + (top - 10) + "l6 6M" + (x + 3) + " " + (top - 10) + 'l-6 6" stroke="' + stroke + '" stroke-width="1.3" opacity=".65" stroke-linecap="round"/>';
    } else if (fret === 0) {
      svg += '<circle cx="' + x + '" cy="' + (top - 7) + '" r="3" fill="none" stroke="' + stroke + '" stroke-width="1.2" opacity=".75"/>';
    } else if (fret >= baseFret && fret <= baseFret + 4) {
      const y = top + (fret - baseFret + 0.5) * FRET_H;
      svg += '<circle cx="' + x + '" cy="' + y + '" r="4.4" fill="var(--accent)"/>';
    }
  });

  svg += "</svg>";
  return svg;
}

function escapeXml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
