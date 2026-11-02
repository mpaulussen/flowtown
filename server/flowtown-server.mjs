// Flowtown-Server: Ebene „Wir“, KI-Einschätzung über Mistral, Meldungen, Verkehrslage. Ohne Abhängigkeiten, Node 18 oder neuer.
// Gespeichert werden nur zusammengefasste Werte je Ampel, Richtung und Zeitfenster, nie Fahrten, Orte oder Uhrzeiten.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), 'data');
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://mpaulussen.github.io').split(',').map((s) => s.trim()).filter(Boolean);
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';
const MISTRAL_URL = process.env.MISTRAL_URL || 'https://api.mistral.ai/v1/chat/completions';
const K_MIN = Number(process.env.K_MIN || 5);          // ein Wert erscheint erst ab so vielen verschiedenen Beitragenden
const KI_PER_DAY = Number(process.env.KI_PER_DAY || 20); // KI-Anfragen je IP und Tag
const SALT = process.env.SALT || 'bitte-in-der-env-datei-setzen';
const WINDOWS = ['wd-morning', 'wd-day', 'wd-evening', 'night', 'weekend'];

fs.mkdirSync(DATA_DIR, { recursive: true });
const AGG_FILE = path.join(DATA_DIR, 'wir.json');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

// ---------- Ebene „Wir“ ----------
// Schlüssel: Ampel|Richtung (0–7, -1 unbekannt)|Zeitfenster → Besuche, Halte, Summe Wartezeit, gehashte Beitragende (höchstens 20)
const agg = readJson(AGG_FILE, {});
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  const tmp = AGG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(agg));
  fs.renameSync(tmp, AGG_FILE);
}, 10000).unref();

const hashCid = (cid) => crypto.createHash('sha256').update(SALT + '|' + cid).digest('base64url').slice(0, 16);

function addWir(body) {
  if (!body || typeof body.cid !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(body.cid)) throw new Error('cid');
  if (!Array.isArray(body.items) || body.items.length > 300) throw new Error('items');
  const who = hashCid(body.cid);
  let n = 0;
  for (const it of body.items) {
    if (!it || typeof it.s !== 'string' || !/^c\d{1,13}$/.test(it.s)) continue;
    const d = Number.isInteger(it.d) && it.d >= -1 && it.d <= 7 ? it.d : -1;
    if (!WINDOWS.includes(it.w)) continue;
    const wait = Number(it.wait);
    if (!(wait >= 0 && wait <= 3600000)) continue;
    const k = `${it.s}|${d}|${it.w}`;
    const a = agg[k] || (agg[k] = { v: 0, h: 0, w: 0, c: [] });
    a.v += 1;
    if (it.halt) { a.h += 1; a.w += Math.round(wait); }
    if (!a.c.includes(who) && a.c.length < 20) a.c.push(who);
    n++;
  }
  dirty = dirty || n > 0;
  return n;
}
function readWir(ids) {
  const want = new Set(ids);
  const out = {};
  for (const k of Object.keys(agg)) {
    const a = agg[k];
    if (!want.has(k.split('|')[0]) || a.c.length < K_MIN) continue;
    out[k] = { n: a.c.length, v: a.v, h: a.h, avg: a.h ? Math.round(a.w / a.h) : 0 };
  }
  return out;
}

// ---------- KI-Einschätzung (Mistral) ----------
const SYSTEM = `Du bist der Mobilitäts-Coach der App Flowtown aus Bielefeld. Du bekommst die zusammengefassten Werte
einer Person aus den letzten 30 Tagen (JSON). Unter "app_hinweise" steht, was die App selbst schon erkannt hat,
unter "moegliche_ersparnisse" hat die App bereits ausgerechnet, was Änderungen bringen würden.

Deine Aufgabe: Wähle die ein bis drei Punkte, die für diese Person am meisten bringen, und sag ihr konkret, was sie tun kann.

Harte Regeln:
- Rechne nicht selbst. Zahlen zu Ersparnissen ("pro Woche", "je Fahrt") nimmst du nur aus "moegliche_ersparnisse".
  Andere Zahlen übernimmst du genau so, wie sie in den Daten stehen.
- Jede Empfehlung nennt einen Ort, Weg oder eine Uhrzeit aus den Daten und mindestens eine Zahl aus den Daten.
- Ampeln und Wege nennst du genau so, wie sie in den Daten heißen (Felder "ampel", "von", "nach"), ohne sie abzukürzen,
  damit die App sie auf der Karte zeigen kann.
- Beachte "sicherheit": Bei "niedrig" schreibst du ausdrücklich "erster Eindruck" und rätst, die Strecke öfter aufzuzeichnen.
- Die Rad-Schätzung enthält keine Ampeln ("rad_ampeln_unbekannt"). Behaupte nie, dass man mit dem Rad Wartezeit an Ampeln spart.
- Eine schlechte Bewertung einer Ampel empfiehlst du nur, wenn sie mindestens dreimal gehalten wurde oder Werte anderer
  Personen zeigen, dass dort alle lange warten.
- Uhrzeiten und Tageszeiten nennst du nur, wenn sie wörtlich in den Daten stehen. Erfinde keine Orte, Zeiten oder Zahlen.
- Keine allgemeinen Ratschläge, die auf jeden passen würden ("vorausschauend fahren", "Stoßzeiten meiden"),
  ohne Ort und Zahl aus den Daten.
- Ist ein Profil zur Barrierefreiheit gesetzt, achte besonders auf Wege zu Fuß, Umstiege und Grünzeiten.
- Nichts empfehlen, wofür man das Handy während der Fahrt braucht.
Wenn die Daten insgesamt dünn sind, sag das in der Einschätzung offen und nenne, welche Fahrten noch fehlen.

Schreibe Deutsch, duze, kurze Sätze, freundlich und direkt.

Antworte nur mit JSON:
{"einschaetzung": "2 bis 3 Sätze mit dem wichtigsten Befund und einer Zahl aus den Daten",
 "groesster_hebel": "1 Satz: die eine Änderung, die laut moegliche_ersparnisse oder zeitfresser am meisten bringt",
 "empfehlungen": [{"titel": "kurz, mit Ort oder Uhrzeit", "text": "1 bis 2 Sätze mit Zahl und konkreter Handlung"}]}`;

// Tageslimit je IP, getrennt nach Zweck
function limiter(max) {
  const count = new Map();   // IP → { day, n }
  return (ip) => {
    const day = new Date().toISOString().slice(0, 10);
    const e = count.get(ip);
    if (!e || e.day !== day) { count.set(ip, { day, n: 1 }); return true; }
    if (e.n >= max) return false;
    e.n += 1;
    return true;
  };
}
const kiAllowed = limiter(KI_PER_DAY);
async function askMistral(facts) {
  if (!MISTRAL_KEY) throw Object.assign(new Error('Kein MISTRAL_API_KEY gesetzt'), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(MISTRAL_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_KEY}` },
      body: JSON.stringify({
        model: MISTRAL_MODEL, temperature: 0.2, max_tokens: 1000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(facts) }]
      })
    });
    if (!res.ok) throw Object.assign(new Error('Mistral antwortet mit ' + res.status), { status: 502 });
    const j = await res.json();
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    const parsed = JSON.parse(txt);
    const clean = (s, n) => String(s || '').slice(0, n);
    return {
      einschaetzung: clean(parsed.einschaetzung, 800),
      groesster_hebel: clean(parsed.groesster_hebel, 300),
      empfehlungen: (Array.isArray(parsed.empfehlungen) ? parsed.empfehlungen : []).slice(0, 3).map((e) => ({ titel: clean(e.titel, 80), text: clean(e.text, 400) })),
      modell: MISTRAL_MODEL
    };
  } finally { clearTimeout(timer); }
}

// ---------- Meldungen ----------
// data/news.json pflegst du selbst: [{ "id", "titel", "text", "quelle", "lat", "lon", "radius_m", "von", "bis" }]
function readNews() {
  const today = new Date().toISOString().slice(0, 10);
  return readJson(NEWS_FILE, []).filter((n) => n && n.titel && (!n.von || n.von <= today) && (!n.bis || n.bis >= today));
}

// ---------- Verkehrslage vor der Fahrt ----------
// Geholt wird höchstens alle LAGE_MIN Minuten und nur, wenn jemand fragt, immer für das ganze Gebiet.
// Jede App bekommt dasselbe Gesamtbild und prüft auf dem Gerät, was ihre Wege betrifft. Der Server erfährt keine Wege.
const HERE_KEY = process.env.HERE_API_KEY || '';
const HERE_URL = process.env.HERE_URL || 'https://data.traffic.hereapi.com/v7';
const AUTOBAHN_URL = process.env.AUTOBAHN_URL || 'https://verkehr.autobahn.de/o/autobahn';
const LAGE_BBOX = (process.env.LAGE_BBOX || '8.38,51.90,8.70,52.12').split(',').map(Number);   // West, Süd, Ost, Nord: Bielefeld
const LAGE_ROADS = (process.env.LAGE_ROADS || 'A2,A33').split(',').map((s) => s.trim()).filter((s) => /^[A-Z]\d{1,4}$/.test(s));
const LAGE_MIN = Number(process.env.LAGE_MIN || 5);

async function getJson(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': 'Flowtown/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const inBox = (lat, lon, m) => lon >= LAGE_BBOX[0] - m && lon <= LAGE_BBOX[2] + m && lat >= LAGE_BBOX[1] - m && lat <= LAGE_BBOX[3] + m;
// höchstens 24 Punkte je Abschnitt, erster und letzter bleiben
function thin(pts) {
  const ok = pts.filter((p) => isFinite(p[0]) && isFinite(p[1])).map((p) => [r5(p[0]), r5(p[1])]);
  if (ok.length <= 24) return ok;
  const step = (ok.length - 1) / 23;
  return Array.from({ length: 24 }, (_, i) => ok[Math.round(i * step)]);
}
const herePts = (loc) => thin([].concat(...((loc && loc.shape && loc.shape.links) || []).map((l) => (l.points || []).map((q) => [q.lat, q.lng]))));
// Straßenstücke einer Meldung einzeln lassen: nur aneinanderhängende Abschnitte zu einer Linie verbinden,
// sonst zeichnet die Karte Querlinien (etwa zwischen beiden Fahrtrichtungen)
function hereSegs(loc) {
  const links = ((loc && loc.shape && loc.shape.links) || []).map((l) => (l.points || []).map((q) => [q.lat, q.lng])).filter((l) => l.length > 1);
  const touch = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 68500) < 25;
  const chains = [];
  for (const l of links) {
    const last = chains[chains.length - 1];
    if (last && touch(last[last.length - 1], l[0])) last.push(...l.slice(1)); else chains.push(l.slice());
  }
  return chains.length > 1 ? chains.map(thin) : undefined;
}
const kmh = (ms) => Math.round(ms * 3.6);
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// HERE Verkehrsfluss: nur Abschnitte, auf denen es hakt (Jam-Faktor ab 4 von 10), Richtung zählt
async function hereFlow() {
  const j = await getJson(`${HERE_URL}/flow?in=bbox:${LAGE_BBOX.join(',')}&locationReferencing=shape&minJamFactor=4&apiKey=${encodeURIComponent(HERE_KEY)}`);
  const out = [];
  for (const r of j.results || []) {
    const cf = r.currentFlow || {}, loc = r.location || {};
    const pts = herePts(loc);
    if (pts.length < 2) continue;
    const len = Number(loc.length) || 0;
    const spd = Number(cf.speedUncapped != null ? cf.speedUncapped : cf.speed), ff = Number(cf.freeFlow);
    const closed = cf.traversability === 'closed';
    const delay = !closed && spd > 0.3 && ff > spd ? Math.round(len / spd - len / ff) : null;
    if (!closed && (delay == null || delay < 10)) continue;   // kurze Abschnitte mit wenigen Sekunden Verlust sind Rauschen
    out.push({
      id: 'hf' + crypto.createHash('sha1').update(JSON.stringify(pts[0]) + JSON.stringify(pts[pts.length - 1])).digest('hex').slice(0, 10),
      quelle: 'HERE', richtung: true, art: closed ? 'sperrung' : cf.jamFactor >= 8 ? 'stau' : 'zaeh', richtung: true,
      titel: clip(loc.description || 'Straße', 60), text: closed ? 'gesperrt' : `Ø ${kmh(spd)} km/h statt ${kmh(ff)} km/h`, delay, pts, segs: hereSegs(loc), fluss: true
    });
  }
  return out;
}
const HERE_ART = { accident: 'unfall', congestion: 'stau', construction: 'baustelle', roadClosure: 'sperrung', laneRestriction: 'baustelle', disabledVehicle: 'warnung', roadHazard: 'warnung', plannedEvent: 'warnung', weather: 'warnung', massTransit: 'warnung', other: 'warnung' };
async function hereIncidents(box) {
  const j = await getJson(`${HERE_URL}/incidents?in=bbox:${(box || LAGE_BBOX).map((x) => x.toFixed(4)).join(',')}&locationReferencing=shape&lang=de-DE&apiKey=${encodeURIComponent(HERE_KEY)}`);
  const out = [];
  for (const r of j.results || []) {
    const d = r.incidentDetails || {}, loc = r.location || {};
    const pts = herePts(loc);
    if (!pts.length) continue;
    const sum = d.summary && d.summary.value, desc = d.description && d.description.value;
    out.push({
      id: 'hi' + String(d.id || d.originalId || out.length).slice(-16), quelle: 'HERE', richtung: pts.length > 1,
      art: d.roadClosed ? 'sperrung' : HERE_ART[d.type] || 'warnung',
      titel: clip(loc.description || sum || 'Meldung', 60), text: clip(desc || sum || '', 220), bis: d.endTime || null, pts, segs: hereSegs(loc)
    });
  }
  return out;
}
// Autobahn GmbH des Bundes: Warnungen, Sperrungen, Baustellen auf den Autobahnen rund um Bielefeld (offen, ohne Schlüssel)
const AB_SVC = { warning: 'warnung', closure: 'sperrung', roadworks: 'baustelle' };
// je Autobahn höchstens alle LAGE_MIN Minuten abrufen; gilt für die Stadtlage und für Strecken
const abCache = new Map();   // Straße → { t, items, run }
async function abRoad(road) {
  const c = abCache.get(road);
  if (c && Date.now() - c.t < LAGE_MIN * 60000) return c.items;
  if (c && c.run) return c.run;
  const run = (async () => {
    const done = await Promise.allSettled(Object.keys(AB_SVC).map((svc) => getJson(`${AUTOBAHN_URL}/${road}/services/${svc}`).then((j) => ({ svc, list: j[svc] || [] }))));
    if (done.every((r) => r.status === 'rejected')) throw new Error('nicht erreichbar: ' + done[0].reason.message);
    const out = [];
    for (const res of done) {
      if (res.status !== 'fulfilled') continue;
      for (const x of res.value.list) {
        if (!x || x.future || x.display_type === 'WEIGHT_LIMIT_35') continue;
        const lat = Number(x.coordinate && x.coordinate.lat), lon = Number(x.coordinate && x.coordinate.long);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        const geo = x.geometry && x.geometry.type === 'LineString' && Array.isArray(x.geometry.coordinates) ? x.geometry.coordinates.map((g) => [g[1], g[0]]) : [];
        const pts = thin(geo.length ? geo : [[lat, lon]]);
        let art = AB_SVC[res.value.svc];
        if (art === 'warnung' && /STATIONARY|QUEUING|SLOW/.test(x.abnormalTrafficType || '')) art = 'stau';
        const lines = (x.description || []).map(String).filter((t) => t.trim() && !/^(Beginn|Ende):/.test(t));
        const delay = Number(x.delayTimeValue) > 0 ? Number(x.delayTimeValue) * 60 : null;
        out.push({
          id: 'ab' + String(x.identifier || '').slice(-16), quelle: 'Autobahn GmbH', art,
          titel: clip(x.title || road, 60), richtungText: clip(x.subtitle || '', 60), text: clip(lines.join(' '), 220), delay, pts
        });
      }
    }
    abCache.set(road, { t: Date.now(), items: out });
    return out;
  })();
  abCache.set(road, Object.assign({}, c || { t: 0, items: [] }, { run }));
  try { return await run; } catch (e) { if (c && c.items.length && Date.now() - c.t < 30 * 60000) { abCache.set(road, c); return c.items; } abCache.delete(road); throw e; }
}
async function autobahn() {
  const done = await Promise.allSettled(LAGE_ROADS.map(abRoad));
  if (done.length && done.every((r) => r.status === 'rejected')) throw new Error(done[0].reason.message);
  return [].concat(...done.filter((r) => r.status === 'fulfilled').map((r) => r.value)).filter((it) => it.pts.some((q) => inBox(q[0], q[1], 0.05)));
}

const lage = { here: { items: [], t: 0 }, autobahn: { items: [], t: 0 } };
let lageAt = 0, lageRun = null;
async function refreshLage() {
  const jobs = { autobahn: autobahn() };
  if (HERE_KEY) jobs.here = Promise.all([hereFlow(), hereIncidents()]).then(([a, b]) => a.concat(b));
  for (const [name, job] of Object.entries(jobs)) {
    try { lage[name] = { items: await job, t: Date.now() }; }
    catch (e) { console.error(new Date().toISOString(), 'Lage', name, e.message); }   // ältere Werte bleiben bis 30 Minuten stehen
  }
  lageAt = Date.now();
}
async function readLage() {
  if (Date.now() - lageAt > LAGE_MIN * 60000) {
    lageRun = lageRun || refreshLage().finally(() => { lageRun = null; });
    await lageRun;
  }
  const fresh = Object.entries(lage).filter(([, v]) => v.t && Date.now() - v.t < 30 * 60000);
  return {
    t: Math.min(...fresh.map(([, v]) => v.t).concat(lageAt || Date.now())),
    quellen: fresh.map(([k, v]) => ({ name: k === 'here' ? 'HERE' : 'Autobahn GmbH', t: v.t })),
    items: [].concat(...fresh.map(([, v]) => v.items))
  };
}

// ---------- Bus und Bahn: Umleitungen von moBiel ----------
// Liest die öffentliche Seite „Neueste Umleitungen“ höchstens alle MOBIEL_MIN Minuten, nur wenn jemand fragt.
// Weitergegeben werden Titel, Linien, Zeitraum, der erste Satz und der Link zu moBiel. Die App filtert auf dem Gerät nach den eigenen Linien.
const MOBIEL_URL = process.env.MOBIEL_URL || 'https://www.mobiel.de/aktuelles/neueste-umleitungen/';
const MOBIEL_MIN = Number(process.env.MOBIEL_MIN || 15);
let mobiel = { t: 0, items: [] }, mobielRun = null, mobielTry = 0;
const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const deText = (x) => String(x || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’').replace(/&raquo;/g, '»').replace(/&laquo;/g, '«').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
// „Linien 31, 64 und N1“, „NachtBus-Linie N4“, „Linie 1:“ → ['31', '64', 'N1']
function mobielLinien(txt) {
  const out = [];
  for (const m of txt.matchAll(/Linie[n]?\s+((?:N\s?\d{1,2}|\d{1,3})(?:\s*(?:,|und|&|sowie)\s*(?:N\s?\d{1,2}|\d{1,3})(?![.\d]))*)/g)) {
    for (const l of m[1].match(/N\s?\d{1,2}|\d{1,3}/g)) { const v = l.replace(/\s/g, ''); if (!out.includes(v)) out.push(v); }
  }
  return out;
}
// Zeitraum aus dem Text: „Von Montag, 2. November bis Mittwoch, 18. November 2026“, „Ab sofort bis …“, „Am Dienstag, 3. November 2026“, „14.10. bis 1.11.2026“
function mobielZeit(txt, heute) {
  const found = [];
  for (const m of txt.matchAll(/(\d{1,2})\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?/gi)) found.push({ i: m.index, d: +m[1], mo: MONATE.indexOf(m[2].toLowerCase()), y: m[3] ? +m[3] : null });
  for (const m of txt.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4})?(?![\d])/g)) found.push({ i: m.index, d: +m[1], mo: +m[2] - 1, y: m[3] ? +m[3] : null });
  found.sort((a, b) => a.i - b.i);
  const bisAt = txt.search(/\bbis\b(?!\s+auf\s+Weiteres)/i);
  let von = null, bis = null;
  for (const f of found) {
    if (bisAt >= 0 && f.i > bisAt) { if (!bis) bis = f; } else if (!von) von = f;
  }
  if (!von && /ab sofort/i.test(txt)) von = { d: heute.getDate(), mo: heute.getMonth(), y: heute.getFullYear() };
  // „bis vsl. November“: Ende des Monats
  const nurMonat = !bis && bisAt >= 0 && txt.slice(bisAt).match(/^bis\s+(?:vsl\.\s*|voraussichtlich\s+)?(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?/i);
  if (nurMonat) { const mo = MONATE.indexOf(nurMonat[1].toLowerCase()); bis = { d: new Date(nurMonat[2] ? +nurMonat[2] : heute.getFullYear(), mo + 1, 0).getDate(), mo, y: nurMonat[2] ? +nurMonat[2] : null }; }
  const jahr = (bis && bis.y) || (von && von.y) || heute.getFullYear();
  const iso = (f) => (f ? `${f.y || jahr}-${String(f.mo + 1).padStart(2, '0')}-${String(f.d).padStart(2, '0')}` : null);
  if (von && !von.y && bis && (von.mo > bis.mo || (von.mo === bis.mo && von.d > bis.d))) von.y = jahr - 1;
  let v = iso(von), b = iso(bis);
  // „Am 3. November“, „Für Samstag, 31. Oktober“: ein einzelner Tag; „Ab Montag, …“ dagegen ohne Ende
  if (v && !b && bisAt < 0 && !/\bab\s+(?:sofort|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\d)|bis auf Weiteres/i.test(txt)) b = v;
  return { von: v, bis: b, offen: /bis auf Weiteres/i.test(txt) };
}
function parseMobiel(html, heute) {
  const items = [];
  for (const box of html.split(/<div class="contentbox[^"]*">/).slice(1)) {
    const h = box.match(/<h3>\s*<a href="([^"]+)">\s*<span>([\s\S]*?)<\/span>\s*(?:<div class="subheadline">([\s\S]*?)<\/div>)?/);
    if (!h) continue;
    const link = new URL(h[1], MOBIEL_URL).href;
    if (!/neueste-umleitungen\//.test(link)) continue;
    const titel = deText(h[2]), sub = deText(h[3]);
    const body = box.split(/<p class="text-right">/)[0];
    const ps = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => deText(m[1])).filter(Boolean);
    const text = ps.join(' ');
    const z = mobielZeit(`${sub} ${text}`, heute);
    const vorbei = /aufgehoben|beendet|wieder (?:ihren|den) regul/i.test(text) || (z.bis && !z.offen && z.bis < heute.toISOString().slice(0, 10));
    items.push({
      id: 'mb' + crypto.createHash('sha1').update(link).digest('hex').slice(0, 10), quelle: 'moBiel',
      titel: clip(titel, 90), linien: mobielLinien(`${titel} ${sub} ${text}`), von: z.von, bis: z.offen ? null : z.bis, offen: z.offen,
      vorbei: !!vorbei, bahn: /StadtBahn|Linie [1-4](?!\d)\b/.test(`${titel} ${sub}`) && !/StadtBahn fährt regulär/i.test(text),
      text: clip(ps[0] || '', 240), link
    });
  }
  return items;
}
async function refreshMobiel() {
  mobielTry = Date.now();
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(MOBIEL_URL, { signal: ctrl.signal, headers: { 'User-Agent': 'Flowtown-Prototyp (info@barrierefrai.com)', Accept: 'text/html' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const items = parseMobiel(await res.text(), new Date());
    if (items.length) mobiel = { t: Date.now(), items };   // leere Liste: Seite umgebaut? Dann die letzte gute behalten
  } catch (e) { console.error('moBiel:', e.message); } finally { clearTimeout(timer); }
}
async function readMobiel() {
  if (Date.now() - mobielTry > MOBIEL_MIN * 60000) {
    mobielRun = mobielRun || refreshMobiel().finally(() => { mobielRun = null; });
    await mobielRun;
  }
  return { t: mobiel.t || null, quelle: 'moBiel', seite: MOBIEL_URL, items: Date.now() - mobiel.t < 24 * 3600e3 ? mobiel.items : [] };
}

// ---------- Bus und Bahn: Fahrplan aus dem DELFI-Datensatz ----------
// Einmal pro Woche, nachts: deutschlandweite GTFS-Datei laden (etwa 550 MB), mit Python nur moBiel herausziehen
// (fahrplan-bielefeld.py), ZIP wieder löschen. Die App lädt den ganzen Auszug (gepackt etwa 150 KB) und rechnet
// Abfahrten auf dem Handy: Der Server erfährt weder Haltestelle noch Linie.
const DELFI_URL = process.env.DELFI_GTFS_URL || '';
const FAHRPLAN_AGENCY = process.env.FAHRPLAN_AGENCY || 'moBiel';
const FAHRPLAN_FILE = path.join(DATA_DIR, 'fahrplan.json');
let fahrplan = null, fahrplanRun = null;   // { stand, gilt, json (gzip), etag }
function loadFahrplan() {
  try {
    const raw = fs.readFileSync(FAHRPLAN_FILE);
    const d = JSON.parse(raw);
    fahrplan = { stand: d.stand, gilt: d.gilt, gz: zlib.gzipSync(raw, { level: 9 }), raw, etag: '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"', t: fs.statSync(FAHRPLAN_FILE).mtimeMs };
  } catch (e) { if (e.code !== 'ENOENT') console.error('Fahrplan:', e.message); }
}
async function refreshFahrplan() {
  if (!DELFI_URL) throw new Error('DELFI_GTFS_URL fehlt in /etc/flowtown.env');
  const zip = path.join(DATA_DIR, 'delfi-gtfs.zip');
  try {
    const res = await fetch(DELFI_URL, { headers: { 'User-Agent': 'Flowtown-Prototyp (info@barrierefrai.com)' } });
    if (!res.ok || !/zip|octet/.test(res.headers.get('content-type') || '')) throw new Error('Download: HTTP ' + res.status + ' ' + (res.headers.get('content-type') || ''));
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
    const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'fahrplan-bielefeld.py');
    const out = await new Promise((resolve, reject) => {
      const p = spawn('python3', [script, zip, FAHRPLAN_FILE, FAHRPLAN_AGENCY]);
      let log = '';
      p.stdout.on('data', (c) => { log += c; }); p.stderr.on('data', (c) => { log += c; });
      p.on('error', (e) => reject(new Error('python3 nicht gefunden: ' + e.message)));
      p.on('close', (code) => (code === 0 ? resolve(log.trim()) : reject(new Error('Auszug: ' + log.trim().slice(-300)))));
    });
    loadFahrplan();
    return out;
  } finally { fs.rmSync(zip, { force: true }); }
}
// stündlich prüfen: fehlt der Fahrplan oder ist er älter als 7 Tage, nachts zwischen 3 und 5 Uhr neu holen
function fahrplanTick() {
  if (!DELFI_URL || fahrplanRun) return;
  const age = fahrplan ? Date.now() - fahrplan.t : Infinity, h = new Date().getHours();
  if (age === Infinity || (age > 7 * 864e5 && h >= 3 && h < 5)) {
    fahrplanRun = refreshFahrplan().then((m) => console.log('Fahrplan:', m)).catch((e) => console.error('Fahrplan:', e.message)).finally(() => { fahrplanRun = null; });
  }
}
function sendFahrplan(req, res, origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: fahrplan.etag, Vary: 'Origin, Accept-Encoding' };
  if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'ETag' });
  if (req.headers['if-none-match'] === fahrplan.etag) { res.writeHead(304, h); return res.end(); }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gz) h['Content-Encoding'] = 'gzip';
  res.writeHead(200, h);
  res.end(gz ? fahrplan.gz : fahrplan.raw);
}

// ---------- Ziel prüfen: Strecke mit Verkehr, Meldungen entlang der Strecke, beste Abfahrt ----------
// Nur auf Knopfdruck. Der Start kommt auf etwa 1 km gerundet an, gespeichert wird nichts außer einem kurzen Zwischenspeicher.
const ROUTER_URL = process.env.HERE_ROUTER_URL || 'https://router.hereapi.com/v8/routes';
const GEOCODE_URL = process.env.HERE_GEOCODE_URL || 'https://geocode.search.hereapi.com/v1/geocode';
const REVGEO_URL = process.env.HERE_REVGEO_URL || 'https://revgeocode.search.hereapi.com/v1/revgeocode';
const ZIEL_PER_DAY = Number(process.env.ZIEL_PER_DAY || 40);
const zielAllowed = limiter(ZIEL_PER_DAY), ortAllowed = limiter(ZIEL_PER_DAY);

// HEREs „Flexible Polyline“ entpacken (ohne Bibliothek, mit Gleitkomma statt Bitoperationen, damit große Werte stimmen)
const FP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function decodeFlex(str) {
  let i = 0;
  const next = () => {
    let res = 0, mul = 1, v;
    do {
      v = FP.indexOf(str[i++]);
      if (v < 0) throw new Error('polyline');
      res += (v & 31) * mul; mul *= 32;
    } while (v & 32);
    return res;
  };
  const signed = (u) => (u % 2 ? -(u + 1) / 2 : u / 2);
  if (next() !== 1) throw new Error('polyline version');
  const head = next(), prec = 10 ** (head % 16), third = Math.floor(head / 16) % 8;
  const out = [];
  let lat = 0, lon = 0;
  while (i < str.length) {
    lat += signed(next()); lon += signed(next());
    if (third) next();
    out.push([lat / prec, lon / prec]);
  }
  return out;
}
// Geometrie in Metern (flache Näherung je Punkt)
const R = Math.PI / 180;
function segDist(p, a, b) {
  const kx = 111320 * Math.cos(p[0] * R), ky = 110540;
  const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + u * dx, ay + u * dy);
}
const brg = (a, b) => (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * R), b[0] - a[0]) / R + 360) % 360;
const angGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// nächster Abschnitt der Strecke zu einem Punkt: Abstand und Fahrtrichtung dort
function nearRoute(p, route) {
  let best = { d: Infinity, h: 0, i: 0 };
  for (let k = 0; k < route.length - 1; k++) {
    const d = segDist(p, route[k], route[k + 1]);
    if (d < best.d) best = { d, h: brg(route[k], route[k + 1]), i: k };
  }
  return best;
}
// Liegt eine Meldung auf der Strecke, und zwar in Fahrtrichtung? Eng gefasst, damit Nebenstraßen und Auffahrten draußen bleiben.
function onRoute(it, route, tol) {
  const near = it.pts.map((q) => Object.assign({ q }, nearRoute(q, route))).filter((m) => m.d <= tol);
  if (!near.length || (it.pts.length > 1 && near.length < Math.min(2, it.pts.length))) return null;
  if (near.length >= 2) {
    const a = near[0].q, b = near[near.length - 1].q;
    if ((Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) > 0.0002 && angGap(brg(a, b), near[0].h) > 45) return null;   // Gegenrichtung oder Querstraße
  }
  return near[0].i;
}
// Strecke in Rechtecke von höchstens 0,9 Grad teilen (Grenze der Verkehrsabfrage)
function boxesAlong(route) {
  const boxes = [];
  let box = null;
  for (const p of route) {
    const nb = box ? [Math.min(box[0], p[1]), Math.min(box[1], p[0]), Math.max(box[2], p[1]), Math.max(box[3], p[0])] : [p[1], p[0], p[1], p[0]];
    if (box && (nb[2] - nb[0] > 0.9 || nb[3] - nb[1] > 0.9)) { boxes.push(box); box = [p[1], p[0], p[1], p[0]]; } else box = nb;
  }
  if (box) boxes.push(box);
  return boxes.map((b) => [b[0] - 0.01, b[1] - 0.01, b[2] + 0.01, b[3] + 0.01]);
}
const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : v.value || '');
// Strecke von HERE: Geometrie, Straßennummern und -namen je Abschnitt, Störungen, die auf genau dieser Strecke liegen
async function hereRoute(from, to, mode, opts) {
  const q = new URLSearchParams({ transportMode: mode === 'rad' ? 'bicycle' : mode === 'fuss' ? 'pedestrian' : 'car', origin: from.join(','), destination: to.join(','), apiKey: HERE_KEY });
  if (opts.full && mode === 'fuss') { q.set('return', 'summary,polyline'); q.set('spans', 'names'); q.set('lang', 'de-DE'); }
  else if (opts.full) { q.set('return', 'summary,polyline,typicalDuration,incidents'); q.set('spans', 'routeNumbers,names,incidents'); q.set('lang', 'de-DE'); if (mode !== 'rad') q.set('alternatives', '1'); }
  else q.set('return', 'summary');
  if (opts.at) q.set('departureTime', opts.at);
  const j = await getJson(`${ROUTER_URL}?${q}`, 12000);
  return (j.routes || []).map((r) => {
    const secs = r.sections || [];
    const sum = (k) => secs.reduce((a, x) => a + (Number(x.summary && x.summary[k]) || 0), 0);
    const pts = [], spans = [], roads = [];
    let incs = null;
    if (opts.full) {
      for (const x of secs) {
        const base = pts.length;
        const sp = x.polyline ? decodeFlex(x.polyline) : [];
        pts.push(...sp);
        for (const s of x.spans || []) {
          const num = (s.routeNumbers || []).map((n) => txt(n).replace(/\s+/g, '')).find(Boolean) || '';
          const name = (s.names || []).map(txt).find(Boolean) || '';
          spans.push({ i: base + (Number(s.offset) || 0), num, name, inc: Array.isArray(s.incidents) ? s.incidents : [] });
          if (num && !roads.includes(num)) roads.push(num);
        }
        if (Array.isArray(x.incidents)) {
          incs = incs || [];
          const spx = spans.filter((s) => s.i >= base);
          x.incidents.forEach((d, k) => {
            const mine = spx.filter((s) => s.inc.includes(k));
            const i0 = mine.length ? mine[0].i : null;
            const last = mine.length ? spans[spans.indexOf(mine[mine.length - 1]) + 1] : null;
            const i1 = last ? last.i : i0 != null ? Math.min(pts.length - 1, i0 + 1) : null;
            incs.push({ d, i0, i1 });
          });
        }
      }
    }
    return { dauer: sum('duration'), basis: sum('baseDuration') || sum('typicalDuration') || sum('duration'), m: sum('length'), pts, spans, roads, incs };
  });
}
// Ort zu einem Punkt (für „A2 bei Kamen“), einen Tag zwischengespeichert
const ortCache = new Map();
async function placeNear(p) {
  const key = p.map((x) => (Math.round(x * 50) / 50).toFixed(2)).join(',');
  const c = ortCache.get(key);
  if (c && Date.now() - c.t < 864e5) return c.v;
  let v = '';
  try {
    const jj = await getJson(`${REVGEO_URL}?${new URLSearchParams({ at: p.join(','), lang: 'de-DE', apiKey: HERE_KEY })}`, 6000);
    const a = (jj.items && jj.items[0] && jj.items[0].address) || {};
    v = a.city || a.county || '';
  } catch (e) { /* ohne Ortsnamen weiter */ }
  ortCache.set(key, { t: Date.now(), v });
  if (ortCache.size > 5000) ortCache.delete(ortCache.keys().next().value);
  return v;
}
// „A2 | AS Kamen-Zentrum (15) - AS Unna (16)“ → „A2 zwischen Kamen-Zentrum und Unna“
function abTitle(t) {
  const [road, rest] = String(t).split('|').map((s) => s.trim());
  if (!rest) return t;
  const ends = rest.split(/\s+-\s+/).map((s) => s.replace(/^(AS|AK|AD|Kreuz|Dreieck|Anschlussstelle)\s+/i, '').replace(/\s*\(\d+[a-z]?\)\s*$/i, '').trim());
  return ends.length === 2 ? `${road} zwischen ${ends[0]} und ${ends[1]}` : `${road} bei ${ends[0]}`;
}
const HERE_TYP = Object.assign({}, HERE_ART, { congestion: 'stau', accident: 'unfall' });
// Abfahrtszeiten: jetzt, dann volle und halbe Stunden ab einer Viertelstunde von jetzt
function slots(now) {
  const t = new Date(now + 15 * 60000);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() <= 30 && t.getMinutes() > 0 ? 30 : t.getMinutes() === 0 ? 0 : 60);
  return [0, 1, 2, 3].map((k) => new Date(t.getTime() + k * 30 * 60000));
}
const zielCache = new Map();   // kurzer Zwischenspeicher gegen Doppel-Tipps, 3 Minuten
async function checkZiel(from, to, mode) {
  const key = [from, to, mode].join('|');
  const hit = zielCache.get(key);
  if (hit && Date.now() - hit.t < 180000) return hit.v;
  const [main, ...alts] = await hereRoute(from, to, mode, { full: true });
  if (!main || main.pts.length < 2) throw Object.assign(new Error('Keine Strecke gefunden'), { status: 404 });
  const P = main.pts;
  const cum = [0];
  for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + segDist(P[k], P[k - 1], P[k - 1]));
  const roadAt = (i) => { let s = null; for (const x of main.spans) { if (x.i <= i) s = x; else break; } return s || {}; };
  const keep = (art) => (mode === 'fuss' ? ['sperrung', 'baustelle'].includes(art) : mode !== 'rad' || ['sperrung', 'baustelle', 'unfall'].includes(art));
  const items = [];
  // 1. Störungen, die HERE selbst der Strecke zuordnet
  if (main.incs) {
    main.incs.forEach(({ d, i0, i1 }, k) => {
      const art = d.roadClosed || d.type === 'roadClosure' ? 'sperrung' : HERE_TYP[d.type] || 'warnung';
      if (i0 == null || !keep(art)) return;
      items.push({ id: 'ri' + String(d.id || k).slice(-16), quelle: 'HERE', art, at: i0, text: clip(txt(d.description) || txt(d.summary), 220), bis: d.validUntil || d.endTime || null, pts: thin(P.slice(i0, Math.max(i0 + 1, i1) + 1)) });
    });
  }
  // 2. ohne Zuordnung von HERE: Störungen im Umkreis, eng auf die Strecke gelegt
  const jobs = main.incs ? [] : boxesAlong(P.filter((p, k) => k % 3 === 0)).map((b) => hereIncidents(b));
  const autobahns = mode === 'fuss' ? [] : main.roads.filter((r) => /^A\d{1,3}$/.test(r)).slice(0, 8);
  const nJobs = jobs.length;
  jobs.push(...autobahns.map(abRoad));
  const seen = new Set(items.map((x) => x.id));
  (await Promise.allSettled(jobs)).forEach((r, n) => {
    if (r.status !== 'fulfilled') return;
    for (const it of r.value) {
      if (seen.has(it.id) || !keep(it.art)) continue;
      const fromAb = n >= nJobs;
      if (fromAb && main.incs && !['sperrung', 'stau'].includes(it.art)) continue;   // Baustellen meldet HERE schon auf der Strecke
      const at = onRoute(it, P, fromAb && it.pts.length === 1 ? 60 : 30);
      if (at == null) continue;
      seen.add(it.id);
      items.push(Object.assign({}, it, { at, titel: fromAb ? abTitle(it.titel) : null }));
    }
  });
  // Straße und Ort benennen: „A2 bei Kamen“, sortiert nach Schwere und Lage
  const RANK = { sperrung: 0, stau: 1, unfall: 2, zaeh: 3, baustelle: 4, warnung: 5 };
  items.sort((a, b) => RANK[a.art] - RANK[b.art] || a.at - b.at);
  await Promise.all(items.slice(0, 8).map(async (it) => {
    if (it.titel) return;
    const rd = roadAt(it.at), town = await placeNear(P[it.at]);
    const road = rd.num || rd.name || '';
    it.titel = clip(road && town ? (rd.num ? `${road} bei ${town}` : `${road}, ${town}`) : road || town || it.text || 'Meldung', 60);
  }));
  for (const it of items) { if (!it.titel) it.titel = clip(roadAt(it.at).num || roadAt(it.at).name || it.text || 'Meldung', 60); it.km = Math.round(cum[it.at] / 1000); delete it.at; }
  // Abfahrtsleiste (nur Auto): jetzt plus vier Zeiten, mit HEREs Vorhersage
  let abfahrt = null;
  if (mode === 'auto') {
    const ts = slots(Date.now());
    const later = await Promise.allSettled(ts.map((t) => hereRoute(from, to, mode, { at: t.toISOString() })));
    abfahrt = [{ t: null, dauer: main.dauer }].concat(later.map((r, k) => (r.status === 'fulfilled' && r.value[0] ? { t: ts[k].toISOString(), dauer: r.value[0].dauer } : null)).filter(Boolean));
  }
  const alt = alts.find((a) => main.dauer - a.dauer >= 600);
  const v = {
    t: Date.now(), mode, dauer: main.dauer, basis: main.basis, km: Math.round(main.m / 100) / 10, strassen: main.roads.slice(0, 6),
    pts: thin2(main.pts, 160), items, abfahrt,
    alternative: alt ? { dauer: alt.dauer, strassen: alt.roads.filter((r) => !main.roads.includes(r)).slice(0, 3) } : null
  };
  zielCache.set(key, { t: Date.now(), v });
  if (zielCache.size > 200) zielCache.delete(zielCache.keys().next().value);
  return v;
}
// Bus und Bahn: Verbindungen über HERE Public Transit (deutschlandweit, mit Zügen), gleicher Schlüssel
const TRANSIT_URL = process.env.HERE_TRANSIT_URL || 'https://transit.router.hereapi.com/v8/routes';
const transitArt = (m) => (/Train$/.test(m) ? 'zug' : /^(lightRail|subway|tram|monorail|inclined|aerial)$/.test(m) ? 'bahn' : /bus/i.test(m) ? 'bus' : m === 'ferry' ? 'faehre' : 'zug');
async function hereTransit(from, to) {
  const q = new URLSearchParams({ origin: from.join(','), destination: to.join(','), alternatives: '5', lang: 'de-DE', return: 'travelSummary,polyline', apiKey: HERE_KEY });
  let j;
  try { j = await getJson(`${TRANSIT_URL}?${q}`, 12000); }
  catch (e) {
    if (/HTTP 40[13]/.test(e.message)) throw Object.assign(new Error('Die Verbindungssuche ist für den HERE-Schlüssel noch nicht freigeschaltet.'), { status: 503 });
    throw e;
  }
  const quellen = new Set();
  const list = (j.routes || []).map((r) => {
    const teile = (r.sections || []).map((sec) => {
      const dep = sec.departure || {}, arr = sec.arrival || {}, tr = sec.transport || {}, dp = dep.place || {}, ap = arr.place || {};
      for (const a of sec.attributions || []) if (a.text) quellen.add(clip(a.text, 120));
      // Fußwege mit Linie (für den Weg-Check), Haltestellen mit Lage (stufenlos laut Fahrplan)
      const pos = (pl) => (pl.location && isFinite(pl.location.lat) ? [r5(pl.location.lat), r5(pl.location.lng)] : undefined);
      if (sec.type === 'pedestrian') { let pts; try { pts = sec.polyline ? thin2(decodeFlex(sec.polyline), 80) : undefined; } catch (e) { pts = undefined; } return { art: 'fuss', ab: dep.time, an: arr.time, pts }; }
      const delay = Number(dep.delay);
      return { art: transitArt(tr.mode || ''), linie: clip(tr.name || tr.shortName || tr.category || '', 20), ziel: clip(tr.headsign || '', 40),
        von: clip(dp.name || '', 50), vonPos: pos(dp), ab: dep.time, nach: clip(ap.name || '', 50), nachPos: pos(ap), an: arr.time, gleis: dp.platform ? clip(dp.platform, 8) : undefined,
        plus: delay >= 60 ? Math.round(delay / 60) : undefined };
    }).filter((x) => x.ab && x.an);
    const fahrt = teile.filter((x) => x.art !== 'fuss');
    return fahrt.length ? { ab: teile[0].ab, an: teile[teile.length - 1].an, umstiege: fahrt.length - 1, teile } : null;
  }).filter(Boolean);
  return { list, quellen: [...quellen].slice(0, 4) };
}
async function checkZielOepnv(from, to) {
  const key = [from, to, 'oepnv'].join('|');
  const hit = zielCache.get(key);
  if (hit && Date.now() - hit.t < 180000) return hit.v;
  const { list, quellen } = await hereTransit(from, to);
  const seen = new Set(), verbindungen = list.filter((c) => { const k = c.ab + c.an + c.teile.length; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Date.parse(a.ab) - Date.parse(b.ab)).slice(0, 6);
  if (!verbindungen.length) throw Object.assign(new Error('Keine Verbindung gefunden'), { status: 404 });
  const v = { t: Date.now(), mode: 'oepnv', verbindungen, quellen };
  zielCache.set(key, { t: Date.now(), v });
  if (zielCache.size > 200) zielCache.delete(zielCache.keys().next().value);
  return v;
}
function thin2(pts, n) {
  if (pts.length <= n) return pts.map((p) => [r5(p[0]), r5(p[1])]);
  const step = (pts.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, k) => pts[Math.round(k * step)]).map((p) => [r5(p[0]), r5(p[1])]);
}
// Ortssuche: Orte und Einrichtungen („Uni Bielefeld“, „Hauptbahnhof“) über HERE Discover, rund um Bielefeld gewichtet,
// dazu Adressen über HERE Geocode; doppelte Treffer an derselben Stelle fallen weg
const DISCOVER_URL = process.env.HERE_DISCOVER_URL || 'https://discover.search.hereapi.com/v1/discover';
const ORT_LAENDER = 'countryCode:DEU,NLD,BEL,LUX,FRA,CHE,AUT,DNK,POL,CZE';
const ORT_MITTE = [(LAGE_BBOX[1] + LAGE_BBOX[3]) / 2, (LAGE_BBOX[0] + LAGE_BBOX[2]) / 2].map((x) => x.toFixed(3)).join(',');
function ortItem(x) {
  const a = x.address || {};
  const place = x.resultType === 'place';
  const name = place ? x.title : a.street ? `${a.street}${a.houseNumber ? ' ' + a.houseNumber : ''}, ${a.city || ''}` : a.city || a.label || x.title;
  const what = place && x.categories && x.categories[0] ? x.categories[0].name : '';
  const where = place ? [a.street ? `${a.street}${a.houseNumber ? ' ' + a.houseNumber : ''}` : '', a.city] : [a.postalCode, a.city !== name ? a.city : '', a.state];
  return { name: clip(name, 50), sub: clip([what].concat(where, a.countryName !== 'Deutschland' ? a.countryName : '').filter(Boolean).join(' · '), 70), lat: r5(x.position.lat), lon: r5(x.position.lng) };
}
async function findOrt(q) {
  const [disc, geo] = await Promise.allSettled([
    getJson(`${DISCOVER_URL}?${new URLSearchParams({ q, at: ORT_MITTE, in: ORT_LAENDER, limit: '5', lang: 'de-DE', apiKey: HERE_KEY })}`),
    getJson(`${GEOCODE_URL}?${new URLSearchParams({ q, limit: '3', lang: 'de-DE', in: ORT_LAENDER, apiKey: HERE_KEY })}`)
  ]);
  if (disc.status === 'rejected' && geo.status === 'rejected') throw geo.reason;
  const all = [].concat(disc.status === 'fulfilled' ? disc.value.items || [] : [], geo.status === 'fulfilled' ? geo.value.items || [] : []);
  const seen = new Set(), out = [];
  for (const x of all) {
    if (!x.position) continue;
    const k = Math.round(x.position.lat * 500) + '|' + Math.round(x.position.lng * 500);   // etwa 200 m
    if (seen.has(k)) continue;
    seen.add(k); out.push(ortItem(x));
    if (out.length >= 5) break;
  }
  return out;
}
const coord = (s, digits) => {
  const v = String(s || '').split(',').map(Number);
  if (v.length !== 2 || !(Math.abs(v[0]) <= 90) || !(Math.abs(v[1]) <= 180)) throw Object.assign(new Error('Koordinaten'), { status: 400 });
  const f = 10 ** digits;
  return v.map((x) => Math.round(x * f) / f);
};

// ---------- Pilot: Fahrten von Testpersonen, pseudonym über einen Code ----------
// Codes vergibst du mit „node flowtown-server.mjs neue-codes 5“. Gespeichert wird nur ein Hash des Codes, nie ein Name.
// Je Code eine Datei mit den Fahrten; Start- und Zielorte enthalten sie nicht, Zielnamen werden entfernt.
const PILOT_FILE = path.join(DATA_DIR, 'pilot-codes.json');
const PILOT_DIR = path.join(DATA_DIR, 'pilot');
const PILOT_MAX_TRIPS = 3000;
const CODE_ABC = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const pilotAllowed = limiter(Number(process.env.PILOT_PER_DAY || 300));
const pilotHash = (code) => crypto.createHash('sha256').update(SALT + '|pilot|' + code).digest('hex');
const normCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
let pilotCodes = { t: 0, v: {} };
function knownCode(code) {
  const c = normCode(code);
  if (c.length !== 10 || !c.startsWith('FT')) return null;
  try {   // Datei bei Änderung neu lesen, damit neue Codes ohne Neustart gelten
    const m = fs.statSync(PILOT_FILE).mtimeMs;
    if (m !== pilotCodes.t) pilotCodes = { t: m, v: readJson(PILOT_FILE, {}) };
  } catch (e) { return null; }
  const h = pilotHash(c);
  return pilotCodes.v[h] ? h : null;
}
const pilotPath = (h) => path.join(PILOT_DIR, h.slice(0, 32) + '.json');
function readPilot(h) { return readJson(pilotPath(h), { trips: {} }); }
function writePilot(h, d) {
  fs.mkdirSync(PILOT_DIR, { recursive: true });
  const f = pilotPath(h), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d));
  fs.renameSync(tmp, f);
}
const TRIP_KEYS = ['id', 'mode', 'start', 'end', 'distance', 'events', 'gaps', 'cells', 'stats', 'legs', 'transfers', 'access', 'consumption', 'plan', 'fahrplan'];
const TRIP_MODES = new Set(['auto', 'rad', 'bus', 'bahn', 'zug', 'fuss']);
function cleanTrip(t) {
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || t.id.length > 40 || !TRIP_MODES.has(t.mode) || t.demo) return null;
  if (!Array.isArray(t.events) || t.events.length > 3000 || !(Number(t.start) > 0)) return null;
  const o = {};
  for (const k of TRIP_KEYS) if (t[k] !== undefined) o[k] = t[k];
  if (o.plan && typeof o.plan === 'object') {   // ohne Zielname und Ziel-Kennung
    const p = o.plan;
    o.plan = { dauer: p.dauer, basis: p.basis, km: p.km, t: p.t, rest: p.rest, meldungen: Array.isArray(p.meldungen) ? p.meldungen.slice(0, 5) : [] };
  }
  return JSON.stringify(o).length <= 400000 ? o : null;
}
function pilotUpload(h, list) {
  if (!Array.isArray(list) || list.length > 50) throw Object.assign(new Error('Zu viele Fahrten auf einmal'), { status: 400 });
  const d = readPilot(h);
  let n = 0;
  for (const t of list) {
    const c = cleanTrip(t);
    if (!c) continue;
    if (!d.trips[c.id] && Object.keys(d.trips).length >= PILOT_MAX_TRIPS) break;
    d.trips[c.id] = Object.assign(c, { empfangen: Date.now() });
    n++;
  }
  d.updated = Date.now();
  writePilot(h, d);
  return { ok: true, neu: n, n: Object.keys(d.trips).length };
}
function newCodes(k) {
  const v = readJson(PILOT_FILE, {});
  const out = [];
  for (let i = 0; i < k; i++) {
    const b = crypto.randomBytes(8);
    const body = Array.from(b, (x) => CODE_ABC[x % CODE_ABC.length]).join('');
    const code = `FT-${body.slice(0, 4)}-${body.slice(4, 8)}`;
    const h = pilotHash(normCode(code));
    v[h] = { erstellt: new Date().toISOString() };
    out.push({ code, pseudonym: h.slice(0, 8) });
  }
  fs.writeFileSync(PILOT_FILE, JSON.stringify(v, null, 1));
  return out;
}
function exportPilot() {
  let files = [];
  try { files = fs.readdirSync(PILOT_DIR).filter((f) => f.endsWith('.json')); } catch (e) { /* noch keine Daten */ }
  return { exportiert: new Date().toISOString(), testpersonen: files.map((f) => {
    const d = readJson(path.join(PILOT_DIR, f), { trips: {} });
    return { pseudonym: f.slice(0, 8), fahrten: Object.values(d.trips).sort((a, b) => a.start - b.start) };
  }) };
}

// ---------- HTTP ----------
// ---------- Radwege aus OpenStreetMap: je Kachel eingestuft, gepackt und auf dem Server zwischengespeichert ----------
// Die App holt fertige Kacheln von hier statt selbst bei Overpass zu fragen: schneller, und das Handy spricht nicht mit Dritten.
// Kacheln für ganz Bielefeld lädt der Server vorab, nacheinander und mit Pausen, und erneuert sie alle 14 Tage nachts.
// öffentliche Overpass-Server: der erste zuerst, bei Überlast (429, 502, 504) oder Ausfall der nächste; eigene Liste mit Kommas
const OVERPASS_URLS = (process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter').split(',').map((x) => x.trim()).filter(Boolean);
const OVERPASS_URL = OVERPASS_URLS[0];
// ein Durchgang über alle Server
async function overpassOnce(q, signal) {
  let lastErr;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Flowtown/1.0 (info@barrierefrai.com)' }, signal });
      if (!res.ok) throw new Error('Overpass HTTP ' + res.status + ' (' + new URL(url).host + ')');
      const json = await res.json();
      if (json.remark && /error|timeout|memory|abort/i.test(json.remark)) throw new Error('Overpass: ' + json.remark);
      return json;
    } catch (e) { if (signal && signal.aborted) throw e; lastErr = e; }
  }
  throw lastErr;
}
// mit Wiederholung: bis zu drei Durchgänge, dazwischen 20 und 60 Sekunden Pause
async function overpass(q, ms) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt === 1 ? 20000 : 60000));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 90000);
    try { return await overpassOnce(q, ctrl.signal); }
    catch (e) { lastErr = e.name === 'AbortError' ? new Error('Overpass antwortet nicht') : e; }
    finally { clearTimeout(timer); }
  }
  throw lastErr;
}
const RAD_TILE = 0.03;   // wie in der App
const RAD_DIR = path.join(DATA_DIR, 'radnetz');
const RAD_AGE = 14 * 864e5;
const RAD_PREFETCH = process.env.RAD_PREFETCH !== '0';
const radMem = new Map();       // Schlüssel -> { t, gz, etag }
const radPending = new Map();
let radQueue = Promise.resolve(), radFill = false;
const radSpeed = (v) => {
  if (!v) return null;
  if (/zone:?30|^30/.test(v)) return 30;
  if (/urban/.test(v)) return 50;
  if (/rural/.test(v)) return 100;
  if (v === 'walk') return 7;
  const n = parseInt(v, 10);
  return isFinite(n) ? n : null;
};
// gleiche Einstufung wie in der App (app.js, radClass)
function radClass(t) {
  const hw = t.highway;
  if (t.bicycle === 'no' || t.bicycle === 'dismount') return null;
  if (t.bicycle_road === 'yes' || t.cyclestreet === 'yes' || hw === 'cycleway') return 'gut';
  if (/^(path|footway|track|pedestrian|service|bridleway)$/.test(hw)) return t.bicycle === 'designated' ? 'gut' : 'ruhig';
  const cw = ['cycleway', 'cycleway:both', 'cycleway:right', 'cycleway:left'].map((k) => t[k] || '').join(' ');
  if (/track|separate/.test(cw) || t.bicycle === 'use_sidepath' || /designated/.test(t['sidewalk:both:bicycle'] || t['sidewalk:right:bicycle'] || t['sidewalk:left:bicycle'] || '')) return 'gut';
  const v = radSpeed(t.maxspeed);
  if (/lane|share_busway|opposite_lane/.test(cw)) return 'mittel';
  if (hw === 'living_street') return 'ruhig';
  if (/^(residential|unclassified)$/.test(hw)) return v != null && v >= 50 ? (hw === 'residential' ? 'mittel' : 'schlecht') : 'ruhig';
  return v != null && v <= 30 ? 'mittel' : 'schlecht';
}
const radKeyOk = (k) => {
  const m = /^(-?\d{1,5})_(-?\d{1,5})$/.exec(k || '');
  if (!m) return false;
  const lat = Number(m[1]) * RAD_TILE, lon = Number(m[2]) * RAD_TILE;
  return lat >= 47 && lat <= 55.1 && lon >= 5.8 && lon <= 15.1;   // Deutschland
};
function radCached(k) {
  if (radMem.has(k)) return radMem.get(k);
  try {
    const f = path.join(RAD_DIR, k + '.json.gz');
    const gz = fs.readFileSync(f);
    const c = { t: fs.statSync(f).mtimeMs, gz, etag: '"' + crypto.createHash('sha1').update(gz).digest('hex').slice(0, 16) + '"' };
    radMem.set(k, c);
    if (radMem.size > 300) radMem.delete(radMem.keys().next().value);
    return c;
  } catch (e) { return null; }
}
// eine Kachel bei Overpass holen; immer nur eine Anfrage zur Zeit
function radFetch(k) {
  if (radPending.has(k)) return radPending.get(k);
  const job = radQueue.then(async () => {
    const [a, b] = k.split('_').map(Number);
    const bb = `${(a * RAD_TILE).toFixed(3)},${(b * RAD_TILE).toFixed(3)},${((a + 1) * RAD_TILE).toFixed(3)},${((b + 1) * RAD_TILE).toFixed(3)}`;
    const q = `[out:json][timeout:60];(way[highway~"^(cycleway|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|trunk|trunk_link)$"](${bb});way[highway~"^(path|footway|track|pedestrian|service|bridleway)$"][bicycle~"^(designated|yes)$"](${bb});way[bicycle_road=yes](${bb}););out tags geom;`;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, attempt * 10000));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      try {
        const json = await overpassOnce(q, ctrl.signal);
        const ways = [];
        for (const w of json.elements || []) {
          if (w.type !== 'way' || !w.geometry || w.geometry.length < 2) continue;
          const c = radClass(w.tags || {});
          if (!c) continue;
          ways.push({ c, n: (w.tags.name || w.tags.ref || '').slice(0, 60), v: radSpeed(w.tags.maxspeed), g: w.geometry.map((p) => [r5(p.lat), r5(p.lon)]) });
        }
        const gz = zlib.gzipSync(JSON.stringify({ t: Date.now(), ways }), { level: 9 });
        fs.mkdirSync(RAD_DIR, { recursive: true });
        fs.writeFileSync(path.join(RAD_DIR, k + '.json.gz.tmp'), gz);
        fs.renameSync(path.join(RAD_DIR, k + '.json.gz.tmp'), path.join(RAD_DIR, k + '.json.gz'));
        radMem.delete(k);
        return radCached(k);
      } catch (e) { lastErr = e.name === 'AbortError' ? new Error('Overpass antwortet nicht') : e; }
      finally { clearTimeout(timer); }
    }
    throw lastErr;
  });
  radQueue = job.then(() => new Promise((r) => setTimeout(r, 1500)), () => new Promise((r) => setTimeout(r, 5000)));   // Pause für Overpass
  radPending.set(k, job);
  job.finally(() => radPending.delete(k)).catch(() => {});
  return job;
}
async function sendRad(req, res, origin, k) {
  let c = radCached(k);
  if (!c) c = await radFetch(k);
  else if (Date.now() - c.t > RAD_AGE) radFetch(k).catch(() => {});   // alte Kachel ausliefern, im Hintergrund erneuern
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400', ETag: c.etag, Vary: 'Origin, Accept-Encoding' };
  if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'ETag' });
  if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, h); return res.end(); }
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); return res.end(c.gz); }
  res.writeHead(200, h);
  res.end(zlib.gunzipSync(c.gz));
}
// Bielefeld vorab: fehlende Kacheln sofort, alte nachts zwischen 2 und 5 Uhr
async function radTick() {
  if (!RAD_PREFETCH || radFill) return;
  radFill = true;
  const night = (() => { const h = new Date().getHours(); return h >= 2 && h < 5; })();
  let n = 0;
  try {
    for (let a = Math.floor(LAGE_BBOX[1] / RAD_TILE); a <= Math.floor(LAGE_BBOX[3] / RAD_TILE); a++)
      for (let b = Math.floor(LAGE_BBOX[0] / RAD_TILE); b <= Math.floor(LAGE_BBOX[2] / RAD_TILE); b++) {
        const k = a + '_' + b, c = radCached(k);
        if (c && (Date.now() - c.t < RAD_AGE || !night)) continue;
        try { await radFetch(k); n++; } catch (e) { console.error('Radwege', k + ':', e.message); }
      }
  } finally { radFill = false; }
  if (n) console.log(`Radwege: ${n} Kacheln geladen`);
}

// ---------- Fußnetz: Belag, Stufen, Steigung, Bordsteine, Gleise und Ampeln je Kachel (für den Weg-Check zu Fuß) ----------
// gleiche Kacheln wie bei den Radwegen; vorab nur die Innenstadt, der Rest bei Bedarf
const FUSS_DIR = path.join(DATA_DIR, 'fussnetz');
const fussMem = new Map(), fussPending = new Map();
function fussClass(t) {
  if (t.highway === 'steps') return 'stufen';
  const inc = /^-?\d+(\.\d+)?\s*%$/.test(t.incline || '') ? Math.abs(parseFloat(t.incline)) : null;
  if (inc != null && inc > 6) return 'steil';
  const surf = t['sidewalk:surface'] || t['footway:surface'] || t.surface || '', sm = t.smoothness || '';
  if (/cobblestone/.test(surf)) return 'kopfstein';
  if (/gravel|pebblestone|compacted|dirt|ground|earth|grass|sand|mud|unpaved|woodchips/.test(surf)) return 'unbefestigt';
  if (surf === 'sett' || /^(bad|very_bad|horrible|very_horrible|impassable)$/.test(sm)) return 'holprig';
  if (surf) return 'gut';
  return /^(footway|pedestrian|living_street|cycleway)$/.test(t.highway) ? 'gut' : 'offen';
}
function fussCached(k) {
  if (fussMem.has(k)) return fussMem.get(k);
  try {
    const f = path.join(FUSS_DIR, k + '.json.gz');
    const gz = fs.readFileSync(f);
    const c = { t: fs.statSync(f).mtimeMs, gz, etag: '"' + crypto.createHash('sha1').update(gz).digest('hex').slice(0, 16) + '"' };
    fussMem.set(k, c);
    if (fussMem.size > 100) fussMem.delete(fussMem.keys().next().value);
    return c;
  } catch (e) { return null; }
}
function fussFetch(k) {
  if (fussPending.has(k)) return fussPending.get(k);
  const job = radQueue.then(async () => {
    const [a, b] = k.split('_').map(Number);
    const bb = `${(a * RAD_TILE).toFixed(3)},${(b * RAD_TILE).toFixed(3)},${((a + 1) * RAD_TILE).toFixed(3)},${((b + 1) * RAD_TILE).toFixed(3)}`;
    const q = `[out:json][timeout:90];(way[highway~"^(footway|pedestrian|steps|path|living_street|residential|service|unclassified|tertiary|secondary|primary|cycleway|track)$"](${bb});node[barrier=kerb](${bb});node[railway~"^(tram_crossing|tram_level_crossing|level_crossing|crossing)$"](${bb});node[highway=crossing][crossing=traffic_signals](${bb});node[highway=traffic_signals](${bb}););out tags geom;`;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, attempt * 10000));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      try {
        const json = await overpassOnce(q, ctrl.signal);
        const ways = [], nodes = [];
        for (const e of json.elements || []) {
          const t = e.tags || {};
          if (e.type === 'way' && e.geometry && e.geometry.length > 1) {
            if (t.access === 'private' || t.foot === 'no') continue;
            ways.push({ c: fussClass(t), n: (t.name || '').slice(0, 60), g: e.geometry.map((p) => [r5(p.lat), r5(p.lon)]) });
          } else if (e.type === 'node') {
            if (t.barrier === 'kerb') { if (/^(raised|regular|yes)$/.test(t.kerb || '')) nodes.push([r5(e.lat), r5(e.lon), 'b']); }
            else if (t.railway) nodes.push([r5(e.lat), r5(e.lon), 'g']);
            else nodes.push([r5(e.lat), r5(e.lon), 'a', t['traffic_signals:sound'] === 'yes' ? 1 : t['traffic_signals:sound'] === 'no' ? 0 : null]);
          }
        }
        const gz = zlib.gzipSync(JSON.stringify({ t: Date.now(), ways, nodes }), { level: 9 });
        fs.mkdirSync(FUSS_DIR, { recursive: true });
        fs.writeFileSync(path.join(FUSS_DIR, k + '.json.gz.tmp'), gz);
        fs.renameSync(path.join(FUSS_DIR, k + '.json.gz.tmp'), path.join(FUSS_DIR, k + '.json.gz'));
        fussMem.delete(k);
        return fussCached(k);
      } catch (e) { lastErr = e.name === 'AbortError' ? new Error('Overpass antwortet nicht') : e; }
      finally { clearTimeout(timer); }
    }
    throw lastErr;
  });
  radQueue = job.then(() => new Promise((r) => setTimeout(r, 1500)), () => new Promise((r) => setTimeout(r, 5000)));
  fussPending.set(k, job);
  job.finally(() => fussPending.delete(k)).catch(() => {});
  return job;
}
async function sendFuss(req, res, origin, k) {
  let c = fussCached(k);
  if (!c) c = await fussFetch(k);
  else if (Date.now() - c.t > RAD_AGE) fussFetch(k).catch(() => {});
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400', ETag: c.etag, Vary: 'Origin, Accept-Encoding' };
  if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'ETag' });
  if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, h); return res.end(); }
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); return res.end(c.gz); }
  res.writeHead(200, h);
  res.end(zlib.gunzipSync(c.gz));
}
// Innenstadt vorab (3 × 3 Kacheln um den Jahnplatz), nach den Radwegen
async function fussTick() {
  if (!RAD_PREFETCH) return;
  const a0 = Math.floor(52.022 / RAD_TILE), b0 = Math.floor(8.532 / RAD_TILE);
  for (let a = a0 - 1; a <= a0 + 1; a++) for (let b = b0 - 1; b <= b0 + 1; b++) {
    const k = a + '_' + b, c = fussCached(k);
    if (c && Date.now() - c.t < RAD_AGE) continue;
    try { await fussFetch(k); } catch (e) { console.error('Fußnetz', k + ':', e.message); }
  }
}

// ---------- Barrierefrei: Orte aus „Bielefeld barrierefrei erleben“ (Bethel) und Toiletten/Aufzüge aus OpenStreetMap ----------
// Der Server holt einmal pro Woche die Angaben zu rund 100 Gebäuden (nacheinander, mit Pausen) und die rollstuhlgerechten
// Toiletten und Aufzüge in Bielefeld; die App lädt alles als eine kleine Datei. Abschalten: BETHEL_DATA=0.
const BF_URL = process.env.BETHEL_URL || 'https://bielefeld-barrierefrei.de';
const BF_ON = process.env.BETHEL_DATA !== '0';
const BF_FILE = path.join(DATA_DIR, 'barrierefrei.json');
// Felder des Erhebungsbogens -> kurze Schlüssel (Ja = 1, Nein = 0, sonst null)
const BF_FIELDS = {
  oepnv: 11, eingang: 13, hilfe: 17, anmelden: 19, ruhe: 20, ebene: 22, schilder: 55, service: 25,
  stufenlos: 27, tuer: 29, abstell: 35, rollplatz: 37, aufzug: 39, aufzuggross: 41, tische: 51, boden: 53,
  wc: 57, wcanfahr: 63, wcgriffe: 65, handlauf: 75,
  stufenkante: 77, hindernis: 80, hund: 82, licht: 83, leit: 89, braille: 91, taktil: 93, fuehrung: 95, audio: 97,
  hoeranlage: 103, fm: 104, gebaerde: 107, dolmetsch: 109,
  leicht: 114, pikto: 116, bildleit: 118
};
let bf = null, bfRun = null;
try { bf = JSON.parse(fs.readFileSync(BF_FILE, 'utf8')); } catch (e) { bf = null; }
const bfVal = (v) => (/^ja$/i.test(String(v || '').trim()) ? 1 : /^nein$/i.test(String(v || '').trim()) ? 0 : null);
const bfText = (v) => clip(String(v || '').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'), 160);
async function bfBuilding(slug) {
  const j = await getJson(`${BF_URL}/wp-json/be/composed-data?type=gebaeude&name=${encodeURIComponent(slug)}&src=flowtown`, 20000);
  const g = (j.gebaeude || [])[0];
  if (!g || !g.location || !isFinite(Number(g.location.lat))) return null;
  const all = {};
  for (const group of Object.values(g.data || {})) for (const f of Object.values(group || {})) all[f.id] = f;
  const f = {};
  for (const [k, n] of Object.entries(BF_FIELDS)) { const x = all['gebaeude_field' + n]; if (x) f[k] = bfVal(x.value); }
  const ann = (n) => { const x = all['gebaeude_field' + n]; return x && x.annotation && x.annotation.value ? bfText(x.annotation.value) : ''; };
  const val = (k) => (all[k] ? bfText(all[k].value) : '');
  const park = parseInt(val('gebaeude_field15'), 10);
  return {
    id: g.id, n: clip(g.title, 80), u: g.url, lat: r5(Number(g.location.lat)), lon: r5(Number(g.location.lng)),
    adr: clip([g.location.street_name, g.location.street_number && g.location.street_number !== '0' ? g.location.street_number : ''].filter(Boolean).join(' '), 60),
    tel: val('gebaeude_field10').replace(/^Tel\.?\s*/i, ''), park: isFinite(park) ? park : null,
    f, hinweis: { eingang: ann(13), oepnv: ann(11), service: ann(25) }, stand: g.last_modified && g.last_modified.formatted || ''
  };
}
async function bfOsm() {
  const bb = `${LAGE_BBOX[1]},${LAGE_BBOX[0]},${LAGE_BBOX[3]},${LAGE_BBOX[2]}`;
  const q = `[out:json][timeout:60];(node[amenity=toilets](${bb});way[amenity=toilets](${bb});node[highway=elevator](${bb}););out center tags;`;
  const j = await overpass(q);
  const wc = [], lift = [];
  for (const e of j.elements || []) {
    const lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const t = e.tags || {};
    if (t.amenity === 'toilets') wc.push([r5(lat), r5(lon), t.wheelchair === 'yes' ? 1 : t.wheelchair === 'limited' ? 2 : t.wheelchair === 'no' ? 0 : null, clip(t.name || t.operator || '', 40), /centralkey|eurokey/i.test(t.centralkey || t['toilets:centralkey'] || '') || t.centralkey === 'eurokey' ? 1 : 0]);
    else lift.push([r5(lat), r5(lon), t.wheelchair === 'no' ? 0 : 1]);
  }
  return { wc, lift };
}
// Orte der Altstadt-FAQ genau aus OpenStreetMap: Mittelpunkt und Umriss (Plätze, Straßen) im Zentrum
const FAQ_OSM = {
  'Alter Markt': ['way["name"="Alter Markt"]["highway"]', 'way["name"="Alter Markt"]["place"]', 'node["name"="Alter Markt"]["place"]'],
  'Obernstraße': ['way["name"="Obernstraße"]["highway"]'],
  'Jahnplatz': ['way["name"="Jahnplatz"]["highway"]', 'way["name"="Jahnplatz"]["place"]'],
  'Haltestelle Rathaus': ['node["name"="Rathaus"]["railway"="tram_stop"]', 'node["name"="Rathaus"]["public_transport"="stop_position"]["tram"="yes"]'],
  'Hauptbahnhof': ['node["name"="Bielefeld Hbf"]["railway"="station"]', 'node["name"~"^Bielefeld Hauptbahnhof"]["railway"="station"]'],
  'Bahnhofstraße': ['way["name"="Bahnhofstraße"]["highway"]'],
  'Kunsthalle': ['way["name"~"^Kunsthalle Bielefeld"]', 'node["name"~"^Kunsthalle Bielefeld"]']
};
async function faqOrte() {
  const bb = '52.008,8.515,52.036,8.548';   // Innenstadt
  const parts = [];
  for (const qs of Object.values(FAQ_OSM)) qs.forEach((q) => parts.push(`${q}(${bb});${q.startsWith('node') ? 'out;' : 'out tags geom;'}`));
  const q = `[out:json][timeout:60];${parts.join('')}`;
  const j = await overpass(q);
  // Elemente den Orten über ihren Namen zuordnen
  const out = {};
  const nameOf = (t) => {
    if (!t) return null;
    if (t.railway === 'station' || (t.public_transport === 'station' && /Bielefeld H/.test(t.name || ''))) return /Bielefeld H/.test(t.name || '') ? 'Hauptbahnhof' : null;
    if (t.name === 'Rathaus' && (t.railway === 'tram_stop' || t.tram === 'yes')) return 'Haltestelle Rathaus';
    if (/^Kunsthalle Bielefeld/.test(t.name || '')) return 'Kunsthalle';
    return FAQ_OSM[t.name] ? t.name : null;
  };
  for (const e of j.elements || []) {
    const n = nameOf(e.tags);
    if (!n) continue;
    const o = out[n] || (out[n] = { pts: [], g: [] });
    if (e.type === 'node') o.pts.push([e.lat, e.lon]);
    else if (e.geometry && e.geometry.length) { o.g.push(thin(e.geometry.map((p) => [p.lat, p.lon]))); e.geometry.forEach((p) => o.pts.push([p.lat, p.lon])); }
    else if (e.center) o.pts.push([e.center.lat, e.center.lon]);
  }
  // Haltestellen ohne Treffer: Lage der Steige aus dem Fahrplan (DELFI)
  const delfi = { 'Haltestelle Rathaus': /^Bielefeld, Rathaus$/, 'Jahnplatz': /^Bielefeld, Jahnplatz$/, 'Hauptbahnhof': /^Bielefeld Hbf$/, 'Kunsthalle': /^Bielefeld, Kunsthalle$/ };
  if (fahrplan && fahrplan.raw) {
    let stops = null;
    try { stops = JSON.parse(fahrplan.raw).stops; } catch (e) { stops = null; }
    for (const [n, re] of Object.entries(delfi)) {
      if (out[n] && out[n].pts.length) continue;
      const ps = (stops || []).filter((x) => re.test(x[1])).map((x) => [x[2], x[3]]);
      if (ps.length) out[n] = { pts: ps, g: [], src: 'fahrplan' };
    }
  }
  // Mittelpunkt: bei Flächen (geschlossener Umriss) deren Mitte, bei Straßen der Punkt auf der Straße nahe der
  // längengewichteten Mitte; Punkte ohne Linie (Haltestellen, Bahnhof) einfach gemittelt
  const m = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 68500);
  function middle(o) {
    const lines = o.g.filter((l) => l.length > 1);
    if (!lines.length) return [o.pts.reduce((a, p) => a + p[0], 0) / o.pts.length, o.pts.reduce((a, p) => a + p[1], 0) / o.pts.length];
    const closed = lines.filter((l) => l.length > 3 && m(l[0], l[l.length - 1]) < 2).sort((a, b) => b.length - a.length);
    if (closed.length) { const l = closed[0].slice(0, -1); return [l.reduce((a, p) => a + p[0], 0) / l.length, l.reduce((a, p) => a + p[1], 0) / l.length]; }
    let w = 0, la = 0, lo = 0;
    for (const l of lines) for (let i = 0; i < l.length - 1; i++) { const d = m(l[i], l[i + 1]); w += d; la += d * (l[i][0] + l[i + 1][0]) / 2; lo += d * (l[i][1] + l[i + 1][1]) / 2; }
    const c = [la / w, lo / w];
    // nächster Punkt auf der Linie (nicht nur auf einem Eckpunkt)
    let best = null, bd = Infinity;
    for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
      const ax = (l[i][1] - c[1]) * 68500, ay = (l[i][0] - c[0]) * 111320, bx = (l[i + 1][1] - c[1]) * 68500, by = (l[i + 1][0] - c[0]) * 111320;
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const u = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const d = Math.hypot(ax + u * dx, ay + u * dy);
      if (d < bd) { bd = d; best = [l[i][0] + u * (l[i + 1][0] - l[i][0]), l[i][1] + u * (l[i + 1][1] - l[i][1])]; }
    }
    return best || c;
  }
  const res2 = {};
  for (const [n, o] of Object.entries(out)) {
    if (!o.pts.length) continue;
    const c = middle(o);
    res2[n] = { c: [r5(c[0]), r5(c[1])], g: o.g.slice(0, 12), q: o.src || 'osm' };
  }
  // Pin für Plätze und Straßen lieber von HERE: dessen Suche trifft bekannte Orte genau, OpenStreetMap liefert nur den Umriss
  if (HERE_KEY) {
    const query = { 'Alter Markt': 'Alter Markt, 33602 Bielefeld', 'Obernstraße': 'Obernstraße, 33602 Bielefeld', 'Jahnplatz': 'Jahnplatz, 33602 Bielefeld', 'Bahnhofstraße': 'Bahnhofstraße, 33602 Bielefeld', 'Kunsthalle': 'Kunsthalle Bielefeld, Artur-Ladebeck-Straße 5, Bielefeld' };
    for (const [n, text] of Object.entries(query)) {
      try {
        const j = await getJson(`${GEOCODE_URL}?${new URLSearchParams({ q: text, limit: '1', lang: 'de-DE', in: ORT_LAENDER, apiKey: HERE_KEY })}`, 8000);
        const pos = j.items && j.items[0] && j.items[0].position;
        if (pos && pos.lat > 52.0 && pos.lat < 52.05 && pos.lng > 8.5 && pos.lng < 8.56) res2[n] = Object.assign(res2[n] || { g: [] }, { c: [r5(pos.lat), r5(pos.lng)], q: 'here' });
      } catch (e) { /* dann bleibt der Punkt aus OpenStreetMap */ }
    }
  }
  // von Hand festgelegte Orte gehen immer vor (node flowtown-server.mjs faq-ort "Name" Breite Länge)
  for (const [n, c] of Object.entries((bf && bf.faqFest) || {})) res2[n] = Object.assign(res2[n] || { g: [] }, { c, q: 'fest' });
  return res2;
}

// ---------- Hinweise von Nutzer*innen: Hindernisse melden, bestätigen, als erledigt markieren ----------
// Nur feste Arten, kein freier Text (nichts zu moderieren). Gespeichert ohne IP und ohne Kennung der Person.
const HINWEIS_FILE = path.join(DATA_DIR, 'hinweise.json');
const HINWEIS_ART = { stufe: 365, bordstein: 365, pflaster: 365, aufzug: 7, blockiert: 14, toilette: 14, ampel: 180, gut: 365 };
let hinweise = [];
try { hinweise = JSON.parse(fs.readFileSync(HINWEIS_FILE, 'utf8')); } catch (e) { hinweise = []; }
const hinweisIp = new Map();   // IP -> { day, n } nur im Speicher, gegen Massenmeldungen
function hinweisAllowed(ip) {
  const day = new Date().toISOString().slice(0, 10), c = hinweisIp.get(ip);
  if (!c || c.day !== day) { hinweisIp.set(ip, { day, n: 1 }); return true; }
  return ++c.n <= 30;
}
function saveHinweise() {
  hinweise = hinweise.filter((h) => h.bis > Date.now() && h.weg < (h.geprueft ? 3 : 2)).slice(-3000);
  fs.writeFileSync(HINWEIS_FILE + '.tmp', JSON.stringify(hinweise));
  fs.renameSync(HINWEIS_FILE + '.tmp', HINWEIS_FILE);
}
function addHinweis(b) {
  const lat = Number(b.lat), lon = Number(b.lon), art = String(b.art || '');
  if (!HINWEIS_ART[art]) throw Object.assign(new Error('Unbekannte Art.'), { status: 400 });
  if (!inBox(lat, lon, 0.05)) throw Object.assign(new Error('Nur in Bielefeld möglich.'), { status: 400 });
  // gleiche Art in 15 m: als Bestätigung zählen statt doppelt
  const near = hinweise.find((h) => h.art === art && Math.hypot((h.lat - lat) * 111320, (h.lon - lon) * 68500) < 15);
  if (near) { near.ok++; near.bis = Math.max(near.bis, Date.now() + HINWEIS_ART[art] * 864e5); near.t2 = Date.now(); saveHinweise(); return near; }
  const h = { id: crypto.randomBytes(6).toString('hex'), lat: r5(lat), lon: r5(lon), art, t: Date.now(), bis: Date.now() + HINWEIS_ART[art] * 864e5, ok: 0, weg: 0 };
  hinweise.push(h); saveHinweise();
  return h;
}
function voteHinweis(id, stimmt) {
  const h = hinweise.find((x) => x.id === id);
  if (!h) throw Object.assign(new Error('Hinweis nicht gefunden.'), { status: 404 });
  if (stimmt) { h.ok++; h.t2 = Date.now(); h.bis = Math.max(h.bis, Date.now() + HINWEIS_ART[h.art] * 864e5); } else h.weg++;
  saveHinweise();
  return h;
}

async function refreshBf() {
  const out = { t: Date.now(), quelle: 'Bielefeld barrierefrei erleben (v. Bodelschwinghsche Stiftungen Bethel)', link: BF_URL, orte: bf ? bf.orte : [], wc: bf ? bf.wc : [], lift: bf ? bf.lift : [] };
  if (BF_ON) {
    const slugs = [];
    for (let page = 1; page <= 5; page++) {
      const list = await getJson(`${BF_URL}/wp-json/wp/v2/gebaeude?per_page=100&page=${page}&_fields=slug`, 20000).catch(() => []);
      if (!Array.isArray(list) || !list.length) break;
      slugs.push(...list.map((x) => x.slug));
      if (list.length < 100) break;
    }
    const orte = [];
    for (const s of slugs) {
      try { const o = await bfBuilding(s); if (o) orte.push(o); } catch (e) { /* einzelnes Gebäude überspringen */ }
      await new Promise((r) => setTimeout(r, 1200));
    }
    if (orte.length) out.orte = orte;
  } else out.orte = [];
  try { const o = await bfOsm(); if (o.wc.length || o.lift.length) Object.assign(out, o); } catch (e) { console.error('Barrierefrei OSM:', e.message); }
  try { out.faqOrte = await faqOrte(); out.faqOrteV = 3; } catch (e) { out.faqOrte = bf && bf.faqOrte || null; console.error('FAQ-Orte:', e.message); }
  bf = out;
  fs.writeFileSync(BF_FILE + '.tmp', JSON.stringify(out));
  fs.renameSync(BF_FILE + '.tmp', BF_FILE);
  bf.gz = null;
  return `${out.orte.length} Orte, ${out.wc.length} Toiletten, ${out.lift.length} Aufzüge`;
}
function bfTick() {
  if (bfRun) return;
  if (bf && bf.t && !(bf.wc && bf.wc.length) && !bf.osmTry || (bf && bf.osmTry && Date.now() - bf.osmTry > 3600e3 && !(bf.wc && bf.wc.length))) {
    bf.osmTry = Date.now();
    bfRun = bfOsm().then((o) => { if (!o.wc.length && !o.lift.length) throw new Error('keine Treffer'); Object.assign(bf, o); bf.gz = null; fs.writeFileSync(BF_FILE, JSON.stringify(Object.assign({}, bf, { gz: undefined, raw: undefined }))); console.log(`Barrierefrei OSM: ${o.wc.length} Toiletten, ${o.lift.length} Aufzüge`); })
      .catch((e) => console.error('Barrierefrei OSM:', e.message)).finally(() => { bfRun = null; });
    return;
  }
  if (bf && bf.t && (!bf.faqOrte || Object.keys(bf.faqOrte).length < 4 || (bf.faqOrteV || 0) < 3)) {
    bfRun = faqOrte().then((o) => { if (Object.keys(o).length < 2) throw new Error('kaum Treffer: ' + Object.keys(o).join(', ')); bf.faqOrte = o; bf.faqOrteV = 3; bf.gz = null; fs.writeFileSync(BF_FILE, JSON.stringify(Object.assign({}, bf, { gz: undefined, raw: undefined }))); console.log('FAQ-Orte:', Object.keys(o).join(', ')); })
      .catch((e) => console.error('FAQ-Orte:', e.message)).finally(() => { bfRun = null; });
    return;
  }
  const age = bf ? Date.now() - bf.t : Infinity, h = new Date().getHours();
  if (age === Infinity || (age > 7 * 864e5 && h >= 2 && h < 5)) {
    bfRun = refreshBf().then((m) => console.log('Barrierefrei:', m)).catch((e) => console.error('Barrierefrei:', e.message)).finally(() => { bfRun = null; });
  }
}
function sendBf(req, res, origin) {
  if (!bf.gz) { const raw = JSON.stringify({ t: bf.t, quelle: bf.quelle, link: bf.link, orte: bf.orte, wc: bf.wc, lift: bf.lift, faqOrte: bf.faqOrte || null }); bf.gz = zlib.gzipSync(raw, { level: 9 }); bf.raw = raw; bf.etag = '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"'; }
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: bf.etag, Vary: 'Origin, Accept-Encoding' };
  if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'ETag' });
  if (req.headers['if-none-match'] === bf.etag) { res.writeHead(304, h); return res.end(); }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gz) h['Content-Encoding'] = 'gzip';
  res.writeHead(200, h);
  res.end(gz ? bf.gz : bf.raw);
}

// ---------- Redaktion: Hinweise (FAQ) aus einer gemeinsamen Tabelle ----------
// Quelle: als CSV veröffentlichte Tabelle (REDAKTION_CSV_URL, etwa Google Tabellen: Datei > Freigeben > Im Web veröffentlichen > CSV)
// oder eine Datei /var/lib/flowtown/faq.csv. Der Server holt sie stündlich, prüft jede Zeile und gibt nur gültige, aktive weiter.
const FAQ_URL = process.env.REDAKTION_CSV_URL || '';
const FAQ_CSV = path.join(DATA_DIR, 'faq.csv'), FAQ_JSON = path.join(DATA_DIR, 'faq.json');
const FAQ_GRUPPEN = ['Rollstuhl', 'Rollator', 'Sehbehinderung', 'Hörbehinderung', 'Ältere Menschen', 'Vorübergehende Einschränkung', 'Psychische Erkrankung', 'Neurodivergenz', 'Chronische Erkrankung', 'Leichte Sprache', 'Alle'];
let faqData = null, faqRun = null;
try { faqData = JSON.parse(fs.readFileSync(FAQ_JSON, 'utf8')); } catch (e) { faqData = null; }
// CSV mit Anführungszeichen, Zeilenumbrüchen in Feldern und Komma oder Semikolon als Trenner
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split('\n')[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
function readFaqCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Tabelle ist leer');
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/[^a-z]/g, ''));
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const c = { id: col('id'), kat: col('kategorie'), frage: col('frage'), antwort: col('antwort'), ort: col('ort'), gruppen: col('zielgruppen', 'zielgruppe'), lat: col('breite', 'lat', 'latitude'), lon: col('laenge', 'lon', 'lng', 'longitude'), aktiv: col('aktiv'), bis: col('gueltigbis', 'bis') };
  for (const k of ['id', 'frage', 'antwort']) if (c[k] < 0) throw new Error(`Spalte „${k === 'id' ? 'ID' : k[0].toUpperCase() + k.slice(1)}“ fehlt`);
  const out = [], fehler = [], ids = new Set();
  rows.slice(1).forEach((r, i) => {
    const v = (k) => (c[k] >= 0 ? String(r[c[k]] || '').trim() : '');
    const zeile = i + 2;
    if (/^(nein|n|0|false|aus)$/i.test(v('aktiv'))) return;
    const id = v('id'), frage = v('frage'), antwort = v('antwort');
    if (!id || !frage || !antwort) { fehler.push(`Zeile ${zeile}: ID, Frage oder Antwort fehlt`); return; }
    if (ids.has(id)) { fehler.push(`Zeile ${zeile}: ID ${id} doppelt`); return; }
    const bis = v('bis');
    if (bis) {
      const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(bis) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(bis);
      const d = !m ? null : bis.includes('-') ? new Date(+m[1], m[2] - 1, +m[3], 23, 59) : new Date(+m[3], m[2] - 1, +m[1], 23, 59);
      if (!d || isNaN(d)) { fehler.push(`Zeile ${zeile}: „Gültig bis“ nicht lesbar (${bis}), bitte TT.MM.JJJJ`); return; }
      if (d < Date.now()) return;   // abgelaufen
    }
    const gruppen = v('gruppen').split(/[,;]/).map((g) => g.trim()).filter(Boolean);
    const unbekannt = gruppen.filter((g) => !FAQ_GRUPPEN.includes(g));
    if (unbekannt.length) fehler.push(`Zeile ${zeile}: unbekannte Zielgruppe ${unbekannt.join(', ')} (erlaubt: ${FAQ_GRUPPEN.join(', ')})`);
    const e = { id, kat: v('kat') || 'Allgemein', frage: clip(frage, 200), antwort: antwort.slice(0, 2000), orte: v('ort').split(/[,;]/).map((o) => o.trim()).filter(Boolean), gruppen: gruppen.filter((g) => FAQ_GRUPPEN.includes(g)) };
    if (!e.gruppen.length) e.gruppen = ['Alle'];
    const lat = Number(v('lat').replace(',', '.')), lon = Number(v('lon').replace(',', '.'));
    if (v('lat') || v('lon')) {
      if (!inBox(lat, lon, 0.1)) { fehler.push(`Zeile ${zeile}: Breite/Länge nicht in Bielefeld (${v('lat')}, ${v('lon')})`); return; }
      e.lat = r5(lat); e.lon = r5(lon);
    }
    ids.add(id); out.push(e);
  });
  return { eintraege: out, fehler };
}
async function refreshFaq() {
  let text;
  if (FAQ_URL) {
    const res = await fetch(FAQ_URL, { headers: { 'User-Agent': 'Flowtown/1.0' }, redirect: 'follow' });
    if (!res.ok) throw new Error('Tabelle nicht erreichbar: HTTP ' + res.status);
    text = await res.text();
    if (/^\s*<!doctype html|<html/i.test(text)) throw new Error('Der Link liefert eine Webseite statt CSV. In Google Tabellen: Datei > Freigeben > Im Web veröffentlichen > Format CSV');
  } else if (fs.existsSync(FAQ_CSV)) text = fs.readFileSync(FAQ_CSV, 'utf8');
  else return 'keine Quelle (REDAKTION_CSV_URL oder faq.csv)';
  const r = readFaqCsv(text);
  if (!r.eintraege.length) throw new Error('keine gültigen Einträge' + (r.fehler.length ? ': ' + r.fehler.slice(0, 3).join(' · ') : ''));
  faqData = { t: Date.now(), quelle: 'Redaktion barrierefrAI', eintraege: r.eintraege, fehler: r.fehler };
  fs.writeFileSync(FAQ_JSON + '.tmp', JSON.stringify(faqData));
  fs.renameSync(FAQ_JSON + '.tmp', FAQ_JSON);
  faqData.gz = null;
  return `${r.eintraege.length} Hinweise${r.fehler.length ? ', ' + r.fehler.length + ' Hinweise zur Tabelle: ' + r.fehler.join(' · ') : ''}`;
}
function faqTick() {
  if (faqRun || (!FAQ_URL && !fs.existsSync(FAQ_CSV))) return;
  faqRun = refreshFaq().then((m) => console.log('Redaktion:', m)).catch((e) => console.error('Redaktion:', e.message)).finally(() => { faqRun = null; });
}
function sendFaq(req, res, origin) {
  if (!faqData.gz) { const raw = JSON.stringify({ t: faqData.t, quelle: faqData.quelle, eintraege: faqData.eintraege }); faqData.raw = raw; faqData.gz = zlib.gzipSync(raw, { level: 9 }); faqData.etag = '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"'; }
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: faqData.etag, Vary: 'Origin, Accept-Encoding' };
  if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'ETag' });
  if (req.headers['if-none-match'] === faqData.etag) { res.writeHead(304, h); return res.end(); }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gz) h['Content-Encoding'] = 'gzip';
  res.writeHead(200, h);
  res.end(gz ? faqData.gz : faqData.raw);
}

function send(res, status, obj, origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
  res.writeHead(status, h);
  res.end(obj == null ? '' : JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('zu groß'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { reject(Object.assign(new Error('kein JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/^\/flowtown-api/, '');   // läuft auch hinter einem Pfad im Webserver
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    if (req.method === 'OPTIONS') return send(res, 204, null, origin);
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, ki: !!MISTRAL_KEY, modell: MISTRAL_MODEL, kMin: K_MIN, lage: { here: !!HERE_KEY, autobahn: LAGE_ROADS }, ziel: !!HERE_KEY, pilot: true, oepnv: true, radnetz: true, fussnetz: true, hinweise: true, barrierefrei: !!(bf && bf.t), faqOrte: bf && bf.faqOrte ? Object.keys(bf.faqOrte) : [], redaktion: faqData && faqData.eintraege ? { hinweise: faqData.eintraege.length, stand: new Date(faqData.t).toISOString(), tabellenhinweise: (faqData.fehler || []).length } : false, fahrplan: fahrplan ? { stand: fahrplan.stand, gilt: fahrplan.gilt } : false }, origin);
    if (req.method === 'POST' && p === '/api/wir') return send(res, 200, { ok: true, n: addWir(await readBody(req, 64 * 1024)) }, origin);
    if (req.method === 'GET' && p === '/api/wir') {
      const ids = (url.searchParams.get('s') || '').split(',').filter((s) => /^c\d{1,13}$/.test(s)).slice(0, 400);
      return send(res, 200, { kMin: K_MIN, werte: readWir(ids) }, origin);
    }
    if (req.method === 'POST' && p === '/api/ki') {
      if (!kiAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren KI-Einschätzungen möglich.' }, origin);
      const body = await readBody(req, 48 * 1024);
      return send(res, 200, await askMistral(body.facts || {}), origin);
    }
    if (req.method === 'GET' && p === '/api/lage') return send(res, 200, await readLage(), origin);
    if (req.method === 'GET' && p === '/api/oepnv') return send(res, 200, await readMobiel(), origin);
    if (req.method === 'GET' && p === '/api/faq') return faqData && faqData.eintraege ? sendFaq(req, res, origin) : send(res, 404, { fehler: 'Keine Redaktions-Tabelle eingerichtet.' }, origin);
    if (req.method === 'GET' && p === '/api/hinweise') return send(res, 200, { t: Date.now(), hinweise: hinweise.filter((h) => h.bis > Date.now() && h.weg < 2).map(({ id, lat, lon, art, t, t2, ok, weg, geprueft }) => ({ id, lat, lon, art, t, t2, ok, weg, geprueft })) }, origin);
    if (req.method === 'POST' && p === '/api/hinweis') {
      if (!hinweisAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Meldungen möglich.' }, origin);
      return send(res, 200, { ok: true, hinweis: addHinweis(await readBody(req, 2048)) }, origin);
    }
    if (req.method === 'POST' && p === '/api/hinweis/stimme') {
      if (!hinweisAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Meldungen möglich.' }, origin);
      const b = await readBody(req, 1024);
      return send(res, 200, { ok: true, hinweis: voteHinweis(String(b.id || ''), b.stimmt === true) }, origin);
    }
    if (req.method === 'GET' && p === '/api/barrierefrei') {
      if (!bf || !bf.t) { bfTick(); return send(res, 404, { fehler: 'Die Angaben zur Barrierefreiheit werden gerade geladen.' }, origin); }
      return sendBf(req, res, origin);
    }
    if (req.method === 'GET' && p === '/api/fussnetz') {
      const k = url.searchParams.get('k') || '';
      if (!radKeyOk(k)) return send(res, 400, { fehler: 'Unbekannte Kachel.' }, origin);
      try { return await sendFuss(req, res, origin, k); } catch (e) { return send(res, 502, { fehler: 'Fußwege gerade nicht abrufbar: ' + e.message }, origin); }
    }
    if (req.method === 'GET' && p === '/api/radnetz') {
      const k = url.searchParams.get('k') || '';
      if (!radKeyOk(k)) return send(res, 400, { fehler: 'Unbekannte Kachel.' }, origin);
      try { return await sendRad(req, res, origin, k); } catch (e) { return send(res, 502, { fehler: 'Radwege gerade nicht abrufbar: ' + e.message }, origin); }
    }
    if (req.method === 'GET' && p === '/api/fahrplan') return fahrplan ? sendFahrplan(req, res, origin) : send(res, 404, { fehler: 'Noch kein Fahrplan auf dem Server.' }, origin);
    if (req.method === 'GET' && (p === '/api/ort' || p === '/api/ziel')) {
      if (!HERE_KEY) return send(res, 503, { fehler: 'Ziel-Prüfung braucht einen HERE-Schlüssel auf dem Server.' }, origin);
      if (p === '/api/ort') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
        if (q.length < 2) return send(res, 400, { fehler: 'Bitte einen Ort eingeben.' }, origin);
        if (!ortAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Suchen möglich.' }, origin);
        return send(res, 200, { orte: await findOrt(q) }, origin);
      }
      // Start auf etwa 1 km gerundet; bei Bus und Bahn darf er eine gewählte Haltestelle sein (öffentlicher Ort, genau)
      // zu Fuß auf etwa 100 m gerundet: Fußwege sind kurz, ein Start 1 km daneben ergäbe einen anderen Weg
      const m = url.searchParams.get('mode'), mode = m === 'rad' ? 'rad' : m === 'oepnv' ? 'oepnv' : m === 'fuss' ? 'fuss' : 'auto';
      const from = coord(url.searchParams.get('from'), mode === 'oepnv' && url.searchParams.get('ab') === 'halt' ? 4 : mode === 'fuss' ? 3 : 2), to = coord(url.searchParams.get('to'), 4);
      if (!zielAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Prüfungen möglich.' }, origin);
      return send(res, 200, mode === 'oepnv' ? await checkZielOepnv(from, to) : await checkZiel(from, to, mode), origin);
    }
    if (req.method === 'POST' && p.startsWith('/api/pilot/')) {
      if (!pilotAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Übertragungen möglich.' }, origin);
      const body = await readBody(req, 5 * 1024 * 1024);
      const h = knownCode(body.code);
      if (!h) return send(res, 403, { fehler: 'Diesen Pilot-Code kennt der Server nicht.' }, origin);
      const act = p.slice('/api/pilot/'.length);
      if (act === 'check') return send(res, 200, { ok: true, n: Object.keys(readPilot(h).trips).length }, origin);
      if (act === 'upload') return send(res, 200, pilotUpload(h, body.trips), origin);
      if (act === 'restore') return send(res, 200, { trips: Object.values(readPilot(h).trips).map((t) => { const c = Object.assign({}, t); delete c.empfangen; return c; }) }, origin);
      if (act === 'delete') { try { fs.unlinkSync(pilotPath(h)); } catch (e) { /* war schon leer */ } return send(res, 200, { ok: true }, origin); }
      return send(res, 404, { fehler: 'unbekannt' }, origin);
    }
    if (req.method === 'GET' && p === '/api/news') return send(res, 200, { meldungen: readNews() }, origin);
    return send(res, 404, { fehler: 'unbekannt' }, origin);
  } catch (e) {
    const status = e.status || (e.message === 'cid' || e.message === 'items' ? 400 : 500);
    if (status >= 500) console.error(new Date().toISOString(), p, e.message);
    return send(res, status, { fehler: status >= 500 ? 'Serverfehler' : e.message }, origin);
  }
});
// Verwaltung von der Kommandozeile: neue Pilot-Codes, Export aller Pilotfahrten
const cli = process.argv[2];
if (cli === 'neue-codes') {
  for (const c of newCodes(Math.max(1, Math.min(100, Number(process.argv[3]) || 1)))) console.log(`${c.code}   (Pseudonym im Export: ${c.pseudonym})`);
  console.log('Liste der Codes nur bei dir aufbewahren. Der Server speichert nur einen Hash.');
  process.exit(0);
}
if (cli === 'export') { process.stdout.write(JSON.stringify(exportPilot(), null, 1) + '\n'); process.exit(0); }
if (cli === 'faq') {
  refreshFaq().then((m) => { console.log(m); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
} else if (cli === 'hinweise') {
  // gemeldete Hindernisse anzeigen: Kennung, Art, Ort, Alter, Bestätigungen
  const list = hinweise.filter((h) => h.bis > Date.now()).sort((a, b) => b.t - a.t);
  for (const h of list) console.log(h.id, (HINWEIS_ART[h.art] ? h.art : '?').padEnd(10), `${h.lat}, ${h.lon}`.padEnd(20), new Date(h.t).toLocaleDateString('de-DE').padEnd(11), `${h.ok}× bestätigt, ${h.weg}× „ist weg“`, h.geprueft ? 'GEPRÜFT' : '', `https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}#map=19/${h.lat}/${h.lon}`);
  console.log(list.length + ' Hinweise. Ändern: node flowtown-server.mjs hinweis <Kennung> geprueft|weg');
  process.exit(0);
} else if (cli === 'hinweis') {
  const [id, act] = process.argv.slice(3);
  const h = hinweise.find((x) => x.id === id);
  if (!h || !['geprueft', 'weg'].includes(act)) { console.error('Aufruf: node flowtown-server.mjs hinweis <Kennung> geprueft|weg'); process.exit(1); }
  if (act === 'weg') hinweise = hinweise.filter((x) => x !== h);
  else { h.geprueft = true; h.bis = Date.now() + 5 * 365 * 864e5; }
  fs.writeFileSync(HINWEIS_FILE, JSON.stringify(hinweise));
  console.log(act === 'weg' ? 'Gelöscht.' : 'Als geprüft markiert.', 'Jetzt: sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown');
  process.exit(0);
} else if (cli === 'faq-ort') {
  // einen Ort von Hand festlegen oder die Festlegung aufheben: faq-ort "Alter Markt" 52.0214 8.5339  |  faq-ort "Alter Markt" weg
  const [n, a, b] = process.argv.slice(3);
  if (!bf || !n) { console.error('Aufruf: node flowtown-server.mjs faq-ort "Alter Markt" 52.0214 8.5339   (oder: … weg)'); process.exit(1); }
  bf.faqFest = bf.faqFest || {};
  if (a === 'weg') delete bf.faqFest[n];
  else if (isFinite(Number(a)) && isFinite(Number(b))) bf.faqFest[n] = [r5(Number(a)), r5(Number(b))];
  else { console.error('Bitte Breite und Länge angeben, z. B. 52.0214 8.5339'); process.exit(1); }
  if (bf.faqOrte) { if (a === 'weg') delete bf.faqOrte[n]; else bf.faqOrte[n] = Object.assign(bf.faqOrte[n] || { g: [] }, { c: bf.faqFest[n], q: 'fest' }); }
  if (a === 'weg') bf.faqOrteV = 0;   // beim nächsten Start neu bestimmen
  fs.writeFileSync(BF_FILE, JSON.stringify(Object.assign({}, bf, { gz: undefined, raw: undefined })));
  console.log(a === 'weg' ? n + ': Festlegung aufgehoben.' : `${n}: festgelegt auf ${bf.faqFest[n].join(', ')}.`, 'Jetzt: sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown');
  process.exit(0);
} else if (cli === 'faq-orte') {
  loadFahrplan();
  faqOrte().then((o) => {
    for (const [n, v] of Object.entries(o)) console.log(n.padEnd(20), v.c.join(', ').padEnd(20), { here: 'HERE', osm: 'OpenStreetMap', fest: 'von Hand', fahrplan: 'Fahrplan' }[v.q] || '', v.g.length ? `(${v.g.length} Linien)` : '');
    if (bf && Object.keys(o).length >= 4) { bf.faqOrte = o; bf.faqOrteV = 3; fs.writeFileSync(BF_FILE, JSON.stringify(Object.assign({}, bf, { gz: undefined, raw: undefined }))); console.log('Gespeichert. Jetzt neu starten: sudo systemctl restart flowtown'); }
    process.exit(0);
  }).catch((e) => { console.error(e.message); process.exit(1); });
} else if (cli === 'barrierefrei') {
  refreshBf().then((m) => { console.log(m); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
} else if (cli === 'fahrplan') {
  refreshFahrplan().then((m) => { console.log(m); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
} else if (cli) {
  console.error('Unbekannt: ' + cli + '. Möglich: neue-codes <Anzahl>, export, fahrplan, barrierefrei, faq-orte, faq-ort, faq, hinweise, hinweis'); process.exit(1);
} else {
  loadFahrplan();
  setTimeout(fahrplanTick, 5000); setInterval(fahrplanTick, 3600e3);
  setTimeout(() => radTick().then(fussTick), 20000); setInterval(() => radTick().then(fussTick), 1800e3);
  setTimeout(bfTick, 10000); setInterval(bfTick, 900e3);
  setTimeout(faqTick, 5000); setInterval(faqTick, 3600e3);
  server.listen(PORT, HOST, () => console.log(`Flowtown-Server auf ${HOST}:${PORT}, KI ${MISTRAL_KEY ? 'an (' + MISTRAL_MODEL + ')' : 'aus'}, Verkehrslage: Autobahn ${LAGE_ROADS.join('/')}${HERE_KEY ? ' + HERE' : ''}, Fahrplan: ${fahrplan ? fahrplan.stand : DELFI_URL ? 'wird geladen' : 'aus'}`));
}
