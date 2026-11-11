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
import readline from 'node:readline';

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
- Ist ein Profil zur Barrierefreiheit gesetzt ("profil_barrierefrei"), achte besonders auf Wege zu Fuß, Umstiege und Grünzeiten.
  Mindestens eine Empfehlung betrifft dann das Profil und stützt sich auf "barrierefrei_hinweise" (Haltestellen ohne Stufen,
  Ampeln mit oder ohne Tonsignal, Orte an den Zielen). Was dort nicht steht, behauptest du nicht.
- Steht "fokus_verkehrsmittel" in den Daten, hat die Person die Tipps für dieses Verkehrsmittel gewählt. Alle Werte gelten nur dafür.
  Sprich nur über dieses Verkehrsmittel und nenne es in der Einschätzung.
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
const LAGE_ROADS = (process.env.LAGE_ROADS || 'A2,A33,A44').split(',').map((s) => s.trim()).filter((s) => /^[A-Z]\d{1,4}$/.test(s));
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

const lage = { here: { items: [], t: 0 }, autobahn: { items: [], t: 0 }, stadt: { items: [], t: 0 }, nrw: { items: [], t: 0 } };
let stadtBauAt = 0;
let lageAt = 0, lageRun = null;
async function refreshLage() {
  nrwWanted = Date.now(); nrwTick();
  const jobs = { autobahn: autobahn() };
  if (nrwItems().length || Object.values(nrw).some((q) => q.t)) jobs.nrw = Promise.resolve(nrwItems().filter((it) => it.pts.some((q) => inBox(q[0], q[1], 0.05))));
  if (HERE_KEY) jobs.here = Promise.all([hereFlow(), hereIncidents()]).then(([a, b]) => a.concat(b));
  // Baustellen der Stadt ändern sich selten: höchstens alle 30 Minuten
  if (STADT_ON && Date.now() - stadtBauAt > 30 * 60000) { stadtBauAt = Date.now(); jobs.stadt = stadtBaustellen(); }
  // alle gemeinsam abwarten: sonst bleibt ein früher Fehler (etwa HERE nicht erreichbar) unbehandelt und beendet den Server
  const names = Object.keys(jobs), done = await Promise.allSettled(Object.values(jobs));
  done.forEach((r, k) => {
    if (r.status === 'fulfilled') lage[names[k]] = { items: r.value, t: Date.now() };
    else console.error(new Date().toISOString(), 'Lage', names[k], r.reason && r.reason.message);   // ältere Werte bleiben bis 30 Minuten stehen
  });
  lageAt = Date.now();
}
async function readLage() {
  if (Date.now() - lageAt > LAGE_MIN * 60000) {
    lageRun = lageRun || refreshLage().finally(() => { lageRun = null; });
    await lageRun;
  }
  const fresh = Object.entries(lage).filter(([k, v]) => v.t && Date.now() - v.t < (k === 'stadt' ? 6 * 3600e3 : 30 * 60000));
  return {
    t: Math.min(...fresh.filter(([k]) => k !== 'stadt').map(([, v]) => v.t).concat(lageAt || Date.now())),
    quellen: fresh.map(([k, v]) => ({ name: k === 'here' ? 'HERE' : k === 'stadt' ? 'Stadt Bielefeld' : k === 'nrw' ? 'Straßen.NRW' : 'Autobahn GmbH', t: v.t })),
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
// Weitere Städte aus demselben DELFI-Datensatz: alle Busse und Bahnen, die dort halten (Muster „*“), Stadt- und Regionsrahmen Süd,Nord,West,Ost.
// Abschalten oder wählen mit FAHRPLAN_STAEDTE in /etc/flowtown.env (kommagetrennt, leer = nur Bielefeld).
const STADT_FP = {
  moenchengladbach: { name: 'Mönchengladbach', muster: '*', stadt: '51.10,51.26,6.30,6.58', region: '50.95,51.45,6.00,6.95' },
  paderborn: { name: 'Paderborn', muster: '*', stadt: '51.68,51.80,8.66,8.86', region: '51.45,52.10,8.10,9.30' }
};
const FP_STAEDTE = [{ id: 'bielefeld', name: 'Bielefeld', file: FAHRPLAN_FILE, muster: FAHRPLAN_AGENCY, stadt: '', region: '', box: [51.90, 52.12, 8.38, 8.70] }]
  .concat((process.env.FAHRPLAN_STAEDTE == null ? 'moenchengladbach,paderborn' : process.env.FAHRPLAN_STAEDTE).split(',').map((x) => x.trim().toLowerCase()).filter((x) => STADT_FP[x])
    .map((id) => Object.assign({ id, file: path.join(DATA_DIR, `fahrplan-${id}.json`), box: STADT_FP[id].stadt.split(',').map(Number) }, STADT_FP[id])));
let fahrplan = null, fahrplanRun = null, fahrplanTry = 0;   // Bielefeld: { stand, gilt, json (gzip), etag }
const fahrplaene = {};   // je Stadt dasselbe
function loadFahrplan() {
  for (const c of FP_STAEDTE) {
    try {
      const raw = fs.readFileSync(c.file);
      const d = JSON.parse(raw);
      let ids = null;
      try { ids = JSON.parse(fs.readFileSync(c.file.replace(/\.json$/, '.ids.json'), 'utf8')); if (!Array.isArray(ids) || ids.length !== d.trips.length) ids = null; } catch (e) { ids = null; }
      fahrplaene[c.id] = { id: c.id, name: c.name, box: c.box, stand: d.stand, gilt: d.gilt, gz: zlib.gzipSync(raw, { level: 9 }), raw, etag: '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"', t: fs.statSync(c.file).mtimeMs, ids };
    } catch (e) { if (e.code !== 'ENOENT') console.error(`Fahrplan ${c.name}:`, e.message); }
  }
  fahrplan = fahrplaene.bielefeld || null;
}
// Stadt mit Fahrplan an einer Stelle (Rahmen Süd, Nord, West, Ost)
const fpStadtAt = (pos) => (pos ? FP_STAEDTE.find((c) => fahrplaene[c.id] && pos[0] >= c.box[0] && pos[0] <= c.box[1] && pos[1] >= c.box[2] && pos[1] <= c.box[3]) : null);
async function refreshFahrplan() {
  if (!DELFI_URL) throw new Error('DELFI_GTFS_URL fehlt in /etc/flowtown.env');
  const zip = path.join(DATA_DIR, 'delfi-gtfs.zip');
  try {
    const res = await fetch(DELFI_URL, { headers: { 'User-Agent': 'Flowtown-Prototyp (info@barrierefrai.com)' } });
    if (!res.ok || !/zip|octet/.test(res.headers.get('content-type') || '')) throw new Error('Download: HTTP ' + res.status + ' ' + (res.headers.get('content-type') || ''));
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
    const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'fahrplan-bielefeld.py');
    const run = (c) => new Promise((resolve, reject) => {
      const p = spawn('python3', [script, zip, c.file, c.muster, c.stadt, c.region]);
      let log = '';
      p.stdout.on('data', (x) => { log += x; }); p.stderr.on('data', (x) => { log += x; });
      p.on('error', (e) => reject(new Error('python3 nicht gefunden: ' + e.message)));
      p.on('close', (code) => (code === 0 ? resolve(log.trim()) : reject(new Error('Auszug: ' + log.trim().slice(-300)))));
    });
    // nacheinander, damit der Speicher reicht; eine Stadt, die nicht klappt, hält die anderen nicht auf
    const msgs = [];
    for (const c of FP_STAEDTE) {
      try { msgs.push(`${c.name}: ${await run(c)}`); } catch (e) { if (c.id === 'bielefeld') throw e; msgs.push(`${c.name}: ${e.message}`); }
    }
    loadFahrplan();
    hstTick();
    return msgs.join(' | ');
  } finally { fs.rmSync(zip, { force: true }); }
}
// stündlich prüfen: fehlt der Fahrplan oder ist er älter als 7 Tage, nachts zwischen 3 und 5 Uhr neu holen
function fahrplanTick() {
  if (!DELFI_URL || fahrplanRun) return;
  const age = fahrplan ? Date.now() - fahrplan.t : Infinity, h = new Date().getHours();
  // eine neu eingetragene Stadt fehlt noch: einmal am Tag gleich nachholen
  const fehlt = FP_STAEDTE.some((c) => !fahrplaene[c.id] || (MOBI_ON && !fahrplaene[c.id].ids)) && Date.now() - fahrplanTry > 864e5;
  if (age === Infinity || fehlt || (age > 7 * 864e5 && h >= 3 && h < 5)) {
    fahrplanTry = Date.now();
    fahrplanRun = refreshFahrplan().then((m) => console.log('Fahrplan:', m)).catch((e) => console.error('Fahrplan:', e.message)).finally(() => { fahrplanRun = null; });
  }
}
function sendFahrplan(req, res, origin, fahrplan) {
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
  if (opts.full && mode === 'fuss') { q.set('return', 'summary,polyline,actions,instructions'); q.set('spans', 'names'); q.set('lang', 'de-DE'); }
  else if (opts.full) { q.set('return', 'summary,polyline,typicalDuration,incidents,actions,instructions'); q.set('spans', mode === 'auto' ? 'routeNumbers,names,incidents,dynamicSpeedInfo' : 'routeNumbers,names,incidents'); q.set('lang', 'de-DE'); if (opts.via) q.append('via', opts.via.join(',') + '!passThrough=true'); else if (mode !== 'rad') q.set('alternatives', mode === 'auto' ? '3' : '1'); }
  else q.set('return', 'summary');
  if (opts.at) q.set('departureTime', opts.at);
  const j = await getJson(`${ROUTER_URL}?${q}`, 12000);
  return (j.routes || []).map((r) => {
    const secs = r.sections || [];
    const sum = (k) => secs.reduce((a, x) => a + (Number(x.summary && x.summary[k]) || 0), 0);
    const pts = [], spans = [], roads = [], acts = [];
    let incs = null;
    if (opts.full) {
      for (const x of secs) {
        const base = pts.length;
        const sp = x.polyline ? decodeFlex(x.polyline) : [];
        pts.push(...sp);
        // Abbiegehinweise für die Navigation: Art, Richtung, nächste Straße, Stelle auf der Strecke
        for (const a of x.actions || []) {
          const nr = a.nextRoad || {};
          acts.push({ i: base + (Number(a.offset) || 0), art: clip(a.action, 20), dir: clip(a.direction, 10), sev: clip(a.severity, 10), exit: Number(a.exit) || null,
            str: clip((nr.name || []).map(txt).find(Boolean) || '', 50), nr: clip((nr.number || []).map(txt).find(Boolean) || '', 10), text: clip(txt(a.instruction), 160) });
        }
        for (const s of x.spans || []) {
          const num = (s.routeNumbers || []).map((n) => txt(n).replace(/\s+/g, '')).find(Boolean) || '';
          const name = (s.names || []).map(txt).find(Boolean) || '';
          const dy = s.dynamicSpeedInfo;
          spans.push({ i: base + (Number(s.offset) || 0), num, name, inc: Array.isArray(s.incidents) ? s.incidents : [], v: dy && Number(dy.trafficSpeed) > 0 && Number(dy.baseSpeed) > 0 ? [Number(dy.trafficSpeed), Number(dy.baseSpeed)] : null });
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
    return { dauer: sum('duration'), basis: sum('baseDuration') || sum('typicalDuration') || sum('duration'), m: sum('length'), pts, spans, roads, incs, acts };
  });
}
// Adresse mit Hausnummer zu einem Punkt (HERE Rückwärtssuche), für „Wo bin ich?“
async function addrAt(lat, lon) {
  const j = await getJson(`${REVGEO_URL}?${new URLSearchParams({ at: `${lat},${lon}`, lang: 'de-DE', limit: '5', apiKey: HERE_KEY })}`, 6000);
  const items = j.items || [];
  const it = items.find((x) => x.address && x.address.houseNumber) || items.find((x) => x.address && x.address.street) || null;
  if (!it) return null;
  const a = it.address || {};
  return { strasse: clip(a.street || '', 60), nr: clip(a.houseNumber || '', 10), teil: clip(a.district || '', 40), m: it.distance != null ? Math.round(it.distance) : null };
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
// zusammenhängende Abschnitte mit Stau (unter 45 % der freien Geschwindigkeit) oder zähem Verkehr (unter 70 %)
const fmtKm = (m) => (m >= 1000 ? `${String(Math.round(m / 100) / 10).replace('.', ',')} km` : `${Math.round(m / 100) * 100} m`);
function flowStretches(spans, cum) {
  const out = [];
  let cur = null;
  const end = (k) => (k + 1 < spans.length ? spans[k + 1].i : cum.length - 1);
  const close = () => {
    if (!cur) return;
    const len = cum[cur.i1] - cum[cur.i0], art = cur.tt * 0.45 > cur.tb ? 'stau' : 'zaeh';
    // Stau ab 500 m, zäh ab 1,5 km; jeweils mindestens eine Minute länger
    if (cur.delay >= 60 && len >= (art === 'stau' ? 500 : 1500)) out.push({ i0: cur.i0, i1: cur.i1, art, delay: Math.round(cur.delay), vt: len / cur.tt, vb: len / cur.tb });
    cur = null;
  };
  spans.forEach((sp, k) => {
    const len = Math.max(0, cum[end(k)] - cum[sp.i]);
    const slow = sp.v && sp.v[1] > 5 && sp.v[0] < sp.v[1] * 0.7;
    if (slow && len > 0) {
      if (cur && cum[sp.i] - cum[cur.i1] > 400) close();
      cur = cur || { i0: sp.i, i1: sp.i, tt: 0, tb: 0, delay: 0 };
      cur.i1 = end(k); cur.tt += len / sp.v[0]; cur.tb += len / sp.v[1]; cur.delay += len / sp.v[0] - len / sp.v[1];
    } else if (cur && len > 400) close();
  });
  close();
  return out;
}
// Ausweichroute: deutlich schneller (10 min), oder bei Stau auf der Strecke eine kaum langsamere, die den Stau umfährt
// (so wie Karten-Apps um einen Stau herumführen). Zwischenpunkt „via“: Stelle der Ausweichroute, die am weitesten von der Strecke weg liegt
function pickAlt(main, alts, stauAt) {
  const stauMin = stauAt.reduce((a, x) => a + (Number(x.it.delay) || 0), 0) / 60;
  let best = null;
  for (const a of alts) {
    if (!a || a.pts.length < 2) continue;
    const ohne = stauAt.filter((x) => x.p && nearRoute(x.p, a.pts).d > 300).map((x) => x.it);
    const ohneMin = ohne.reduce((s, it) => s + (Number(it.delay) || 0), 0) / 60;
    const mehr = (a.dauer - main.dauer) / 60;
    const ok = mehr <= -10 || (ohne.length && (ohneMin >= 3 || stauMin >= 5) && mehr <= Math.max(5, main.dauer / 60 * 0.05));
    if (!ok) continue;
    const score = mehr - ohneMin;
    if (!best || score < best.score) best = { a, ohne, mehr, score };
  }
  if (!best) return null;
  const a = best.a, ac = [0];
  for (let k = 1; k < a.pts.length; k++) ac.push(ac[k - 1] + segDist(a.pts[k], a.pts[k - 1], a.pts[k - 1]));
  let far = { d: -1, p: null };
  for (let k = 0; k < a.pts.length; k += Math.max(1, Math.floor(a.pts.length / 300))) { const d = nearRoute(a.pts[k], main.pts).d; if (d > far.d) far = { d, p: a.pts[k] }; }
  const stau = flowStretches(a.spans, ac).filter((x) => x.art === 'stau').reduce((s, x) => s + x.delay, 0);
  return { dauer: a.dauer, km: Math.round(a.m / 100) / 10, mehr_min: Math.round(best.mehr), strassen: a.roads.filter((r) => !main.roads.includes(r)).slice(0, 4),
    ohne: best.ohne.map((it) => it.titel).filter(Boolean).slice(0, 3), stau_min: Math.round(stau / 60),
    via: far.p && far.d > 500 ? [r5(far.p[0]), r5(far.p[1])] : null,
    nav: a.pts.length <= 5000 && a.acts.length ? { pts: a.pts.map((q) => [Math.round(q[0] * 1e5) / 1e5, Math.round(q[1] * 1e5) / 1e5]), schritte: a.acts } : null };
}
const RAMPE = /Sperrung einer Anschlussstelle|Auffahrt|Ausfahrt|Abfahrt|Rampe|\bVon A\d+:/i;
async function checkZiel(from, to, mode, nav, via) {
  const key = [from, to, mode, nav ? 'n' : '', via || ''].join('|');
  const hit = zielCache.get(key);
  if (hit && Date.now() - hit.t < 180000) return hit.v;
  const [main, ...alts] = await hereRoute(from, to, mode, { full: true, via });
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
      // gesperrte Auf- und Abfahrten oder Rampen von einer anderen Autobahn sperren nicht die Strecke selbst:
      // nur nennen, wenn sie am Anfang oder Ende der Strecke liegen (dort fährt man auf oder ab)
      if (fromAb && it.art === 'sperrung' && RAMPE.test((it.titel || '') + ' ' + (it.text || '')) && !/vollsperrung/i.test((it.titel || '') + ' ' + (it.text || ''))) {
        const a0 = onRoute(it, P, 60);
        if (a0 == null || (cum[a0] > 3000 && cum[cum.length - 1] - cum[a0] > 3000)) continue;
      }
      if (fromAb && main.incs && !['sperrung', 'stau'].includes(it.art)) continue;   // Baustellen meldet HERE schon auf der Strecke
      const at = onRoute(it, P, fromAb && it.pts.length === 1 ? 60 : 30);
      if (at == null) continue;
      seen.add(it.id);
      items.push(Object.assign({}, it, { at, titel: fromAb ? abTitle(it.titel) : null }));
    }
  });
  // 2a. Straßen.NRW: Meldungen, Baustellen und Umleitungen auch abseits der Autobahnen; nicht doppelt zu schon gefundenen
  nrwWanted = Date.now(); nrwTick();
  for (const it of nrwItems()) {
    if (seen.has(it.id) || !keep(it.art)) continue;
    if (it.art === 'sperrung' && RAMPE.test((it.titel || '') + ' ' + (it.text || '')) && !/vollsperrung/i.test(it.text || '')) {
      const a0 = onRoute(it, P, 60);
      if (a0 == null || (cum[a0] > 3000 && cum[cum.length - 1] - cum[a0] > 3000)) continue;
    }
    const at = onRoute(it, P, it.pts.length === 1 ? 60 : 30);
    if (at == null || items.some((x) => x.at != null && x.art === it.art && Math.abs(cum[x.at] - cum[at]) < 1500)) continue;
    seen.add(it.id);
    items.push(Object.assign({}, it, { at }));
  }
  // 2b. Stau und zäher Verkehr aus der aktuellen Geschwindigkeit je Abschnitt (wie die roten Abschnitte in Karten-Apps), auch ohne Meldung
  if (mode === 'auto') for (const st of flowStretches(main.spans, cum)) {
    const km0 = cum[st.i0], km1 = cum[st.i1];
    // schon als Stau gemeldet (Autobahn GmbH, HERE)? Dann nur dort ergänzen, wo noch nichts steht
    if (items.some((it) => ['stau', 'zaeh', 'sperrung', 'unfall'].includes(it.art) && it.at != null && cum[it.at] >= km0 - 1500 && cum[it.at] <= km1 + 1500)) continue;
    items.push({ id: 'fl' + st.i0, quelle: 'HERE', art: st.art, at: st.i0, delay: st.delay,
      text: `${st.art === 'stau' ? 'Stau' : 'Zähfließender Verkehr'} auf etwa ${fmtKm(km1 - km0)}, im Schnitt ${Math.round(st.vt * 3.6)} statt ${Math.round(st.vb * 3.6)} km/h`, pts: thin(P.slice(st.i0, st.i1 + 1)) });
  }
  // 3. Baustellen der Stadt: Punkte bis 40 m neben der Strecke; zu Fuß mit dem Hinweis für den Fußverkehr
  for (const it of lage.stadt.items || []) {
    if (seen.has(it.id) || !keep(it.art)) continue;
    const at = onRoute(it, P, 40);
    if (at == null) continue;
    seen.add(it.id);
    items.push(Object.assign({}, it, { at, text: mode === 'fuss' && it.fuss ? it.fuss : it.text }));
  }
  // Straße und Ort benennen: „A2 bei Kamen“, sortiert nach Schwere und Lage
  const RANK = { sperrung: 0, stau: 1, unfall: 2, zaeh: 3, baustelle: 4, warnung: 5 };
  items.sort((a, b) => RANK[a.art] - RANK[b.art] || a.at - b.at);
  await Promise.all(items.slice(0, 12).map(async (it) => {
    if (it.titel) return;
    const rd = roadAt(it.at), town = await placeNear(P[it.at]);
    const road = rd.num || rd.name || '';
    it.titel = clip(road && town ? (rd.num ? `${road} bei ${town}` : `${road}, ${town}`) : road || town || it.text || 'Meldung', 60);
  }));
  // Mitte jeder Stau-Stelle (am Anfang liegt sie oft noch neben einer Ausweichroute)
  const stauAt = items.filter((it) => ['stau', 'sperrung', 'unfall'].includes(it.art)).map((it) => ({ it, p: Array.isArray(it.pts) && it.pts.length ? it.pts[Math.floor(it.pts.length / 2)] : P[it.at] }));
  for (const it of items) { if (!it.titel) it.titel = clip(roadAt(it.at).num || roadAt(it.at).name || it.text || 'Meldung', 60); it.km = Math.round(cum[it.at] / 1000); delete it.at; }
  // doppelte Meldungen (gleiche Art, gleicher Name, gleicher Kilometer) nur einmal
  { const dup = new Set(); for (let k = items.length - 1; k >= 0; k--) { const key = items[k].art + '|' + items[k].titel + '|' + items[k].km; if (dup.has(key)) items.splice(k, 1); else dup.add(key); } }
  // Abfahrtsleiste (nur Auto): jetzt plus vier Zeiten, mit HEREs Vorhersage
  let abfahrt = null;
  if (mode === 'auto' && !nav) {
    const ts = slots(Date.now());
    const later = await Promise.allSettled(ts.map((t) => hereRoute(from, to, mode, { at: t.toISOString() })));
    abfahrt = [{ t: null, dauer: main.dauer }].concat(later.map((r, k) => (r.status === 'fulfilled' && r.value[0] ? { t: ts[k].toISOString(), dauer: r.value[0].dauer } : null)).filter(Boolean));
  }
  const alt = pickAlt(main, alts, stauAt);
  const v = {
    t: Date.now(), mode, dauer: main.dauer, basis: main.basis, km: Math.round(main.m / 100) / 10, strassen: main.roads.slice(0, 6),
    pts: thin2(main.pts, 160), items, abfahrt,
    // für die Navigation in der App: volle Strecke (auf etwa 1 m gerundet) und die Abbiegehinweise; bleibt nur im Speicher der App
    nav: main.pts.length <= 5000 && main.acts.length ? { pts: main.pts.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]), schritte: main.acts } : null,
    alternative: alt
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
  return { name: clip(name, 50), sub: clip([what].concat(where, a.countryName !== 'Deutschland' ? a.countryName : '').filter(Boolean).join(' · '), 70), stadt: a.city || '', lat: r5(x.position.lat), lon: r5(x.position.lng) };
}
async function findOrt(q, near) {
  const at = near ? near.map((x) => Number(x).toFixed(2)).join(',') : ORT_MITTE;
  const [disc, geo] = await Promise.allSettled([
    getJson(`${DISCOVER_URL}?${new URLSearchParams({ q, at, in: ORT_LAENDER, limit: '5', lang: 'de-DE', apiKey: HERE_KEY })}`),
    getJson(`${GEOCODE_URL}?${new URLSearchParams(Object.assign({ q, limit: '3', lang: 'de-DE', in: ORT_LAENDER, apiKey: HERE_KEY }, near ? { at } : {}))}`)
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
// Treppe: [Stufen oder null, 1 aufwärts / -1 abwärts in Richtung des Wegs / 0, Handlauf b beide, l links, r rechts, m Mitte, y ja, n nein, null]
function stairInfo(t) {
  const n = parseInt(t.step_count, 10), yes = (v) => /^(yes|true)$/i.test(v || '');
  const L = yes(t['handrail:left']), R = yes(t['handrail:right']), M = yes(t['handrail:center']);
  const hl = L && R ? 'b' : L ? 'l' : R ? 'r' : M ? 'm' : yes(t.handrail) ? 'y' : /^no$/i.test(t.handrail || '') ? 'n' : null;
  return [n > 0 && n < 500 ? n : null, /^up$/i.test(t.incline || '') ? 1 : /^down$/i.test(t.incline || '') ? -1 : 0, hl];
}
// Kacheln von vor den Treppen-Angaben (Stufen, Richtung, Handlauf) einmal im Hintergrund erneuern
const FUSS_V2 = Date.parse('2026-11-09T12:00:00Z');
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
            const c = fussClass(t);
            ways.push(Object.assign({ c, n: (t.name || '').slice(0, 60), g: e.geometry.map((p) => [r5(p.lat), r5(p.lon)]) }, c === 'stufen' ? { s: stairInfo(t) } : {}));
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
  else if (Date.now() - c.t > RAD_AGE || c.t < FUSS_V2) fussFetch(k).catch(() => {});
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': c.t < FUSS_V2 ? 'no-cache' : 'public, max-age=86400', ETag: c.etag, Vary: 'Origin, Accept-Encoding' };
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
  const d = [];
  for (const x of Object.values(all)) {
    const m = /^gebaeude_field(\d+)$/.exec(x.id || '');
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 11 || n === 15) continue;   // Erfassung, Adresse, Kontakt
    const v = bfText(x.value), a = x.annotation && x.annotation.value ? bfText(x.annotation.value) : '';
    if ((!v || /^nicht relevant$/i.test(v)) && !a) continue;
    d.push([n, clip(bfText(x.label).replace(/\s*\?\s*$/, '?'), 120), clip(v, 40), clip(a, 200)]);
  }
  d.sort((p, q) => p[0] - q[0]);
  return {
    d, stand2: val('gebaeude_field2'),
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
// Merkmale von Ampeln aus Rückfragen nach der Fahrt (Tonsignal, Bodenleitstreifen): nur Ort der Ampel, Merkmal, Antwort, Tag
const MERKMAL_FILE = path.join(DATA_DIR, 'merkmale.json');
let merkmale = [];
try { merkmale = JSON.parse(fs.readFileSync(MERKMAL_FILE, 'utf8')); } catch (e) { merkmale = []; }
function addMerkmale(b) {
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 12);
  const day = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const it of items) {
    const lat = Number(it.lat), lon = Number(it.lon);
    if (!inBox(lat, lon, 0.2) || !['ton', 'leit'].includes(it.m) || ![0, 1].includes(it.v)) continue;
    merkmale.push({ lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, m: it.m, v: it.v, tag: day });
    n++;
  }
  if (merkmale.length > 50000) merkmale = merkmale.slice(-50000);
  fs.writeFileSync(MERKMAL_FILE + '.tmp', JSON.stringify(merkmale));
  fs.renameSync(MERKMAL_FILE + '.tmp', MERKMAL_FILE);
  return n;
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
      try { const o = await bfBuilding(s); if (o && !orte.some((x) => x.id === o.id)) orte.push(o); } catch (e) { /* einzelnes Gebäude überspringen */ }   // manche Adressen liefern dasselbe Gebäude
      await new Promise((r) => setTimeout(r, 1200));
    }
    if (orte.length) {
      // Einzelangaben bleiben auf dem Server (für Frag Flowtown), die App lädt nur die kurze Liste
      out.details = {};
      for (const o of orte) { out.details[o.id] = { d: o.d, stand: o.stand2 || o.stand }; delete o.d; delete o.stand2; }
      out.dV = 1;
      out.orte = orte;
    }
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
  if (age === Infinity || (age > 7 * 864e5 && h >= 2 && h < 5) || (BF_ON && bf && bf.orte && bf.orte.length && !bf.dV && !bf.dTry)) {
    if (bf) bf.dTry = Date.now();
    bfRun = refreshBf().then((m) => console.log('Barrierefrei:', m)).catch((e) => console.error('Barrierefrei:', e.message)).finally(() => { bfRun = null; });
  }
}
function sendBf(req, res, origin) {
  if (!bf.gz) { const raw = JSON.stringify({ t: bf.t, quelle: bf.quelle, link: bf.link, orte: bf.orte, wc: wcAll(), lift: ((dl) => (bf.lift || []).filter((l) => !dl.some((d) => Math.hypot((d[0] - l[0]) * 111320, (d[1] - l[1]) * 68500) < 25)).concat(dl))(dbaLifts()), faqOrte: bf.faqOrte || null }); bf.gz = zlib.gzipSync(raw, { level: 9 }); bf.raw = raw; bf.etag = '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"'; }
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

// ---------- Stadtbahn: Haltestellen mit und ohne Hochbahnsteig (Redaktion) ----------
// Der DELFI-Fahrplan kennt für Bielefeld bei keiner Haltestelle, ob sie stufenlos ist. Diese Liste füllt die Lücke.
// Quelle: HALTESTELLEN_CSV_URL (z. B. ein zweites Blatt der Redaktions-Tabelle), sonst /var/lib/flowtown/haltestellen.csv,
// sonst server/haltestellen.csv aus dem Repository. Spalten: Haltestelle, Hochbahnsteig (ja, nein, teilweise), Hinweis, Quelle.
const HST_URL = process.env.HALTESTELLEN_CSV_URL || '';
const HST_CSV = path.join(DATA_DIR, 'haltestellen.csv'), HST_REPO = path.join(path.dirname(new URL(import.meta.url).pathname), 'haltestellen.csv');
let hst = null, hstRun = null;
const hstNorm = (n) => String(n || '').toLowerCase().replace(/^(bielefeld|bi-[^,]*),\s*/, '').replace(/ß/g, 'ss').replace(/strasse|str\.?/g, 'str').replace(/[^a-z0-9äöü]/g, '');
const fpParsedBy = {};
function fpData(id) {
  const f = fahrplaene[id || 'bielefeld'];
  if (!f) return null;
  const c = fpParsedBy[f.id];
  if (!c || c.etag !== f.etag) { fpParsedBy[f.id] = JSON.parse(f.raw); fpParsedBy[f.id].etag = f.etag; fpParsedBy[f.id].stadtName = f.name; }
  return fpParsedBy[f.id];
}
// „Bielefeld, Jahnplatz“ → „Jahnplatz“ (auch für die anderen Städte)
const fpName = (n, d) => String(n || '').replace(new RegExp('^(' + ((d && d.stadtName) || 'Bielefeld') + '|Bi-[^,]*),\\s*', 'i'), '');
// Stadtbahn-Haltestellen aus dem Fahrplan: Name (ohne „Bielefeld, “) → Bahnsteige
function tramStops() {
  const d = fpData();
  if (!d) return null;
  const tram = new Set();
  for (const t of d.trips) if (d.routes[t[0]][1] === 0) for (const si of d.patterns[t[1]]) tram.add(si);
  const by = new Map();
  for (const si of tram) {
    const st = d.stops[si], k = hstNorm(st[1]);
    if (!by.has(k)) by.set(k, { name: st[1].replace(/^(Bielefeld|Bi-[^,]*),\s*/i, ''), pos: [] });
    by.get(k).pos.push([st[2], st[3]]);
  }
  return by;
}
function readHstCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Tabelle ist leer');
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/[^a-z]/g, ''));
  const col = (...n) => head.findIndex((h) => n.includes(h));
  const c = { name: col('haltestelle', 'name'), hbs: col('hochbahnsteig', 'stufenlos'), hinweis: col('hinweis'), quelle: col('quelle') };
  if (c.name < 0 || c.hbs < 0) throw new Error('Spalten „Haltestelle“ und „Hochbahnsteig“ fehlen');
  const stops = tramStops(), out = [], fehler = [], seen = new Set();
  rows.slice(1).forEach((r, i) => {
    const v = (k) => (c[k] >= 0 ? String(r[c[k]] || '').trim() : '');
    const zeile = i + 2, name = v('name'), w = v('hbs').toLowerCase();
    if (!name || !w) return;   // ohne Angabe: noch unbekannt
    const hbs = /^(ja|j|1|yes)$/.test(w) ? 'ja' : /^(nein|n|0|no)$/.test(w) ? 'nein' : /^teil/.test(w) ? 'teilweise' : null;
    if (!hbs) { fehler.push(`Zeile ${zeile}: Hochbahnsteig „${v('hbs')}“, bitte ja, nein oder teilweise`); return; }
    const k = hstNorm(name);
    if (seen.has(k)) { fehler.push(`Zeile ${zeile}: ${name} doppelt`); return; }
    const st = stops && stops.get(k);
    if (stops && !st) { fehler.push(`Zeile ${zeile}: ${name} ist keine Stadtbahn-Haltestelle im Fahrplan`); return; }
    seen.add(k);
    const e = { name: st ? st.name : name, k, hbs, hinweis: clip(v('hinweis'), 300), quelle: clip(v('quelle'), 80) };
    if (st) { e.lat = r5(st.pos.reduce((a, p) => a + p[0], 0) / st.pos.length); e.lon = r5(st.pos.reduce((a, p) => a + p[1], 0) / st.pos.length); }
    out.push(e);
  });
  return { liste: out, fehler };
}
async function refreshHst() {
  let text, quelle;
  if (HST_URL) {
    const res = await fetch(HST_URL, { headers: { 'User-Agent': 'Flowtown/1.0' }, redirect: 'follow' });
    if (!res.ok) throw new Error('Tabelle nicht erreichbar: HTTP ' + res.status);
    text = await res.text(); quelle = 'Tabelle';
    if (/^\s*<!doctype html|<html/i.test(text)) throw new Error('Der Link liefert eine Webseite statt CSV');
  } else if (fs.existsSync(HST_CSV)) { text = fs.readFileSync(HST_CSV, 'utf8'); quelle = HST_CSV; }
  else if (fs.existsSync(HST_REPO)) { text = fs.readFileSync(HST_REPO, 'utf8'); quelle = 'server/haltestellen.csv'; }
  else return 'keine Liste';
  const r = readHstCsv(text);
  hst = { t: Date.now(), liste: r.liste, fehler: r.fehler, quelle };
  return `${r.liste.length} Haltestellen (${quelle})${r.fehler.length ? ', Hinweise zur Liste: ' + r.fehler.join(' · ') : ''}`;
}
function hstTick() {
  if (hstRun) return;
  hstRun = refreshHst().then((m) => console.log('Haltestellen:', m)).catch((e) => console.error('Haltestellen:', e.message)).finally(() => { hstRun = null; });
}
// Vorschlag aus OpenStreetMap: Bahnsteige an jeder Stadtbahn-Haltestelle, mit Höhe und Rollstuhl-Angabe
async function hstOsm() {
  const stops = tramStops();
  if (!stops) throw new Error('Noch kein Fahrplan auf dem Server');
  const b = '51.90,8.38,52.12,8.70';
  const j = await overpass(`[out:json][timeout:90];(nwr["railway"="platform"](${b});nwr["public_transport"="platform"]["tram"="yes"](${b}););out tags center;`, 120000);
  const plats = (j.elements || []).map((e) => ({ lat: e.lat != null ? e.lat : e.center && e.center.lat, lon: e.lon != null ? e.lon : e.center && e.center.lon, tags: e.tags || {} })).filter((p) => p.lat != null && p.tags.bus !== 'yes');
  const height = (t) => { const m = /([\d.,]+)\s*(cm|m)?/.exec(t.height || ''); if (!m) return null; const x = Number(m[1].replace(',', '.')); return m[2] === 'cm' || x > 5 ? x / 100 : x; };
  const out = [];
  for (const [k, st] of stops) {
    const near = plats.filter((p) => st.pos.some((q) => Math.hypot((q[0] - p.lat) * 111320, (q[1] - p.lon) * 68500) <= 35));
    const hs = near.map((p) => height(p.tags)).filter((x) => x != null), wc = near.map((p) => p.tags.wheelchair).filter(Boolean);
    let v = '?', grund = near.length ? 'Bahnsteig ohne Angaben' : 'kein Bahnsteig eingetragen';
    if (wc.includes('no') || (hs.length && Math.max(...hs) < 0.4)) { v = 'nein'; grund = wc.includes('no') ? 'wheelchair=no' : 'Höhe ' + Math.max(...hs) + ' m'; }
    else if (wc.includes('yes') || hs.some((x) => x >= 0.7)) { v = wc.includes('limited') ? 'teilweise' : 'ja'; grund = wc.includes('yes') ? 'wheelchair=yes' : 'Höhe ' + Math.max(...hs) + ' m'; }
    else if (wc.includes('limited')) { v = 'teilweise'; grund = 'wheelchair=limited'; }
    out.push({ k, name: st.name, v, grund });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// ---------- Behindertenparkplätze: Stadt Bielefeld (Open Data) und OpenStreetMap ----------
// Stadt: BEHINDERTENPARKPLAETZE_URL (CSV oder GeoJSON von open-data.bielefeld.de) oder die Datei
// /var/lib/flowtown/behindertenparkplaetze.csv bzw. .geojson. Koordinaten in WGS84 oder UTM 32 (EPSG:25832) werden erkannt.
// Dazu OpenStreetMap: einzelne Stellplätze (parking_space=disabled) und Parkplätze mit capacity:disabled.
// Einmal am Tag neu; fällt eine Quelle aus, bleibt deren letzter Stand.
// Standard: CSV-Ausgabe des Geodienstes der Stadt (Open Data Bielefeld, Datensatz „Schwerbehindertenparkplätze“, CC BY 4.0); mit 0 abschalten
const BPP_DEFAULT = 'https://www.bielefeld01.de/md/WFS/schwerbehindertenparkplatze/01?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=parken_schwerbehinderte_p&SRSNAME=EPSG:25832&OUTPUTFORMAT=text/csv';
const BPP_URL = process.env.BEHINDERTENPARKPLAETZE_URL === '0' ? '' : process.env.BEHINDERTENPARKPLAETZE_URL || BPP_DEFAULT;
const BPP_FILE = path.join(DATA_DIR, 'behindertenparkplaetze.json');
const BPP_LOCAL = ['behindertenparkplaetze.csv', 'behindertenparkplaetze.geojson', 'behindertenparkplaetze.json.src'].map((f) => path.join(DATA_DIR, f));
let bpp = null, bppRun = null, bppTry = 0;
try { bpp = JSON.parse(fs.readFileSync(BPP_FILE, 'utf8')); } catch (e) { bpp = null; }
// UTM Zone 32 Nord (ETRS89/WGS84) nach Breite und Länge
function utm32(e, n) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const x = e - 500000, mu = n / k0 / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sp = Math.sin(p1), cp = Math.cos(p1), tp = Math.tan(p1);
  const N1 = a / Math.sqrt(1 - e2 * sp * sp), T1 = tp * tp, C1 = ep2 * cp * cp, R1 = a * (1 - e2) / (1 - e2 * sp * sp) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - (N1 * tp / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / cp;
  return [lat * 180 / Math.PI, 9 + lon * 180 / Math.PI];
}
const num = (v) => { const x = Number(String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.')); return String(v || '').trim() && isFinite(x) ? x : null; };
// zwei Zahlen (erst x/Rechtswert/Länge, dann y) nach [Breite, Länge]; null, wenn nicht deutbar
function anyToWgs(a, b) {
  if (a == null || b == null) return null;
  if (a > 5 && a < 12 && b > 50 && b < 54) return [b, a];
  if (b > 5 && b < 12 && a > 50 && a < 54) return [a, b];
  if (a > 5e6 && b < 1e6) [a, b] = [b, a];
  if (a > 3e7) a -= 32e6;   // Rechtswert mit Zonenkennung 32
  if (a > 1e5 && a < 9e5 && b > 5e6 && b < 7e6) return utm32(a, b);
  return null;
}
const normKey = (h) => String(h).trim().toLowerCase().replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
// Text und Anzahl aus beliebigen Spalten
function bppProps(o) {
  const keys = Object.keys(o);
  const pick = (re) => keys.find((k) => re.test(normKey(k)) && String(o[k] == null ? '' : o[k]).trim());
  const tk = pick(/^(standort|lage|adresse|strasse|strassenname|bezeichnung|name|ort|beschreibung|bemerkung)/);
  const hk = pick(/^(hausnummer|hausnr|nr)$/);
  const nk = pick(/(anzahl|stellplaetze|plaetze|anz$|kapazitaet)/);
  const text = clip([tk ? o[tk] : '', hk ? o[hk] : ''].filter(Boolean).join(' '), 60);
  const n = nk ? num(o[nk]) : null;
  return { text, n: n != null && n > 0 && n < 100 ? Math.round(n) : null, spalten: { text: tk || null, anzahl: nk || null } };
}
function bppParse(text) {
  const out = [];
  let info = '';
  const t = text.replace(/^﻿/, '').trim();
  if (t.startsWith('{')) {
    const j = JSON.parse(t);
    for (const f of j.features || []) {
      const g = f.geometry || {};
      let c = g.coordinates;
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];   // Linie, Fläche, Mehrfachpunkt: erster Punkt
      const pos = Array.isArray(c) ? anyToWgs(c[0], c[1]) : null;
      if (!pos) continue;
      const p = bppProps(f.properties || {});
      out.push([r5(pos[0]), r5(pos[1]), p.n, p.text, 's']);
      if (!info) info = `GeoJSON, Text aus „${p.spalten.text || '–'}“, Anzahl aus „${p.spalten.anzahl || '–'}“`;
    }
  } else if (t.startsWith('<')) {
    throw new Error('XML/GML wird nicht gelesen, bitte den Link zur CSV- oder GeoJSON-Datei nehmen');
  } else {
    const rows = parseCsv(t);
    if (rows.length < 2) throw new Error('Tabelle ist leer');
    const head = rows[0].map(normKey);
    const find = (re) => head.findIndex((h) => re.test(h));
    const cLat = find(/^(lat|latitude|breite|breitengrad|ywgs84|wgs84lat|geolat)$/), cLon = find(/^(lon|lng|long|longitude|laenge|laengengrad|xwgs84|wgs84lon|geolon)$/);
    const cX = find(/^(x|rechtswert|rw|east|easting|xkoordinate|koordx|xkoord|utmx|ostwert)$/), cY = find(/^(y|hochwert|hw|north|northing|ykoordinate|koordy|ykoord|utmy|nordwert)$/);
    let cW = find(/^(wkt|geom|geometry|thegeom|shape|geometrie|msgeometry|geometriewkt)$/);
    if (cW < 0) cW = rows[0].findIndex((h, i) => /^\s*(MULTI)?(POINT|POLYGON|LINESTRING)\s*\(/i.test(rows[1][i] || ''));   // Geometrie als WKT in irgendeiner Spalte
    if (cLat < 0 && cX < 0 && cW < 0) throw new Error('keine Koordinaten-Spalten gefunden, Spalten: ' + rows[0].join(', '));
    // bei Flächen und Linien: Mittelpunkt aller Punkte der Geometrie
    const wktMid = (w) => { const ps = [...String(w || '').matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => anyToWgs(Number(m[1]), Number(m[2]))).filter(Boolean); return ps.length ? [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length] : null; };
    for (const r of rows.slice(1)) {
      const pos = cLat >= 0 && cLon >= 0 ? anyToWgs(num(r[cLon]), num(r[cLat])) : cX >= 0 && cY >= 0 ? anyToWgs(num(r[cX]), num(r[cY])) : cW >= 0 ? wktMid(r[cW]) : null;
      if (!pos) continue;
      const p = bppProps(Object.fromEntries(rows[0].map((h, i) => [h, r[i]])));
      out.push([r5(pos[0]), r5(pos[1]), p.n, p.text, 's']);
      if (!info) info = `CSV, Koordinaten aus ${cLat >= 0 ? `„${rows[0][cLat]}/${rows[0][cLon]}“` : cX >= 0 ? `„${rows[0][cX]}/${rows[0][cY]}“` : `„${rows[0][cW]}“`}, Text aus „${p.spalten.text || '–'}“, Anzahl aus „${p.spalten.anzahl || '–'}“`;
    }
  }
  const inside = out.filter((p) => inBox(p[0], p[1], 0.1));
  if (!inside.length) throw new Error(out.length ? `${out.length} Punkte, aber keiner in Bielefeld (Koordinaten falsch gedeutet?)` : 'keine Punkte gelesen');
  return { plaetze: inside, info: info + (inside.length < out.length ? `, ${out.length - inside.length} außerhalb übersprungen` : '') };
}
async function bppStadt() {
  let text;
  if (BPP_URL) {
    const res = await fetch(BPP_URL, { headers: { 'User-Agent': 'Flowtown/1.0 (info@barrierefrai.com)' }, redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buf);   // ältere Exporte in Windows-Zeichensatz
    if (/^\s*<!doctype html|<html/i.test(text)) throw new Error('Der Link liefert eine Webseite statt einer Datei');
  } else {
    const f = BPP_LOCAL.find((x) => fs.existsSync(x));
    if (!f) return null;
    text = fs.readFileSync(f, 'utf8');
  }
  return bppParse(text);
}
async function bppOsm() {
  const bb = `${LAGE_BBOX[1]},${LAGE_BBOX[0]},${LAGE_BBOX[3]},${LAGE_BBOX[2]}`;
  const j = await overpass(`[out:json][timeout:90];(nwr["amenity"="parking_space"]["parking_space"="disabled"](${bb});nwr["amenity"="parking"]["capacity:disabled"](${bb}););out center tags;`, 120000);
  const raw = [];
  for (const e of j.elements || []) {
    const lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const t = e.tags || {};
    if (t.amenity === 'parking') {
      const c = t['capacity:disabled'];
      if (/^(no|0)$/i.test(c || '')) continue;
      raw.push({ lat, lon, n: num(c) || null, text: clip(t.name || t.operator || 'Parkplatz', 60), area: true });
    } else raw.push({ lat, lon, n: num(t.capacity) || 1, text: clip(t.name || '', 60) });
  }
  // einzelne Stellplätze, die nebeneinander liegen, zu einer Stelle zusammenfassen
  const out = [];
  for (const p of raw.filter((x) => !x.area)) {
    const near = out.find((q) => !q.area && Math.hypot((q.lat - p.lat) * 111320, (q.lon - p.lon) * 68500) < 25);
    if (near) { near.n += p.n; continue; }
    out.push(Object.assign({}, p));
  }
  out.push(...raw.filter((x) => x.area));
  return out.map((p) => [r5(p.lat), r5(p.lon), p.n, p.text, 'o']);
}
async function refreshBpp() {
  const old = bpp ? bpp.plaetze : [];
  const msgs = [];
  let stadt = null, osm = null, info = '';
  try { const r = await bppStadt(); if (r) { stadt = r.plaetze; info = r.info; } } catch (e) { msgs.push('Stadt: ' + e.message); }
  try { osm = await bppOsm(); } catch (e) { msgs.push('OpenStreetMap: ' + e.message); }
  if (!stadt && (BPP_URL || BPP_LOCAL.some((x) => fs.existsSync(x)))) stadt = old.filter((p) => p[4] === 's');
  if (!osm) osm = old.filter((p) => p[4] === 'o');
  if (!stadt) stadt = [];
  // Stellen aus OpenStreetMap, die die Stadt schon hat (bis 25 m), weglassen
  const extra = osm.filter((o) => !stadt.some((s) => Math.hypot((s[0] - o[0]) * 111320, (s[1] - o[1]) * 68500) < 25));
  const plaetze = stadt.concat(extra);
  if (!plaetze.length) throw new Error(msgs.join(' · ') || 'keine Daten');
  bpp = { t: Date.now(), plaetze, quellen: [stadt.length ? 'Stadt Bielefeld, Amt für Verkehr (Open Data, CC BY 4.0)' : '', extra.length ? 'OpenStreetMap-Mitwirkende (ODbL)' : ''].filter(Boolean), stadt: stadt.length, osm: extra.length };
  fs.writeFileSync(BPP_FILE + '.tmp', JSON.stringify(bpp));
  fs.renameSync(BPP_FILE + '.tmp', BPP_FILE);
  return `${plaetze.length} Stellen: ${stadt.length} von der Stadt${info ? ' (' + info + ')' : ''}, ${extra.length} zusätzlich aus OpenStreetMap${msgs.length ? '. Hinweise: ' + msgs.join(' · ') : ''}`;
}
function bppTick() {
  if (bppRun || (bpp && Date.now() - bpp.t < 864e5) || Date.now() - bppTry < 3600e3) return;
  bppTry = Date.now();
  bppRun = refreshBpp().then((m) => console.log('Behindertenparkplätze:', m)).catch((e) => console.error('Behindertenparkplätze:', e.message)).finally(() => { bppRun = null; });
}

// ---------- Geodienst der Stadt Bielefeld (Open Data, CC BY 4.0): Ampelanlagen und aktuelle Baustellen ----------
// CSV-Ausgabe des WFS, Geometrie als WKT in UTM 32. Zeilen als Objekte mit pos [Breite, Länge].
const STADT_WFS = process.env.STADT_WFS || 'https://www.bielefeld01.de/md/WFS';
const STADT_ON = process.env.STADT_DATEN !== '0';
async function stadtCsv(dienst, typ) {
  const url = `${STADT_WFS}/${dienst}/01?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${typ}&SRSNAME=EPSG:25832&OUTPUTFORMAT=text/csv`;
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Flowtown/1.0 (info@barrierefrai.com)' }, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = (await res.text()).replace(/��/g, 'ß').replace(/�/g, '');   // ß kommt beim Dienst manchmal kaputt an
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const w = head.indexOf('wkt');
    return rows.slice(1).map((r) => {
      const o = Object.fromEntries(head.map((h, i) => [h, String(r[i] == null ? '' : r[i]).trim()]));
      const m = /(-?[\d.]+)\s+(-?[\d.]+)/.exec(r[w] || '');
      o.pos = m ? anyToWgs(Number(m[1]), Number(m[2])) : null;
      o.wkt = r[w] || '';
      return o;
    }).filter((o) => o.pos && inBox(o.pos[0], o.pos[1], 0.1));
  } finally { clearTimeout(timer); }
}
// Öffentliche Toiletten der Stadt Bielefeld (Open Data): [Breite, Länge, rollstuhlgerecht 1/0/null, Name, Euroschlüssel, Öffnungszeiten, Entgelt, 's', Straße, Anmerkung]
const SWC_FILE = path.join(DATA_DIR, 'toiletten_stadt.json');
let swc = null, swcRun = null, swcTry = 0;
try { swc = JSON.parse(fs.readFileSync(SWC_FILE, 'utf8')); } catch (e) { swc = null; }
async function refreshSwc() {
  const rows = await stadtCsv('offentliche_toiletten', 'toiletten_p');
  if (rows.length < 10) throw new Error(`nur ${rows.length} Toiletten geliefert`);
  const yn = (v) => (/^ja/i.test(v || '') ? 1 : /^nein/i.test(v || '') ? 0 : null);
  const list = rows.map((o) => [r5(o.pos[0]), r5(o.pos[1]), yn(o.barfrei), clip(o.einricht || 'Öffentliche Toilette', 40), /euro/i.test((o.anmerkun || '') + ' ' + (o.oeff || '')) ? 1 : 0,
    clip(o.oeff, 80), clip(o.entgelt, 30), 's', clip(o.str, 40), clip(o.anmerkun, 100)]);
  swc = { t: Date.now(), quelle: 'Stadt Bielefeld (Open Data)', wc: list };
  fs.writeFileSync(SWC_FILE + '.tmp', JSON.stringify(swc));
  fs.renameSync(SWC_FILE + '.tmp', SWC_FILE);
  if (bf) bf.gz = null;
  return `${list.length} Toiletten, davon ${list.filter((w) => w[2] === 1).length} barrierefrei`;
}
function swcTick() {
  if (!STADT_ON || swcRun || (swc && Date.now() - swc.t < 864e5) || Date.now() - swcTry < 3600e3) return;
  swcTry = Date.now();
  swcRun = refreshSwc().then((m) => console.log('Toiletten der Stadt:', m)).catch((e) => console.error('Toiletten der Stadt:', e.message)).finally(() => { swcRun = null; });
}
// alle Toiletten: die der Stadt (mit Öffnungszeiten), dazu OpenStreetMap ohne die, die bis 30 m neben einer der Stadt liegen
function wcAll() {
  const st = (swc && swc.wc) || [], osm = (bf && bf.wc) || [];
  const nah = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 68500) < 30;
  const out = st.map((w) => { if (w[2] != null) return w; const o = osm.find((x) => nah(x, w)); return o && o[2] != null ? [w[0], w[1], o[2]].concat(w.slice(3)) : w; });
  return out.concat(osm.filter((w) => !st.some((x) => nah(x, w))));
}
const wcInfo = (w) => ({ name: w[3] || 'Toilette', rollstuhlgerecht: w[2] === 1 ? 'ja' : w[2] === 2 ? 'teilweise' : w[2] === 0 ? 'nein' : 'unbekannt', euroschluessel: w[4] ? 'ja' : 'unbekannt',
  oeffnungszeiten: w[5] || undefined, entgelt: w[6] ? (/^nein/i.test(w[6]) ? 'kostenlos' : /^ja/i.test(w[6]) ? 'kostenpflichtig' : w[6]) : undefined, hinweis: w[9] || undefined,
  quelle: w[7] === 's' ? 'Stadt Bielefeld' : 'OpenStreetMap', pos: [w[0], w[1]] });
// ---------- Aufzüge und Rolltreppen an DB-Bahnhöfen (DB InfraGO OpenStation, CC0) über die Mobilithek ----------
// Stammdaten (NeTEx, etwa 300 MB) einmal pro Woche: nur Aufzüge und Rolltreppen mit Bahnhof, Bezeichnung, Lage, Innenbreite.
// Status (SIRI FM) alle 5 Minuten. Abruf mit dem Maschinenzertifikat über curl (verträgt auch ältere .p12-Dateien).
// Einrichtung: MOBILITHEK_CERT und MOBILITHEK_CERT_PASS in /etc/flowtown.env; Abo-IDs ändern mit MOBILITHEK_ABO_NETEX und MOBILITHEK_ABO_SIRIFM.
const MOBI_URL = (process.env.MOBILITHEK_URL || 'https://mobilithek.info:8443/mobilithek/api/v1.0').replace(/\/$/, '');
const MOBI_CERT = process.env.MOBILITHEK_CERT || '', MOBI_PASS = process.env.MOBILITHEK_CERT_PASS || '';
const MOBI_ON = !!MOBI_CERT || /^http:\/\/127\./.test(MOBI_URL);
const MOBI_ABO = { netex: process.env.MOBILITHEK_ABO_NETEX || '1056540005609947136', sirifm: process.env.MOBILITHEK_ABO_SIRIFM || '1056533070466469888' };
// Abo abholen (Container-Schnittstelle) in eine Datei; das Passwort geht über stdin an curl, nicht in die Prozessliste
function mobiFetch(abo, file, maxSec, kind) {
  return new Promise((resolve, reject) => {
    const q = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    const u = kind === 'datex2' ? `${MOBI_URL}/subscription/${abo}/clientPullService?subscriptionID=${abo}` : `${MOBI_URL}/container/subscription?subscriptionID=${abo}`;
    const cfg = [`url = ${q(u)}`, `output = ${q(file)}`, 'compressed', 'silent', 'show-error', `max-time = ${maxSec || 300}`, 'write-out = "%{http_code}"']
      .concat(MOBI_CERT && /^https:/.test(MOBI_URL) ? [`cert-type = "P12"`, `cert = ${q(MOBI_CERT + ':' + MOBI_PASS)}`] : []);
    const p = spawn('curl', ['-K', '-']);
    let out = '', err = '';
    p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => reject(new Error('curl nicht gefunden: ' + e.message)));
    p.on('close', (code) => {
      const st = Number(out.trim().slice(-3));
      if (code !== 0) return reject(new Error('curl ' + code + ': ' + err.trim().slice(0, 200)));
      if (st !== 200) return reject(Object.assign(new Error('Mobilithek HTTP ' + st), { status: st }));
      resolve(st);
    });
    p.stdin.end(cfg.join('\n') + '\n');
  });
}
const DBA_FILE = path.join(DATA_DIR, 'aufzuege_db.json');
let dba = null, dbaRun = null, dbaTry = 0, dbaStatus = { t: 0, s: {} }, dbsRun = null;
try { dba = JSON.parse(fs.readFileSync(DBA_FILE, 'utf8')); } catch (e) { dba = null; }
// NeTEx zeilenweise lesen: Bahnhof (Name, Ort, erste Koordinate), Aufzüge und Rolltreppen, Lage aus dem Einbauort
async function parseNetex(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  const eq = {}, stand = { t: '' };
  let sp = null, cur = null, place = null, m;
  for await (const line of rl) {
    if (!stand.t && (m = /<PublicationTimestamp>([^<]+)/.exec(line))) stand.t = m[1];
    if ((m = /<StopPlace [^>]*id="([^"]+)"/.exec(line))) { sp = { id: m[1], name: '', ort: '', lat: null, lon: null }; cur = place = null; continue; }
    if (!sp) continue;
    if (line.includes('</StopPlace>')) { for (const k in eq) if (eq[k].sid === sp.id && eq[k].lat == null && sp.lat != null) { eq[k].lat = sp.lat; eq[k].lon = sp.lon; } sp = null; continue; }
    if (cur) {
      if (/<\/(LiftEquipment|EscalatorEquipment)>/.test(line)) { cur = null; continue; }
      if (!cur.n && (m = /<Name[^>]*>([^<]+)/.exec(line))) cur.n = m[1].trim();
      else if ((m = /<InternalWidth>([\d.]+)/.exec(line))) cur.w = Number(m[1]);
      else if ((m = /<WheelchairPassable>(\w+)/.exec(line))) cur.r = m[1] === 'true';
      continue;
    }
    if ((m = /<(LiftEquipment|EscalatorEquipment) [^>]*id="(diid:[^"]+)"/.exec(line))) { cur = eq[m[2]] = Object.assign(eq[m[2]] || {}, { k: m[1] === 'LiftEquipment' ? 'aufzug' : 'rolltreppe', st: sp.name, ort: sp.ort, sid: sp.id }); continue; }
    if (!sp.name && (m = /<Name[^>]*>([^<]+)/.exec(line))) { sp.name = m[1].trim(); continue; }
    if (!sp.ort && (m = /<Town[^>]*>([^<]+)/.exec(line))) sp.ort = m[1].trim();
    if (line.includes('<EquipmentPlace ')) place = { lat: null, lon: null };
    if ((m = /<Latitude>(-?[\d.]+)/.exec(line))) { const v = Number(m[1]); if (place) place.lat = v; if (sp.lat == null) sp.lat = v; }
    if ((m = /<Longitude>(-?[\d.]+)/.exec(line))) { const v = Number(m[1]); if (place) place.lon = v; if (sp.lon == null) sp.lon = v; }
    if (place && place.lat != null && (m = /<(?:Lift|Escalator)EquipmentRef ref="(diid:[^"]+)"/.exec(line))) { const e = eq[m[1]] || (eq[m[1]] = {}); if (e.lat == null) { e.lat = place.lat; e.lon = place.lon; } }
    if (line.includes('</EquipmentPlace>')) place = null;
  }
  // [Kennung, Art, Bahnhof, Ort, Bezeichnung, Breite, Länge, Innenbreite, rollstuhlgerecht]
  const anlagen = Object.entries(eq).filter(([, e]) => e.k && e.st && e.lat != null)
    .map(([id, e]) => [id, e.k, clip(e.st, 60), clip(e.ort, 40), clip(e.n || '', 80), r5(e.lat), r5(e.lon), e.w || null, e.r == null ? null : e.r ? 1 : 0]);
  return { t: Date.now(), stand: stand.t, anlagen };
}
async function refreshDba() {
  const file = path.join(DATA_DIR, 'openstation-netex.xml');
  try {
    await mobiFetch(MOBI_ABO.netex, file, 900);
    const d = await parseNetex(file);
    if (d.anlagen.length < (/^http:\/\/127\./.test(MOBI_URL) ? 1 : 50)) throw new Error(`nur ${d.anlagen.length} Anlagen gelesen`);   // Schutz gegen halbe Downloads (lokaler Test: 1)
    dba = d;
    fs.writeFileSync(DBA_FILE + '.tmp', JSON.stringify(dba));
    fs.renameSync(DBA_FILE + '.tmp', DBA_FILE);
    return `${d.anlagen.filter((a) => a[1] === 'aufzug').length} Aufzüge, ${d.anlagen.filter((a) => a[1] === 'rolltreppe').length} Rolltreppen, Stand ${d.stand}`;
  } finally { fs.rmSync(file, { force: true }); }
}
async function refreshDbStatus() {
  const file = path.join(DATA_DIR, 'openstation-sirifm.xml');
  try {
    await mobiFetch(MOBI_ABO.sirifm, file, 120);
    const xml = fs.readFileSync(file, 'utf8'), s = {};
    for (const m of xml.matchAll(/<FacilityRef>([^<]+)<\/FacilityRef>[\s\S]*?<Status>([^<]+)<\/Status>/g)) s[m[1].trim()] = m[2].trim();
    if (!Object.keys(s).length) throw new Error('kein Status gelesen');
    dbaStatus = { t: Date.now(), s };
    if (bf) bf.gz = null;
    return Object.keys(s).length;
  } finally { fs.rmSync(file, { force: true }); }
}
function dbaTick() {
  if (!MOBI_ON) return;
  if (!dbaRun && (!dba ? Date.now() - dbaTry > 864e5 : Date.now() - dba.t > 7 * 864e5 && new Date().getHours() >= 2 && new Date().getHours() < 5)) {
    dbaTry = Date.now();
    dbaRun = refreshDba().then((m) => { console.log('DB-Aufzüge:', m); setTimeout(dbaTick, 1000); }).catch((e) => console.error('DB-Aufzüge:', e.message)).finally(() => { dbaRun = null; });
  }
  if (dba && !dbsRun && Date.now() - dbaStatus.t > 270e3) dbsRun = refreshDbStatus().catch((e) => console.error('DB-Aufzüge Status:', e.message)).finally(() => { dbsRun = null; });
}
const DBA_TEXT = { available: 'in Betrieb', notAvailable: 'außer Betrieb', partiallyAvailable: 'eingeschränkt', unknown: 'Status unbekannt' };
const dbaState = (id) => (Date.now() - dbaStatus.t < 30 * 60e3 ? dbaStatus.s[id] : null) || null;
// Anlagen an einem Bahnhof nahe einer Stelle (bis max m): Bahnhof, Anzahl, was außer Betrieb ist
function dbaAt(pos, max) {
  if (!dba || !pos) return null;
  const near = dba.anlagen.map((a) => ({ a, d: mAbs(pos, [a[5], a[6]]) })).filter((x) => x.d <= (max || 600));
  if (!near.length) return null;
  near.sort((x, y) => x.d - y.d);
  const st = near[0].a[2], list = near.filter((x) => x.a[2] === st).map((x) => x.a);
  const aus = list.filter((a) => /^(notAvailable|partiallyAvailable)$/.test(dbaState(a[0]) || ''));
  return { bahnhof: st, aufzuege: list.filter((a) => a[1] === 'aufzug').length, rolltreppen: list.filter((a) => a[1] === 'rolltreppe').length,
    ausser_betrieb: aus.map((a) => `${a[1] === 'aufzug' ? 'Aufzug' : 'Rolltreppe'} ${a[4]} (${DBA_TEXT[dbaState(a[0])]})`),
    status: Date.now() - dbaStatus.t < 30 * 60e3 ? `aktuell, Stand ${uhr(dbaStatus.t)}` : 'kein aktueller Status', quelle: 'DB InfraGO (OpenStation, CC0)' };
}
// für die Karte: Aufzüge der DB in den Städten mit Fahrplan, mit Status
function dbaLifts() {
  if (!dba) return [];
  return dba.anlagen.filter((a) => a[1] === 'aufzug' && FP_STAEDTE.some((c) => a[5] >= c.box[0] && a[5] <= c.box[1] && a[6] >= c.box[2] && a[6] <= c.box[3]))
    .map((a) => [a[5], a[6], a[8] === 0 ? 0 : 1, `${a[2]}: ${a[4] || 'Aufzug'}`, dbaState(a[0]) || '', 'db', a[7] || null]);
}
// ---------- Echtzeit für Bus und Bahn: DELFI GTFS-RT Trip Updates über die Mobilithek ----------
// Nur bei Bedarf (jemand hat in den letzten 15 Minuten Abfahrten angesehen oder gefragt), höchstens alle 90 Sekunden.
// Aus dem deutschlandweiten Datenstrom bleiben nur die Fahrten der Fahrplan-Auszüge (Bielefeld, Mönchengladbach …).
const RT_ABO = process.env.MOBILITHEK_ABO_GTFSRT || '1056533146601701376';
let rt = { t: 0, quelle: 'DELFI e.V. (GTFS-RT, CC BY-SA 4.0)', staedte: {} }, rtRun = null, rtWanted = 0, rtErr = '';
// Protocol Buffers ohne Bibliothek: Felder eines Bereichs durchgehen; Varint als Zahl (negative int32 richtig), Länge als [Anfang, Ende]
function pbVarint(buf, pos) {
  let v = 0, mul = 1, b, n = 0;
  do { b = buf[pos++]; if (n < 7) v += (b & 0x7f) * mul; mul *= 128; n++; } while (b & 0x80);
  if (n >= 10) {   // negative Zahl (Zweierkomplement über 64 Bit): genau mit BigInt
    let big = 0n, sh = 0n;
    for (let i = pos - n; i < pos; i++) { big |= BigInt(buf[i] & 0x7f) << sh; sh += 7n; }
    v = Number(BigInt.asIntN(64, big));
  }
  return [v, pos];
}
function pbEach(buf, pos, end, cb) {
  while (pos < end) {
    let key; [key, pos] = pbVarint(buf, pos);
    const f = Math.floor(key / 8), wt = key & 7;
    if (wt === 0) { let v; [v, pos] = pbVarint(buf, pos); cb(f, 0, v); }
    else if (wt === 2) { let len; [len, pos] = pbVarint(buf, pos); cb(f, 2, pos, pos + len); pos += len; }
    else if (wt === 1) { cb(f, 1, pos); pos += 8; }
    else if (wt === 5) { cb(f, 5, pos); pos += 4; }
    else throw new Error('Protobuf: unbekannter Typ ' + wt);
  }
}
// Kennung → [Stadt, Fahrt]; Haltestellen-ID → Index je Stadt
let rtIndex = null;
function rtWant() {
  const key = FP_STAEDTE.map((c) => (fahrplaene[c.id] ? fahrplaene[c.id].etag : '')).join('|');
  if (rtIndex && rtIndex.key === key) return rtIndex;
  const trips = new Map(), stops = {};
  for (const c of FP_STAEDTE) {
    const f = fahrplaene[c.id], d = f && f.ids ? fpData(c.id) : null;
    if (!d) continue;
    f.ids.forEach((tid, i) => trips.set(tid, [c.id, i]));
    stops[c.id] = new Map(d.stops.map((st, i) => [st[0], i]));
  }
  rtIndex = { key, trips, stops };
  return rtIndex;
}
// je Stadt: Fahrt → [ausgefallen 0/1, Verspätung der Fahrt in s oder null, [[Halt, Verspätung s] …], [ausgelassene Halte]]
function rtDecode(buf) {
  const W = rtWant(), out = {};
  let ts = 0, n = 0;
  pbEach(buf, 0, buf.length, (f, wt, a, b) => {
    if (f === 1 && wt === 2) { pbEach(buf, a, b, (g, w, v) => { if (g === 3 && w === 0) ts = v; }); return; }
    if (f !== 2 || wt !== 2) return;
    pbEach(buf, a, b, (g, w, s0, e0) => {
      if (g !== 3 || w !== 2) return;   // nur trip_update
      let tid = null, rel = 0, tdel = null;
      const stu = [];
      pbEach(buf, s0, e0, (h, w3, s3, e3) => {
        if (h === 1 && w3 === 2) pbEach(buf, s3, e3, (k, w4, s4, e4) => { if (k === 1 && w4 === 2) tid = buf.toString('utf8', s4, e4); else if (k === 4 && w4 === 0) rel = s4; });
        else if (h === 2 && w3 === 2) stu.push([s3, e3]);
        else if (h === 5 && w3 === 0) tdel = s3;
      });
      const hit = tid && W.trips.get(tid);
      if (!hit) return;
      const [city, ti] = hit, sm = W.stops[city], dl = [], skip = [];
      for (const [s3, e3] of stu) {
        let sid = null, del = null, sk = false;
        pbEach(buf, s3, e3, (k, w4, s4, e4) => {
          if (k === 4 && w4 === 2) sid = buf.toString('utf8', s4, e4);
          else if ((k === 3 || k === 2) && w4 === 2) pbEach(buf, s4, e4, (q, w5, v) => { if (q === 1 && w5 === 0 && (k === 3 || del == null)) del = v; });
          else if (k === 5 && w4 === 0 && s4 === 1) sk = true;
        });
        const si = sid != null ? sm.get(sid) : undefined;
        if (si == null) continue;
        if (sk) skip.push(si); else if (del != null) dl.push([si, del]);
      }
      (out[city] = out[city] || {})[ti] = [rel === 3 ? 1 : 0, tdel, dl, skip];
      n++;
    });
  });
  return { ts, n, out };
}
async function refreshRt() {
  const file = path.join(DATA_DIR, 'gtfsrt.pb');
  try {
    await mobiFetch(RT_ABO, file, 120);
    let buf = fs.readFileSync(file);
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    if (buf[0] === 0x3c || buf[0] === 0x7b) throw new Error('keine GTFS-RT-Daten: ' + buf.toString('utf8', 0, 120));
    const d = rtDecode(buf);
    rt = { t: Date.now(), ts: d.ts ? d.ts * 1000 : Date.now(), quelle: rt.quelle, staedte: d.out, n: d.n, bytes: buf.length };
    rtErr = '';
    return d.n;
  } finally { fs.rmSync(file, { force: true }); }
}
function rtTick() {
  if (!MOBI_ON || rtRun || Date.now() - rtWanted > 15 * 60e3 || Date.now() - rt.t < 90e3) return;
  rtRun = refreshRt().catch((e) => { rtErr = e.message; console.error('Echtzeit:', e.message); rt.t = Date.now() - 30e3; }).finally(() => { rtRun = null; });
}
const rtFresh = () => Date.now() - rt.t < 5 * 60e3;
// Verspätung (Minuten) oder Ausfall einer Fahrt an einem Halt; null ohne Echtzeit
function rtAt(city, ti, pat, k) {
  if (!rtFresh()) return null;
  const e = rt.staedte[city] && rt.staedte[city][ti];
  if (!e) return null;
  if (e[0] || e[3].includes(pat[k])) return { faellt_aus: true };
  for (let j = k; j >= 0; j--) { const x = e[2].find((p) => p[0] === pat[j]); if (x) return { verspaetung_min: Math.round(x[1] / 60) }; }
  return e[1] != null ? { verspaetung_min: Math.round(e[1] / 60) } : { verspaetung_min: 0 };
}
// ---------- Straßen.NRW über die Mobilithek: Verkehrsmeldungen (VIZ.NRW), Baustellen und Umleitungen außerhalb der Autobahnen (DATEX II v2, Datenlizenz Deutschland – Zero) ----------
// Nur bei Bedarf (Lage oder Strecke angefragt): Meldungen alle 3, Baustellen und Umleitungen alle 30 Minuten. Solange ein Abo
// noch nicht freigegeben ist (HTTP 404), nur einmal pro Stunde fragen.
const NRW_ABO = { viz: process.env.MOBILITHEK_ABO_VIZ || '1056533255515164672', bau: process.env.MOBILITHEK_ABO_ARBEITSSTELLEN || '1056533308808019968', uml: process.env.MOBILITHEK_ABO_UMLEITUNGEN || '1056533361559556096' };
const NRW_MIN = { viz: 3, bau: 30, uml: 30 };
const nrw = { viz: { t: 0, items: [], try: 0, err: '' }, bau: { t: 0, items: [], try: 0, err: '' }, uml: { t: 0, items: [], try: 0, err: '' } };
let nrwWanted = 0;
const NRW_RANK = { sperrung: 0, unfall: 1, stau: 2, zaeh: 3, baustelle: 4, warnung: 5 };
// DATEX II v2: je Situation die schwerste Meldung, alle Koordinaten (Anzeige-Punkt, Punkt, Linie), Kommentare, Straße, Zeitraum
function datexItems(xml, quelle, pre) {
  const out = [], now = Date.now();
  const val = (re, t) => { const m = re.exec(t); return m ? m[1] : ''; };
  for (const sm of xml.matchAll(/<(?:\w+:)?situation\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?situation>/g)) {
    let best = null;
    for (const rm of sm[2].matchAll(/<(?:\w+:)?situationRecord\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?situationRecord>/g)) {
      const at = rm[1], rb = rm[2];
      const type = val(/type="(?:\w+:)?(\w+)"/, at);
      if (/suspended/.test(val(/<(?:\w+:)?validityStatus>(\w+)/, rb))) continue;
      const start = val(/<(?:\w+:)?overallStartTime>([^<]+)/, rb), end = val(/<(?:\w+:)?overallEndTime>([^<]+)/, rb);
      if (start && Date.parse(start) > now + 3600e3) continue;   // erst später: nicht als aktuell zeigen
      if (end && Date.parse(end) < now) continue;
      const pts = [...rb.matchAll(/<(?:\w+:)?latitude>(-?[\d.]+)<\/(?:\w+:)?latitude>\s*<(?:\w+:)?longitude>(-?[\d.]+)</g)].map((m) => [r5(Number(m[1])), r5(Number(m[2]))]).filter((q) => q[0] > 47 && q[0] < 56 && q[1] > 5 && q[1] < 16);
      if (!pts.length) continue;
      const kom = [...rb.matchAll(/<(?:\w+:)?(?:generalPublicComment|nonGeneralPublicComment)>[\s\S]*?<(?:\w+:)?value[^>]*>([^<]+)</g)].map((m) => deText(m[1]));
      const txtAll = kom.join(' ');
      let art = 'warnung';
      if (/AbnormalTraffic/.test(type)) art = /slow|heavy/i.test(val(/<(?:\w+:)?abnormalTrafficType>(\w+)/, rb)) ? 'zaeh' : 'stau';
      else if (/Accident/.test(type)) art = 'unfall';
      else if (/RoadOrCarriagewayOrLaneManagement/.test(type)) art = /roadClosed|carriagewayClosures/i.test(val(/<(?:\w+:)?roadOrCarriagewayOrLaneManagementType>(\w+)/, rb)) ? 'sperrung' : 'warnung';
      else if (/ConstructionWorks|MaintenanceWorks|Roadworks/i.test(type)) art = /vollsperrung|voll gesperrt|gesperrt/i.test(txtAll) ? 'sperrung' : 'baustelle';
      const rec = { art, pts, kom, road: val(/<(?:\w+:)?roadNumber>([^<]+)/, rb), name: val(/<(?:\w+:)?roadName>[\s\S]*?<(?:\w+:)?value[^>]*>([^<]+)</, rb), end, umleitung: /Rerouting/i.test(type) };
      if (!best || NRW_RANK[art] < NRW_RANK[best.art]) best = Object.assign(rec, { pts: best ? best.pts.concat(pts) : pts, kom: best ? best.kom.concat(kom) : kom });
      else { best.pts = best.pts.concat(pts); best.kom = best.kom.concat(kom); }
    }
    if (!best) continue;
    const text = clip([...new Set(best.kom)].join(' '), 220);
    out.push({ id: pre + sm[1].slice(-24), quelle, art: best.art, titel: clip([best.road, deText(best.name)].filter(Boolean).join(' ') || (best.umleitung ? 'Umleitung' : ''), 60) || null,
      text: best.umleitung && !/umleit/i.test(text) ? clip('Umleitung: ' + text, 220) : text, bis: best.end || null, pts: thin(best.pts) });
  }
  return out;
}
async function nrwRefresh(k) {
  const file = path.join(DATA_DIR, `nrw-${k}.xml`), q = nrw[k];
  q.try = Date.now();
  try {
    try { await mobiFetch(NRW_ABO[k], file, 120, 'datex2'); }
    catch (e) { if (e.status === 422 || e.status === 403) await mobiFetch(NRW_ABO[k], file, 120); else throw e; }
    const xml = fs.readFileSync(file, 'utf8');
    if (!/situation|d2LogicalModel|payloadPublication/i.test(xml.slice(0, 5000))) throw new Error('keine DATEX-II-Daten: ' + xml.slice(0, 80));
    q.items = datexItems(xml, 'Straßen.NRW', k);
    q.t = Date.now(); q.err = ''; q.bytes = xml.length;
  } catch (e) { q.err = e.status === 404 ? 'wartet auf Freigabe (HTTP 404)' : e.message; if (e.status !== 404) console.error('Straßen.NRW', k + ':', e.message); }
  finally { fs.rmSync(file, { force: true }); }
}
let nrwRun = null;
function nrwTick() {
  if (!MOBI_ON || nrwRun || Date.now() - nrwWanted > 15 * 60e3) return;
  const due = Object.keys(nrw).filter((k) => Date.now() - nrw[k].try > (/Freigabe/.test(nrw[k].err) ? 3600e3 : NRW_MIN[k] * 60e3));
  if (!due.length) return;
  nrwRun = (async () => { for (const k of due) await nrwRefresh(k); })().finally(() => { nrwRun = null; });
}
// aktuelle Meldungen aller drei Quellen (bis eine Stunde alt)
const nrwItems = () => [].concat(...Object.values(nrw).filter((q) => q.t && Date.now() - q.t < 3600e3).map((q) => q.items));
// Ampelanlagen: [Breite, Länge, Nummer, Art, Betreiber, Kennung] – Art kp Kreuzung, fu Fußgängerampel, sw Stadtwerke (Stadtbahn), so Sonstige; Betreiber s Stadt, l Straßen.NRW
const LSA_FILE = path.join(DATA_DIR, 'ampelanlagen.json');
let lsa = null, lsaRun = null, lsaTry = 0;
try { lsa = JSON.parse(fs.readFileSync(LSA_FILE, 'utf8')); } catch (e) { lsa = null; }
async function refreshLsa() {
  const rows = await stadtCsv('ampelanlagen', 'lichtsignalanlagen_p');
  if (rows.length < 50) throw new Error(`nur ${rows.length} Anlagen geliefert`);
  const list = rows.map((o) => {
    const l = o.layer || '';
    const art = /^FU/i.test(l) ? 'fu' : /^KP/i.test(l) ? 'kp' : /Stadtwerke/i.test(l) ? 'sw' : /Eurobahn/i.test(l) ? 'eb' : 'so';
    return [r5(o.pos[0]), r5(o.pos[1]), clip(o.bez, 12), art, /LBS|ABA/i.test(l) ? 'l' : 's', Number(o.gid) || 0];
  });
  lsa = { t: Date.now(), quelle: 'Stadt Bielefeld, Amt für Verkehr (Open Data, CC BY 4.0)', anlagen: list };
  fs.writeFileSync(LSA_FILE + '.tmp', JSON.stringify(lsa));
  fs.renameSync(LSA_FILE + '.tmp', LSA_FILE);
  const n = (a) => list.filter((x) => x[3] === a).length;
  return `${list.length} Ampelanlagen: ${n('kp')} an Kreuzungen, ${n('fu')} Fußgängerampeln, ${n('sw')} Stadtwerke, ${list.length - n('kp') - n('fu') - n('sw')} sonstige`;
}
function lsaTick() {
  if (!STADT_ON || lsaRun || (lsa && Date.now() - lsa.t < 7 * 864e5) || Date.now() - lsaTry < 3600e3) return;
  lsaTry = Date.now();
  lsaRun = refreshLsa().then((m) => console.log('Ampelanlagen:', m)).catch((e) => console.error('Ampelanlagen:', e.message)).finally(() => { lsaRun = null; });
}
// aktuelle Baustellen der Stadt als Meldungen wie bei HERE und der Autobahn GmbH (Punkte, keine Linien)
const stadtDate = (s, end) => { const m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], end ? 23 : 0, end ? 59 : 0).getTime() : null; };
async function stadtBaustellen() {
  const rows = await stadtCsv('verkehrsmeldungen', 'aktuelle_baustellen_p');
  const now = Date.now(), out = [];
  for (const o of rows) {
    const von = stadtDate(o.beginn), bis = stadtDate(o.ende, true);
    if ((bis && bis < now) || (von && von > now + 864e5)) continue;   // vorbei oder erst ab übermorgen
    const was = o.art_arb || o.sparte || 'Bauarbeiten', fuss = o.art_vb && !/^(VRAO|siehe)\b/i.test(o.art_vb) ? o.art_vb : '';
    const voll = /vollsperrung|voll gesperrt|gesperrt/i.test(was + ' ' + fuss) && !/gehweg|fuß|rad/i.test(was);
    const nr = [o.hnr_1, o.sbod_hnr_2].filter(Boolean).join('–');
    out.push({
      id: 'sb' + o.gid, quelle: 'Stadt Bielefeld', art: voll ? 'sperrung' : 'baustelle',
      titel: clip(`${o.strasse}${nr ? ' ' + nr : ''}`, 60) || 'Baustelle',
      richtungText: clip(o.qstr_1 && o.qstr_2 ? `zwischen ${o.qstr_1} und ${o.qstr_2}` : o.qstr_1 ? `Höhe ${o.qstr_1}` : o.ortsteil || '', 60),
      text: clip(was, 160), fuss: clip(fuss, 260), bis: bis ? o.ende.slice(0, 10).replace(/\//g, '-') + 'T23:59:00' : null, von: von ? o.beginn.slice(0, 10).replace(/\//g, '-') + 'T00:00:00' : null,   // Ortszeit, ohne Zeitzone
      pts: [[r5(o.pos[0]), r5(o.pos[1])]], stadt: true
    });
  }
  return out;
}

// Park + Ride (moBiel) und das Radverkehrsnetz der Stadt: wöchentlich, gemeinsam in einer Datei
// pr: [Breite, Länge, Plätze, Name, Adresse]; Anlagen gleichen Namens bis 400 m zusammengefasst
// netz: [[Punkte…], Alltag 1/0, Freizeit 1/0, Netzstufe]
const STADT2_FILE = path.join(DATA_DIR, 'stadt-pr-radnetz.json');
let stadt2 = null, stadt2Run = null, stadt2Try = 0;
try { stadt2 = JSON.parse(fs.readFileSync(STADT2_FILE, 'utf8')); } catch (e) { stadt2 = null; }
function lineWgs(wkt) {
  const pts = [...String(wkt).matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => anyToWgs(Number(m[1]), Number(m[2]))).filter(Boolean).map((p) => [r5(p[0]), r5(p[1])]);
  // ausdünnen: Punkte näher als 8 m am vorigen weglassen, Endpunkt behalten
  const out = [];
  for (const p of pts) if (!out.length || Math.hypot((p[0] - out[out.length - 1][0]) * 111320, (p[1] - out[out.length - 1][1]) * 68500) >= 8) out.push(p);
  if (pts.length && out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}
async function refreshStadt2() {
  const msgs = [];
  let pr = stadt2 ? stadt2.pr : [], netz = stadt2 ? stadt2.netz : [];
  try {
    const rows = await stadtCsv('park_ride_parkplatze', 'park_and_ride_p');
    const by = [];
    for (const o of rows) {
      const n = Number(o.parkplaetz) || 0;
      const same = by.find((x) => x[3] === o.name && Math.hypot((x[0] - o.pos[0]) * 111320, (x[1] - o.pos[1]) * 68500) < 400);
      if (same) { if (n > same[5]) { same[0] = r5(o.pos[0]); same[1] = r5(o.pos[1]); same[4] = clip(o.adresse, 60); same[5] = n; } same[2] += n; continue; }
      by.push([r5(o.pos[0]), r5(o.pos[1]), n, clip(o.name, 40), clip(o.adresse, 60), n]);
    }
    if (by.length) pr = by.map((x) => x.slice(0, 5));
    msgs.push(`${pr.length} Park + Ride-Anlagen mit ${pr.reduce((a, x) => a + x[2], 0)} Plätzen`);
  } catch (e) { msgs.push('Park + Ride: ' + e.message); }
  try {
    const rows = await stadtCsv('radverkehrskonzepte', 'rvn_kommunales_netz_l');
    const lines = rows.map((o) => [lineWgs(o.wkt), o.alltag === '1' ? 1 : 0, o.freizeit === '1' ? 1 : 0, Number(o.svk_netz) || 0]).filter((l) => l[0].length > 1);
    if (lines.length > 50) netz = lines;
    msgs.push(`Radverkehrsnetz: ${lines.length} Abschnitte, ${Math.round(rows.reduce((a, o) => a + (Number(o.laenge) || 0), 0) / 1000)} km`);
  } catch (e) { msgs.push('Radverkehrsnetz: ' + e.message); }
  if (!pr.length && !netz.length) throw new Error(msgs.join(' · '));
  stadt2 = { t: Date.now(), quelle: 'Stadt Bielefeld (Open Data, CC BY 4.0)', pr, netz };
  fs.writeFileSync(STADT2_FILE + '.tmp', JSON.stringify(stadt2));
  fs.renameSync(STADT2_FILE + '.tmp', STADT2_FILE);
  stadt2.gz = null;
  return msgs.join(' · ');
}
function stadt2Tick() {
  if (!STADT_ON || stadt2Run || (stadt2 && Date.now() - stadt2.t < 7 * 864e5) || Date.now() - stadt2Try < 3600e3) return;
  stadt2Try = Date.now();
  stadt2Run = refreshStadt2().then((m) => console.log('Stadtdaten:', m)).catch((e) => console.error('Stadtdaten:', e.message)).finally(() => { stadt2Run = null; });
}
function sendStadt2(req, res, origin) {
  if (!stadt2.gz) { const raw = JSON.stringify({ t: stadt2.t, quelle: stadt2.quelle, pr: stadt2.pr, netz: stadt2.netz }); stadt2.raw = raw; stadt2.gz = zlib.gzipSync(raw, { level: 9 }); stadt2.etag = '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"'; }
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: stadt2.etag, Vary: 'Origin, Accept-Encoding' };
  if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'ETag' });
  if (req.headers['if-none-match'] === stadt2.etag) { res.writeHead(304, h); return res.end(); }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gz) h['Content-Encoding'] = 'gzip';
  res.writeHead(200, h);
  res.end(gz ? stadt2.gz : stadt2.raw);
}

// ---------- Assistenz (Stufe 3): freie Fragen, beantwortet von Mistral aus den Flowtown-Daten ----------
// Die App schickt die Frage, Profil, Verkehrsmittel und den genauen Standort (nur an HERE und die eigenen Werkzeuge, nie an Mistral). Mistral darf nur über die
// Werkzeuge unten nachschlagen und soll nur aus deren Ergebnissen antworten. Gespeichert wird nichts.
const ASSIST_PER_DAY = Number(process.env.ASSIST_PER_DAY || 60);
const assistAllowed = limiter(ASSIST_PER_DAY);
const mAbs = (a, b) => Math.round(Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 68500));
const ASSIST_SYSTEM = `Du bist die Sprachassistenz von Flowtown, einer App aus Bielefeld für Wege mit Auto, Rad, zu Fuß, Bus und Bahn, mit Schwerpunkt Barrierefreiheit. Wege in andere Städte und Wege in anderen Städten gehören dazu.
Regeln:
- Antworte auf Deutsch (außer die Frage ist in einer anderen Sprache gestellt) und kurz: höchstens drei Sätze, gut zum Vorlesen. Keine Aufzählungszeichen, kein Markdown, keine Emojis.
- Fahrzeiten ab 60 Minuten nennst du in Stunden und Minuten („5 Stunden 24 Minuten“, nicht „324 Minuten“), unter einer Stunde nur in Minuten.
- Rückfragen im Gespräch: Antworte nur auf das, was neu gefragt ist. Wiederhole nichts, was du im Verlauf schon gesagt hast (Name, Adresse, Dauer, Linien, schon genannte Merkmale), außer die Person fragt ausdrücklich noch einmal danach. Keine Einleitung, die den Ort oder die Strecke erneut vorstellt; fang direkt mit dem Neuen an.
- Fakten (Orte, Entfernungen, Zeiten, Linien, Barrierefreiheit) nur aus den Ergebnissen der Werkzeuge; Angaben zu den eigenen Fahrten aus dem Werkzeug meine_auswertung. Erfinde nichts. Liefert ein Werkzeug nichts, sag das offen und schlage vor, was die Person stattdessen tun kann.
- Berücksichtige das Profil: Rollstuhl oder Rollator heißt stufenlos, Hochbahnsteig, Aufzug, rollstuhlgerechte Toilette. Sehbehinderung: Orientierung und Ampeln mit Tonsignal. Einfache Sprache: sehr kurze Sätze und einfache Wörter.
- Barrierefreiheit nie aus Vermutung: Fehlt eine Angabe (Hochbahnsteig, Aufzug, stufenlos), sag „dazu habe ich keine Angabe“, nie „barrierefrei“ oder „stufenlos“. Bei Aufzügen und Baustellen: „bitte vor Ort prüfen“, weil sich das ändern kann.
- Sag nie, ob eine Ampel gerade grün ist oder ob man jetzt gehen, queren oder fahren kann. Das entscheidet die Person am Signal selbst.
- Entfernungen runden (etwa 200 Meter), Zeiten als Uhrzeit oder in Minuten.
- Notfall, Unfall, Gefahr: sofort auf den Notruf 112 verweisen. Keine medizinische oder rechtliche Beratung.
- Fragen ohne Bezug zu Wegen, Verkehr und Barrierefreiheit beantwortest du nicht; sag kurz, wobei du helfen kannst.
- Ziele in anderen Städten (etwa „Mönchengladbach Hauptbahnhof“) sind erlaubt: Gib den Ort mit Stadtnamen an das Werkzeug weiter und ersetze ihn nie durch einen Ort in Bielefeld.
- Ist die Person in einer anderen Stadt (Kontext standort), meinen „Hauptbahnhof“, „Rathaus“, „Innenstadt“ und Haltestellennamen den Ort in dieser Stadt. Häng nie „Bielefeld“ an und nenne keine Bielefelder Linien.
- Ist die Person oder das Ziel außerhalb von Bielefeld, hilfst du trotzdem: Wege, Verkehrsmittel-Vergleich mit CO₂, Staus und Sperrungen auf der Strecke gibt es überall. Barrierefreiheit von Gebäuden, Toiletten, Behindertenparkplätze, Fahrplan, Störungen von moBiel und Tonsignale an Ampeln gibt es nur für Bielefeld; sag das offen.
- Der Standort der Person ist im Kontext (genau). Die Adresse nennt der Server selbst. Ohne Standort frag nach einem Ort.
- Fragen zur Barrierefreiheit eines bestimmten Gebäudes (Theater, Museum, Amt, Café, Halle) beantwortest du mit dem Werkzeug ort_barrierefreiheit. Nenne die wichtigsten Punkte für das Profil der Person, mit Maßen aus den Hinweisen, und sag „laut Bielefeld barrierefrei erleben, Stand …“. Ist der Name mehrdeutig, frag nach.
- Fragen zu den eigenen Fahrten (meine Wartezeit, wo warte ich am längsten, Zeitfresser, meine Ampeln, mein Weg, Fahrten diese Woche, meine Tipps) beantwortest du mit dem Werkzeug meine_auswertung, nie mit anderen Werkzeugen. Nenne dabei konkrete Zahlen und Ampelnamen. Fragen zu einer bestimmten Fahrt (letzte Fahrt, heute früh, gestern) beantwortest du aus „letzte_fahrten“ (die neueste zuerst): Dauer, Gestanden und die Aufteilung übernimmst du wörtlich, ohne zu runden, zu addieren oder umzurechnen; „gestanden_gesamt“ ist die ganze Standzeit, „an_ampeln“ nur der Teil an Ampeln. Meldet es „ausgeschaltet“, sag kurz, dass man unter Mehr, Server und Dienste, „Frag Flowtown darf meine Auswertung nutzen“ einschalten kann.
- „Womit komme ich am besten, schnellsten oder günstigsten hin?“, „Lohnt sich Rad, Bus oder Auto?“, „Wie komme ich umweltfreundlich hin, wie spare ich CO₂ oder Sprit?“: Werkzeug vergleich. Nenne die Empfehlung mit ihrem Grund und in einem Satz die nächstbeste Möglichkeit. Flowtown empfiehlt das umweltfreundlichste Verkehrsmittel, wenn es kaum langsamer ist: Nenne dann die CO₂-Ersparnis gegenüber dem Auto (co2_gespart_g, als „etwa“). Empfiehl das Auto nur, wenn vergleich es empfiehlt, und sag dann, wie viel länger Bus und Bahn oder Rad dauern würden. Mit Profil: sag, was für das Profil zählt (stufenlos, Hindernisse, Behindertenparkplatz).
- Hindernisse auf einem Weg (Stufen, Treppen, Kopfsteinpflaster, Steigung, hohe Bordsteine, ebener Weg, gemeldete Hindernisse, Ampeln mit Tonsignal unterwegs): Werkzeug weg_check. Nenne die wichtigsten Stellen mit Straße und Länge. Sag dazu, dass die App unter „Wohin?“ einen Weg mit weniger Hindernissen sucht.
- Störungen, Umleitungen und Ausfälle bei Bus und Bahn, defekte Aufzüge: Werkzeug oepnv_stoerungen. Gemeldete Aufzüge immer mit „bitte vor Ort prüfen“.
- Ampeln mit Tonsignal in der Nähe eines Orts: Werkzeug ampeln_mit_ton. Sag nie, ob eine Ampel gerade grün ist.
- Fragen mit „in einfacher Sprache“, und immer wenn im Kontext einfache_sprache wahr ist: sehr kurze Sätze, ein Gedanke je Satz, keine Fremdwörter, keine Nebensätze. Bei „Sag das noch einmal in einfacher Sprache“ gib die letzte Antwort aus dem Gespräch in einfacher Sprache wieder, mit denselben Fakten.
- Bittet die Person nur um „einfache Sprache“ oder darum, „ohne Ton“ oder „nur als Text“ zu antworten, ohne eine Frage zu stellen: bestätige das in einem Satz und frag, wobei du helfen sollst. Behaupte nie, du könntest nur Text oder kein Vorlesen; das Vorlesen ist eine Einstellung der App (Mehr, „Ansagen und Sprache“).
- Duze immer, auch im Notfall.
- Notfall, Sturz, Verletzung: zuerst „Ruf sofort den Notruf 112 an“, dazu, dass das rote Plus oben in Flowtown den Notruf öffnet und die App nora hilft, wenn Sprechen nicht geht. Keine medizinischen Ratschläge.
- „Wann fährt die nächste Bahn oder der nächste Bus?“ ohne Haltestelle: Werkzeug abfahrten_in_der_naehe, nicht nachfragen.
- Universität, Hauptbahnhof, Rathaus, Jahnplatz, Kunsthalle, Stadttheater und alle Haltestellennamen sind eindeutige Ziele. Frag nur nach, wenn ein Werkzeug „mehrdeutig“ oder „auswahl“ meldet oder kein Ziel genannt ist.
- Fehlt der Standort (Werkzeug meldet „Kein Standort“), frag nach dem Start: Haltestelle, Straße oder Adresse.
- Ist am Ziel oder an einem Bahnhof ein Aufzug außer Betrieb (bahnhof_aufzuege, db_aufzuege_ausser_betrieb), sag das bei Rollstuhl, Rollator und Kinderwagen zuerst und nenne den Bahnhof; Angaben laut DB.
- Abfahrten mit verspaetung_min oder faellt_aus kommen aus der Echtzeit: Verspätungen ab 2 Minuten und Ausfälle immer nennen; ohne diese Felder gilt der Fahrplan, dann „laut Fahrplan“ sagen.
- Plan B: Gibt ein Werkzeug plan_b zurück oder meldet es ein Hindernis (Stufen, Sperrung, Störung, Aufzug außer Betrieb), nenne neben dem Problem immer eine Alternative daraus. Fehlt plan_b, sag offen, dass du keine kennst, und verweise auf Menschen vor Ort (Werkzeug hilfe_menschen).
- Rückweg („Wann muss ich zurück?“, „Wie komme ich wieder heim?“, „Fährt abends noch eine Bahn?“): Werkzeug rueckweg mit dem Ort, von dem es zurückgeht. Nenne die letzte Abfahrt heute (bei Profil mit Hochbahnsteig), sag, dass der Fahrplan keine späteren Verspätungen kennt, und rate zu etwa 15 Minuten Reserve.
- Weiß die Person nicht weiter, hat sich verlaufen, ist ein Ort unübersichtlich oder braucht sie beim Ein- und Aussteigen Hilfe: Werkzeug hilfe_menschen. Nenne zwei Möglichkeiten, erfinde keine Telefonnummern, verweise auf bahn.de oder mobiel.de. Bei Gefahr zuerst Notruf 112.
- Liefert ein Werkzeug zu einem Fakt Quelle oder Stand (zum Beispiel „quelle“, „stand“), nenne beides kurz, etwa „laut Bielefeld barrierefrei erleben, Stand 2025“. Erfinde nie eine Quelle oder ein Datum.
- Fehlen Angaben (angaben_fehlen, keine Angabe, unbekannt), sag das offen in einem Satz, zum Beispiel „Zur Türbreite habe ich keine Angabe.“ Nenne nur Fehlendes, das zum Profil passt.
- Ampel-Angaben (Tonsignal, Taster, Leitstreifen) sind Angaben aus Karten, nie eine Zusage, dass das Queren sicher ist. Sag „laut Karte“ und dass die Person am Signal selbst entscheidet.
- Endet der Weg an einem eingang (Feld eingang), nenne den Eingang und ob er stufenlos ist; der Weg führt dorthin, nicht in die Gebäudemitte.
- Ampeln auf einem Weg nur aus weg_check; ampeln_mit_ton ist für Ampeln am Standort oder an einem Ort, nicht für einen Weg.
- Beschreibe nie einen Weg innerhalb eines Gebäudes oder Geländes; dazu hast du keine Daten.
- Erfinde keine ruhigen Zeiten, Öffnungszeiten oder Auslastung.
- Rollstuhl oder Rollator und der Fußweg hat Stufen: nenne als Alternative die Stadtbahn bis zur Haltestelle am Ziel (am_ziel.stadtbahn), wenn sie einen Hochbahnsteig hat.
- Am Ziel nach Profil: Sehen zuerst Orientierung und Hilfen für sehbehinderte Menschen, Hören zuerst Hörhilfen, Rollstuhl und Rollator zuerst Zugang, WC und Parken.
- Stufen auf dem Fußweg nur nennen, wenn zu Fuß empfohlen wird oder ein Profil gewählt ist. Auch bei Vergleichen höchstens drei Sätze.
- Fehlt bei einer Frage zu Weg, Ort oder Vergleich das Ziel, frag in einem freundlichen Satz nach, wohin es gehen soll. Rate kein Ziel.
- Am Ziel zählt, was dort ist, nicht am Standort: Toilette, Behindertenparkplatz, Zugang und Haltestelle immer für das Ziel nennen (am_ziel aus vergleich und weg_check, sonst ort_info oder orte_in_der_naehe mit dem Ziel als ort).
- Nach Wegen mit Profil: erst die beste Möglichkeit, dann das Wichtigste auf dem Weg, dann das Wichtigste am Ziel, alles in höchstens drei Sätzen.
- „Infos zu einem Ort“, „Was erwartet mich dort?“: Werkzeug ort_info. Sag zuerst, für welchen Ort die Angaben gelten (ort, adresse). Gibt es „auswahl“ oder „gebaeude_auswahl“, nenne zwei, drei davon und frag, welcher gemeint ist; erfinde keine Angaben.
- Entfernungen gelten immer vom gefundenen Ort aus (Luftlinie); nenne sie nur, wenn der Ort eindeutig ist. Liegt die Stadtbahn bei 0 bis 100 m, sag „direkt dort“. Große Gelände wie die Universität: sag, dass es um das Gelände geht.
- Aufzüge: Für die Haltestellen der Stadtbahn (auch Jahnplatz und Rathaus) gibt es keinen Live-Status. Sag nie „laut moBiel sind alle Aufzüge in Betrieb“. Sag: „Für den Aufzug dort habe ich keinen Live-Status“, nenne gemeldete Ausfälle aus Flowtown und „bitte vor Ort prüfen“. „Alle in Betrieb“ gilt nur für Aufzüge der DB an Bahnhöfen.
- Zeit: Die Werkzeuge kennen nur „jetzt“. Fragen nach einer bestimmten Uhrzeit, einem anderen Tag, dem Wochenende, einem Feiertag oder „um 8 Uhr da sein“ beantwortest du nicht mit Abfahrtszeiten von jetzt. Sag offen, dass du das nur für jetzt weißt, und nenne höchstens die Dauer.
- Das kannst du nicht und sagst es offen („dazu habe ich keine Angabe“): Preise, Tarife, Tickets, Regeln zu Ausweis, Hund, Fahrrad oder Scooter, Fundsachen, Wetter, Auslastung, ruhige Orte, Höhenprofil und Steigung, Grünzeiten von Ampeln, Stellplätze für Rollstühle, Ladeorte, Bänke, Trinkwasser, Schranken und Umlaufsperren. Rate nie, behaupte keine Funktion, und empfiehl bei Regen nicht das Rad.
- Telefonnummern nennst du nie, nur 112 und 110. Verweise auf mobiel.de, bahn.de oder die Stadt.
- Die App hat nur diese Stellen: die Reiter Heute, Tipps, Verlauf, Karte und Mehr, das Suchfeld „Wohin?“ auf Heute, das rote Plus oben für den Notruf, auf der Karte den Knopf „Hindernis melden“, unter Mehr die Einstellungen (Profil, Ansagen und Sprache, Server und Dienste). Nenne nie andere Menüpunkte, Knöpfe oder Funktionen.
- Notruf 112 nur bei Verletzung, Gefahr oder Bedrohung, die die Person schildert. Bei Wünschen wie Abholen, Taxi oder Fahrdienst sag, dass du nichts bestellen kannst. Wird jemand verfolgt oder bedroht: belebten Ort aufsuchen und 110. Bei Profil Hören rätst du nie zum Anrufen, sondern zur App nora (Notruf ohne Sprechen).
- Allgemeine Fragen ohne Ort (ob Rad oder Bus umweltfreundlicher ist, ob es Gebärdensprache gibt, Regeln) beantwortest du direkt oder mit „dazu habe ich keine Angabe“. Frag dann nicht nach dem Ziel.
- Gruppen ab fünf Personen empfiehlst du nicht das Auto.
- Wird die Frage auf Englisch, Türkisch, Arabisch, Ukrainisch oder in einer anderen Sprache gestellt, antworte in kurzen Sätzen in dieser Sprache; Orts- und Liniennamen bleiben unverändert.
- Über Flowtown: Prototyp von barrierefrAI (Dr. Markus Paulußen), kostenlos, keine offizielle App von moBiel. Zur Beantwortung gehen Fragen an die KI von Mistral, ohne Training mit den Daten. Quellen: Fahrplan von DELFI (Sollfahrplan mit Verspätungen), moBiel (Umleitungen), DB (Aufzüge an Bahnhöfen), Bielefeld barrierefrei erleben (Bethel), Stadt Bielefeld (Toiletten, Parkplätze, Baustellen), OpenStreetMap, HERE (Wege und Verkehr). Sag nie, dass alles „in Echtzeit“ ist: nur Verspätungen und Baustellen sind nahe an Echtzeit.
- Bei Angst, Unruhe oder Unsicherheit zuerst ein ruhiger Satz, dann eine Hilfe. Keine kühlen Absagen: statt „Dazu kann ich nichts sagen“ sag, was die Person stattdessen tun kann.
- Fragen zum Aufzug an einem bestimmten Bahnhof oder einer Haltestelle: Werkzeug haltestelle (Aufzug vorhanden) und bei Bahnhöfen der DB db_aufzuege_ausser_betrieb. Bestätige nur Orte, die ein Werkzeug findet; ein Ort, den kein Werkzeug kennt, heißt „den Ort kenne ich nicht“. Am Hauptbahnhof gibt es beides: den Status der DB und die Haltestelle der Stadtbahn ohne Live-Status.
- „Fährt der Bus oder die Bahn noch?“, „Fährt die Linie X?“: Werkzeug abfahrten_in_der_naehe, nicht oepnv_stoerungen. Gibt es die Linie dort nicht, sag, dass du sie nicht findest. Sag „laut Fahrplan“ nur, wenn ein Werkzeug Abfahrten geliefert hat.
- Steigung nennst du nur, wenn weg_check sie ausdrücklich liefert. Fehlt sie, sag „zur Steigung habe ich keine Angabe“, nie „keine steilen Stücke“ oder „flach“.
- Hat jemand den Anschluss verpasst oder fällt eine Bahn aus: Werkzeug abfahrten_in_der_naehe und die nächsten Abfahrten nennen, nicht nur auf Personal verweisen.
- Wird jemand verfolgt oder bedroht, oder fragt nach einer sicheren Stelle: zuerst „Geh zu einem belebten Ort, zum Beispiel einer Haltestelle oder einem Geschäft, und ruf die 110“, nenne mit haltestellen_in_der_naehe einen Ort in der Nähe. Nicht mit 112 anfangen.
- Startbildschirm: iPhone: in Safari auf das Teilen-Symbol tippen, dann „Zum Home-Bildschirm“. Android: in Chrome im Menü „Zum Startbildschirm hinzufügen“.
- Meldet die Person einen Fehler in deiner Antwort: kurz entschuldigen, danken und raten, wichtige Angaben vor Ort zu prüfen. Keine Rückfrage nach einem Ziel.
- Maße, Breiten, Dauer oder Regeln zu Parkplätzen, Rampen oder Türen ohne Werkzeugangabe: „dazu habe ich keine Angabe“, keine Rückfrage nach dem Ziel.
- Günstigster Weg: Preise kennst du nicht. Nenne dann nicht den Weg mit dem wenigsten CO₂ als „billigsten“, sondern sag „zu Preisen habe ich keine Angabe“.
- Pünktlichkeit („Ist die Linie pünktlich?“): Werkzeug abfahrten_in_der_naehe mit der Linie. Sag „pünktlich“ nur, wenn dort keine Verspätung steht; oepnv_stoerungen sagt dazu nichts. Sag nie „laut Fahrplan pünktlich“.
- Gibt es keine gemeldeten Aufzugsausfälle, heißt das nicht, dass alle Aufzüge gehen. Sag: „Dazu liegt keine Meldung vor, einen Live-Status gibt es für die Stadtbahn nicht.“ Sag nie „laut moBiel“ zu Aufzügen.
- Die App sucht nicht nach Restaurants, Fahrdiensten, Taxis, Apotheken, Ärzten, Werkstätten oder Ladestationen. Verweise dafür nie auf „Wohin?“ oder „Mehr“. Standort teilen gibt es in Flowtown nicht; das macht das Handy zum Beispiel in der Nachrichten-App.
- Angst vor dem Umsteigen, vor Menschenmengen oder vor dem Fahren, ohne Bedrohung: ein beruhigender Satz, dann Hilfe nennen (Umsteigezeit, Personal am Bahnhof). Dann kein 110 und kein „belebter Ort“.
- „Letzte Bahn von A nach B“: nenne die Richtung genau so wie gefragt. Passt die Richtung der Abfahrten nicht, sag, dass du nur die letzten Abfahrten an der Haltestelle kennst.
- Liefert ein Werkzeug nichts, sag „dazu habe ich nichts gefunden“, nie „es gibt keine“ (zum Beispiel keine barrierefreien Restaurants). Nenne einen Ort nur mit dem Typ, der zu seinem Namen passt: eine Staatsanwaltschaft oder ein Gericht ist keine Polizeiwache.
- „Bahnhof“ ohne Zusatz heißt der Hauptbahnhof (Werkzeuge: „Hauptbahnhof“). Frag nicht nach.
- Hat die Person keinen Ort genannt, aber der Standort ist im Kontext bekannt, nutze ihn (Werkzeuge ohne Ortsangabe). Frag nie nach dem Standort, wenn er bekannt ist. Sag nie, ein Weg oder Radweg sei „sicher“.
- „Wie lange dauert der Weg zu X?“ ohne Verkehrsmittel: Werkzeug vergleich, nenne die empfohlene Möglichkeit mit Dauer und, bei Bus und Bahn, der Zahl der Umstiege, nicht nur den Fußweg.
- Bei Rollstuhl oder Rollator nennst du die Gehzeit mit dem Zusatz „geschätzt“ (Feld tempo) und empfiehlst nie das Auto, wenn die Person „mit dem Rollator“ oder „mit dem Rollstuhl“ geht. Gibt es Stufen, nenne Bus und Bahn mit Hochbahnsteig.
- Nenne eine Verbindung mit Bus und Bahn nur „stufenlos“, wenn das Feld stufenlos mit „ja“ beginnt. Sonst sag: „Zur Barrierefreiheit dieser Verbindung habe ich keine vollständige Angabe.“`;
const ASSIST_TOOLS = [
  { type: 'function', function: { name: 'hilfe_menschen', description: 'Wo Menschen helfen können: wenn sich die Person nicht orientieren kann, ein Weg unübersichtlich ist (Baustelle, Menschenmenge, großer Bahnhof), jemand beim Ein- und Aussteigen oder beim Finden eines Eingangs hilft, oder Hilfe nötig ist. Liefert Möglichkeiten ohne erfundene Telefonnummern.', parameters: { type: 'object', properties: {
    art: { type: 'string', enum: ['orientierung', 'bahnhof', 'nahverkehr', 'gefahr'] } } } } },
  { type: 'function', function: { name: 'rueckweg', description: 'Rückweg: von einem Ziel zurück zum Standort oder zu einem anderen Ort. Liefert die letzten Abfahrten heute mit Bus und Bahn nahe dem Ziel (Fahrplan, ohne Verspätung), mit Profil auch Hochbahnsteig, die Aufzüge am Bahnhof und die Verbindungen jetzt.', parameters: { type: 'object', properties: {
    ziel: { type: 'string', description: 'Der Ort, von dem es zurückgeht (etwa das Ziel der Hinfahrt)' }, zurueck_nach: { type: 'string', description: 'leer = Standort' } }, required: ['ziel'] } } },
  { type: 'function', function: { name: 'orte_in_der_naehe', description: 'Findet Orte in der Nähe des Standorts oder eines genannten Orts in Bielefeld.', parameters: { type: 'object', properties: {
    art: { type: 'string', enum: ['rollstuhl_toilette', 'toilette', 'behindertenparkplatz', 'aufzug', 'park_and_ride', 'barrierefreier_ort'] },
    ort: { type: 'string', description: 'Ortsname, Platz oder Adresse; leer = Standort der Person' } }, required: ['art'] } } },
  { type: 'function', function: { name: 'haltestelle', description: 'Angaben zu einer Haltestelle: Hochbahnsteig/stufenlos, Aufzug, Linien und die nächsten Abfahrten laut Fahrplan.', parameters: { type: 'object', properties: {
    name: { type: 'string' }, nur: { type: 'string', enum: ['stadtbahn', 'bus', 'zug', 'alle'] } }, required: ['name'] } } },
  { type: 'function', function: { name: 'haltestellen_in_der_naehe', description: 'Stadtbahn-Haltestellen in der Nähe, mit Angabe Hochbahnsteig ja/nein.', parameters: { type: 'object', properties: {
    ort: { type: 'string', description: 'leer = Standort' }, nur_stufenlos: { type: 'boolean' } } } } },
  { type: 'function', function: { name: 'weg', description: 'Prüft den Weg zu einem Ziel: Dauer, Meldungen auf der Strecke, bei Bus und Bahn die nächsten Verbindungen.', parameters: { type: 'object', properties: {
    ziel: { type: 'string' }, verkehrsmittel: { type: 'string', enum: ['auto', 'rad', 'fuss', 'oepnv'] }, start: { type: 'string', description: 'leer = Standort' } }, required: ['ziel', 'verkehrsmittel'] } } },
  { type: 'function', function: { name: 'verkehrslage', description: 'Baustellen, Sperrungen und Stau in der Nähe eines Orts oder des Standorts.', parameters: { type: 'object', properties: {
    ort: { type: 'string', description: 'leer = Standort' } } } } },
  { type: 'function', function: { name: 'ort_barrierefreiheit', description: 'Alle Angaben zur Barrierefreiheit eines bestimmten Gebäudes in Bielefeld (Theater, Museum, Amt, Café …) aus „Bielefeld barrierefrei erleben“: Eingang, Aufzug, WC, Hilfen für Seh- und Hörbehinderung, Services, mit Anmerkungen.', parameters: { type: 'object', properties: {
    name: { type: 'string', description: 'Name des Gebäudes, z. B. Stadttheater, Kunsthalle' },
    thema: { type: 'string', enum: ['alle', 'zugang', 'aufzug', 'wc', 'sehen', 'hoeren', 'service', 'einfach'], description: 'nur ein Bereich; leer = alle' } }, required: ['name'] } } },
  { type: 'function', function: { name: 'meine_auswertung', description: 'Auswertung der eigenen Fahrten der Person (nur auf ihrem Handy berechnet): Fahrten, Wartezeit an Ampeln, größte Zeitfresser, häufigster Weg, persönliche Tipps.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'hinweise', description: 'Hinweise der Redaktion barrierefrAI (häufige Fragen, z. B. Altstadt) und von Nutzerinnen gemeldete Hindernisse.', parameters: { type: 'object', properties: {
    stichwort: { type: 'string' }, ort: { type: 'string' } } } } },
  { type: 'function', function: { name: 'vergleich', description: 'Vergleicht für ein Ziel Auto, Bus und Bahn, Rad und zu Fuß: Ankunft, Dauer, Stau, Umstiege; mit Profil auch stufenlos, Hindernisse und Behindertenparkplatz. Liefert eine Empfehlung mit Grund.', parameters: { type: 'object', properties: {
    ziel: { type: 'string' }, start: { type: 'string', description: 'leer = Standort' } }, required: ['ziel'] } } },
  { type: 'function', function: { name: 'weg_check', description: 'Prüft den Fußweg (auch mit Rollstuhl oder Rollator) zu einem Ziel auf Hindernisse: Stufen, Kopfsteinpflaster, Steigung, unbefestigte Wege, hohe Bordsteine, Gleise, Ampeln mit und ohne Tonsignal, Baustellen und von anderen gemeldete Hindernisse.', parameters: { type: 'object', properties: {
    ziel: { type: 'string' }, start: { type: 'string', description: 'leer = Standort' } }, required: ['ziel'] } } },
  { type: 'function', function: { name: 'oepnv_stoerungen', description: 'Aktuelle Umleitungen und Störungen bei Bus und Stadtbahn von moBiel und gemeldete defekte Aufzüge.', parameters: { type: 'object', properties: {
    linie: { type: 'string', description: 'z. B. 4 oder 25; leer = alle' } } } } },
  { type: 'function', function: { name: 'abfahrten_in_der_naehe', description: 'Die nächsten Abfahrten laut Fahrplan an den Haltestellen am nächsten beim Standort oder bei einem Ort, ohne dass die Person eine Haltestelle nennen muss.', parameters: { type: 'object', properties: {
    ort: { type: 'string', description: 'leer = Standort' }, nur: { type: 'string', enum: ['stadtbahn', 'zug', 'bus', 'alle'] } } } } },
  { type: 'function', function: { name: 'ort_info', description: 'Was an einem Ort zählt, an dem die Person sein will (nicht am Standort): Barrierefreiheit des Gebäudes laut Bielefeld barrierefrei erleben, nächstes rollstuhlgerechtes WC und Toilette, Behindertenparkplatz, nächste Stadtbahn-Haltestelle mit Hochbahnsteig, gemeldete Hindernisse.', parameters: { type: 'object', properties: {
    ort: { type: 'string', description: 'Name, Gebäude oder Adresse; in einer anderen Stadt mit Stadtnamen' } }, required: ['ort'] } } },
  { type: 'function', function: { name: 'ampeln_mit_ton', description: 'Ampeln in der Nähe eines Orts mit Angabe, ob sie ein Tonsignal für blinde Menschen haben, und den Straßen der Kreuzung.', parameters: { type: 'object', properties: {
    ort: { type: 'string', description: 'leer = Standort' } } } } }
];
const TOOL_NAMES = new Set(ASSIST_TOOLS.map((t) => t.function.name));
// Ort von „Bielefeld barrierefrei erleben“ nach Namen; mehrdeutig: Kandidaten zur Rückfrage
const BF_THEMA = { zugang: [11, 37], aufzug: [39, 49], wc: [57, 71], sehen: [75, 99], hoeren: [100, 109], service: [17, 25], einfach: [111, 120] };
const BF_STOP = new Set(['bielefeld', 'das', 'der', 'die', 'im', 'in', 'am', 'zum', 'zur', 'e', 'v', 'ev', 'gmbh']);
const bfNorm = (x) => String(x || '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9äöü]+/g, ' ').trim();
function bfOrtDetails(name, thema) {
  if (!bf || !(bf.orte || []).length) return { fehler: 'Die Daten von Bielefeld barrierefrei erleben sind gerade nicht geladen.' };
  const toks = bfNorm(name).split(/\s+/).filter((w) => w && !BF_STOP.has(w));
  if (!toks.length) return { fehler: 'Kein Name' };
  const seen = new Set(), orte = bf.orte.filter((o) => !seen.has(o.id) && seen.add(o.id));
  const scored = orte.map((o) => {
    const n = bfNorm(o.n), u = bfNorm(String(o.u || '').replace(/^https?:\/\/[^/]+/, ''));
    const hit = toks.filter((w) => n.includes(w) || u.includes(w)).length;
    return { o, sc: hit / toks.length + (n.startsWith(toks[0]) ? 0.2 : 0) - n.length / 1000 };
  }).filter((x) => x.sc > 0.5).sort((p, q) => q.sc - p.sc);
  if (!scored.length) return { gefunden: false, hinweis: 'Diesen Ort gibt es in Bielefeld barrierefrei erleben nicht. Frag nach einem anderen Namen oder nutze orte_in_der_naehe.' };
  if (scored.length > 1 && scored[1].sc >= scored[0].sc - 0.05) return { mehrdeutig: true, kandidaten: scored.slice(0, 6).map((x) => x.o.n) };
  const o = scored[0].o, det = (bf.details || {})[o.id];
  const rng = BF_THEMA[thema];
  const ang = det ? det.d.filter((x) => !rng || (x[0] >= rng[0] && x[0] <= rng[1])).map((x) => ({ frage: x[1], antwort: x[2] || '', hinweis: x[3] || undefined })) : null;
  return {
    name: o.n, adresse: o.adr, telefon: o.tel || undefined, behindertenparkplaetze: o.park,
    angaben: ang || Object.entries(o.f || {}).map(([k, v]) => ({ merkmal: k, antwort: v === 1 ? 'ja' : v === 0 ? 'nein' : 'keine Angabe' })),
    hinweise: o.hinweis, stand_der_erhebung: (det && det.stand) || o.stand || undefined,
    quelle: 'Bielefeld barrierefrei erleben (v. Bodelschwinghsche Stiftungen Bethel)', link: o.u || BF_URL
  };
}
// Eingang nahe einem Ziel (OpenStreetMap, bis 70 m): mit Rollstuhl oder Rollator zuerst ein stufenloser, sonst Haupteingang, sonst der nächste.
// Nur zu Fuß: Die Strecke endet am Eingang statt in der Gebäudemitte. Nicht gefunden oder zu langsam: null, dann gilt das Ziel wie gegeben.
const eingCells = new Map();   // feste Rechtecke von 0,006° (etwa 670 × 410 m): so erfährt Overpass nie das genaue Ziel
const EING_CELL = 0.006;
async function eingCell(a, b) {
  const k = a + '_' + b, c = eingCells.get(k);
  if (c && Date.now() - c.t < 7 * 864e5) return c.list;
  const bb = `${(a * EING_CELL - 0.0012).toFixed(5)},${(b * EING_CELL - 0.0016).toFixed(5)},${((a + 1) * EING_CELL + 0.0012).toFixed(5)},${((b + 1) * EING_CELL + 0.0016).toFixed(5)}`;
  const j = await Promise.race([overpass(`[out:json][timeout:20];node[entrance](${bb});out tags;`, 15000), new Promise((_, rej) => setTimeout(() => rej(new Error('zu langsam')), 16000))]);
  const list = (j.elements || []).filter((e) => e.type === 'node' && e.tags && e.tags.entrance && !/^(emergency|exit)$/.test(e.tags.entrance) && isFinite(e.lat)).map((e) => ({ t: e.tags, pos: [r5(e.lat), r5(e.lon)] }));
  eingCells.set(k, { t: Date.now(), list });
  if (eingCells.size > 300) eingCells.delete(eingCells.keys().next().value);
  return list;
}
// Antwort höchstens ms abwarten, sonst der Ersatzwert; die Abfrage läuft im Hintergrund weiter und landet im Speicher
const zuerst = (p, ms, ersatz = null) => Promise.race([Promise.resolve(p).catch(() => ersatz), new Promise((r) => setTimeout(() => r(ersatz), ms))]);
async function eingangNahe(pos, typ) {
  if (!pos || !isFinite(pos[0])) return null;
  const mob = ['rollstuhl', 'rollator'].includes(typ);
  let all;
  try { all = await eingCell(Math.floor(pos[0] / EING_CELL), Math.floor(pos[1] / EING_CELL)); } catch (e) { return null; }
  const list = all.map((x) => Object.assign({ d: mAbs(pos, x.pos) }, x)).filter((x) => x.d <= 70);
  const rank = (x) => (mob ? (x.t.wheelchair === 'yes' ? 0 : x.t.wheelchair === 'limited' ? 1 : x.t.wheelchair === 'no' ? 9 : 4) : 0) + (x.t.entrance === 'main' ? 0 : x.t.entrance === 'service' || x.t.entrance === 'staircase' ? 5 : 2);
  list.sort((a, b) => rank(a) - rank(b) || a.d - b.d);
  const best = list[0];
  if (!best) return null;
  const t = best.t;
  return { pos: best.pos, art: t.entrance === 'main' ? 'Haupteingang' : t.entrance === 'service' ? 'Nebeneingang für Personal oder Lieferung' : 'Eingang', abstand_m: Math.round(best.d / 5) * 5,
    stufenlos: t.wheelchair === 'yes' ? 'ja' : t.wheelchair === 'limited' ? 'eingeschränkt' : t.wheelchair === 'no' ? 'nein' : 'keine Angabe',
    automatiktuer: /^(yes|button)$/.test(t.automatic_door || '') ? 'ja' : undefined, stufen: parseInt(t.step_count, 10) > 0 ? parseInt(t.step_count, 10) : undefined, quelle: 'OpenStreetMap' };
}
// Ort aus Text: Standort, ein gespeichertes Ziel aus dem Kontext, ein Ort von Bethel, sonst HERE
async function assistOrt(name, ctx) {
  const n = String(name || '').trim();
  if (!n || /^(hier|standort|mein standort|in der nähe)$/i.test(n)) return ctx.pos ? { name: 'Standort', pos: ctx.pos } : null;
  // unterwegs in einer anderen Stadt: dort suchen, nicht in Bielefeld (außer Bielefeld wird genannt)
  if (ctx.aussen && !/bielefeld/i.test(n)) {
    // gespeicherte Ziele nur, wenn sie in der Nähe liegen: „Hauptbahnhof“ ist in Mönchengladbach nicht der in Bielefeld
    const z = (ctx.ziele || []).find((x) => hstNorm(x.name) === hstNorm(n) && isFinite(x.lat) && mAbs(ctx.pos, [x.lat, x.lon]) < 30000);
    if (z) return { name: z.name, pos: [z.lat, z.lon] };
    const nq = n.replace(/^\s*(die|der|das|zur|zum|zu)\s+/i, '').replace(/^\s*(bahnhof|hbf)\s*$/i, 'Hauptbahnhof');
    const r = HERE_KEY ? (await findOrt(nq + (ctx.stadt && !new RegExp(ctx.stadt, 'i').test(nq) ? ', ' + ctx.stadt : ''), ctx.pos).catch(() => []))[0] : null;
    return r ? { name: r.name, pos: [r.lat, r.lon], adresse: r.sub, gefunden_ueber: 'Ortssuche (HERE)' } : null;
  }
  // „Universität Bielefeld“, „die Uni“: Zusatz Bielefeld und Artikel weglassen, damit Haltestelle und Gebäude gefunden werden
  const nq = n.replace(/(^|[\s,])(in\s+)?bielefeld\b/ig, ' ').replace(/^\s*(die|der|das|zur|zum|zu)\s+/i, '').replace(/^\s*uni\s*$/i, 'Universität').replace(/^\s*(bahnhof|hbf)\s*$/i, 'Hauptbahnhof').replace(/\s+/g, ' ').trim() || n;
  const k = hstNorm(nq);
  const z = (ctx.ziele || []).find((x) => hstNorm(x.name) === k || hstNorm(x.name).includes(k) || k.includes(hstNorm(x.name)));
  if (z && isFinite(z.lat)) return { name: z.name, pos: [z.lat, z.lon] };
  const orte = (bf && bf.orte) || [];
  const exact = orte.find((x) => hstNorm(x.n) === k || hstNorm(x.n) === k + 'bielefeld' || hstNorm(x.n) === hstNorm(n));
  if (exact) return { name: exact.n, pos: [exact.lat, exact.lon], adresse: exact.adr, gefunden_ueber: 'Bielefeld barrierefrei erleben' };
  const st = tramStops() && tramStops().get(k);
  if (st) return { name: 'Haltestelle ' + st.name, pos: st.pos[0], gefunden_ueber: 'Stadtbahn-Haltestelle' };
  // Teil-Treffer: genau ein Gebäude passt, dann dieses; passen mehrere, nicht raten, sondern zur Auswahl stellen
  const seen = new Set(), hits = orte.filter((x) => hstNorm(x.n).includes(k) && !seen.has(x.id) && seen.add(x.id));
  const starts = hits.filter((x) => hstNorm(x.n).startsWith(k));
  const one = hits.length === 1 ? hits[0] : starts.length === 1 ? starts[0] : null;
  if (one) return { name: one.n, pos: [one.lat, one.lon], adresse: one.adr, gefunden_ueber: 'Bielefeld barrierefrei erleben' };
  let r = null;
  if (HERE_KEY) {
    const plain = /bielefeld/i.test(n) ? null : (await findOrt(n).catch(() => []))[0];
    // „Mönchengladbach Hauptbahnhof“: Der Treffer liegt in der genannten Stadt, also gilt er
    if (plain && plain.stadt && !/bielefeld/i.test(plain.stadt) && hstNorm(n).includes(hstNorm(plain.stadt))) return { name: plain.name, pos: [plain.lat, plain.lon], adresse: plain.sub, gefunden_ueber: 'Ortssuche (HERE)' };
    r = (await findOrt(n + (/bielefeld/i.test(n) ? '' : ', Bielefeld')).catch(() => []))[0] || null;
  }
  if (hits.length > 1) {
    const pos = r ? [r.lat, r.lon] : [hits[0].lat, hits[0].lon];
    return { name: r ? r.name : n, pos, adresse: r ? r.sub : undefined, gefunden_ueber: r ? 'Ortssuche (HERE)' : 'Bielefeld barrierefrei erleben, erster Treffer', auswahl: hits.slice(0, 6).map((x) => x.n) };
  }
  return r ? { name: r.name, pos: [r.lat, r.lon], adresse: r.sub, gefunden_ueber: 'Ortssuche (HERE)' } : null;
}
// Abfahrten laut Fahrplan (Ortszeit Bielefeld), die nächsten 60 Minuten
function berlinNow() {
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { ymd: f.year + f.month + f.day, min: Number(f.hour) * 60 + Number(f.minute) };
}
function serverDepartures(name, kind, d, span, lim) {
  d = d || fpData();
  rtWanted = Date.now(); rtTick();
  const city = (Object.values(fahrplaene).find((f) => fpParsedBy[f.id] === d) || {}).id || 'bielefeld';
  if (!d) return [];
  const k = hstNorm(name), idx = new Set();
  d.stops.forEach((st, i) => { if (hstNorm(fpName(st[1], d)) === k) idx.add(i); });
  const { ymd, min } = berlinNow();
  const prev = (() => { const t = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) - 864e5); return t.toISOString().slice(0, 10).replace(/-/g, ''); })();
  const out = [];
  for (let ti = 0; ti < d.trips.length; ti++) {
    const t = d.trips[ti];
    if (kind != null && d.routes[t[0]][1] !== kind) continue;
    const pat = d.patterns[t[1]], days = d.services[t[3]] || [];
    let tm = t[4];
    for (let j = 0; j < pat.length - 1; j++) {
      if (idx.has(pat[j])) {
        for (const [day, off] of [[ymd, 0], [prev, 1440]]) {
          const at = tm - off;
          if (at >= min && at <= min + (span || 60) && days.includes(day)) out.push(Object.assign({ in_min: at - min, uhr: `${String(Math.floor((at % 1440) / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`, linie: d.routes[t[0]][0], richtung: fpName(d.heads[t[2]], d), art: ['Stadtbahn', '', 'Zug', 'Bus'][d.routes[t[0]][1]] || 'Bus' }, off === 0 ? rtAt(city, ti, pat, j) || {} : {}));
        }
      }
      tm += t[5][j] || 0;
    }
  }
  return out.sort((a, b) => a.in_min - b.in_min).slice(0, lim || 6);
}
// ---------- Weg-Check auf dem Server, wie in der App: Stufen, Belag, Steigung, Bordsteine, Gleise, Ampeln mit Tonsignal ----------
// Grundlage sind dieselben Kacheln aus OpenStreetMap wie für die App (fussnetz). Fehlt eine Kachel, wird sie geholt; dauert das
// zu lange, antwortet der Check mit dem, was da ist, und sagt es.
const FUSS_BAD_S = ['stufen', 'kopfstein', 'steil', 'unbefestigt', 'holprig'];
const FUSS_LABEL_S = { stufen: 'Stufen', kopfstein: 'Kopfsteinpflaster', steil: 'steiler als 6 Prozent', unbefestigt: 'unbefestigter Weg', holprig: 'holpriges Pflaster' };
const FUSS_WICHTIG = { rollstuhl: ['stufen', 'kopfstein', 'steil', 'unbefestigt', 'holprig', 'bordstein', 'gleis'], rollator: ['stufen', 'kopfstein', 'unbefestigt', 'steil', 'holprig', 'bordstein', 'gleis'], sehen: ['stufen', 'gleis', 'ampel'], hoeren: [], lernen: ['stufen'], ruhe: ['stufen', 'steil'] };
const HINWEIS_NAME = { stufe: 'Stufe oder Treppe', bordstein: 'hoher Bordstein', pflaster: 'schlechter Belag', aufzug: 'Aufzug defekt', blockiert: 'Gehweg blockiert', toilette: 'Toilette nicht nutzbar', ampel: 'Ampel zu kurz grün oder ohne Ton', gut: 'gut zugänglich' };
const fussParsed = new Map();
const fussKeyS = (lat, lon) => `${Math.floor(lat / RAD_TILE)}_${Math.floor(lon / RAD_TILE)}`;
async function fussTileS(k, waitMs) {
  if (fussParsed.has(k)) return fussParsed.get(k);
  let c = fussCached(k);
  if (!c) {
    const job = fussFetch(k);
    job.catch(() => {});
    c = await Promise.race([job, new Promise((r) => setTimeout(() => r(null), waitMs))]).catch(() => null);
  }
  if (!c) return null;
  let d;
  try { d = JSON.parse(zlib.gunzipSync(c.gz).toString('utf8')); } catch (e) { return null; }
  fussParsed.set(k, d);
  if (fussParsed.size > 40) fussParsed.delete(fussParsed.keys().next().value);
  return d;
}
const bearingS = (a, b) => { const y = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), x = b[0] - a[0]; return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
function profilTyp(k) {
  const t = String((k && (k.profil_typ || k.profil)) || '').toLowerCase();
  if (['rollstuhl', 'rollator', 'sehen', 'hoeren', 'lernen', 'ruhe'].includes(t)) return t;
  return /rollstuhl/.test(t) ? 'rollstuhl' : /rollator|gehhilfe/.test(t) ? 'rollator' : /sehe/.test(t) ? 'sehen' : /höre|hoere/.test(t) ? 'hoeren' : /einfach/.test(t) ? 'lernen' : /ruhe/.test(t) ? 'ruhe' : '';
}
// Merkmal „Tonsignal“ aus den Rückmeldungen nach Fahrten (neueste zählt), sonst aus OpenStreetMap
function tonAt(lat, lon, osm) {
  let best = null;
  for (const m of merkmale) if (m.m === 'ton' && Math.abs(m.lat - lat) < 0.0003 && Math.abs(m.lon - lon) < 0.0005 && mAbs([m.lat, m.lon], [lat, lon]) <= 25 && (!best || m.tag >= best.tag)) best = m;
  return best ? (best.v ? 'ja' : 'nein') : osm === 1 ? 'ja' : osm === 0 ? 'nein' : 'keine Angabe';
}
async function wegCheck(pts, waitMs) {
  if (!Array.isArray(pts) || pts.length < 2) return { fehler: 'Keine Strecke' };
  const s = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], d = mAbs(a, b), n = Math.max(1, Math.round(d / 10));
    for (let k = 0; k < n; k++) s.push({ p: [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], m: d / n, h: bearingS(a, b) });
  }
  const keys = [...new Set(s.map((x) => fussKeyS(x.p[0], x.p[1])))].slice(0, 6);
  const tiles = {};
  await Promise.all(keys.map(async (k) => { tiles[k] = await fussTileS(k, waitMs); }));
  const fehlt = keys.filter((k) => !tiles[k]).length;
  // nur Wege und Punkte in der Nähe der Strecke betrachten
  const la0 = Math.min(...pts.map((p) => p[0])) - 0.0004, la1 = Math.max(...pts.map((p) => p[0])) + 0.0004, lo0 = Math.min(...pts.map((p) => p[1])) - 0.0006, lo1 = Math.max(...pts.map((p) => p[1])) + 0.0006;
  const inBb = (q) => q[0] >= la0 && q[0] <= la1 && q[1] >= lo0 && q[1] <= lo1;
  const ways = [], nodes = [];
  for (const k of keys) { const t = tiles[k]; if (!t) continue; for (const w of t.ways || []) if (w.g.some(inBb)) ways.push(w); for (const nd of t.nodes || []) if (inBb(nd)) nodes.push(nd); }
  const m = { gut: 0, holprig: 0, kopfstein: 0, unbefestigt: 0, steil: 0, stufen: 0, offen: 0 };
  const runs = [];
  let run = null;
  const hit = { b: new Set(), g: new Set(), a: new Map() };
  for (const x of s) {
    let best = null;
    for (const w of ways) {
      for (let i = 0; i < w.g.length - 1; i++) {
        const d = segDist(x.p, w.g[i], w.g[i + 1]);
        if (d > 12) continue;
        let ad = Math.abs(bearingS(w.g[i], w.g[i + 1]) - x.h) % 180;
        ad = Math.min(ad, 180 - ad);
        if (ad > 35 && d > 4) continue;
        const stufe = w.c === 'stufen' && d <= 5 && ad <= 35;
        if (w.c === 'stufen' && !stufe) continue;
        if (stufe) {
          const e0 = w.g[0], e1 = w.g[w.g.length - 1], tol = Math.min(3, mAbs(e0, e1) / 3);
          if (mAbs(x.p, e0) < tol || mAbs(x.p, e1) < tol) continue;
        }
        if (!best || (stufe && !best.stufe) || (d < best.d && !best.stufe)) best = { w, d, stufe };
      }
    }
    for (const nd of nodes) {
      if (Math.abs(nd[0] - x.p[0]) > 0.0002 || Math.abs(nd[1] - x.p[1]) > 0.0003 || mAbs(nd, x.p) > 10) continue;
      const key = nd[0] + ',' + nd[1];
      if (nd[2] === 'b') hit.b.add(key); else if (nd[2] === 'g') hit.g.add(key); else if (nd[2] === 'a' && !hit.a.has(key)) hit.a.set(key, nd);
    }
    const c = best ? best.w.c : 'offen';
    m[c] += x.m;
    if (FUSS_BAD_S.includes(c)) {
      const name = best.w.n || '';
      if (run && run.c === c && run.name === name) run.m += x.m; else { run = { c, name, m: x.m }; runs.push(run); }
    } else run = null;
  }
  const by = {};
  for (const r of runs) { if (r.c !== 'stufen' && r.m < 25) continue; const k = r.c + '|' + r.name; by[k] = by[k] || { art: FUSS_LABEL_S[r.c], c: r.c, bei: r.name || undefined, laenge_m: 0 }; by[k].laenge_m += r.m; }
  const stellen = Object.values(by).sort((a, b) => FUSS_BAD_S.indexOf(a.c) - FUSS_BAD_S.indexOf(b.c) || b.laenge_m - a.laenge_m).map((x) => ({ art: x.art, c: x.c, bei: x.bei, laenge_m: Math.round(x.laenge_m / 10) * 10 }));
  const total = Object.values(m).reduce((a, b) => a + b, 0) || 1;
  const ampeln = [...hit.a.values()].map((nd) => tonAt(nd[0], nd[1], nd[3]));
  return {
    stellen, hohe_bordsteine: hit.b.size, gleise_queren: hit.g.size,
    ampeln: { gesamt: ampeln.length, mit_tonsignal: ampeln.filter((x) => x === 'ja').length, ohne_tonsignal: ampeln.filter((x) => x === 'nein').length, keine_angabe: ampeln.filter((x) => x === 'keine Angabe').length },
    gut_begehbar_prozent: Math.round(m.gut / total * 100), ohne_angabe_prozent: Math.round(m.offen / total * 100),
    daten: fehlt ? `unvollständig: ${fehlt} von ${keys.length} Kartenstücken werden noch geladen, gleich noch einmal fragen` : 'OpenStreetMap-Mitwirkende'
  };
}
// gemeldete Hindernisse (nicht verworfen) entlang einer Strecke
function hinweiseAm(pts, tol) {
  const now = Date.now();
  return hinweise.filter((h) => h.bis > now && h.weg < 2 && h.art !== 'gut' && pts.some((p, i) => i % 2 === 0 && mAbs(p, [h.lat, h.lon]) <= tol))
    .slice(0, 6).map((h) => ({ art: HINWEIS_NAME[h.art] || h.art, bestaetigt: h.ok || 0, geprueft: !!h.geprueft }));
}
// nach Profil: was davon zählt
function wichtigFuer(typ, check) {
  const w = FUSS_WICHTIG[typ];
  if (!w || !check || check.fehler) return null;
  const out = check.stellen.filter((x) => w.includes(x.c)).map((x) => (x.c === 'stufen' ? 'Stufen' + (x.bei ? ' (' + x.bei + ')' : '') : `${x.laenge_m} m ${x.art}${x.bei ? ' (' + x.bei + ')' : ''}`));
  if (w.includes('bordstein') && check.hohe_bordsteine) out.push(check.hohe_bordsteine === 1 ? 'ein hoher Bordstein' : check.hohe_bordsteine + ' hohe Bordsteine');
  if (w.includes('gleis') && check.gleise_queren) out.push(check.gleise_queren === 1 ? 'einmal Gleise queren' : check.gleise_queren + '-mal Gleise queren');
  if (w.includes('ampel') && check.ampeln.gesamt) out.push(`${check.ampeln.gesamt} Ampeln, davon ${check.ampeln.mit_tonsignal} mit Tonsignal, ${check.ampeln.ohne_tonsignal} ohne, ${check.ampeln.keine_angabe} ohne Angabe`);
  return out;
}
// ---------- Vergleich: womit komme ich am besten hin? Auto, Bus und Bahn, Rad, zu Fuß, mit Profil ----------
const uhr = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
const hbsOf = (n) => { const y = hst && hst.liste.find((z) => z.k === hstNorm(n)); return y ? y.hbs : 'keine Angabe'; };
// CO2 je Personenkilometer, grob nach Durchschnittswerten des Umweltbundesamts (gerundet): Auto 160 g, Bus 80 g, Stadtbahn und Zug 60 g
const CO2_G = { auto: 160, bus: 80, bahn: 60, zug: 60, rad: 0, fuss: 0 };
const kgText = (g) => (g >= 1000 ? `${(Math.round(g / 100) / 10).toLocaleString('de-DE')} kg` : `${Math.round(g / 10) * 10} g`);
// <waehle>
// Gehtempo je Profil (Annahme, einstellbar): Rollator etwa 2,5 km/h, Rollstuhl etwa 3,5 km/h. HERE rechnet mit einem Fußgänger ohne Hilfsmittel.
const GEH_KMH = { rollator: Number(process.env.GEHTEMPO_ROLLATOR_KMH) || 2.5, rollstuhl: Number(process.env.GEHTEMPO_ROLLSTUHL_KMH) || 3.5 };
function gehDauerS(dauerS, km, typ) {
  const kmh = GEH_KMH[typ];
  if (!kmh || !km) return dauerS;
  return Math.max(dauerS, Math.round((km / kmh) * 3600));
}
// Welche Möglichkeit empfohlen wird. Ohne Profil: umweltfreundlichste, wenn kaum langsamer. Rollstuhl und Rollator: zu Fuß vor Bus und Bahn vor Auto,
// mit größerem Spielraum; sagt die Person „mit dem Rollator“ oder „zu Fuß“, geht der geeignete Fußweg vor.
function waehleBeste(opt, { typ, vorrang, now, zuFuss }) {
  const mob = ['rollstuhl', 'rollator'].includes(typ);
  const ok = opt.filter((o) => o.geeignet);
  const pool = ok.length ? ok : opt;
  const ECO = mob ? { fuss: 0, oepnv: 1, rad: 2, auto: 3 } : { fuss: 0, rad: 1, oepnv: 2, auto: 3 };
  const fastest = pool.slice().sort((a, b) => a.ankunft - b.ankunft)[0];
  if (mob && zuFuss) { const f = pool.find((o) => o.verkehrsmittel === 'fuss'); if (f) return { best: f, fastest, pool }; }
  // Spielraum: höchstens so viel später wie ein Viertel der schnellsten Reisezeit, mindestens 5, höchstens 15 Minuten (Rollstuhl, Rollator: etwa ein Drittel, 10 bis 20 Minuten)
  const lo = mob ? 10 : 5, hi = mob ? 20 : 15, anteil = mob ? 0.35 : 0.25;
  const tol = vorrang === 'schnell' ? 3 * 60000 : Math.min(hi * 60000, Math.max(lo * 60000, (fastest.ankunft - now) * anteil));
  const best = pool.filter((o) => o.ankunft <= fastest.ankunft + tol).sort((a, b) => ECO[a.verkehrsmittel] - ECO[b.verkehrsmittel] || a.ankunft - b.ankunft)[0] || fastest;
  return { best, fastest, pool };
}
// </waehle>
async function vergleichZiel(from, to, typ, vorrang, zuFuss) {
  const now = Date.now();
  const luft = mAbs(from, to), weit = (m) => Promise.reject(new Error('zu weit'));
  const [ra, rr, rf, ro] = await Promise.allSettled([checkZiel(from, to, 'auto', true), luft > 60000 ? weit() : checkZiel(from, to, 'rad', true), luft > 25000 ? weit() : checkZiel(from, to, 'fuss', true), checkZielOepnv(from, to)]);
  const mob = ['rollstuhl', 'rollator'].includes(typ);
  const opt = [];
  if (ra.status === 'fulfilled') {
    // Parken und Weg vom Parkplatz: geschätzt 5 Minuten, damit das Auto nicht schneller wirkt, als es am Ziel ist
    const v = ra.value, o = { verkehrsmittel: 'auto', dauer_min: Math.round(v.dauer / 60) + 5, parken: 'inklusive etwa 5 Minuten für Parken (geschätzt)', ankunft: now + (v.dauer + 300) * 1000, km: v.km, verzoegerung_min: Math.max(0, Math.round((v.dauer - v.basis) / 60)), meldungen: v.items.slice(0, 2).map((it) => it.titel + (it.art ? ' (' + it.art + ')' : '') + (it.km != null && v.km > 20 ? ', nach etwa ' + it.km + ' km' : '')), geeignet: true };
    if (v.alternative) o.ausweichroute = { dauer_min: Math.round(v.alternative.dauer / 60) + 5, ueber: v.alternative.strassen, ohne_stau: v.alternative.ohne, km: v.alternative.km };
    o.co2_g = Math.round(v.km * CO2_G.auto);
    if (mob) { const near = (bpp && bpp.plaetze || []).map((p) => mAbs(to, [p[0], p[1]])).sort((a, b) => a - b)[0]; o.behindertenparkplatz = near != null && near <= 500 ? `etwa ${Math.round(near / 50) * 50} m vom Ziel` : 'keiner bis 500 m bekannt'; }
    opt.push(o);
  }
  if (ro.status === 'fulfilled' && !ro.value.verbindungen.some((x) => Date.parse(x.ab) >= now - 60000)) {
    // nur abgefahrene Verbindungen im Zwischenspeicher: frisch fragen
    zielCache.delete([from, to, 'oepnv'].join('|'));
    try { ro.value = await checkZielOepnv(from, to); } catch (e) { /* ohne Bus und Bahn */ }
  }
  if (ro.status === 'fulfilled') {
    const c = ro.value.verbindungen.find((x) => Date.parse(x.ab) >= now - 60000);
    if (c) {
      const fahrt = c.teile.filter((x) => x.art !== 'fuss');
      const o = { verkehrsmittel: 'oepnv', ab: uhr(Date.parse(c.ab)), an: uhr(Date.parse(c.an)), ankunft: Date.parse(c.an), dauer_min: Math.round((Date.parse(c.an) - now) / 60000), umstiege: c.umstiege, linien: fahrt.map((x) => x.linie + (x.von ? ' ab ' + x.von : '')).slice(0, 3), geeignet: true };
      // Strecke für die Schätzung: wie mit dem Auto, sonst wie zu Fuß
      const km = ra.status === 'fulfilled' ? ra.value.km : rf.status === 'fulfilled' ? rf.value.km : 0;
      o.co2_g = Math.round(km * (fahrt.some((x) => x.art === 'bus') ? CO2_G.bus : CO2_G.bahn));
      if (mob) {
        const hb = fahrt.filter((x) => x.art === 'bahn').flatMap((x) => [hbsOf(x.von), hbsOf(x.nach)]);
        o.stufenlos = hb.includes('nein') ? 'nein, mindestens eine Haltestelle ohne Hochbahnsteig' : hb.length && hb.every((x) => x === 'ja') && fahrt.every((x) => x.art === 'bahn') ? 'ja, alle Haltestellen mit Hochbahnsteig' : 'keine vollständige Angabe';
        if (hb.includes('nein')) o.geeignet = false;
        if (!o.stufenlos.startsWith('ja')) o.stufenlos_hinweis = 'Stufenlosigkeit nicht belegt: sag nie „stufenlos“, sondern „zur Barrierefreiheit dieser Verbindung habe ich keine vollständige Angabe“.';
      }
      opt.push(o);
    }
  }
  if (rr.status === 'fulfilled') { const v = rr.value; opt.push({ verkehrsmittel: 'rad', dauer_min: Math.round(v.dauer / 60), ankunft: now + v.dauer * 1000, km: v.km, co2_g: 0, meldungen: v.items.slice(0, 2).map((it) => it.titel), geeignet: !['rollstuhl', 'rollator', 'sehen'].includes(typ) && v.dauer <= 45 * 60 }); }
  if (rf.status === 'fulfilled') {
    const v = rf.value, dF = gehDauerS(v.dauer, v.km, typ), o = { verkehrsmittel: 'fuss', dauer_min: Math.round(dF / 60), ankunft: now + dF * 1000, km: v.km, co2_g: 0, meldungen: v.items.slice(0, 2).map((it) => it.titel), geeignet: dF <= 40 * 60 };
    if (GEH_KMH[typ]) o.tempo = `geschätzt mit ${String(GEH_KMH[typ]).replace('.', ',')} km/h für dein Profil`;
    if (typ) { const ck = await wegCheck(v.pts, 3000).catch(() => null); const w = wichtigFuer(typ, ck); if (w) { o.hindernisse = w; if (mob && ck.stellen.some((x) => x.c === 'stufen')) o.geeignet = false; } const g = hinweiseAm(v.pts, 25); if (g.length) o.gemeldet = g; }
    opt.push(o);
  }
  if (!opt.length) throw Object.assign(new Error('Für dieses Ziel habe ich gerade keine Strecke gefunden.'), { status: 404 });
  const NAME = { auto: 'mit dem Auto', oepnv: 'mit Bus und Bahn', rad: 'mit dem Rad', fuss: 'zu Fuß' };
  const { best, fastest, pool } = waehleBeste(opt, { typ, vorrang, now, zuFuss });
  const car = opt.find((o) => o.verkehrsmittel === 'auto');
  const spart = car && best.verkehrsmittel !== 'auto' && car.co2_g > best.co2_g ? car.co2_g - best.co2_g : 0;
  let grund;
  if (best === fastest) grund = `am frühesten da, Ankunft gegen ${uhr(best.ankunft)}`;
  else grund = `nur ${Math.max(1, Math.round((best.ankunft - fastest.ankunft) / 60000))} min später als ${NAME[fastest.verkehrsmittel]}, Ankunft gegen ${uhr(best.ankunft)}`;
  if (spart) grund += `; spart etwa ${kgText(spart)} CO₂ gegenüber dem Auto`;
  if (best.verkehrsmittel === 'auto') { const eco = pool.filter((o) => o.verkehrsmittel !== 'auto').sort((a, b) => a.ankunft - b.ankunft)[0]; if (eco) grund += `; ${NAME[eco.verkehrsmittel]} wärst du ${Math.round((eco.ankunft - best.ankunft) / 60000)} min länger unterwegs`; }
  if (best.verkehrsmittel === 'oepnv' && best.stufenlos) grund += `; stufenlos: ${best.stufenlos}`;
  if (best.verkehrsmittel === 'auto' && best.verzoegerung_min >= 5) grund += `; trotz ${best.verzoegerung_min} min Stau`;
  if (typ && opt.some((o) => !o.geeignet)) grund += `; nicht empfohlen für dein Profil: ${opt.filter((o) => !o.geeignet).map((o) => NAME[o.verkehrsmittel]).join(', ')}`;
  return { jetzt: uhr(now), profil: typ || 'kein Profil', vorrang: vorrang === 'schnell' ? 'schnell ankommen' : 'umweltfreundlich, wenn kaum langsamer',
    optionen: opt.map((o) => Object.assign({}, o, { ankunft: uhr(o.ankunft), co2: o.co2_g ? 'etwa ' + kgText(o.co2_g) : 'kein CO₂' })), empfehlung: { verkehrsmittel: best.verkehrsmittel, grund, co2_gespart_g: spart || undefined },
    co2_quelle: 'grobe Schätzung nach Durchschnittswerten des Umweltbundesamts je Personenkilometer',
    hinweis: 'Nenne Dauer und Umstiege der empfohlenen Möglichkeit (empfehlung), nicht die eines nicht empfohlenen Fußwegs. „stufenlos“ nur, wenn das Feld stufenlos mit „ja“ beginnt.' };
}
// Ampeln in der Nähe eines Orts, mit Tonsignal ja/nein und den Straßen der Kreuzung
async function ampelnNahe(pos) {
  const keys = [...new Set([[0, 0], [0.004, 0], [-0.004, 0], [0, 0.006], [0, -0.006]].map(([a, b]) => fussKeyS(pos[0] + a, pos[1] + b)))];
  const tiles = (await Promise.all(keys.map((k) => fussTileS(k, 4000)))).filter(Boolean);
  if (!tiles.length) return { fehler: 'Die Kartendaten für diese Gegend werden gerade geladen. Bitte gleich noch einmal fragen.' };
  const seen = new Set(), list = [];
  for (const t of tiles) for (const nd of t.nodes || []) {
    if (nd[2] !== 'a') continue;
    const d = mAbs(pos, nd), key = nd[0] + ',' + nd[1];
    if (d > 400 || seen.has(key)) continue;
    seen.add(key);
    const names = [];
    for (const w of t.ways || []) if (w.n && !names.includes(w.n) && w.g.some((q, i) => i < w.g.length - 1 && segDist(nd, w.g[i], w.g[i + 1]) <= 15)) names.push(w.n);
    list.push({ bei: names.slice(0, 2).join(' / ') || 'ohne Straßennamen', entfernung_m: Math.round(d / 10) * 10, tonsignal: tonAt(nd[0], nd[1], nd[3]) });
  }
  list.sort((a, b) => a.entfernung_m - b.entfernung_m);
  return { ampeln: list.slice(0, 6), quelle: 'OpenStreetMap und Rückmeldungen in Flowtown' };
}
// ---------- Am Ziel: was dort zählt (nicht am Standort): Gebäude laut Bethel, WC, Behindertenparkplatz, Haltestelle, Meldungen ----------
const ZIEL_THEMA = { rollstuhl: ['zugang', 'aufzug', 'wc'], rollator: ['zugang', 'aufzug', 'wc'], sehen: ['sehen', 'zugang'], hoeren: ['hoeren'], lernen: ['einfach'], ruhe: ['service', 'wc'] };
const ausserhalb = (pos) => !!pos && !inBox(pos[0], pos[1], 0.05);
const AUSSEN_HINWEIS = 'Der Ort liegt außerhalb von Bielefeld. Dazu hat Flowtown keine Angaben zu Barrierefreiheit, Toiletten, Behindertenparkplätzen, Haltestellen, Fahrplan und Ampeln mit Tonsignal. Sag das offen; behaupte nicht, dass es dort nichts gibt.';
const AUSSEN_HINWEIS_OSM = 'Der Ort liegt außerhalb von Bielefeld. Hier hat Flowtown keine Daten der Stadt und keine Angaben zur Barrierefreiheit von Gebäuden. Toiletten, Behindertenparkplätze und Ampeln mit Tonsignal stammen aus OpenStreetMap und sind nur so vollständig, wie Mitwirkende sie eingetragen haben. Sag das offen; fehlt etwas, heißt das nicht, dass es nichts gibt.';
// Orte außerhalb von Bielefeld: Toiletten, Behindertenparkplätze und Ampeln mit Tonsignal aus OpenStreetMap, in festen Rechtecken
// von 0,01° (etwa 1,1 × 0,7 km, mit Rand), so erfährt Overpass nie das genaue Ziel; die Auswahl nach Entfernung passiert auf dem Server.
const aussenCells = new Map(), aussenFlight = new Map();
const AUSSEN_CELL = 0.01;
// läuft im Hintergrund weiter, auch wenn der Aufrufer nicht so lange wartet; die nächste Frage findet das Ergebnis im Speicher
function aussenCell(a, b) {
  const k = a + '_' + b, c = aussenCells.get(k);
  if (c && Date.now() - c.t < 3 * 864e5) return Promise.resolve(c.list);
  if (aussenFlight.has(k)) return aussenFlight.get(k);
  const p = aussenLoad(a, b, k).finally(() => aussenFlight.delete(k));
  p.catch(() => {});
  aussenFlight.set(k, p);
  return p;
}
async function aussenLoad(a, b, k) {
  const bb = `${(a * AUSSEN_CELL - 0.005).toFixed(5)},${(b * AUSSEN_CELL - 0.007).toFixed(5)},${((a + 1) * AUSSEN_CELL + 0.005).toFixed(5)},${((b + 1) * AUSSEN_CELL + 0.007).toFixed(5)}`;
  const q = `[out:json][timeout:25];(node["amenity"="toilets"](${bb});way["amenity"="toilets"](${bb});node["parking_space"="disabled"](${bb});way["parking_space"="disabled"](${bb});node["amenity"="parking"]["capacity:disabled"](${bb});way["amenity"="parking"]["capacity:disabled"](${bb});node["highway"="traffic_signals"]["traffic_signals:sound"](${bb}););out center tags;`;
  const j = await overpass(q, 25000);
  const list = [];
  for (const e of j.elements || []) {
    const t = e.tags || {}, lat = isFinite(e.lat) ? e.lat : e.center && e.center.lat, lon = isFinite(e.lon) ? e.lon : e.center && e.center.lon;
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const pos = [r5(lat), r5(lon)];
    if (t.amenity === 'toilets') {
      if (/^(private|no)$/.test(t.access || '')) continue;
      list.push({ k: 'wc', pos, name: t.name || undefined, rollstuhlgerecht: t.wheelchair === 'yes' ? 'ja' : t.wheelchair === 'limited' ? 'eingeschränkt' : t.wheelchair === 'no' ? 'nein' : 'keine Angabe', kosten: t.fee === 'yes' ? 'ja' : t.fee === 'no' ? 'nein' : undefined, oeffnungszeiten: t.opening_hours || undefined });
    } else if (t.highway === 'traffic_signals') {
      if (t['traffic_signals:sound'] === 'yes') list.push({ k: 'ton', pos });
    } else {
      const n = parseInt(t['capacity:disabled'], 10);
      list.push({ k: 'bpp', pos, name: t.name || 'Behindertenparkplatz', plaetze: n > 0 ? n : undefined });
    }
  }
  aussenCells.set(k, { t: Date.now(), list });
  if (aussenCells.size > 300) aussenCells.delete(aussenCells.keys().next().value);
  return list;
}
async function osmAussen(pos, typ, ms) {
  if (!pos || !isFinite(pos[0]) || !ausserhalb(pos)) return null;
  let all;
  try { all = await Promise.race([aussenCell(Math.floor(pos[0] / AUSSEN_CELL), Math.floor(pos[1] / AUSSEN_CELL)), new Promise((resolve) => setTimeout(() => resolve(null), ms || 7000))]); } catch (e) { return null; }
  if (!all) return null;
  const near = (list, max) => list.map((x) => Object.assign({ entfernung_m: mAbs(pos, x.pos) }, x)).filter((x) => x.entfernung_m <= max).sort((a, b) => a.entfernung_m - b.entfernung_m)[0];
  const strip = (x) => { if (!x) return undefined; const o = Object.assign({}, x); delete o.pos; delete o.k; o.entfernung_m = Math.round(o.entfernung_m / 10) * 10; o.quelle = 'OpenStreetMap'; return o; };
  const wcs = all.filter((x) => x.k === 'wc'), out = {};
  const mob = ['rollstuhl', 'rollator'].includes(typ);
  out.rollstuhl_wc = strip(near(wcs.filter((w) => w.rollstuhlgerecht === 'ja'), 450)) || 'keines bis 450 m in OpenStreetMap eingetragen';
  if (!mob) out.toilette = strip(near(wcs, 350)) || 'keine bis 350 m in OpenStreetMap eingetragen';
  if (!typ || mob) out.behindertenparkplatz = strip(near(all.filter((x) => x.k === 'bpp'), 400)) || 'keiner bis 400 m in OpenStreetMap eingetragen';
  const ton = all.filter((x) => x.k === 'ton' && mAbs(pos, x.pos) <= 300);
  if (ton.length) out.ampeln_mit_tonsignal = { anzahl_bis_300_m: ton.length, quelle: 'OpenStreetMap' };
  return out;
}
// Welche Angaben zum Gebäude für ein Profil fehlen? Die KI nennt sie offen („Dazu habe ich keine Angabe.“).
const LUECKEN = {
  rollstuhl: [['Türbreite', (t) => /breit/i.test(t) && /\d/.test(t)], ['Größe des Aufzugs', (t) => /aufzug|lift/i.test(t) && /\d/.test(t)], ['stufenloser Eingang', (t) => /stufenlos|rampe|eingang/i.test(t)], ['rollstuhlgerechtes WC', (t) => /wc|toilett/i.test(t)]],
  rollator: [['Türbreite', (t) => /breit/i.test(t) && /\d/.test(t)], ['stufenloser Eingang', (t) => /stufenlos|rampe|eingang/i.test(t)], ['Sitzgelegenheiten', (t) => /sitz|bank|stuhl/i.test(t)], ['WC', (t) => /wc|toilett/i.test(t)]],
  sehen: [['Leitsystem für blinde Menschen', (t) => /leit|taktil|boden/i.test(t)], ['Hilfen für sehbehinderte Menschen', (t) => /sehbehind|blind|kontrast|braille/i.test(t)]],
  hoeren: [['Induktionsschleife', (t) => /induktion|hörschleife|schleife/i.test(t)], ['Gebärdensprache', (t) => /gebärde|dolmetsch/i.test(t)]],
  lernen: [['Angebote in einfacher Sprache', (t) => /einfach|leicht/i.test(t)]],
  ruhe: [['ruhige Bereiche', (t) => /ruhe|rückzug|pause/i.test(t)], ['Sitzgelegenheiten', (t) => /sitz|bank|stuhl/i.test(t)]]
};
function lueckenFuer(typ, angaben) {
  const themen = LUECKEN[typ];
  if (!themen) return [];
  const txt = (angaben || []).map((x) => [x.frage, x.antwort, x.hinweis, x.merkmal].filter(Boolean).join(' ')).join(' | ');
  return themen.filter(([, ok]) => !ok(txt)).map(([n]) => n);
}
// ---------- C1: Plan B: eine Alternative aus den Daten, nie erfunden ----------
function planB(art, d) {
  const out = [], typ = d.typ || '', mob = ['rollstuhl', 'rollator'].includes(typ), am = d.am || {};
  const stadtbahn = am.stadtbahn && typeof am.stadtbahn === 'object' ? am.stadtbahn : null;
  const stufen = d.ck && (d.ck.stellen || []).some((x) => x.c === 'stufen');
  if (art === 'weg' && (stufen || (d.ck && d.ck.hohe_bordsteine && mob))) {
    if (mob && stadtbahn && stadtbahn.hochbahnsteig === 'ja') out.push(`Mit der Stadtbahn bis ${stadtbahn.name}, die Haltestelle hat einen Hochbahnsteig und liegt etwa ${stadtbahn.entfernung_m} m vom Ziel.`);
    else if (mob) out.push('Mit Bus oder Bahn bis zur Haltestelle am Ziel; ob sie stufenlos ist, sagt das Werkzeug haltestelle.');
    out.push('In der App unter „Wohin?“ beim Ziel zeigt Flowtown einen Weg mit weniger Stufen, wenn es ihn gibt.');
  }
  if (art === 'weg' && d.r && (d.r.items || []).some((it) => it.art === 'sperrung')) out.push('Auf der Strecke liegt eine Sperrung: In der Navigation die Strecke neu berechnen lassen.');
  const au = am.bahnhof_aufzuege && am.bahnhof_aufzuege.ausser_betrieb;
  if (au && au.length) {
    const b = am.bahnhof_aufzuege;
    out.push(`Am Bahnhof ${b.bahnhof} ${b.aufzuege > au.length ? 'gibt es weitere Aufzüge in Betrieb (nach Beschilderung suchen)' : 'sind die Aufzüge außer Betrieb'}; Servicepersonal der Bahn am Bahnhof ansprechen oder vorab den Mobilitätsservice der Bahn bitten (Werkzeug hilfe_menschen).`);
    if (mob) out.push('Alternativ an einer Haltestelle mit Hochbahnsteig oder an einem anderen Bahnhof aussteigen.');
  }
  if (art === 'vergleich' && d.v && (d.v.optionen || []).some((o) => o.verkehrsmittel === 'fuss' && o.geeignet === false) && mob && stadtbahn && stadtbahn.hochbahnsteig === 'ja') out.push(`Zu Fuß geht es nicht stufenlos; die Stadtbahn bis ${stadtbahn.name} (Hochbahnsteig) ist die Alternative.`);
  if (art === 'stoerung' && d.items && d.items.length) out.push('Bei Umleitungen: Ersatzverkehr oder eine Nachbarhaltestelle nutzen, die Abfahrten dort zeigt das Werkzeug abfahrten_in_der_naehe.');
  return out.length ? out : undefined;
}
function zielInfo(pos, name, typ, aussen) {
  const dbAm = dbaAt(pos, 600);
  if (ausserhalb(pos)) return Object.assign({ hinweis: aussen ? AUSSEN_HINWEIS_OSM : AUSSEN_HINWEIS + (dbAm ? ' Nur die Aufzüge und Rolltreppen am Bahnhof (bahnhof_aufzuege) sind bekannt.' : '') }, dbAm ? { bahnhof_aufzuege: dbAm } : {}, aussen || {});
  const near = (list, max) => list.map((x) => Object.assign(x, { entfernung_m: mAbs(pos, x.pos) })).filter((x) => x.entfernung_m <= max).sort((a, b) => a.entfernung_m - b.entfernung_m)[0];
  const strip = (x) => { if (!x) return undefined; const o = Object.assign({}, x); delete o.pos; o.entfernung_m = Math.round(o.entfernung_m / 10) * 10; return o; };
  const out = {};
  if (dbAm) out.bahnhof_aufzuege = dbAm;
  // Gebäude: nur wenn der Name eindeutig zu einem Ort von „Bielefeld barrierefrei erleben“ passt
  if (name && bf && (bf.orte || []).length) {
    const themen = ZIEL_THEMA[typ] || ['zugang', 'wc'];
    const first = bfOrtDetails(name, themen[0]);
    if (first && first.name && !first.mehrdeutig) {
      const ang = [].concat(...themen.map((t, i) => ((i ? bfOrtDetails(name, t) : first).angaben || []))).slice(0, 14);
      const lu = lueckenFuer(typ, ang);
      out.gebaeude = { name: first.name, adresse: first.adresse, angaben_fehlen: lu.length ? lu : undefined, angaben: ang, hinweise: first.hinweise, stand: first.stand_der_erhebung, quelle: 'Bielefeld barrierefrei erleben' };
    } else if (first && first.mehrdeutig) out.gebaeude_auswahl = first.kandidaten;
  }
  if (!out.gebaeude && bf && (bf.orte || []).length) {
    const seen = new Set();
    const nah = bf.orte.filter((x) => !seen.has(x.id) && seen.add(x.id)).map((x) => ({ name: x.n, entfernung_m: mAbs(pos, [x.lat, x.lon]), stufenlos: x.f && x.f.stufenlos === 1 ? 'ja' : x.f && x.f.stufenlos === 0 ? 'nein' : 'keine Angabe', behinderten_wc: x.f && x.f.wc === 1 ? 'ja' : x.f && x.f.wc === 0 ? 'nein' : 'keine Angabe' }))
      .filter((x) => x.entfernung_m <= 600).sort((a, b) => a.entfernung_m - b.entfernung_m).slice(0, 4).map((x) => Object.assign(x, { entfernung_m: Math.round(x.entfernung_m / 10) * 10 }));
    if (nah.length) out.barrierefreie_orte_nah = nah;
  }
  if (!out.gebaeude && typ) out.angaben_fehlen = lueckenFuer(typ, []);
  if (!bf || !(bf.orte || []).length) out.hinweis_daten = 'Die Daten von Bielefeld barrierefrei erleben sind auf dem Server gerade nicht geladen.';
  const wc = wcAll().map(wcInfo)
    .concat((bf && bf.orte || []).filter((x) => x.f && x.f.wc === 1).map((x) => ({ name: 'WC im Gebäude ' + x.n, rollstuhlgerecht: 'ja', quelle: 'Bielefeld barrierefrei erleben', pos: [x.lat, x.lon] })));
  out.rollstuhl_wc = strip(near(wc.filter((w) => w.rollstuhlgerecht === 'ja'), 800)) || 'keines bis 800 m bekannt';
  if (!['rollstuhl', 'rollator'].includes(typ)) out.toilette = strip(near(wc, 600)) || 'keine bis 600 m bekannt';
  if (!typ || ['rollstuhl', 'rollator'].includes(typ)) out.behindertenparkplatz = strip(near((bpp && bpp.plaetze || []).map((q) => ({ name: q[3] || 'Behindertenparkplatz', plaetze: q[2] || undefined, pos: [q[0], q[1]] })), 500)) || 'keiner bis 500 m bekannt';
  const stops = tramStops();
  if (stops) {
    const list = [];
    for (const [k, st] of stops) { const e = hst && hst.liste.find((x) => x.k === k); list.push({ name: st.name, hochbahnsteig: e ? e.hbs : 'keine Angabe', pos: st.pos.slice().sort((a, b) => mAbs(pos, a) - mAbs(pos, b))[0] }); }
    out.stadtbahn = strip(near(list, 1000)) || 'keine Haltestelle bis 1 km';
  }
  const g = hinweise.filter((h) => h.bis > Date.now() && h.weg < 2 && h.art !== 'gut' && mAbs(pos, [h.lat, h.lon]) <= 150).slice(0, 4).map((h) => ({ art: HINWEIS_NAME[h.art] || h.art, entfernung_m: Math.round(mAbs(pos, [h.lat, h.lon]) / 10) * 10 }));
  if (g.length) out.gemeldet = g;
  return out;
}
const HILFE = {
  orientierung: { moeglichkeiten: ['Passanten ansprechen: Menschen helfen meist gern, Straße oder Eingang nennen zu lassen.', 'Videohilfe: Die kostenlose App Be My Eyes verbindet mit Freiwilligen, die per Kamera helfen (auch auf Deutsch).', 'Wenn Sprechen nicht geht: die Notruf-App nora.'], hinweis: 'Be My Eyes ist ein eigenes Angebot, Flowtown ist damit nicht verbunden.' },
  bahnhof: { moeglichkeiten: ['Servicepersonal am Bahnhof ansprechen (Informationsstand oder DB-Personal am Gleis).', 'Hilfe beim Ein-, Um- und Aussteigen (Rampe, Hublift): der Mobilitätsservice der Bahn; vorab anmelden, die Kontaktdaten stehen auf bahn.de unter „Mobilitätsservice“.', 'Bei defektem Aufzug nach einem anderen Aufzug oder einer Begleitung fragen.'], hinweis: 'Keine Telefonnummer nennen; auf bahn.de verweisen.' },
  nahverkehr: { moeglichkeiten: ['Fahrerin oder Fahrer ansprechen: Sie helfen bei der Rampe und warten kurz.', 'Kundenservice von moBiel: Kontakt auf mobiel.de.', 'Bei Störungen: Ersatzverkehr und Aushänge an der Haltestelle.'], hinweis: 'Keine Telefonnummer nennen; auf mobiel.de verweisen.' },
  gefahr: { moeglichkeiten: ['Sofort den Notruf 112 wählen; das rote Plus oben in Flowtown öffnet die Notrufnummern.', 'Wenn Sprechen nicht geht: die Notruf-App nora.'], hinweis: 'Keine medizinischen Ratschläge.' }
};
// letzte Abfahrten heute an Haltestellen bis max m, mit Uhrzeit
function letzteAbfahrten(pos, max) {
  const fs0 = fpStadtAt(pos), d = fs0 ? fpData(fs0.id) : null;
  if (!d) return null;
  const by = new Map();
  for (const st of d.stops) { const nm = fpName(st[1], d), dd = mAbs(pos, [st[2], st[3]]); if (dd <= max && (!by.has(nm) || dd < by.get(nm))) by.set(nm, dd); }
  const near = [...by.entries()].sort((x, y) => x[1] - y[1]).slice(0, 3);
  const out = [];
  for (const [nm, dd] of near) {
    const ab = serverDepartures(nm, null, d, 1440, 5000).filter((x) => !x.faellt_aus);
    if (!ab.length) continue;
    const byLine = new Map();
    for (const x of ab) byLine.set(`${x.art} ${x.linie} ${x.richtung}`, x);   // je Linie und Richtung die letzte
    const last = [...byLine.values()].sort((a, b) => b.in_min - a.in_min).slice(0, 4);
    out.push({ haltestelle: nm, entfernung_m: Math.round(dd / 10) * 10, hochbahnsteig: fs0.id === 'bielefeld' ? hbsOf(nm) : undefined, letzte_abfahrten: last.map((x) => ({ uhr: x.uhr, linie: x.linie, richtung: x.richtung, art: x.art })) });
  }
  return out.length ? out : null;
}
async function assistTool(name, a, ctx, act) {
  a = a || {};
  if (name === 'hilfe_menschen') return HILFE[a.art] || HILFE.orientierung;
  if (name === 'rueckweg') {
    const von = await assistOrt(a.ziel, ctx);
    if (!von) return { fehler: 'Der Ort, von dem es zurückgeht, ist unbekannt' };
    const nach = a.zurueck_nach ? await assistOrt(a.zurueck_nach, ctx) : (ctx.pos ? { name: 'Standort', pos: ctx.pos } : null);
    const out = { von: von.name, nach: nach ? nach.name : 'unbekannt', hinweis: 'Fahrplan, ohne Verspätungen und Ausfälle von später; 15 Minuten Reserve einplanen und vor Ort prüfen.' };
    out.letzte_abfahrten_heute = letzteAbfahrten(von.pos, 500) || 'keine Haltestelle mit Fahrplan bis 500 m bekannt';
    const am = zielInfo(von.pos, von.name, ctx.typ, await osmAussen(von.pos, ctx.typ));
    if (am.bahnhof_aufzuege) out.bahnhof_aufzuege = am.bahnhof_aufzuege;
    out.plan_b = planB('ort', { typ: ctx.typ, am });
    if (nach && HERE_KEY) {
      try { const v = await vergleichZiel(von.pos.map((x) => Math.round(x * 100000) / 100000), nach.pos.map((x) => Math.round(x * 10000) / 10000), ctx.typ, ctx.vorrang, false); out.jetzt_zurueck = { empfehlung: v.empfehlung, optionen: v.optionen.map((o) => ({ verkehrsmittel: o.verkehrsmittel, dauer_min: o.dauer_min, ankunft: o.ankunft, geeignet: o.geeignet, hindernisse: o.hindernisse })) }; } catch (e) { out.jetzt_zurueck = 'gerade nicht berechenbar'; }
    }
    return out;
  }
  // Daten, die es nur für Bielefeld gibt
  if (['abfahrten_in_der_naehe', 'ampeln_mit_ton', 'verkehrslage', 'hinweise', 'orte_in_der_naehe'].includes(name)) {
    const o = a.ort ? await assistOrt(a.ort, ctx) : ctx.pos ? { name: 'Standort', pos: ctx.pos } : null;
    if (o && ausserhalb(o.pos) && !(name === 'abfahrten_in_der_naehe' && fpStadtAt(o.pos))) return { bei: o.name, hinweis: AUSSEN_HINWEIS + (name === 'verkehrslage' ? ' Staus und Sperrungen auf einer Strecke prüft das Werkzeug weg.' : '') };
  }
  if (name === 'ort_barrierefreiheit') {
    const r = bfOrtDetails(a.name, a.thema);
    if (r && r.angaben && ctx.typ) return Object.assign({ name: r.name, angaben_fehlen: lueckenFuer(ctx.typ, r.angaben) }, r);
    return r;
  }
  if (name === 'vergleich' || name === 'weg_check') {
    if (!HERE_KEY) return { fehler: 'Dafür braucht der Server den HERE-Schlüssel' };
    const to = await assistOrt(a.ziel, ctx), from = a.start ? await assistOrt(a.start, ctx) : (ctx.pos ? { name: 'Standort', pos: ctx.pos } : null);
    if (!to) return { fehler: 'Ziel nicht gefunden' };
    if (!from) return { fehler: 'Kein Standort; bitte einen Startort nennen' };
    const f = from.pos.map((x) => Math.round(x * 100000) / 100000), t = to.pos.map((x) => Math.round(x * 10000) / 10000);
    if (name === 'vergleich') {
      const pOsm = osmAussen(to.pos, ctx.typ, 5000), pEg = zuerst(eingangNahe(to.pos, ctx.typ), 5000);   // gleichzeitig mit dem Vergleich, nicht danach
      const v = await vergleichZiel(f, t, ctx.typ, ctx.vorrang, ctx.zuFuss);
      act.ziel = { name: to.name, lat: t[0], lon: t[1], mode: v.empfehlung.verkehrsmittel };
      const am = zielInfo(to.pos, to.name, ctx.typ, await pOsm), eg = await pEg;
      return Object.assign({ ziel: to.name, plan_b: planB('vergleich', { v, typ: ctx.typ, am }), eingang: eg ? { art: eg.art, stufenlos: eg.stufenlos, automatiktuer: eg.automatiktuer } : undefined }, v, { am_ziel: am });
    }
    const pOsm = osmAussen(to.pos, ctx.typ, 5000);
    const eg = await zuerst(eingangNahe(to.pos, ctx.typ), 5000);
    const r = await checkZiel(f, eg ? eg.pos.map((x) => Math.round(x * 1e4) / 1e4) : t, 'fuss', true);
    const ck = await wegCheck(r.pts, 6000);
    act.ziel = { name: to.name, lat: t[0], lon: t[1], mode: 'fuss' };
    const amZ = zielInfo(to.pos, to.name, ctx.typ, await pOsm);
    return { ziel: to.name, dauer_min: Math.round(r.dauer / 60), km: r.km, profil: ctx.typ || 'kein Profil', wichtig_fuer_profil: wichtigFuer(ctx.typ, ck) || undefined,
      plan_b: planB('weg', { ck, r, typ: ctx.typ, am: amZ }),
      eingang: eg ? { art: eg.art, stufenlos: eg.stufenlos, automatiktuer: eg.automatiktuer, stufen: eg.stufen, hinweis: 'Der Weg endet an diesem Eingang, nicht in der Gebäudemitte.' } : undefined,
      check: ck, baustellen: (r.items || []).slice(0, 3).map((it) => ({ titel: it.titel, hinweis: it.text || '' })), gemeldet: hinweiseAm(r.pts, 25),
      am_ziel: amZ, hinweis: 'Einen Weg mit weniger Hindernissen zeigt die App unter Wohin? beim Ziel (zu Fuß, mit Profil).' };
  }
  if (name === 'oepnv_stoerungen') {
    const mb = await readMobiel().catch(() => ({ items: [] }));
    const lin = String(a.linie || '').replace(/\D/g, '');
    const items = (mb.items || []).filter((it) => !it.vorbei && (!lin || (it.linien || []).map(String).includes(lin))).slice(0, 5)
      .map((it) => ({ titel: it.titel, linien: it.linien, von: it.von || undefined, bis: it.bis || (it.offen ? 'bis auf Weiteres' : undefined), text: it.text }));
    const stops = tramStops();
    const aufzug = hinweise.filter((h) => h.art === 'aufzug' && h.bis > Date.now() && h.weg < 2).slice(0, 5).map((h) => {
      let near = null;
      if (stops) for (const [, st] of stops) { const d = Math.min(...st.pos.map((q) => mAbs([h.lat, h.lon], q))); if (!near || d < near.d) near = { n: st.name, d }; }
      return { gemeldet: 'Aufzug defekt', bei: near && near.d <= 300 ? 'Haltestelle ' + near.n : 'ohne Haltestelle in der Nähe', bestaetigt: h.ok || 0 };
    });
    const alle = (mb.items || []).filter((it) => !it.vorbei);
    const linien = [...new Set(alle.flatMap((it) => (it.linien || []).map(String)))];
    const bahn = alle.some((it) => it.bahn) || linien.some((l) => /^[1-4]$/.test(l));
    const dbAus = dba ? dba.anlagen.filter((x) => inBox(x[5], x[6], 0.05) && /^(notAvailable|partiallyAvailable)$/.test(dbaState(x[0]) || '')).map((x) => `${x[2]}: ${x[1] === 'aufzug' ? 'Aufzug' : 'Rolltreppe'} ${x[4]} ${DBA_TEXT[dbaState(x[0])]}`) : null;
    const planb = planB('stoerung', { items: lin ? items : [], typ: ctx.typ });
    return { plan_b: planb, stadtbahn_aufzuege: 'Für Aufzüge an Stadtbahn-Haltestellen gibt es keinen Live-Status von moBiel; nur gemeldete Ausfälle aus Flowtown (aufzuege_gemeldet). Nie „alle in Betrieb“ sagen. Am Hauptbahnhof kommt der Status der DB-Aufzüge dazu (db_aufzuege_ausser_betrieb).', db_hinweis: 'db_aufzuege_ausser_betrieb gilt nur für Aufzüge der DB an Bahnhöfen, nicht für die Stadtbahn.', anzahl_meldungen: alle.length, betroffene_linien_anzahl: linien.length, db_aufzuege_ausser_betrieb: dbAus ? (dbAus.length ? dbAus.slice(0, 5) : 'alle in Betrieb') : undefined, beispiele_linien: linien.slice(0, 3), stadtbahn_betroffen: bahn ? 'ja' : 'nein, keine Meldung zur Stadtbahn',
      meldungen: lin ? items : items.slice(0, 3), aufzuege_gemeldet: aufzug.length ? aufzug : 'keine Meldung in Flowtown; das heißt nicht, dass alle Aufzüge funktionieren', quelle: 'moBiel (Umleitungen) und Meldungen in Flowtown', stand: mb.t ? uhr(mb.t) : 'unbekannt',
      hinweis: lin ? undefined : 'Nicht alle Linien vorlesen: Zahl nennen, höchstens drei Beispiele, sagen ob die Stadtbahn betroffen ist, nach der eigenen Linie fragen.' };
  }
  if (name === 'abfahrten_in_der_naehe') {
    const o = await assistOrt(a.ort, ctx);
    if (!o) return { fehler: 'Kein Standort; frag, an welcher Haltestelle die Person ist' };
    const fs0 = fpStadtAt(o.pos), d = fs0 ? fpData(fs0.id) : fpData();
    if (!d) return { fehler: 'Fahrplan nicht geladen' };
    let kind = a.nur === 'stadtbahn' ? 0 : a.nur === 'zug' ? 2 : a.nur === 'bus' ? 3 : null, artHinweis;
    // ohne Stadtbahn in der Stadt (etwa Mönchengladbach) heißt „Bahn“ Zug oder S-Bahn
    if (kind === 0 && !d.routes.some((r) => r[1] === 0)) { kind = 2; artHinweis = `In ${d.stadtName || 'dieser Stadt'} gibt es keine Stadtbahn; Bahn heißt hier Zug oder S-Bahn.`; }
    const by = new Map();
    for (const st of d.stops) { const nm = fpName(st[1], d), dd = mAbs(o.pos, [st[2], st[3]]); if (dd <= 700 && (!by.has(nm) || dd < by.get(nm))) by.set(nm, dd); }
    const near = [...by.entries()].sort((x, y) => x[1] - y[1]).slice(0, 4);
    const suche = (k) => { const res = []; for (const [nm, dd] of near) { const ab = serverDepartures(nm, k, d).slice(0, 3); if (ab.length) res.push({ haltestelle: nm, entfernung_m: Math.round(dd / 10) * 10, hochbahnsteig: fs0 && fs0.id !== 'bielefeld' ? undefined : hbsOf(nm), abfahrten: ab }); if (res.length >= 2) break; } return res; };
    let out = suche(kind);
    // nichts mit dieser Art in der Nähe: alle Abfahrten nennen und das sagen
    if (!out.length && kind != null) { out = suche(null); if (out.length) artHinweis = (artHinweis ? artHinweis + ' ' : '') + 'Mit dieser Art fährt in der nächsten Stunde nichts in der Nähe; das hier sind die anderen Abfahrten.'; }
    return out.length ? { bei: o.name, haltestellen: out, hinweis: artHinweis } : { bei: o.name, hinweis: (artHinweis ? artHinweis + ' ' : '') + 'In der nächsten Stunde keine Abfahrten an Haltestellen bis 700 m' };
  }
  if (name === 'ort_info') {
    const o = await assistOrt(a.ort, ctx);
    if (!o) return { fehler: 'Diesen Ort habe ich nicht gefunden. Bitte genauer nennen, zum Beispiel mit Straße.' };
    // mehrdeutig: keine Entfernungen von einem geratenen Punkt, sondern nachfragen
    if (o.auswahl) return { gesucht: a.ort, mehrdeutig: true, auswahl: o.auswahl, hinweis: 'Mehrere Orte passen. Frag, welcher gemeint ist, und nenne zwei oder drei davon.' };
    const [osm, eg] = await Promise.all([osmAussen(o.pos, ctx.typ, 5000), zuerst(eingangNahe(o.pos, ctx.typ), 5000)]);
    const am = zielInfo(o.pos, /^Haltestelle /.test(o.name) ? a.ort : o.name, ctx.typ, osm);
    return Object.assign({ ort: o.name, adresse: o.adresse, gefunden_ueber: o.gefunden_ueber, profil: ctx.typ || 'kein Profil', plan_b: planB('ort', { typ: ctx.typ, am }),
      eingang: eg ? { art: eg.art, stufenlos: eg.stufenlos, automatiktuer: eg.automatiktuer, stufen: eg.stufen, quelle: 'OpenStreetMap' } : undefined,
      angaben_fehlen: (am.gebaeude && am.gebaeude.angaben_fehlen) || am.angaben_fehlen }, am);
  }
  if (name === 'ampeln_mit_ton' && (ctx.used || []).includes('weg_check')) return { hinweis: 'Für die Ampeln auf dem Weg gelten nur die Angaben aus weg_check (check.ampeln). Nenne keine anderen Ampeln.' };
  if (name === 'ampeln_mit_ton') {
    const o = await assistOrt(a.ort, ctx);
    if (!o) return { fehler: 'Ort unbekannt oder kein Standort' };
    return Object.assign({ bei: o.name }, await ampelnNahe(o.pos));
  }
  if (name === 'meine_auswertung') return ctx.auswertung === 'ausgeschaltet' ? { auswertung: 'ausgeschaltet', hinweis: 'Unter Mehr, Server und Dienste: „Frag Flowtown darf meine Auswertung nutzen“' } : ctx.auswertung;
  if (name === 'orte_in_der_naehe') {
    const o = await assistOrt(a.ort, ctx);
    if (!o) return { fehler: 'Ort unbekannt oder kein Standort' };
    const maxM = a.art === 'park_and_ride' ? 20000 : 2000;
    const near = (list) => list.map((x) => Object.assign(x, { entfernung_m: mAbs(o.pos, x.pos) })).filter((x) => x.entfernung_m <= maxM).sort((p, q) => p.entfernung_m - q.entfernung_m).slice(0, 4).map((x) => { delete x.pos; return x; });
    let list = [];
    if (a.art === 'rollstuhl_toilette' || a.art === 'toilette') list = wcAll().filter((w) => a.art === 'toilette' || w[2] === 1).map(wcInfo);
    if (a.art === 'behindertenparkplatz') list = (bpp && bpp.plaetze || []).map((p) => ({ name: p[3] || 'Behindertenparkplatz', plaetze: p[2] || null, quelle: p[4] === 's' ? 'Stadt Bielefeld' : 'OpenStreetMap', pos: [p[0], p[1]] }));
    if (a.art === 'aufzug') list = (bf && bf.lift || []).map((x) => ({ name: 'Aufzug', pos: [x[0], x[1]] })).concat(((fpData() || {}).stationen || []).filter((st) => st[3] > 0).map((st) => ({ name: 'Aufzug an der Station ' + st[0].replace(/^Bielefeld,\s*/, ''), pos: [st[1], st[2]] })));
    if (a.art === 'park_and_ride') list = (stadt2 && stadt2.pr || []).map((p) => ({ name: 'Park + Ride ' + p[3], adresse: p[4], plaetze: p[2], pos: [p[0], p[1]] }));
    if (a.art === 'barrierefreier_ort') list = (bf && bf.orte || []).map((x) => ({ name: x.n, adresse: x.adr, stufenlos: x.f && x.f.stufenlos === 1 ? 'ja' : x.f && x.f.stufenlos === 0 ? 'nein' : 'unbekannt', behinderten_wc: x.f && x.f.wc === 1 ? 'ja' : 'unbekannt', quelle: 'Bielefeld barrierefrei erleben', pos: [x.lat, x.lon] }));
    return { bei: o.name, treffer: near(list) };
  }
  if (name === 'haltestelle') {
    const stops = tramStops(), k0 = hstNorm(a.name), k = k0 === 'hauptbahnhof' ? 'hbf' : k0;   // „Hauptbahnhof“ heißt im Fahrplan „Bielefeld Hbf“
    const fs1 = ctx.pos ? fpStadtAt(ctx.pos) : null;
    const d = fs1 ? fpData(fs1.id) : fpData();
    // Treffer der eigenen Stadt zuerst: sonst findet „Hauptbahnhof“ den Hauptbahnhof von Paderborn im Bielefelder Fahrplan
    const stadtRe = new RegExp('^(' + ((d && d.stadtName) || 'Bielefeld') + '|Bi-)', 'i');
    const finde = (list) => list.find((st) => hstNorm(st[1]) === k) || list.find((st) => hstNorm(st[1]).startsWith(k)) || list.find((st) => hstNorm(st[1]).includes(k));
    const real = d && (finde(d.stops.filter((st) => stadtRe.test(st[1]))) || finde(d.stops));
    if (!real) return { fehler: 'Haltestelle nicht im Fahrplan' };
    const nm = real[1].replace(/^Bielefeld,\s*/, ''), kk = hstNorm(real[1]);
    const e = hst && hst.liste.find((x) => x.k === kk);
    const lift = (d.stationen || []).some((st) => st[3] > 0 && hstNorm(st[0]) === kk);
    const kind = a.nur === 'stadtbahn' ? 0 : a.nur === 'bus' ? 3 : a.nur === 'zug' ? 2 : null;
    return { name: nm, stadtbahn: !!(stops && stops.get(kk)), hochbahnsteig: e ? e.hbs : 'keine Angabe', hinweis: e ? e.hinweis : '', aufzug: lift ? 'ja' : 'keine Angabe', abfahrten: serverDepartures(nm, kind) };
  }
  if (name === 'haltestellen_in_der_naehe') {
    const o = await assistOrt(a.ort, ctx), stops = tramStops();
    if (!o || !stops) return { fehler: 'Ort unbekannt oder kein Fahrplan' };
    const list = [];
    for (const [k, st] of stops) {
      const e = hst && hst.liste.find((x) => x.k === k);
      if (a.nur_stufenlos && !(e && e.hbs === 'ja')) continue;
      list.push({ name: st.name, entfernung_m: Math.min(...st.pos.map((q) => mAbs(o.pos, q))), hochbahnsteig: e ? e.hbs : 'keine Angabe' });
    }
    return { bei: o.name, haltestellen: list.sort((p, q) => p.entfernung_m - q.entfernung_m).slice(0, 4) };
  }
  if (name === 'weg') {
    if (!HERE_KEY) return { fehler: 'Wegprüfung braucht den HERE-Schlüssel auf dem Server' };
    const to = await assistOrt(a.ziel, ctx), from = a.start ? await assistOrt(a.start, ctx) : (ctx.pos ? { name: 'Standort', pos: ctx.pos } : null);
    if (!to) return { fehler: 'Ziel nicht gefunden' };
    if (!from) return { fehler: 'Kein Standort; bitte einen Startort nennen' };
    const mode = ['auto', 'rad', 'fuss', 'oepnv'].includes(a.verkehrsmittel) ? a.verkehrsmittel : 'auto';
    const f = from.pos.map((x) => Math.round(x * 100000) / 100000), t = to.pos.map((x) => Math.round(x * 10000) / 10000);
    act.ziel = { name: to.name, lat: t[0], lon: t[1], mode };
    if (mode === 'oepnv') {
      const v = await checkZielOepnv(f, t);
      return { ziel: to.name, verbindungen: v.verbindungen.slice(0, 3).map((c) => ({ ab: new Date(c.ab).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }), an: new Date(c.an).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }), umstiege: c.umstiege,
        teile: c.teile.filter((x) => x.art !== 'fuss').map((x) => { const e = x.art === 'bahn' && hst && hst.liste; const hb = (n) => { const y = e && e.find((z) => z.k === hstNorm(n)); return y ? y.hbs : 'keine Angabe'; }; return { linie: x.linie, von: x.von, nach: x.nach, richtung: x.ziel, hochbahnsteig_von: x.art === 'bahn' ? hb(x.von) : undefined, hochbahnsteig_nach: x.art === 'bahn' ? hb(x.nach) : undefined }; }) })) };
    }
    const v = await checkZiel(f, t, mode);
    if (mode === 'fuss' && GEH_KMH[ctx.typ]) { const dF = gehDauerS(v.dauer, v.km, ctx.typ); v.tempo = `geschätzt mit ${String(GEH_KMH[ctx.typ]).replace('.', ',')} km/h für dein Profil`; v.dauer = dF; }
    return { ziel: to.name, verkehrsmittel: mode, tempo: v.tempo, dauer_min: Math.round(v.dauer / 60), km: Math.round(v.km * 10) / 10, verzoegerung_min: Math.max(0, Math.round((v.dauer - v.basis) / 60)),
      meldungen: (v.items || []).slice(0, 3).map((it) => ({ art: it.art, titel: it.titel || '', hinweis: it.text || '' })),
      beste_abfahrt: v.abfahrt && v.abfahrt.length > 1 ? v.abfahrt.reduce((b, x) => (x.dauer < b.dauer ? x : b)) : null,
      ausweichroute: v.alternative ? { ueber: v.alternative.strassen, mehr_min: v.alternative.mehr_min, km: v.alternative.km, ohne_stau: v.alternative.ohne } : undefined };
  }
  if (name === 'verkehrslage') {
    const o = await assistOrt(a.ort, ctx);
    if (!o) return { fehler: 'Ort unbekannt oder kein Standort' };
    const l = await readLage();
    const near = l.items.filter((it) => (it.pts || []).some((q) => mAbs(o.pos, q) <= 1000)).slice(0, 5).map((it) => ({ art: it.art, titel: it.titel, abschnitt: it.richtungText || '', hinweis: it.fuss || it.text || '', bis: it.bis || '' }));
    return { bei: o.name, meldungen: near };
  }
  if (name === 'hinweise') {
    const words = String(a.stichwort || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const o = a.ort ? await assistOrt(a.ort, ctx) : null;
    const faq = (faqData && faqData.eintraege || []).map((e) => ({ e, s: words.filter((w) => (e.frage + ' ' + e.antwort).toLowerCase().includes(w)).length + (a.ort && e.orte.some((x) => hstNorm(x).includes(hstNorm(a.ort))) ? 2 : 0) }))
      .filter((x) => x.s > 0).sort((p, q) => q.s - p.s).slice(0, 3).map((x) => ({ frage: x.e.frage, antwort: clip(x.e.antwort, 400) }));
    const pos = o ? o.pos : ctx.pos;
    const gemeldet = pos ? hinweise.filter((h) => h.bis > Date.now() && h.weg < 2 && mAbs(pos, [h.lat, h.lon]) <= 300).slice(0, 3).map((h) => ({ art: h.art, entfernung_m: mAbs(pos, [h.lat, h.lon]), geprueft: !!h.geprueft })) : [];
    return { redaktion: faq, gemeldet };
  }
  return { fehler: 'unbekanntes Werkzeug' };
}
// ---------- Festantworten und Direktantworten: ohne KI, damit sie jedes Mal gleich und sicher sind ----------
// server/festantworten.csv: Frage-Muster (Regex) -> feste Antwort. Die erste passende Zeile mit Status „freigegeben“ gewinnt.
// Die Datei wird bei Änderung nach spätestens einer Minute neu gelesen, ein Neustart ist nicht nötig.
let fest = [], festMtime = 0, festCheck = 0;
const FEST_FILE = process.env.FESTANTWORTEN_CSV || path.join(path.dirname(new URL(import.meta.url).pathname), 'festantworten.csv');
function loadFest() {
  try {
    const rows = parseCsv(fs.readFileSync(FEST_FILE, 'utf8'));
    const head = rows[0].map((h) => h.trim().toLowerCase()), ci = (n) => head.indexOf(n);
    const out = [];
    for (const r of rows.slice(1)) {
      const id = (r[ci('id')] || '').trim(), muster = r[ci('muster')] || '', antwort = clip(r[ci('antwort')] || '', 900);
      if (!id || !muster || !antwort) continue;
      if ((r[ci('status')] || '').trim().toLowerCase() !== 'freigegeben') continue;
      try {
        const aus = (r[ci('ausnahme')] || '').trim();
        out.push({ id, res: new RegExp(muster, 'i'), aus: aus ? new RegExp(aus, 'i') : null, profil: (r[ci('profil')] || '').trim().toLowerCase(), antwort });
      } catch (e) { console.error('Festantwort ' + id + ': ungültiges Muster'); }
    }
    fest = out;
    return out.length;
  } catch (e) { fest = []; return 0; }
}
function festFor(frage, typ) {
  if (Date.now() - festCheck > 60000) {
    festCheck = Date.now();
    try { const m = fs.statSync(FEST_FILE).mtimeMs; if (m !== festMtime) { festMtime = m; loadFest(); } } catch (e) { /* ohne Datei weiter */ }
  }
  const t = String(frage || '').toLowerCase();
  for (const f of fest) {
    if (f.profil && f.profil !== typ) continue;
    if (f.res.test(t) && !(f.aus && f.aus.test(t))) return f;
  }
  return null;
}
// <aufzug>
// Welche Antwort zu einer Frage über einen Aufzug an Stadtbahn oder Bahnhof gehört (rein, ohne Netz, damit prüfbar)
// stopNames: Namen der Stadtbahn-Haltestellen. Ergebnis: null (nicht zuständig), { typ: 'stop', name }, { typ: 'bahnhof' }, { typ: 'unbekannt', ort }, { typ: 'allgemein' }
function aufzugPlan(frage, stopNames) {
  const t = String(frage || '').toLowerCase();
  if (!/aufzug|\blift\b/.test(t)) return null;
  if (/melden|passt|größe|breit|tief|wie komme ich|alternative|plan b|umweg|\bim\b|wann fährt|nächste (bahn|bus)|abfahrt|reparier|\bwelche\b|\bliste\b|\balle\b/.test(t)) return null;
  const stadt = String(frage).match(/\b([A-ZÄÖÜ][a-zäöüß]+)\s+(?:Hauptbahnhof|Hbf)\b/);
  if (stadt && !/^Bielefeld/i.test(stadt[1])) return null;   // „Hamburger Hauptbahnhof“ ist nicht unser Hauptbahnhof
  const norm = (x) => String(x || '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9äöü]/g, '');
  const tn = norm(t);
  if (/hauptbahnhof|\bhbf\b/.test(t)) return { typ: 'bahnhof', name: 'Hauptbahnhof' };
  let best = null;
  for (const n of stopNames || []) { const k = norm(n); if (k.length > 3 && tn.includes(k) && (!best || k.length > norm(best).length)) best = n; }
  if (best) return { typ: 'stop', name: best };
  const m = String(frage).match(/\b(?:am|an der|beim|bei der)\s+([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß\- ]{2,40}?)(?:\s+(?:gerade|in|ist|geht|funktioniert|heute|noch)\b|[?.!,]|$)/i);
  if (m && !/haltestelle|bahnsteig|ziel|moment|ende/i.test(m[1])) return { typ: 'unbekannt', ort: m[1].trim() };
  if (/haltestelle|stadtbahn|bahnsteig|bahnhof|\bbahn\b|ausgefallen|ausfall|außer betrieb|defekt|kaputt|gerade in ordnung|funktioniert|in betrieb|geht der aufzug/.test(t)) return { typ: 'allgemein' };
  return null;
}
// </aufzug>
// <direkt>
// Antworten, die der Server selbst zusammensetzt, aus Daten und ohne KI: Standort mit Adresse, Aufzug an der Stadtbahn
async function direktAntwort(frage, ctx) {
  const t = String(frage).toLowerCase();
  if (ctx.pos && /\bwo bin ich\b|wo stehe ich|wo befinde ich mich|welche straße|wie heißt (die|diese) straße|straßenname|in welcher straße|hausnummer|bei welcher hausnummer/.test(t)) {
    const a = await addrAt(ctx.pos[0], ctx.pos[1]).catch(() => null);
    if (a && a.strasse) {
      const hier = `${a.strasse}${a.nr ? ' ' + a.nr : ''}${a.teil ? ', ' + a.teil : ''}`;
      const gesucht = (t.match(/hausnummer\s*(\d+\s*[a-z]?)/) || [])[1];
      if (gesucht && a.nr) {
        const g = gesucht.replace(/\s/g, '').toLowerCase();
        return g === a.nr.replace(/\s/g, '').toLowerCase() ? `Ja, du stehst bei Hausnummer ${a.nr}, ${a.strasse}.` : `Du stehst bei ${hier}, nicht bei Hausnummer ${gesucht.replace(/\s/g, '')}.`;
      }
      return `Du stehst bei ${hier}.` + (a.m != null && a.m > 30 ? ` Das ist die nächste Adresse, etwa ${a.m} Meter entfernt.` : '');
    }
    return null;
  }
  // Liste der Haltestellen mit Hochbahnsteig (aus der Haltestellen-Tabelle)
  if (/liste.{0,30}(stufenlos|hochbahnsteig|haltestelle)|alle (stufenlosen|barrierefreien) haltestellen/.test(t) && hst && hst.liste && !ctx.aussen) {
    const ja = hst.liste.filter((x) => x.hbs === 'ja').map((x) => x.name);
    if (ja.length) return `Laut meinen Daten haben ${ja.length} Haltestellen einen Hochbahnsteig, zum Beispiel ${ja.slice(0, 5).join(', ')}. Eine vollständige Liste lese ich nicht vor. Frag nach einer bestimmten Haltestelle, dann sage ich dir, ob sie stufenlos ist.`;
  }
  const stops = tramStops();
  if (ctx.aussen || !stops) return null;   // außerhalb von Bielefeld oder ohne geladenen Fahrplan weiß der Server hier nichts Sicheres
  const plan = aufzugPlan(frage, [...stops.values()].map((st) => st.name));
  if (!plan) return null;
  const KEIN = 'Für Aufzüge an Stadtbahn-Haltestellen gibt es keinen Live-Status, bitte vor Ort prüfen.';
  let meld = null, st = null;
  try { st = await assistTool('oepnv_stoerungen', {}, ctx, {}); meld = Array.isArray(st.aufzuege_gemeldet) ? st.aufzuege_gemeldet : []; } catch (e) { /* ohne Meldungen weiter */ }
  const db = st && st.db_aufzuege_ausser_betrieb;
  const dbSatz = ctx.aussen ? '' : Array.isArray(db) && db.length ? ` Laut DB sind außer Betrieb: ${db.slice(0, 2).join('; ')}.` : db === 'alle in Betrieb' ? ' Laut DB sind die Aufzüge an den Bahnhöfen in Betrieb.' : ' Für die Aufzüge der Bahn zeigt die App „DB Bahnhof live“ den Status.';
  const flow = (name) => meld == null ? '' : name ? (meld.some((x) => new RegExp(name, 'i').test(x.bei)) ? ' In Flowtown ist dort ein Ausfall gemeldet.' : ' In Flowtown ist dort kein Ausfall gemeldet.') : meld.length ? (meld.length === 1 ? ' In Flowtown ist 1 Ausfall gemeldet.' : ` In Flowtown sind ${meld.length} Ausfälle gemeldet.`) : ' In Flowtown ist kein Ausfall gemeldet.';
  if (plan.typ === 'stop') {
    let lift = null;
    try { lift = (await assistTool('haltestelle', { name: plan.name }, ctx, {})).aufzug; } catch (e) { /* ohne Angabe */ }
    return `${lift === 'ja' ? `Am ${plan.name} gibt es laut Fahrplan einen Aufzug.` : `Zu einem Aufzug am ${plan.name} habe ich keine Angabe.`} ${KEIN}${flow(plan.name)}`.trim();
  }
  if (plan.typ === 'bahnhof') return `${KEIN}${dbSatz}${flow('Hauptbahnhof')}`.trim();
  if (plan.typ === 'unbekannt') return `Den Ort „${plan.ort}“ finde ich nicht bei den Haltestellen. ${KEIN}`.trim();
  return `${KEIN}${flow(null)}${dbSatz}`.trim();
}
// </direkt>
loadFest();
festMtime = (() => { try { return fs.statSync(FEST_FILE).mtimeMs; } catch (e) { return 0; } })();

// <sauber>
// Mistral liefert den Text manchmal als Liste von Teilen statt als Zeichenkette
function msgText(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === 'string' ? x : x && x.type === 'text' ? x.text : '')).join(' ');
  return '';
}
// Antwort aufräumen: kein Markdown, keine wiederholten Sätze, keine Telefonnummern (außer 110 und 112), höchstens fünf Sätze
function sauber(text) {
  let t = String(text || '').replace(/[*#_`]/g, '').replace(/[+:]{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  const teile = t.split(/(?<=[.!?])\s+/);
  const out = [], seen = new Set();
  for (const sz of teile) {
    const k = sz.toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
    if (!k || seen.has(k)) continue;
    if (/(?:^|[^\d])0\d{2,5}[\s\/-]*\d[\d\s-]{3,}/.test(sz) || /\+49[\d\s-]{6,}/.test(sz)) continue;
    seen.add(k); out.push(sz);
    if (out.length >= 5) break;
  }
  return out.join(' ').slice(0, 600).trim();
}
// </sauber>
async function mistralChat(messages, ohneWerkzeuge, mussWerkzeug) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(MISTRAL_URL, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_KEY}` },
      body: JSON.stringify({ model: MISTRAL_MODEL, temperature: 0.2, max_tokens: 400, tools: ASSIST_TOOLS, tool_choice: ohneWerkzeuge ? 'none' : mussWerkzeug ? 'any' : 'auto', messages }) });
    // lehnt Mistral den Zwang zum Werkzeug ab, einmal ohne ihn
    if (!res.ok && mussWerkzeug && res.status >= 400 && res.status < 500) { clearTimeout(timer); return mistralChat(messages, ohneWerkzeuge, false); }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('Mistral ' + res.status + ': ' + body.slice(0, 300));
      // bei 400 einmal ohne Werkzeuge, damit wenigstens eine Antwort kommt
      if (res.status === 400 && !ohneWerkzeuge) { clearTimeout(timer); return mistralChat(messages, true, false); }
      throw Object.assign(new Error('Mistral antwortet mit ' + res.status), { status: 502 });
    }
    const msg = (await res.json()).choices[0].message;
    msg.content = msgText(msg.content);
    return msg;
  } finally { clearTimeout(timer); }
}
// eigene Auswertung aus der App: nur Zahlen und kurze Texte, nichts wird gespeichert
function assistStatsClean(a) {
  if (!a || typeof a !== 'object') return 'ausgeschaltet';
  const n = (x) => (Number.isFinite(Number(x)) ? Math.round(Number(x) * 10) / 10 : null);
  const by = {};
  if (a.letzte_30_tage && a.letzte_30_tage.nach_verkehrsmittel && typeof a.letzte_30_tage.nach_verkehrsmittel === 'object') for (const [m, v] of Object.entries(a.letzte_30_tage.nach_verkehrsmittel).slice(0, 8)) by[clip(m, 12)] = n(v);
  const w = a.woche || {}, l = a.letzte_30_tage || {}, h = a.haeufigster_weg;
  const nm = (x, len) => { const t = clip(x, len); return /\d+[.,]\d{2,}/.test(t) ? 'Ampel ohne Namen' : t; };   // keine Koordinaten als Namen
  return {
    fahrten_gesamt: n(a.fahrten_gesamt),
    woche: { fahrten: n(w.fahrten), ampeln_mit_halt_prozent: n(w.ampeln_mit_halt_prozent), gewartet_min: n(w.gewartet_min) },
    letzte_30_tage: { fahrten: n(l.fahrten), nach_verkehrsmittel: by, gewartet_min: n(l.gewartet_min) },
    haeufigster_weg: h && typeof h === 'object' ? { name: nm(h.name, 80), fahrten: n(h.fahrten), fahrzeit_min: n(h.fahrzeit_min), ampel_warten_min: n(h.ampel_warten_min) } : null,
    letzte_fahrten: (Array.isArray(a.letzte_fahrten) ? a.letzte_fahrten : []).slice(0, 3).filter((f) => f && typeof f === 'object').map((f) => {
      const o = {};
      for (const k of ['tag', 'start_uhr', 'ende_uhr', 'verkehrsmittel', 'dauer', 'gestanden_gesamt', 'an_ampeln', 'an_haltestellen', 'ohne_ampel_stau', 'umstiege', 'laengster_ampelhalt', 'in_bewegung']) if (f[k] != null) o[k] = nm(f[k], 90);
      o.strecke_km = n(f.strecke_km); o.ampeln_ohne_halt = n(f.ampeln_ohne_halt);
      return o;
    }),
    zeitfresser: (Array.isArray(a.zeitfresser) ? a.zeitfresser : []).slice(0, 3).map((z) => ({ ampel: nm(z && z.ampel, 60), halte: n(z && z.halte), vorbei_ohne_halt: n(z && z.vorbei_ohne_halt), warten_s_schnitt: n(z && z.warten_s_schnitt) })),
    verkehrsmittel_vergleich: (Array.isArray(a.verkehrsmittel_vergleich) ? a.verkehrsmittel_vergleich : []).slice(0, 4).filter((x) => x && typeof x === 'object').map((x) => ({ verkehrsmittel: clip(x.verkehrsmittel, 20), fahrten: n(x.fahrten), schnitt_min: n(x.schnitt_min), gestanden_schnitt_min: n(x.gestanden_schnitt_min), km_schnitt: n(x.km_schnitt) })),
    ampel_bewertungen: (Array.isArray(a.ampel_bewertungen) ? a.ampel_bewertungen : []).slice(0, 6).filter((x) => x && typeof x === 'object').map((x) => ({ ampel: nm(x.ampel, 60), stichwort: clip(x.stichwort, 40), anzahl: n(x.anzahl) })),
    tipps: (Array.isArray(a.tipps) ? a.tipps : []).slice(0, 5).map((t) => clip(t, 200).replace(/(Ampel bei )?-?\d{1,3}[.,]\d{3,},?\s*-?\d{1,3}[.,]\d{3,}/g, 'Ampel ohne Namen'))
  };
}
// ---------- Geprüfte Beispiele: korrigierte Antworten aus der Teststrecke ----------
// Tabelle (Google Tabellen als CSV veröffentlicht: BEISPIELE_CSV_URL, sonst DATA_DIR/beispiele.csv) mit den Spalten
// Frage, Profil, Antwort, Bewertung, Korrigierte Antwort. Zählt eine Zeile mit korrigierter Antwort oder Bewertung „gut“.
// Zu jeder neuen Frage gehen die ähnlichsten drei als Vorbild für Aufbau, Ton und Länge an die KI, nie als Fakten.
const BEISPIELE_URL = process.env.BEISPIELE_CSV_URL || '';
const BEISPIELE_CSV = path.join(DATA_DIR, 'beispiele.csv');
const BSP_STOP = new Set('ich du er sie es wir ihr mir mich dir dich der die das den dem des ein eine einen einem einer und oder aber auch noch schon jetzt hier dort gibt gibts gibt’s ist sind bin war wie was wo wann wer womit welche welcher welches mit ohne bei zu zum zur von vom nach am im in an auf für über unter ob bitte sag nenn mal gerade mein meine meinen meinem kann können soll'.split(' '));
const bspWords = (t) => new Set(String(t || '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-zäöü0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !BSP_STOP.has(w)).map((w) => w.replace(/(en|er|e|n|s)$/, '')));
let beispiele = [];
function readBeispiele(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const cF = col(/^frage/), cP = col(/^profil/), cA = col(/^antwort/), cB = col(/^bewertung/), cK = col(/korrig/);
  if (cF < 0 || (cA < 0 && cK < 0)) throw new Error('Spalten „Frage“ und „Antwort“ oder „Korrigierte Antwort“ fehlen');
  const out = [];
  for (const r of rows.slice(1)) {
    const frage = (r[cF] || '').trim(), korr = cK >= 0 ? (r[cK] || '').trim() : '', bew = cB >= 0 ? (r[cB] || '').trim().toLowerCase() : '';
    const antwort = korr || (/^(gut|richtig|ok|passt|ja)/.test(bew) ? (r[cA] || '').trim() : '');
    if (!frage || !antwort || /^(falsch|schlecht|nein)/.test(bew) && !korr) continue;
    out.push({ frage: clip(frage, 300), profil: profilTyp({ profil_typ: cP >= 0 ? (r[cP] || '').trim() : '' }), antwort: clip(antwort, 500), w: bspWords(frage) });
  }
  return out;
}
async function refreshBeispiele() {
  let text;
  if (BEISPIELE_URL) {
    const res = await fetch(BEISPIELE_URL, { headers: { 'User-Agent': 'Flowtown/1.0' }, redirect: 'follow' });
    if (!res.ok) throw new Error('Tabelle nicht erreichbar: HTTP ' + res.status);
    text = await res.text();
    if (/^\s*<!doctype html|<html/i.test(text)) throw new Error('Der Link liefert eine Webseite statt CSV. In Google Tabellen: Datei > Freigeben > Im Web veröffentlichen > Format CSV');
  } else if (fs.existsSync(BEISPIELE_CSV)) text = fs.readFileSync(BEISPIELE_CSV, 'utf8');
  else return 'keine Quelle (BEISPIELE_CSV_URL oder beispiele.csv)';
  beispiele = readBeispiele(text);
  return `${beispiele.length} geprüfte Beispiele`;
}
function beispieleTick() { refreshBeispiele().then((m) => console.log('Beispiele:', m)).catch((e) => console.error('Beispiele:', e.message)); }
function beispieleFuer(frage, typ) {
  const w = bspWords(frage);
  if (!w.size || !beispiele.length) return [];
  return beispiele.map((b) => {
    let both = 0;
    for (const x of w) if (b.w.has(x)) both++;
    const sc = both / (w.size + b.w.size - both) + (b.profil && b.profil === typ ? 0.15 : 0) - (b.profil && typ && b.profil !== typ ? 0.1 : 0);
    return { b, sc, both };
  }).filter((x) => x.both >= 1 && (x.both >= 2 || w.size <= 3) && x.sc >= 0.15).sort((a, b) => b.sc - a.sc).slice(0, 3).map((x) => x.b);
}
async function assist(body) {
  const frage = clip(body.frage, 300);
  if (!frage) throw Object.assign(new Error('Keine Frage'), { status: 400 });
  const k = body.kontext || {};
  // feste Antwort aus der Tabelle: ohne KI, immer gleich
  const fa = festFor(frage, profilTyp(k));
  if (fa) return { antwort: fa.antwort, aktion: null, werkzeuge: ['festantwort ' + fa.id], beispiele: 0 };
  const pos = Array.isArray(k.pos) && k.pos.length === 2 && Number(k.pos[0]) > 35 && Number(k.pos[0]) < 72 && Number(k.pos[1]) > -12 && Number(k.pos[1]) < 35 ? k.pos.map((x) => Math.round(Number(x) * 100000) / 100000) : null;   // genau (auf etwa 1 m); geht nur an HERE und die eigenen Werkzeuge, nie an Mistral; auch unterwegs in anderen Städten (Europa)
  const auswertung = assistStatsClean(k.auswertung);
  const ctx = { pos, auswertung, typ: profilTyp(k), vorrang: k.vorrang === 'schnell' || /schnellsten|am schnellsten|eilig/i.test(frage) ? 'schnell' : '', ziele: (Array.isArray(k.ziele) ? k.ziele : []).slice(0, 8).map((z) => ({ name: clip(z.name, 40), lat: Math.round(Number(z.lat) * 1000) / 1000, lon: Math.round(Number(z.lon) * 1000) / 1000 })) };
  ctx.zuFuss = /mit (dem|meinem|meiner) (rollator|rollstuhl|gehhilfe|krücken|gehstock)|\bzu fuß\b|\blaufen\b/i.test(frage);
  ctx.aussen = ausserhalb(pos);
  ctx.stadt = ctx.aussen ? (fpStadtAt(pos) || {}).name || (await placeNear(pos).catch(() => '')) || '' : 'Bielefeld';
  // Antworten, die der Server selbst aus Daten zusammensetzt (Standort mit Adresse, Aufzug an der Stadtbahn): ohne KI
  try { const da = await direktAntwort(frage, ctx); if (da) return { antwort: da, aktion: null, werkzeuge: ['direkt'], beispiele: 0 }; } catch (e) { /* dann die KI */ }
  if (!MISTRAL_KEY) throw Object.assign(new Error('Die Assistenz ist auf dem Server noch nicht eingerichtet.'), { status: 503 });
  const kontext = { standort: pos ? (ctx.aussen ? `bekannt, außerhalb von Bielefeld${ctx.stadt ? ', in ' + ctx.stadt : ''}` : 'bekannt (genau)') : 'unbekannt', verkehrsmittel: clip(k.verkehrsmittel, 20), profil: clip(k.profil, 60), einfache_sprache: k.einfach === true || ctx.typ === 'lernen', unterwegs: !!k.unterwegs, haltestelle_jetzt: clip(k.haltestelle, 50), gespeicherte_ziele: ctx.ziele.map((z) => z.name), uhrzeit: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }), eigene_auswertung: auswertung === 'ausgeschaltet' ? 'ausgeschaltet' : 'eingeschaltet, abrufbar mit meine_auswertung' };
  const verlauf = (Array.isArray(body.verlauf) ? body.verlauf : []).slice(-6).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && !(m.role === 'assistant' && /stehst bei /i.test(String(m.content)))).map((m) => ({ role: m.role, content: clip(m.content, 400) }));   // Adressen aus „Wo bin ich?“ gehen nie an Mistral
  // bei Rückfragen ein kurzer Hinweis direkt an der Frage: daran halten sich Sprachmodelle zuverlässiger als an den Auftrag allein
  const nachfrage = verlauf.some((m) => m.role === 'assistant') && !/(einfache[rn]?|leichte[rn]?) sprache/i.test(frage) ? '\n\n(Rückfrage im Gespräch: nur das Neue beantworten, nichts aus deinen früheren Antworten wiederholen.)' : '';
  const gn = (frage.match(/\b(\d{1,3})\s*(kinder|personen|leute|schüler|menschen|rollstuhl)/i) || [])[1];
  const gruppe = (gn && Number(gn) >= 5) || /schulklasse|reisegruppe/i.test(frage) ? '\n\n(Gruppe ab fünf Personen: empfiehl nicht das Auto, sondern Bahn oder Bus mit stufenlosem Zugang.)' : '';
  const zeitFrage = /\b(um|gegen|bis|ab)\s+(\d{1,2}(:\d{2})?\s*uhr|halb\s+\w+|\d{1,2}:\d{2})|\bmorgen\b|übermorgen|sonntag|samstag|montag|dienstag|mittwoch|donnerstag|freitag|wochenende|feiertag|neujahr|weihnacht|ostern/i.test(frage) && !/letzte|nachts|zurück|rückweg|geöffnet|öffnungszeit|\boffen\b|toilette|\bwc\b|apotheke/i.test(frage);
  const zeit = zeitFrage ? '\n\n(Die Werkzeuge kennen nur Zeiten ab jetzt. Sag das offen. Nenne keine Uhrzeit zum Losgehen und keinen Fahrplan für einen anderen Tag oder Feiertag.)' : '';
  const bsp = beispieleFuer(frage, ctx.typ);
  const vorbild = bsp.length ? '\nGeprüfte Beispiele der Redaktion zu ähnlichen Fragen. Übernimm daraus Aufbau, Ton, Länge und was wichtig ist; die Fakten (Zeiten, Entfernungen, Angaben) aber nur aus den Werkzeugen von jetzt, nie aus den Beispielen:\n' + bsp.map((b) => `Frage${b.profil ? ' (Profil ' + b.profil + ')' : ''}: ${b.frage}\nGute Antwort: ${b.antwort}`).join('\n') : '';
  const messages = [{ role: 'system', content: ASSIST_SYSTEM + vorbild + '\nKontext: ' + JSON.stringify(kontext) }, ...verlauf, { role: 'user', content: frage + nachfrage + gruppe + zeit }];
  const act = {}, used = [];
  ctx.used = used;
  // Nennt die Frage ein Ziel oder ein Thema mit Werkzeug, muss die erste Runde nachschlagen (sonst fragt Mistral oft unnötig nach)
  const zwingen = !/gestürzt|notfall|unfall|verletzt|hilfe!|wetter|grün/i.test(frage) && (/\b(zu|zum|zur|nach|bei|über|am|an der|ins)\s+[A-ZÄÖÜ]/.test(frage) || /nächste[nr]?\s+(bahn|bus|stadtbahn|abfahrt)|störung|umleitung|aufz[uü]g|park\s*\+?\s*ride|toilette|\bwc\b|tonsignal|hochbahnsteig|haltestelle in meiner nähe/i.test(frage));
  for (let round = 0; round < 4; round++) {
    let m = await mistralChat(messages, false, round === 0 && zwingen);
    const gueltig = (x) => (x.tool_calls || []).filter((c) => c && c.function && TOOL_NAMES.has(c.function.name));
    let calls = gueltig(m);
    // Erzwungener Werkzeugaufruf ohne passendes Werkzeug: Mistral schreibt dann die Antwort als Werkzeugnamen. Einmal ohne Zwang, sonst ganz ohne Werkzeuge.
    if ((m.tool_calls || []).length && !calls.length) {
      m = await mistralChat(messages, false, false);
      calls = gueltig(m);
      if (!calls.length && !String(m.content || '').trim()) m = await mistralChat(messages, true);
    }
    if (!calls.length) {
      const antwort = sauber(m.content) || 'Dazu habe ich gerade keine Antwort.';
      return { antwort, aktion: act.ziel ? Object.assign({ typ: 'ziel' }, act.ziel) : null, werkzeuge: used, beispiele: bsp.length };
    }
    // höchstens drei Werkzeuge je Runde, und die Nachricht der KI nennt genau diese drei: sonst lehnt Mistral mit 400 ab (zu wenige Antworten)
    const use = calls.slice(0, 3);
    messages.push({ role: 'assistant', content: m.content || '', tool_calls: use });
    for (const c of use) {
      let args = {};
      try { args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments) : c.function.arguments || {}; } catch (e) { args = {}; }
      let out;
      try { out = await assistTool(c.function.name, args, ctx, act); } catch (e) { out = { fehler: clip(e.message, 120) }; }
      used.push(c.function.name);
      messages.push({ role: 'tool', name: c.function.name, tool_call_id: c.id, content: JSON.stringify(out).slice(0, c.function.name === 'ort_barrierefreiheit' ? 9000 : 4000) });
    }
  }
  // genug nachgeschlagen: mit dem antworten, was die Werkzeuge geliefert haben
  try {
    messages.push({ role: 'user', content: 'Antworte jetzt ohne weitere Werkzeuge mit dem, was du hast, in höchstens drei Sätzen. Was fehlt, sag offen.' });
    const m = await mistralChat(messages, true);
    const antwort = sauber(m.content);
    if (antwort) return { antwort, aktion: act.ziel ? Object.assign({ typ: 'ziel' }, act.ziel) : null, werkzeuge: used, beispiele: bsp.length };
  } catch (e) { /* unten die Ersatzantwort */ }
  return { antwort: 'Das konnte ich gerade nicht vollständig nachschlagen. Versuch es bitte etwas genauer.', aktion: null, werkzeuge: used };
}

// <qualitaet>
// Datenqualität, Schritt 1: Lückenzähler und Rückmeldungen. Gezählt wird nie eine Frage und nie eine Person, nur Thema, bekannter Ort, Profilart und Monat.
const Q_DIR = path.join(DATA_DIR, 'qualitaet');
const LUECKE_FILE = path.join(Q_DIR, 'luecken.json');
const RUECK_FILE = path.join(Q_DIR, 'rueckmeldungen.jsonl');
const Q_THEMEN = [['aufzug', /aufz[uü]g|\blift\b/], ['rampe', /rampe|hublift|niederflur|rollstuhlplatz/], ['wc', /toilette|\bwc\b/], ['notruf', /notruf|notrufs/], ['umsteigen', /umstei/], ['tempo', /tempo|langsam|reicht (die|meine) zeit/],
  ['eingang', /eingang|\btür|stufe|schwelle|barrierefrei/], ['ampel', /ampel|querung|überqu/], ['haltestelle', /haltestelle|bahnsteig/], ['parken', /parkplatz|parken|parkhaus/], ['baustelle', /baustelle|sperrung|umleitung|störung/],
  ['sprache', /einfache sprache|leichte sprache|ohne ton/], ['oeffnungszeiten', /geöffnet|öffnungszeit|\boffen\b/], ['hilfe', /hilfe|helfen|begleit/], ['weg', /weg|route|komme ich|fahrt|fährt|bahn|bus/]];
const Q_LUECKE = /keine angabe|weiß ich (gerade )?nicht|kenne ich (nicht|dazu)|habe ich (dazu )?(keine|nicht)|nicht sicher|nicht bekannt|kann ich (dir )?(nicht|nichts)|dazu kann ich nichts/i;
let qLuecken = {};
try { qLuecken = JSON.parse(fs.readFileSync(LUECKE_FILE, 'utf8')); } catch (e) { qLuecken = {}; }
function qThema(f) { const t = String(f || '').toLowerCase(); for (const [k, re] of Q_THEMEN) if (re.test(t)) return k; return 'sonstiges'; }
// nur Orte, die wir selbst kennen (Haltestellen, Gebäude von Bethel): so landet nie eine private Adresse im Zähler
function qObjekt(f) {
  const t = hstNorm(f); if (t.length < 4) return '';
  const namen = [...((hst && hst.liste) || []).map((z) => z.name), ...((bf && bf.orte) || []).map((o) => o.name)].filter((n) => n && hstNorm(n).length >= 4);
  const hit = namen.filter((n) => t.includes(hstNorm(n))).sort((a, b) => b.length - a.length)[0];
  return hit ? clip(hit, 60) : '';
}
function qZaehle(frage, r, typ) {
  try {
    if (!r || !r.antwort) return;
    const mon = new Date().toISOString().slice(0, 7), key = [mon, qThema(frage), qObjekt(frage), typ || ''].join('|');
    const e = qLuecken[key] || (qLuecken[key] = { n: 0, l: 0 });
    e.n++; if (Q_LUECKE.test(r.antwort)) e.l++;
    fs.mkdirSync(Q_DIR, { recursive: true });
    fs.writeFileSync(LUECKE_FILE + '.tmp', JSON.stringify(qLuecken)); fs.renameSync(LUECKE_FILE + '.tmp', LUECKE_FILE);
  } catch (e) { /* Zähler darf nie eine Antwort verhindern */ }
}
const Q_ARTEN = ['gut', 'falsch', 'veraltet'];
function qRueck(b) {
  const art = Q_ARTEN.includes(b && b.art) ? b.art : null;
  if (!art) throw Object.assign(new Error('Unbekannte Art'), { status: 400 });
  const eintrag = { t: Date.now(), art, thema: qThema(b.frage), typ: clip(b.profil_typ, 20) };
  // Text nur bei „stimmt nicht“ und „veraltet“, und nur, weil die Person das ausdrücklich gewählt hat; Adressen aus „Wo bin ich?“ nie
  if (art !== 'gut') {
    eintrag.frage = clip(b.frage, 300);
    eintrag.antwort = /stehst bei /i.test(String(b.antwort)) ? '' : clip(b.antwort, 600);
    eintrag.werkzeuge = (Array.isArray(b.werkzeuge) ? b.werkzeuge : []).slice(0, 6).map((x) => clip(x, 30));
    eintrag.id = 'R' + Date.now().toString(36);
  }
  fs.mkdirSync(Q_DIR, { recursive: true });
  fs.appendFileSync(RUECK_FILE, JSON.stringify(eintrag) + '\n');
  return eintrag.id || null;
}
function qRueckListe() {
  try { return fs.readFileSync(RUECK_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; }
}
// </qualitaet>

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
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, werkzeuge: ['vergleich', 'weg_check', 'oepnv_stoerungen', 'ampeln_mit_ton', 'ort_info', 'abfahrten_in_der_naehe', 'rueckweg', 'hilfe_menschen'], beispiele: beispiele.length, ki: !!MISTRAL_KEY, modell: MISTRAL_MODEL, kMin: K_MIN, lage: { here: !!HERE_KEY, autobahn: LAGE_ROADS }, ziel: !!HERE_KEY, pilot: true, oepnv: true, radnetz: true, fussnetz: true, hinweise: true, barrierefrei: !!(bf && bf.t), faqOrte: bf && bf.faqOrte ? Object.keys(bf.faqOrte) : [], redaktion: faqData && faqData.eintraege ? { hinweise: faqData.eintraege.length, stand: new Date(faqData.t).toISOString(), tabellenhinweise: (faqData.fehler || []).length } : false, fahrplan: fahrplan ? { stand: fahrplan.stand, gilt: fahrplan.gilt, staedte: Object.values(fahrplaene).map((x) => ({ id: x.id, name: x.name, box: x.box })) } : false, haltestellen: hst ? { anzahl: hst.liste.length, quelle: hst.quelle, tabellenhinweise: hst.fehler.length } : false, behindertenparkplaetze: bpp ? { stadt: bpp.stadt, osm: bpp.osm, stand: new Date(bpp.t).toISOString() } : false, ampelanlagen: lsa ? { anzahl: lsa.anlagen.length, stand: new Date(lsa.t).toISOString() } : false, toilettenStadt: swc ? { anzahl: swc.wc.length, stand: new Date(swc.t).toISOString() } : false, strassenNrw: MOBI_ON ? Object.fromEntries(Object.entries(nrw).map(([k, q]) => [k, q.t ? { meldungen: q.items.length, stand: new Date(q.t).toISOString(), fehler: q.err || undefined } : (q.err || (q.try ? 'lädt' : 'noch nicht angefragt'))])) : false, echtzeit: MOBI_ON ? { stand: rt.t ? new Date(rt.ts).toISOString() : null, fahrten: rt.n || 0, mb: rt.bytes ? Math.round(rt.bytes / 1e5) / 10 : 0, fehler: rtErr || undefined, kennungen: Object.values(fahrplaene).every((f) => f.ids) } : false, aufzuegeDb: MOBI_ON ? (dba ? { anlagen: dba.anlagen.length, stand: dba.stand, status: dbaStatus.t ? new Date(dbaStatus.t).toISOString() : null, ausser_betrieb: Object.values(dbaStatus.s).filter((x) => x === 'notAvailable').length } : 'wird geladen') : false, assistenz: !!MISTRAL_KEY, parkRide: stadt2 ? stadt2.pr.length : false, radnetzStadt: stadt2 ? stadt2.netz.length : false, baustellenStadt: lage.stadt.t ? { anzahl: lage.stadt.items.length, stand: new Date(lage.stadt.t).toISOString() } : false }, origin);
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
    if (req.method === 'POST' && p === '/api/assist') {
      if (!assistAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Fragen möglich.' }, origin);
      const ab = await readBody(req, 8 * 1024), ar = await assist(ab);
      qZaehle(ab.frage, ar, profilTyp(ab.kontext || {}));
      return send(res, 200, ar, origin);
    }
    if (req.method === 'POST' && p === '/api/rueckmeldung') {
      if (!hinweisAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Meldungen möglich.' }, origin);
      const b = await readBody(req, 4096); b.profil_typ = profilTyp(b.kontext || { profil_typ: b.profil_typ });
      return send(res, 200, { ok: true, id: qRueck(b) }, origin);
    }
    if (req.method === 'GET' && p === '/api/lage') return send(res, 200, await readLage(), origin);
    if (req.method === 'GET' && p === '/api/oepnv') return send(res, 200, await readMobiel(), origin);
    if (req.method === 'GET' && p === '/api/faq') return faqData && faqData.eintraege ? sendFaq(req, res, origin) : send(res, 404, { fehler: 'Keine Redaktions-Tabelle eingerichtet.' }, origin);
    if (req.method === 'GET' && p === '/api/stadt-pr-radnetz') { if (!stadt2) { stadt2Tick(); return send(res, 200, { t: 0, pr: [], netz: [] }, origin); } return sendStadt2(req, res, origin); }
    if (req.method === 'GET' && p === '/api/ampelanlagen') { if (!lsa) lsaTick(); return send(res, 200, lsa || { t: 0, anlagen: [] }, origin); }
    if (req.method === 'GET' && p === '/api/behindertenparkplaetze') { if (!bpp) bppTick(); return send(res, 200, bpp ? { t: bpp.t, quellen: bpp.quellen, plaetze: bpp.plaetze } : { t: 0, quellen: [], plaetze: [] }, origin); }
    if (req.method === 'GET' && p === '/api/haltestellen') return send(res, 200, hst ? { t: hst.t, liste: hst.liste.map(({ name, k, hbs, hinweis, quelle, lat, lon }) => ({ name, k, hbs, hinweis, quelle, lat, lon })) } : { t: 0, liste: [] }, origin);
    if (req.method === 'GET' && p === '/api/hinweise') return send(res, 200, { t: Date.now(), hinweise: hinweise.filter((h) => h.bis > Date.now() && h.weg < 2).map(({ id, lat, lon, art, t, t2, ok, weg, geprueft }) => ({ id, lat, lon, art, t, t2, ok, weg, geprueft })) }, origin);
    if (req.method === 'POST' && p === '/api/hinweis') {
      if (!hinweisAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Meldungen möglich.' }, origin);
      return send(res, 200, { ok: true, hinweis: addHinweis(await readBody(req, 2048)) }, origin);
    }
    if (req.method === 'POST' && p === '/api/merkmal') {
      if (!hinweisAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Meldungen möglich.' }, origin);
      return send(res, 200, { ok: true, n: addMerkmale(await readBody(req, 4096)) }, origin);
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
    if (req.method === 'GET' && p === '/api/echtzeit') {
      // nur die Stadt kommt an, weder Haltestelle noch Linie; die App rechnet die Verspätungen selbst ein
      const id = (url.searchParams.get('stadt') || 'bielefeld').toLowerCase(), f = fahrplaene[id];
      rtWanted = Date.now(); rtTick();
      if (!MOBI_ON || !f) return send(res, 404, { fehler: 'Keine Echtzeit für diese Stadt.' }, origin);
      return send(res, 200, rtFresh() ? { t: rt.ts, stand: f.stand, quelle: rt.quelle, trips: rt.staedte[id] || {} } : { t: 0, stand: f.stand, trips: {}, hinweis: rtErr ? 'Echtzeit gerade nicht erreichbar' : 'Echtzeit wird geladen' }, origin);
    }
    if (req.method === 'GET' && p === '/api/fahrplan') {
      const fpx = fahrplaene[(url.searchParams.get('stadt') || 'bielefeld').toLowerCase()];
      return fpx ? sendFahrplan(req, res, origin, fpx) : send(res, 404, { fehler: 'Noch kein Fahrplan auf dem Server.' }, origin);
    }
    // „Wo bin ich?“: Adresse am Standort (auf etwa 10 m) und 30 m in Blickrichtung; nichts wird gespeichert
    if (req.method === 'GET' && p === '/api/wo') {
      if (!HERE_KEY) return send(res, 503, { fehler: 'Adressen braucht einen HERE-Schlüssel auf dem Server.' }, origin);
      if (!ortAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Abfragen möglich.' }, origin);
      const [lat, lon] = coord(url.searchParams.get('pos'), 4);
      const h = Number(url.searchParams.get('h'));
      const hier = await addrAt(lat, lon);
      let voraus = null;
      if (hier && isFinite(h) && url.searchParams.get('h') !== null && url.searchParams.get('h') !== '') {
        const q = [lat + Math.cos(h * Math.PI / 180) * 30 / 111320, lon + Math.sin(h * Math.PI / 180) * 30 / (111320 * Math.cos(lat * Math.PI / 180))];
        voraus = await addrAt(q[0], q[1]).catch(() => null);
      }
      return send(res, 200, { hier, voraus }, origin);
    }
    if (req.method === 'GET' && p === '/api/vergleich') {
      if (!HERE_KEY) return send(res, 503, { fehler: 'Der Vergleich braucht einen HERE-Schlüssel auf dem Server.' }, origin);
      if (!zielAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Prüfungen möglich.' }, origin);
      const from = coord(url.searchParams.get('from'), 3), to = coord(url.searchParams.get('to'), 4);
      const typ = profilTyp({ profil_typ: url.searchParams.get('profil') });
      return send(res, 200, Object.assign(await vergleichZiel(from, to, typ, url.searchParams.get('vorrang') === 'schnell' ? 'schnell' : ''), { am_ziel: zielInfo(to, url.searchParams.get('name') || '', typ, await osmAussen(to, typ, 4000)) }), origin);
    }
    if (req.method === 'GET' && (p === '/api/ort' || p === '/api/ziel')) {
      if (!HERE_KEY) return send(res, 503, { fehler: 'Ziel-Prüfung braucht einen HERE-Schlüssel auf dem Server.' }, origin);
      if (p === '/api/ort') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
        if (q.length < 2) return send(res, 400, { fehler: 'Bitte einen Ort eingeben.' }, origin);
        if (!ortAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Suchen möglich.' }, origin);
        const nr = url.searchParams.get('near') ? coord(url.searchParams.get('near'), 2) : null;   // außerhalb von Bielefeld: Standort auf etwa 1 km
        return send(res, 200, { orte: await findOrt(q, nr) }, origin);
      }
      // Start auf etwa 1 km gerundet; bei Bus und Bahn darf er eine gewählte Haltestelle sein (öffentlicher Ort, genau)
      // zu Fuß auf etwa 100 m gerundet: Fußwege sind kurz, ein Start 1 km daneben ergäbe einen anderen Weg
      const m = url.searchParams.get('mode'), mode = m === 'rad' ? 'rad' : m === 'oepnv' ? 'oepnv' : m === 'fuss' ? 'fuss' : 'auto';
      // Navigation (nav=1): Start auf etwa 10 m, damit die Strecke genau am Standort beginnt (Einwilligung mit „Fahrt starten mit Ziel“)
      const nav = url.searchParams.get('nav') === '1' && mode !== 'oepnv';
      const from = coord(url.searchParams.get('from'), nav || (mode === 'oepnv' && url.searchParams.get('ab') === 'halt') ? 4 : mode === 'fuss' ? 3 : 2), to = coord(url.searchParams.get('to'), 4);
      // zu Fuß: Strecke bis zum Eingang statt bis zur Gebäudemitte
      const eing = mode === 'fuss' && HERE_KEY ? await zuerst(eingangNahe(to, profilTyp({ profil_typ: url.searchParams.get('profil') })), 5000) : null;
      if (!zielAllowed(ip)) return send(res, 429, { fehler: 'Heute sind keine weiteren Prüfungen möglich.' }, origin);
      const via = mode === 'auto' && url.searchParams.get('via') ? coord(url.searchParams.get('via'), 4) : null;   // Ausweichroute in der Navigation halten
      if (mode === 'oepnv') return send(res, 200, await checkZielOepnv(from, to), origin);
      const erg = await checkZiel(from, eing ? eing.pos.map((x) => Math.round(x * 1e4) / 1e4) : to, mode, nav, via);
      return send(res, 200, eing ? Object.assign({}, erg, { eingang: { art: eing.art, stufenlos: eing.stufenlos, abstand_m: eing.abstand_m, automatiktuer: eing.automatiktuer } }) : erg, origin);
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
if (cli === 'merkmale') {
  // Antworten je Ampel zusammengefasst, mit Vorschlag für OpenStreetMap (erst ab 2 übereinstimmenden Antworten)
  const by = {};
  for (const x of merkmale) { const k = `${x.lat.toFixed(4)},${x.lon.toFixed(4)},${x.m}`; const e = by[k] || (by[k] = { ja: 0, nein: 0, tage: new Set() }); if (x.v) e.ja++; else e.nein++; e.tage.add(x.tag); }
  console.log('lat,lon,merkmal,ja,nein,tage,vorschlag_osm');
  for (const [k, e] of Object.entries(by).sort((a, b) => (b[1].ja + b[1].nein) - (a[1].ja + a[1].nein))) {
    const tag = k.endsWith(',ton') ? 'traffic_signals:sound' : 'tactile_paving';
    const v = e.ja >= 2 && e.ja >= 3 * e.nein ? `${tag}=yes` : e.nein >= 2 && e.nein >= 3 * e.ja ? `${tag}=no` : 'prüfen';
    console.log(`${k},${e.ja},${e.nein},${e.tage.size},${v}`);
  }
  console.log(`# ${merkmale.length} Antworten. Vorschläge vor Ort oder per Luftbild prüfen, dann in OpenStreetMap eintragen.`);
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
} else if (cli === 'haltestellen') {
  // alle Stadtbahn-Haltestellen mit Eintrag in der Liste und Vorschlag aus OpenStreetMap; schreibt haltestellen-vorschlag.csv
  loadFahrplan();
  (async () => {
    const m = await refreshHst().catch((e) => 'Liste: ' + e.message);
    console.log(m);
    let osm = null;
    try { osm = await hstOsm(); } catch (e) { console.error('OpenStreetMap:', e.message); }
    const stops = tramStops();
    if (!stops) { console.error('Noch kein Fahrplan auf dem Server.'); process.exit(1); }
    const inList = new Map((hst ? hst.liste : []).map((e) => [e.k, e]));
    const rows = [['Haltestelle', 'Hochbahnsteig', 'Hinweis', 'Quelle']];
    const all = osm || [...stops].map(([k, st]) => ({ k, name: st.name, v: '?', grund: '' })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    for (const o of all) {
      const e = inList.get(o.k);
      console.log(o.name.padEnd(32), ('Liste: ' + (e ? e.hbs : '–')).padEnd(18), osm ? `OSM: ${o.v} (${o.grund})` : '');
      rows.push(e ? [o.name, e.hbs, e.hinweis, e.quelle] : [o.name, o.v === '?' ? '' : o.v, '', osm && o.v !== '?' ? 'OpenStreetMap, bitte prüfen' : '']);
    }
    const file = path.join(DATA_DIR, 'haltestellen-vorschlag.csv');
    fs.writeFileSync(file, rows.map((r) => r.map((x) => (/[;"\n]/.test(x) ? '"' + String(x).replace(/"/g, '""') + '"' : x)).join(';')).join('\n') + '\n');
    console.log(`\n${all.length} Stadtbahn-Haltestellen. Vorschlag gespeichert: ${file}`);
    console.log('Prüfen, leere Zeilen ausfüllen, dann als Blatt in die Tabelle (HALTESTELLEN_CSV_URL) oder nach /var/lib/flowtown/haltestellen.csv kopieren.');
    process.exit(0);
  })();
} else if (cli === 'parkplaetze') {
  // Behindertenparkplätze neu holen und zeigen, was erkannt wurde
  refreshBpp().then((m) => {
    console.log(m);
    for (const p of bpp.plaetze.slice(0, 5)) console.log('  ', p[4] === 's' ? 'Stadt' : 'OSM  ', `${p[0]}, ${p[1]}`.padEnd(20), p[2] ? p[2] + (p[2] === 1 ? ' Platz ' : ' Plätze') : '', p[3]);
    console.log('Jetzt: sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown');
    process.exit(0);
  }).catch((e) => { console.error(e.message); process.exit(1); });
} else if (cli === 'mobilithek') {
  // alle Abos der Mobilithek einmal abholen und zeigen, was ankommt (zum Prüfen nach einer Freigabe)
  (async () => {
    if (!MOBI_ON) { console.error('MOBILITHEK_CERT fehlt in /etc/flowtown.env'); process.exit(1); }
    loadFahrplan();
    for (const k of Object.keys(nrw)) {
      await nrwRefresh(k);
      const q = nrw[k];
      console.log(`Straßen.NRW ${k} (Abo ${NRW_ABO[k]}):`, q.err || `${q.items.length} Meldungen, ${Math.round((q.bytes || 0) / 1024)} KB`);
      for (const it of q.items.slice(0, 3)) console.log('   ', it.art, '|', it.titel || '–', '|', (it.text || '').slice(0, 90), '|', it.pts[0].join(','));
    }
    try { const n = await refreshDbStatus(); console.log('DB-Aufzüge Status:', n, 'Anlagen'); } catch (e) { console.log('DB-Aufzüge Status:', e.message); }
    try { const n = await refreshRt(); console.log('Echtzeit DELFI:', n, 'Fahrten erkannt,', Math.round(rt.bytes / 1e5) / 10, 'MB'); } catch (e) { console.log('Echtzeit DELFI:', e.message); }
    process.exit(0);
  })();
} else if (cli === 'stadtdaten') {
  // Ampelanlagen und Baustellen der Stadt holen und zeigen
  (async () => {
    try { console.log(await refreshLsa()); } catch (e) { console.error('Ampelanlagen:', e.message); }
    try { console.log(await refreshStadt2()); } catch (e) { console.error(e.message); }
    try {
      const b = await stadtBaustellen();
      console.log(`${b.length} aktuelle Baustellen der Stadt, davon ${b.filter((x) => x.art === 'sperrung').length} Sperrungen, ${b.filter((x) => x.fuss).length} mit Hinweis für den Fuß- und Radverkehr`);
      for (const x of b.slice(0, 5)) console.log('  ', x.titel.padEnd(30), x.richtungText.padEnd(40), x.bis ? 'bis ' + x.bis.slice(0, 10) : '');
    } catch (e) { console.error('Baustellen:', e.message); }
    console.log('Jetzt: sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown');
    process.exit(0);
  })();
} else if (cli === 'luecken') {
  // Lückenzähler: zu welchen Themen und Orten fehlten Antworten (ohne Fragen, ohne Personen). Aufruf: luecken [Monat JJJJ-MM]
  const mon = process.argv[3] || '';
  const rows = Object.entries(qLuecken).map(([k, v]) => { const [m, th, ob, ty] = k.split('|'); return { m, th, ob, ty, n: v.n, l: v.l }; }).filter((r) => !mon || r.m === mon).sort((a, b) => b.l - a.l || b.n - a.n);
  console.log('Monat   Thema            Ort                           Profil     Fragen  ohne Antwort  Anteil');
  for (const r of rows.slice(0, 60)) console.log(r.m.padEnd(8), r.th.padEnd(16), (r.ob || '-').slice(0, 28).padEnd(29), (r.ty || '-').padEnd(10), String(r.n).padStart(6), String(r.l).padStart(12), String(Math.round(100 * r.l / r.n) + ' %').padStart(8));
  console.log(rows.length + ' Zeilen. Sortiert nach Zahl der fehlenden Antworten: oben steht, was zuerst erfasst werden sollte.');
  process.exit(0);
} else if (cli === 'rueckmeldungen') {
  // Rückmeldungen „stimmt nicht“ und „veraltet“ mit Frage und Antwort; zuerst die neuesten. Aufruf: rueckmeldungen [Anzahl]
  const all = qRueckListe(), bad = all.filter((x) => x.art !== 'gut');
  const gut = all.filter((x) => x.art === 'gut').length;
  for (const x of bad.slice(-(Number(process.argv[3]) || 20)).reverse()) {
    console.log(`${x.id} ${x.art.padEnd(8)} ${new Date(x.t).toLocaleDateString('de-DE')} ${x.thema} ${x.typ ? '[' + x.typ + ']' : ''} ${x.werkzeuge && x.werkzeuge.length ? '(' + x.werkzeuge.join(', ') + ')' : ''}`);
    console.log('  Frage:  ' + (x.frage || '')); console.log('  Antwort: ' + (x.antwort || '(nicht übermittelt)'));
  }
  console.log(`${all.length} Rückmeldungen: ${gut}× „stimmt“, ${bad.length}× „stimmt nicht“ oder „veraltet“.`);
  process.exit(0);
} else if (cli === 'frage') {
  // Assistenz von der Kommandozeile testen: node flowtown-server.mjs frage "Wo ist die nächste rollstuhlgerechte Toilette?" 52.0214 8.5339 [Profil]
  loadFahrplan();
  (async () => {
    await refreshHst().catch(() => null);
    await refreshBeispiele().catch(() => null);
    const [q, la, lo, prof] = process.argv.slice(3);
    try { const r = await assist({ frage: q, kontext: { pos: la && lo ? [Number(la), Number(lo)] : null, profil: prof || '', verkehrsmittel: 'fuss' } }); console.log(r.antwort); console.log('Werkzeuge:', r.werkzeuge.join(', ') || '–', r.aktion ? '| Aktion: ' + JSON.stringify(r.aktion) : ''); }
    catch (e) { console.error(e.message); }
    process.exit(0);
  })();
} else if (cli === 'testlauf') {
  // Teststrecke: alle Fragen aus server/testfragen.csv (oder einer eigenen Datei) an die Assistenz, Antworten als Tabelle zum Korrigieren
  //   node flowtown-server.mjs testlauf [datei.csv]
  loadFahrplan();
  (async () => {
    await refreshHst().catch(() => null);
    await refreshBeispiele().catch(() => null);
    const src = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname), 'testfragen.csv');
    const rows = parseCsv(fs.readFileSync(src, 'utf8'));
    const head = rows[0].map((h) => h.trim().toLowerCase()), ci = (n) => head.indexOf(n);
    const q = (x) => '"' + String(x == null ? '' : x).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
    // Spalten „Gruppe“ und „Erwartung“ (aus pruefkatalog.csv) laufen mit, damit sich die Antworten gleich gegen die Erwartung prüfen lassen
    const fa = process.argv[4] || '';
    const filter = !fa ? null : /^ergebnis:/i.test(fa) ? { erg: fa.slice(9).split(',').map((x) => x.trim().toLowerCase()) } : { nr: fa.split(',').map((x) => x.trim().toUpperCase()) };
    const out = ['Nr;Thema;Profil;Frage;Antwort;Werkzeuge;Beispiele genutzt;Sekunden;Bewertung;Korrigierte Antwort;Notiz;Gruppe;Erwartung'];
    for (const r of rows.slice(1)) {
      const nr = r[ci('nr')], thema = r[ci('thema')] || '', prof = (r[ci('profil')] || '').trim(), frage = (r[ci('frage')] || '').trim();
      const la = Number(r[ci('breite')]), lo = Number(r[ci('länge')] != null ? r[ci('länge')] : r[ci('laenge')]);
      if (!frage) continue;
      // Wiederholung nur einzelner Zeilen: testlauf datei.csv K018,K020 oder testlauf datei.csv ergebnis:falsch,nicht erfüllt
      if (filter && !(filter.nr ? filter.nr.includes(String(nr).toUpperCase()) : filter.erg.includes(String(r[ci('ergebnis')] || '').trim().toLowerCase()))) continue;
      const t0 = Date.now();
      let antwort, werkzeuge = '', nb = 0;
      try { const x = await assist({ frage, kontext: { pos: isFinite(la) && isFinite(lo) && la && lo ? [la, lo] : null, profil_typ: prof, profil: prof, verkehrsmittel: 'fuss' } }); antwort = x.antwort; werkzeuge = x.werkzeuge.join(', '); nb = x.beispiele || 0; }
      catch (e) { antwort = 'FEHLER: ' + e.message; }
      const sek = Math.round((Date.now() - t0) / 100) / 10;
      console.log(`${nr} ${thema}: ${antwort.slice(0, 100)}${antwort.length > 100 ? ' …' : ''}  [${werkzeuge || 'ohne Werkzeug'}]`);
      out.push([nr, thema, prof, frage, antwort, werkzeuge, nb, String(sek).replace('.', ','), '', '', '', r[ci('gruppe')] || '', r[ci('erwartung')] || ''].map(q).join(';'));
      await new Promise((res) => setTimeout(res, 1200));   // Mistral und HERE nicht drängeln
    }
    const dir = path.join(DATA_DIR, 'testlauf');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `testlauf-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`);
    fs.writeFileSync(file, '\ufeff' + out.join('\r\n') + '\r\n');
    console.log(`\n${out.length - 1} Antworten in ${file}`);
    process.exit(0);
  })();
} else if (cli === 'festantworten') {
  // Prüft die Tabelle der Festantworten: node flowtown-server.mjs festantworten [katalog.csv]  (zeigt je Frage, welche Festantwort passt)
  const n = loadFest();
  console.log(n + ' Festantworten freigegeben (' + FEST_FILE + ')');
  const src = process.argv[3];
  if (src) {
    const rows = parseCsv(fs.readFileSync(src, 'utf8'));
    const head = rows[0].map((h) => h.trim().toLowerCase()), ci = (x) => head.indexOf(x);
    let hit = 0, tot = 0;
    for (const r of rows.slice(1)) {
      const frage = (r[ci('frage')] || '').trim(); if (!frage) continue; tot++;
      const f = festFor(frage, (r[ci('profil')] || '').trim().toLowerCase());
      const pl = aufzugPlan(frage, ['Jahnplatz', 'Rathaus', 'Universität', 'Hauptbahnhof', 'Adenauerplatz']);
      if (f) { hit++; console.log(`${r[ci('nr')]} ${f.id}: ${frage.slice(0, 60)}  →  ${f.antwort.slice(0, 80)}`); }
      else if (pl) console.log(`${r[ci('nr')]} aufzug/${pl.typ}${pl.name ? ' ' + pl.name : pl.ort ? ' ' + pl.ort : ''}: ${frage.slice(0, 60)}`);
    }
    console.log(`\n${hit} von ${tot} Fragen haben eine Festantwort.`);
  }
  process.exit(0);
} else if (cli === 'beispiele') {
  refreshBeispiele().then((m) => { console.log(m); for (const b of beispiele.slice(0, 5)) console.log(' -', b.frage.slice(0, 70), '→', b.antwort.slice(0, 60)); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
} else if (cli === 'barrierefrei') {
  refreshBf().then((m) => { console.log(m); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
} else if (cli === 'fahrplan') {
  refreshFahrplan().then((m) => { console.log(m); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
} else if (cli) {
  console.error('Unbekannt: ' + cli + '. Möglich: neue-codes <Anzahl>, export, testlauf [datei], beispiele, fahrplan, mobilithek, barrierefrei, haltestellen, parkplaetze, stadtdaten, frage, faq-orte, faq-ort, faq, hinweise, hinweis'); process.exit(1);
} else {
  loadFahrplan();
  setTimeout(fahrplanTick, 5000); setInterval(fahrplanTick, 3600e3);
  setTimeout(() => radTick().then(fussTick), 20000); setInterval(() => radTick().then(fussTick), 1800e3);
  setTimeout(bfTick, 10000); setInterval(bfTick, 900e3);
  setTimeout(faqTick, 5000); setInterval(faqTick, 3600e3);
  setTimeout(beispieleTick, 4000); setInterval(beispieleTick, 3600e3);
  setTimeout(hstTick, 3000); setInterval(hstTick, 3600e3);
  setTimeout(bppTick, 40000); setInterval(bppTick, 3600e3);
  setTimeout(lsaTick, 15000); setInterval(lsaTick, 3600e3);
  setTimeout(swcTick, 20000); setInterval(swcTick, 3600e3);
  setTimeout(dbaTick, 30000); setInterval(dbaTick, 60e3);
  setInterval(rtTick, 15e3);
  setInterval(nrwTick, 20e3);
  setTimeout(stadt2Tick, 25000); setInterval(stadt2Tick, 3600e3);
  server.listen(PORT, HOST, () => console.log(`Flowtown-Server auf ${HOST}:${PORT}, KI ${MISTRAL_KEY ? 'an (' + MISTRAL_MODEL + ')' : 'aus'}, Verkehrslage: Autobahn ${LAGE_ROADS.join('/')}${HERE_KEY ? ' + HERE' : ''}, Fahrplan: ${fahrplan ? fahrplan.stand : DELFI_URL ? 'wird geladen' : 'aus'}`));
}
