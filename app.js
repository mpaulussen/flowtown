/* Flowtown Prototyp: zeichnet Halte und Durchfahrten an Ampeln auf. Alle Daten bleiben im Browser. */
(function () {
  'use strict';

  const VERSION = '0.99.1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Schwellen je Verkehrsmittel: unter stopV gilt als stehend, über goV als fahrend (m/s)
  const MODES = {
    auto: { label: 'Auto',      stopV: 1.4,  goV: 2.5, haltRadius: 70, passRadius: 25, vRef: 13.9 },
    rad:  { label: 'Rad',       stopV: 0.9,  goV: 1.8, haltRadius: 40, passRadius: 20, vRef: 5.5 },
    bus:  { label: 'Bus',       stopV: 1.4,  goV: 2.5, haltRadius: 70, passRadius: 25, vRef: 13.9 },
    bahn: { label: 'Stadtbahn', stopV: 1.4,  goV: 2.5, haltRadius: 60, passRadius: 25, vRef: 13.9 },
    zug:  { label: 'Zug',       stopV: 1.4,  goV: 2.5, haltRadius: 0,  passRadius: 0,  vRef: 25 },   // ohne Straßenampeln: zählt Halte an Bahnhöfen und Verspätung
    fuss: { label: 'Zu Fuß',    stopV: 0.35, goV: 0.8, haltRadius: 30, passRadius: 18, vRef: 1.3 }
  };
  const STOP_CONFIRM_MS = 3000;   // so lange langsam, bis ein Halt zählt
  const GO_CONFIRM_MS = 2000;     // so lange schneller, bis der Halt endet
  const MIN_WAIT_MS = 3000;       // kürzere Halte werden ignoriert
  const MERGE_MS = 120000;        // Halte an derselben Ampel innerhalb dieser Zeit = ein Wartevorgang
  const QUEUE_M = 250;            // Rückstau: Halt bis zu diesem Abstand vor einer Ampel, durch die man danach fährt
  const QUEUE_MS = 120000;        // ... wenn die Durchfahrt höchstens so lange nach dem Halt kommt
  const MAX_ACCURACY = 50;        // ungenauere GPS-Punkte werden verworfen
  const CLUSTER_M = 40;           // Signalstandorte in diesem Abstand zueinander bilden eine Kreuzung
  const CLUSTER_MAX_M = 70;       // ... solange die Kreuzung nicht weiter ausgedehnt ist
  const JUNCTION_M = 50;          // zwei Ampeln direkt hintereinander, so nah beieinander: ein Kreuzungsbereich
  const JUNCTION_MS = 60000;      // ... wenn höchstens so viel Zeit dazwischen liegt
  const STOP_M = 60;              // Bus und Bahn: Halt so nah an einer Haltestelle ist ein Haltestellenhalt
  const GAP_MS = 15000;           // so lange ohne brauchbaren GPS-Punkt: Empfangslücke, z. B. im Tunnel
  const AREA_RADIUS = 5000;       // Umkreis für das Laden der Ampeln
  const TAGS = ['zu lange gewartet', 'Grün zu kurz', 'unübersichtlich', 'Anschluss verpasst', 'alles gut'];
  const ACC_TAGS = ['Grün zu kurz zum Queren', 'kein Tonsignal', 'Taster schlecht erreichbar', 'Bordstein zu hoch'];   // Profil barrierefrei
  // Eine Bezeichnung je Profil, gleich im Einstieg, in den Einstellungen, auf Heute und bei den Tipps
  const ACCESS_LABEL = { rollstuhl: 'Rollstuhl', rollator: 'Rollator oder Gehhilfe', sehen: 'Ich sehe schlecht oder nichts', hoeren: 'Ich höre schlecht oder nichts', lernen: 'Einfache Sprache', ruhe: 'Ruhe und Pausen', andere: 'Andere Einschränkung' };
  // Zu Fuß ist man einen Weg gegangen, nicht gefahren
  const DEFAULT_SERVER = 'https://songdeepdive.de/flowtown-api';
  const WORDS = {
    fahrt: { one: 'Fahrt', many: 'Fahrten', none: 'Noch keine Fahrt', start: 'Ohne Ziel aufzeichnen', end: 'Fahrt beenden', cont: 'Weiterfahren', time: 'Fahrzeit',
      past: 'gefahren', bilanz: 'Fahrtbilanz', last: 'Letzte Fahrt', review: 'Wie war deine Fahrt?', short: 'Die Fahrt war zu kurz und wurde nicht gespeichert.',
      hold: 'Handy in die Halterung, App geöffnet lassen. Der Bildschirm bleibt an.', during: 'Während der Fahrt nichts antippen. Bewertet wird erst danach.' },
    weg: { one: 'Weg', many: 'Wege', none: 'Noch kein Weg', start: 'Ohne Ziel aufzeichnen', end: 'Weg beenden', cont: 'Weitergehen', time: 'Gehzeit',
      past: 'gegangen', bilanz: 'Wegbilanz', last: 'Letzter Weg', review: 'Wie war dein Weg?', short: 'Der Weg war zu kurz und wurde nicht gespeichert.',
      hold: 'Handy in der Hand oder in der Tasche, App geöffnet lassen. Der Bildschirm bleibt an.', during: 'Unterwegs nichts antippen. Bewertet wird erst danach.' }
  };
  const words = (mode) => WORDS[mode === 'fuss' ? 'weg' : 'fahrt'];
  function applyModeWords(mode) {
    const w = words(mode);
    $('#btn-start-label').textContent = w.start;
    $('#hint-hold').textContent = w.hold;
    $('#hint-during').textContent = w.during;
    $('#btn-end-label').textContent = w.end;
    $('#btn-cont-label').textContent = w.cont;
    $('#lbl-drive-time').textContent = w.time;
  }
  const STEADY_MIN_V = 8.33;      // Gleichmäßigkeit zählt ab 30 km/h
  const STEADY_TOL = 1.39;        // ±5 km/h um das Mittel der letzten Minute
  const HARD_BRAKE = -3.0;        // starke Bremsung ab 3 m/s² Verzögerung
  const HARD_ACCEL = 2.5;         // starkes Beschleunigen ab 2,5 m/s²
  // Schätzwerte für die Kosten der Ampelhalte (offen angezeigt)
  const IDLE_L_PER_H = 0.8;       // Leerlauf Verbrenner, Liter je Stunde
  const RESTART_L = 0.02;         // Mehrverbrauch je Wiederanfahren auf etwa 50 km/h, Liter
  const IDLE_KWH_PER_H = 0.5;     // E-Auto im Stand (Heizung, Elektronik), kWh je Stunde
  const RESTART_KWH = 0.03;       // E-Auto je Wiederanfahren, kWh (mit Rückgewinnung)
  // Flow-Raster: Felder von etwa 150 × 150 m
  const CELL_LAT = 0.00135, CELL_LON = 0.0022;
  const WINDOWS = [
    { id: 'all', label: 'Alle Zeiten' },
    { id: 'wd-morning', label: 'Werktags 6–9 Uhr' },
    { id: 'wd-day', label: 'Werktags 9–16 Uhr' },
    { id: 'wd-evening', label: 'Werktags 16–19 Uhr' },
    { id: 'night', label: 'Abends und nachts (19–6 Uhr)' },
    { id: 'weekend', label: 'Wochenende 6–19 Uhr' }
  ];
  const OVERPASS = ['https://overpass-api.de/api/interpreter'];   // FOSSGIS e.V., Deutschland

  // ---------- Speicher ----------
  // Städte mit eigenem Fahrplan-Auszug auf dem Server (neben Bielefeld); Rahmen Süd, Nord, West, Ost wie auf dem Server
  const FP_STAEDTE = [{ id: 'moenchengladbach', name: 'Mönchengladbach', box: [51.10, 51.26, 6.30, 6.58] }, { id: 'paderborn', name: 'Paderborn', box: [51.68, 51.80, 8.66, 8.86] }];
  const FP_PREFIX = /^(Bielefeld|Mönchengladbach|Paderborn),\s*/;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ww.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ww.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  let trips = store.get('trips', []);
  let settings = Object.assign({ mode: 'auto', cut: 200, fuelPrice: 1.75, powerPrice: 0.35, access: { on: false, type: 'rollator' }, server: { url: DEFAULT_SERVER, wir: false, ki: false } }, store.get('settings', {}));
  if (!Array.isArray(settings.linien)) settings.linien = [];
  if (!Array.isArray(settings.haltestellen)) settings.haltestellen = [];   // Bus und Bahn: Haltestellen für die nächsten Abfahrten   // Bus und Bahn: eigene Linien für die Umleitungen von moBiel
  if (!settings.serverDefault) { if (!settings.server.url) settings.server.url = DEFAULT_SERVER; settings.serverDefault = true; }   // ab 0.21: Server ist voreingestellt
  let signalCache = store.get('signals', { areas: [], nodes: {} });
  // Haltestellen ab 0.9.0, Angaben zur Barrierefreiheit ab 0.10.0: Gebiete einmal neu laden
  // Haltestellennamen ab 0.12.0 (Umstiege)
  // ab 0.55: Fahrtrichtung je Ampel (Einbahn-Fahrbahn, traffic_signals:direction); Gebiete einmal neu laden
  if (!signalCache.stops || !signalCache.acc || signalCache.v !== 5) { signalCache.stops = signalCache.stops || {}; signalCache.acc = signalCache.acc || {}; signalCache.dir = signalCache.dir || {}; signalCache.areas = []; signalCache.v = 5; }
  if (!signalCache.dir) signalCache.dir = {};
  let names = store.get('names3', {});   // 'names3': Querstraßen ohne Bahnsteignamen (ab 0.9.0)
  const names2 = store.get('names2', {}); // mit Querstraße (0.6.0 bis 0.8.0)
  const oldNames = store.get('names', {}); // nur Straße (bis 0.5.0), als Übergang bis die neuen Namen da sind
  const nameOf = (id) => names[id] || names2[id] || oldNames[id] || null;
  let clusters = [];   // wird beim Start aus den gespeicherten Ampeln aufgebaut
  let alias = {};      // 'c' + Signalstandort -> Kreuzung, damit ältere Fahrten zur aktuellen Einteilung passen
  let clusterById = {};
  const saveTrips = () => {
    if (store.set('trips', trips)) return true;
    // Speicher voll (etwa nach einer langen Fahrt durch viele Städte): Ampeldaten weit weg verwerfen, die Fahrten sind wichtiger
    for (let k = 0; k < 4 && trimSignals(rec && rec.last); k++) {
      store.set('signals', signalCache);
      if (store.set('trips', trips)) { clusters = buildClusters(signalNodes()); return true; }
    }
    return false;
  };

  // ---------- Geometrie ----------
  const toR = Math.PI / 180;
  function dist(a, b) {
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(s));
  }
  function bearing(a, b) {
    const y = Math.sin((b.lon - a.lon) * toR) * Math.cos(b.lat * toR);
    const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lon - a.lon) * toR);
    return (Math.atan2(y, x) / toR + 360) % 360;
  }
  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const DIRS = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
  const dirName = (h) => (h == null ? '' : 'Richtung ' + DIRS[Math.round(h / 45) % 8]);
  const round5 = (x) => Math.round(x * 1e5) / 1e5;

  // ---------- Formatierung ----------
  function fmtDur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s >= 3600) return minText(Math.floor(s / 60));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  // Minuten bis 59 als „45 min“, ab einer Stunde als „5 h 24 min“
  function minText(m) {
    m = Math.max(0, Math.round(m));
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const fmtS = (ms) => Math.round(ms / 1000) + ' s';
  const fmtPct = (x) => Math.round(x * 100) + ' %';
  const fmtDate = (t) => new Date(t).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Symbole aus dem Sprite in index.html
  const ic = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const MODE_ICON = { auto: 'car', rad: 'bike', bus: 'bus', bahn: 'tram', zug: 'train', fuss: 'walk', oepnv: 'tram' };
  // Name einer Ampel oder eines Wegs zum Antippen: öffnet die kleine Karte
  const placeBtn = (label, lat, lon, kind) => `<button type="button" class="place" data-peek="${kind || 's'}" data-lat="${lat}" data-lon="${lon}" data-name="${esc(label)}">${esc(label)}</button>`;
  const placeFor = (e) => placeBtn(labelFor(e), e.lat, e.lon);
  const cardHead = (icon, title, meta, cls) => `<div class="card-head"><span class="chip${cls ? ' ' + cls : ''}">${ic(icon)}</span><div>${meta ? `<span class="meta">${meta}</span>` : ''}<h3>${title}</h3></div></div>`;

  // ---------- Ampeldaten aus OpenStreetMap ----------
  // Gierig wie bis 0.8.0: jeder Standort zur nächsten Gruppe in Reichweite
  function greedyGroups(pts) {
    const out = [];
    for (const p of pts) {
      let best = null, bd = Infinity;
      for (const g of out) { const d = dist(g.m, p); if (d < bd) { bd = d; best = g; } }
      if (best && bd <= 35) {
        best.pts.push(p); const n = best.pts.length;
        best.m.lat += (p.lat - best.m.lat) / n; best.m.lon += (p.lon - best.m.lon) / n;
      } else out.push({ m: { lat: p.lat, lon: p.lon }, pts: [p] });
    }
    return out.map((g) => g.pts);
  }
  // Tonsignal oder Vibration an einer Kreuzung: ja, sobald ein Signal es hat; nein nur, wenn es eingetragen ist
  function accFlag(part, k) {
    const vals = part.map((p) => (signalCache.acc[p.id] || {})[k]).filter(Boolean);
    return vals.some((v) => v !== 'no') ? 'yes' : vals.length ? 'no' : null;
  }
  // Ampelanlagen der Stadt Bielefeld (Open Data): ergänzen OpenStreetMap nur, wo dort im geladenen Gebiet keine Ampel steht;
  // sonst bekommt die Kreuzung die Nummer der Anlage. Kennungen 9e12 + gid, damit bestehende Kreuzungen ihre Kennung behalten.
  let lsaData = store.get('lsa', null);
  const LSA_ART = { kp: 'Ampel an einer Kreuzung', fu: 'Fußgängerampel', sw: 'Ampel der Stadtwerke (Stadtbahn)', eb: 'Ampel am Bahnübergang', so: 'Ampelanlage' };
  function signalNodes() {
    const nodes = signalCache.nodes;
    if (!lsaData || !Array.isArray(lsaData.anlagen) || !signalCache.areas.length) return nodes;
    const out = Object.assign({}, nodes), pts = Object.values(nodes);
    for (const a of lsaData.anlagen) {
      if (!a[5] || (a[3] !== 'kp' && a[3] !== 'fu')) continue;   // Signale der Stadtbahn, Bahnübergänge und Sondersignale sind keine Straßenampeln
      const p = { lat: a[0], lon: a[1] };
      if (!areaCovers(p) || pts.some((q) => Math.abs(q[0] - a[0]) < 0.001 && dist(p, { lat: q[0], lon: q[1] }) <= 80)) continue;
      out[String(9e12 + a[5])] = [a[0], a[1]];
    }
    return out;
  }
  async function loadLsa() {
    if (!apiBase() || (lsaData && Date.now() - lsaData.geladen < 7 * 864e5)) return false;
    try {
      const d = await api('/api/ampelanlagen');
      if (!d.anlagen || d.anlagen.length < 50) return false;
      lsaData = { geladen: Date.now(), anlagen: d.anlagen };
      store.set('lsa', lsaData);
      return true;
    } catch (e) { return false; }
  }
  const lsaLabel = (c) => (c && c.lsa ? `Anlage Nr. ${c.lsa[2]} · ${LSA_ART[c.lsa[3]] || 'Ampelanlage'}${c.lsa[4] === 'l' ? ' (Straßen.NRW)' : ''}` : '');
  function buildClusters(nodes) {
    const pts = Object.keys(nodes).sort((a, b) => Number(a) - Number(b)).map((id) => ({ id, lat: nodes[id][0], lon: nodes[id][1] }));
    // Verketten: Standorte bis CLUSTER_M zueinander gehören zusammen, auch über mehrere Ecken einer großen Kreuzung
    const parent = pts.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const gi = (p) => Math.floor(p.lat / 0.0004), gj = (p) => Math.floor(p.lon / 0.0006);   // Raster etwa 44 × 41 m
    const grid = {};
    pts.forEach((p, i) => { const k = gi(p) + '_' + gj(p); (grid[k] = grid[k] || []).push(i); });
    pts.forEach((p, i) => {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (const j of grid[(gi(p) + a) + '_' + (gj(p) + b)] || []) {
          if (j > i && dist(p, pts[j]) <= CLUSTER_M) parent[find(j)] = find(i);
        }
      }
    });
    const groups = {};
    pts.forEach((p, i) => { const r = find(i); (groups[r] = groups[r] || []).push(p); });
    const list = [];
    alias = {}; clusterById = {};
    for (const g of Object.values(groups)) {
      const m = { lat: g.reduce((x, p) => x + p.lat, 0) / g.length, lon: g.reduce((x, p) => x + p.lon, 0) / g.length };
      const parts = g.every((p) => dist(p, m) <= CLUSTER_MAX_M) ? [g] : greedyGroups(g);   // zu lange Ketten wieder aufteilen
      for (const part of parts) {
        const c = { id: 'c' + part[0].id, lat: part.reduce((x, p) => x + p.lat, 0) / part.length, lon: part.reduce((x, p) => x + p.lon, 0) / part.length, n: part.length,
          sound: accFlag(part, 's'), vib: accFlag(part, 'v'), btn: accFlag(part, 'b'), tact: accFlag(part, 't') };
        if (part.every((p) => signalCache.dir[p.id])) c.dirs = Array.from(new Set([].concat(...part.map((p) => signalCache.dir[p.id]))));
        list.push(c); clusterById[c.id] = c;
        for (const p of part) alias['c' + p.id] = c.id;
      }
    }
    // Nummer der Anlage der Stadt: die nächste bis 50 m. Zugehörigkeit (lsaG) bis 130 m: an Kreuzungen mit Stadtbahn-Haltestelle
    // trägt OpenStreetMap die Fußgängerampeln zu den Bahnsteigen einzeln ein, die Stadt zählt sie zur selben Anlage
    if (lsaData && lsaData.anlagen) for (const c of list) {
      let best = null, bd = 130;
      for (const a of lsaData.anlagen) { if (Math.abs(a[0] - c.lat) > 0.0013) continue; const d = dist(c, { lat: a[0], lon: a[1] }); if (d < bd) { bd = d; best = a; } }
      if (best && bd <= 50) c.lsa = best;
      if (best && best[5]) c.lsaG = best[5];
    }
    return list;
  }
  // Abstand zur nächsten Haltestelle (OpenStreetMap oder Fahrplan), höchstens bis r Meter, sonst Infinity
  function stopDist(p, r) {
    let best = Infinity;
    for (const id in signalCache.stops) {
      const [lat, lon] = signalCache.stops[id];
      if (Math.abs(lat - p.lat) < 0.001) { const d = dist({ lat, lon }, p); if (d <= r && d < best) best = d; }
    }
    if (typeof fp !== 'undefined' && fp) for (const i of fpStopsNear(p, r)) { const d = dist({ lat: fp.stops[i][2], lon: fp.stops[i][3] }, p); if (d < best) best = d; }
    return best;
  }
  function nearStop(p) {
    if (typeof fp !== 'undefined' && fp && fpStopsNear(p, STOP_M).length) return true;
    for (const id in signalCache.stops) {
      const [lat, lon] = signalCache.stops[id];
      if (Math.abs(lat - p.lat) < 0.001 && dist({ lat, lon }, p) <= STOP_M) return true;
    }
    return false;
  }
  // Name der nächsten Haltestelle, für Umstiege
  function stopName(p) {
    let best = null, bd = 250;
    for (const id in signalCache.stops) {
      const [lat, lon, name] = signalCache.stops[id];
      if (!name || Math.abs(lat - p.lat) > 0.003) continue;
      const d = dist({ lat, lon }, p);
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function areaCovers(p) {
    const now = Date.now();
    return signalCache.areas.some((a) => dist(a, p) < a.r - 1500 && now - a.fetched < 30 * 864e5);
  }
  async function fetchSignals(p) {
    const ar = `(around:${AREA_RADIUS},${p.lat},${p.lon})`;
    const q = `[out:json][timeout:25];(node${ar}[highway=traffic_signals];node${ar}[crossing=traffic_signals];)->.s;.s out;(node${ar}[railway=tram_stop];node${ar}[public_transport=stop_position];node${ar}[highway=bus_stop];);out;way(bn.s)[highway];out body geom;`;
    let lastErr;
    for (const url of OVERPASS) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        // Overpass meldet Überlast oft mit „OK“ und leerer oder halber Liste, nur mit Hinweis: dann nicht als geladen merken
        if (json.remark && /error|timeout|memory|abort/i.test(json.remark)) throw new Error('Overpass: ' + json.remark);
        let n = 0;
        // Fahrtrichtung: an einer Einbahn-Fahrbahn (getrennte Fahrbahnen) oder mit traffic_signals:direction gilt die Ampel nur in eine Richtung
        const sigTags = {}, dirs = {};
        for (const el of json.elements || []) if (el.type === 'node' && el.tags && (el.tags.highway === 'traffic_signals' || el.tags.crossing === 'traffic_signals')) sigTags[el.id] = el.tags;
        for (const w of json.elements || []) {
          if (w.type !== 'way' || !Array.isArray(w.nodes) || !Array.isArray(w.geometry)) continue;
          const wt = w.tags || {}, ow = /^(yes|true|1)$/.test(wt.oneway || '') || wt.junction === 'roundabout' || wt.highway === 'motorway' ? 1 : wt.oneway === '-1' ? -1 : 0;
          w.nodes.forEach((id, i) => {
            if (!sigTags[id]) return;
            const a = w.geometry[Math.max(0, i - 1)], b = w.geometry[Math.min(w.geometry.length - 1, i + 1)];
            if (!a || !b || (a.lat === b.lat && a.lon === b.lon)) return;
            const h = bearing({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });
            const td = sigTags[id]['traffic_signals:direction'] || sigTags[id].direction || '';
            const one = td === 'forward' ? 1 : td === 'backward' ? -1 : ow;
            const list = dirs[id] || (dirs[id] = []);
            list.push(one === 1 ? Math.round(h) : one === -1 ? Math.round((h + 180) % 360) : null);
          });
        }
        for (const el of json.elements || []) {
          if (el.type !== 'node') continue;
          const tg = el.tags || {};
          if (tg.highway === 'traffic_signals' || tg.crossing === 'traffic_signals') {
            signalCache.nodes[el.id] = [round5(el.lat), round5(el.lon)]; n++;
            const a = {};
            if (tg['traffic_signals:sound']) a.s = tg['traffic_signals:sound'];
            if (tg['traffic_signals:vibration']) a.v = tg['traffic_signals:vibration'];
            if (tg.button_operated) a.b = tg.button_operated;
            if (tg.tactile_paving) a.t = tg.tactile_paving;
            if (Object.keys(a).length) signalCache.acc[el.id] = a; else delete signalCache.acc[el.id];
            const dl = dirs[el.id];
            if (dl && dl.length && !dl.includes(null)) signalCache.dir[el.id] = Array.from(new Set(dl)); else delete signalCache.dir[el.id];
          }
          else signalCache.stops[el.id] = tg.name ? [round5(el.lat), round5(el.lon), tg.name] : [round5(el.lat), round5(el.lon)];
        }
        signalCache.areas = signalCache.areas.filter((a) => dist(a, p) > 1000);
        // ohne eine einzige Ampel (auf dem Land möglich, oder ein Aussetzer): nur einen Tag als geladen merken
        signalCache.areas.push({ lat: round5(p.lat), lon: round5(p.lon), r: AREA_RADIUS, fetched: Date.now() - (n ? 0 : 29 * 864e5) });
        saveSignals(p);
        clusters = buildClusters(signalNodes());
        updateSignalsInfo();
        // Halte aus Fahrten, bei denen die Ampeldaten fehlten, jetzt zuordnen
        if (!rec && trips.map((t) => tidyTrip(t)).some(Boolean)) saveTrips();
        return n;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Ampeldaten nicht erreichbar');
  }
  // Speicher voll: die Hälfte der Ampel-Gebiete, die am weitesten vom Standort liegen, samt ihren Punkten verwerfen
  function trimSignals(p) {
    const areas = signalCache.areas.slice();
    if (areas.length < 2) return false;
    const ref = p && isFinite(p.lat) ? p : areas[areas.length - 1];
    areas.sort((a, b) => dist(a, ref) - dist(b, ref));
    const keep = areas.slice(0, Math.ceil(areas.length / 2));
    const inKeep = (v) => keep.some((a) => Math.abs(a.lat - v[0]) < 0.07 && dist(a, { lat: v[0], lon: v[1] }) <= a.r + 300);
    for (const k of ['nodes', 'stops']) for (const id in signalCache[k]) if (!inKeep(signalCache[k][id])) { delete signalCache[k][id]; delete signalCache.acc[id]; delete signalCache.dir[id]; }
    signalCache.areas = keep;
    return true;
  }
  function saveSignals(p) {
    for (let k = 0; k < 4; k++) { if (store.set('signals', signalCache)) return true; if (!trimSignals(p)) break; }
    return false;
  }
  function updateSignalsInfo() {
    const n = clusters.length;
    $('#signals-info').textContent = n
      ? `${n} Ampel-Kreuzungen gespeichert (${Object.keys(signalCache.nodes).length} Signalstandorte, ${Object.keys(signalCache.stops).length} Haltestellenpunkte, ${signalCache.areas.length} Gebiet${signalCache.areas.length === 1 ? '' : 'e'})${lsaData ? `. ${clusters.filter((c) => c.lsa).length} mit Nummer der Anlage, ${clusters.filter((c) => c.id.startsWith('c9')).length} nur aus der Ampelliste der Stadt` : ''}.`
      : 'Noch keine Ampeln geladen. Das passiert automatisch beim ersten Fahrtstart.';
  }

  // Straßennamen für Kreuzungen, nacheinander und gedrosselt (Nominatim erlaubt 1 Anfrage pro Sekunde)
  const nameQueue = [];
  let nameBusy = false;
  // Ampel ohne Querstraße (oft Fußgängerampel): mit der nächsten benannten Kreuzung derselben Straße unterscheidbar machen
  const SIDE = ['nördlich', 'nordöstlich', 'östlich', 'südöstlich', 'südlich', 'südwestlich', 'westlich', 'nordwestlich'];
  const refMemo = {};
  function withLandmark(e, base) {
    if (base.indexOf(' / ') > 0 || /\d/.test(base)) return base;
    const key = e.signal + '|' + Object.keys(names).length + '|' + trips.length;
    if (!(key in refMemo)) {
      let best = null, bd = 2000;
      const seen = {};
      for (const tr of trips) for (const x of tr.events) {
        if (!x.signal || x.signal === e.signal || seen[x.signal]) continue;
        seen[x.signal] = true;
        const n = nameOf(x.signal);
        if (!n || n.split(' / ').indexOf(base) < 0 || n.indexOf(' / ') < 0) continue;
        const d = dist(e, x);
        if (d < bd) { bd = d; best = { n, x, d }; }
      }
      refMemo[key] = null;
      if (best) {
        const other = best.n.split(' / ').find((p) => p !== base);
        const far = best.d < 1000 ? `${Math.max(10, Math.round(best.d / 10) * 10)} m` : `${fmtNum(best.d / 1000, 1)} km`;
        refMemo[key] = `${base}, ${far} ${SIDE[Math.round(bearing(best.x, e) / 45) % 8]} von ${other}`;
      }
    }
    return refMemo[key] || base;
  }
  function labelFor(e) {
    if (nameOf(e.signal)) return withLandmark(e, nameOf(e.signal));
    if (e.signal && e.signal.startsWith('demo')) return 'Demo-Ampel ' + e.signal.slice(4);
    return `Ampel bei ${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}`;
  }
  function requestNames(events, onDone) {
    for (const e of events) {
      if (!e.signal || names[e.signal] || e.signal.startsWith('demo')) continue;
      if (!nameQueue.some((q) => q.signal === e.signal)) nameQueue.push({ signal: e.signal, lat: e.lat, lon: e.lon });
    }
    if (!nameBusy && nameQueue.length) runNames(onDone);
  }
  function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(timer));
  }
  // Abstand eines Punkts zu einer Linie aus OpenStreetMap, in Metern (lokal eben gerechnet)
  function distToWay(p, geom) {
    const kx = 111320 * Math.cos(p.lat * toR), ky = 110540;
    let best = Infinity;
    for (let i = 0; i < geom.length - 1; i++) {
      const ax = (geom[i].lon - p.lon) * kx, ay = (geom[i].lat - p.lat) * ky;
      const bx = (geom[i + 1].lon - p.lon) * kx, by = (geom[i + 1].lat - p.lat) * ky;
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const u = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(ax + u * dx, ay + u * dy));
    }
    return best;
  }
  // ---------- Radwege aus OpenStreetMap ----------
  // Kacheln von 0,03° (etwa 3,3 × 2 km): nur diese Rechtecke gehen an die Overpass-API, nie eine Route oder ein Standort
  const RAD_TILE = 0.03;
  const RAD_CLS = {
    gut: { col: '#17784f', label: 'eigener Radweg oder Fahrradstraße', kurz: 'Radweg' },
    ruhig: { col: '#7cc49a', label: 'ruhige Straße oder Weg', kurz: 'ruhig' },
    mittel: { col: '#e0a326', label: 'Radstreifen oder Tempo 30', kurz: 'Radstreifen' },
    schlecht: { col: '#d64933', label: 'Hauptstraße ohne Radweg', kurz: 'ohne Radweg' }
  };
  const RAD_RANK = { gut: 0, ruhig: 1, mittel: 2, schlecht: 3 };
  const radTiles = {};       // Schlüssel -> { t, ways: [{ c, n, v, g: [[lat, lon], …] }] }
  const radLoading = {};
  let radNoServer = false;
  (() => { try { localStorage.removeItem('ww.radnetz'); Object.assign(radTiles, JSON.parse(localStorage.getItem('ww.radnetz3') || '{}')); } catch (e) { /* ohne Speicher */ } })();
  function radSave() {
    // höchstens vier Kacheln auf dem Handy behalten, die jüngsten zuerst,
    const keys = Object.keys(radTiles).sort((a, b) => radTiles[b].t - radTiles[a].t);
    // höchstens 1,5 MB, damit für die Fahrten immer Platz bleibt
    for (let n = Math.min(4, keys.length); n >= 0; n--) {
      const keep = {};
      keys.slice(0, n).forEach((k) => { keep[k] = radTiles[k]; });
      const str = JSON.stringify(keep);
      if (str.length > 1.5e6 && n > 0) continue;
      try { localStorage.setItem('ww.radnetz3', str); return; } catch (e) { /* zu groß: eine Kachel weniger */ }
    }
  }
  const speedOf = (v) => {
    if (!v) return null;
    if (/zone:?30|^30/.test(v)) return 30;
    if (/urban/.test(v)) return 50;
    if (/rural/.test(v)) return 100;
    if (v === 'walk') return 7;
    const n = parseInt(v, 10);
    return isFinite(n) ? n : null;
  };
  // Einstufung einer Straße oder eines Wegs für das Rad
  function radClass(t) {
    const hw = t.highway;
    if (t.bicycle === 'no' || t.bicycle === 'dismount') return null;
    if (t.bicycle_road === 'yes' || t.cyclestreet === 'yes' || hw === 'cycleway') return 'gut';
    if (/^(path|footway|track|pedestrian|service|bridleway)$/.test(hw)) return t.bicycle === 'designated' ? 'gut' : 'ruhig';
    const cw = ['cycleway', 'cycleway:both', 'cycleway:right', 'cycleway:left'].map((k) => t[k] || '').join(' ');
    if (/track|separate/.test(cw) || t.bicycle === 'use_sidepath' || /designated/.test(t['sidewalk:both:bicycle'] || t['sidewalk:right:bicycle'] || t['sidewalk:left:bicycle'] || '')) return 'gut';
    const v = speedOf(t.maxspeed);
    if (/lane|share_busway|opposite_lane/.test(cw)) return 'mittel';
    if (hw === 'living_street') return 'ruhig';
    if (/^(residential|unclassified)$/.test(hw)) return v != null && v >= 50 ? (hw === 'residential' ? 'mittel' : 'schlecht') : 'ruhig';
    // Hauptstraßen: ohne Radweg nur bei Tempo 30 noch gelb
    return v != null && v <= 30 ? 'mittel' : 'schlecht';
  }
  const radKey = (lat, lon) => `${Math.floor(lat / RAD_TILE)}_${Math.floor(lon / RAD_TILE)}`;
  async function radTile(key) {
    const old = radTiles[key];
    if (old && Date.now() - old.t < 30 * 864e5) return old;
    if (radLoading[key]) return radLoading[key];
    const [a, b] = key.split('_').map(Number);
    const bb = `${(a * RAD_TILE).toFixed(3)},${(b * RAD_TILE).toFixed(3)},${((a + 1) * RAD_TILE).toFixed(3)},${((b + 1) * RAD_TILE).toFixed(3)}`;
    const q = `[out:json][timeout:25];(way[highway~"^(cycleway|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|trunk|trunk_link)$"](${bb});way[highway~"^(path|footway|track|pedestrian|service|bridleway)$"][bicycle~"^(designated|yes)$"](${bb});way[bicycle_road=yes](${bb}););out tags geom;`;
    radLoading[key] = (async () => {
      // zuerst vom Flowtown-Server: fertig eingestuft, gepackt und meist sofort da
      if (apiBase() && !radNoServer) {
        try {
          const res = await fetchWithTimeout(apiBase() + '/api/radnetz?k=' + key, {}, 60000);
          if (res.status === 404) radNoServer = true;   // älterer Server ohne Radwege: direkt bei Overpass
          else if (res.ok) {
            const j = await res.json();
            radTiles[key] = { t: Date.now(), ways: j.ways || [] };
            radSave();
            return radTiles[key];
          }
        } catch (e) { /* weiter mit Overpass */ }
      }
      let lastErr;
      // ausgelastet (429, 504) oder abgebrochen: kurz warten und bis zu zweimal neu versuchen
      for (let attempt = 0; attempt < 3; attempt++) for (const url of OVERPASS) {
        if (attempt) await new Promise((r) => setTimeout(r, attempt * 4000));
        try {
          const res = await fetchWithTimeout(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 45000);
          if (!res.ok) throw new Error(res.status === 429 ? 'Dienst ausgelastet' : res.status === 504 ? 'Dienst überlastet' : 'HTTP ' + res.status);
          const json = await res.json();
          if (json.remark && /error|timeout|memory|abort/i.test(json.remark)) throw new Error('Overpass: ' + json.remark);
          const ways = [];
          for (const w of json.elements || []) {
            if (w.type !== 'way' || !w.geometry || w.geometry.length < 2) continue;
            const c = radClass(w.tags || {});
            if (!c) continue;
            ways.push({ c, n: (w.tags.name || w.tags.ref || '').slice(0, 60), v: speedOf(w.tags.maxspeed), g: w.geometry.map((p) => [round5(p.lat), round5(p.lon)]) });
          }
          radTiles[key] = { t: Date.now(), ways };
          radSave();
          return radTiles[key];
        } catch (e) { lastErr = e.name === 'AbortError' ? new Error('Zeitüberschreitung') : /Failed to fetch|NetworkError|Load failed/.test(e.message) ? new Error('keine Verbindung') : e; }
      }
      throw lastErr || new Error('Radwege nicht erreichbar');
    })();
    try { return await radLoading[key]; } finally { delete radLoading[key]; }
  }
  // Raster für die Suche nach dem nächsten Weg: Zellen von etwa 100 m
  const RAD_CELL = 0.001;
  function radIndex(tile) {
    if (tile.idx) return tile.idx;
    const idx = new Map();
    tile.ways.forEach((w, wi) => {
      for (let i = 0; i < w.g.length - 1; i++) {
        const [la1, lo1] = w.g[i], [la2, lo2] = w.g[i + 1];
        for (let la = Math.floor(Math.min(la1, la2) / RAD_CELL); la <= Math.floor(Math.max(la1, la2) / RAD_CELL); la++)
          for (let lo = Math.floor(Math.min(lo1, lo2) / RAD_CELL); lo <= Math.floor(Math.max(lo1, lo2) / RAD_CELL); lo++) {
            const k = la + '_' + lo;
            if (!idx.has(k)) idx.set(k, []);
            idx.get(k).push(wi, i);
          }
      }
    });
    Object.defineProperty(tile, 'idx', { value: idx, enumerable: false });
    return idx;
  }
  const radBearing = (a, b) => (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * toR), b[0] - a[0]) / toR + 360) % 360;
  // Bewertung einer Radroute: welcher Anteil auf welcher Art Weg, und die längsten Stücke ohne Radweg
  async function radRate(pts) {
    if (!pts || pts.length < 2) return null;
    // Punkte etwa alle 15 m
    const s = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = dist({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
      const n = Math.max(1, Math.round(d / 15));
      for (let k = 0; k < n; k++) s.push({ p: [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], m: d / n, h: radBearing(a, b) });
    }
    const keys = [...new Set(s.map((x) => radKey(x.p[0], x.p[1])))];
    if (keys.length > 12) keys.length = 12;   // lange Strecken: nur die ersten Kacheln, der Rest bleibt „unbekannt“
    const tiles = {};
    for (const k of keys) tiles[k] = await radTile(k);
    const m = { gut: 0, ruhig: 0, mittel: 0, schlecht: 0, unbekannt: 0 };
    const runs = [];
    let run = null;
    for (const x of s) {
      const tile = tiles[radKey(x.p[0], x.p[1])];
      let best = null;
      if (tile) {
        const idx = radIndex(tile);
        const cla = Math.floor(x.p[0] / RAD_CELL), clo = Math.floor(x.p[1] / RAD_CELL);
        const P = { lat: x.p[0], lon: x.p[1] };
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const list = idx.get((cla + a) + '_' + (clo + b));
          if (!list) continue;
          for (let j = 0; j < list.length; j += 2) {
            const w = tile.ways[list[j]], i = list[j + 1];
            const geom = [{ lat: w.g[i][0], lon: w.g[i][1] }, { lat: w.g[i + 1][0], lon: w.g[i + 1][1] }];
            const d = distToWay(P, geom);
            if (d > 18) continue;
            let ad = Math.abs(radBearing(w.g[i], w.g[i + 1]) - x.h) % 180;
            ad = Math.min(ad, 180 - ad);
            if (ad > 35) continue;   // querende Wege zählen nicht
            if (!best || RAD_RANK[w.c] < RAD_RANK[best.w.c] || (w.c === best.w.c && d < best.d)) best = { w, d };
          }
        }
      }
      const c = best ? best.w.c : 'unbekannt';
      m[c] += x.m;
      if (c === 'schlecht') {
        const name = best.w.n || 'Straße ohne Namen';
        if (run && run.name === name) { run.m += x.m; run.pts.push(x.p); }
        else { run = { name, m: x.m, pts: [x.p] }; runs.push(run); }
      } else if (c !== 'unbekannt') run = null;
    }
    const total = Object.values(m).reduce((a, b) => a + b, 0) || 1;
    return { m, total, ohne: runs.filter((r) => r.m >= 120).sort((a, b) => b.m - a.m) };
  }
  // Namen für mehrere Kreuzungen mit einer einzigen Abfrage: die nächste Straße zuerst, dann die Querstraße
  async function crossingNames(list) {
    // Bahnsteige und Haltestellen tragen oft den Haltestellennamen, sind aber keine Querstraße
    const parts = list.map((q) => `way(around:35,${q.lat},${q.lon})[highway][name][highway!~"^(platform|bus_stop)$"];`).join('');
    const query = `[out:json][timeout:25];(${parts});out tags geom;`;
    for (const url of OVERPASS) {
      try {
        const res = await fetchWithTimeout(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 30000);
        if (!res.ok) continue;
        const ways = ((await res.json()).elements || []).filter((w) => w.tags && w.tags.name && w.geometry && w.geometry.length > 1);
        const out = {};
        for (const q of list) {
          const near = {};
          for (const w of ways) {
            const d = distToWay(q, w.geometry);
            if (d <= 35 && (near[w.tags.name] == null || d < near[w.tags.name])) near[w.tags.name] = d;
          }
          const sorted = Object.keys(near).sort((a, b) => near[a] - near[b]);
          out[q.signal] = sorted.length >= 2 ? sorted[0] + ' / ' + sorted[1] : (sorted[0] || null);
        }
        return out;
      } catch (e) { /* nächsten Server versuchen */ }
    }
    return null;
  }
  async function streetWithNumber(q) {
    try {
      const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=de&lat=${q.lat}&lon=${q.lon}`, {}, 15000);
      if (!res.ok) return null;
      const a = (await res.json()).address || {};
      const road = a.road || a.pedestrian || a.footway;
      return road ? (a.house_number ? `${road} ${a.house_number}` : road) : null;
    } catch (e) { return null; }
  }
  async function runNames(onDone) {
    nameBusy = true;
    try {
      while (nameQueue.length) {
        const batch = nameQueue.splice(0, 25);
        const found = (await crossingNames(batch)) || {};
        for (const q of batch) if (found[q.signal] && found[q.signal].indexOf(' / ') > 0) names[q.signal] = found[q.signal];
        store.set('names3', names);
        if (onDone) onDone();
        // ohne Querstraße (z. B. Fußgängerampel): Straße mit Hausnummer, höchstens eine Anfrage pro Sekunde
        for (const q of batch) {
          if (names[q.signal]) continue;
          await new Promise((r) => setTimeout(r, 1100));
          const n = (await streetWithNumber(q)) || found[q.signal];
          if (n) { names[q.signal] = n; store.set('names3', names); if (onDone) onDone(); }
        }
      }
    } finally {
      nameBusy = false;
    }
  }

  // ---------- Aufzeichnung ----------
  let rec = null;          // laufende Fahrt
  let wakeLock = null;
  let tick = null;

  function newRecording(mode, extraClusters, demo) {
    return {
      trip: { id: 't' + Date.now().toString(36), mode, start: null, end: null, distance: 0, events: [], gaps: [], demo: !!demo },
      cfg: MODES[mode],
      curMode: mode,        // wechselt beim Umsteigen
      transfer: null,       // laufender Umstieg
      legStart: null,
      extra: extraClusters || [],
      samples: [],          // letzte Positionen {lat, lon, t, v}
      first: null, last: null,
      slowSince: null, fastSince: null,
      stop: null,           // laufender Halt
      recentPass: {},       // Kreuzung -> Zeit der letzten Durchfahrt
      lastHaltAt: {},       // Kreuzung -> Endzeit des letzten Halts
      lastFetchAt: 0,
      cells: {},            // Flow-Raster: Feld|Zeitfenster -> Zeit, Stillstand, Tempo-Anteil
      st: { moving: 0, steady: 0, steadyBase: 0, brakes: 0, accels: 0, win: [], lastVs: null, lastBrake: 0, lastAccel: 0 },
      gpsCount: 0,
      lastFixAt: 0,         // Gerätezeit des letzten brauchbaren GPS-Punkts
      startedAt: Date.now()
    };
  }
  const allClusters = () => (rec && rec.extra.length ? clusters.concat(rec.extra) : clusters);

  function currentHeading(p) {
    // Richtung aus einem Punkt mindestens 15 m zurück
    for (let i = rec.samples.length - 1; i >= 0; i--) {
      const s = rec.samples[i];
      if (dist(s, p) >= 15) return bearing(s, p);
    }
    return null;
  }

  const forMe = (c, heading, mode) => !c.dirs || heading == null || mode === 'fuss' || c.dirs.some((h) => angDiff(h, heading) <= 50);
  function findSignal(p, heading, radius, mode) {
    let best = null, bestScore = Infinity;
    for (const c of allClusters()) {
      const d = dist(c, p);
      if (d > radius || !forMe(c, heading, mode)) continue;
      let score = d;
      if (heading != null && d > 15) {
        const diff = angDiff(bearing(p, c), heading);
        if (diff > 100) continue;          // liegt hinter uns
        score += diff * 0.3;
      }
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  function onPosition(pos) {
    if (!rec) return;
    const c = pos.coords;
    rec.gpsCount++;
    $('#drive-gps').textContent = `GPS: ±${Math.round(c.accuracy)} m`;
    if (c.accuracy > MAX_ACCURACY) { setDriveState('GPS zu ungenau …', ''); return; }
    const t = pos.timestamp;
    const p = { lat: c.latitude, lon: c.longitude, t };
    const prev = rec.samples[rec.samples.length - 1];
    if (prev && t <= prev.t) return;
    rec.lastFixAt = Date.now();
    if (!rec.trip.start) { rec.trip.start = t; rec.first = { lat: p.lat, lon: p.lon }; maybeFetchSignals(p, true); }

    // Empfangslücke (Tunnel, Unterführung): ein laufender Halt endet mit dem letzten Punkt davor, die Strecke wird überbrückt
    if (prev && t - prev.t > GAP_MS) {
      const d = dist(prev, p);
      if (rec.stop && d > 25) endStop(prev.t);
      if (d > 100) {
        rec.trip.gaps.push({ t: prev.t, tEnd: t, d: Math.round(d) });
        rec.samples = []; rec.slowSince = null;
      }
    }
    const hasSpeed = c.speed != null && c.speed >= 0;
    let v = hasSpeed ? c.speed : null;
    if (prev) {
      const d = dist(prev, p);
      // im Stand springende Punkte zählen nicht als Strecke
      if (!(hasSpeed && v < rec.cfg.stopV && d < Math.max(15, c.accuracy))) rec.trip.distance += d;
      if (v == null) v = d / ((t - prev.t) / 1000);
    }
    if (v == null) v = 0;
    // geglättet über die letzten drei Werte
    const recentV = rec.samples.slice(-2).map((s) => s.v).concat(v).sort((a, b) => a - b);
    const vs = recentV[Math.floor(recentV.length / 2)];
    p.v = v;
    if (prev) { updateDrivingStats(vs, t, (t - prev.t) / 1000); updateCells(p, vs, t, (t - prev.t) / 1000, dist(prev, p)); }
    rec.st.lastVs = vs;
    const heading = currentHeading(p);
    rec.samples.push(p);
    if (rec.samples.length > 40) rec.samples.shift();
    rec.last = { lat: p.lat, lon: p.lon };
    $('#drive-speed').textContent = Math.round(vs * 3.6);
    if (heading != null && vs > rec.cfg.goV) $('#drive-dir').textContent = dirName(heading);

    const cfg = rec.cfg;
    if (!rec.stop) {
      if (vs < cfg.stopV) {
        if (rec.slowSince == null) rec.slowSince = { t, lat: p.lat, lon: p.lon, heading };
        if (t - rec.slowSince.t >= STOP_CONFIRM_MS) {
          const s = rec.slowSince;
          // Bus und Bahn: die Haltestelle geht vor. Beim Umsteigen zu Fuß geht die Fußgängerampel vor.
          // Zug: keine Straßenampeln, Bahnhöfe sind lang (Fahrplan-Halte bis 250 m)
          const train = rec.curMode === 'zug';
          const near = train ? null : findSignal(s, s.heading, cfg.haltRadius, rec.transfer ? 'fuss' : rec.curMode);
          // zu Fuß (auch beim Umsteigen): am Bahnsteig warten, wenn die Haltestelle näher ist als die Ampel
          const onFoot = rec.transfer || rec.curMode === 'fuss';
          const footStop = onFoot && stopDist(s, 30) < (near ? dist(s, near) : Infinity);
          const atStop = onFoot ? footStop : train ? nearStop(s) || fpStopsNear(s, 250, 2).length > 0 : isTransit(rec.curMode) && nearStop(s);
          // Stehen vor dem Losfahren (Anschnallen, GPS sucht noch) ist kein Warten an einer Ampel:
          // ohne Fahrtrichtung ließe sich auch nicht sagen, welche Ampel „voraus“ liegt. Warten an der Haltestelle zählt.
          const pre = !rec.moved && !atStop;
          const sig = atStop || pre ? null : near;
          // keine Ampel in der Nähe, aber eine voraus: vermutlich Stau davor (endgültig zugeordnet wird am Ende der Fahrt)
          const queueSig = !sig && !atStop && !train && !pre && s.heading != null ? findSignal(s, s.heading, QUEUE_M, rec.transfer ? 'fuss' : rec.curMode) : null;
          rec.stop = { t0: s.t, lat: s.lat, lon: s.lon, heading: s.heading, signal: sig, atStop, queueSig, pre };
          rec.fastSince = null;
        }
      } else {
        rec.slowSince = null;
        if (!rec.moved && rec.first && dist(rec.first, p) > 40) rec.moved = true;
        checkPass(p, heading, t);
      }
    } else {
      // In Bus und Bahn springt der GPS-Punkt im Stand oft um 20 bis 40 m: das ist noch kein Losfahren.
      // Meldet das Handy ein Tempo, zählt das Tempo; der Abstand nur, wenn es keins meldet.
      const moved = dist(rec.stop, p), moveLim = Math.max(25, Math.min(60, c.accuracy * 1.2));
      const jumped = !hasSpeed && moved > moveLim;
      if (vs > cfg.goV || jumped) {
        if (rec.fastSince == null) rec.fastSince = t;
        if (t - rec.fastSince >= GO_CONFIRM_MS || jumped) endStop(rec.fastSince);
      } else {
        rec.fastSince = null;
      }
    }
    if (rec.transfer) {
      setDriveState(`Zu Fuß · ${fmtDur(t - rec.transfer.t)}`, 'transfer');
    } else if (rec.stop) {
      const label = rec.stop.pre ? 'Bereit, noch nicht losgefahren' : rec.stop.signal ? 'Halt an Ampel' : rec.stop.queueSig ? 'Stau vor Ampel' : rec.stop.atStop ? (rec.transfer || rec.curMode === 'fuss' ? 'Warten an der Haltestelle' : 'Halt an Haltestelle') : 'Halt';
      setDriveState(`${label} · ${fmtDur(t - rec.stop.t0)}`, 'halt');
    } else {
      setDriveState(vs < cfg.stopV ? 'Langsam …' : 'Unterwegs', 'moving');
    }
    if (rec.samples.length >= 3) detectLeg(p, vs, t);
    voiceAhead(p, t);
    navUpdate(p, t, c.accuracy, heading);
    lineOnFix(p, t);
    if (fpWrong() && !fpLoading && (rec.st.lastVs || 0) < 22) loadFahrplan().catch(() => {});   // in einer anderen Stadt angekommen
    maybeFetchSignals(p, false);
    updateCounters();
  }

  // Fahrstil für die Fahrtbilanz: Fahrzeit in Bewegung, Gleichmäßigkeit, starke Manöver
  const cellKey = (lat, lon) => Math.floor(lat / CELL_LAT) + '_' + Math.floor(lon / CELL_LON);
  function cellCenter(key) {
    const [i, j] = key.split('_').map(Number);
    return { lat: (i + 0.5) * CELL_LAT, lon: (j + 0.5) * CELL_LON };
  }
  function cellBounds(key) {
    const [i, j] = key.split('_').map(Number);
    return [[i * CELL_LAT, j * CELL_LON], [(i + 1) * CELL_LAT, (j + 1) * CELL_LON]];
  }
  function timeWindow(t) {
    const d = new Date(t), h = d.getHours(), wd = d.getDay() >= 1 && d.getDay() <= 5;
    if (h >= 19 || h < 6) return 'night';
    if (!wd) return 'weekend';
    if (h < 9) return 'wd-morning';
    if (h < 16) return 'wd-day';
    return 'wd-evening';
  }
  // Pro Feld nur Summen speichern, nicht den Weg selbst
  function updateCells(p, vs, t, dt, d) {
    if (!(dt > 0 && dt <= 5)) return;
    const k = cellKey(p.lat, p.lon) + '|' + timeWindow(t);
    const c = rec.cells[k] || (rec.cells[k] = { t: 0, s: 0, r: 0, d: 0 });
    c.t += dt; c.d += d;
    if (vs < rec.cfg.stopV) c.s += dt;
    c.r += dt * Math.min(1, vs / rec.cfg.vRef);
  }

  function updateDrivingStats(vs, t, dt) {
    const st = rec.st;
    if (!(dt > 0 && dt <= 5)) { st.win = []; return; }   // Lücken (App im Hintergrund) nicht werten
    if (vs > rec.cfg.goV) st.moving += dt * 1000;
    st.win.push({ t, v: vs });
    while (st.win.length && t - st.win[0].t > 60000) st.win.shift();
    if (vs > STEADY_MIN_V && st.win.length >= 10) {
      const mean = st.win.reduce((a, w) => a + w.v, 0) / st.win.length;
      st.steadyBase += dt * 1000;
      if (Math.abs(vs - mean) <= STEADY_TOL) st.steady += dt * 1000;
    }
    if (st.lastVs != null) {
      const acc = (vs - st.lastVs) / dt;
      if (acc < HARD_BRAKE && t - st.lastBrake > 5000) { st.brakes++; st.lastBrake = t; }
      if (acc > HARD_ACCEL && t - st.lastAccel > 5000) { st.accels++; st.lastAccel = t; }
    }
  }

  function checkPass(p, heading, t) {
    const cfg = rec.cfg;
    if (rec.curMode === 'zug') return;
    const mode = rec.transfer ? 'fuss' : rec.curMode;
    for (const c of allClusters()) {
      if (dist(c, p) > cfg.passRadius || !forMe(c, heading, mode)) continue;
      if (rec.recentPass[c.id] && t - rec.recentPass[c.id] < 90000) continue;
      if (rec.lastHaltAt[c.id] && t - rec.lastHaltAt[c.id] < 180000) continue;
      rec.recentPass[c.id] = t;
      rec.trip.events.push({ type: 'pass', signal: c.id, lat: round5(c.lat), lon: round5(c.lon), t, heading: heading == null ? null : Math.round(heading), mode: rec.curMode });
    }
  }

  function endStop(tEnd) {
    const s = rec.stop;
    rec.stop = null; rec.slowSince = null; rec.fastSince = null;
    if (s.pre) { rec.moved = true; return; }   // Stehen vor dem Losfahren zählt nicht
    const wait = tEnd - s.t0;
    if (wait < MIN_WAIT_MS) return;
    if (s.atStop && rec.transfer) return;   // Warten am Bahnsteig steckt schon in der Umstiegszeit
    const sigId = s.signal ? s.signal.id : null;
    const ev = rec.trip.events;
    // Bus und Bahn: kurz hintereinander an derselben Haltestelle ist ein Halt
    if (s.atStop) {
      const e = ev[ev.length - 1];
      if (e && e.type === 'halt' && e.atStop && s.t0 - e.tEnd < 30000 && dist({ lat: e.at[0], lon: e.at[1] }, s) <= STOP_M) {
        e.wait += tEnd - e.tEnd; e.tEnd = tEnd;
        return;
      }
    }
    // Mehrere kurze Halte vor derselben Ampel (Rückstau) zu einem Wartevorgang zusammenfassen
    if (sigId) {
      for (let i = ev.length - 1; i >= 0; i--) {
        const e = ev[i];
        if (e.type === 'halt' && e.signal === sigId && s.t0 - e.tEnd < MERGE_MS) {
          e.wait += wait; e.halts += 1; e.tEnd = tEnd;
          rec.lastHaltAt[sigId] = tEnd;
          return;
        }
      }
      rec.lastHaltAt[sigId] = tEnd;
      // Eine schon gezählte Durchfahrt kurz vorher an derselben Ampel zurücknehmen
      for (let i = ev.length - 1; i >= 0; i--) {
        if (ev[i].type === 'pass' && ev[i].signal === sigId && s.t0 - ev[i].t < 60000) { ev.splice(i, 1); break; }
      }
    }
    const e = {
      type: 'halt', signal: sigId,
      lat: round5(s.signal ? s.signal.lat : s.lat), lon: round5(s.signal ? s.signal.lon : s.lon),
      t: s.t0, tEnd, wait, halts: 1,
      heading: s.heading == null ? null : Math.round(s.heading),
      distToSignal: s.signal ? Math.round(dist(s, s.signal)) : null,
      at: [round5(s.lat), round5(s.lon)]   // wo wirklich gestanden wurde, für spätere Auswertungen
    };
    if (s.atStop) e.atStop = true;
    if (!sigId && s.queueSig) e.queueSig = s.queueSig.id;
    e.mode = rec.curMode;   // Verkehrsmittel des Abschnitts
    ev.push(e);
  }

  // Ein Halt ohne Ampel in der Nähe, nach dem man bald durch eine Ampel fährt, war Rückstau vor dieser Ampel
  function assignQueueHalts(trip) {
    const ev = trip.events;
    let changed = false;
    // Rückwärts durch die Fahrt: eine Kette von Halten ohne Ampel vor einer Ampel ist ihr Rückstau,
    // auch wenn er um eine Ecke reicht. Je Glied höchstens QUEUE_MS Abstand, alle bis QUEUE_M vor der Ampel.
    let target = null, chainT = 0;
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i];
      if (e.signal) { target = e; chainT = e.t; continue; }
      if (e.type !== 'halt' || e.atStop) { target = null; continue; }
      const ok = target && chainT - (e.tEnd || e.t) <= QUEUE_MS && dist(e, target) <= QUEUE_M &&
        (target.type === 'halt' || (e.heading == null ? dist(e, target) <= 80 : angDiff(bearing(e, target), e.heading) <= 45));
      if (!ok) { target = null; continue; }
      if (target.type === 'halt') {
        target.wait += e.wait; target.halts = (target.halts || 1) + (e.halts || 1); target.t = e.t; target.queued = true;
        ev.splice(i, 1);
      } else {
        // Durchfahrt nach dem Stau: der Halt davor gehört zu dieser Ampel
        Object.assign(e, { signal: target.signal, distToSignal: Math.round(dist(e, target)), lat: target.lat, lon: target.lon, queued: true });
        ev.splice(ev.indexOf(target), 1);
        target = e;
      }
      delete e.queueSig;
      chainT = target.t; changed = true;
    }
    return changed;
  }

  // Fahrt aufräumen: aktuelle Kreuzungs-Einteilung, kein Warten vor der Abfahrt, eine Kreuzung nur einmal
  // Wegekette aufräumen: Abschnitte ohne Dauer (ein Wechsel, der sofort zurückgenommen wurde) fallen weg,
  // samt einem Umstieg in genau diesen Abschnitt; gleiche Abschnitte hintereinander werden einer
  function fixLegs(trip) {
    if (!Array.isArray(trip.legs) || !trip.legs.length) return false;
    let changed = false;
    const legs = [];
    for (const l of trip.legs) {
      if (l.t1 - l.t0 <= 0) {
        if (trip.transfers) { const n = trip.transfers.length; trip.transfers = trip.transfers.filter((r) => !(r.to === l.mode && Math.abs((r.tEnd || r.t) - l.t0) < 5000)); if (trip.transfers.length !== n) changed = true; if (!trip.transfers.length) delete trip.transfers; }
        changed = true; continue;
      }
      const prev = legs[legs.length - 1];
      if (prev && prev.mode === l.mode) { prev.t1 = Math.max(prev.t1, l.t1); changed = true; continue; }
      legs.push(Object.assign({}, l));
    }
    if (legs.length < 2) delete trip.legs; else trip.legs = legs;
    return changed;
  }
  function tidyTrip(trip) {
    const ev = trip.events;
    let changed = fixLegs(trip);
    // Ampeln, die nur für die Gegenrichtung gelten (erst bekannt, seit die App die Fahrtrichtung lädt)
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i], c = e.signal && clusterById[e.signal], mode = e.mode || trip.mode;
      if (!c || forMe(c, e.heading, mode)) continue;
      if (e.type === 'pass') ev.splice(i, 1); else { e.signal = null; delete e.distToSignal; }
      changed = true;
    }
    // Signale aus der Ampelliste der Stadt, die keine Straßenampeln sind (bis 0.53.0 als Lücke ergänzt)
    if (lsaData && lsaData.anlagen) {
      const drop = new Set(lsaData.anlagen.filter((a) => a[5] && a[3] !== 'kp' && a[3] !== 'fu').map((a) => 'c' + (9e12 + a[5])));
      for (let i = ev.length - 1; i >= 0; i--) {
        const e = ev[i];
        if (!e.signal || !drop.has(e.signal)) continue;
        if (e.type === 'pass') ev.splice(i, 1); else { e.signal = null; delete e.distToSignal; }
        changed = true;
      }
    }
    // Halte ohne Ampel nachträglich zuordnen, etwa wenn die Ampeldaten während der Fahrt nicht da waren.
    // Durchfahrten ohne Halt lassen sich nicht nachholen: dafür fehlt die Spur.
    for (const e of ev) {
      if (trip.demo || e.type !== 'halt' || e.signal || e.atStop) continue;
      const p = e.at ? { lat: e.at[0], lon: e.at[1] } : e, mode = e.mode || trip.mode;
      if (isTransit(mode) && nearStop(p)) { e.atStop = true; delete e.queueSig; changed = true; continue; }
      const c = findSignal(p, e.heading, (MODES[mode] || MODES.auto).haltRadius, mode);
      if (!c) continue;
      Object.assign(e, { signal: c.id, lat: round5(c.lat), lon: round5(c.lon), distToSignal: Math.round(dist(p, c)) });
      delete e.queueSig; changed = true;
    }
    for (const e of ev) {
      const to = e.signal && alias[e.signal];
      if (to && to !== e.signal) {
        const c = clusterById[to];
        e.signal = to;
        if (c) { e.lat = round5(c.lat); e.lon = round5(c.lon); }
        changed = true;
      }
    }
    // Halt ab dem ersten GPS-Punkt, noch ohne Richtung: Warten an der Haltestelle oder auf dem Parkplatz
    const i0 = ev.findIndex((e) => e.type === 'halt' && e.t <= trip.start && e.heading == null);
    if (i0 >= 0) { ev.splice(i0, 1); changed = true; }
    if (assignQueueHalts(trip)) changed = true;
    // Zwei Ampeln direkt hintereinander, dicht beieinander und kurz nacheinander: dieselbe Kreuzung.
    // Ebenso zwei Ampeln derselben Anlage der Stadt, auch mit einem Halt an der Haltestelle dazwischen.
    const lsaOf = (e) => (clusterById[e.signal] && clusterById[e.signal].lsaG) || null;
    for (let i = 0; i < ev.length - 1; i++) {
      const a = ev[i];
      if (!a.signal) continue;
      let j = i + 1;
      while (j < ev.length && !ev[j].signal && ev[j].atStop) j++;
      const b = ev[j];
      if (!b || !b.signal) continue;
      const sameLsa = lsaOf(a) && lsaOf(a) === lsaOf(b) && b.t - (a.tEnd || a.t) <= 150000;
      if (!sameLsa && j !== i + 1) continue;
      if (!sameLsa && a.signal !== b.signal && dist(a, b) > JUNCTION_M) continue;
      if (!sameLsa && b.t - (a.tEnd || a.t) > JUNCTION_MS) continue;
      let drop = j;
      if (a.type === 'halt' && b.type === 'halt') {
        a.wait += b.wait; a.halts = (a.halts || 1) + (b.halts || 1); a.tEnd = b.tEnd;
        if (b.queued) a.queued = true;
        if (a.rating == null && b.rating != null) a.rating = b.rating;
        if (b.tags) a.tags = Array.from(new Set((a.tags || []).concat(b.tags)));
      } else if (a.type === 'pass' && b.type === 'halt') {
        drop = i;   // der Halt zählt, die Durchfahrt davor gehört dazu
      }
      // Kennung der Anlage: die Ampel, die ihr am nächsten liegt, damit dieselbe Kreuzung in allen Fahrten gleich heißt
      const keep = drop === i ? b : a, other = drop === i ? a : b;
      const ck = clusterById[keep.signal], co = clusterById[other.signal];
      if (sameLsa && co && co.lsa && !(ck && ck.lsa)) Object.assign(keep, { signal: other.signal, lat: other.lat, lon: other.lon });
      ev.splice(drop, 1); i = Math.max(-1, i - 2); changed = true;
    }
    return changed;
  }

  function maybeFetchSignals(p, first) {
    if (rec.trip.demo) return;
    if (areaCovers(p)) return;
    // über etwa 80 km/h (Autobahn, Schnellstraße) gibt es keine Ampeln: erst laden, wenn es wieder langsamer wird
    if (!first && (rec.st.lastVs || 0) > 22) return;
    const now = Date.now();
    if (!first && now - rec.lastFetchAt < 60000) return;
    rec.lastFetchAt = now;
    fetchSignals(p).then(() => { hideWarn(); }).catch(() => {
      showWarn('Ampeldaten konnten gerade nicht geladen werden. Halte werden trotzdem aufgezeichnet und später zugeordnet, wenn möglich.');
    });
  }

  function setDriveState(text, cls) {
    const el = $('#drive-state');
    if (el.textContent !== text) el.textContent = text;
    el.className = 'drive-state' + (cls ? ' ' + cls : '');
  }
  function updateCounters() {
    if (!rec) return;
    const ev = rec.trip.events;
    const halts = ev.filter((e) => e.type === 'halt' && (e.signal || e.queueSig));   // Stau vor einer Ampel zählt mit
    $('#drive-pass').textContent = ev.filter((e) => e.type === 'pass').length;
    $('#drive-halts').textContent = new Set(halts.map((e) => e.signal || e.queueSig)).size;   // ein Stau vor einer Ampel ist ein Halt
    const running = rec.stop && (rec.stop.signal || rec.stop.queueSig) && rec.samples.length ? rec.samples[rec.samples.length - 1].t - rec.stop.t0 : 0;
    $('#drive-wait').textContent = fmtDur(halts.reduce((a, e) => a + e.wait, 0) + running);
  }
  function showWarn(t) { const w = $('#drive-warn'); w.textContent = t; w.hidden = false; }
  function hideWarn() { $('#drive-warn').hidden = true; }

  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (!rec || rec.trip.demo) return;
    if (document.visibilityState === 'visible') {
      requestWakeLock();
      if (rec.hiddenAt && Date.now() - rec.hiddenAt > 10000) showWarn('Die App war im Hintergrund. In dieser Zeit wurde vermutlich nicht aufgezeichnet.');
      rec.hiddenAt = null;
    } else {
      rec.hiddenAt = Date.now();
    }
  });

  function startTrip() {
    audioUnlock();
    if ((!fp || fpWrong()) && lageOn()) loadFahrplan().catch(() => {});
    const mode = selectedMode();
    settings.mode = mode; store.set('settings', settings);
    applyModeWords(mode);
    const msg = $('#start-msg');
    if (!('geolocation' in navigator)) { msg.textContent = 'Dieses Gerät bietet keinen Standortzugriff.'; return; }
    if (!window.isSecureContext) { msg.textContent = 'Standort geht nur über eine sichere Verbindung (https).'; return; }
    msg.textContent = 'Standort wird angefragt …';
    rec = newRecording(mode);
    if (pendingPlan) {   // Fahrt mit Ziel: Name und geplante Zeit bleiben an der Fahrt, die Koordinaten nur bis zum Ende der Aufzeichnung
      rec.target = { lat: pendingPlan.lat, lon: pendingPlan.lon };
      rec.trip.plan = Object.assign({}, pendingPlan); delete rec.trip.plan.lat; delete rec.trip.plan.lon; delete rec.trip.plan.nav; delete rec.trip.plan.via; delete rec.trip.plan.lokal;
      rec.nav = navBuild(pendingPlan.nav, pendingPlan.dauer);
      if (rec.nav && pendingPlan.lokal) rec.nav.lokal = pendingPlan.lokal;   // stufenloser Weg aus der eigenen Wegsuche
      if (rec.nav && MODE_GROUP[mode] === 'fuss') navStairs(rec.nav).catch(() => {});
      if (rec.nav && pendingPlan.via) rec.nav.via = pendingPlan.via;   // Ausweichroute: beim Neuberechnen über diesen Punkt   // Strecke und Abbiegehinweise: nur bis zum Ende der Aufzeichnung im Speicher
      pendingPlan = null;
    }
    if (settings.access.on) rec.trip.access = settings.access.type;   // Wartezeiten mit Einschränkung getrennt auswertbar
    rec.watchId = navigator.geolocation.watchPosition(
      (p) => { if (rec && rec.gpsCount === 0) { msg.textContent = ''; } onPosition(p); },
      (err) => {
        if (err.code === 1) {
          stopWatching(); rec = null; showView('start');
          msg.textContent = 'Ohne Standortfreigabe geht es nicht. Bitte erlaube den Standortzugriff für diese Seite in den Einstellungen deines Browsers.';
        } else {
          setDriveState('GPS-Signal fehlt …', '');
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    requestWakeLock();
    enterDriveView();
    speak(`Aufzeichnung läuft, ${MODES[mode].label}.${rec.trip.plan ? ' Ziel ' + rec.trip.plan.name + '.' : ''}`, { now: true });   // im Tippen: gibt die Sprachausgabe auf dem iPhone frei
    updateVoiceBtn();
  }

  // ---------- Navigation: Strecke vom Server (nur im Speicher), nächster Hinweis, Ansagen, mitlaufende Karte ----------
  const NAV_TOL = { auto: 35, rad: 25, fuss: 20 };          // so weit neben der Strecke gilt man noch als „auf der Strecke“
  const NAV_SAY = { auto: [400, 150], rad: [150, 50], fuss: [60, 25] };
  const NAV_NOW = { auto: 30, rad: 15, fuss: 8 };
  const navGroup = () => { const m = rec && (rec.transfer ? 'fuss' : rec.curMode); return m === 'auto' || m === 'rad' || m === 'fuss' ? m : null; };
  // ---------- Begleitmodus zu Fuß (für blinde und sehbehinderte Menschen) ----------
  // Ampeln an der Strecke als Ankerpunkte, Richtungen als Uhrzeit, Schritte, Warnung bei falscher Richtung, Vibrationsmuster.
  // Die App sagt nie, ob man gehen kann: das entscheidet die Person am Signal.
  const begleitOn = () => settings.begleit === true || (settings.begleit == null && settings.access.on && settings.access.type === 'sehen');
  const vib = (pat) => { try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) { /* ohne */ } };
  function navClock(x) {
    if (!x) return null;
    if (x.art === 'uTurn') return 6;
    const light = x.sev === 'light' || /^(keep|exit|ramp)$/.test(x.art);
    return x.dir === 'right' ? (light ? 2 : 3) : x.dir === 'left' ? (light ? 10 : 9) : null;
  }
  function sigFeat(c0) {
    const y = (v) => v === 'yes', c = accOf(c0);
    const has = [y(c.sound) && 'Tonsignal', y(c.vib) && 'Vibration', y(c.btn) && 'Taster', y(c.tact) && 'Bodenleitstreifen'].filter(Boolean);
    if (has.length) return 'mit ' + has.join(', ').replace(/, ([^,]+)$/, ' und $1');
    if (c.sound === 'no') return 'ohne Tonsignal';
    return 'ohne erfasste Ausstattung';
  }
  // Ampeln bis 15 m neben der Strecke, einmal je Strecke berechnet
  function begleitAnchors(N) {
    // neu berechnen, sobald weitere Ampeln geladen sind
    const all = allClusters();
    if (N.anchors && N.anchorsN === all.length) return N.anchors;
    N.anchorsN = all.length;
    const lat = N.pts.map((q) => q.lat), lon = N.pts.map((q) => q.lon);
    const box = [Math.min(...lat) - 0.0005, Math.max(...lat) + 0.0005, Math.min(...lon) - 0.0008, Math.max(...lon) + 0.0008];
    N.anchors = [];
    for (const c of all) {
      if (c.lat < box[0] || c.lat > box[1] || c.lon < box[2] || c.lon > box[3]) continue;
      const r = navProject(N, c, 0, N.pts.length - 1);
      if (r.d <= 15) N.anchors.push({ at: r.along, c });
    }
    N.anchors.sort((a, b) => a.at - b.at);
    return N.anchors;
  }
  function begleitStepSig(N, x) {
    const a = begleitAnchors(N).find((y) => Math.abs(y.at - x.at) <= 25);
    return a ? a.c : null;
  }
  // bei jedem Standort: Ampeln voraus, Ampel erreicht, falsche Richtung; ohne Ziel nach der Laufrichtung
  function begleitFree(p, t, heading, N) {
    const B = rec.begleit || (rec.begleit = { said: {}, wrongSince: null, wrongAt: 0 });
    const moving = (rec.st.lastVs || 0) > 0.5;
    let h = moving ? heading : null;
    if (h == null && compass && Date.now() - compass.t < 3000) h = compass.h;
    let ahead = null;
    if (N && N.joined && !N.arrived) {
      // nächste Ampel an der Strecke voraus, die nicht schon zu einer Abbiegung gehört
      const a = begleitAnchors(N).find((y) => y.at > N.along - 8 && y.at - N.along < 45);
      if (a) ahead = { c: a.c, d: Math.max(0, a.at - N.along), onTurn: N.steps.some((x) => x.at > N.along && Math.abs(x.at - a.at) <= 25) };
      // falsche Richtung: Laufrichtung gegen die Richtung der Strecke
      const k = Math.min(N.k, N.pts.length - 2), rb = bearing(N.pts[k], N.pts[k + 1]);
      if (h != null && moving && angDiff(h, rb) > 120) {
        if (B.wrongSince == null) B.wrongSince = t;
        if (t - B.wrongSince > 6000 && t - B.wrongAt > 30000) {
          B.wrongAt = t;
          vib([80, 60, 80, 60, 80]);
          navSay(`Du gehst in die falsche Richtung. Dreh dich um, die Strecke führt Richtung ${DIRS[Math.round(rb / 45) % 8]}.`);
        }
      } else B.wrongSince = null;
    } else if (h != null) {
      // ohne Ziel: Ampel in Laufrichtung
      let bd = 45;
      for (const c of allClusters()) {
        const d = dist(p, c);
        if (d < bd && angDiff(bearing(p, c), h) <= 30) { bd = d; ahead = { c, d, onTurn: false }; }
      }
    }
    if (!ahead) return;
    const id = ahead.c.id;
    if (ahead.d > 12 && ahead.d <= 40 && !B.said[id + 'v'] && !ahead.onTurn) {
      B.said[id + 'v'] = true;
      navSay(`In etwa ${roundM(ahead.d)} Metern kommt eine Ampel, ${sigFeat(ahead.c)}.`);
    }
    if (ahead.d <= 12 && !B.said[id + 'e']) {
      B.said[id + 'e'] = B.said[id + 'v'] = true;
      vib([200, 100, 200]);
      navSay(`Ampel erreicht, ${sigFeat(ahead.c)}. Wann du gehst, entscheidest du am Signal.`);
    }
  }
  function navBuild(nav, dauer) {
    if (!nav || !Array.isArray(nav.pts) || nav.pts.length < 2) return null;
    const pts = nav.pts.map((q) => ({ lat: q[0], lon: q[1] }));
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + dist(pts[k - 1], pts[k]));
    const total = cum[cum.length - 1];
    const steps = (nav.schritte || []).filter((x) => x.i > 0 && x.i < pts.length).map((x) => Object.assign({}, x, { at: cum[x.i] }));
    return { pts, cum, total, steps, v: dauer ? total / dauer : null, k: 0, along: 0, joined: false, offSince: null, said: {}, arrived: false, reAt: 0, checked: false };
  }
  // nächster Punkt auf der Strecke zwischen den Stützpunkten a..b
  function navProject(N, p, a, b) {
    const mx = 111320 * Math.cos(p.lat * toR), my = 111320;
    let best = { d: Infinity, k: 0, u: 0 };
    for (let k = a; k < b; k++) {
      const A = N.pts[k], B = N.pts[k + 1];
      const ax = (A.lon - p.lon) * mx, ay = (A.lat - p.lat) * my, dx = (B.lon - A.lon) * mx, dy = (B.lat - A.lat) * my;
      const l2 = dx * dx + dy * dy, u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + u * dx, ay + u * dy);
      if (d < best.d) best = { d, k, u };
    }
    const A = N.pts[best.k], B = N.pts[best.k + 1];
    best.along = N.cum[best.k] + best.u * (N.cum[best.k + 1] - N.cum[best.k]);
    best.q = { lat: A.lat + (B.lat - A.lat) * best.u, lon: A.lon + (B.lon - A.lon) * best.u };
    return best;
  }
  function navText(x) {
    const on = x.str ? ` auf ${x.str}` : x.nr ? ` auf ${x.nr}` : '';
    const side = x.dir === 'left' ? 'links' : x.dir === 'right' ? 'rechts' : '';
    if (x.art === 'arrive') return 'Ziel erreicht';
    if (x.art === 'turn') return side ? `${x.sev === 'light' ? 'Leicht ' + side : x.sev === 'sharp' ? 'Scharf ' + side : cap(side)} abbiegen${on}` : `Abbiegen${on}`;
    if (x.art === 'keep') return side ? `${cap(side)} halten${on}` : `Weiter${on}`;
    if (/^roundabout(Enter|Pass)$/.test(x.art)) return `In den Kreisverkehr${on}`;
    if (x.art === 'roundaboutExit') return x.exit ? `Im Kreisverkehr die ${x.exit}. Ausfahrt nehmen${on}` : `Kreisverkehr verlassen${on}`;
    if (x.art === 'uTurn') return 'Wenden';
    if (x.art === 'exit' || x.art === 'ramp') return `${side ? cap(side) + ' ' : ''}Ausfahrt nehmen${on}`;
    if (x.art === 'continue') return `Geradeaus weiter${on}`;
    return on ? `Weiter${on}` : 'Der Strecke folgen';
  }
  function navArrow(x) {
    if (x && x.art === 'arrive') return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
    let a = !x ? 0 : x.dir === 'left' ? -90 : x.dir === 'right' ? 90 : 0;
    if (x && (x.sev === 'light' || /^(keep|exit|ramp)$/.test(x.art))) a /= 2;
    if (x && x.art === 'uTurn') a = 180;
    return `<svg viewBox="0 0 24 24" style="transform:rotate(${a}deg)"><path d="M12 21V5M5.5 11.5 12 5l6.5 6.5"/></svg>`;
  }
  const navM = (m) => (m >= 1000 ? `${fmtNum(m / 1000, 1)} km` : `${m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50} m`);
  const navSayM = (m) => (m >= 1000 ? `${fmtNum(m / 1000, 1)} Kilometern` : `${m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50} Metern`);
  function navShow(arrow, distTxt, text, rest, re) {
    $('#nav-box').hidden = false;
    $('#nav-arrow').innerHTML = arrow; $('#nav-dist').textContent = distTxt; $('#nav-text').textContent = text;
    $('#nav-rest').textContent = rest || ''; $('#btn-nav-re').hidden = !re;
  }
  function navReset() {
    $('#nav-box').hidden = true; $('#btn-nav-re').hidden = true;
    driveMapSetup();
  }
  // Treppen an der Strecke aus dem Fußwegnetz: wo (Meter ab Start), hinauf oder hinunter, Stufen, Handlauf (in Gehrichtung)
  async function navStairs(N) {
    if (!N || !apiBase()) return;
    const keys = [...new Set(N.pts.filter((q, k) => k % 3 === 0).map((q) => radKey(q.lat, q.lon)))].slice(0, 8), tiles = [];
    for (const k of keys) { const t = await fussTile(k).catch(() => null); if (t) tiles.push(t); }
    const out = [], seen = new Set();
    for (let k = 0; k < N.pts.length - 1; k++) {
      const a = N.pts[k], b = N.pts[k + 1], h = bearing(a, b), segM = N.cum[k + 1] - N.cum[k];
      for (let m = 0; m <= segM; m += 2) {
        const P = { lat: a.lat + (b.lat - a.lat) * (segM ? m / segM : 0), lon: a.lon + (b.lon - a.lon) * (segM ? m / segM : 0) };
        for (const t of tiles) for (const w of t.ways) {
          if (w.c !== 'stufen' || seen.has(w) || Math.abs(w.g[0][0] - P.lat) > 0.002) continue;
          for (let i = 0; i < w.g.length - 1; i++) {
            const wa = { lat: w.g[i][0], lon: w.g[i][1] }, wb = { lat: w.g[i + 1][0], lon: w.g[i + 1][1] };
            if (distToWay(P, [wa, wb]) > 3.5) continue;   // eng: eine Rampe direkt neben der Treppe ist keine Treppe
            // nur auf der Treppe selbst, nicht an ihrem Anfang oder Ende (dort biegt man oft nur ab)
            const e0 = { lat: w.g[0][0], lon: w.g[0][1] }, e1 = { lat: w.g[w.g.length - 1][0], lon: w.g[w.g.length - 1][1] }, tol = Math.min(5, dist(e0, e1) / 3);
            if (dist(P, e0) < tol || dist(P, e1) < tol) continue;
            let ad = Math.abs(bearing(wa, wb) - h) % 360; ad = Math.min(ad, 360 - ad);
            if (ad > 35 && ad < 145) continue;   // querende Treppe zählt nicht
            seen.add(w);
            const same = ad <= 35, info = w.s || [null, 0, null], inc = info[1] * (same ? 1 : -1);
            const hand = { b: 'Handlauf auf beiden Seiten', m: 'Handlauf in der Mitte', y: 'mit Handlauf', n: 'ohne Handlauf', l: same ? 'Handlauf links' : 'Handlauf rechts', r: same ? 'Handlauf rechts' : 'Handlauf links' }[info[2]] || '';
            out.push({ at: N.cum[k] + m, n: info[0], dir: inc > 0 ? 'hinauf' : inc < 0 ? 'hinunter' : '', hand, name: w.n || '' });
            break;
          }
        }
      }
    }
    N.stairs = out.sort((x, y) => x.at - y.at);
  }
  const stairText = (st) => ['Treppe' + (st.dir ? ' ' + st.dir : ''), st.n && st.n < 12 ? `${st.n} Stufen` : '', st.hand].filter(Boolean).join(', ');
  // am Ziel: Eingang laut „Bielefeld barrierefrei erleben“, defekter Aufzug der DB in der Nähe
  function arrivalInfo() {
    const z = rec && rec.target;
    if (!z || !bfData) return '';
    const plan = rec.trip.plan || {}, zz = settings.ziele.find((x) => x.id === plan.ziel) || { lat: z.lat, lon: z.lon };
    const out = [], o = bfNear(zz);
    if (o) {
      const ein = o.hinweis && o.hinweis.eingang;
      if (ein) out.push(`Zum Eingang: ${ein.replace(/\s+/g, ' ').slice(0, 160)}`);
      else if (o.f && o.f.stufenlos === 1) out.push('Der Eingang ist stufenlos');
      else if (o.f && o.f.stufenlos === 0) out.push('Der Eingang hat Stufen');
    }
    for (const a of bfData.lift || []) {
      if (a[5] !== 'db' || a[4] !== 'notAvailable' || dist({ lat: a[0], lon: a[1] }, z) > 400) continue;
      const [bhf, wo] = String(a[3] || '').split(': ');
      out.push(`Achtung: Am ${bhf} ist der Aufzug ${wo || ''} außer Betrieb`.replace(/\s+/g, ' ').trim());
      if (out.length >= 3) break;
    }
    return out.length ? ' ' + out.map((x) => x.replace(/[.\s]+$/, '') + '.').join(' ') : '';
  }
  function navUpdate(p, t, acc, heading) {
    driveMapMove(p, heading);
    const N = rec && rec.nav, g = navGroup();
    if (g === 'fuss' && begleitOn()) begleitFree(p, t, heading, N);
    if (!N || N.arrived) return;
    if (!g) { $('#nav-box').hidden = true; return; }   // in Bus und Bahn pausiert
    const tol = Math.max(NAV_TOL[g], Math.min(50, acc || 0));
    let r = navProject(N, p, N.joined ? Math.max(0, N.k - 5) : 0, N.joined ? Math.min(N.pts.length - 1, N.k + 400) : N.pts.length - 1);
    if (N.joined && r.d > tol) { const r2 = navProject(N, p, 0, N.pts.length - 1); if (r2.d < r.d) r = r2; }
    // Strecke aus „Wohin?“ beginnt an einem gerundeten Start: beim Losfahren einmal genau ab hier holen (außer man steht schon am Anfang)
    if (!N.checked) { N.checked = true; if (r.d > 25 || r.along > 40) navReroute(true); }
    if (r.d <= tol) { N.joined = true; N.k = r.k; N.along = Math.max(N.along - 30, r.along); N.offSince = null; }
    else if (N.joined && N.offSince == null) N.offSince = t;
    const left = Math.max(0, N.total - (N.joined ? N.along : r.along));
    const eta = N.v ? ` · Ankunft etwa ${clock(Date.now() + left / N.v * 1000)}` : '';
    const rest = `Noch ${navM(left)}${eta}`;
    if (N.joined && left < 25) {
      N.arrived = true;
      if (g === 'fuss' && begleitOn()) vib([300, 100, 300, 100, 600]);
      navShow(navArrow({ art: 'arrive' }), 'Ziel erreicht', rec.trip.plan ? rec.trip.plan.name : '', '', false);
      navSay(`Du hast dein Ziel erreicht${rec.trip.plan ? ': ' + rec.trip.plan.name : ''}.${arrivalInfo()}`, null, 'ziel');
      return;
    }
    if (!N.said.start && N.checked && (N.startOk || !N.reAt || Date.now() - N.reAt > 8000)) {
      N.said.start = true; N.holdUntil = t + 6000;
      const name = rec.trip.plan ? rec.trip.plan.name : 'deinem Ziel', b = bearing(p, r.q);
      const h = heading != null ? heading : compass && Date.now() - compass.t < 3000 ? compass.h : null;
      const wo = h != null ? `auf ${Math.round(((b - h + 360) % 360) / 30) || 12} Uhr` : `Richtung ${DIRS[Math.round(b / 45) % 8]}`;
      navSay(!N.joined && r.d > 15 ? `Navigation zu ${name}. Die Strecke beginnt in etwa ${navSayM(r.d)}, ${wo}.` : `Navigation zu ${name}. Es geht hier los${N.steps[0] && N.steps[0].art !== 'arrive' ? `, als Erstes in ${navSayM(Math.max(10, N.steps[0].at))} ${navText(N.steps[0]).charAt(0).toLowerCase() + navText(N.steps[0]).slice(1)}` : ''}.`);
    }
    if (!N.joined) {
      const dir = DIRS[Math.round(bearing(p, r.q) / 45) % 8];
      navShow(navArrow(null), `Zur Strecke ${navM(r.d)}`, `Richtung ${dir}`, rest, false);
      return;
    }
    if (N.offSince != null && t - N.offSince > 8000) {
      navShow(navArrow({ art: 'uTurn' }), 'Abseits der Strecke', 'Ich berechne sie neu, oder tippe unten.', rest, true);
      if (!N.said.off) { N.said.off = true; navSay('Du bist von der Strecke abgekommen. Ich berechne sie neu.'); }
      if (t - N.offSince > 12000) navReroute(false);
      return;
    }
    if (g === 'fuss' && N.stairs) {
      const st = N.stairs.find((x) => x.at > N.along - 2 && x.at - N.along < 30 && !x.said6);
      if (st) {
        const d = st.at - N.along;
        if (d <= 7) { st.said6 = st.said25 = true; navSay(`Achtung, ${stairText(st)}.`); vib([300, 100, 300]); return; }
        if (d > 12 && !st.said25) { st.said25 = true; navSay(`In etwa ${roundM(d)} Metern kommt eine ${stairText(st)}.`); return; }
      }
    }
    // B7: „Weiter geradeaus“ zur Bestätigung auf langen geraden Stücken (Abstand einstellbar, ITU-T F.921: 10 m)
    const every = geradeausM();
    if (g === 'fuss' && every && N.joined) {
      const nx = N.steps.find((x) => x.at > N.along + 3), dn = nx ? nx.at - N.along : Infinity;
      if (N.lastSayAlong == null) N.lastSayAlong = N.along;
      if (dn > 25 && N.along - N.lastSayAlong >= every && !(N.holdUntil && t < N.holdUntil)) {
        navSay(nx && nx.art !== 'arrive' ? `Weiter geradeaus, noch ${navSayM(dn).replace(/Metern$/, 'Meter').replace(/Kilometern$/, 'Kilometer')} bis zum Abbiegen.` : `Weiter geradeaus.`);
      }
    }
    const next = N.steps.find((x) => x.at > N.along + 3);
    if (!next) { navShow(navArrow(null), navM(left), 'Der Strecke folgen', rest, false); return; }
    const d = next.at - N.along, txt = next.art === 'arrive' ? `Ziel: ${rec.trip.plan ? rec.trip.plan.name : 'erreicht'}` : navText(next);
    const bg = g === 'fuss' && begleitOn();
    let low = next.art === 'arrive' ? 'erreichst du dein Ziel' : txt.charAt(0).toLowerCase() + txt.slice(1);
    if (bg && next.art !== 'arrive') {
      const ck = navClock(next), sg = begleitStepSig(N, next);
      low += (ck ? `, auf ${ck} Uhr` : '') + (sg ? `, an der Ampel ${sigFeat(sg)}` : '');
    }
    const steps = (m) => { const r = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50; return bg && m < 150 ? `, etwa ${Math.max(5, Math.round(r / 0.7 / 5) * 5)} Schritten,` : ''; };
    navShow(navArrow(next), d <= NAV_NOW[g] ? 'Jetzt' : `In ${navM(d)}`, txt, rest, false);
    // Ansagen: zweimal vorher, dann „Jetzt“ (nicht in die Startansage hinein)
    if (N.holdUntil && t < N.holdUntil) return;
    const key = next.i;
    if (d <= NAV_NOW[g] + 5) {
      if (!N.said[key + 'n']) { N.said[key + 'n'] = true; if (next.art !== 'arrive') { navSay(`Jetzt ${low}.`); if (bg) vib(next.dir === 'left' ? [500] : next.dir === 'right' ? [120, 80, 120] : [600]); } }
    } else {
      const th = NAV_SAY[g].find((x, i) => d <= x && (i === NAV_SAY[g].length - 1 || d > NAV_SAY[g][i + 1]));
      if (th && !N.said[key + '_' + th] && d > NAV_NOW[g] + 15) {
        NAV_SAY[g].forEach((x) => { if (x >= th) N.said[key + '_' + x] = true; });
        navSay(`In ${navSayM(d)}${steps(d)} ${low}.`);
        if (bg && th === NAV_SAY[g][NAV_SAY[g].length - 1]) vib([80]);
      }
    }
  }
  // Strecke von hier neu berechnen (Start auf etwa 10 m), beim Losfahren und wenn man abkommt; höchstens einmal je Minute
  async function navReroute(quiet) {
    const N = rec && rec.nav, g = navGroup();
    if (!N || !g || !rec.target || !rec.last || Date.now() - N.reAt < 60000 || !apiBase()) return;
    N.reAt = Date.now();
    const from = [rec.last.lat, rec.last.lon].map((x) => x.toFixed(4));
    if (N.lokal) {   // stufenloser Weg: wieder mit der eigenen Wegsuche, nicht mit HERE (das kennt keine Treppen)
      try {
        const r = await fussRoute([rec.last.lat, rec.last.lon], [rec.target.lat, rec.target.lon], N.lokal);
        if (!rec || !r) return;
        const old = rec.nav;
        rec.nav = navBuild({ pts: r.pts, schritte: stepsFromPath(r.pts, r.names) }, r.m / 1.1);
        Object.assign(rec.nav, { lokal: old.lokal, checked: true, reAt: Date.now() });
        if (old.said && old.said.start) rec.nav.said.start = true; else rec.nav.startOk = true;
        navStairs(rec.nav).catch(() => {});
        driveMapRoute();
        if (!quiet && old.joined) navSay('Neue Strecke berechnet, ohne Stufen.');
      } catch (e) { /* alte Strecke bleibt */ }
      return;
    }
    // Ausweichroute: über den Zwischenpunkt, solange er noch vor einem liegt
    let via = N.via || null;
    if (via) { const vp = navProject(N, { lat: via[0], lon: via[1] }, 0, N.pts.length - 1); if (vp.d < 300 && N.joined && N.along > vp.along - 300) via = null; }
    try {
      const d = await api(`/api/ziel?from=${from.join(',')}&to=${rec.target.lat},${rec.target.lon}&mode=${g}&nav=1${via ? '&via=' + via.join(',') : ''}${g === 'fuss' && settings.access.on ? '&profil=' + settings.access.type : ''}`);
      if (!rec || !d.nav) return;
      const old = rec.nav;
      rec.nav = navBuild(d.nav, d.dauer);
      if (via) rec.nav.via = via;
      if (g === 'fuss') navStairs(rec.nav).catch(() => {});
      rec.nav.checked = true; rec.nav.reAt = Date.now();
      driveMapRoute();
      if (old && old.said && old.said.start) rec.nav.said.start = true; else rec.nav.startOk = true;   // Startansage nur einmal, auf der neuen Strecke gleich
      if (!quiet && old && old.joined) navSay('Neue Strecke berechnet.');
    } catch (e) { /* ohne Netz: alte Strecke bleibt */ }
  }
  $('#btn-nav-re').addEventListener('click', () => { if (rec && rec.nav) { rec.nav.reAt = 0; navReroute(false); } });
  $('#btn-nav-rep').addEventListener('click', () => { unlockSpeech(); audioUnlock(); navRepeat(); });
  // mitlaufende Karte: Ausschnitt um den Standort, Strecke darauf; nicht verschiebbar, damit der Blick kurz bleibt
  let driveMap = null, driveLayer = null, driveMe = null;
  function driveMapSetup() {
    const el = $('#drive-map'), on = settings.driveMap !== false && typeof L !== 'undefined';
    $('#btn-drive-map').setAttribute('aria-pressed', String(settings.driveMap !== false));
    el.hidden = !on;
    if (!on) return;
    if (!driveMap) {
      driveMap = L.map(el, { zoomControl: false, attributionControl: true, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(driveMap);
      driveMap.setView([CITY.lat, CITY.lon], 14);
    }
    if (driveLayer) driveLayer.remove();
    driveLayer = L.layerGroup().addTo(driveMap);
    driveMe = null;
    setTimeout(() => driveMap && driveMap.invalidateSize(), 60);
    driveMapRoute();
  }
  function driveMapRoute() {
    if (!driveMap || !driveLayer) return;
    driveLayer.clearLayers(); driveMe = null;
    const N = rec && rec.nav;
    if (N) {
      const ll = N.pts.map((q) => [q.lat, q.lon]);
      L.polyline(ll, { color: '#ffffff', weight: 10, opacity: 0.9 }).addTo(driveLayer);
      L.polyline(ll, { color: '#2563a8', weight: 6, opacity: 0.95 }).addTo(driveLayer);
      L.circleMarker(ll[ll.length - 1], { radius: 9, color: '#fff', weight: 3, fillColor: '#15191e', fillOpacity: 1 }).addTo(driveLayer);
    }
  }
  function driveMapMove(p, heading) {
    if (!driveMap || $('#drive-map').hidden) return;
    const icon = L.divIcon({ className: 'me-pin', iconSize: [30, 30], html: `<span style="transform:rotate(${heading == null ? 0 : Math.round(heading)}deg)"${heading == null ? ' class="noh"' : ''}></span>` });
    if (!driveMe) driveMe = L.marker([p.lat, p.lon], { icon, interactive: false, keyboard: false }).addTo(driveLayer);
    else { driveMe.setLatLng([p.lat, p.lon]); driveMe.setIcon(icon); }
    const g = navGroup() || 'auto';
    driveMap.setView([p.lat, p.lon], g === 'fuss' ? 18 : g === 'rad' ? 17 : 16, { animate: false });
  }
  $('#btn-drive-map').addEventListener('click', () => {
    settings.driveMap = settings.driveMap === false; store.set('settings', settings);
    driveMapSetup();
    if (rec && rec.last) driveMapMove(rec.last, null);
  });
  function enterDriveView() {
    hideWarn();
    navReset();
    setDriveState('Warte auf GPS …', '');
    $('#drive-speed').textContent = '–';
    $('#drive-dir').textContent = '';
    ['#drive-pass', '#drive-halts'].forEach((s) => { $(s).textContent = '0'; });
    $('#drive-wait').textContent = '0:00';
    $('#drive-time').textContent = '0:00';
    resetEndButtons();
    updateTransferUI();
    showView('drive');
    $$('.tabs button').forEach((b) => { b.disabled = true; });
    clearInterval(tick);
    tick = setInterval(() => {
      if (!rec) return;
      const now = rec.trip.demo ? (rec.samples.length ? rec.samples[rec.samples.length - 1].t : rec.startedAt) : Date.now();
      const from = rec.trip.start || rec.startedAt;
      $('#drive-time').textContent = fmtDur(now - from);
      if (!rec.trip.demo && rec.lastFixAt && Date.now() - rec.lastFixAt > GAP_MS) {
        setDriveState('Kein GPS-Empfang, etwa im Tunnel. Die Lücke wird überbrückt.', '');
        if (rec.ln) { lineEstimate(Date.now()); showStopLine(); }
      }
      updateCounters();
    }, 1000);
  }

  function stopWatching() {
    if (rec && rec.watchId != null) navigator.geolocation.clearWatch(rec.watchId);
    if (rec && rec.demoTimer) clearInterval(rec.demoTimer);
    clearInterval(tick);
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    $$('.tabs button').forEach((b) => { b.disabled = false; });
  }

  // ---------- Ansagen: Sprachausgabe des Handys (Stufe 1 der Sprachsteuerung) ----------
  // Läuft ganz auf dem Gerät; Flowtown schickt dafür nichts an einen Server. Auf dem iPhone erst nach einem Tippen möglich (Start-Knopf).
  const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const voiceOn = () => canSpeak && !!(settings.voice && settings.voice.on);
  let voiceDe = null, voicesDe = [];
  // Beste deutsche Stimme: Premium und Erweitert (iPhone), Natural und Neural (Android, Windows) vor der kleinen Standardstimme.
  // Die Spaßstimmen von Apple (Grandma, Rocko …) klingen bewusst künstlich und kommen nur, wenn man sie selbst wählt.
  const VOICE_FUN = /\b(eddy|flo|grandma|grandpa|oma|opa|reed|rocko|sandy|shelley|albert|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|bad news|good news)\b/i;
  const voiceQuality = (v) => (/premium/i.test(v.name) ? 3 : /enhanced|erweitert|verbessert|neural|natural|wavenet|studio|hohe qualität|high quality/i.test(v.name + ' ' + v.voiceURI) ? 2 : VOICE_FUN.test(v.name) ? -1 : 0);
  const voiceScore = (v) => voiceQuality(v) * 10 + (/^de[-_]DE/i.test(v.lang) ? 2 : 0) + (v.localService ? 1 : 0);
  const voiceLabel = (v) => v.name.replace(/\s*\((Premium|Erweitert|Enhanced|Verbessert|hohe Qualität|High Quality|Natural)\)/i, '') + (voiceQuality(v) === 3 ? ' · Premium' : voiceQuality(v) === 2 ? ' · hohe Qualität' : voiceQuality(v) < 0 ? ' · Spaßstimme' : '') + (/^de[-_](AT|CH)/i.test(v.lang) ? (/AT/i.test(v.lang) ? ' · Österreich' : ' · Schweiz') : '') + (v.localService ? '' : ' · braucht Internet');
  function pickVoice() {
    if (!canSpeak) return;
    voicesDe = speechSynthesis.getVoices().filter((v) => /^de/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
    const want = settings.voice && settings.voice.name;
    voiceDe = (want && voicesDe.find((v) => v.voiceURI === want || v.name === want)) || voicesDe.find((v) => voiceQuality(v) >= 0) || voicesDe[0] || null;
    renderVoiceSet();
  }
  function renderVoiceSet() {
    const sel = document.getElementById('set-voice-name');
    if (!sel) return;
    const want = (settings.voice && settings.voice.name) || '';
    const lbl = $('#set-voice-label'); if (lbl) lbl.textContent = voicesDe.length ? `Stimme (${voicesDe.length} deutsche auf diesem Gerät)` : 'Stimme';
    sel.innerHTML = `<option value="">Automatisch: ${voiceDe && !want ? esc(voiceLabel(voiceDe)) : 'die beste Stimme'}</option>` + voicesDe.map((v) => `<option value="${esc(v.voiceURI || v.name)}">${esc(voiceLabel(v))}</option>`).join('');
    sel.value = voicesDe.some((v) => (v.voiceURI || v.name) === want) ? want : '';
    // nur Standardstimmen da: zeigen, wie man eine bessere lädt
    const best = voicesDe.length ? voiceQuality(voicesDe[0]) : 0;
    const hint = document.getElementById('voice-hint');
    if (!hint) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/.test(navigator.userAgent);
    const how = ios ? 'iPhone: Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch. Dort „Anna (Premium)“ oder eine Stimme mit „Erweitert“ laden. Danach Flowtown neu öffnen.'
      : android ? 'Android: Einstellungen → Sprachausgabe (Text-in-Sprache) → Google-Sprachdienste → Sprachdaten installieren → Deutsch. Dort eine Stimme laden, am besten über WLAN. Danach Flowtown neu öffnen.'
      : 'In den Einstellungen deines Geräts unter Sprachausgabe eine deutsche Stimme in hoher Qualität laden. Danach Flowtown neu öffnen.';
    hint.hidden = best >= 2;
    hint.innerHTML = `<p><b>Klingt die Stimme blechern?</b> Dein Handy hat bessere, natürlichere Stimmen. Lade einmal eine:</p><p>${esc(how)}</p>`;
  }
  if (canSpeak) {
    pickVoice();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', pickVoice);
    // iPhone: Safari meldet oft erst nur ein, zwei Stimmen und den Rest später, ohne „voiceschanged“. Deshalb einige Male nachfragen.
    [400, 1200, 3000, 8000].forEach((ms) => setTimeout(() => { if (speechSynthesis.getVoices().filter((v) => /^de/i.test(v.lang)).length !== voicesDe.length) pickVoice(); }, ms));
  }
  // Text zum Sprechen: Abkürzungen ausschreiben, Zeichen weglassen
  const sayText = (x) => String(x || '').replace(/\s+/g, ' ')
    .replace(/(\d+):(\d{2})\s?h\b/g, (m, h, mi) => `${h} Stunde${h === '1' ? '' : 'n'} ${+mi} Minute${+mi === 1 ? '' : 'n'}`)
    .replace(/(\d+):(\d{2})\s?min\b/g, (m, mi, sec) => (+mi ? `${+mi} Minute${+mi === 1 ? '' : 'n'}${+sec ? ` ${+sec} Sekunde${+sec === 1 ? '' : 'n'}` : ''}` : `${+sec} Sekunde${+sec === 1 ? '' : 'n'}`))
    .replace(/(\d+)\s?h\s(\d+)\s?min\b/g, (m, h, mi) => `${h} Stunde${h === '1' ? '' : 'n'} ${mi} Minute${mi === '1' ? '' : 'n'}`).replace(/(\d+)\s?h\b(?!\.)/g, (m, h) => `${h} Stunde${h === '1' ? '' : 'n'}`)
    .replace(/(\d)\s?min\b/g, '$1 Minuten').replace(/(\d)\s?km\/h/g, '$1 Kilometer pro Stunde').replace(/(\d),(\d)\s?km\b/g, '$1 Komma $2 Kilometer').replace(/(\d)\s?km\b/g, '$1 Kilometer')
    .replace(/(\d)\s?m\b/g, '$1 Meter').replace(/\bggü\.?\s?/g, 'gegenüber ').replace(/\bz\.\s?B\.\s?/g, 'zum Beispiel ').replace(/\bu\.\s?a\.\s?/g, 'unter anderem ').replace(/\bbzw\.\s?/g, 'beziehungsweise ').replace(/\bHbf\b/g, 'Hauptbahnhof').replace(/\bvsl\.\s?/g, 'voraussichtlich ').replace(/\bca\.\s?/g, 'etwa ').replace(/\bNr\.\s?/g, 'Nummer ').replace(/\bStr\.\s*$/, 'Straße.').replace(/\bStr\.(\s+)(?=[A-ZÄÖÜ])/g, 'Straße.$1').replace(/\bStr\./g, 'Straße').replace(/\bStr\b/g, 'Straße').replace(/-v-/g, ' von ').replace(/\bØ\s?/g, 'im Schnitt ')
    .replace(/\s?[·|]\s?/g, ', ').replace(/→/g, ' bis ').replace(/[✓✗]/g, '').replace(/\+(\d)/g, 'plus $1').replace(/−(\d)/g, 'minus $1').replace(/\s+([.,])/g, '$1').replace(/([.,]){2,}/g, '$1').trim();
  const sayLast = {};
  // iPhone: Sprachausgabe erst nach einer Ansage, die direkt ein Antippen auslöst. Beim Tippen auf Mikrofon oder „Fragen“
  // deshalb einmal stumm sprechen; danach darf die App auch später antworten (etwa wenn die Antwort vom Server kommt).
  let speechUnlocked = false;
  function unlockSpeech() {
    if (!canSpeak || speechUnlocked) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'de-DE'; speechSynthesis.speak(u); speechUnlocked = true; } catch (e) { /* ohne */ }
  }
  // Töne für die Navigation (ITU-T F.921): zwei kurze Töne vor einer Ansage, drei aufsteigende am Ziel
  let audioCtx = null;
  function audioUnlock() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { audioCtx = null; }
  }
  // „Weiter geradeaus“: aus, alle 10, 25 oder 50 m; ohne Einstellung im Begleitmodus alle 25 m, sonst aus
  const geradeausM = () => (settings.geradeaus != null ? Number(settings.geradeaus) || 0 : begleitOn() ? 25 : 0);
  function chime(kind) {
    if (!audioCtx || settings.navTone === false) return 0;
    const notes = kind === 'ziel' ? [659, 880, 1047] : [880, 659], t0 = audioCtx.currentTime + 0.03;
    try {
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), st = t0 + i * 0.2;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.3, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.16);
        o.connect(g); g.connect(audioCtx.destination); o.start(st); o.stop(st + 0.18);
      });
    } catch (e) { return 0; }
    return notes.length * 200 + 80;
  }
  // Navigationsansage: erst der Hinweiston, dann sprechen; die letzte Ansage bleibt zum Wiederholen
  let lastNavSay = '', lastSpoken = '';
  function navSay(text, opts, kind) {
    if (!text) return;
    lastNavSay = text;
    if (typeof rec !== 'undefined' && rec && rec.nav) rec.nav.lastSayAlong = rec.nav.along;
    if (!voiceOn() && !(opts && opts.force)) return;
    if (canSpeak) speechSynthesis.cancel();
    const ms = chime(kind || 'hinweis');
    if (ms) setTimeout(() => speak(text, Object.assign({}, opts, { now: true })), ms); else speak(text, Object.assign({}, opts, { now: true }));
  }
  function navRepeat() {
    const t = lastNavSay || ($('#nav-box').hidden ? lastSpoken : `${$('#nav-dist').textContent}: ${$('#nav-text').textContent}.`);
    if (!t) { speak('Es gibt noch nichts zu wiederholen.', { now: true, force: true }); return; }
    navSay(t, { force: true });
  }
  function speak(text, opts) {
    opts = opts || {};
    if (!canSpeak || !text || (!opts.force && !voiceOn())) return;
    lastSpoken = text;
    const t = sayText(text), now = Date.now();
    if (!opts.force && sayLast[t] && now - sayLast[t] < 20000) return;   // nichts doppelt hintereinander
    sayLast[t] = now;
    if (opts.now) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'de-DE';
    if (voiceDe) u.voice = voiceDe;
    u.rate = (settings.voice && settings.voice.rate) || 1;
    if (opts.onend) {
      // onend kommt nicht auf jedem Gerät zuverlässig: dann nach der geschätzten Dauer, sobald nichts mehr gesprochen wird
      let done = false, poll = null;
      const fin = () => { if (done) return; done = true; clearTimeout(poll); opts.onend(); };
      u.onend = fin; u.onerror = fin;
      const until = Date.now() + 60000;
      const check = () => { if (done) return; if (!speechSynthesis.speaking || Date.now() > until) fin(); else poll = setTimeout(check, 400); };
      poll = setTimeout(check, Math.min(30000, 1500 + t.length * 75 / ((settings.voice && settings.voice.rate) || 1)));
    }
    speechSynthesis.speak(u);
    return true;
  }
  const roundM = (m) => (m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50);
  // Unterwegs: Baustellen, Sperrungen, Stau und gemeldete Hindernisse voraus, je einmal pro Fahrt
  const AHEAD = { fuss: { r: 120, art: ['baustelle', 'sperrung'] }, rad: { r: 200, art: ['baustelle', 'sperrung', 'unfall'] }, auto: { r: 500, art: ['baustelle', 'sperrung', 'stau', 'unfall'] } };
  function voiceAhead(p, t) {
    if (!voiceOn() || !rec || t - (rec.vAt || 0) < 5000) return;
    rec.vAt = t;
    const mode = rec.transfer ? 'fuss' : rec.curMode, cfg = AHEAD[mode];
    const h = currentHeading(p);
    if (!cfg || h == null) return;
    const said = rec.vSaid || (rec.vSaid = {});
    const ahead = (q, r) => { const d = dist(p, q); return d <= r && (d < 25 || angDiff(bearing(p, q), h) <= 40) ? d : null; };
    for (const it of (lageCache && lageCache.items) || []) {
      if (!it || said[it.id] || !cfg.art.includes(it.art) || !Array.isArray(it.pts)) continue;
      let best = null;
      for (const q of it.pts) { const d = ahead({ lat: q[0], lon: q[1] }, it.art === 'stau' ? cfg.r : Math.min(cfg.r, 300)); if (d != null && (best == null || d < best)) best = d; }
      if (best == null) continue;
      said[it.id] = 1;
      const wo = best < 40 ? 'Hier' : `In ${roundM(best)} Metern`;
      const was = it.art === 'sperrung' ? 'Sperrung' : it.art === 'stau' ? (it.fluss ? 'stockender Verkehr' : 'Stau') : it.art === 'unfall' ? 'Unfall' : 'Baustelle';
      speak(`${wo} ${was}${it.titel ? ', ' + it.titel : ''}.${mode === 'fuss' && it.fuss ? ' ' + it.fuss : ''}`);
      return;
    }
    if (mode === 'fuss' && hinw) for (const x of hinw) {
      if (said['h' + x.id] || x.art === 'gut') continue;
      const d = ahead(x, 70);
      if (d == null) continue;
      said['h' + x.id] = 1;
      speak(`${d < 25 ? 'Hier' : `In ${roundM(d)} Metern`} gemeldet: ${HINW[x.art] || 'Hindernis'}.`);
      return;
    }
  }
  // Bilanz am Ende der Fahrt, kurz
  function voiceSummary(trip) {
    if (!voiceOn()) return;
    const mins = Math.max(1, Math.round(((trip.end || trip.start) - trip.start) / 60000));
    const halts = trip.events.filter((e) => e.type === 'halt' && e.signal), wait = halts.reduce((a, e) => a + e.wait, 0);
    const passes = trip.events.filter((e) => e.type === 'pass').length;
    const stops = trip.events.filter((e) => e.type === 'halt' && e.atStop).reduce((a, e) => a + e.wait, 0);
    const sec = (ms) => { const s0 = Math.round(ms / 1000); return s0 < 60 ? `${s0} Sekunden` : `${Math.floor(s0 / 60)} Minute${Math.floor(s0 / 60) === 1 ? '' : 'n'}${s0 % 60 >= 10 ? ` ${s0 % 60} Sekunden` : ''}`; };
    let x = `Angekommen. ${mins} Minute${mins === 1 ? '' : 'n'} unterwegs, ${fmtNum(trip.distance / 1000, 1)} Kilometer. `;
    x += halts.length ? `${halts.length} Halt${halts.length === 1 ? '' : 'e'} an Ampeln, zusammen ${sec(wait)}. ` : 'Kein Halt an einer Ampel. ';
    if (passes) x += `${passes} Ampel${passes === 1 ? '' : 'n'} ohne Halt. `;
    if (stops) x += `An Haltestellen ${sec(stops)}. `;
    speak(x + 'Du kannst die Ampeln jetzt bewerten.', { now: true });
  }
  // Vorlesen eines Bereichs (Ziel, Verbindung): sichtbarer Text ohne Knöpfe, Quellen und Diagramme
  function sayPanel(el) {
    if (!el) return;
    const c = el.cloneNode(true);
    c.querySelectorAll('.vf-map, .leaflet-container').forEach((n) => n.remove());   // die kleine Karte nicht vorlesen
    c.querySelectorAll('[role="img"][aria-label]').forEach((n) => n.replaceWith(n.getAttribute('aria-label') + '. '));   // Diagramme mit ihrer Beschreibung
    c.querySelectorAll('.btn, .btn-link, .vf-x, .lg-src, .vf-bars, .vf-chips, form, svg, [aria-hidden="true"], .rad-bar, .rad-legend, .con-lines, [data-say]').forEach((n) => n.remove());
    c.querySelectorAll('.con-list > li').forEach((li) => { if (!li.querySelector('.con.on')) li.remove(); });
    c.querySelectorAll('.dep-line').forEach((n) => n.prepend('Linie '));
    c.querySelectorAll('*').forEach((n) => n.append(' '));   // zwischen allen Teilen eine Pause
    c.querySelectorAll('li, p, h4, .vf-sum, .vf-phead, .con-t, br').forEach((n) => n.append('. '));
    speak(c.textContent.replace(/\s+/g, ' ').replace(/([?!:])\s*\./g, '$1').replace(/(\.\s*){2,}/g, '. '), { now: true, force: true });
  }

  // ---------- Sprachbefehle (Stufe 2): Mikrofon-Knopf, ein kurzer Befehl, Antwort als Ansage ----------
  // Spracherkennung des Handys (Web Speech API). Sie schickt die Aufnahme an den Anbieter des Betriebssystems
  // (Apple oder Google); deshalb einmal Einwilligung. Flowtown selbst speichert und sendet nichts davon.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null, sayAfterZiel = null, micT = null;
  const MIC_HELP = 'Du kannst zum Beispiel sagen: Losfahren. Mit dem Rad los. Zur Uni. Nächste Bahn ab Jahnplatz. Wiederholen. '
    + 'Unterwegs: Wie lange noch? Nächster Halt? Jetzt zu Fuß. Ja oder Nein auf eine Rückfrage. Fahrt beenden. Außerdem: Vorlesen, Ansagen aus, Hilfe. Wo bin ich? beschreibt deine Umgebung. Und du kannst frei fragen, zum Beispiel: Wo ist die nächste rollstuhlgerechte Toilette? Nach meiner Antwort höre ich weiter zu, Danke beendet das Gespräch.';
  function micStatus(text, keep) {
    const el = $('#mic-status');
    if (!el) return;
    el.textContent = text; el.hidden = !text;
    clearTimeout(micT);
    if (text && !keep) micT = setTimeout(() => { el.hidden = true; }, 6000);
  }
  function micUI(on) {
    ['#btn-mic', '#btn-mic-drive', '.assist-mic', '#ask-mic', '#fab-mic'].forEach((id) => { const b = $(id); if (b) { b.setAttribute('aria-pressed', String(on)); b.classList.toggle('listening', on); } });
  }
  // Gesprächsmodus: nach einer gesprochenen Antwort oder Rückfrage geht das Mikrofon von selbst wieder an.
  // Kommt nichts, endet es still; „Danke“, „Das war's“ oder „Tschüss“ beenden das Gespräch.
  function listenAfter(prompt) {
    if (!SR || !settings.voiceIn) return;
    setTimeout(() => { if (!recog && !(canSpeak && speechSynthesis.speaking)) listen({ auto: true, prompt }); }, 300);
  }
  // Geduldiges Zuhören im großen Sprachmodus: Das Gerät beendet das Zuhören sonst schon nach einer kurzen Pause.
  // Hier warten wir nach dem letzten Wort noch 4 Sekunden, hören bis zu 30 Sekunden lang auf den Anfang
  // und zeigen mit, was verstanden wurde. Ein Tipp auf den Knopf beendet das Zuhören sofort.
  const PATIENT_MS = 30000, PATIENT_SILENCE = 4000;
  function listen(opts) {
    if (!SR) return;
    const auto = !!(opts && opts.auto), restart = !!(opts && opts.restart);
    if (recog) {
      if (auto) return;
      if (recog.patient && recog.gotSpeech) recog.stop(); else { recog.userAbort = true; recog.abort(); }
      return;
    }
    if (auto && !settings.voiceIn) return;
    if (!settings.voiceIn) {
      const ok = window.confirm('Sprachbefehle nutzen die Spracherkennung deines Handys. Dabei geht die Aufnahme an den Anbieter des Betriebssystems (Apple oder Google). Flowtown speichert davon nichts. Einverstanden?');
      if (!ok) return;
      settings.voiceIn = true; store.set('settings', settings);
    }
    if (canSpeak && !auto && !restart) speechSynthesis.cancel();
    if (!auto && !restart) unlockSpeech();
    const prompt = (opts && opts.prompt) || 'Ich höre zu …';
    const patient = assistBig && !$('#assist').hidden;
    recog = new SR();
    recog.auto = auto; recog.patient = patient;
    recog.lang = 'de-DE'; recog.interimResults = patient; recog.maxAlternatives = 3; recog.continuous = patient;
    const r0 = recog, t0 = (opts && opts.t0) || Date.now();
    let autoT = null, silenceT = null;
    const finals = [];
    const heard = (interim) => { const ch = $('#call-heard'); if (ch) { const t = finals.map((f) => f[0]).concat(interim ? [interim] : []).join(' ').trim(); ch.textContent = t ? `„${t}“` : ''; } };
    recog.onresult = (e) => {
      if (!patient) {
        const alts = Array.from(e.results[0] || []).map((a) => a.transcript).filter(Boolean);
        if (alts.length) handleCommand(alts);
        return;
      }
      let interim = '';
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const r = e.results[k];
        if (r.isFinal) finals.push(Array.from(r).map((a) => a.transcript).filter(Boolean)); else interim += r[0] ? r[0].transcript : '';
      }
      r0.gotSpeech = true; heard(interim);
      clearTimeout(silenceT);
      silenceT = setTimeout(() => { try { r0.stop(); } catch (er) { /* schon beendet */ } }, PATIENT_SILENCE);
    };
    recog.onerror = (e) => {
      if (patient) {
        if (e.error === 'no-speech' || e.error === 'aborted') return;   // das Ende entscheidet: neu zuhören oder aufhören
        r0.userAbort = true;
        micStatus(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Das Mikrofon ist für Flowtown nicht freigegeben. Erlaube es in den Einstellungen des Browsers.' : 'Die Spracherkennung ist gerade nicht erreichbar.');
        return;
      }
      if (auto) {
        // im Gespräch: Schweigen beendet es still; verweigert das Gerät den Start ohne Antippen, ein Hinweis
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') micStatus('Zum Antworten aufs Mikrofon tippen.');
        else if (e.error === 'no-speech' || e.error === 'aborted') micStatus($('#assist').hidden ? '' : 'Zum Weiterfragen aufs Mikrofon tippen.');
        else micStatus('Die Spracherkennung ist gerade nicht erreichbar.');
        return;
      }
      const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Das Mikrofon ist für Flowtown nicht freigegeben. Erlaube es in den Einstellungen des Browsers.' : e.error === 'no-speech' ? 'Ich habe nichts gehört.' : e.error === 'aborted' ? '' : 'Die Spracherkennung ist gerade nicht erreichbar.';
      if (msg) { micStatus(msg); speak(msg, { now: true, force: true }); }
    };
    recog.onend = () => {
      clearTimeout(autoT); clearTimeout(silenceT);
      const mine = recog === r0;
      if (mine) recog = null;
      micUI(false);
      if ($('#mic-status').textContent === prompt) micStatus('');
      if (!patient || !mine) return;
      if (finals.length) { handleCommand([finals.map((f) => f[0]).join(' ')]); return; }
      // nichts gesagt: bis zu 30 Sekunden weiter zuhören, außer jemand hat aufgelegt oder den Knopf getippt
      if (!r0.userAbort && !$('#assist').hidden && Date.now() - t0 < PATIENT_MS) setTimeout(() => { if (!recog && !$('#assist').hidden) listen({ auto: true, restart: true, t0, prompt }); }, 120);
    };
    try {
      recog.start(); micUI(true); micStatus(prompt, true);
      if (!restart) { try { if (navigator.vibrate) navigator.vibrate(auto ? [40, 60, 40] : 60); } catch (e) { /* ohne */ } }
      // Sicherheitsnetz: im Gespräch höchstens 10 Sekunden zuhören (im geduldigen Modus regelt das die Pausenzeit)
      if (auto && !patient) autoT = setTimeout(() => { if (recog === r0) r0.abort(); }, 10000);
    } catch (e) { recog = null; micUI(false); micStatus(auto ? 'Zum Antworten aufs Mikrofon tippen.' : 'Die Spracherkennung konnte nicht starten.'); }
  }
  const cmdNorm = (x) => String(x || '').toLowerCase().replace(/[.,!?;:„“"']/g, ' ').replace(/\s+/g, ' ').trim();
  const MODE_WORDS = [['fuss', /\bzu ?fu(ß|ss)|\blaufen\b|\bgehen\b|\bausgestiegen\b/], ['bahn', /stadtbahn|straßenbahn|strassenbahn|\btram\b|\bbahn\b|\blinie \d/], ['bus', /\bbus\b/], ['zug', /\bzug\b|regionalbahn|\bre ?\d/], ['rad', /\brad\b|fahrrad/], ['auto', /\bauto\b|\bwagen\b/]];
  const modeIn = (c) => { for (const [m, re] of MODE_WORDS) if (re.test(c)) return m; return null; };
  const sayMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} Stunde${Math.floor(m / 60) === 1 ? '' : 'n'}${m % 60 ? ` ${m % 60} Minute${m % 60 === 1 ? '' : 'n'}` : ''}` : `${m} Minute${m === 1 ? '' : 'n'}`);
  function sayDepartures(name, kind) {
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const list = departures(name, now, 90).filter((d) => kind == null || d.kind === kind).slice(0, 5);
    speak(list.length ? `Nächste Abfahrten ${name}: ` + list.map((d) => { const m = d.t + (d.dl > 0 ? d.dl : 0) - nowMin; return `${d.kind === 0 ? 'Stadtbahn' : d.kind === 2 ? '' : 'Bus'} ${d.line} nach ${d.head}, ${d.x ? 'fällt aus' : (m <= 0 ? 'jetzt' : `in ${sayMin(m)}`) + (d.dl >= 2 ? `, ${sayMin(d.dl)} später` : '')}`; }).join('. ') + '.' : `${name}: in der nächsten Zeit keine Abfahrt.`, { now: true, force: true });
  }
  // Haltestelle aus dem Gesagten: eigene Haltestellen zuerst, dann alle aus dem Fahrplan
  function matchStop(phrase) {
    const k = hstNorm(phrase);
    if (!k || !fp) return null;
    const names = settings.haltestellen.concat(fp.names);
    return names.find((n) => hstNorm(n) === k) || names.find((n) => hstNorm(n).startsWith(k) || k.startsWith(hstNorm(n))) || names.find((n) => hstNorm(n).includes(k)) || null;
  }
  // Vergleich ohne Beugung: „zum Alten Markt“ findet „Alter Markt“, „zur Universität“ findet „Universität“
  const stemKey = (x) => hstNorm(String(x || '').toLowerCase().split(/[\s-]+/).map((w) => (w.length > 4 ? w.replace(/(en|em|er|es|e|n|s)$/, '') : w)).join(' '));
  function matchZiel(phrase) {
    const k = stemKey(phrase);
    if (!k) return null;
    const zk = (z) => stemKey(z.name);
    return settings.ziele.find((z) => zk(z) === k) || settings.ziele.find((z) => zk(z).startsWith(k) || k.startsWith(zk(z))) || settings.ziele.find((z) => zk(z).includes(k)) || null;
  }
  function setModeVoice(m) {
    setModeUI(m); settings.mode = m; store.set('settings', settings); applyModeWords(m); renderToday();
  }
  async function handleCommand(alts) {
    micStatus('Verstanden: „' + alts[0] + '“');
    if (pendingIntent && apiBase()) { askAssist(alts[0], true); return; }
    for (const a of alts) if (await runCommand(cmdNorm(a))) return;
    if (apiBase()) { askAssist(alts[0], true); return; }   // kein fester Befehl: freie Frage an die Assistenz
    speak('Das habe ich nicht verstanden. Sag zum Beispiel: Losfahren, Zur Uni, Nächste Bahn ab Jahnplatz, oder Hilfe.', { now: true, force: true });
  }
  // ---------- „Wo bin ich?“: Adresse, Blickrichtung, nächste Ampel und Haltestelle mit Ausstattung, zum Vorlesen ----------
  const WO_RE = /^(wo bin ich|wo stehe ich|wo sind wir|was ist (hier|um mich)|umgebung|beschreib\w* (mir )?(die |meine )?umgebung)/;
  let compass = null, compassOn = false;
  const compassWanted = () => settings.compass === true || (settings.compass == null && settings.access.on && settings.access.type === 'sehen');
  function onOri(e) {
    let h = null;
    if (e.webkitCompassHeading != null && isFinite(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) h = (360 - e.alpha) % 360;
    if (h != null && isFinite(h)) compass = { h, t: Date.now() };
  }
  function compassStart(ask) {
    if (compassOn) return Promise.resolve(true);
    const D = window.DeviceOrientationEvent;
    if (!D) return Promise.resolve(false);
    const go = () => { window.addEventListener('deviceorientationabsolute', onOri, true); window.addEventListener('deviceorientation', onOri, true); compassOn = true; return true; };
    if (typeof D.requestPermission === 'function') {
      if (!ask) return Promise.resolve(false);
      return D.requestPermission().then((r) => (r === 'granted' ? go() : false)).catch(() => false);
    }
    return Promise.resolve(go());
  }
  // Richtung zu einem Punkt: mit Blickrichtung als „rechts von dir, auf 3 Uhr“, sonst als Himmelsrichtung
  function woDir(from, to, heading) {
    const b = bearing(from, to);
    if (heading == null) return `Richtung ${DIRS[Math.round(b / 45) % 8]}`;
    const rel = (b - heading + 360) % 360, clock = Math.round(rel / 30) % 12 || 12;
    const w = rel < 25 || rel > 335 ? 'vor dir' : rel < 70 ? 'halb rechts vor dir' : rel < 110 ? 'rechts von dir' : rel < 160 ? 'halb rechts hinter dir' : rel <= 200 ? 'hinter dir' : rel < 250 ? 'halb links hinter dir' : rel < 290 ? 'links von dir' : 'halb links vor dir';
    return `${w}, auf ${clock} Uhr`;
  }
  const woM = (m) => `etwa ${roundM(m)} Meter`;
  function woSignal(p, heading) {
    let best = null, bd = Infinity;
    for (const c of allClusters()) {
      const d = dist(c, p);
      if (d > 250) continue;
      // in Blickrichtung zählt doppelt so nah
      const ahead = heading != null && angDiff(bearing(p, c), heading) <= 60;
      const score = ahead ? d / 2 : d;
      if (score < bd) { bd = score; best = c; }
    }
    if (!best) return '';
    const yes = (v) => v === 'yes', no = (v) => v === 'no', A = accOf(best);
    const has = [yes(A.sound) && 'Tonsignal', yes(A.vib) && 'Vibration', yes(A.btn) && 'Taster', yes(A.tact) && 'Bodenleitstreifen'].filter(Boolean);
    const not = [no(A.sound) && 'Tonsignal', no(A.tact) && 'Bodenleitstreifen'].filter(Boolean);
    const n = nameOf(best.id);
    let t = `${cap(woDir(p, best, heading))}, ${woM(dist(p, best))} entfernt, ist eine Ampel${n ? ` an ${n}` : ''}`;
    t += has.length ? `, mit ${has.join(', ').replace(/, ([^,]+)$/, ' und $1')}` : '';
    t += not.length ? `, ohne ${not.join(' und ')}` : '';
    if (A.sound == null && A.vib == null) t += '. Ob sie ein Tonsignal hat, ist nicht erfasst';
    return t + '.';
  }
  function woStop(p, heading) {
    if (!fp) return '';
    const idx = fpStopsNear(p, 400);
    if (!idx.length) return '';
    idx.sort((a, b) => dist(p, { lat: fp.stops[a][2], lon: fp.stops[a][3] }) - dist(p, { lat: fp.stops[b][2], lon: fp.stops[b][3] }));
    const i = idx[0], st = fp.stops[i], q = { lat: st[2], lon: st[3] }, name = st[1].replace(FP_PREFIX, '');
    const tram = fp.kindOf && fp.kindOf[i] && fp.kindOf[i].has(0);
    let lines = [];
    try {
      const seen = new Set();
      for (const d of departures(name, new Date(), 90)) { const k = `${d.kind}|${d.line}`; if (!seen.has(k)) { seen.add(k); lines.push(d); } }
    } catch (e) { lines = []; }
    // ohne Abfahrten in den nächsten 90 Minuten (nachts, Fahrplanwechsel): die Linien aus dem Fahrplan, unabhängig von der Uhrzeit
    if (!lines.length) {
      const idx2 = new Set(fp.byName[name] || []), seen = new Set();
      for (const [r, pi, , , , , nr] of fp.trips) {
        if (!(fp.patterns[pi] || []).some((si) => idx2.has(si))) continue;
        const d = { line: fpLine(r, nr), kind: fp.routes[r][1] }, k = `${d.kind}|${d.line}`;
        if (!seen.has(k)) { seen.add(k); lines.push(d); }
        if (lines.length > 12) break;
      }
    }
    const byNum = (a, b) => (parseInt(a, 10) || 999) - (parseInt(b, 10) || 999) || String(a).localeCompare(String(b));
    const tl = lines.filter((d) => d.kind === 0).map((d) => d.line).sort(byNum), bl = lines.filter((d) => d.kind !== 0 && d.kind !== 2).map((d) => d.line).sort(byNum);
    const info = stopInfo([q.lat, q.lon], tram ? 'bahn' : undefined);
    let t = `Die Haltestelle ${name} ist ${woM(dist(p, q))} ${woDir(p, q, heading)}`;
    const ln = [tl.length && `Stadtbahn ${tl.slice(0, 4).join(', ')}`, bl.length && `Bus ${bl.slice(0, 4).join(', ')}`].filter(Boolean);
    if (ln.length) t += `, ${ln.join(', ')}`;
    t += '.';
    if (info && tram) t += info.ok === 1 ? ' Mit Hochbahnsteig, stufenlos.' : info.ok === 0 ? ' Kein Hochbahnsteig, nicht stufenlos.' : info.ok === 2 ? ' Nur teilweise stufenlos.' : ' Ob sie stufenlos ist, ist nicht erfasst.';
    if (info && info.aufzug) t += ' In der Station gibt es einen Aufzug.';
    return t;
  }
  let woBusy = false;
  async function whereAmI(spoken) {
    if (woBusy) return;
    woBusy = true;
    const say = (t, o) => { if (spoken || voiceOn()) speak(t, Object.assign({ now: true, force: true }, o || {})); };
    assistAct = null;
    showAssist('Wo bin ich?', null);
    try {
      const pos = await new Promise((resolve) => {
        if (!('geolocation' in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition((x) => resolve(x.coords), () => resolve(null), { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
      });
      if (!pos) { const m = 'Ich kenne deinen Standort gerade nicht. Erlaube den Standortzugriff und versuch es noch einmal.'; showAssist('Wo bin ich?', m); say(m); return; }
      const p = { lat: pos.latitude, lon: pos.longitude };
      // Blickrichtung: beim Gehen die Laufrichtung, im Stehen der Kompass
      let heading = null;
      if (rec && rec.samples.length > 2 && (rec.st.lastVs || 0) > 0.8) heading = currentHeading(rec.samples[rec.samples.length - 1]);
      if (heading == null && compass && Date.now() - compass.t < 5000) heading = compass.h;
      await Promise.all([!areaCovers(p) ? fetchSignals(p).catch(() => null) : null, !fp || fpWrong() ? loadFahrplan().catch(() => null) : null]);
      let adr = null;
      if (apiBase()) adr = await api(`/api/wo?pos=${p.lat.toFixed(4)},${p.lon.toFixed(4)}${heading != null ? '&h=' + Math.round(heading) : ''}`).catch(() => null);
      const parts = [];
      const h = adr && adr.hier;
      if (h && h.strasse) parts.push(`Du stehst bei ${h.strasse}${h.nr ? ' ' + h.nr : ''}${h.teil ? ', ' + h.teil : ''}.`);
      else parts.push('Die Adresse kann ich gerade nicht bestimmen.');
      if (heading != null) {
        const v = adr && adr.voraus;
        parts.push(`Du schaust Richtung ${DIRS[Math.round(heading / 45) % 8]}${v && h && v.strasse === h.strasse && v.nr && v.nr !== h.nr ? `, zu Hausnummer ${v.nr}` : v && v.strasse && h && v.strasse !== h.strasse ? `, zur ${v.strasse}` : ''}.`);
      }
      const sig = woSignal(p, heading); if (sig) parts.push(sig);
      const stp = woStop(p, heading); if (stp) parts.push(stp);
      if (!sig && !stp) parts.push('In der Nähe kenne ich keine Ampel und keine Haltestelle.');
      if (pos.accuracy > 25) parts.push(`Achtung: Das GPS ist gerade ungenau, auf etwa ${Math.round(pos.accuracy)} Meter.`);
      else if (heading == null) parts.push(compassWanted() ? 'Für Angaben wie rechts oder links halte das Handy flach vor dich.' : 'Für Angaben wie rechts oder links schalte unter Barrierefrei unterwegs den Kompass ein, oder geh ein paar Schritte.');
      const text = parts.join(' ');
      showAssist('Wo bin ich?', text);
      assistLast = text;
      say(text, spoken ? { onend: () => { if (!$('#assist').hidden) listenAfter('Noch eine Frage? Ich höre zu …'); } } : null);
    } finally { woBusy = false; }
  }
  // ---------- Assistenz (Stufe 3): freie Fragen, Antwort aus den Flowtown-Daten ----------
  let assistHist = [], assistAct = null, assistBusy = false, assistLast = '';
  // gesprochene Fragen werden immer laut beantwortet, getippte, wenn die Ansagen an sind
  // ---------- Eine Fahrt genau beschreiben: für „Wie lange habe ich bei der letzten Fahrt gestanden?“ ----------
  // Dieselben Zahlen wie in der Fahrtbilanz; Zeiten in Worten, damit nichts umgerechnet oder gerundet werden muss
  function durWords(ms) {
    const sec = Math.max(0, Math.round(ms / 1000)), h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, x = sec % 60;
    const w = (n, one, many) => `${n === 1 ? 'eine' : n} ${n === 1 ? one : many}`;
    if (h) return `${w(h, 'Stunde', 'Stunden')}${m ? ' ' + w(m, 'Minute', 'Minuten') : ''}`;
    if (m) return `${w(m, 'Minute', 'Minuten')}${x ? ' ' + w(x, 'Sekunde', 'Sekunden') : ''}`;
    return w(x, 'Sekunde', 'Sekunden');
  }
  function tripFacts(t) {
    const halts = t.events.filter((e) => e.type === 'halt');
    const sum = (l) => l.reduce((a, e) => a + (e.wait || 0), 0);
    const amp = halts.filter((e) => e.signal), hst = halts.filter((e) => !e.signal && e.atStop), sonst = halts.filter((e) => !e.signal && !e.atStop);
    const trs = t.transfers || [];
    const dauer = (t.end || t.start) - t.start, stand = sum(halts);
    const longest = amp.slice().sort((a, b) => b.wait - a.wait)[0];
    const d = new Date(t.start), diff = Math.round((dayStart(Date.now()) - dayStart(t.start)) / 864e5);
    const tag = diff === 0 ? 'heute' : diff === 1 ? 'gestern' : d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    return {
      tag, start_uhr: clock(t.start), ende_uhr: clock(t.end || t.start), verkehrsmittel: legChain(t),
      dauer: durWords(dauer), strecke_km: Math.round(t.distance / 100) / 10,
      gestanden_gesamt: durWords(stand),
      an_ampeln: amp.length ? `${durWords(sum(amp))} bei ${amp.length === 1 ? 'einem Halt' : amp.length + ' Halten'}` : 'kein Halt an einer Ampel',
      ampeln_ohne_halt: t.events.filter((e) => e.type === 'pass').length,
      an_haltestellen: hst.length ? `${durWords(sum(hst))} bei ${hst.length === 1 ? 'einem Halt' : hst.length + ' Halten'}` : null,
      ohne_ampel_stau: sonst.length ? `${durWords(sum(sonst))} bei ${sonst.length === 1 ? 'einem Halt' : sonst.length + ' Halten'}` : null,
      umstiege: trs.length ? `${trs.length}, zusammen ${durWords(sum(trs.map((r) => ({ wait: r.wait }))))}` : null,
      laengster_ampelhalt: longest ? `${durWords(longest.wait)} an ${/\d+[.,]\d{2,}/.test(labelFor(longest)) ? 'einer Ampel ohne Namen' : labelFor(longest)}` : null,
      in_bewegung: t.stats && t.stats.movingMs ? durWords(t.stats.movingMs) : null
    };
  }
  const trs1 = (t) => { const r = t.transfers || []; return `${r.length === 1 ? 'ein Umstieg' : r.length + ' Umstiege'} mit zusammen ${durWords(r.reduce((a, x) => a + x.wait, 0))} zu Fuß und Warten`; };
  function lastTripText(t, frage) {
    const f = tripFacts(t), standQ = /(gestanden|gewartet|warte|stand|halt|ampel|stau)/.test(cmdNorm(frage || ''));
    const when = `${f.tag} von ${f.start_uhr} bis ${f.ende_uhr} Uhr, ${f.verkehrsmittel}, ${fmtNum(f.strecke_km, 1)} Kilometer`;
    const ampQ = /ampel/.test(cmdNorm(frage || ''));
    const parts = ampQ ? [`An Ampeln hast du bei deiner letzten Fahrt ${f.an_ampeln === 'kein Halt an einer Ampel' ? 'nicht gewartet' : f.an_ampeln.replace(/ bei /, ' gewartet, bei ')}. Gestanden insgesamt ${f.gestanden_gesamt}. Die Fahrt war ${when}, insgesamt ${f.dauer}.`]
      : standQ ? [`Bei deiner letzten Fahrt hast du ${f.gestanden_gesamt} gestanden. Die Fahrt war ${when}, insgesamt ${f.dauer}.`]
      : [`Deine letzte Fahrt war ${when}. Insgesamt ${f.dauer}, gestanden hast du ${f.gestanden_gesamt}.`];
    const det = [f.an_ampeln !== 'kein Halt an einer Ampel' ? `an Ampeln ${f.an_ampeln}` : 'an keiner Ampel', f.an_haltestellen && `an Haltestellen ${f.an_haltestellen}`, f.ohne_ampel_stau && `ohne Ampel, etwa im Stau, ${f.ohne_ampel_stau}`].filter(Boolean);
    parts.push(`Davon ${det.join(', ')}.`);
    if (f.umstiege) parts.push(`Dazu ${trs1(t)}.`);
    if (f.laengster_ampelhalt && t.events.filter((e) => e.type === 'halt' && e.signal).length > 1) parts.push(`Am längsten: ${f.laengster_ampelhalt}.`);
    if (f.ampeln_ohne_halt) parts.push(`${f.ampeln_ohne_halt} Ampel${f.ampeln_ohne_halt === 1 ? '' : 'n'} ohne Halt.`);
    return parts.join(' ');
  }
  // Fragen zur letzten Fahrt beantwortet die App selbst, genau und ohne KI
  const LAST_RE = /\b(letzte[nrms]?|vorige[nrms]?|zuletzt|eben|gerade eben)\b/;
  const LAST_TOPIC = /\b(fahrt|weg|tour|strecke|unterwegs|gefahren|gestanden|gewartet|gestoppt)\b/;
  const LAST_WHAT = /(gestanden|gewartet|stand|halt|ampel|lange|dauer|zeit|minuten|wie war|unterwegs|gefahren|stau)/;
  const isLastTripQ = (q) => { const c = cmdNorm(q); return LAST_RE.test(c) && LAST_TOPIC.test(c) && LAST_WHAT.test(c) && !/\b(woche|monat|tage|immer|meistens|schnitt)\b/.test(c); };
  function answerLastTrip(frage, spoken) {
    const t = trips.filter((x) => !x.demo).sort((a, b) => b.start - a.start)[0];
    const msg = t ? lastTripText(t, frage) : 'Ich habe noch keine Fahrt von dir. Tippe auf „Ohne Ziel aufzeichnen“, dann zeichnet Flowtown deine erste Fahrt auf.';
    assistAct = null; assistLast = msg;
    showAssist(frage, msg);
    $('#assist').querySelector('.small.muted:last-child').textContent = 'Aus deinen Fahrten, auf deinem Gerät berechnet. Dieselben Zahlen wie in der Fahrtbilanz.';
    assistHist = assistHist.concat([{ role: 'user', content: frage }, { role: 'assistant', content: msg }]).slice(-6);
    if (spoken || voiceOn()) speak(msg, Object.assign({ now: true, force: true }, spoken ? { onend: () => { if (!$('#assist').hidden) listenAfter('Noch eine Frage? Ich höre zu …'); } } : {}));
    return true;
  }
  async function askAssist(frage, spoken) {
    const say = (t, o) => { if (spoken || voiceOn()) speak(t, Object.assign({ now: true, force: true }, o || {})); };
    frage = String(frage || '').trim();
    if (!frage || assistBusy) return;
    let shown = frage;
    if (pendingIntent) { const d = intentDef(pendingIntent); pendingIntent = null; frage = d.tpl.replace('{x}', frage.replace(/^(zu[mr]?|nach|in die|ins|zur|zum)\s+/i, '')); }
    if (isLastTripQ(frage)) { answerLastTrip(frage, spoken); return; }
    if (!settings.assist) {
      const ok = window.confirm('Für freie Fragen gehen deine Frage, dein Profil und dein ungefährer Standort (auf etwa 100 m gerundet) an den Flowtown-Server und an Mistral (KI-Anbieter, Rechenzentren in der EU). Gespeichert wird nichts. Einverstanden?');
      if (!ok) { speak('Gut, dann ohne Assistenz.', { now: true, force: true }); return; }
      settings.assist = true; store.set('settings', settings);
    }
    assistBusy = true;
    showAssist(shown, null);
    if (spoken) setTimeout(() => { if (assistBusy) say('Einen Moment.'); }, 500);   // erst, wenn das Mikrofon frei ist
    else say('Einen Moment.');
    try {
      let pos = rec && rec.last ? [rec.last.lat, rec.last.lon] : await myStart().catch(() => null);
      if (pos && !Array.isArray(pos)) pos = [pos.lat, pos.lon];
      const k = stemKey(frage);
      const ziele = settings.ziele.filter((z) => k.includes(stemKey(z.name))).map((z) => ({ name: z.name, lat: z.lat, lon: z.lon }));
      const L = rec && rec.ln;
      const kontext = { pos: pos ? pos.map((x) => Math.round(x * 1000) / 1000) : null, verkehrsmittel: rec ? (rec.transfer ? 'fuss' : rec.curMode) : selectedMode(), profil: settings.access.on ? ACCESS_LABEL[settings.access.type] : '', profil_typ: settings.access.on ? settings.access.type : '', vorrang: vorrangSchnell() ? 'schnell' : '',
        unterwegs: !!rec, haltestelle: L && L.seq.length ? L.seq[L.seq.length - 1] : '', ziele, auswertung: settings.assistStats ? assistStats() : null };
      const r = await postJson('/api/assist', { frage, kontext, verlauf: assistHist });
      assistHist = assistHist.concat([{ role: 'user', content: frage }, { role: 'assistant', content: r.antwort }]).slice(-6);   // drei Fragen und Antworten, damit Rückfragen nichts wiederholen
      assistAct = r.aktion || null;
      showAssist(shown, r.antwort);
      assistLast = r.antwort;
      say(r.antwort, spoken ? { onend: () => { if (!$('#assist').hidden) listenAfter('Noch eine Frage? Ich höre zu …'); } } : null);
    } catch (e) {
      const msg = /eingerichtet/.test(e.message) ? 'Die Assistenz ist auf dem Server noch nicht eingerichtet.' : /keine weiteren/.test(e.message) ? e.message : (e.name === 'AbortError' ? 'Das dauert gerade länger als gewöhnlich. Versuch es bitte noch einmal.' : 'Die Assistenz ist gerade nicht erreichbar.');
      assistAct = null;
      showAssist(shown, msg);
      assistLast = msg;
      say(msg);
    } finally { assistBusy = false; }
  }
  // Kurze Zusammenfassung der eigenen Auswertung für Fragen wie „Wo warte ich am längsten?“; nur mit Einstellung
  function assistStats() {
    // nur echte Namen; Ampeln ohne Namen heißen intern nach ihren Koordinaten, die gehen nicht mit
    const safe = (n) => (/\d+[.,]\d{2,}/.test(String(n || '')) ? 'Ampel ohne Namen' : String(n || '').slice(0, 60));
    const real = trips.filter((t) => !t.demo);
    if (!real.length) return { fahrten_gesamt: 0 };
    const since = Date.now() - 30 * 864e5, month = real.filter((t) => t.start >= since);
    const week = real.filter((t) => t.start >= weekStart()), wag = aggregate(week), mag = aggregate(month);
    const by = {}; month.forEach((t) => { by[t.mode] = (by[t.mode] || 0) + 1; });
    const fresser = mag.per.filter((a) => a.halts).sort((x, y) => y.wait - x.wait).slice(0, 3)
      .map((a) => ({ ampel: safe(labelFor(a.sample || a)), halte: a.halts, vorbei_ohne_halt: a.passes, warten_s_schnitt: Math.round(a.wait / a.halts / 1000) }));
    const { routes, own } = sortedRoutes(MODE_GROUP[selectedMode()]);
    const g = routes.find((x) => own(x)) || routes[0];
    const weg = g ? { name: `${safe(labelFor(g.first))} bis ${safe(labelFor(g.last))}`, fahrten: g.trips.length, fahrzeit_min: Math.round(avgOf(g.trips.map((t) => (t.end || t.start) - t.start)) / 60000), ampel_warten_min: Math.round(avgOf(g.trips.map(tripWait)) / 6000) / 10 } : null;
    return {
      fahrten_gesamt: real.length,
      woche: { fahrten: week.length, ampeln_mit_halt_prozent: wag.halts + wag.passes ? Math.round(wag.halts / (wag.halts + wag.passes) * 100) : null, gewartet_min: Math.round(wag.wait / 60000) },
      letzte_30_tage: { fahrten: month.length, nach_verkehrsmittel: by, gewartet_min: Math.round(mag.wait / 60000) },
      haeufigster_weg: weg,
      letzte_fahrten: real.slice().sort((a, b) => b.start - a.start).slice(0, 3).map(tripFacts).map((f) => Object.assign(f, { laengster_ampelhalt: f.laengster_ampelhalt && f.laengster_ampelhalt.replace(/-?\d{1,3}[.,]\d{3,},?\s*-?\d{1,3}[.,]\d{3,}/g, 'Ampel ohne Namen') })),
      zeitfresser: fresser,
      verkehrsmittel_vergleich: ['auto', 'oepnv', 'rad', 'fuss'].map((gr) => {
        const ts = month.filter((t) => MODE_GROUP[t.mode] === gr && t.end);
        if (!ts.length) return null;
        return { verkehrsmittel: GROUP_WITH[gr], fahrten: ts.length, schnitt_min: Math.round(avgOf(ts.map((t) => t.end - t.start)) / 60000), gestanden_schnitt_min: Math.round(avgOf(ts.map(tripWait)) / 6000) / 10, km_schnitt: Math.round(avgOf(ts.map((t) => (t.distance || 0) / 1000)) * 10) / 10 };
      }).filter(Boolean),
      ampel_bewertungen: (() => {
        const by = {};
        for (const t of real) for (const e of t.events || []) if (e.signal && Array.isArray(e.tags)) for (const tag of e.tags) if (tag !== 'alles gut') { const k = e.signal + '|' + tag; by[k] = by[k] || { ampel: safe(labelFor(e)), stichwort: tag, anzahl: 0 }; by[k].anzahl++; }
        return Object.values(by).sort((x, y) => y.anzahl - x.anzahl).slice(0, 6);
      })(),
      tipps: computeTips().slice(0, 5).map((t) => `${plain(t.head || t.title)}: ${plain(t.short)}`.replace(/(Ampel bei )?-?\d{1,3}[.,]\d{3,},?\s*-?\d{1,3}[.,]\d{3,}/g, 'Ampel ohne Namen').slice(0, 200))
    };
  }
  let assistBig = false, assistTick = null, assistT0 = 0;
  // Großer Sprachmodus wie ein Anruf: Zustand (zuhören, nachdenken, sprechen), Gesprächszeit, roter Hörer zum Auflegen
  function assistLoop() {
    const el = $('#assist');
    if (el.hidden || !assistBig) { clearInterval(assistTick); assistTick = null; delete el.dataset.state; return; }
    const st = recog ? 'listen' : assistBusy ? 'think' : (canSpeak && speechSynthesis.speaking) ? 'speak' : 'idle';
    el.dataset.state = st;
    const t = { listen: 'Ich höre zu …', think: 'Ich denke nach …', speak: 'Ich spreche …', idle: SR ? 'Tippe auf den grünen Knopf und sprich.' : '' }[st];
    const cs = $('#call-state'); if (cs && cs.textContent !== t) cs.textContent = t;
    const ct = $('#call-time'); if (ct) { ct.hidden = false; const x = Math.floor((Date.now() - assistT0) / 1000); ct.textContent = Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); }
  }
  function assistLoopStart(fresh) {
    if (fresh || !assistT0) assistT0 = Date.now();
    clearInterval(assistTick); assistTick = setInterval(assistLoop, 400); assistLoop();
  }
  const sprechIcon = () => (settings.sprechIcon === 'phone' ? 'handset' : 'mic');
  function showAssist(frage, antwort) {
    const el = $('#assist');
    el.classList.toggle('big', assistBig);
    el.classList.toggle('nosr', !SR);
    const act = antwort && assistAct && assistAct.typ === 'ziel' ? `<button type="button" class="btn" data-assist="ziel">${ic('route')}${esc(assistAct.name)} in „Wohin?“ öffnen</button>` : '';
    el.innerHTML = `<div class="assist-head"><b>${ic(sprechIcon())}Frag Flowtown</b><span class="call-time" id="call-time" hidden></span>${canSpeak && antwort ? `<button type="button" class="vf-x vf-say" data-assist="say" aria-label="Antwort vorlesen">${ic('sound')}</button>` : ''}<button type="button" class="vf-x" data-assist="close" aria-label="Schließen">${ic('x')}</button></div>
      ${assistBig ? '<p class="call-state" id="call-state" role="status" aria-live="polite"></p><div class="call-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><p class="call-heard" id="call-heard" aria-live="off"></p>' : ''}
      ${frage ? `<p class="assist-q">${esc(frage)}</p>` : ''}
      <p class="assist-a" role="status" aria-live="polite">${antwort ? esc(antwort) : 'Einen Moment …'}</p>${act}
      <form class="assist-form" data-assist="form"><label class="sr-only" for="assist-inp">Weitere Frage</label><input id="assist-inp" type="text" placeholder="Weitere Frage tippen …" autocomplete="off" enterkeyhint="send"><button class="btn" type="submit">Fragen</button>${SR ? `<button type="button" class="btn assist-mic" data-assist="mic" aria-label="Sprechen">${ic(sprechIcon())}</button>` : ''}</form>
      ${assistBig ? `<button type="button" class="hangup" data-assist="close" aria-label="Auflegen und Gespräch beenden">${ic('handset')}<span>Auflegen</span></button>` : ''}
      <p class="small muted">Antworten aus den Daten von Flowtown, formuliert von einer KI (Mistral). Bitte vor Ort prüfen.</p>`;
    el.hidden = false;
    if (assistBig && !assistTick) assistLoopStart();
    micStatus('');
  }
  const TIPS_RE = /(lies|lese|sag|nenn)\b.*\btipps?\b|\btipps? vor(lesen)?\b/;
  async function runCommand(c) {
    if (!c) return false;
    if (merkVoice(c)) return true;
    if (!$('#assist').hidden && /^(danke|dankeschön|vielen dank|tschüss|tschüs|ciao|das wars?|das war es|das war s|nein danke|nichts mehr|ende|fertig|schluss)\b/.test(c)) {
      $('#assist').hidden = true; micStatus(''); speak('Gern.', { now: true, force: true }); return true;
    }
    if (/verlaufen|nicht (mehr )?weiter|brauche (jemanden|hilfe von|videohilfe)|be my eyes|ich weiß nicht (mehr )?wo/.test(c) && !/notfall|unfall|gestürzt/.test(c)) {
      speak('Sprich Passanten an, sie helfen meist gern. Oder nutze die kostenlose App Be My Eyes: Dort hilft dir ein Mensch per Videoanruf. Bei Gefahr wähle 112. Frag mich gern nach Hilfe am Bahnhof.', { now: true, force: true });
      return true;
    }
    if (/notfall|notruf|krise|krisendienst|rettungsdienst|^hilfe hilfe/.test(c)) { openSos(); speak('Im Notfall wähle 112. Ich habe die Notrufnummern geöffnet.', { now: true, force: true }); return true; }
    if (TIPS_RE.test(c)) { renderTips(); readTips(); return true; }
    if (/^(wiederhol|nochmal|noch mal|noch einmal|wie bitte|was hast du gesagt)/.test(c)) { navRepeat(); return true; }
    if (/\bhilfe\b|was kann ich sagen|welche befehle/.test(c)) { speak(MIC_HELP, { now: true, force: true }); return true; }
    if (/ansagen (aus|stopp|stop)|sei (still|leise)|ruhe bitte/.test(c)) { setVoice(false); if (canSpeak) speechSynthesis.cancel(); micStatus('Ansagen aus'); return true; }
    if (/ansagen (an|ein)/.test(c)) { setVoice(true); speak('Ansagen an.', { now: true }); return true; }
    // Rückfrage unterwegs (Ausgestiegen? Eingestiegen?)
    if (legSuggest) {
      if (/^(ja|jawohl|genau|stimmt|richtig|ok|okay)\b/.test(c)) { changeMode(legSuggest.mode, legSuggest.t); return true; }
      if (/^(nein|nee|falsch|stimmt nicht)\b/.test(c)) { legNo = { mode: legSuggest.mode, t: Date.now() }; hideLegSuggest(); speak('Gut, ich bleibe dabei.', { now: true }); return true; }
    }
    if (WO_RE.test(c) && !(rec && isTransit(rec.curMode) && !rec.transfer)) { whereAmI(true); return true; }
    if (rec) {
      if (/(fahrt|aufzeichnung|weg)? ?(beenden|beende|stoppen|stopp\b|stop\b)|angekommen|ich bin da\b/.test(c)) { speak('Fahrt beendet.', { now: true }); finishTrip(); return true; }
      if (/wie lange noch|wann bin ich|wann komme ich|ankunft|restzeit/.test(c)) {
        const pl = rec.trip.plan, now = Date.now(), gone = Math.round((now - (rec.trip.start || rec.startedAt)) / 60000);
        if (pl && pl.dauer) { const left = Math.round((pl.t + pl.dauer * 1000 - now) / 60000); speak(left > 0 ? `Bis ${pl.name} noch etwa ${sayMin(left)}, laut Planung.` : `Laut Planung wärst du schon bei ${pl.name}. Du bist ${sayMin(gone)} unterwegs.`, { now: true, force: true }); }
        else speak(`Kein Ziel gesetzt. Du bist seit ${sayMin(gone)} unterwegs.`, { now: true, force: true });
        return true;
      }
      if (/nächste[rn]? (halt|haltestelle)|welche haltestelle|wo bin ich|wo sind wir/.test(c)) {
        const L = rec.ln;
        if (L && L.seq.length) { const cur = L.est ? L.est.name : L.seq[L.seq.length - 1], nx = L.est ? L.est.next : L.next; speak(`${L.est ? 'Etwa ' : ''}${cur}.${nx ? ' Nächster Halt: ' + nx + '.' : ''}`, { now: true, force: true }); }
        else speak(`${$('#drive-state').textContent}. ${$('#drive-dir').textContent || ''}`, { now: true, force: true });
        return true;
      }
      if (/bilanz|wie viele ampeln|wie lange gewartet|wartezeit/.test(c)) {
        speak(`${$('#drive-halts').textContent} Halte an Ampeln, zusammen ${$('#drive-wait').textContent} Minuten. ${$('#drive-pass').textContent} Ampeln ohne Halt.`, { now: true, force: true });
        return true;
      }
      const m = /jetzt|weiter|umgestiegen|eingestiegen|ausgestiegen|wechsel/.test(c) || c.split(' ').length <= 3 ? modeIn(c) : null;
      if (m) { changeMode(m); return true; }
      return false;
    }
    // Abfahrten: „Nächste Bahn ab Jahnplatz“, „Wann fährt der nächste Bus“, „Abfahrten Rathaus“
    // Befehle nur, wenn der ganze Satz einer ist; sonst geht die Frage an die Assistenz
    const PRE = '^(?:(?:jetzt|bitte|ich will|ich möchte)\\s+)?(?:(?:mit dem|mit der)\\s+\\S+\\s+|zu ?fu(?:ß|ss)\\s+)?';
    if (/^(?:wann f(?:ä|a)hrt (?:die |der |das )?)?nächste[rn]? (?:bahn|stadtbahn|straßenbahn|bus|zug|abfahrt(?:en)?)\b|^abfahrten\b/.test(c) && !/\b(zum|zur|nach)\b/.test(c)) {
      if (!fp || fpWrong()) await loadFahrplan();
      if (fp && !rtFresh()) await loadEchtzeit().catch(() => false);
      if (!fp) { speak('Der Fahrplan ist gerade nicht geladen.', { now: true, force: true }); return true; }
      const kind = /\bbus\b/.test(c) ? 3 : /\bzug\b/.test(c) ? 2 : /bahn/.test(c) ? 0 : null;
      const at = (c.match(/\b(?:ab|von|an der haltestelle|haltestelle|abfahrten)\s+(.+)$/) || [])[1];
      const name = at ? matchStop(at) : settings.haltestellen[0];
      if (!name) { speak(at ? `Die Haltestelle ${at} kenne ich nicht.` : 'Von welcher Haltestelle? Sag zum Beispiel: Nächste Bahn ab Jahnplatz.', { now: true, force: true }); return true; }
      sayDepartures(name, kind);
      return true;
    }
    if (/vorlesen|lies vor|lies mir/.test(c)) {
      const panel = !$('#view-plan').hidden && $('#wohin .vf-panel');
      if (panel) sayPanel(panel); else speak(wegSay || $('#weg').textContent || 'Hier gibt es gerade nichts vorzulesen.', { now: true, force: true });
      return true;
    }
    // Losfahren, optional mit Verkehrsmittel: „Mit dem Rad los“, „Zu Fuß losgehen“, „Aufzeichnung starten“
    if (new RegExp(PRE + '(?:los|losfahren|losgehen|starten|start|aufzeichnung starten|fahrt starten|starte (?:die )?(?:aufzeichnung|fahrt))(?:\\s+bitte)?$').test(c)) {
      const m = modeIn(c);
      if (m) setModeVoice(m);
      if ($('#view-start').hidden) showView('start');
      startTrip();
      return true;
    }
    // Ziel: „Zur Uni“, „Mit dem Rad zum Alten Markt“, „Wie komme ich nach Brackwede“
    const zm = c.match(new RegExp(PRE + '(?:zum|zur|nach|ins|in die|in den|ziel|wie komme ich (?:zum|zur|nach|zu))\\s+(.+)$'));
    if (zm && zm[1].split(' ').length <= 5) {
      const m = modeIn(c);
      if (m) setModeVoice(m);
      const what = zm[1].replace(/\s(mit dem|mit der|zu ?fu(ß|ss)|bitte)(\s.*)?$/, '').trim();
      if (!apiBase()) { speak('Zum Planen braucht Flowtown den Server.', { now: true, force: true }); return true; }
      let z = matchZiel(what);
      // in einer anderen Stadt meint „zum Hauptbahnhof“ den dortigen, nicht das gespeicherte Ziel in Bielefeld
      if (z && await ortNear()) { const p = rec && rec.last ? [rec.last.lat, rec.last.lon] : lastStart; if (p && dist({ lat: p[0], lon: p[1] }, z) > 30000) z = null; }
      if (!z) {
        speak(`Ich suche ${what}.`, { now: true, force: true });
        try {
          const o = ((await api('/api/ort?q=' + encodeURIComponent(what) + await ortNear())).orte || [])[0];
          if (!o) { speak(`${what} habe ich nicht gefunden.`, { now: true, force: true }); return true; }
          sayAfterZiel = 'neu';
          addZiel(o);
          z = settings.ziele[settings.ziele.length - 1];
          sayAfterZiel = z.id;
          showView('plan');
          speak(`Ich habe ${z.name} als Ziel angelegt und prüfe den Weg.`, { force: true });
          return true;
        } catch (e) { speak('Die Suche ist gerade nicht erreichbar.', { now: true, force: true }); return true; }
      }
      sayAfterZiel = z.id;
      openPlan(z.id);
      const r = zielRes[zKey(z, MODE_GROUP[selectedMode()])];
      if (r && r.data) { sayAfterZiel = null; setTimeout(() => sayPanel($('#wohin .vf-panel')), 80); }
      else speak(`Ich prüfe den Weg ${MODE_GROUP[selectedMode()] === 'oepnv' ? 'mit Bus und Bahn ' : ''}zu ${z.name}.`, { force: true });
      return true;
    }
    const m = c.split(' ').length <= 3 ? modeIn(c) : null;
    if (m) { setModeVoice(m); speak(`${MODES[m].label} gewählt.`, { now: true }); return true; }
    return false;
  }

  // ---------- Unterwegs mit Bus und Bahn: Haltestelle und nächste Haltestelle ----------
  // Erkannt am Bahnsteig (bis 60 m), die Richtung aus den Haltefolgen des Fahrplans. Ohne GPS (Tunnel) geht es nach den
  // Fahrzeiten des Fahrplans weiter, als Schätzung gekennzeichnet.
  function lineState() { return rec.ln || (rec.ln = { seq: [], pat: null, j: -1, t: 0, est: null }); }
  function lineOnFix(p, t) {
    if (!rec || rec.transfer || !isTransit(rec.curMode) || !fp) { if (rec) rec.ln = null; showStopLine(); return; }
    const L = lineState(), k = KIND_OF_MODE[rec.curMode];
    L.est = null;
    const near = fpStopsNear(p, 60, k);
    if (near.length) {
      let best = near[0], bd = Infinity;
      for (const i of near) { const d = dist(p, { lat: fp.stops[i][2], lon: fp.stops[i][3] }); if (d < bd) { bd = d; best = i; } }
      const name = fpName(best);
      if (L.seq[L.seq.length - 1] !== name) {
        L.seq.push(name); L.t = t; L.pos = { lat: fp.stops[best][2], lon: fp.stops[best][3] };
        if (L.seq.length > 1) linePattern(L, k); else { L.pat = null; L.j = -1; L.next = null; }
        speak(L.next ? `${name}. Nächster Halt: ${L.next}.` : `${name}.`);
      } else L.t = t;
    } else if (L.seq.length === 1 && !L.next && L.pos && dist(L.pos, p) > 80) {
      lineDirection(L, k, p);
      if (L.next) speak(`Nächster Halt: ${L.next}.`);
    }
    showStopLine();
  }
  // nur eine Haltestelle bekannt: die Haltefolge, deren nächster Halt in der Richtung liegt, in die die Bahn fährt
  function lineDirection(L, k, p) {
    const name = L.seq[0], go = bearing(L.pos, p);
    let best = null;
    const seenPat = new Set();
    for (const t of fp.trips) {
      if (fp.routes[t[0]][1] !== k || seenPat.has(t[1])) continue;
      seenPat.add(t[1]);
      const pat = fp.patterns[t[1]];
      const j = pat.findIndex((si) => fpName(si) === name);
      if (j < 0 || j >= pat.length - 1) continue;
      const nx = fp.stops[pat[j + 1]], diff = angDiff(bearing(L.pos, { lat: nx[2], lon: nx[3] }), go);
      if (diff <= 60 && (!best || diff < best.diff)) best = { t, j, diff };
    }
    if (!best) return;
    L.pat = best.t; L.j = best.j;
    L.next = fpName(fp.patterns[best.t[1]][best.j + 1]);
  }
  // passende Haltefolge: enthält die letzten Halte in dieser Reihenfolge; die nächste Haltestelle ist die danach
  function linePattern(L, k) {
    const names = L.seq.slice(-3);
    let best = null;
    const seenPat = new Set();
    for (const t of fp.trips) {
      if (fp.routes[t[0]][1] !== k || seenPat.has(t[1])) continue;
      seenPat.add(t[1]);
      const pat = fp.patterns[t[1]];
      let j = -1, ok = true;
      for (const n of names) {
        const jj = pat.findIndex((si, x) => x > j && fpName(si) === n);
        if (jj < 0) { ok = false; break; }
        j = jj;
      }
      if (!ok && names.length > 1) {   // nur die letzte Haltestelle sicher: das reicht für einen Vorschlag
        j = pat.findIndex((si) => fpName(si) === names[names.length - 1]);
        if (j < 0) continue;
        if (!best || best.score < 1) best = { t, j, score: 0.5 };
        continue;
      }
      if (j < 0) continue;
      const score = names.length + (j < pat.length - 1 ? 0.1 : 0);
      if (!best || score > best.score) best = { t, j, score };
    }
    L.pat = best ? best.t : null;
    L.j = best ? best.j : -1;
    const pat = best && fp.patterns[best.t[1]];
    L.next = pat && L.j < pat.length - 1 ? fpName(pat[L.j + 1]) : null;
  }
  // ohne GPS: so viele Halte weiter, wie die Fahrzeiten des Fahrplans seit der letzten Haltestelle hergeben
  function lineEstimate(now) {
    const L = rec && rec.ln;
    if (!L || !L.pat || L.j < 0) return;
    const pat = fp.patterns[L.pat[1]], hops = L.pat[5];
    let j = L.j, m = (now - L.t) / 60000;
    while (j < pat.length - 1 && m >= hops[j] + 0.4) { m -= hops[j] + 0.4; j++; }   // 0,4 min Halt je Haltestelle
    if (j === L.j) { L.est = null; return; }
    const name = fpName(pat[j]);
    if (!L.est || L.est.name !== name) {
      L.est = { name, next: j < pat.length - 1 ? fpName(pat[j + 1]) : null };
      if (voiceOn()) speak(`Etwa ${name}, laut Fahrplan.${L.est.next ? ' Nächster Halt: ' + L.est.next + '.' : ''}`);
    }
  }
  function showStopLine() {
    const el = $('#drive-stop');
    if (!el) return;
    const L = rec && rec.ln;
    if (!L || !L.seq.length) { el.hidden = true; return; }
    const cur = L.est ? L.est.name : L.seq[L.seq.length - 1], next = L.est ? L.est.next : L.next;
    el.innerHTML = `${ic(MODE_ICON[rec.curMode] || 'tram')}<span>${L.est ? 'etwa ' : ''}<b>${esc(cur)}</b>${next ? ` · nächster Halt: <b>${esc(next)}</b>` : ''}${L.est ? ' <span class="small">(laut Fahrplan)</span>' : ''}</span>`;
    el.hidden = false;
  }

  // ---------- Umsteigen (Bus und Bahn) ----------
  const isTransit = (m) => m === 'bus' || m === 'bahn' || m === 'zug';
  const nowT = () => (rec.samples.length ? rec.samples[rec.samples.length - 1].t : Date.now());
  // Abschnitt abschließen; ein Wechsel, der zeitlich vor dem Beginn des Abschnitts läge, beginnt mit ihm
  const legT = (t) => Math.max(t, (rec.legStart != null ? rec.legStart : rec.trip.start || t) + 1000);
  function closeLeg(t) {
    const legs = rec.trip.legs || (rec.trip.legs = []);
    const t0 = rec.legStart != null ? rec.legStart : (rec.trip.start || t);
    legs.push({ mode: rec.curMode, t0, t1: Math.max(t, t0) });
    rec.legStart = Math.max(t, t0);
  }
  function switchMode(mode) {
    rec.curMode = mode; rec.cfg = MODES[mode];
    rec.ln = null; showStopLine();
    rec.slowSince = null; rec.fastSince = null;
    rec.det = {};   // Erkennung neu beginnen: ein Gehen vor dem Wechsel zählt nicht als Aussteigen danach
  }
  function startTransfer(at) {
    if (!rec || rec.transfer || !isTransit(rec.curMode)) return;
    const t = legT(at || nowT());
    if (rec.stop) endStop(t);   // die Bahn stand an der Haltestelle: dieser Halt endet mit dem Aussteigen
    const p = rec.samples[rec.samples.length - 1] || rec.last || {};
    closeLeg(t);
    rec.transfer = { t, from: rec.curMode, lat: p.lat, lon: p.lon };
    switchMode('fuss');
    updateTransferUI();
    setDriveState('Zu Fuß · 0:00', 'transfer');
    legBanner('fuss');
  }
  function endTransfer(mode) {
    if (!rec || !rec.transfer) return;
    const t = nowT();
    if (rec.stop) endStop(t);
    closeLeg(t);
    const tr = rec.transfer;
    const item = { t: tr.t, tEnd: t, wait: t - tr.t, from: tr.from, to: mode };
    if (tr.lat != null) { item.lat = round5(tr.lat); item.lon = round5(tr.lon); const n = stopName(tr); if (n) item.stop = n; }
    (rec.trip.transfers = rec.trip.transfers || []).push(item);
    rec.transfer = null;
    switchMode(mode);
    updateTransferUI();
    legBanner(mode);
  }
  // Deutlich zeigen, dass gewechselt wurde: großes Band oben, Vibration
  let legBannerT = null;
  function legBanner(mode) {
    const el = $('#leg-banner');
    if (!el || !MODES[mode]) return;
    el.innerHTML = `${ic(MODE_ICON[mode])}<span>Jetzt: <b>${esc(MODES[mode].label)}</b></span>`;
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) { /* ohne Vibration */ }
    speak(`Jetzt ${MODES[mode].label}.`, { now: true });
    clearTimeout(legBannerT);
    legBannerT = setTimeout(() => { el.hidden = true; }, 6000);
  }
  // ---------- Wechsel erkennen: aussteigen, parken, einsteigen ----------
  // Vorschlag mit großem Knopf und Vibration; ohne Antwort gilt er nach 30 Sekunden. „Nein“ hält ihn 3 Minuten fern.
  let legSuggest = null, legNo = null, legTimer = null;
  const LEG_TEXT = { fuss: 'Jetzt zu Fuß', bahn: 'Weiter mit Stadtbahn', bus: 'Weiter mit Bus', zug: 'Weiter mit Zug', auto: 'Weiter mit Auto', rad: 'Weiter mit Rad' };
  function hideLegSuggest() { legSuggest = null; clearTimeout(legTimer); $('#leg-suggest').hidden = true; if (recog && recog.auto) recog.abort(); }
  function showLegSuggest(mode, t, frage) {
    if (legSuggest && legSuggest.mode === mode) return;
    if (legNo && legNo.mode === mode && Date.now() - legNo.t < 180000) return;
    legSuggest = { mode, t };
    $('#leg-suggest-text').textContent = frage;
    $('#btn-leg-yes').textContent = LEG_TEXT[mode];
    $('#leg-suggest').hidden = false;
    try { if (navigator.vibrate) navigator.vibrate([150, 80, 150]); } catch (e) { /* ohne Vibration */ }
    const hear = !!(SR && settings.voiceIn && voiceOn());
    speak(frage + (hear ? ' Sag Ja oder Nein.' : mode === 'fuss' ? ' Wenn das stimmt, musst du nichts tun.' : ` Wenn das stimmt, tippe auf ${LEG_TEXT[mode]}.`),
      { now: true, onend: hear ? () => { if (legSuggest && legSuggest.mode === mode) listenAfter('Ja oder Nein? Ich höre zu …'); } : null });
    clearTimeout(legTimer);
    // ohne Antwort nach 30 s: Aussteigen und Parken gelten; Einsteigen nur, wenn man inzwischen wirklich 400 m schnell unterwegs ist
    legTimer = setTimeout(() => {
      if (!legSuggest || legSuggest.mode !== mode || !rec) return;
      const d = rec.det || {}, last = rec.samples[rec.samples.length - 1];
      if (mode === 'fuss' || (d.fast && last && dist(d.fast.from, last) >= 400)) changeMode(mode, t);
      else hideLegSuggest();
    }, 30000);
  }
  const WALK_MIN = 0.4, WALK_MAX = 2.3, FAST = 5;   // m/s: Gehen 1,5 bis 8 km/h, Fahrzeug ab 18 km/h
  function detectLeg(p, vs, t) {
    const d = rec.det || (rec.det = {});
    const cur = rec.transfer ? 'fuss' : rec.curMode;
    const walk = vs >= WALK_MIN && vs <= WALK_MAX, stand = vs < WALK_MIN, fast = vs > FAST;
    // Gehen: seit wann und ab wo
    if (walk) { if (!d.walk) d.walk = { t, lat: p.lat, lon: p.lon }; } else if (!stand) d.walk = null;
    if (stand) { if (!d.stand) d.stand = { t }; } else if (!walk) d.stand = null;
    if (fast) { if (!d.fast) d.fast = { t, lat: p.lat, lon: p.lon, from: d.lastSlow || { lat: p.lat, lon: p.lon } }; } else { d.fast = null; d.lastSlow = { lat: p.lat, lon: p.lon }; }
    if (!walk && !stand) d.parkedAt = null;
    if (stand && d.stand && t - d.stand.t >= (cur === 'rad' ? 60000 : 90000)) d.parkedAt = d.parkedAt || d.stand.t;
    const walked = d.walk ? dist(d.walk, p) : 0;
    // 1. Bus, Bahn, Zug: 40 s Gehtempo und 50 m weg → ausgestiegen
    if (isTransit(cur) && d.walk && t - d.walk.t >= 40000 && walked >= 50) showLegSuggest('fuss', d.walk.t, 'Ausgestiegen? Flowtown zeichnet dann zu Fuß weiter auf.');
    // 2. Auto, Rad: erst länger gestanden, dann 30 s Gehtempo und 40 m → geparkt
    else if ((cur === 'auto' || cur === 'rad') && d.parkedAt && d.walk && t - d.walk.t >= 30000 && walked >= 40) showLegSuggest('fuss', d.walk.t, cur === 'auto' ? 'Geparkt? Flowtown zeichnet dann zu Fuß weiter auf.' : 'Rad abgestellt? Flowtown zeichnet dann zu Fuß weiter auf.');
    // 3. zu Fuß: 25 s schnell und dabei mindestens 150 m weiter (nicht nur ein GPS-Sprung zwischen Häusern) → eingestiegen;
    //    an einer Haltestelle Stadtbahn, Bus oder Zug, sonst Rad oder Auto
    else if (cur === 'fuss' && d.fast && t - d.fast.t >= 25000 && dist(d.fast.from, p) >= 150 && dist(d.fast.from, p) / ((t - d.fast.t) / 1000) >= 3.5) {
      const at = d.fast.from;
      let mode = null;
      if (fpStopsNear(at, 70, 0).length) mode = 'bahn';
      else if (fpStopsNear(at, 120, 2).length) mode = 'zug';
      else if (fpStopsNear(at, 50, 3).length || nearStop(at)) mode = 'bus';
      else mode = vs > 9 ? 'auto' : 'rad';
      showLegSuggest(mode, d.fast.t, isTransit(mode) ? 'Eingestiegen?' : mode === 'auto' ? 'Im Auto unterwegs?' : 'Auf dem Rad unterwegs?');
    }
  }
  // Wegekette: jederzeit das Verkehrsmittel wechseln. Bus/Bahn/Zug → zu Fuß ist ein Umstieg, bis es mit Bus/Bahn/Zug weitergeht
  // (endet die Fahrt zu Fuß, war es keiner); alle anderen Wechsel schließen einfach den Abschnitt.
  function changeMode(mode, at) {
    if (!rec || !MODES[mode]) return;
    hideLegSuggest();
    if (mode === rec.curMode && !rec.transfer) return;
    if (rec.transfer) {
      if (mode === 'fuss') return;
      if (isTransit(mode)) { endTransfer(mode); return; }
    } else if (isTransit(rec.curMode) && mode === 'fuss') { startTransfer(at); return; }
    const t = legT(at || nowT());
    if (rec.stop) endStop(t);
    if (rec.transfer) { rec.transfer = null; }
    closeLeg(t);
    switchMode(mode);
    updateTransferUI();
    legBanner(mode);
  }
  function updateTransferUI() {
    const cur = rec ? (rec.transfer ? 'fuss' : rec.curMode) : null;
    $$('#mode-row .leg-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.leg === cur)));
    $('#mode-q').textContent = rec && rec.transfer ? 'Zu Fuß. Steigst du um? Weiter mit …' : 'Unterwegs mit';
    const n = rec && rec.trip.legs ? rec.trip.legs.length + 1 : 1;
    $('#drive-leg').hidden = !rec || n < 2;
    if (rec) $('#drive-leg').textContent = `Abschnitt ${n} · ${rec.transfer ? 'Zu Fuß' : MODES[rec.curMode].label}`;
  }

  function finishTrip() {
    if (!rec) return;
    hideLegSuggest();
    if (rec.stop && rec.samples.length) endStop(rec.samples[rec.samples.length - 1].t);
    // Abschnitte abschließen; ein offener Umstieg war keiner (man ist ausgestiegen und zu Fuß weiter)
    if (rec.trip.legs) {
      if (!rec.transfer || nowT() - rec.legStart >= 5000) closeLeg(nowT());
      if (rec.trip.legs.length < 2) delete rec.trip.legs;
    }
    rec.transfer = null;
    stopWatching();
    const trip = rec.trip;
    trip.end = rec.samples.length ? rec.samples[rec.samples.length - 1].t : Date.now();
    if (!trip.start) trip.start = trip.end;
    tidyTrip(trip);
    // Datenschutz: Ereignisse nahe Start und Ziel verwerfen
    const cut = Number(settings.cut) || 0;
    if (cut && rec.first && rec.last) {
      trip.events = trip.events.filter((e) => dist(e, rec.first) > cut && dist(e, rec.last) > cut);
    }
    trip.distance = Math.round(trip.distance);
    trip.cells = Object.keys(rec.cells).map((key) => {
      const [k, w] = key.split('|'), c = rec.cells[key];
      return { k, w, t: Math.round(c.t), s: Math.round(c.s), r: Math.round(c.r * 10) / 10, d: Math.round(c.d) };
    }).filter((c) => {
      if (c.t < 3) return false;
      if (!cut || !rec.first || !rec.last) return true;
      const m = cellCenter(c.k);
      return dist(m, rec.first) > cut + 100 && dist(m, rec.last) > cut + 100;   // Datenschutz wie bei den Ereignissen
    });
    // angekommen? Nur der Abstand zum Ziel wird gemerkt, nicht der Ort
    if (trip.plan && rec.target && rec.last) trip.plan.rest = Math.round(dist(rec.last, rec.target) / 100) / 10;
    const st = rec.st;
    trip.stats = {
      movingMs: Math.round(st.moving),
      steadyShare: st.steadyBase >= 60000 ? Math.round(st.steady / st.steadyBase * 100) / 100 : null,
      brakes: st.brakes,
      accels: st.accels
    };
    rec = null;
    if (!trip.events.length && trip.distance < 50) {
      showView('start');
      $('#start-msg').textContent = words(trip.mode).short;
      return;
    }
    trips.push(trip);
    if (!saveTrips()) alert('Der Speicher auf dem Gerät ist voll, die Fahrt konnte nicht gespeichert werden. Lösche unter Verlauf ältere Fahrten.');
    flushWir(trip);
    syncPilot();
    openReview(trip);
    voiceSummary(trip);
  }

  function resetEndButtons() {
    $('#btn-end').hidden = false; $('#btn-end-confirm').hidden = true; $('#btn-end-cancel').hidden = true;
  }

  // ---------- Bus und Bahn: Plan gegen Ist ----------
  // Welche Fahrt laut Fahrplan war das? Die Halte an Haltestellen werden auf dem Handy mit dem Fahrplan abgeglichen.
  // Ergebnis je Abschnitt: Linie, Ziel, Halt für Halt Plan und Ist, und wie lange das Fahrzeug dazwischen an Ampeln stand.
  const KIND_OF_MODE = { bahn: 0, bus: 3, zug: 2 };
  function matchLeg(t, mode, t0, t1) {
    const k = KIND_OF_MODE[mode];
    // Zeitpunkte: alle Halte in der Nähe einer Haltestelle dieser Art (auch ältere Fahrten, in denen ein Halt an der Ampel daneben zählte)
    const halts = [], cand = [];
    for (const e of t.events) {
      if (e.type !== 'halt' || e.t < t0 || e.t > t1 || (e.mode || t.mode) !== mode) continue;
      const c = fpStopsNear(e.at ? { lat: e.at[0], lon: e.at[1] } : e, mode === 'zug' ? 300 : 90, k);
      if (c.length) { halts.push(e); cand.push(new Set(c)); }
    }
    if (halts.length < 2) return null;
    const pats = new Set();
    cand.forEach((c) => c.forEach((si) => (fp.patsOf[si] || []).forEach((pi) => pats.add(pi))));
    const d0 = new Date(halts[0].t); d0.setHours(0, 0, 0, 0);
    const days = [[servicesOn(ymd(d0)), d0.getTime()], [servicesOn(ymd(new Date(d0.getTime() - 864e5))), d0.getTime() - 864e5]];
    let best = null;
    for (const tr of fp.trips) {
      if (!pats.has(tr[1]) || fp.routes[tr[0]][1] !== k) continue;
      const pat = fp.patterns[tr[1]];
      for (const [on, base] of days) {
        if (!on.has(tr[3])) continue;
        const times = [tr[4]];
        for (const x of tr[5]) times.push(times[times.length - 1] + x);
        const m = [];
        let from = 0;
        halts.forEach((e, hi) => {
          const j = pat.findIndex((si, jj) => jj >= from && cand[hi].has(si));
          if (j < 0) return;
          const d = (e.tEnd - base) / 60000 - times[j];   // Abfahrt Ist minus Plan, in Minuten
          if (d >= -3 && d <= 30) { m.push({ hi, j }); from = j + 1; }
        });
        if (m.length < 2 || m.length < halts.length / 2) continue;
        // bei gleich vielen Treffern: gleichmäßige Verspätung und vor allem die kleinste (sonst passt bei dichtem Takt auch die Bahn davor)
        const ds = m.map((x) => (halts[x.hi].tEnd - base) / 60000 - times[x.j]).sort((p, q) => p - q);
        const cost = (ds[ds.length - 1] - ds[0]) + Math.abs(ds[Math.floor(ds.length / 2)]) * 1.5;
        if (!best || m.length > best.m.length || (m.length === best.m.length && cost < best.cost)) best = { tr, base, times, pat, m, cost };
      }
    }
    if (!best) return null;
    const { tr, base, times, pat, m } = best;
    const a = halts[m[0].hi].tEnd, b = halts[m[m.length - 1].hi].t;
    const amps = t.events.filter((e) => e.type === 'halt' && e.signal && e.t >= a && e.t <= b);
    return { mode, linie: fpLine(tr[0], tr[6]), ziel: fp.heads[tr[2]].replace(FP_PREFIX, ''),
      halte: (() => { const by = {}; m.forEach(({ hi, j }) => { by[j] = halts[hi].tEnd; }); const out = []; for (let j = m[0].j; j <= m[m.length - 1].j; j++) out.push([fpName(pat[j]), base + times[j] * 60000, by[j] != null ? by[j] : null]); return out; })(),
      amp: amps.reduce((x, e) => x + e.wait, 0), ampN: amps.length };
  }
  function matchFahrplan(t) {
    const legs = t.legs && t.legs.length ? t.legs : [{ mode: t.mode, t0: t.start, t1: t.end }];
    return legs.filter((l) => isTransit(l.mode)).map((l) => matchLeg(t, l.mode, l.t0, l.t1 || t.end)).filter(Boolean);
  }
  // einmal je Fahrt abgleichen, solange der Fahrplan die Fahrt abdeckt; das Ergebnis bleibt an der Fahrt
  function ensureFahrplan(t) {
    if (t.demo || ('fahrplan' in t && t.fpV === 2) || !(isTransit(t.mode) || (t.legs || []).some((l) => isTransit(l.mode)))) return false;
    if (!fp) { loadFahrplan().then((ok) => { if (ok && reviewTrip === t && ensureFahrplan(t)) openReview(t); }); return false; }
    const day = ymd(new Date(t.start));
    if (day < fp.gilt[0] || day > fp.gilt[1]) return false;
    t.fahrplan = matchFahrplan(t);
    t.fpV = 2;   // ab 0.54: auch Halte ohne Messung (Tunnel) aus dem Fahrplan
    saveTrips();
    return true;
  }
  function fahrplanHtml(t) {
    if (!t.fahrplan || !t.fahrplan.length) return '';
    return t.fahrplan.map((l) => {
      const seen = l.halte.filter((h) => h[2] != null), f = seen[0], z = seen[seen.length - 1];
      const unseen = l.halte.filter((h) => h[2] == null).map((h) => h[0]);
      const late = (h) => Math.round((h[2] - h[1]) / 60000), sign = (x) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '±0');
      const gain = late(z) - late(f);
      const verdict = gain >= 1 ? `${gain} min Verspätung unterwegs aufgebaut` : gain <= -1 ? `${-gain} min unterwegs aufgeholt` : 'Unterwegs im Plan geblieben';
      const who = l.mode === 'bus' ? 'der Bus' : l.mode === 'zug' ? 'der Zug' : 'die Bahn';
      const amp = l.mode === 'zug' ? '' : l.amp ? ` Dazwischen stand ${who} ${durText(l.amp)} an Ampeln (${l.ampN} Halt${l.ampN === 1 ? '' : 'e'}).` : ` Dazwischen musste ${who} an keiner Ampel halten.`;
      const rows = l.halte.map((h) => (h[2] == null ? `<tr class="fp-est"><td>${esc(h[0])}</td><td>${clock(h[1])}</td><td>–</td><td></td></tr>` : `<tr><td>${esc(h[0])}</td><td>${clock(h[1])}</td><td>${clock(h[2])}</td><td>${sign(late(h))}</td></tr>`)).join('');
      return `<div class="fp-leg"><p class="fp-head"><span class="dep-line${l.mode === 'bahn' ? ' tram' : l.mode === 'zug' ? ' rail' : ''}">${esc(l.linie)}</span><span>→ ${esc(l.ziel)}</span></p>
        <p class="small muted">Laut Fahrplan ${esc(f[0])} ${clock(f[1])} bis ${esc(z[0])} ${clock(z[1])} · Abfahrt ${sign(late(f))} min, zuletzt ${sign(late(z))} min</p>
        <p class="fp-verdict"><b>${verdict}.</b>${amp}</p>${unseen.length ? `<p class="small muted">Nicht gemessen (etwa im Tunnel), laut Fahrplan über: ${esc(unseen.join(', '))}.</p>` : ''}
        <details class="fp-more"><summary>Halt für Halt</summary><table class="fp-table"><thead><tr><th>Halt</th><th>Plan</th><th>Ist</th><th>min</th></tr></thead><tbody>${rows}</tbody></table></details></div>`;
    }).join('') + `<p class="small muted lg-src">Fahrplan: DELFI (CC BY 4.0). Ist ist die Abfahrt, wie Flowtown sie gemessen hat.</p>`;
  }

  // ---------- Bewertung ----------
  let reviewTrip = null;
  // ---------- Rückfragen nach der Fahrt: fehlende Angaben zu Ampeln (Tonsignal, Bodenleitstreifen) ----------
  // Nie an der Ampel selbst: dort braucht man die Ohren für den Verkehr. Erst in der Fahrtbilanz, höchstens drei Ampeln.
  let merkLokal = store.get('merkmaleLokal', {}), datQ = null;
  const accOf = (c) => Object.assign({ sound: c.sound, tact: c.tact, vib: c.vib, btn: c.btn }, merkLokal[c.id] || {});
  function merkFragen(trip) {
    const walked = trip.mode === 'fuss' || (trip.legs || []).some((l) => l.mode === 'fuss');
    if (!walked) return [];
    const seen = new Set(), out = [];
    for (const e of trip.events) {
      const c = e.signal && clusterById[e.signal];
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      const a = accOf(c), q = [];
      if (a.sound == null) q.push('ton');
      if (a.tact == null) q.push('leit');
      const lb = labelFor(e);
      if (q.length) out.push({ c, q, name: /\d+[.,]\d{3}/.test(lb) ? `Ampel ${out.length + 1} auf deinem Weg` : lb });
      if (out.length >= 3) break;
    }
    return out;
  }
  const MERK_TEXT = { ton: 'Gab es ein Tonsignal?', leit: 'Gab es Bodenleitstreifen?' };
  function merkHtml(trip) {
    const list = merkFragen(trip);
    if (!list.length) return '';
    return `<section class="merk" aria-labelledby="merk-h"><h3 id="merk-h">${ic('access')}Hilf mit: Ampeln für alle</h3>
      <p class="small">Für blinde und sehbehinderte Menschen fehlen an diesen Ampeln Angaben. Weißt du es noch?</p>
      ${list.map((x) => x.q.map((m) => `<div class="merk-q" data-merk="${x.c.id}" data-m="${m}"><span><b>${esc(x.name)}</b> · ${MERK_TEXT[m]}</span><span class="merk-btns" role="group" aria-label="${esc(x.name)}: ${MERK_TEXT[m]}"><button type="button" class="btn" data-v="1">Ja</button><button type="button" class="btn" data-v="0">Nein</button><button type="button" class="btn quiet" data-v="-1">Weiß nicht</button></span></div>`).join('')).join('')}
      <p class="small muted">Nur der Ort der Ampel und deine Antwort gehen an Flowtown, ohne Fahrt und ohne Person. Die Redaktion prüft die Antworten und trägt sie in OpenStreetMap ein.</p></section>`;
  }
  function merkAnswer(cid, m, v) {
    const c = clusterById[cid];
    if (!c) return;
    if (v >= 0) {
      const o = merkLokal[cid] || (merkLokal[cid] = {});
      o[m === 'ton' ? 'sound' : 'tact'] = v ? 'yes' : 'no';
      store.set('merkmaleLokal', merkLokal);
      if (apiBase()) postJson('/api/merkmal', { items: [{ lat: c.lat, lon: c.lon, m, v }] }).catch(() => { /* ohne Netz: lokal bleibt es */ });
    }
    const row = document.querySelector(`.merk-q[data-merk="${cid}"][data-m="${m}"]`);
    if (row) { row.classList.add('done'); row.querySelector('.merk-btns').innerHTML = `<span class="small">${v === 1 ? 'Ja' : v === 0 ? 'Nein' : 'Weiß nicht'} · danke</span>`; }
  }
  // per Sprache: eine Frage nach der anderen, im Gesprächsmodus
  function merkAsk(trip) {
    const list = merkFragen(trip), qs = [];
    list.forEach((x) => x.q.forEach((m) => qs.push({ cid: x.c.id, m, name: x.name })));
    if (!qs.length) return;
    datQ = { qs, i: 0 };
    const q = qs[0];
    speak(`Darf ich kurz zu den Ampeln fragen? Sag Ja, Nein, Weiß nicht, oder Später. ${q.name}: ${MERK_TEXT[q.m]}`, { now: true, force: true, onend: () => listenAfter('Ja, Nein oder Weiß nicht? Ich höre zu …') });
  }
  function merkVoice(c) {
    if (!datQ) return false;
    if (/^(später|spaeter|keine zeit|überspringen|abbrechen|stopp|nicht jetzt)/.test(c)) { datQ = null; speak('Gut, dann ein andermal.', { now: true, force: true }); return true; }
    const v = /^(ja|jawohl|genau|stimmt)\b/.test(c) ? 1 : /^(nein|nee|gab es nicht)\b/.test(c) ? 0 : /^(weiß nicht|weiss nicht|keine ahnung|unsicher|nicht sicher)/.test(c) ? -1 : null;
    if (v == null) return false;
    const q = datQ.qs[datQ.i];
    merkAnswer(q.cid, q.m, v);
    datQ.i++;
    const n = datQ.qs[datQ.i];
    if (!n) { datQ = null; speak('Danke, das hilft allen, die nach dir dort gehen.', { now: true, force: true }); return true; }
    speak(`${n.name === q.name ? 'Und' : n.name + ':'} ${MERK_TEXT[n.m]}`, { now: true, force: true, onend: () => listenAfter('Ja, Nein oder Weiß nicht? Ich höre zu …') });
    return true;
  }
  function openReview(trip) {
    reviewTrip = trip;
    const halts = trip.events.filter((e) => e.type === 'halt' && e.signal);
    const passes = trip.events.filter((e) => e.type === 'pass').length;
    const atStop = trip.events.filter((e) => e.type === 'halt' && e.atStop).length;
    const otherEv = trip.events.filter((e) => e.type === 'halt' && !e.signal && !e.atStop), other = otherEv.length, otherWait = otherEv.reduce((a, e) => a + (e.wait || 0), 0);
    const wait = halts.reduce((a, e) => a + e.wait, 0);
    const trs = trip.transfers || [];
    // Kennzahlen als kurze Marken statt Satz
    const pill = (icon, text, cls) => `<span class="pill${cls ? ' ' + cls : ''}">${ic(icon)}${text}</span>`;
    $('#review-summary').innerHTML = [
      pill('light', `${halts.length} Halt${halts.length === 1 ? '' : 'e'}`, halts.length ? 'amber' : ''),
      halts.length ? pill('hourglass', durText(wait), wait > 60000 ? 'red' : 'amber') : '',
      pill('check', `${passes} ohne Halt`, 'green'),
      atStop ? pill('pin', `${atStop} an Haltestellen`) : '',
      trs.length ? pill('walk', `${trs.length} Umstieg${trs.length === 1 ? '' : 'e'} · ${durText(trs.reduce((x, r) => x + r.wait, 0))}`) : '',
      other ? pill('info', `${other}× Stau oder Halt ohne Ampel${otherWait >= 30000 ? ' · ' + durText(otherWait) : ''}`) : ''
    ].join('');
    ensureFahrplan(trip);
    renderReviewHead(trip, halts, passes, wait);
    $('#review-ask').hidden = !halts.length && !trs.length;
    $('#review-ask').textContent = halts.length ? 'Wie war es an den Ampeln?' : 'Wie war der Umstieg?';
    $('#review-more').open = false;
    $('#btn-review-delete').dataset.armed = ''; $('#btn-review-delete span').textContent = 'Diese Aufzeichnung löschen';
    renderBilanz();
    renderReview();
    showView('review');
    requestNames(halts, renderReview);
    // fehlende Angaben zu Ampeln: in der Bilanz, per Sprache nur mit Begleitmodus und Sprachbefehlen
    if (!trip.demo && begleitOn() && SR && settings.voiceIn && voiceOn() && merkFragen(trip).length) setTimeout(() => { if (reviewTrip === trip) merkAsk(trip); }, 2500);
  }
  const fmtNum = (x, d) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  // Zeit in Feldern, in denen es im Schnitt unter 20 km/h (Rad: 8 km/h) voranging; eine Schätzung, Ampeln werden abgezogen
  function slowMs(t) {
    const lim = t.mode === 'rad' ? 8 : 20;
    return (t.cells || []).reduce((a, c) => a + (c.t >= 3 && c.d / c.t * 3.6 < lim ? c.t * 1000 : 0), 0);
  }
  function planParts(t) {
    const ist = (t.end || t.start) - t.start, amp = tripWait(t);
    const stop = t.events.reduce((a, e) => a + (e.type === 'halt' && e.atStop ? e.wait : 0), 0);
    return { ist, plan: t.plan.dauer * 1000, amp, stop, slow: Math.max(0, slowMs(t) - amp - stop) };
  }
  function planHtml(t) {
    const p = t.plan, { ist, plan, amp, stop, slow } = planParts(t);
    const max = Math.max(ist, plan, 1), pc = (x) => (x / max * 100).toFixed(1) + '%';
    const diff = ist - plan, dm = Math.round(Math.abs(diff) / 60000);
    const verdict = dm < 2 ? 'Fast genau wie geplant' : diff > 0 ? `${dm} min länger als geplant` : `${dm} min schneller als geplant`;
    const flow = Math.max(0, ist - slow - amp - stop);
    const reported = (p.meldungen || []).map((m) => `${m.titel} (${LAGE_LABEL[m.art] || 'Meldung'})`);
    return `<div class="plan">
      <h4 class="vf-h4">${ic('pin')} Ziel ${esc(p.name)}</h4>
      <div class="pl-row"><span>Geplant um ${clock(p.t)} Uhr</span><b>${hm(plan / 1000)}</b></div>
      <div class="pl-bar"><span class="pl-seg plan" style="width:${pc(plan)}"></span></div>
      <div class="pl-row"><span>Gebraucht</span><b>${hm(ist / 1000)}</b></div>
      <div class="pl-bar" role="img" aria-label="${esc(`Gebraucht ${hmSay(ist / 1000)}, davon ${stop ? `${hmSay(stop / 1000)} an Haltestellen, ` : ''}etwa ${hmSay(slow / 1000)} langsam oder im Stau und ${hmSay(amp / 1000)} an Ampeln`)}"><span class="pl-seg" style="width:${pc(flow)}"></span>${stop ? `<span class="pl-seg stop" style="width:${pc(stop)}"></span>` : ''}<span class="pl-seg slow" style="width:${pc(slow)}"></span><span class="pl-seg amp" style="width:${pc(amp)}"></span></div>
      <ul class="pl-legend">${stop ? `<li><span class="lg-dot stop"></span>${durText(stop)} an Haltestellen</li>` : ''}<li><span class="lg-dot red"></span>etwa ${minText(Math.round(slow / 60000))} langsam oder im Stau</li><li><span class="lg-dot"></span>${Math.round(amp / 60000)} min an Ampeln</li></ul>
      <p class="pl-verdict">${verdict}</p>
      ${reported.length ? `<p class="small muted">Vorher gemeldet: ${esc(reported.join(', '))}</p>` : ''}
      ${p.rest > 2 ? `<p class="note">${ic('info')}<span>Die Aufzeichnung endete etwa ${fmtNum(p.rest, 0)} km vor dem Ziel, der Vergleich ist nur grob.</span></p>` : ''}
    </div>`;
  }
  const fmtEuro = (x) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
  // Kosten einer Autofahrt: Sprit oder Strom (nur mit Verbrauchsangabe) und geschätzte Kosten der Ampelhalte
  function tripCosts(t) {
    if (t.mode !== 'auto') return null;
    const unit = t.consumption ? t.consumption.unit : 'l';
    const price = unit === 'kWh' ? settings.powerPrice : settings.fuelPrice;
    const halts = t.events.filter((e) => e.type === 'halt' && e.signal);
    const waitH = halts.reduce((a, e) => a + e.wait, 0) / 3600000;
    const stops = halts.reduce((a, e) => a + (e.halts || 1), 0);
    const amount = unit === 'kWh' ? waitH * IDLE_KWH_PER_H + stops * RESTART_KWH : waitH * IDLE_L_PER_H + stops * RESTART_L;
    const energy = t.consumption ? t.distance / 1000 * t.consumption.value / 100 * price : null;
    return { unit, price, energy, halts: amount * price, amount, stops };
  }
  function costHtml(t) {
    const c = tripCosts(t);
    if (!c) return '';
    const what = c.unit === 'kWh' ? 'Strom' : 'Sprit';
    const lines = [`<div class="card-head"><span class="chip sm amber">${ic('euro')}</span><strong>Kosten</strong></div>`];
    lines.push(c.energy != null
      ? `<p><strong>${what} für diese Fahrt: ${fmtEuro(c.energy)}</strong></p>`
      : `<p class="small">Trag den Verbrauch ein, dann rechnet die App die ${what}kosten der Fahrt aus.</p>`);
    lines.push(c.stops
      ? `<p>Deine Ampelhalte: ca. ${fmtEuro(c.halts)} (${c.stops} Halt${c.stops === 1 ? '' : 'e'}, ${fmtNum(c.amount, 2)} ${c.unit === 'kWh' ? 'kWh' : 'l'})</p>`
      : '<p>Keine Ampelhalte, also auch keine Kosten fürs Warten.</p>');
    lines.push(`<details class="more-info"><summary>${ic('info')}So wird geschätzt</summary><p class="small muted">${fmtEuro(c.price)} je ${c.unit === 'kWh' ? 'kWh' : 'Liter'} ${c.unit === 'kWh' ? `${fmtNum(IDLE_KWH_PER_H, 1)} kWh je Stunde im Stand und ${fmtNum(RESTART_KWH, 2)} kWh` : `${fmtNum(IDLE_L_PER_H, 1)} l je Stunde Leerlauf und ${fmtNum(RESTART_L, 2)} l`} je Wiederanfahren. Preise änderbar unter „Mehr“.</p></details>`);
    return lines.join('');
  }
  // Wegekette als Zeile mit Symbolen (Umstiege zu Fuß zwischen Bus und Bahn zählen nicht als eigener Abschnitt)
  function legChainHtml(t) {
    const trs = t.transfers || [];
    const legs = (t.legs || []).filter((l) => l.mode !== 'fuss' || !trs.some((r) => r.t === l.t0));
    return legs.length >= 2 ? `<p class="legs">${legs.map((l) => `<span>${ic(MODE_ICON[l.mode])}${esc(MODES[l.mode].label)}</span>`).join('<span class="arrow">→</span>')}</p>` : '';
  }
  // Bus und Bahn: wohin die Zeit ging, und die Abschnitte der Fahrt
  function transitFacts(t) {
    const sum = (f) => t.events.reduce((a, e) => a + (e.type === 'halt' && f(e) ? e.wait : 0), 0);
    const trs = t.transfers || [];
    const legs = (t.legs || []).filter((l) => l.mode !== 'fuss' || !trs.some((r) => r.t === l.t0));
    return `<ul class="facts">
      <li>${ic('pin')}<span>An Haltestellen</span><b>${durText(sum((e) => e.atStop))}</b></li>
      <li>${ic('light')}<span>An Ampeln</span><b>${durText(sum((e) => e.signal))}</b></li>
      ${trs.length ? `<li>${ic('walk')}<span>Umsteigen (${trs.length}×)</span><b>${durText(trs.reduce((a, r) => a + r.wait, 0))}</b></li>` : ''}
    </ul>`;
  }
  // Oben in der Bilanz: das Ergebnis in einem Satz, darunter wofür die Zeit draufging
  function renderReviewHead(t, halts, passes, wait) {
    const dur = (t.end || t.start) - t.start;
    $('#review-label').textContent = words(t.mode).bilanz;
    let head, sub;
    // Bus und Bahn: die Zeit an Haltestellen gehört dazu, sie ist weder Stau noch Ampel
    const stops = t.events.filter((e) => e.type === 'halt' && e.atStop);
    const stopT = stops.reduce((a, e) => a + e.wait, 0);
    const transit = isTransit(t.mode) || stops.length > 0;
    if (t.plan) {
      const d = dur - t.plan.dauer * 1000, dm = Math.round(Math.abs(d) / 60000);
      head = dm < 2 ? 'Fast genau wie geplant' : d > 0 ? `${dm} min länger als geplant` : `${dm} min schneller als geplant`;
      sub = `${esc(t.plan.name)} · geplant ${hm(t.plan.dauer)}, gebraucht ${hm(dur / 1000)}`;
    } else if (transit) {
      head = `${hm(dur / 1000)}, davon ${durText(stopT)} an Haltestellen und ${durText(wait)} an Ampeln`;
      sub = `${stops.length} Halt${stops.length === 1 ? '' : 'e'} an Haltestellen, ${halts.length} an Ampeln, ${passes} Ampel${passes === 1 ? '' : 'n'} ohne Halt · ${fmtNum(t.distance / 1000, 1)} km`;
    } else {
      head = `${hm(dur / 1000)}, davon ${durText(wait)} an Ampeln`;
      sub = `${halts.length} Halt${halts.length === 1 ? '' : 'e'} an Ampeln, ${passes} ohne Halt · ${fmtNum(t.distance / 1000, 1)} km`;
    }
    $('#h-review').textContent = head;
    const slow = t.mode === 'fuss' ? 0 : Math.max(0, slowMs(t) - wait - stopT);
    const flow = Math.max(0, dur - slow - wait - stopT), all = Math.max(1, flow + slow + wait + stopT);
    const pc = (x) => (x / all * 100).toFixed(1) + '%';
    $('#review-head').innerHTML = `${legChainHtml(t)}<p class="st-sub">${sub}</p>
      <div class="rh-bar" role="img" aria-label="${esc(`${hmSay(dur / 1000)}, davon ${transit ? `${hmSay(stopT / 1000)} an Haltestellen, ` : ''}etwa ${hmSay(slow / 1000)} langsam oder im Stau und ${hmSay(wait / 1000)} an Ampeln`)}"><span style="width:${pc(flow)}"></span>${transit ? `<span class="stop" style="width:${pc(stopT)}"></span>` : ''}<span class="slow" style="width:${pc(slow)}"></span><span class="amp" style="width:${pc(wait)}"></span></div>
      <ul class="pl-legend row-legend">${flow >= 1000 ? `<li><span class="lg-dot flow"></span>${durText(flow)} fließend unterwegs</li>` : ''}${transit ? `<li><span class="lg-dot stop"></span>${durText(stopT)} an Haltestellen</li>` : ''}${slow >= 1000 ? `<li><span class="lg-dot red"></span>etwa ${durText(slow)} langsam oder Stau</li>` : ''}<li><span class="lg-dot"></span>${durText(wait)} an Ampeln</li></ul>
      ${fahrplanHtml(t)}`;
  }
  function renderBilanz() {
    const t = reviewTrip;
    const st = t.stats || {};
    const dur = (t.end || t.start) - t.start;
    const km = t.distance / 1000;
    const gaps = t.gaps || [];
    const gapKm = gaps.reduce((a, g) => a + g.d, 0) / 1000;
    const gapMs = gaps.reduce((a, g) => a + g.tEnd - g.t, 0);
    const avg = st.movingMs ? (km - gapKm) / (st.movingMs / 3600000) : null;   // Tempo nur aus Abschnitten mit GPS
    const per100 = km >= 5 ? ` (${fmtNum((st.brakes || 0) / km * 100, 1)} je 100 km)` : '';
    const c = t.consumption || {};
    const w = words(t.mode), walk = t.mode !== 'auto' && t.mode !== 'rad';   // Fahrstil nur, wenn man selbst fährt
    $('#review-bilanz').innerHTML = `<div class="card bilanz">
      ${cardHead(MODE_ICON[t.mode] || 'route', w.bilanz, `${fmtDate(t.start)} · ${MODES[t.mode] ? MODES[t.mode].label : ''}`)}
      <div class="kpis">
        <div class="kpi">${ic('route')}<b>${fmtNum(km, 1)} km</b><span>Strecke</span></div>
        <div class="kpi">${ic('timer')}<b>${fmtDur(dur)}</b><span>${w.time}${dur < 3600000 ? ' (min)' : ''}</span></div>
        <div class="kpi">${ic('gauge')}<b>${avg ? Math.round(avg) + ' km/h' : '–'}</b><span>Ø Tempo in Bewegung</span></div>
        ${walk
          ? `<div class="kpi">${ic('light')}<b>${t.events.filter((e) => e.type === 'halt' && e.signal).length}</b><span>Halte an Ampeln</span></div>`
          : `<div class="kpi">${ic('wave')}<b>${st.steadyShare != null ? fmtPct(st.steadyShare) : '–'}</b><span>gleichmäßig gefahren</span></div>`}
      </div>
      ${t.plan ? planHtml(t) : ''}
      ${isTransit(t.mode) || (t.transfers || []).length || (t.legs || []).some((l) => isTransit(l.mode)) ? transitFacts(t) : ''}
      ${walk ? '' : `<p class="note">${ic('alert')}<span>${st.brakes || 0} starke Bremsung${st.brakes === 1 ? '' : 'en'}${per100}, ${st.accels || 0}× stark beschleunigt.${st.steadyShare == null ? ' Die Gleichmäßigkeit wird ab einer Minute Fahrt über 30 km/h berechnet.' : ''}</span></p>`}
      ${gaps.length ? `<p class="note">${ic('gps')}<span>Ohne GPS-Empfang, etwa im Tunnel: ${fmtDur(gapMs)} min, rund ${fmtNum(gapKm, 1)} km Luftlinie überbrückt. Dort wird nichts gewertet.</span></p>` : ''}
      ${t.mode === 'auto' ? `      <label class="small" for="inp-consumption">Verbrauch laut Bordcomputer (freiwillig)</label>
      <div class="cons-row">
        <input id="inp-consumption" type="text" inputmode="decimal" autocomplete="off" placeholder="z. B. 5,6" value="${c.value != null ? fmtNum(c.value, 1) : ''}">
        <select id="inp-unit" aria-label="Einheit">
          <option value="l"${c.unit !== 'kWh' ? ' selected' : ''}>l/100 km</option>
          <option value="kWh"${c.unit === 'kWh' ? ' selected' : ''}>kWh/100 km</option>
        </select>
      </div>
      <p id="cons-msg" class="small muted" role="status" aria-live="polite"></p>
      <div id="bilanz-costs" class="costs">${costHtml(t)}</div>` : ''}
    </div>`;
    const save = () => {
      const raw = $('#inp-consumption').value.trim().replace(',', '.');
      const unit = $('#inp-unit').value;
      if (!raw) { delete reviewTrip.consumption; saveTrips(); $('#cons-msg').textContent = ''; $('#bilanz-costs').innerHTML = costHtml(reviewTrip); return; }
      const val = Number(raw);
      if (!isFinite(val) || val <= 0 || val > 60) { $('#cons-msg').textContent = 'Bitte eine Zahl wie 5,6 eingeben.'; return; }
      reviewTrip.consumption = { value: Math.round(val * 10) / 10, unit };
      saveTrips();
      $('#cons-msg').textContent = `Gespeichert: ${fmtNum(reviewTrip.consumption.value, 1)} ${unit}/100 km.`;
      $('#bilanz-costs').innerHTML = costHtml(reviewTrip);
    };
    if (t.mode !== 'auto') return;   // Verbrauch und Kosten nur fürs Auto
    $('#inp-consumption').addEventListener('change', save);
    $('#inp-unit').addEventListener('change', save);
  }
  const openTags = new Set();   // aufgeklappte Stichwort-Listen bleiben beim Neuzeichnen offen
  function renderReview() {
    if (!reviewTrip) return;
    const halts = reviewTrip.events.filter((e) => e.type === 'halt' && e.signal);
    const tagList = reviewTrip.access || settings.access.on ? TAGS.concat(ACC_TAGS) : TAGS;
    $('#review-list').innerHTML = halts.map((e, i) => {
      const idx = reviewTrip.events.indexOf(e);
      const tags = e.tags || [];
      return `<article class="rev" data-idx="${idx}">
        <div class="rev-head"><span class="chip sm">${ic('light')}</span><div class="rev-title"><strong>${placeFor(e)}</strong><span class="small muted">${[dirName(e.heading), e.halts > 1 ? `${e.halts} Halte` : '', e.queued ? 'im Rückstau' : '', new Date(e.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'].filter(Boolean).map(esc).join(' · ')}</span></div><span class="rev-wait">${ic('hourglass')}${fmtDur(e.wait)} min</span></div>
        <div class="thumbs" role="group" aria-label="Bewertung für ${esc(labelFor(e))}">
          <button type="button" class="btn up" data-rate="1" aria-pressed="${e.rating === 1}">${ic('thumb')}Gut</button>
          <button type="button" class="btn down" data-rate="-1" aria-pressed="${e.rating === -1}">${ic('thumb', 'flip')}Schlecht</button>
        </div>
        <details class="tag-box"${tags.length || openTags.has(idx) ? ' open' : ''} data-idx="${idx}"><summary>${ic('list')}Stichworte${tags.length ? ` (${tags.length})` : ''}</summary>
          <div class="tags" role="group" aria-label="Stichworte">${tagList.map((t) => `<button type="button" data-tag="${esc(t)}" aria-pressed="${tags.includes(t)}">${esc(t)}</button>`).join('')}</div></details>
      </article>`;
    }).join('') + (reviewTrip.transfers || []).map((tr, i) => `<article class="rev transfer" data-tidx="${i}">
        <div class="rev-head"><span class="chip sm amber">${ic('walk')}</span><div class="rev-title"><strong>Umstieg${tr.stop ? ' ' + esc(tr.stop) : ''}</strong><span class="small muted">${esc(MODES[tr.from].label)} → ${esc(MODES[tr.to].label)} · ${new Date(tr.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span></div><span class="rev-wait">${ic('hourglass')}${durText(tr.wait)}</span></div>
        <button type="button" class="btn miss" data-missed aria-pressed="${!!tr.missed}">${ic('alert')}Anschluss verpasst</button>
      </article>`).join('') + merkHtml(reviewTrip);
  }
  $('#review-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('.merk-q [data-v]');
    if (!b) return;
    const row = b.closest('.merk-q');
    merkAnswer(row.dataset.merk, row.dataset.m, Number(b.dataset.v));
  });
  $('#review-list').addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.classList || !d.classList.contains('tag-box')) return;
    const i = Number(d.dataset.idx);
    if (d.open) openTags.add(i); else openTags.delete(i);
  }, true);
  $('#review-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    const card = ev.target.closest('.rev');
    if (!btn || !card || !reviewTrip) return;
    if (card.dataset.tidx != null) {
      const tr = reviewTrip.transfers[Number(card.dataset.tidx)];
      tr.missed = !tr.missed;
      saveTrips(); renderReview();
      const b = $(`#review-list .rev[data-tidx="${card.dataset.tidx}"] button[data-missed]`);
      if (b) b.focus();
      return;
    }
    const e = reviewTrip.events[Number(card.dataset.idx)];
    if (btn.dataset.rate) {
      const r = Number(btn.dataset.rate);
      e.rating = e.rating === r ? null : r;
    } else if (btn.dataset.tag) {
      const t = btn.dataset.tag;
      e.tags = e.tags || [];
      e.tags = e.tags.includes(t) ? e.tags.filter((x) => x !== t) : e.tags.concat(t);
    }
    saveTrips();
    renderReview();
    const again = $(`#review-list .rev[data-idx="${card.dataset.idx}"] button[data-${btn.dataset.rate ? 'rate' : 'tag'}="${btn.dataset.rate || btn.dataset.tag}"]`);
    if (again) again.focus();
  });
  $('#btn-review-done').addEventListener('click', () => { reviewTrip = null; showView('stats'); syncPilot(); });
  $('#btn-review-delete').addEventListener('click', () => {
    const b = $('#btn-review-delete');
    if (!reviewTrip) return;
    if (!b.dataset.armed) { b.dataset.armed = '1'; $('#btn-review-delete span').textContent = 'Wirklich löschen? Nochmal tippen'; return; }
    trips = trips.filter((t) => t.id !== reviewTrip.id); saveTrips();
    reviewTrip = null; showView('stats');
  });

  // ---------- Statistik ----------
  let statsRange = 'week';   // Verlauf: Woche, Monat (30 Tage) oder alles
  function weekStart() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  // Fahrten an derselben Ampel mit ähnlicher Richtung (±45°) bilden eine Zufahrt
  function dirGroup(a, e) {
    let g = null;
    if (e.heading != null) {
      for (const d of a.dirs) if (d.h != null && angDiff(d.h, e.heading) <= 45) { g = d; break; }
    } else {
      g = a.dirs.find((d) => d.h == null) || null;
    }
    if (!g) { g = { h: e.heading == null ? null : e.heading, sx: 0, sy: 0, passes: 0, halts: 0, wait: 0, maxWait: 0, up: 0, down: 0 }; a.dirs.push(g); }
    if (e.heading != null) {
      g.sx += Math.sin(e.heading * toR); g.sy += Math.cos(e.heading * toR);
      g.h = (Math.atan2(g.sx, g.sy) / toR + 360) % 360;
    }
    return g;
  }
  function countInto(x, e) {
    if (e.type === 'pass') x.passes++;
    else { x.halts++; x.wait += e.wait; x.maxWait = Math.max(x.maxWait, e.wait); }
    if (e.rating === 1) x.up++;
    if (e.rating === -1) x.down++;
  }
  function aggregate(list) {
    const per = {};
    let wait = 0, halts = 0, passes = 0;
    for (const tr of list) for (const e of tr.events) {
      if (!e.signal) continue;
      const a = per[e.signal] || (per[e.signal] = { signal: e.signal, lat: e.lat, lon: e.lon, passes: 0, halts: 0, wait: 0, maxWait: 0, up: 0, down: 0, tags: {}, sample: e, dirs: [] });
      countInto(a, e);
      countInto(dirGroup(a, e), e);
      if (e.type === 'pass') passes++; else { halts++; wait += e.wait; }
      for (const t of e.tags || []) a.tags[t] = (a.tags[t] || 0) + 1;
    }
    const all = Object.values(per);
    const approaches = [];
    for (const a of all) for (const d of a.dirs) approaches.push(Object.assign({ sample: a.sample, signal: a.signal }, d));
    return { per: all, approaches, wait, halts, passes };
  }
  const dirShort = (h) => (h == null ? '–' : DIRS[Math.round(h / 45) % 8]);
  function costSummary(list) {
    const cs = list.map(tripCosts).filter(Boolean);
    if (!cs.length) return '';
    const halts = cs.reduce((a, c) => a + c.halts, 0);
    const withEnergy = cs.filter((c) => c.energy != null);
    const energy = withEnergy.reduce((a, c) => a + c.energy, 0);
    return `<div class="card">${cardHead('euro', 'Kosten', 'geschätzt', 'amber')}
      <p>Ampelhalte: <strong>${fmtEuro(halts)}</strong> bei ${cs.length} Autofahrt${cs.length === 1 ? '' : 'en'}</p>
      ${withEnergy.length ? `<p>Sprit und Strom: <strong>${fmtEuro(energy)}</strong> bei ${withEnergy.length} Fahrt${withEnergy.length === 1 ? '' : 'en'} mit Verbrauchsangabe</p>` : '<p class="small">Für Sprit- und Stromkosten den Verbrauch in der Fahrtbilanz eintragen.</p>'}
    </div>`;
  }
  // Verlauf: drei Kennzahlen, Wartezeit als Balken, deine Wege, Fahrten nach Tag, dann Ampeln und Karte
  function waitBars(list) {
    const now = Date.now(), ws = weekStart();
    let buckets;
    if (statsRange === 'week') buckets = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d, i) => { const a = dayStart(ws + i * 864e5 + 3 * 3600e3); return { label: d, a, b: a + 864e5, future: a > now }; });
    else {
      const n = statsRange === 'month' ? 5 : 8;
      buckets = Array.from({ length: n }, (_, i) => { const a = ws - (n - 1 - i) * 7 * 864e5; const d = new Date(a); return { label: `${d.getDate()}.${d.getMonth() + 1}.`, a, b: a + 7 * 864e5 }; });
    }
    buckets.forEach((x) => { x.w = list.filter((t) => t.start >= x.a && t.start < x.b).reduce((s2, t) => s2 + tripWait(t), 0); });
    const max = Math.max(60000, ...buckets.map((x) => x.w));
    const say = buckets.map((x) => `${x.label}: ${fmtDur(x.w)} min`).join(', ');
    return `<section class="card bars-card" aria-label="Minuten an Ampeln ${statsRange === 'week' ? 'je Tag' : 'je Woche'}"><p class="bars-title">Minuten an Ampeln ${statsRange === 'week' ? 'je Tag' : 'je Woche'}</p>
      <div class="bars" role="img" aria-label="${esc(say)}">${buckets.map((x) => `<span class="bar-col${x.future ? ' future' : ''}"><span class="bar-v">${x.w ? fmtDur(x.w) : ''}</span><span class="bar" style="height:${Math.round(4 + x.w / max * 64)}px"></span><span class="bar-l">${x.label}</span></span>`).join('')}</div></section>`;
  }
  let routeOpen = null, histOpen = null;
  function routeRows(group) {
    const { routes } = sortedRoutes(group);
    if (!routes.length) return '<p class="small muted">Ab zwei Fahrten auf derselben Strecke stehen hier deine Wege mit der besten Abfahrtszeit.</p>';
    return routes.slice(0, 3).map((g, i) => {
      const modes = [...new Set(g.trips.map((t) => MODES[t.mode] ? MODES[t.mode].label : t.mode))].join(', ');
      return `<div class="route-item"><button type="button" class="wrow" data-route="${i}" aria-expanded="${routeOpen === i}">${ic('route', 'wrow-ic')}<span class="wrow-text"><b class="route-name">${esc(labelFor(g.first))} → ${esc(labelFor(g.last))}</b><span class="small muted">${esc(modes)} · ${g.trips.length}× · Ø ${durText(avgOf(g.trips.map(tripWait)))} an Ampeln</span></span>${ic('chevron', 'wrow-go')}</button>${routeOpen === i ? routeCard(g, group) : ''}</div>`;
    }).join('');
  }
  function renderStats() {
    const since = statsRange === 'week' ? weekStart() : statsRange === 'month' ? Date.now() - 30 * 864e5 : 0;
    const list = trips.filter((t) => t.start >= since);
    $('#stats-demo').hidden = !list.some((t) => t.demo);
    const body = $('#stats-body');
    if (!list.length) {
      $('#stats-small').textContent = '';
      body.innerHTML = `<p class="msg">${statsRange === 'week' ? 'Diese Woche noch keine Fahrten.' : statsRange === 'month' ? 'In den letzten 30 Tagen keine Fahrten.' : 'Noch keine Fahrten.'} Starte unter „Heute“ deine erste Aufzeichnung oder spiele unter „Mehr“ eine Testfahrt ab.</p>`;
      return;
    }
    const ag = aggregate(list);
    const share = ag.halts + ag.passes ? ag.halts / (ag.halts + ag.passes) : 0;
    const worst = ag.approaches.filter((a) => a.halts).sort((a, b) => b.wait - a.wait)[0];
    ag.approaches.sort((a, b) => b.wait - a.wait);
    // schlichte Liste statt Tabelle: Ampel und Richtung links, Halte und Wartezeit rechts
    // Befund für Fußgänger*innen mit Profil: Ampeln, die als „Grün zu kurz zum Queren“ markiert wurden
    const kurz = {};
    for (const a of ag.per) if (a.tags['Grün zu kurz zum Queren']) kurz[a.signal] = a.tags['Grün zu kurz zum Queren'];
    const nKurz = Object.keys(kurz).length;
    const ampRows = ag.approaches.map((a) => { const n = a.halts + a.passes; return `<li><span class="amp-name">${placeFor(a.sample)}<span class="small muted">${a.h != null ? esc(dirName(a.h)) + ' · ' : ''}${n} Fahrt${n === 1 ? '' : 'en'}${a.up || a.down ? ` · ${a.up} gut, ${a.down} schlecht` : ''}${kurz[a.signal] ? ` · <b class="kurz">zu kurz grün (${kurz[a.signal]}×)</b>` : ''}</span></span><b>${a.halts ? `${a.halts}× · Ø ${fmtDur(a.wait / a.halts)}` : 'frei'}</b></li>`; });
    const ampList = (rs) => `<ul class="amp-list">${rs.join('')}</ul>`;
    // lange Listen: die wichtigsten zuerst, der Rest zum Aufklappen
    const rest = (items, n, label, wrap) => items.length > n ? `<details class="more-box"><summary>${ic('list')}${label} (${items.length - n} weitere)</summary>${wrap(items.slice(n))}</details>` : '';
    const group = MODE_GROUP[selectedMode()];
    const legend = `<p class="tlegend" aria-hidden="true"><span class="drive">fahren</span><span class="amp">Ampel</span><span class="slow">Stau</span><span class="stop">Haltestelle</span></p>`;
    // ein Satz statt Kacheln, darunter wenige Boxen zum Aufklappen wie bei den Tipps
    const when = statsRange === 'week' ? 'diese Woche' : statsRange === 'month' ? 'in 30 Tagen' : 'insgesamt';
    $('#stats-small').textContent = `${list.length} Fahrt${list.length === 1 ? '' : 'en'} ${when}, ${fmtPct(share)} mit Halt an der Ampel${ag.halts ? `, im Schnitt ${fmtS(ag.wait / ag.halts)} je Halt` : ''}.`;
    const last = list.reduce((x, y) => (y.start > x.start ? y : x));
    const lastWait = tripWait(last);
    const lastDay = Math.round((dayStart(Date.now()) - dayStart(last.start)) / 864e5);
    const lastWhen = (lastDay === 0 ? 'heute' : lastDay === 1 ? 'gestern' : new Date(last.start).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })) + ' ' + new Date(last.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const { routes } = sortedRoutes(group);
    const cs = list.map(tripCosts).filter(Boolean);
    const boxes = [
      { k: 'fahrten', icon: 'list', head: 'Fahrten', num: String(list.length),
        sub: `Zuletzt ${lastWhen}, ${MODES[last.mode] ? MODES[last.mode].label : last.mode}${lastWait ? `, ${fmtDur(lastWait)} min an Ampeln` : ', ohne Ampelhalt'}`,
        html: () => `<div class="timeline">${tripTimeline(list, 6)}</div>${list.length > 6 ? `<details class="more-box"><summary>${ic('list')}Ältere anzeigen (${list.length - 6} weitere)</summary><div class="timeline">${tripTimeline(list.slice().sort((x, y) => y.start - x.start).slice(6))}</div></details>` : ''}` },
      routes.length && { k: 'wege', icon: 'route', head: 'Deine Wege', num: String(Math.min(3, routes.length)),
        sub: `${esc(labelFor(routes[0].first))} → ${esc(labelFor(routes[0].last))}, ${routes[0].trips.length}×`, html: () => routeRows(group) },
      ag.per.length && { k: 'ampeln', icon: 'light', head: 'Ampeln', num: worst ? `${fmtDur(worst.wait)} min` : String(ag.per.length),
        sub: nKurz ? `${nKurz} Ampel${nKurz === 1 ? '' : 'n'} von dir als zu kurz grün markiert` : worst ? `Am längsten: ${plain(placeFor(worst.sample))}, ${worst.halts}× gehalten` : `${ag.per.length} Ampel${ag.per.length === 1 ? '' : 'n'}, ohne Halt`,
        html: () => `<h4 class="day-title">Längste Wartezeit zuerst</h4>${ampList(ampRows.slice(0, 6))}${rest(ampRows, 6, 'Weitere Ampeln', ampList)}` },
      cs.length && { k: 'kosten', icon: 'euro', head: 'Kosten', num: fmtEuro(cs.reduce((x, c) => x + c.halts, 0)),
        sub: 'Was die Ampelhalte geschätzt kosten', html: () => costSummary(list).replace(/^<div class="card">/, '<div>') },
      { k: 'mode', icon: 'chart', head: 'Nach Verkehrsmittel', sub: settings.access.on ? 'Vergleich und dein Profil' : 'Auto, Rad, Bus und zu Fuß im Vergleich',
        html: () => modeCard(group) + (settings.access.on ? accessCard() : '') }
    ].filter(Boolean);
    const box = (x) => `<div class="tipcard" data-world="hist"><button type="button" class="tip-row" data-hist="${x.k}" aria-expanded="${histOpen === x.k}"><span class="tip-ic">${ic(x.icon)}</span><span class="tip-main"><b>${x.head}</b><span>${x.sub}</span></span>${x.num ? `<span class="tip-num">${x.num}</span>` : ''}</button>${histOpen === x.k ? `<div class="tip-detail">${x.html()}</div>` : ''}</div>`;
    body.innerHTML = `${waitBars(list)}
      <section class="hist-sec"><h3 class="eyebrow">Im Einzelnen</h3>${boxes.map(box).join('')}</section>
      <button type="button" class="world-link" data-goto="map">${ic('map')}<span><b>Karte</b><span>Wo es in Bielefeld hakt</span></span>${ic('chevron')}</button>`;
    requestNames(ag.per.map((a) => a.sample), () => { if (!$('#view-stats').hidden) renderStats(); });
  }
  $('#stats-range').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-range]');
    if (!b) return;
    statsRange = b.dataset.range;
    $$('#stats-range button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderStats();
  });
  $('#stats-body').addEventListener('click', (ev) => {
    const del = ev.target.closest('button[data-del]');
    const rv = ev.target.closest('button[data-review]');
    const ro = ev.target.closest('button[data-route]');
    const hb = ev.target.closest('button[data-hist]');
    if (hb) { histOpen = histOpen === hb.dataset.hist ? null : hb.dataset.hist; renderStats(); return; }
    if (ro) { const i = Number(ro.dataset.route); routeOpen = routeOpen === i ? null : i; renderStats(); return; }
    if (del) {
      if (del.dataset.armed) {
        trips = trips.filter((t) => t.id !== del.dataset.del); saveTrips(); renderStats();
      } else {
        del.dataset.armed = '1'; del.textContent = 'Wirklich?';
      }
    } else if (rv) {
      const t = trips.find((x) => x.id === rv.dataset.review);
      if (t) openReview(t);
    }
  });

  // ---------- Karte ----------
  let map = null, layer = null;
  let mapWindow = 'all', mapFitted = false;

  // Flow-Wert je Feld (0–100): Mittel aus Tempo-Anteil, Anteil ohne Stillstand, Ampel-Wartezeit und Bewertungen
  function aggregateGrid(list, win) {
    const g = {};
    const get = (k) => g[k] || (g[k] = { k, trips: new Set(), t: 0, s: 0, r: 0, d: 0, n: 0, wait: 0, halts: 0, up: 0, down: 0, signals: new Set() });
    for (const tr of list) {
      for (const c of tr.cells || []) {
        if (win !== 'all' && c.w !== win) continue;
        const a = get(c.k); a.trips.add(tr.id); a.t += c.t; a.s += c.s; a.r += c.r; a.d += c.d;
      }
      for (const e of tr.events) {
        if (!e.signal || (win !== 'all' && timeWindow(e.t) !== win)) continue;
        const a = get(cellKey(e.lat, e.lon)); a.trips.add(tr.id); a.n++; a.signals.add(e.signal);
        if (!a.sig) a.sig = { signal: e.signal, lat: e.lat, lon: e.lon };
        if (e.type === 'halt') { a.halts++; a.wait += e.wait; }
        if (e.rating === 1) a.up++;
        if (e.rating === -1) a.down++;
      }
    }
    for (const a of Object.values(g)) {
      const parts = [];
      if (a.t >= 5) { parts.push(a.r / a.t); parts.push(1 - a.s / a.t); }
      if (a.n) parts.push(1 - Math.min(1, a.wait / a.n / 60000));   // 60 s Ø Wartezeit je Durchfahrt = 0
      if (a.up + a.down) parts.push(a.up / (a.up + a.down));
      a.flow = parts.length ? Math.round(100 * parts.reduce((x, y) => x + y, 0) / parts.length) : null;
      a.count = a.trips.size;
    }
    return Object.values(g).filter((a) => a.flow != null);
  }
  function flowColor(f) { return waitColor(45 * (1 - f / 100)); }   // gleiche Farbskala: grün fließt, rot hakt
  function cellLabel(a) {
    if (a.signals.size) { const sig = [...a.signals][0]; const nm = nameOf(sig); if (nm) return nm; }
    const key = 'g' + a.k;
    return names[key] || 'Feld bei ' + cellCenter(a.k).lat.toFixed(4) + ', ' + cellCenter(a.k).lon.toFixed(4);
  }
  function gridInsights(list) {
    const out = [];
    const all = aggregateGrid(list, 'all').filter((a) => a.count >= 2).sort((x, y) => x.flow - y.flow);
    for (const a of all.slice(0, 3)) if (a.flow < 70) out.push(`<li><strong>${esc(cellLabel(a))}</strong>: Flow ${a.flow} aus ${a.count} Fahrten${a.halts ? `, ${a.halts}× an der Ampel gehalten` : ''}.</li>`);
    // Zeitvergleich: dasselbe Feld in verschiedenen Zeitfenstern
    const per = {};
    for (const w of WINDOWS.slice(1)) for (const a of aggregateGrid(list, w.id)) (per[a.k] = per[a.k] || []).push({ w, a });
    // nur Zeitfenster mit mindestens zwei Fahrten vergleichen, sonst ist es Zufall
    for (const k of Object.keys(per)) per[k] = per[k].filter((x) => x.a.count >= 2);
    const cmp = Object.values(per).filter((x) => x.length >= 2).map((x) => {
      x.sort((p, q) => q.a.flow - p.a.flow);
      return { best: x[0], worst: x[x.length - 1], gap: x[0].a.flow - x[x.length - 1].a.flow };
    }).filter((c) => c.gap >= 15).sort((p, q) => q.gap - p.gap).slice(0, 2);
    for (const c of cmp) out.push(`<li><strong>${esc(cellLabel(c.best.a))}</strong>: ${esc(c.best.w.label)} fließt es besser (Flow ${c.best.a.flow}) als ${esc(c.worst.w.label)} (Flow ${c.worst.a.flow}).</li>`);
    return out;
  }
  function renderInsights() {
    const ins = gridInsights(trips);
    $('#map-insights').innerHTML = ins.length
      ? `${cardHead('bulb', 'Was dein Raster zeigt', '', 'amber')}<ul>${ins.join('')}</ul>`
      : '<p class="small muted">Erkenntnisse erscheinen, sobald du Orte mehrmals durchfahren hast.</p>';
  }
  function drawGrid() {
    const cells = aggregateGrid(trips, mapWindow);
    const pts = [];
    for (const a of cells) {
      const col = flowColor(a.flow);
      const op = Math.min(0.65, 0.2 + a.count * 0.09);   // mehr Fahrten, kräftigere Farbe
      const speed = a.t >= 5 ? Math.round(a.d / a.t * 3.6) : null;
      L.rectangle(cellBounds(a.k), { color: col, weight: 1, fillColor: col, fillOpacity: op })
        .bindPopup(`<strong>${esc(cellLabel(a))}</strong><br>Flow ${a.flow} von 100 · ${a.count} Fahrt${a.count === 1 ? '' : 'en'}${a.count < 5 ? ' (noch kein sicheres Muster)' : ''}`
          + (speed != null ? `<br>Ø ${speed} km/h, ${fmtPct(a.s / a.t)} der Zeit Stillstand` : '')
          + (a.n ? `<br>Ampeln: ${a.halts} von ${a.n} mit Halt, Ø ${Math.round(a.wait / a.n / 1000)} s Wartezeit` : '')
          + (a.up || a.down ? `<br>Bewertung: ${a.up} gut, ${a.down} schlecht` : ''))
        .addTo(layer);
      pts.push(cellCenter(a.k));
    }
    if (!cells.length) mapStatus('Im Flow-Raster gibt es für dieses Zeitfenster noch keine Daten.');
    renderInsights();
    // Namen für Felder ohne Ampel nachladen
    const wanted = cells.slice(0, 60).map((a) => a.sig || Object.assign({ signal: 'g' + a.k }, cellCenter(a.k)));
    requestNames(wanted, () => { if (mapLayers.grid && !$('#view-map').hidden) renderInsights(); });   // Karte nicht neu zeichnen, damit offene Infofenster bleiben
    return pts.map((p) => [p.lat, p.lon]);
  }
  function waitColor(s) {
    const stops = [[0, [46, 158, 106]], [20, [224, 163, 38]], [45, [214, 69, 47]]];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) if (s >= stops[i][0] && s <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; }
    const u = b[0] === a[0] ? 1 : Math.min(1, Math.max(0, (s - a[0]) / (b[0] - a[0])));
    return 'rgb(' + a[1].map((x, i) => Math.round(x + (b[1][i] - x) * u)).join(',') + ')';
  }
  // ---------- Kleine Karte für einen Ort oder Weg ----------
  let peekMap = null, peekLayer = null;
  function openPeek(btn) {
    const dlg = $('#map-peek');
    $('#peek-title').textContent = btn.dataset.name || '';
    const parse = (str) => (str || '').split(';').map((s) => s.split(',').map(Number)).filter((p) => isFinite(p[0]) && isFinite(p[1]));
    const kind = btn.dataset.peek;
    const pts = kind === 'r' ? parse(btn.dataset.pts) : kind === 'l' ? [] : [[Number(btn.dataset.lat), Number(btn.dataset.lon)]];
    const arts = (btn.dataset.arts || '').split('|');
    const parts = kind === 'l' ? (btn.dataset.lines || '').split('|').map((x, i) => Object.assign(parse(x), { art: arts[i] || btn.dataset.art })).filter((x) => x.length) : [];
    const route = kind === 'l' ? parse(btn.dataset.pts) : [];
    $('#peek-meta').textContent = btn.dataset.meta ? btn.dataset.meta : kind === 'r' ? `${pts.length} Ampeln auf diesem Weg · grün: erste, rot: letzte Ampel`
      : kind === 'l' ? (btn.dataset.art === 'alt' ? 'Besserer Weg · grün durchgezogen: für dich, grün gestrichelt: der übliche Weg' : btn.dataset.art === 'rad' ? 'Rot: diese Stelle, grün gestrichelt: dein Weg' : btn.dataset.arts != null ? `Strecke · ${parts.length ? 'rot und gelb: Meldungen' : 'keine Meldungen'}` : `${LAGE_LABEL[btn.dataset.art] || 'Meldung'} · farbig: betroffener Abschnitt, grün gestrichelt: dein Weg`) : 'Ampel, an der du gewartet hast';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (typeof L === 'undefined' || !(pts.length || parts.length || route.length)) { $('#peek-meta').textContent = 'Die Karte braucht eine Internetverbindung.'; return; }
    if (!peekMap) {
      peekMap = L.map('peek-map', { zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende' }).addTo(peekMap);
    }
    if (peekLayer) peekLayer.remove();
    peekLayer = L.layerGroup().addTo(peekMap);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1a7f52';
    if (kind === 'l') {
      const whole = btn.dataset.arts != null;   // ganze Strecke eines Ziels
      if (route.length > 1) L.polyline(route, whole ? { color: accent, weight: 5, opacity: 0.8 } : { color: accent, weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(peekLayer);
      for (const p of parts) {
        const col = p.art === 'alt' ? accent : LAGE_CLS[p.art] === 'red' || p.art === 'rad' ? '#d64933' : '#e0a326';
        if (p.length > 1) L.polyline(p, { color: col, weight: 7, opacity: 0.9 }).addTo(peekLayer); else L.circleMarker(p[0], { radius: 9, color: '#ffffff', weight: 2, fillColor: col, fillOpacity: 1 }).addTo(peekLayer);
      }
      const all = whole || !parts.length ? route : [].concat(...parts);
      setTimeout(() => { peekMap.invalidateSize(); if (all.length > 1) peekMap.fitBounds(all, { padding: [40, 40], maxZoom: 16 }); else peekMap.setView(all[0], 15); }, 60);
      return;
    }
    if (pts.length > 1) L.polyline(pts, { color: accent, weight: 4, opacity: 0.7 }).addTo(peekLayer);
    pts.forEach((p, i) => L.circleMarker(p, { radius: pts.length > 1 && i > 0 && i < pts.length - 1 ? 5 : 9, color: '#ffffff', weight: 2, fillColor: i === pts.length - 1 ? '#d64933' : accent, fillOpacity: 1 }).addTo(peekLayer));
    setTimeout(() => {
      peekMap.invalidateSize();
      if (pts.length > 1) peekMap.fitBounds(pts, { padding: [24, 24], maxZoom: 17 }); else peekMap.setView(pts[0], 17);
    }, 60);
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('button.place, button[data-peek], .vf-map[data-peek]');
    if (b) { ev.preventDefault(); ev.stopPropagation(); openPeek(b); }
  }, true);
  // ---------- Barrierefrei: Orte von „Bielefeld barrierefrei erleben“ (Bethel), Toiletten und Aufzüge ----------
  let bfData = store.get('bf', null), bfAt = bfData ? bfData.geladen || 0 : 0, bfLoading = null;
  async function loadBf() {
    if (bfData && Date.now() - bfAt < (bfData.faqOrte && Object.keys(bfData.faqOrte).length >= 4 ? 30 * 60000 : 2 * 60000)) return bfData;
    if (!apiBase()) return bfData;
    if (bfLoading) return bfLoading;
    bfLoading = api('/api/barrierefrei', { cache: 'no-cache' }).then((d) => {
      bfData = Object.assign(d, { geladen: Date.now() }); bfAt = Date.now();
      store.set('bf', bfData);
      return bfData;
    }).catch((e) => { if (!bfData) throw e; return bfData; }).finally(() => { bfLoading = null; });
    return bfLoading;
  }
  // je Profil die Merkmale, auf die es ankommt; „a|b“: eines von beiden reicht
  const BF_CHECK = {
    rollstuhl: [['stufenlos', 'stufenloser Zugang'], ['tuer', 'Türen mindestens 90 cm breit'], ['aufzug|ebene', 'Aufzug oder alles auf einer Ebene'], ['wc', 'Behinderten-WC'], ['rollplatz', 'Plätze für Rollstuhl und Begleitung']],
    rollator: [['stufenlos', 'stufenloser Zugang'], ['aufzug|ebene', 'Aufzug oder alles auf einer Ebene'], ['handlauf', 'Handläufe an Treppen'], ['abstell', 'Platz für Rollator und Gehhilfe'], ['wc', 'Behinderten-WC']],
    sehen: [['stufenkante', 'Stufenkanten kontrastreich'], ['leit|taktil', 'Leitsystem oder Tastplan'], ['licht', 'helle Beleuchtung'], ['hund', 'Assistenzhund willkommen'], ['fuehrung|audio', 'Führung oder Audioguide']],
    hoeren: [['hoeranlage|fm', 'Höranlage'], ['dolmetsch', 'Gebärden- oder Schriftdolmetschen anfragbar'], ['gebaerde', 'Infos in Gebärdensprache']],
    lernen: [['leicht', 'Infos in Leichter Sprache'], ['pikto', 'Bilder und Piktogramme'], ['bildleit', 'Leitsystem mit Farben oder Bildern'], ['hilfe', 'Hilfe vor Ort']],
    ruhe: [['ruhe', 'Ruheraum'], ['wc', 'Behinderten-WC'], ['anmelden', 'Unterstützung vorab anmeldbar'], ['hilfe', 'Hilfe vor Ort']],
    andere: [['stufenlos', 'stufenloser Zugang'], ['wc', 'Behinderten-WC'], ['hilfe', 'Hilfe vor Ort'], ['ruhe', 'Ruheraum']]
  };
  const bfProfile = () => (settings.access.on && BF_CHECK[settings.access.type] ? settings.access.type : 'andere');
  const bfGet = (o, key) => { const v = key.split('|').map((k) => o.f[k]); return v.includes(1) ? 1 : v.includes(0) ? 0 : null; };
  function bfScore(o) {
    const list = BF_CHECK[bfProfile()].map(([k]) => bfGet(o, k)).filter((v) => v != null);
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  }
  const bfColor = (sc) => (sc == null ? '#9aa1a7' : sc >= 0.75 ? '#17784f' : sc >= 0.4 ? '#e0a326' : '#d64933');
  const bfMark = (v) => (v === 1 ? '<b class="bf-ja">✓</b>' : v === 0 ? '<b class="bf-nein">✗</b>' : '<b class="bf-offen">?</b>');
  function bfPopup(o) {
    const rows = BF_CHECK[bfProfile()].map(([k, label]) => `<li>${bfMark(bfGet(o, k))} ${esc(label)}</li>`).join('');
    const notes = [o.hinweis && o.hinweis.eingang ? 'Eingang: ' + o.hinweis.eingang : '', o.hinweis && o.hinweis.service ? (o.hinweis.service.length > 110 ? o.hinweis.service.slice(0, 108) + ' …' : o.hinweis.service) : ''].filter(Boolean).map((t) => `<p class="bf-note">${esc(t)}</p>`).join('');
    return `<strong>${esc(o.n)}</strong>${o.adr ? `<br><span class="muted">${esc(o.adr)}</span>` : ''}<ul class="bf-list">${rows}</ul>${notes}`
      + `${o.tel ? `<p><a href="tel:${esc(o.tel.replace(/[^\d+]/g, ''))}">${esc(o.tel)}</a></p>` : ''}<p><a href="${esc(o.u)}" target="_blank" rel="noopener">Alle Angaben bei „Bielefeld barrierefrei erleben“</a></p>`;
  }
  // Ort von Bethel in der Nähe eines Ziels (bis 80 m) oder per Kennung
  function bfNear(z) {
    if (!bfData || !bfData.orte) return null;
    if (z.bf) { const o = bfData.orte.find((x) => x.id === z.bf); if (o) return o; }
    let best = null, bd = 80;
    for (const o of bfData.orte) { const d = dist({ lat: o.lat, lon: o.lon }, z); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  function bfZielBlock(z, group) {
    const tips = settings.access.on && group !== 'fuss' ? faqNear(z, settings.access.type) : [];   // zu Fuß stehen die Hinweise im Weg-Check
    const tipHtml = tips.length ? `<div class="bf-ziel"><h4 class="vf-h4">${ic('info')} Gut zu wissen</h4>${tips.map((e) => `<details class="faq-mini"><summary>${esc(e.frage)}</summary>${faqHtml(e)}</details>`).join('')}</div>` : '';
    return bfOrtBlock(z) + tipHtml;
  }
  function bfOrtBlock(z) {
    const o = bfNear(z);
    if (!o) return '';
    const items = BF_CHECK[bfProfile()].map(([k, label]) => `<span>${bfMark(bfGet(o, k))} ${esc(label)}</span>`).join('');
    return `<div class="bf-ziel"><h4 class="vf-h4">${ic('access')} Barrierefrei vor Ort${settings.access.on ? '' : ' (allgemein)'}</h4><p class="bf-items small">${items}</p><p class="small muted"><a href="${esc(o.u)}" target="_blank" rel="noopener">Alle Angaben</a> · Bielefeld barrierefrei erleben</p></div>`;
  }
  // Orte von Bethel bei der Zielsuche zuerst
  function bfSearch(q) {
    if (!bfData || !bfData.orte || q.length < 3) return [];
    const n = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
    const words = n(q).split(/\s+/).filter(Boolean);
    return bfData.orte.filter((o) => words.every((w) => n(o.n + ' ' + o.adr).includes(w))).slice(0, 4)
      .map((o) => ({ name: o.n, sub: (o.adr ? o.adr + ' · ' : '') + 'barrierefrei geprüft', lat: o.lat, lon: o.lon, bf: o.id }));
  }
  // ---------- Gut zu wissen: Altstadt-FAQ von barrierefrAI, nach Profil ----------
  let faq = null, faqOpen = null;
  // zuerst die Redaktions-Tabelle vom Server, sonst die mitgelieferte Altstadt-FAQ
  let faqAt = 0;
  async function loadFaq() {
    if (faq && Date.now() - faqAt < 30 * 60000) return faq;
    if (apiBase()) {
      try { const j = await api('/api/faq', { cache: 'no-cache' }); if (j.eintraege && j.eintraege.length) { faq = j; faqAt = Date.now(); return faq; } } catch (e) { /* weiter mit der mitgelieferten Fassung */ }
    }
    if (!faq) { try { faq = await (await fetch('data/altstadt-faq.json')).json(); } catch (e) { faq = null; } }
    faqAt = Date.now();
    return faq;
  }
  // Hinweise mit eigener Lage (Breite/Länge in der Tabelle)
  const faqPunkte = () => (faq ? faq.eintraege.filter((e) => e.lat != null && e.lon != null) : []);
  const FAQ_GROUPS = {
    rollstuhl: ['Rollstuhl'], rollator: ['Rollator', 'Ältere Menschen', 'Vorübergehende Einschränkung'], sehen: ['Sehbehinderung'],
    hoeren: ['Hörbehinderung'], lernen: ['Leichte Sprache', 'Neurodivergenz'], ruhe: ['Psychische Erkrankung', 'Neurodivergenz', 'Chronische Erkrankung'],
    andere: ['Vorübergehende Einschränkung', 'Chronische Erkrankung', 'Ältere Menschen']
  };
  // Orte der FAQ: Mittelpunkt und Umkreis in Metern (die Kunsthalle kommt, wenn vorhanden, aus den Daten von Bethel)
  const FAQ_PLACES = {
    'Alter Markt': [52.02139, 8.53389, 150], 'Obernstraße': [52.0224, 8.5345, 250], 'Haltestelle Rathaus': [52.02053, 8.53457, 150],
    'Jahnplatz': [52.02360, 8.53390, 150], 'Hauptbahnhof': [52.0290, 8.5333, 200], 'Bahnhofstraße': [52.0262, 8.5338, 200],
    'Kunsthalle': [52.01815, 8.52519, 150], 'Altstadt': [52.0210, 8.5345, 600], 'Innenstadt': [52.0225, 8.5335, 900]
  };
  // genauer Mittelpunkt aus OpenStreetMap (vom Server), sonst die Näherung oben
  function faqPlace(name) {
    const r = FAQ_PLACES[name] ? FAQ_PLACES[name][2] : 150;
    const o = bfData && bfData.faqOrte && bfData.faqOrte[name];
    if (o && o.c) return [o.c[0], o.c[1], r];
    if (name === 'Kunsthalle' && bfData && bfData.orte) { const k = bfData.orte.find((x) => /^Kunsthalle/.test(x.n)); if (k) return [k.lat, k.lon, 150]; }
    return FAQ_PLACES[name] || null;
  }
  // Einträge für das Profil: erst die eigenen Gruppen, dann „Alle“; die Krisen-Nummern stehen unter „Hilfe“
  function faqFor(type) {
    if (!faq) return [];
    const mine = FAQ_GROUPS[type] || [];
    const hit = (e) => e.gruppen.some((g) => mine.includes(g));
    return faq.eintraege.filter((e) => e.id !== 'AS-35' && (hit(e) || e.gruppen.includes('Alle'))).sort((a, b) => hit(b) - hit(a));
  }
  const firstSentence = (t) => { const m = /^(.{20,140}?[.!?])(\s|$)/.exec(t.replace(/\n/g, ' ')); return m ? m[1] : t.slice(0, 120) + (t.length > 120 ? ' …' : ''); };
  const faqHtml = (e) => `<p class="faq-a">${esc(e.antwort).replace(/\n/g, '<br>')}</p><p class="small muted">${esc(e.orte.join(', '))} · barrierefrAI</p>`;
  function faqCards() {
    if (!settings.access.on || !faq) return '';
    const list = faqFor(settings.access.type);
    if (!list.length) return '';
    const card = (e) => `<div class="tipcard" data-world="acc"><button type="button" class="tip-row" data-faq="${e.id}" aria-expanded="${faqOpen === e.id}"><span class="tip-ic">${ic('info')}</span><span class="tip-main"><b>${esc(e.frage)}</b><span>${esc(firstSentence(e.antwort))}</span></span></button>${faqOpen === e.id ? `<div class="tip-detail">${faqHtml(e)}</div>` : ''}</div>`;
    const top = list.slice(0, 4), rest = list.slice(4);
    return `<h3 class="eyebrow">Gut zu wissen · ${esc(ACCESS_LABEL[settings.access.type])}</h3>${top.map(card).join('')}`
      + (rest.length ? `<details class="more-box"><summary>${ic('list')}Weitere Fragen (${rest.length})</summary><div class="faq-rest">${rest.map(card).join('')}</div></details>` : '');
  }
  // Ziel in der Nähe eines Ortes aus der FAQ: bis zu zwei passende Hinweise
  function faqNear(z, type) {
    if (!faq) return [];
    const places = Object.keys(FAQ_PLACES).filter((n) => { const p = faqPlace(n); return p && dist({ lat: p[0], lon: p[1] }, z) <= p[2]; });
    const mine = FAQ_GROUPS[type] || [];
    const punkte = faqPunkte().filter((e) => dist(e, z) <= 150 && (e.gruppen.includes('Alle') || e.gruppen.some((g) => mine.includes(g))));
    if (!places.length) return punkte.slice(0, 2);
    return punkte.concat(faq.eintraege.filter((e) => e.lat == null && e.orte.some((o) => places.includes(o)) && e.gruppen.some((g) => mine.includes(g))))
      .sort((a, b) => (b.orte.some((o) => o !== 'Altstadt' && places.includes(o)) - a.orte.some((o) => o !== 'Altstadt' && places.includes(o)))).slice(0, 2);
  }
  // ---------- Weg-Check zu Fuß: Belag, Stufen, Steigung, Bordsteine, Gleise, Ampeln (Fußnetz vom Server) ----------
  const fussTiles = {}, fussLoading = {};
  async function fussTile(key) {
    if (fussTiles[key]) return fussTiles[key];
    if (fussLoading[key]) return fussLoading[key];
    fussLoading[key] = (async () => {
      const res = await fetchWithTimeout(apiBase() + '/api/fussnetz?k=' + key, {}, 120000);
      if (!res.ok) throw new Error(res.status === 404 ? 'Der Server kennt den Weg-Check noch nicht' : 'HTTP ' + res.status);
      const j = await res.json();
      fussTiles[key] = { ways: j.ways || [], nodes: j.nodes || [] };
      return fussTiles[key];
    })();
    try { return await fussLoading[key]; } finally { delete fussLoading[key]; }
  }
  const FUSS_CLS = {
    gut: { col: '#17784f', label: 'gut begehbar' },
    holprig: { col: '#e0a326', label: 'holpriges Pflaster' },
    kopfstein: { col: '#d64933', label: 'Kopfsteinpflaster' },
    unbefestigt: { col: '#b8650a', label: 'unbefestigter Weg' },
    steil: { col: '#7a3fa0', label: 'steiler als 6 %' },
    stufen: { col: '#15191e', label: 'Stufen' }
  };
  const FUSS_BAD = ['stufen', 'kopfstein', 'steil', 'unbefestigt', 'holprig'];
  async function fussRate(pts) {
    if (!pts || pts.length < 2 || !apiBase()) return null;
    const s = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = dist({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
      const n = Math.max(1, Math.round(d / 10));
      for (let k = 0; k < n; k++) s.push({ p: [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], m: d / n, h: radBearing(a, b) });
    }
    const keys = [...new Set(s.map((x) => radKey(x.p[0], x.p[1])))].slice(0, 6);
    const tiles = {};
    for (const k of keys) tiles[k] = await fussTile(k);
    const m = { gut: 0, holprig: 0, kopfstein: 0, unbefestigt: 0, steil: 0, stufen: 0, offen: 0 };
    const runs = [];
    let run = null;
    const nodeHits = { b: [], g: [], a: [] };
    const seenNode = new Set();
    for (const x of s) {
      const tile = tiles[radKey(x.p[0], x.p[1])];
      let best = null;
      if (tile) {
        const idx = radIndex(tile);
        const cla = Math.floor(x.p[0] / RAD_CELL), clo = Math.floor(x.p[1] / RAD_CELL);
        const P = { lat: x.p[0], lon: x.p[1] };
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const list = idx.get((cla + a) + '_' + (clo + b));
          if (!list) continue;
          for (let j = 0; j < list.length; j += 2) {
            const w = tile.ways[list[j]], i = list[j + 1];
            const d = distToWay(P, [{ lat: w.g[i][0], lon: w.g[i][1] }, { lat: w.g[i + 1][0], lon: w.g[i + 1][1] }]);
            if (d > 12) continue;
            let ad = Math.abs(radBearing(w.g[i], w.g[i + 1]) - x.h) % 180;
            ad = Math.min(ad, 180 - ad);
            if (ad > 35 && d > 4) continue;
            // zu Fuß zählt der nächste Weg, nicht der beste; Stufen in Gehrichtung direkt am Weg gehen vor
            const par = ad <= 35, stufe = w.c === 'stufen' && d <= 5 && par;
            if (w.c === 'stufen' && !stufe) continue;   // querende Treppe an einer Kreuzung zählt nicht
            if (stufe) {   // nur auf der Treppe selbst, nicht an ihrem Anfang oder Ende (dort zweigt man oft nur ab)
              const e0 = w.g[0], e1 = w.g[w.g.length - 1], lenW = dist({ lat: e0[0], lon: e0[1] }, { lat: e1[0], lon: e1[1] }), tol = Math.min(3, lenW / 3);
              if (dist(P, { lat: e0[0], lon: e0[1] }) < tol || dist(P, { lat: e1[0], lon: e1[1] }) < tol) continue;
            }
            if (!best || (stufe && !best.stufe) || (d < best.d && !best.stufe)) best = { w, d, stufe };
          }
        }
        for (const nd of tile.nodes) {
          if (Math.abs(nd[0] - x.p[0]) > 0.0002 || Math.abs(nd[1] - x.p[1]) > 0.0003) continue;
          const key = nd[0] + ',' + nd[1];
          if (seenNode.has(key) || dist({ lat: nd[0], lon: nd[1] }, { lat: x.p[0], lon: x.p[1] }) > 10) continue;
          seenNode.add(key);
          nodeHits[nd[2]].push(nd);
        }
      }
      const c = best ? best.w.c : 'offen';
      m[c] += x.m;
      if (FUSS_BAD.includes(c)) {
        const name = best.w.n || '';
        if (run && run.c === c && run.name === name) { run.m += x.m; run.pts.push(x.p); }
        else { run = { c, name, m: x.m, pts: [x.p] }; runs.push(run); }
      } else run = null;
    }
    const total = Object.values(m).reduce((a, b) => a + b, 0) || 1;
    // Stellen zusammenfassen: je Art und Straße
    const by = {};
    for (const r of runs) {
      if (r.c !== 'stufen' && r.m < 25) continue;
      const k = r.c + '|' + r.name;
      if (!by[k]) by[k] = { c: r.c, name: r.name, m: 0, n: 0, lines: [] };
      by[k].m += r.m; by[k].n++; by[k].lines.push(r.pts);
    }
    // Hinweise aus der Altstadt-FAQ für Orte unterwegs
    const places = Object.keys(FAQ_PLACES).filter((n) => n !== 'Altstadt' && n !== 'Innenstadt').filter((n) => { const p = faqPlace(n); return p && s.some((x, i) => i % 3 === 0 && dist({ lat: p[0], lon: p[1] }, { lat: x.p[0], lon: x.p[1] }) <= p[2]); });
    const punkte = faqPunkte().filter((e) => s.some((x, i) => i % 2 === 0 && dist(e, { lat: x.p[0], lon: x.p[1] }) <= 40));
    return { m, total, pts, punkte, stellen: Object.values(by).sort((a, b) => FUSS_BAD.indexOf(a.c) - FUSS_BAD.indexOf(b.c) || b.m - a.m), bord: nodeHits.b.length, gleis: nodeHits.g, ampeln: nodeHits.a, places };
  }
  const FUSS_WEIGHT = { rollstuhl: ['stufen', 'kopfstein', 'steil', 'unbefestigt', 'holprig'], rollator: ['stufen', 'kopfstein', 'unbefestigt', 'steil', 'holprig'], sehen: ['stufen'], hoeren: [], lernen: ['stufen'], ruhe: ['stufen', 'steil'] };
  // mit Rollstuhl oder Rollator nimmt die Navigation den Weg ohne Stufen von selbst, wenn es ihn gibt
  const altAuto = (r) => !!(r && r.alt && settings.access.on && ['rollstuhl', 'rollator'].includes(settings.access.type) && r.stellen.some((x) => x.c === 'stufen') && !r.alt.r.stellen.some((x) => x.c === 'stufen'));
  function fussBlock(r, route) {
    if (!r) return '';
    if (r.loading) return '<p class="small muted" role="status">Der Weg wird geprüft …</p>';
    if (r.error) return `<p class="small muted">${esc(r.error)}</p>`;
    const type = settings.access.on ? settings.access.type : null;
    const known = r.total - r.m.offen;
    const pct = (k) => (known ? Math.round(r.m[k] / known * 100) : 0);
    const important = FUSS_WEIGHT[type] || FUSS_BAD;
    const lines = [];
    const peek = (name, art, ls) => `<button type="button" class="place" data-peek="l" data-name="${esc(name)}" data-art="${art}" data-lines="${ls.map((l) => l.map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';')).join('|')}" data-pts="${route}">${esc(name)}</button>`;
    for (const st of r.stellen.filter((x) => important.includes(x.c)).slice(0, 5)) {
      const what = st.c === 'stufen' ? `${st.n === 1 ? 'eine Stelle' : st.n + ' Stellen'} mit Stufen` : `${fmtLen(st.m)} ${FUSS_CLS[st.c].label}`;
      lines.push(`<li>${bfMark(0)} ${peek(st.name || FUSS_CLS[st.c].label, 'rad', st.lines)}<span class="small muted"> · ${what}</span></li>`);
    }
    if (r.bord && (type === 'rollstuhl' || type === 'rollator')) lines.push(`<li>${bfMark(0)} ${r.bord === 1 ? 'ein hoher Bordstein' : r.bord + ' hohe Bordsteine'}</li>`);
    if (r.gleis.length && (type === 'rollstuhl' || type === 'rollator' || type === 'sehen' || type === 'hoeren')) lines.push(`<li>${bfMark(0)} ${peek(r.gleis.length === 1 ? 'Gleise queren' : r.gleis.length + '× Gleise queren', 'rad', r.gleis.map((g) => [[g[0], g[1]]]))}<span class="small muted"> · ${type === 'hoeren' ? 'Stadtbahn kommt leise, auf Signale achten' : 'möglichst im rechten Winkel'}</span></li>`);
    const ohneTon = r.ampeln.filter((a) => a[3] === 0).length, mitTon = r.ampeln.filter((a) => a[3] === 1).length;
    if (r.ampeln.length && type === 'sehen') lines.push(`<li>${mitTon === r.ampeln.length ? bfMark(1) : bfMark(0)} ${r.ampeln.length} Ampel${r.ampeln.length === 1 ? '' : 'n'}${mitTon ? `, ${mitTon} mit Tonsignal` : ''}${ohneTon ? `, ${ohneTon} ohne` : ''}${r.ampeln.length - mitTon - ohneTon ? `, ${r.ampeln.length - mitTon - ohneTon} ohne Angabe` : ''}</li>`);
    const near = r.pts ? hinwNear(r.pts) : [];
    for (const h of near.slice(0, 3)) lines.push(`<li>${bfMark(0)} ${peek(HINW[h.art] || h.art, 'rad', [[[h.lat, h.lon]]])}<span class="small muted"> · gemeldet ${ago(h.t)}${h.ok ? `, ${h.ok}× bestätigt` : ''}</span></li>`);
    const bad = important.reduce((a, k) => a + pct(k), 0);
    const title = !known && !lines.length ? 'Weg-Check' : !lines.length ? 'Keine Hindernisse bekannt' : bad >= 15 || r.stellen.some((x) => x.c === 'stufen' && important.includes('stufen')) ? 'Mit Hindernissen' : 'Einzelne Hindernisse';
    const order = ['gut', 'holprig', 'unbefestigt', 'kopfstein', 'steil', 'stufen'];
    const bar = known ? `<div class="rad-bar" role="img" aria-label="${esc(order.filter((k) => pct(k)).map((k) => `${pct(k)} % ${FUSS_CLS[k].label}`).join(', '))}">${order.map((k) => (r.m[k] ? `<i style="width:${(r.m[k] / known * 100).toFixed(1)}%;background:${FUSS_CLS[k].col}"></i>` : '')).join('')}</div>` : '';
    const tips = type && faq ? (r.punkte || []).filter((e) => e.gruppen.includes('Alle') || e.gruppen.some((g) => (FAQ_GROUPS[type] || []).includes(g))).concat(faq.eintraege.filter((e) => e.lat == null && e.orte.some((o) => r.places.includes(o)) && e.gruppen.some((g) => (FAQ_GROUPS[type] || []).includes(g)))).slice(0, 3) : [];
    let altHtml = '';
    if (r.alt) {
      const fewer = [];
      const st0 = r.stellen.filter((x) => x.c === 'stufen').length, st1 = r.alt.r.stellen.filter((x) => x.c === 'stufen').length;
      if (st0 && !st1) fewer.push('ohne Stufen');
      if (r.m.kopfstein > 20 && r.alt.r.m.kopfstein < r.m.kopfstein / 2) fewer.push('ohne Kopfsteinpflaster');
      if (r.bord > r.alt.r.bord) fewer.push('weniger hohe Bordsteine');
      if (r.gleis.length > r.alt.r.gleis.length) fewer.push('weniger Gleise');
      const plus = Math.max(0, Math.round(r.alt.plus / 10) * 10);
      const auto = altAuto(r);
      altHtml = `<div class="alt-weg"><p><b>${ic('route')} Besserer Weg für dich</b><br>${esc(fewer.join(', ') || 'mit weniger Hindernissen')}, ${plus ? `etwa ${plus} m länger (+${Math.max(1, Math.round(plus / 60))} min)` : 'kaum länger'}.${auto ? ' Die Navigation nimmt diesen Weg.' : ''}</p>`
        + `<button type="button" class="btn quiet" data-peek="l" data-name="Besserer Weg" data-art="alt" data-lines="${r.alt.pts.map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';')}" data-pts="${route}">${ic('map')}Weg auf der Karte</button>`
        + (auto ? '' : `<button type="button" class="btn quiet" data-vf="go-fussalt">${ic('play')}Diesen Weg gehen</button>`) + '</div>';
    } else if (FUSS_PEN[type] && lines.length && !r.altDone) altHtml = '<p class="small muted" role="status">Flowtown sucht einen Weg mit weniger Hindernissen …</p>';
    else if (FUSS_PEN[type] && lines.length && r.altDone) altHtml = '<p class="small muted">Einen besseren Weg ohne große Umwege gibt es laut den Kartendaten nicht.</p>';
    return `<div class="rad-rate${type ? ' acc-block' : ''}"><h4 class="vf-h4">${title}${type ? ' · ' + esc(ACCESS_LABEL[type]) : ''}</h4>${bar}${lines.length ? `<ul class="rad-ohne bf-list">${lines.join('')}</ul>` : ''}${altHtml}`
      + (tips.length ? `<div class="bf-ziel"><h4 class="vf-h4">${ic('info')} Unterwegs gut zu wissen</h4>${tips.map((e) => `<details class="faq-mini"><summary>${esc(e.frage)}</summary>${faqHtml(e)}</details>`).join('')}</div>` : '')
      + `<p class="small muted">${known < r.total * 0.5 ? 'Zu Teilen des Wegs gibt es keine Angaben. ' : ''}Laut OpenStreetMap, nicht überall vollständig.</p></div>`;
  }
  // Gehzeit für das Profil: HERE rechnet mit zügigem Gehen
  const WALK_FACTOR = { rollator: 1.4, ruhe: 1.3, rollstuhl: 1.1, sehen: 1.2 };
  // ---------- Stufenloser Weg: eigene Suche im Fußnetz, je Profil mit Aufschlägen für Hindernisse ----------
  const FUSS_PEN = {
    rollstuhl: { stufen: Infinity, kopfstein: 6, unbefestigt: 4, steil: 5, holprig: 2, offen: 1.15, gut: 1, b: 60, g: 25 },
    rollator: { stufen: 12, kopfstein: 4, unbefestigt: 3, steil: 3, holprig: 1.8, offen: 1.1, gut: 1, b: 30, g: 15 },
    sehen: { stufen: 2, kopfstein: 1.1, unbefestigt: 1.2, steil: 1.1, holprig: 1, offen: 1.05, gut: 1, b: 0, g: 30 },
    ruhe: { stufen: 3, kopfstein: 1.3, unbefestigt: 1.2, steil: 2, holprig: 1.2, offen: 1.05, gut: 1, b: 0, g: 0 }
  };
  // Maß für „wie hinderlich“ ein geprüfter Weg für das Profil ist
  function fussBad(r, type) {
    const pen = FUSS_PEN[type];
    if (!r || !pen) return 0;
    let x = 0;
    for (const [c, m] of Object.entries(r.m)) if (c !== 'offen' && c !== 'gut') x += m * (Math.min(pen[c], 20) - 1);
    return x + r.stellen.filter((s) => s.c === 'stufen').length * (pen.stufen === Infinity ? 1000 : pen.stufen * 20) + r.bord * pen.b + r.gleis.length * pen.g;
  }
  function stepsFromPath(pts, names) {
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + dist({ lat: pts[k - 1][0], lon: pts[k - 1][1] }, { lat: pts[k][0], lon: pts[k][1] }));
    // Richtung über etwa 10 m davor und danach, damit kleine Zacken nicht als Abbiegen zählen
    const dirAt = (k, back) => { let j = k; while (back ? j > 0 && cum[k] - cum[j] < 10 : j < pts.length - 1 && cum[j] - cum[k] < 10) j += back ? -1 : 1; return back ? radBearing(pts[j], pts[k]) : radBearing(pts[k], pts[j]); };
    const out = [];
    for (let k = 1; k < pts.length - 1; k++) {
      let dd = ((dirAt(k, false) - dirAt(k, true) + 540) % 360) - 180;
      if (Math.abs(dd) < 40) continue;
      if (out.length && cum[k] - cum[out[out.length - 1].i] < 15) continue;
      out.push({ i: k, art: 'turn', dir: dd > 0 ? 'right' : 'left', sev: Math.abs(dd) < 60 ? 'light' : Math.abs(dd) > 120 ? 'sharp' : '', str: names && names[k + 1] && names[k + 1] !== names[k] ? names[k + 1] : '' });
    }
    out.push({ i: pts.length - 1, art: 'arrive' });
    return out;
  }
  async function fussRoute(from, to, type) {
    const pen = FUSS_PEN[type];
    if (!pen) return null;
    const la0 = Math.min(from[0], to[0]) - 0.0025, la1 = Math.max(from[0], to[0]) + 0.0025, lo0 = Math.min(from[1], to[1]) - 0.004, lo1 = Math.max(from[1], to[1]) + 0.004;
    const keys = [];
    for (let a = Math.floor(la0 / RAD_TILE); a <= Math.floor(la1 / RAD_TILE); a++) for (let o = Math.floor(lo0 / RAD_TILE); o <= Math.floor(lo1 / RAD_TILE); o++) keys.push(a + '_' + o);
    if (keys.length > 6) return null;
    const tiles = [];
    for (const k of keys) tiles.push(await fussTile(k));
    // Graph: gleiche Koordinate = gleicher Knoten (OpenStreetMap teilt Knoten an Kreuzungen)
    const id = new Map(), lat = [], lon = [], adj = [];
    const node = (p) => { const k = p[0] + ',' + p[1]; let i = id.get(k); if (i == null) { i = lat.length; id.set(k, i); lat.push(p[0]); lon.push(p[1]); adj.push([]); } return i; };
    const inBox = (p) => p[0] >= la0 && p[0] <= la1 && p[1] >= lo0 && p[1] <= lo1;
    const wnames = [''], wname = (n) => { let i = wnames.indexOf(n || ''); if (i < 0) { i = wnames.length; wnames.push(n); } return i; };
    for (const t of tiles) for (const w of t.ways) {
      const f = pen[w.c] == null ? 1.1 : pen[w.c], ni = wname(w.n);
      if (f === Infinity) continue;
      for (let i = 0; i < w.g.length - 1; i++) {
        if (!inBox(w.g[i]) && !inBox(w.g[i + 1])) continue;
        const a = node(w.g[i]), b = node(w.g[i + 1]);
        const d = dist({ lat: lat[a], lon: lon[a] }, { lat: lat[b], lon: lon[b] });
        adj[a].push(b, d, d * f, ni); adj[b].push(a, d, d * f, ni);
      }
    }
    const extra = new Float64Array(lat.length);
    for (const t of tiles) for (const n of t.nodes) { const i = id.get(n[0] + ',' + n[1]); if (i != null) extra[i] += n[2] === 'b' ? pen.b : n[2] === 'g' ? pen.g : 0; }
    const snap = (p) => { let best = -1, bd = 80; for (let i = 0; i < lat.length; i++) { if (!adj[i].length) continue; const d = dist({ lat: lat[i], lon: lon[i] }, { lat: p[0], lon: p[1] }); if (d < bd) { bd = d; best = i; } } return best; };
    const s = snap(from), e = snap(to);
    if (s < 0 || e < 0) return null;
    // A*: Kosten = Länge mal Aufschlag, Schätzung = Luftlinie (nie zu hoch, weil Aufschläge mindestens 1 sind)
    const g = new Float64Array(lat.length).fill(Infinity), prev = new Int32Array(lat.length).fill(-1), len = new Float64Array(lat.length), via = new Int32Array(lat.length);
    const h = (i) => dist({ lat: lat[i], lon: lon[i] }, { lat: lat[e], lon: lon[e] });
    const heap = [[h(s), s]];
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g[s] = 0;
    let steps = 0;
    while (heap.length && steps++ < 400000) {
      const [, u] = pop();
      if (u === e) break;
      const a = adj[u];
      for (let k = 0; k < a.length; k += 4) {
        const v = a[k], c = g[u] + a[k + 2] + extra[v];
        if (c < g[v]) { g[v] = c; prev[v] = u; via[v] = a[k + 3]; len[v] = len[u] + a[k + 1]; push([c + h(v), v]); }
      }
    }
    if (g[e] === Infinity) return null;
    const path = [];
    const names = [];
    for (let i = e; i >= 0; i = prev[i]) { path.push([lat[i], lon[i]]); names.push(wnames[via[i]] || ''); }
    path.reverse(); names.reverse();   // names[k]: Straße, auf der man zu Punkt k kommt
    return { pts: path, m: len[e], names };
  }
  // ---------- Hinweise von Nutzer*innen: Hindernisse melden, bestätigen, als erledigt markieren ----------
  const HINW = { stufe: 'Stufe oder Treppe', bordstein: 'Hoher Bordstein', pflaster: 'Schlechter Belag', aufzug: 'Aufzug defekt', blockiert: 'Gehweg blockiert', toilette: 'Toilette nicht nutzbar', ampel: 'Ampel zu kurz grün oder ohne Ton', gut: 'Gut zugänglich' };
  let hinw = null, hinwAt = 0;
  async function loadHinweise(force) {
    if (!apiBase()) return [];
    if (!force && hinw && Date.now() - hinwAt < 120000) return hinw;
    const j = await api('/api/hinweise');
    hinw = j.hinweise || []; hinwAt = Date.now();
    return hinw;
  }
  const ago = (t) => { const d = Math.floor((Date.now() - t) / 864e5); return d < 1 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`; };
  function hinwPopup(h) {
    return `<strong>${esc(HINW[h.art] || h.art)}</strong>${h.geprueft ? '<br><b class="bf-ja">✓ von der Redaktion geprüft</b>' : ''}<br><span class="muted">gemeldet ${ago(h.t)}${h.ok ? `, ${h.ok}× bestätigt` : ''}${h.t2 && h.ok ? `, zuletzt ${ago(h.t2)}` : ''}</span>`
      + `<div class="hv-row"><button type="button" class="btn quiet" data-hv="${h.id}|1">Stimmt noch</button><button type="button" class="btn quiet" data-hv="${h.id}|0">Ist weg</button></div><p class="small muted">Von Nutzer*innen gemeldet</p>`;
  }
  const hinwIcon = (art, ok) => L.divIcon({ className: 'hinw-pin' + (art === 'gut' ? ' gut' : '') + (ok ? ' geprueft' : ''), html: `<span>${art === 'gut' ? '✓' : '!'}</span>`, iconSize: [26, 26] });
  // Melden: erst die Stelle auf der Karte antippen, dann die Art wählen
  let meldenAt = null;
  function startMelden() {
    if (!map) return;
    mapStatus('Tippe auf der Karte auf die Stelle, die du melden willst.');
    $('#btn-melden').setAttribute('aria-pressed', 'true');
    map.once('click', (ev) => {
      $('#btn-melden').setAttribute('aria-pressed', 'false');
      mapStatus('');
      meldenAt = [ev.latlng.lat, ev.latlng.lng];
      $('#melden-msg').textContent = '';
      $$('#melden-dlg input[name="hart"]').forEach((i) => { i.checked = false; });
      const d = $('#melden-dlg');
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    });
  }
  async function sendMelden() {
    const art = ($('#melden-dlg input[name="hart"]:checked') || {}).value;
    if (!art) { $('#melden-msg').textContent = 'Bitte wähle aus, was du melden willst.'; return; }
    $('#melden-msg').textContent = 'Wird gesendet …';
    try {
      await postJson('/api/hinweis', { lat: meldenAt[0], lon: meldenAt[1], art });
      $('#melden-dlg').close();
      await loadHinweise(true);
      if (mapLayers.acc) drawAcc();
      mapStatus('Danke! Dein Hinweis ist auf der Karte.');
      setTimeout(() => mapStatus(''), 4000);
    } catch (e) { $('#melden-msg').textContent = e.message === 'Failed to fetch' ? 'Keine Verbindung zum Server.' : e.message; }
  }
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-hv]');
    if (!b) return;
    const [id, yes] = b.dataset.hv.split('|');
    b.disabled = true;
    try { await postJson('/api/hinweis/stimme', { id, stimmt: yes === '1' }); b.textContent = 'Danke!'; await loadHinweise(true); setTimeout(() => { if (mapLayers.acc) drawAcc(); }, 800); }
    catch (e) { b.textContent = e.message; }
  });
  // Hinweise nahe an einem Weg (bis 20 m)
  function hinwNear(pts) {
    if (!hinw || !hinw.length) return [];
    return hinw.filter((h) => h.art !== 'gut' && pts.some((p, i) => i % 2 === 0 && dist({ lat: p[0], lon: p[1] }, h) <= 20));
  }
  // ---------- Karte: Ebenen zum An- und Ausschalten ----------
  const MAP_LAYERS = ['signals', 'grid', 'rad', 'tram', 'lage', 'stau', 'acc'];
  let mapLayers = Object.assign({ signals: true, grid: false, rad: false, tram: false, lage: false, stau: false, acc: false }, settings.mapLayers || {});
  const groups = {};
  const mapStatus = (t) => { $('#map-status').textContent = t || ''; $('#map-status').hidden = !t; };
  // Die Karte als Liste: für Screenreader, ohne Internet und für alle, die lieber lesen als suchen
  let mapListMarkers = {};
  function renderMapList() {
    const box = $('#map-list');
    if (!box) return;
    const per = aggregate(trips).per.map((a) => { const n = a.halts + a.passes; return { a, n, avg: a.wait / n / 1000 }; })
      .filter((x) => x.n > 0).sort((x, y) => y.avg - x.avg);
    box.hidden = !per.length;
    if (!per.length) { box.innerHTML = ''; return; }
    const top = per.slice(0, 15);
    box.innerHTML = `<summary>${ic('list')}Meine Ampeln als Liste (${per.length})</summary>
      <p class="small muted">Sortiert nach Wartezeit, die längste zuerst. Tippe auf eine Ampel, um sie auf der Karte zu zeigen.</p>
      <ol class="map-list-ol">${top.map((x) => `<li><button type="button" class="map-list-row" data-mapsig="${esc(String(x.a.signal))}"><b>${esc(labelFor(x.a.sample))}</b><span>Ø ${Math.round(x.avg)} s Wartezeit · ${fmtPct(x.a.halts / x.n)} mit Halt · ${x.n} ${x.n === 1 ? 'Fahrt' : 'Fahrten'}</span></button></li>`).join('')}</ol>
      ${per.length > top.length ? `<p class="small muted">Dazu ${per.length - top.length} weitere mit kürzerer Wartezeit.</p>` : ''}`;
  }
  function renderMap() {
    renderMapList();
    if (typeof L === 'undefined') { mapStatus('Die Karte braucht eine Internetverbindung.'); return; }
    if (!map) {
      map = L.map('map', { zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende' }).addTo(map);
      map.setView([52.0211, 8.5325], 13);
      MAP_LAYERS.forEach((k) => { groups[k] = L.layerGroup().addTo(map); });
      let radT = null;
      map.on('moveend', () => { if (mapLayers.rad) { clearTimeout(radT); radT = setTimeout(drawRad, 300); } });
    }
    setTimeout(() => map.invalidateSize(), 50);
    $$('#map-layers button').forEach((b) => b.setAttribute('aria-pressed', String(!!mapLayers[b.dataset.layer])));
    mapStatus('');
    const fit = [];
    // Meine Ampeln
    groups.signals.clearLayers();
    mapListMarkers = {};
    if (mapLayers.signals) {
      layer = groups.signals;
      for (const a of aggregate(trips).per) {
        const n = a.halts + a.passes;
        const avgAll = a.wait / n / 1000;            // Ø Wartezeit über alle Fahrten, auch ohne Halt
        const col = waitColor(avgAll);
        const dirLines = a.dirs.map((d) => {
          const dn = d.halts + d.passes;
          return `${esc(dirName(d.h) || 'Richtung unbekannt')}: ${dn}× vorbei, ${fmtPct(d.halts / dn)} mit Halt, Ø ${Math.round(d.wait / dn / 1000)} s`;
        }).join('<br>');
        mapListMarkers[a.signal] = L.circleMarker([a.lat, a.lon], { radius: 8 + Math.sqrt(avgAll) * 5, color: col, weight: 2, fillColor: col, fillOpacity: 0.45 })
          .bindPopup(`<strong>${esc(labelFor(a.sample))}</strong>${lsaLabel(clusterById[a.signal]) ? `<br><span class="muted">${esc(lsaLabel(clusterById[a.signal]))}</span>` : ''}<br>${n} Fahrten, ${fmtPct(a.halts / n)} mit Halt<br>Ø Wartezeit ${Math.round(avgAll)} s, längste ${fmtS(a.maxWait)}${a.up || a.down ? `<br>Bewertung: ${a.up} gut, ${a.down} schlecht` : ''}${settings.access.on ? `<br>${esc(accText(a.signal))}` : ''}<br><br>${dirLines}`)
          .addTo(layer);
        fit.push([a.lat, a.lon]);
      }
    }
    // Flow-Raster
    groups.grid.clearLayers();
    $('#map-window').hidden = !mapLayers.grid;
    $('#map-insights').hidden = !mapLayers.grid;
    if (mapLayers.grid) { layer = groups.grid; fit.push(...drawGrid()); }
    $('#map-empty').hidden = true;
    // Radwege, Stadtbahn, Verkehrslage
    if (mapLayers.rad && !mapFitted && map.getZoom() < 14) { map.setView(meMarker ? meMarker.getLatLng() : map.getCenter(), 15, { animate: false }); mapFitted = true; }
    if (mapLayers.rad) drawRad(); else { groups.rad.clearLayers(); radDrawn = ''; }
    drawNetz();
    if (mapLayers.tram) drawTram(); else groups.tram.clearLayers();
    if (mapLayers.lage || mapLayers.stau) drawLage(); else { groups.lage.clearLayers(); groups.stau.clearLayers(); }
    if (mapLayers.acc) drawAcc(); else groups.acc.clearLayers();
    $('#btn-melden').hidden = !mapLayers.acc || !apiBase();
    renderMapLegend();
    mapHasData = fit.length > 0;
    if (!mapFitted && fit.length && !mapLayers.rad) { map.fitBounds(fit, { padding: [40, 40], maxZoom: 16 }); mapFitted = true; }
    startMyLocation();
  }
  function renderMapLegend() {
    const parts = [];
    if (mapLayers.signals) parts.push('<p><b>Meine Ampeln:</b> je größer der Kreis, desto länger wartest du dort. Grün kurz, rot lang.</p>');
    if (mapLayers.grid) parts.push('<p><b>Flow-Raster:</b> Felder von etwa 150 × 150 m. Grün: es fließt, rot: es hakt.</p>');
    if (mapLayers.rad) {
      const keyText = { gut: 'Radweg, Fahrradstraße', ruhig: 'ruhige Straße', mittel: 'Radstreifen, Tempo 30', schlecht: 'ohne Radweg' };
      parts.push(`<div class="rad-keys">${Object.keys(RAD_CLS).map((k) => `<span class="rad-key"><i style="background:${RAD_CLS[k].col}"></i>${keyText[k]}</span>`).join('')}${stadt2 ? '<span class="rad-key"><i class="dash dark"></i>Radverkehrsnetz der Stadt</span>' : ''}</div><p class="muted">Radwege laut OpenStreetMap, nicht überall vollständig${stadt2 ? '; Radverkehrsnetz: Stadt Bielefeld (Open Data)' : ''}.</p>`);
    }
    if (mapLayers.acc) parts.push(`<p><b>Barrierefrei${settings.access.on ? ' (Profil: ' + esc(ACCESS_LABEL[settings.access.type]) + ')' : ''}:</b> Orte von „Bielefeld barrierefrei erleben“ (Bethel). Grün: passt, gelb: teilweise, rot: eher nicht, grau: keine Angabe. Blaue Punkte: rollstuhlgerechte Toiletten. Blaues P: Behindertenparkplatz (Stadt Bielefeld, OpenStreetMap). Blaues i mit gestrichelter Linie: Straße oder Platz mit Hinweisen aus der Altstadt-FAQ, die Linie zeigt, welcher Bereich gemeint ist${settings.access.on ? '' : '. Wähle in den Einstellungen dein Profil, dann zeigt die Karte, was für dich zählt'}.</p>`);
    if (mapLayers.tram) parts.push(`<p><b>Stadtbahn:</b> Linien von Haltestelle zu Haltestelle, vereinfacht. Tippe auf eine Haltestelle für die nächsten Abfahrten.</p>${hst && Object.keys(hst.map).length ? `<div class="rad-keys"><span class="rad-key"><i style="background:${HST_COL.ja}"></i>Hochbahnsteig</span><span class="rad-key"><i style="background:${HST_COL.nein}"></i>kein Hochbahnsteig</span><span class="rad-key"><i style="background:${HST_COL.teilweise}"></i>teilweise</span></div><p class="muted">Laut Liste der Redaktion barrierefrAI, die Quelle steht bei der Haltestelle. Weiße Punkte: noch keine Angabe.</p>` : ''}${stadt2 && stadt2.pr.length ? '<p class="muted">Blaues P+R: Park + Ride mit Anzahl der Plätze (Stadt Bielefeld).</p>' : ''}`);
    const n = (k) => (lageCounts[k] != null ? ` (${lageCounts[k]})` : '');
    if (mapLayers.lage) parts.push(`<div class="rad-keys"><span class="rad-key"><i style="background:#e0a326"></i>Baustelle${n('baustelle')}</span><span class="rad-key"><i class="dash"></i>Sperrung${n('sperrung')}</span></div>`);
    if (mapLayers.stau) parts.push(`<div class="rad-keys"><span class="rad-key"><i style="background:#d64933"></i>Stau</span><span class="rad-key"><i style="background:#e0a326;opacity:.75"></i>stockend</span></div><p class="muted">Stau jetzt${n('stau')}: Verkehrsfluss von HERE, alle paar Minuten neu.</p>`);
    $('#map-legend').innerHTML = parts.join('') || '<p class="muted">Schalte oben eine Ebene ein.</p>';
  }
  // Radwege der sichtbaren Kacheln, eine nach der anderen (der Dienst erlaubt nur zwei Anfragen gleichzeitig)
  let radRenderer = null, radDrawn = '', radRun = 0;
  // Radverkehrsnetz der Stadt: dünne gestrichelte Linie über den Radwegen, auch weit herausgezoomt
  let netzLayer = null;
  async function drawNetz() {
    if (!map) return;
    if (!netzLayer) { map.createPane('netz').style.zIndex = 450; netzLayer = L.layerGroup().addTo(map); }
    netzLayer.clearLayers();
    if (!mapLayers.rad) return;
    if (!stadt2) await loadStadt2();
    if (!stadt2 || !mapLayers.rad) return;
    const rend = L.canvas({ pane: 'netz', padding: 0.3 });
    for (const l of stadt2.netz) L.polyline(l[0], { renderer: rend, pane: 'netz', color: '#15191e', weight: 2, opacity: 0.75, dashArray: '5 5', interactive: false }).addTo(netzLayer);
  }
  async function drawRad() {
    if (!map || !mapLayers.rad) return;
    const g = groups.rad, b = map.getBounds();
    if (map.getZoom() < 14) { g.clearLayers(); radDrawn = ''; mapStatus('Für die Radwege näher heranzoomen. Gestrichelt: Radverkehrsnetz der Stadt.'); return; }
    const keys = [];
    for (let a = Math.floor(b.getSouth() / RAD_TILE); a <= Math.floor(b.getNorth() / RAD_TILE); a++)
      for (let o = Math.floor(b.getWest() / RAD_TILE); o <= Math.floor(b.getEast() / RAD_TILE); o++) keys.push(a + '_' + o);
    if (keys.length > 6) { mapStatus('Für die Radwege näher heranzoomen.'); return; }
    const sig = keys.join('|');
    if (sig === radDrawn) return;
    radDrawn = sig;
    const run = ++radRun;
    g.clearLayers();
    radRenderer = radRenderer || L.canvas({ padding: 0.3 });
    // Kachel in der Mitte zuerst, je zwei gleichzeitig
    const c0 = map.getCenter();
    const mid = (k) => { const [a, o] = k.split('_').map(Number); return Math.hypot((a + 0.5) * RAD_TILE - c0.lat, ((o + 0.5) * RAD_TILE - c0.lng) * 0.62); };
    keys.sort((x, y) => mid(x) - mid(y));
    let failed = 0, why = '', done = 0, next = 0;
    const need = keys.filter((k) => !(radTiles[k] && Date.now() - radTiles[k].t < 30 * 864e5)).length;
    if (need) mapStatus('Radwege werden geladen …');
    const drawTile = (t) => {
      for (const c of ['ruhig', 'mittel', 'schlecht', 'gut']) for (const w of t.ways) {   // Radwege obenauf
        if (w.c !== c) continue;
        L.polyline(w.g, { renderer: radRenderer, color: RAD_CLS[c].col, weight: c === 'ruhig' ? 3 : 5, opacity: 0.9 })
          .bindPopup(`<strong>${esc(w.n || 'Weg ohne Namen')}</strong><br>${esc(RAD_CLS[c].label)}${w.v ? `<br>Tempo ${w.v}` : ''}`).addTo(g);
      }
    };
    const worker = async () => {
      while (next < keys.length) {
        const k = keys[next++];
        try {
          const t = await radTile(k);
          if (run !== radRun || !mapLayers.rad) return;
          drawTile(t);
        } catch (e) { failed++; why = e.message; }
        done++;
        if (need && done < keys.length && run === radRun) mapStatus(`Radwege werden geladen … (${done} von ${keys.length})`);
      }
    };
    await Promise.all([worker(), worker()]);
    if (run !== radRun) return;
    if (failed) { radDrawn = ''; mapStatus(`Radwege ${failed === keys.length ? 'nicht' : 'nur teilweise'} geladen (${why}). Verschieb die Karte oder versuch es gleich noch einmal.`); }
    else mapStatus('');
  }
  // Barrierefrei: Orte von Bethel nach Profil gefärbt, dazu rollstuhlgerechte Toiletten und Aufzüge aus OpenStreetMap
  async function drawAcc() {
    const g = groups.acc;
    g.clearLayers();
    if (!bfData || Date.now() - bfAt > 2 * 60000) {
      if (!bfData) mapStatus('Barrierefreie Orte werden geladen …');
      try { await loadBf(); } catch (e) { if (!bfData) { mapStatus(/404|geladen/.test(e.message) ? 'Der Server lädt die Angaben gerade, bitte in ein paar Minuten noch einmal.' : 'Die Angaben zur Barrierefreiheit sind gerade nicht erreichbar.'); return; } }
      if (!mapLayers.acc) return;
      mapStatus('');
      g.clearLayers();
    }
    for (const w of bfData.wc || []) {
      if (w[2] !== 1) continue;
      L.circleMarker([w[0], w[1]], { radius: 6, color: '#ffffff', weight: 2, fillColor: '#1d5fa6', fillOpacity: 1 })
        .bindPopup(`<strong>Rollstuhlgerechte Toilette</strong>${w[3] ? '<br>' + esc(w[3]) : ''}${w[8] ? ', ' + esc(w[8]) : ''}${w[5] ? '<br>' + esc(w[5]) : ''}${w[6] ? (/^nein/i.test(w[6]) ? '<br>kostenlos' : /^ja/i.test(w[6]) ? '<br>kostenpflichtig' : '<br>' + esc(w[6])) : ''}${w[4] ? '<br>mit Euroschlüssel' : ''}${w[9] ? '<br>' + esc(w[9]) : ''}<br><span class="muted">${w[7] === 's' ? 'Stadt Bielefeld (Open Data)' : 'Laut OpenStreetMap'}</span>`).addTo(g);
    }
    if (!bpp) await loadBpp();
    for (const p of (bpp && bpp.plaetze) || []) {
      L.marker([p[0], p[1]], { icon: L.divIcon({ className: 'bpp-pin', html: '<span>P</span>', iconSize: [22, 22] }), title: 'Behindertenparkplatz' })
        .bindPopup(`<strong>Behindertenparkplatz</strong>${p[3] ? '<br>' + esc(p[3]) : ''}${p[2] ? `<br>${p[2]} ${p[2] === 1 ? 'Platz' : 'Plätze'}` : ''}<br><span class="muted">Nur mit Parkausweis · ${esc(bppSrc(p))}</span>`).addTo(g);
    }
    for (const a of bfData.lift || []) {
      // DB-Aufzüge mit Status (OpenStation): rot außer Betrieb, gelb eingeschränkt
      const db = a[5] === 'db', st = a[4] || '', bad = st === 'notAvailable', part = st === 'partiallyAvailable';
      const stTxt = { available: 'in Betrieb', notAvailable: 'außer Betrieb', partiallyAvailable: 'eingeschränkt' }[st] || 'ohne aktuellen Status';
      L.circleMarker([a[0], a[1]], { radius: db ? 6 : 4, color: bad ? '#d64933' : part ? '#e0a326' : '#1d5fa6', weight: 2, fillColor: bad ? '#d64933' : '#ffffff', fillOpacity: 1 })
        .bindPopup(db ? `<strong>Aufzug: ${esc(stTxt)}</strong><br>${esc(a[3] || '')}${a[6] ? `<br>Innenbreite ${fmtNum(a[6], 2)} m` : ''}<br><span class="muted">DB InfraGO (OpenStation), Status alle 5 Minuten</span>`
          : '<strong>Aufzug</strong><br><span class="muted">Laut OpenStreetMap, ohne Angabe, ob er gerade geht</span>').addTo(g);
    }
    await loadFaq();
    if (faq && mapLayers.acc) {
      const type = settings.access.on ? settings.access.type : null;
      for (const name of Object.keys(FAQ_PLACES)) {
        if (name === 'Altstadt' || name === 'Innenstadt') continue;
        const p = faqPlace(name);
        const list = faq.eintraege.filter((e) => e.orte.includes(name) && e.id !== 'AS-35' && (!type || e.gruppen.includes('Alle') || e.gruppen.some((g) => (FAQ_GROUPS[type] || []).includes(g))));
        if (!p || !list.length) continue;
        const geo = bfData && bfData.faqOrte && bfData.faqOrte[name] && bfData.faqOrte[name].g;
        if (geo) for (const l of geo) if (l.length > 1) L.polyline(l, { color: '#1d5fa6', weight: 4, opacity: 0.45, dashArray: '6 6', interactive: false }).addTo(g);
        L.marker([p[0], p[1]], { icon: L.divIcon({ className: 'faq-pin', html: '<span>i</span>', iconSize: [26, 26] }), keyboard: true, title: 'Gut zu wissen: ' + name })
          .bindPopup(`<strong>${esc(name)}</strong>${list.map((e) => `<details class="faq-mini"><summary>${esc(e.frage)}</summary>${faqHtml(e)}</details>`).join('')}<p class="small muted">Aus der Altstadt-FAQ von barrierefrAI</p>`, { maxWidth: 290, maxHeight: 300 }).addTo(g);
      }
    }
    try { await loadHinweise(); } catch (e) { /* ohne Hinweise weiter */ }
    for (const h of hinw || []) L.marker([h.lat, h.lon], { icon: hinwIcon(h.art, h.geprueft), title: HINW[h.art] || h.art }).bindPopup(() => hinwPopup(h), { maxWidth: 260 }).addTo(g);
    if (faq && mapLayers.acc) {
      const type = settings.access.on ? settings.access.type : null;
      const by = {};
      for (const e of faqPunkte()) {
        if (type && !e.gruppen.includes('Alle') && !e.gruppen.some((gr) => (FAQ_GROUPS[type] || []).includes(gr))) continue;
        (by[e.lat + ',' + e.lon] = by[e.lat + ',' + e.lon] || []).push(e);
      }
      for (const list of Object.values(by)) {
        L.marker([list[0].lat, list[0].lon], { icon: L.divIcon({ className: 'faq-pin punkt', html: '<span>i</span>', iconSize: [22, 22] }), title: 'Gut zu wissen: ' + list[0].frage })
          .bindPopup(`${list.map((e) => `<details class="faq-mini"${list.length === 1 ? ' open' : ''}><summary>${esc(e.frage)}</summary>${faqHtml(e)}</details>`).join('')}<p class="small muted">Redaktion barrierefrAI</p>`, { maxWidth: 290, maxHeight: 300 }).addTo(g);
      }
    }
    for (const o of bfData.orte || []) {
      L.circleMarker([o.lat, o.lon], { radius: 9, color: '#ffffff', weight: 2, fillColor: bfColor(bfScore(o)), fillOpacity: 1 }).bindPopup(() => bfPopup(o), { maxWidth: 280, maxHeight: 260, autoPanPaddingTopLeft: [10, 60] }).addTo(g);
    }
  }
  // Stadtbahn aus dem Fahrplan: je Linie die längste Haltefolge, Haltestellen mit den nächsten Abfahrten
  const TRAM_COL = ['#1d5fa6', '#17784f', '#d64933', '#7a3fa0', '#b8650a', '#0b7a8a'];
  const HST_COL = { ja: '#17784f', nein: '#c4382a', teilweise: '#e0a000' };
  async function drawTram() {
    const g = groups.tram;
    g.clearLayers();
    if (!hst || Date.now() - hst.geladen > 3600e3) await loadHst();
    if (!fp) {
      mapStatus('Stadtbahn wird geladen …');
      fpAt = 0;
      await loadFahrplan();
      if (!mapLayers.tram) return;
      if (!fp) { mapStatus(fpErr || 'Der Fahrplan ist gerade nicht erreichbar.'); return; }
      mapStatus('');
    }
    const best = {};
    for (const t of fp.trips) {
      const route = fp.routes[t[0]];
      if (route[1] !== 0) continue;
      const name = route[0];
      if (best[name] == null || fp.patterns[t[1]].length > fp.patterns[best[name]].length) best[name] = t[1];
    }
    const names = Object.keys(best).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    const stopsShown = {};
    names.forEach((name, i) => {
      const pts = fp.patterns[best[name]].map((si) => [fp.stops[si][2], fp.stops[si][3]]);
      L.polyline(pts, { color: TRAM_COL[i % TRAM_COL.length], weight: 5, opacity: 0.85 }).bindTooltip(`Linie ${esc(name)}`, { sticky: true }).addTo(g);
      for (const si of fp.patterns[best[name]]) {
        const n = fp.stops[si][1].replace(FP_PREFIX, '');
        if (!stopsShown[n]) stopsShown[n] = [fp.stops[si][2], fp.stops[si][3], fp.stops[si][4]];
        else if (fp.stops[si][4] && !stopsShown[n][2]) stopsShown[n][2] = fp.stops[si][4];
      }
    });
    if (!stadt2) await loadStadt2();
    for (const p of (stadt2 && stadt2.pr) || []) {
      const st = tramNear([p[0], p[1]], 600);
      L.marker([p[0], p[1]], { icon: L.divIcon({ className: 'pr-pin', html: '<span>P+R</span>', iconSize: [34, 20] }), title: 'Park + Ride ' + p[3] })
        .bindPopup(`<strong>Park + Ride ${esc(p[3])}</strong><br>${esc(p[4])}<br>${p[2]} Plätze${st ? `<br>${ic('tram')} ${esc(st.name)}${st.lines.length ? ': Linie ' + esc(st.lines.join(', ')) : ''}${st.m > 120 ? ` · ${fmtLen(st.m)} zu Fuß` : ''}` : ''}<br><span class="muted">Stadt Bielefeld (Open Data)</span>`).addTo(g);
    }
    for (const n of Object.keys(stopsShown)) {
      const e = hstOf(n), lift = liftNear({ lat: stopsShown[n][0], lon: stopsShown[n][1] }, [hstNorm(n)]);
      L.circleMarker(stopsShown[n].slice(0, 2), { radius: e ? 7 : 5, color: '#15191e', weight: 2, fillColor: e ? HST_COL[e.hbs] : '#ffffff', fillOpacity: 1 })
        .bindPopup(() => {
          const deps = departures(n, new Date(), 30).slice(0, 4);
          const w = stopsShown[n][2];
          const acc = e ? `<br>${e.hbs === 'ja' ? bfMark(1) + ' Hochbahnsteig, stufenlos' : e.hbs === 'nein' ? bfMark(0) + ' kein Hochbahnsteig' : '<b class="bf-offen">!</b> nur teilweise stufenlos'}${e.hinweis ? '<br><span class="small">' + esc(e.hinweis) + '</span>' : ''}${e.quelle ? '<br><span class="small muted">Quelle: ' + esc(e.quelle) + '</span>' : ''}`
            : w === 1 ? '<br>' + bfMark(1) + ' stufenlos zugänglich' : w === 2 ? '<br>' + bfMark(0) + ' nicht stufenlos' : '';
          return `<strong>${esc(n)}</strong>${acc}${lift ? '<br>' + bfMark(1) + ' Aufzug' : ''}${deps.length ? '<br>' + deps.map((d) => `${hhmm(d.t % 1440)} · ${esc(d.line)} → ${esc(d.head)}`).join('<br>') : '<br>In der nächsten halben Stunde keine Abfahrt.'}`;
        }).addTo(g);
    }
  }
  // Baustellen und Sperrungen (Meldungen) getrennt vom Verkehrsfluss (Stau jetzt)
  const isBau = (it) => !it.fluss && (it.art === 'baustelle' || it.art === 'sperrung');
  const isStau = (it) => it.fluss || it.art === 'stau' || it.art === 'zaeh' || it.art === 'unfall';
  let lageCounts = {};
  async function drawLage() {
    groups.lage.clearLayers(); groups.stau.clearLayers();
    if (!mapLayers.lage && !mapLayers.stau) return;
    if (!lageCache || Date.now() - lageAt > 300000) {
      mapStatus('Verkehrslage wird geladen …');
      const ok = await loadLage();
      if (!mapLayers.lage && !mapLayers.stau) return;
      if (!ok && !lageCache) { mapStatus('Die Verkehrslage ist gerade nicht erreichbar.'); return; }
      mapStatus('');
      groups.lage.clearLayers(); groups.stau.clearLayers();
    }
    const fmtBis = (b) => { const d = new Date(b); return isNaN(d) || d - Date.now() > 400 * 864e5 ? '' : ` bis ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}`; };
    lageCounts = { baustelle: 0, sperrung: 0, stau: 0 };
    for (const it of (lageCache && lageCache.items) || []) {
      if (!it || !Array.isArray(it.pts) || !it.pts.length) continue;
      const bau = isBau(it), stau = !bau && isStau(it);
      if (!(bau && mapLayers.lage) && !(stau && mapLayers.stau)) continue;
      const g = bau ? groups.lage : groups.stau;
      if (bau) lageCounts[it.art]++; else lageCounts.stau++;
      const red = LAGE_CLS[it.art] === 'red';
      const style = bau
        ? (it.art === 'sperrung' ? { color: '#b3261e', weight: 6, opacity: 0.95, dashArray: '10 7' } : { color: '#e0a326', weight: 7, opacity: 0.95 })
        : { color: red ? '#d64933' : '#e0a326', weight: red ? 5 : 4, opacity: 0.75 };
      const pop = `<strong>${esc(it.titel || LAGE_LABEL[it.art] || 'Meldung')}</strong><br>${esc(it.fluss && it.art !== 'sperrung' ? (it.art === 'stau' ? 'Stau' : 'stockender Verkehr') : LAGE_LABEL[it.art] || '')}${it.bis ? esc(fmtBis(it.bis)) : ''}${it.richtungText ? '<br>' + esc(it.richtungText) : ''}${it.text ? '<br>' + esc(it.text) : ''}${it.fuss ? '<br><b>Zu Fuß und mit dem Rad:</b> ' + esc(it.fuss) : ''}<br><span style="color:#5b636b">${esc(it.quelle || '')}</span>`;
      const lines = (it.segs || [it.pts]).filter((l) => l.length);
      for (const l of lines) {
        (l.length > 1 ? L.polyline(l, style) : L.circleMarker(l[0], { radius: 8, color: '#ffffff', weight: 2, fillColor: style.color, fillOpacity: 1 })).bindPopup(pop).addTo(g);
      }
    }
    renderMapLegend();
  }


  // Eigener Standort auf der Karte, nur solange die Karte offen ist
  let meMarker = null, meCircle = null, meWatch = null, meCenterNext = false, mapHasData = false;
  function startMyLocation() {
    if (!map || !('geolocation' in navigator) || meWatch != null) return;
    if (!mapHasData && !meMarker) meCenterNext = true;
    meWatch = navigator.geolocation.watchPosition((p) => {
      $('#map-loc-msg').textContent = '';
      const ll = [p.coords.latitude, p.coords.longitude];
      if (!meMarker) {
        meCircle = L.circle(ll, { radius: p.coords.accuracy, color: '#1d5fa6', weight: 1, fillColor: '#1d5fa6', fillOpacity: 0.12, interactive: false }).addTo(map);
        meMarker = L.circleMarker(ll, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#1d5fa6', fillOpacity: 1 }).bindTooltip('Du bist hier').addTo(map);
      } else {
        meMarker.setLatLng(ll); meCircle.setLatLng(ll); meCircle.setRadius(p.coords.accuracy);
      }
      if (meCenterNext) { map.setView(ll, 16); meCenterNext = false; }
    }, (err) => {
      stopMyLocation();
      $('#map-loc-msg').textContent = err.code === 1
        ? 'Dein Standort ist für diese Seite nicht freigegeben. In Safari: auf „aA“ in der Adressleiste tippen, dann Website-Einstellungen → Standort → Erlauben.'
        : 'Dein Standort konnte gerade nicht bestimmt werden.';
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }
  function stopMyLocation() {
    if (meWatch != null) { navigator.geolocation.clearWatch(meWatch); meWatch = null; }
  }
  $('#map-layers').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-layer]');
    if (!b) return;
    const k = b.dataset.layer;
    mapLayers[k] = !mapLayers[k];
    settings.mapLayers = mapLayers; store.set('settings', settings);
    if (k === 'rad') { radDrawn = ''; if (mapLayers.rad && map && map.getZoom() < 14) { map.setZoom(15); } }
    renderMap();
  });
  $('#btn-melden').addEventListener('click', startMelden);
  $('#btn-melden-ok').addEventListener('click', sendMelden);
  $('#btn-melden-no').addEventListener('click', () => $('#melden-dlg').close());
  $('#map-window').innerHTML = WINDOWS.map((w) => `<option value="${w.id}">${esc(w.label)}</option>`).join('');
  $('#map-window').addEventListener('change', (ev) => { mapWindow = ev.target.value; renderMap(); });
  $('#btn-locate').addEventListener('click', () => {
    if (meMarker) map.setView(meMarker.getLatLng(), 16);
    else { meCenterNext = true; startMyLocation(); }
  });

  // ---------- Testfahrt ----------
  function demoRun() {
    if (rec) return;
    const base = { lat: 52.0150, lon: 8.5500 };
    const mPerDegLon = 111320 * Math.cos(base.lat * toR);
    const at = (m) => ({ lat: base.lat, lon: base.lon + m / mPerDegLon });
    const demoSignals = [600, 1000, 1400, 1800].map((m, i) => Object.assign({ id: 'demo' + (i + 1), n: 1 }, at(m)));
    // Ablauf: Meter -> Halt in Sekunden (Rückstau an Ampel 3: zwei Halte)
    const plan = [{ at: 970, wait: 42 }, { at: 1340, wait: 18 }, { at: 1352, wait: 21 }];
    const pts = [];
    let m = 0, t = Date.now();
    const v = 13.9;
    while (m < 2400) {
      const stop = plan.find((s) => !s.done && m >= s.at);
      if (stop) {
        stop.done = true;
        for (let k = 0; k < stop.wait; k++) { t += 1000; pts.push({ m, t, v: 0 }); }
      }
      // vor einem geplanten Halt abbremsen
      const next = plan.find((s) => !s.done);
      const speed = next && next.at - m < 40 ? Math.max(2, (next.at - m) / 3) : v;
      m += speed; t += 1000;
      pts.push({ m, t, v: speed });
    }
    rec = newRecording('auto', demoSignals, true);
    enterDriveView();
    setDriveState('Testfahrt läuft …', '');
    let i = 0;
    rec.demoTimer = setInterval(() => {
      if (!rec) return;
      if (i >= pts.length) { clearInterval(rec.demoTimer); finishTrip(); return; }
      const q = pts[i++];
      const g = at(q.m);
      onPosition({ timestamp: q.t, coords: { latitude: g.lat, longitude: g.lon, accuracy: 6, speed: q.v } });
    }, 40);
  }

  // ---------- Export und Import ----------
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const file = typeof File === 'function' ? new File([blob], name, { type }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Flowtown Daten' }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  $('#btn-export').addEventListener('click', () => {
    download(`flowtown-${stamp()}.json`, JSON.stringify({ app: 'flowtown', version: VERSION, exported: new Date().toISOString(), names, trips }, null, 1), 'application/json');
  });
  $('#btn-export-csv').addEventListener('click', () => {
    const head = ['fahrt', 'verkehrsmittel', 'demo', 'typ', 'ampel', 'name', 'lat', 'lon', 'zeit', 'wartezeit_s', 'halte', 'richtung_grad', 'bewertung', 'stichworte'];
    const lines = [head.join(';')];
    for (const tr of trips) for (const e of tr.events) {
      lines.push([tr.id, tr.mode, tr.demo ? 1 : 0, e.type === 'pass' ? 'durchfahrt' : 'halt', e.signal || '', labelFor(e).replace(/;/g, ','), e.lat, e.lon, new Date(e.t).toISOString(),
        e.type === 'halt' ? Math.round(e.wait / 1000) : 0, e.halts || 0, (e.heading == null ? '' : e.heading), (e.rating == null ? '' : e.rating), (e.tags || []).join('|')].join(';'));
    }
    download(`flowtown-halte-${stamp()}.csv`, lines.join('\n'), 'text/csv');
  });
  $('#inp-import').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.trips)) throw new Error('kein Flowtown-Export');
      const known = new Set(trips.map((t) => t.id));
      const add = data.trips.filter((t) => t && t.id && Array.isArray(t.events) && !known.has(t.id));
      trips = trips.concat(add); saveTrips();
      if (data.names) { names = Object.assign({}, data.names, names); store.set('names', names); }
      moreMsg(`${add.length} Fahrt${add.length === 1 ? '' : 'en'} importiert.`);
    } catch (e) {
      moreMsg('Die Datei konnte nicht gelesen werden. Bitte wähle einen Export aus dieser App.');
    }
    ev.target.value = '';
  });
  function moreMsg(t) { $('#more-msg').textContent = t; if (!$('#view-more').hidden) { renderMoreSubs(); updateSignalsInfo(); } }

  // ---------- Navigation ----------
  // Frag Flowtown oben auf den Hauptseiten, mit einem kurzen Beispiel, das zur Seite passt
  const ASK_EX = { plan: 'Rollstuhl-WC?', tips: 'Park + Ride?', stats: 'Baustellen?' };
  const ASK_EX_MINE = { tips: 'Mein Zeitfresser?', stats: 'Wo warte ich lange?' };   // mit eingeschalteter Auswertung
  // KI-Karte je Seite. Die Vorschläge fragen erst offen („Wohin möchtest du?“) und werden dann mit der Antwort konkret:
  // Weg prüfen, Verkehrsmittel vergleichen und sagen, was am Ziel zählt. Einträge: { l: Knopf, i: Gespräch } oder
  // { l: Knopf, q: gleich gestellte Frage }; n = Bedingung (Server-Werkzeug oder „mine“ = freigegebene Auswertung).
  const accName = () => (settings.access.on ? ACCESS_LABEL[settings.access.type] : '');
  const accWith = () => ({ rollstuhl: 'mit Rollstuhl', rollator: 'mit Rollator oder Gehhilfe', sehen: 'und siehst schlecht', hoeren: 'und hörst schlecht', lernen: '', ruhe: 'und brauchst Ruhe' }[settings.access.on ? settings.access.type : ''] || '');
  const ASK_HERO = {
    start: { title: 'KI, die mit dir spricht', sub: () => (settings.access.on && accWith() ? `Du bist heute wieder unterwegs, ${accWith()}? Sag mir, wohin. Ich prüfe den Weg und was dich dort erwartet.` : 'Ich helfe dir gerne, deinen besten Weg zu finden. Sag mir einfach, wohin du willst.') },
    tips: { title: 'KI-Tipps für deine Wege', sub: () => 'Frag, was sich lohnt und die Umwelt schont: Rad, Bus und Bahn oder Auto, die beste Abfahrt und was dich am Ziel erwartet.' },
    stats: { title: 'KI-Analyse deiner Fahrten', sub: () => 'Frag, womit du am schnellsten warst, wo du Zeit verlierst und was dir unterwegs aufgefallen ist.' }
  };
  // Gespräche: Eröffnung und die Frage, in die die Antwort ({x}) eingesetzt wird
  function intentDef(k) {
    const P = accName();
    const D = {
      weg: { open: settings.access.on && accWith() ? `Du bist heute wieder unterwegs, ${accWith()}. Wohin möchtest du? Ich suche den besten Weg, prüfe ihn und sage dir, was dich dort erwartet.` : 'Ich helfe dir gerne, deinen besten Weg zu finden. Wohin möchtest du?',
        tpl: 'Wie komme ich jetzt am besten zu {x}? Vergleiche die Möglichkeiten, prüfe den Weg und sag mir, was mich am Ziel erwartet.' },
      vergleich: { open: 'Ich vergleiche für dich Auto, Bus und Bahn, Rad und zu Fuß, auch beim CO₂. Wohin soll es gehen?', tpl: 'Was lohnt sich für den Weg zu {x}: Rad, Bus und Bahn, Auto oder zu Fuß? Nenn mir die Optionen und was davon CO₂ spart.' },
      oeko: { open: 'Wohin fährst du oft? Ich zeige dir, wie du dorthin CO₂ und Sprit sparst, ohne viel Zeit zu verlieren.', tpl: 'Wie komme ich umweltfreundlich zu {x}, und wie viel CO₂ spare ich gegenüber dem Auto?' },
      ort: { open: 'Sag mir, für welchen Ort du Infos willst. Ein Name, ein Gebäude oder eine Adresse genügt.', tpl: 'Was muss ich über {x} wissen? Zugang, Toilette, Parken und die nächste Haltestelle.' },
      stufenlos: { open: `Wohin möchtest du? Ich prüfe den Weg auf Stufen und Hindernisse und sage dir, was dich am Ziel erwartet.`, tpl: `Ich bin unterwegs ${accWith() || 'mit Rollstuhl'}. Wie komme ich stufenlos zu {x}? Prüfe den Weg und sag mir, was mich dort erwartet: Zugang, rollstuhlgerechtes WC, Behindertenparkplatz, Haltestelle mit Hochbahnsteig.` },
      wc: { open: 'Wo willst du hin? Ich suche das rollstuhlgerechte WC dort, wo du hinwillst, nicht hier.', tpl: 'Wo ist ein rollstuhlgerechtes WC bei {x}, und wie komme ich stufenlos hin?' },
      sicher: { open: 'Wohin möchtest du? Ich prüfe den Weg auf Ampeln mit Tonsignal, Stufen und Gleise und sage dir, was dich am Ziel erwartet.', tpl: 'Ich sehe schlecht. Prüfe den Weg zu {x}: Ampeln mit Tonsignal, Stufen und Gleise. Was erwartet mich am Ziel?' },
      hoeren: { open: 'Wohin möchtest du? Ich sage dir, ob Bus und Bahn normal fahren, und was dich am Ziel erwartet.', tpl: 'Wie komme ich zu {x}? Gibt es Störungen bei Bus und Bahn auf dem Weg, und was gibt es am Ziel für hörbehinderte Menschen?' },
      einfach: { open: 'Wohin willst du? Sag es mir einfach.', tpl: 'Wie komme ich zu {x}? Bitte in einfacher Sprache. Sag mir auch, was mich dort erwartet.' },
      ruhig: { open: 'Wohin möchtest du? Ich suche einen entspannten Weg und eine ruhige Zeit.', tpl: 'Wie komme ich möglichst entspannt zu {x}? Wann ist es dort ruhig, und gibt es eine Toilette am Ziel?' },
      abfahrt: { open: 'Wohin fährst du? Ich sage dir, wann du am besten losfährst.', tpl: 'Wann fahre ich am besten zu {x} los, und womit?' }
    };
    return D[k] || D.weg;
  }
  const Q_LAST = { l: 'Wie war meine letzte Fahrt?', q: 'Wie lange stand ich bei der letzten Fahrt?' };
  const Q_STOER = { l: 'Fahren Bus und Bahn normal?', q: 'Gibt es gerade Störungen oder Umleitungen bei Bus und Bahn?', n: 'oepnv_stoerungen' };
  const Q_ORT = { l: 'Infos zu einem Ort', i: 'ort' };
  const Q_MINE = { l: 'Was fällt dir an meinen Fahrten auf?', q: 'Was fällt dir an meinen Fahrten auf? Womit war ich am schnellsten, und wo verliere ich Zeit?', n: 'mine' };
  const ASK_Q = {
    '': {
      start: [{ l: 'Finde meinen besten Weg', i: 'weg' }, { l: 'Rad, Bus oder Auto: was lohnt sich?', i: 'vergleich', n: 'vergleich' }, Q_ORT, Q_STOER],
      tips: [{ l: 'Wie spare ich CO₂ und Sprit?', i: 'oeko', n: 'vergleich' }, { l: 'Rad, Bus oder Auto: was lohnt sich?', i: 'vergleich', n: 'vergleich' }, { l: 'Wann fahre ich am besten los?', i: 'abfahrt' }, { l: 'Was kann ich besser machen?', q: 'Was kann ich auf meinen Wegen besser machen?', n: 'mine' }, { l: 'Park + Ride?', q: 'Wo gibt es Park + Ride in meiner Nähe?' }],
      stats: [Q_LAST, Q_MINE, { l: 'Womit war ich am schnellsten?', q: 'Mit welchem Verkehrsmittel war ich auf meinen Wegen am schnellsten?', n: 'mine' }, { l: 'Finde meinen besten Weg', i: 'weg' }]
    },
    rollstuhl: {
      start: [{ l: 'Stufenlos ans Ziel', i: 'stufenlos', n: 'weg_check' }, { l: 'Rollstuhl-WC am Ziel', i: 'wc', n: 'ort_info' }, Q_ORT, { l: 'Aufzug gestört?', q: 'Sind gerade Aufzüge an Haltestellen gestört?', n: 'oepnv_stoerungen' }, { l: 'Finde meinen besten Weg', i: 'weg' }],
      tips: [{ l: 'Was lohnt sich mit Rollstuhl?', i: 'vergleich', n: 'vergleich' }, { l: 'Rollstuhl-WC am Ziel', i: 'wc', n: 'ort_info' }, Q_ORT, { l: 'Stufenlose Haltestelle hier?', q: 'Welche Haltestelle in meiner Nähe hat einen Hochbahnsteig?' }],
      stats: [Q_LAST, { l: 'Wo war es zu kurz grün?', q: 'An welchen Ampeln war die Grünphase für mich zu kurz?', n: 'mine' }, Q_MINE, { l: 'Stufenlos ans Ziel', i: 'stufenlos', n: 'weg_check' }]
    },
    rollator: {
      start: [{ l: 'Ebener Weg ans Ziel', i: 'stufenlos', n: 'weg_check' }, Q_ORT, { l: 'Aufzug gestört?', q: 'Sind gerade Aufzüge an Haltestellen gestört?', n: 'oepnv_stoerungen' }, { l: 'Finde meinen besten Weg', i: 'weg' }],
      tips: [{ l: 'Was lohnt sich mit Rollator?', i: 'vergleich', n: 'vergleich' }, { l: 'Toilette am Ziel', i: 'wc', n: 'ort_info' }, Q_ORT, { l: 'Stufenlose Haltestelle hier?', q: 'Welche Haltestelle in meiner Nähe hat einen Hochbahnsteig?' }],
      stats: [Q_LAST, { l: 'Wo war es zu kurz grün?', q: 'An welchen Ampeln war die Grünphase für mich zu kurz?', n: 'mine' }, Q_MINE, { l: 'Ebener Weg ans Ziel', i: 'stufenlos', n: 'weg_check' }]
    },
    sehen: {
      start: [{ l: 'Wo bin ich?', q: 'Wo bin ich?' }, { l: 'Weg prüfen lassen', i: 'sicher', n: 'weg_check' }, Q_ORT, { l: 'Ampeln mit Ton hier?', q: 'Welche Ampeln in meiner Nähe haben ein Tonsignal?', n: 'ampeln_mit_ton' }, { l: 'Finde meinen besten Weg', i: 'weg' }],
      tips: [{ l: 'Tipps vorlesen', q: 'Lies mir die Tipps vor' }, { l: 'Was lohnt sich für mich?', i: 'vergleich', n: 'vergleich' }, Q_ORT],
      stats: [Q_LAST, { l: 'Wo fehlte ein Tonsignal?', q: 'An welchen Ampeln fehlte mir ein Tonsignal?', n: 'mine' }, Q_MINE]
    },
    hoeren: {
      start: [{ l: 'Finde meinen besten Weg', i: 'hoeren' }, Q_STOER, Q_ORT],
      tips: [{ l: 'Rad, Bus oder Auto: was lohnt sich?', i: 'vergleich', n: 'vergleich' }, Q_STOER, Q_ORT],
      stats: [Q_LAST, Q_MINE, Q_STOER]
    },
    lernen: {
      start: [{ l: 'Wo bin ich?', q: 'Wo bin ich?' }, { l: 'Wie komme ich hin?', i: 'einfach' }, { l: 'Fährt mein Bus normal?', q: 'Gibt es Störungen bei Bus und Bahn? Bitte in einfacher Sprache.', n: 'oepnv_stoerungen' }],
      tips: [{ l: 'Tipps vorlesen', q: 'Lies mir die Tipps vor' }, { l: 'Wie komme ich hin?', i: 'einfach' }, Q_ORT],
      stats: [Q_LAST, { l: 'Womit war ich am schnellsten?', q: 'Womit war ich am schnellsten? Bitte in einfacher Sprache.', n: 'mine' }]
    },
    ruhe: {
      start: [{ l: 'Entspannt ans Ziel', i: 'ruhig' }, Q_ORT, Q_STOER],
      tips: [{ l: 'Wann ist wenig los?', i: 'abfahrt' }, { l: 'Was lohnt sich für mich?', i: 'vergleich', n: 'vergleich' }, Q_ORT],
      stats: [Q_LAST, Q_MINE]
    }
  };
  // Werkzeuge, die der Server kann (aus /api/health); bis zum Server-Update nur die bisherigen Fragen
  let serverTools = store.get('tools', []);
  async function loadServerTools() {
    if (!apiBase()) return;
    try {
      const h = await api('/api/health');
      serverTools = Array.isArray(h.werkzeuge) ? h.werkzeuge : [];
      store.set('tools', serverTools);
      askBar(document.body.dataset.view);
      if (document.body.dataset.view === 'start') renderPlanTeaser();
    } catch (e) { /* ohne Server: bisherige Fragen */ }
  }
  function askExamples(name) {
    const acc = settings.access.on && ASK_Q[settings.access.type] ? settings.access.type : '';
    const ok = (n) => !n || (n === 'mine' ? !!settings.assistStats : serverTools.includes(n));
    const all = ASK_Q[acc][name] || [];
    const ex = all.filter((x) => ok(x.n)).slice(0, 3);
    if (ex.length < 2) ex.push(acc === 'lernen' ? { l: 'Wie komme ich hin?', i: 'einfach' } : acc === 'sehen' ? { l: 'Finde meinen besten Weg', i: serverTools.includes('weg_check') ? 'sicher' : 'weg' } : { l: 'Finde meinen besten Weg', i: 'weg' });
    return { acc, ex, needsMine: all.some((x) => x.n === 'mine') && !settings.assistStats };
  }
  // Gespräch beginnen: Flowtown fragt offen nach dem Ziel; die Antwort wird in die passende Frage eingesetzt
  let pendingIntent = null;
  function startIntent(k) {
    const d = intentDef(k);
    pendingIntent = k;
    assistAct = null;
    showAssist('', d.open);
    const z = settings.ziele.slice(0, 3);
    const form = $('#assist .assist-form');
    if (z.length && form) form.insertAdjacentHTML('beforebegin', `<div class="vf-chips assist-pick" role="group" aria-label="Oder eines deiner Ziele">${z.map((x) => `<button type="button" class="vf-chip" data-intentans="${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div>`);
    const inp = $('#assist-inp');
    // nur mit Maus oder Tastatur gleich ins Feld; auf dem Handy öffnete das die Tastatur über der App, auch beim Sprechen
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (inp) { inp.placeholder = k === 'ort' ? 'Ort, Gebäude oder Adresse …' : 'Ziel: Ort, Adresse oder Einrichtung …'; if (!touch && !voiceOn()) inp.focus({ preventScroll: true }); }
    if (voiceOn()) speak(d.open, { now: true, force: true, onend: () => { if (!$('#assist').hidden && pendingIntent) listenAfter('Ich höre zu …'); } });
  }
  // Fester Mikrofonknopf auf allen Seiten: öffnet Frag Flowtown mit Beispielfragen und hört zu, wenn Sprachbefehle erlaubt sind
  function openAssistEmpty(opts) {
    unlockSpeech(); pendingIntent = null; assistAct = null;
    assistBig = !!(opts && opts.big) || !!settings.sprechGross;
    showAssist('', assistBig && SR ? 'Hallo! Wobei kann ich helfen?' : 'Frag mich nach Wegen, Abfahrten, Aufzügen oder Toiletten. Ist etwas gestört, nenne ich dir eine Alternative.');
    const ex = askExamples('start').ex, form = $('#assist .assist-form');
    if (form && ex.length) form.insertAdjacentHTML('beforebegin', `<div class="vf-chips assist-pick" role="group" aria-label="Beispielfragen">${ex.map((x) => `<button type="button" class="vf-chip" ${x.i ? `data-askintent="${x.i}"` : `data-askex="${esc(x.q)}"`}>${esc(x.l)}</button>`).join('')}</div>`);
    if (assistBig) assistLoopStart(true);
    if (SR && settings.voiceIn && !(opts && opts.launch)) listen();
  }
  function askBar(name) {
    const on = !!(ASK_EX[name] && apiBase());
    const hero = ASK_HERO[name];
    $('#ask-wrap').hidden = !on;
    if (on) {
      const slot = $('#ask-slot-' + name), w = $('#ask-wrap'), card = $('#ask-hero');
      if (hero) {
        if (card.parentNode !== slot) slot.appendChild(card);
        if (w.parentNode !== $('#ask-hero-field')) $('#ask-hero-field').appendChild(w);
        const { acc, ex, needsMine } = askExamples(name);
        card.classList.toggle('acc', !!acc);
        $('#ask-hero-prof').hidden = !acc;
        $('#ask-hero-prof span').textContent = acc ? 'Für dich: ' + ACCESS_LABEL[acc] : '';
        $('#ask-hero-title').textContent = hero.title;
        $('#ask-hero-sub').textContent = hero.sub();
        $('#ask-ex').innerHTML = ex.map((x) => `<button type="button" class="ask-ex-chip${x.i ? ' open' : ''}" ${x.i ? `data-askintent="${x.i}"` : `data-askex="${esc(x.q)}"`}>${esc(x.l)}</button>`).join('');
        $('#ask-allow').hidden = !needsMine || name === 'start';
      } else if (slot && w.parentNode !== slot) slot.appendChild(w);
      $('#ask-inp').placeholder = name === 'stats' ? 'Frag Flowtown zu deinen Fahrten …' : name === 'start' ? 'Frag Flowtown: Wohin möchtest du?' : 'Frag Flowtown …';
    }
    $('#ask-mic').hidden = !SR;
    $('#ask-hero').hidden = !(on && hero);
    // ein Mikrofon genügt: steht das Feld da, sitzt es im Feld statt oben in der Leiste
    const hm = $('#btn-mic'); if (hm) hm.hidden = true;
    const fm = $('#fab-mic'); if (fm) fm.hidden = !apiBase();
  }
  function showView(name) {
    if (name !== 'map') stopMyLocation();
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
    document.body.dataset.view = name;   // Farbe und Ruhe je Ansicht (Aufzeichnung ohne Menü)
    // Frag Flowtown oben auf den Hauptseiten, mit einem Beispiel, das zur Seite passt
    askBar(name);
    const tabFor = { drive: 'start', review: 'stats', plan: 'start', best: 'start' };
    // Womit? und das Profil gehören zu beiden Seiten: Heute (Losfahren) und Planen
    if (name === 'start' || name === 'plan') { const slot = $('#mode-slot-' + name), box = $('#mode-box'); if (box.parentNode !== slot) slot.appendChild(box); }
    $$('.tabs button').forEach((b) => {
      const active = b.dataset.view === (tabFor[name] || name);
      if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (name === 'stats') renderStats();
    if (name === 'tips') renderTips();
    if (name === 'map') { mapFitted = false; renderMap(); }
    if (name === 'start') { planFromBest = false; renderToday(); renderLastTrip(); }
    if (name === 'best') renderBest();
    if (name === 'plan') { $('#plan-off').hidden = !!apiBase(); renderToday(); }
    if (name === 'more') { updateSignalsInfo(); renderPilotCard(); renderMoreSubs(); }
    if (name === 'start') renderA2hs();
    const h = $('#view-' + name + ' h2');
    // Seitentitel nennt die Ansicht, damit Screenreader und App-Umschalter wissen, wo man ist
    const titles = { welcome: 'Willkommen', start: 'Heute', plan: 'Wohin?', best: 'Weg zum Ziel', drive: 'Aufzeichnung läuft', review: 'Fahrtbilanz', tips: 'Tipps', stats: 'Verlauf', map: 'Karte', more: 'Einstellungen' };
    document.title = (titles[name] ? titles[name] + ' – ' : '') + 'Flowtown';
    if (h && name !== 'drive') { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  $('#map-list').addEventListener('click', (ev) => {
    const r = ev.target.closest('[data-mapsig]');
    if (!r) return;
    const m = mapListMarkers[r.dataset.mapsig];
    if (!m || !map) { mapStatus('Die Karte ist gerade nicht verfügbar. Die Angaben stehen hier in der Liste.'); return; }
    if (!mapLayers.signals) return;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 16));
    m.openPopup();
    $('#map').scrollIntoView({ block: 'center' });
  });

  // ---------- Heute: Verkehrsmittel, eigene Wege, beste Abfahrtszeit ----------
  const heuteOn = () => !$('#view-start').hidden || !$('#view-plan').hidden;
  // Heute, Karte „Wohin?“: die eigenen Ziele zum direkten Antippen, Planen öffnet eine eigene Seite
  // Heute: „Womit heute am besten?“ für ein gespeichertes Ziel. Nur auf Knopfdruck, wie die Ziel-Prüfung:
  // Ziel und Standort (auf etwa 100 m) gehen an den Server, der Auto, Bus und Bahn, Rad und Fuß vergleicht, mit Profil.
  const bestRes = {};
  let bestZiel = null;
  const BEST_NAME = { auto: 'Auto', oepnv: 'Bus & Bahn', rad: 'Rad', fuss: 'Zu Fuß' };
  const BEST_MODE = { auto: 'auto', oepnv: 'bahn', rad: 'rad', fuss: 'fuss' };
  // Je Verkehrsmittel: Name und Zeit groß, höchstens ein Hinweis; Einzelheiten stehen beim Antippen und für Screenreader im Namen
  function bestInfo(o) {
    const all = [];
    if (o.verkehrsmittel === 'auto') { all.push(`${minText(o.dauer_min)}${o.verzoegerung_min >= 3 ? `, ${minText(o.verzoegerung_min)} Stau` : ''} mit Parken`); if (o.ausweichroute) all.push(`Ausweichroute ${minText(o.ausweichroute.dauer_min)}`); if (o.behindertenparkplatz) all.push('Behindertenparkplatz ' + o.behindertenparkplatz); }
    if (o.verkehrsmittel === 'oepnv') { all.push(`ab ${o.ab}${o.linien && o.linien[0] ? ', Linie ' + o.linien[0] : ''}${o.umstiege ? `, ${o.umstiege}× umsteigen` : ''}`); if (o.stufenlos) all.push('stufenlos: ' + o.stufenlos); }
    if (o.verkehrsmittel === 'rad' || o.verkehrsmittel === 'fuss') all.push(`${minText(o.dauer_min)}, ${fmtNum(o.km, 1)} km`);
    if (o.hindernisse && o.hindernisse.length) all.push(o.hindernisse.slice(0, 2).join(', '));
    if (o.gemeldet && o.gemeldet.length) all.push('gemeldet: ' + o.gemeldet.map((x) => x.art).slice(0, 2).join(', '));
    if (o.meldungen && o.meldungen.length) all.push(o.meldungen[0]);
    if (o.co2) all.push(o.co2_g ? `CO₂ ${o.co2}` : 'ohne CO₂');
    const flag = !o.geeignet ? (settings.access.on ? 'nicht für dein Profil' : 'eher nicht')
      : o.verkehrsmittel === 'auto' && o.ausweichroute ? `Ausweichroute ${minText(o.ausweichroute.dauer_min)}`
      : (o.hindernisse && o.hindernisse[0]) || (o.gemeldet && o.gemeldet.length ? 'gemeldet: ' + o.gemeldet[0].art : '') || (o.meldungen && o.meldungen[0]) || '';
    const time = o.dauer_min ? minText(o.dauer_min) : `an ${o.ankunft}`;
    if (!o.geeignet) all.unshift(flag);
    return { all, flag, time, label: `${BEST_NAME[o.verkehrsmittel]}, an ${o.ankunft}. ${all.join(', ')}` };
  }
  function bestRow(o, rec) {
    const b = bestInfo(o);
    return `<button type="button" class="best-row${o.geeignet ? '' : ' no'}" data-best-mode="${o.verkehrsmittel}" aria-label="${esc(b.label)}">${ic(MODE_ICON[o.verkehrsmittel])}<span class="best-main"><b>${BEST_NAME[o.verkehrsmittel]}</b>${b.flag ? `<span class="best-flag${o.geeignet ? '' : ' no'}">${esc(b.flag)}</span>` : ''}</span><span class="best-time">${esc(b.time)}</span></button>`;
  }
  function bestHtml() {
    if (!apiBase() || !serverTools.includes('vergleich')) return '';
    const z = settings.ziele.find((x) => x.id === bestZiel);
    const r = z && bestRes[z.id];
    if (!r) return '';
    let body;
    if (r.loading) body = '<p class="small muted">Flowtown vergleicht Auto, Bus und Bahn, Rad und zu Fuß …</p>';
    else if (r.error) body = `<p class="small">${esc(r.error)}</p><button type="button" class="btn quiet" data-best="go">Noch einmal versuchen</button>`;
    else {
      const d = r.data, e = d.empfehlung;
      const rec = d.optionen.find((o) => o.verkehrsmittel === e.verkehrsmittel) || d.optionen[0];
      const rest = d.optionen.filter((o) => o !== rec).sort((a, b) => (a.geeignet === b.geeignet ? 0 : a.geeignet ? -1 : 1) || String(a.ankunft).localeCompare(String(b.ankunft)));
      const am = d.am_ziel ? amZielText(d.am_ziel).split(' · ').slice(0, 2) : [];
      const gr = String(e.grund || '').split(';').map((x) => x.trim()).filter(Boolean), grund = (gr[0] || '').replace(/,?\s*Ankunft gegen \d\d:\d\d/, '');
      const rb = bestInfo(rec);
      body = `<button type="button" class="best-hero" data-best-mode="${rec.verkehrsmittel}" aria-label="${esc('Empfehlung: ' + rb.label)}"><span class="bh-ic">${ic(MODE_ICON[rec.verkehrsmittel])}</span><span class="bh-main"><span class="bh-kick">Am besten</span><b>${esc(cap(GROUP_WITH[rec.verkehrsmittel]))}</b><span class="bh-time">${esc(rb.time)} · an ${esc(rec.ankunft)}</span>${grund ? `<span class="bh-why">${esc(cap(grund))}</span>` : ''}</span>${ic('chevron', 'bh-go')}</button>`
        + `<h3 class="best-h">Andere Möglichkeiten</h3><div class="best-list">${rest.map((o) => bestRow(o, false)).join('')}</div>`
        + (am.length ? `<div class="best-am">${am.map((x) => `<p>${ic('pin')}<span>${esc(x)}</span></p>`).join('')}</div>` : '')
        + `<p class="best-foot">Stand ${esc(d.jetzt)} Uhr · <button type="button" class="btn-link" data-best="go">Neu vergleichen</button></p>`;
    }
    return `<div class="best"><div id="best-body" aria-live="polite">${body}</div></div>`;
  }
  // nur wer allein „Schneller ankommen“ gewählt hat, bekommt das Schnellste; sonst das Umweltfreundlichste, wenn es kaum langsamer ist
  const vorrangSchnell = () => goals().includes('schnell') && !goals().includes('stadt') && !goals().includes('rad');
  // was am Ziel zählt, nach Profil, in einem Satz
  function amZielText(a) {
    const t = settings.access.on ? settings.access.type : '', out = [];
    const m = (x) => (x && typeof x === 'object' ? `${x.entfernung_m} m` : null);
    if (['rollstuhl', 'rollator'].includes(t)) {
      if (m(a.rollstuhl_wc)) out.push(`rollstuhlgerechtes WC ${m(a.rollstuhl_wc)}`);
      if (m(a.behindertenparkplatz)) out.push(`Behindertenparkplatz ${m(a.behindertenparkplatz)}`);
      if (a.stadtbahn && typeof a.stadtbahn === 'object') out.push(`Stadtbahn ${a.stadtbahn.name} ${m(a.stadtbahn)}${a.stadtbahn.hochbahnsteig === 'ja' ? ', mit Hochbahnsteig' : a.stadtbahn.hochbahnsteig === 'nein' ? ', ohne Hochbahnsteig' : ''}`);
    } else {
      if (m(a.toilette)) out.push(`Toilette ${m(a.toilette)}`);
      if (a.stadtbahn && typeof a.stadtbahn === 'object') out.push(`Stadtbahn ${a.stadtbahn.name} ${m(a.stadtbahn)}`);
      if (m(a.behindertenparkplatz) && t) out.push(`Behindertenparkplatz ${m(a.behindertenparkplatz)}`);
    }
    if (a.gemeldet && a.gemeldet.length) out.push('gemeldet: ' + a.gemeldet.map((x) => x.art).join(', '));
    return out.join(' · ');
  }
  async function runBest() {
    const z = settings.ziele.find((x) => x.id === bestZiel);
    if (!z) return;
    bestRes[z.id] = { loading: true };
    renderPlanTeaser();
    try {
      const pos = await myStart();
      if (!pos) throw new Error('Ohne deinen Standort kann Flowtown nicht vergleichen. Bitte den Standortzugriff erlauben.');
      const q = new URLSearchParams({ from: pos.map((x) => x.toFixed(3)).join(','), to: `${Number(z.lat).toFixed(4)},${Number(z.lon).toFixed(4)}`, profil: settings.access.on ? settings.access.type : '', name: z.name, vorrang: vorrangSchnell() ? 'schnell' : '' });
      const d = await api('/api/vergleich?' + q);
      bestRes[z.id] = { t: Date.now(), data: d };
      if (voiceOn()) speak(`Zum Ziel ${z.name} am besten ${GROUP_WITH[d.empfehlung.verkehrsmittel]}. ${d.empfehlung.grund.split(';')[0]}.`, { now: true });
    } catch (e) { bestRes[z.id] = { error: e.message === 'Failed to fetch' ? 'Keine Verbindung zum Flowtown-Server.' : e.message }; }
    renderPlanTeaser();
  }
  // Heute: Suchfeld „Wohin?“, darunter die Treffer, dann der Vergleich „Womit am besten?“ für das gewählte Ziel
  let planList = null, planMsg = '', planFromBest = false;
  function renderPlanTeaser() {
    const el = $('#plan-teaser');
    $('#plan-form').hidden = !apiBase();
    $('#plan-mic').hidden = !SR;
    $('#btn-plan').hidden = !!apiBase() && !settings.ziele.length;   // mit Server und ohne gespeicherte Ziele genügt das Feld
    if (planMsg || planList) {
      el.innerHTML = (planMsg ? `<p class="small muted" role="status">${esc(planMsg)}</p>` : '')
        + (planList ? (planList.length ? `<ul class="vf-orte">${planList.map((o, i) => `<li><button type="button" class="vf-ort" data-plan-ort="${i}"><b>${esc(o.name)}</b>${o.sub ? `<span class="small muted">${esc(o.sub)}</span>` : ''}</button></li>`).join('')}</ul>` : '<p class="small muted">Nichts gefunden. Versuch es mit Ort und Straße.</p>') : '');
    } else el.innerHTML = zielChips();
    renderBest();
    $('#btn-plan span').textContent = settings.ziele.length ? 'Deine Ziele und Wege' : 'Weg planen';
  }
  // Heute: gespeicherte Ziele als Chips unter dem Suchfeld, ein Tipp vergleicht gleich
  function zielChips() {
    if (!apiBase() || !settings.ziele.length) return '';
    const z = settings.ziele.slice().sort((a, b) => (b.u || 0) - (a.u || 0)).slice(0, 2);
    return `<div class="vf-chips" role="group" aria-label="Deine Ziele">${z.map((x) => `<button type="button" class="vf-chip" data-plan-go="${x.id}">${esc(x.name)}</button>`).join('')}</div>`;
  }
  function planGoZiel(z) {
    if (serverTools.includes('vergleich')) { bestZiel = z.id; unlockSpeech(); showView('best'); runBest(); } else openPlan(z.id);
  }
  // eigene Seite „Weg zum Ziel“: groß die Empfehlung, darunter die anderen Verkehrsmittel
  function renderBest() {
    const v = $('#view-best'); if (!v || v.hidden) return;
    const z = settings.ziele.find((x) => x.id === bestZiel);
    $('#h-best').textContent = z ? z.name : 'Ziel';
    $('#best-wrap').innerHTML = bestHtml();
  }
  async function planSearch(q) {
    planMsg = 'Suche …'; planList = null; renderPlanTeaser();
    await loadBf().catch(() => null);
    const near = await ortNear(), local = /bielefeld/i.test(q) || !near ? bfSearch(q) : [];
    try { planList = local.concat(((await api('/api/ort?q=' + encodeURIComponent(q) + near)).orte || []).filter((o) => !local.some((l) => dist(l, o) < 80))); planMsg = ''; }
    catch (e) { planList = local.length ? local : null; planMsg = local.length ? '' : (e.message === 'Failed to fetch' ? 'Keine Verbindung zum Flowtown-Server.' : e.message); }
    renderPlanTeaser();
  }
  // gewählter Treffer: als Ziel merken (ein schon gespeichertes an derselben Stelle nehmen), dann gleich vergleichen
  function planPick(o) {
    let z = settings.ziele.find((x) => dist(x, o) < 80);
    if (z) { z.u = Date.now(); store.set('settings', settings); } else {
      z = { id: 'z' + Date.now().toString(36), name: o.name.split(',')[0].slice(0, 30), sub: o.sub || '', lat: o.lat, lon: o.lon, u: Date.now() };
      if (o.bf) z.bf = o.bf;
      while (settings.ziele.length >= ZIEL_MAX) { const old = zielOldest(); settings.ziele = settings.ziele.filter((x) => x !== old); }
      settings.ziele.push(z); store.set('settings', settings);
    }
    planList = null; planMsg = ''; $('#plan-q').value = '';
    planGoZiel(z);
  }
  function openPlan(id) {
    zielEdit = false;
    if (id) { zielOpen = id; if (id !== 'neu') { const z = settings.ziele.find((x) => x.id === id); if (z) checkZiel(z); } }
    else if (!zielOpen) zielOpen = 'neu';
    showView('plan');
    // Tastatur nicht von selbst öffnen (Handy): erst, wenn man ins Feld tippt
    if (zielOpen === 'neu' && !window.matchMedia('(pointer: coarse)').matches) { const i = $('#inp-ziel'); if (i) i.focus(); }
  }
  const MODE_GROUP = { auto: 'auto', rad: 'rad', bus: 'oepnv', bahn: 'oepnv', zug: 'oepnv', fuss: 'fuss' };
  const GROUP_WITH = { auto: 'mit dem Auto', rad: 'mit dem Rad', oepnv: 'mit Bus und Bahn', fuss: 'zu Fuß' };
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const durText = (ms) => (ms >= 3600000 ? minText(ms / 60000) : fmtDur(ms) + ' min');
  const avgOf = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const tripWait = (t) => t.events.reduce((a, e) => a + (e.type === 'halt' && e.signal ? e.wait : 0), 0);
  function selectedMode() {
    const g = $('input[name="mgroup"]:checked').value;
    return g === 'oepnv' ? $('input[name="pt"]:checked').value : g;
  }
  function setModeUI(mode) {
    const g = MODE_GROUP[mode] || 'auto';
    $(`input[name="mgroup"][value="${g}"]`).checked = true;
    if (g === 'oepnv') $(`input[name="pt"][value="${mode}"]`).checked = true;
    $('#pt-row').hidden = g !== 'oepnv';
  }
  function accText(id) {
    const c = clusterById[id];
    const w = (x) => (x === 'yes' ? 'ja' : x === 'no' ? 'nein' : 'nicht eingetragen');
    return c ? `Tonsignal: ${w(c.sound)} · Vibration: ${w(c.vib)}` : 'Keine Angaben zur Barrierefreiheit';
  }
  // Wiederkehrende Wege: Fahrten mit überwiegend denselben Ampeln in ähnlicher Richtung. Alles bleibt auf dem Gerät.
  function findRoutes(list) {
    const groups = [];
    for (const t of list.slice().sort((a, b) => a.start - b.start)) {
      const ev = t.events.filter((e) => e.signal);
      const sig = Array.from(new Set(ev.map((e) => e.signal)));
      if (sig.length < 3) continue;
      const first = ev[0], last = ev[ev.length - 1];
      const dir = dist(first, last) > 200 ? bearing(first, last) : null;
      const set = new Set(sig);
      let g = groups.find((x) => {
        const inter = x.sig.filter((id) => set.has(id)).length;
        // überwiegend dieselben Ampeln; eine kürzere Fahrt auf demselben Weg zählt mit
        const same = inter >= 3 && inter / Math.min(x.sig.length, sig.length) >= 0.7 && inter / (x.sig.length + sig.length - inter) >= 0.35;
        return same && (x.dir == null || dir == null || angDiff(x.dir, dir) <= 60);
      });
      if (!g) { g = { sig, dir, first, last, trips: [] }; groups.push(g); }
      g.trips.push(t);
    }
    return groups.filter((g) => g.trips.length >= 2);
  }
  // Abfahrtsstunde mit der geringsten Wartezeit, verglichen mit jetzt oder mit allen anderen Stunden
  function bestHour(own) {
    const now = new Date().getHours();
    const hours = {};
    for (const t of own) { const h = new Date(t.start).getHours(); (hours[h] = hours[h] || []).push(tripWait(t)); }
    const hs = Object.keys(hours).map(Number);
    const nowAvg = hours[now] ? avgOf(hours[now]) : avgOf(own.map(tripWait));
    if (hs.length < 2) return { nowAvg };
    const best = hs.reduce((b, h) => (avgOf(hours[h]) < avgOf(hours[b]) ? h : b), hs[0]);
    const ref = hours[now] ? nowAvg : avgOf(own.filter((t) => new Date(t.start).getHours() !== best).map(tripWait));
    if (best === now || ref - avgOf(hours[best]) < 30000) return { nowAvg };
    return { nowAvg, best, bestAvg: avgOf(hours[best]), ref,
      text: `Am wenigsten gewartet hast du bei Abfahrt zwischen ${best} und ${best + 1} Uhr: Ø ${durText(avgOf(hours[best]))} statt ${durText(ref)}.` };
  }
  function routeCard(g, group) {
    const own = g.trips.filter((t) => MODE_GROUP[t.mode] === group);
    let body;
    if (own.length) {
      const bh = bestHour(own);
      body = `<div class="big-line">${ic('hourglass')}<span>Jetzt los: etwa <b>${durText(bh.nowAvg)}</b> an Ampeln</span></div>`;
      if (bh.text) body += `<p class="tip">${ic('bulb')}<span>${bh.text}</span></p>`;
    } else {
      body = `<p class="note">${ic('info')}<span>${cap(GROUP_WITH[group])} bist du diesen Weg noch nicht ${words(group).past}.</span></p>`;
    }
    // Strecken-Vergleich: derselbe Weg mit verschiedenen Verkehrsmitteln
    const byMode = {};
    for (const t of g.trips) (byMode[MODE_GROUP[t.mode]] = byMode[MODE_GROUP[t.mode]] || []).push(t);
    if (Object.keys(byMode).length >= 2) {
      body += `<div class="compare">${Object.keys(byMode).map((m) => `<div>${ic(MODE_ICON[m])}<span>${cap(GROUP_WITH[m])}: Ø ${durText(avgOf(byMode[m].map((t) => t.end - t.start)))} unterwegs, ${durText(avgOf(byMode[m].map(tripWait)))} an Ampeln</span></div>`).join('')}</div>`;
    }
    return `<div class="card"><div class="card-head"><span class="chip">${ic('route')}</span><div><span class="meta">Dein Weg · ${g.trips.length}× unterwegs</span><div class="route-name">${routeName(g)}</div></div></div>${body}</div>`;
  }
  function modeCard(group) {
    const since = Date.now() - 30 * 864e5;
    const ts = trips.filter((t) => !t.demo && MODE_GROUP[t.mode] === group && t.start >= since);
    const head = cardHead(MODE_ICON[group], cap(GROUP_WITH[group]), 'Die letzten 30 Tage');
    const later = '';
    const w = words(group);
    if (!ts.length) return `<div class="card">${head}<p class="note">${ic('info')}<span>${w.none}. Starte unten deine erste Aufzeichnung.</span></p>${later}</div>`;
    const km = ts.reduce((a, t) => a + t.distance, 0) / 1000;
    const halts = ts.reduce((a, t) => a + t.events.filter((e) => e.type === 'halt' && e.signal).length, 0);
    const wait = ts.reduce((a, t) => a + tripWait(t), 0);
    let extra = '';
    if (group === 'oepnv') {
      const atStops = ts.reduce((a, t) => a + t.events.reduce((b, e) => b + (e.atStop ? e.wait : 0), 0), 0);
      const trs = ts.reduce((a, t) => a.concat(t.transfers || []), []);
      const missed = trs.filter((r) => r.missed).length;
      extra = `${atStops || trs.length ? `<ul class="facts"><li>${ic('pin')}<span>An Haltestellen</span><b>${durText(atStops)}</b></li><li>${ic('light')}<span>An Ampeln</span><b>${durText(wait)}</b></li>${trs.length ? `<li>${ic('walk')}<span>Ø je Umstieg (${trs.length}×)</span><b>${durText(avgOf(trs.map((r) => r.wait)))}</b></li>` : ''}${missed ? `<li>${ic('alert')}<span>Anschluss verpasst</span><b>${missed}×</b></li>` : ''}</ul>` : ''}`;
    }
    const mini = (icon, val, label) => `<div class="mini">${ic(icon)}<b>${val}</b><span>${label}</span></div>`;
    return `<div class="card">${head}<div class="minis">${mini('list', ts.length, ts.length === 1 ? w.one : w.many)}${mini('route', fmtNum(km, 1) + ' km', 'Strecke')}${mini('light', fmtNum(km ? halts / km : 0, 1), 'Ampelhalte je km')}${mini('hourglass', durText(wait / ts.length), 'Ø an Ampeln je ' + w.one)}</div>${extra}${later}</div>`;
  }
  function accessCard() {
    const ids = new Set();
    for (const t of trips) for (const e of t.events) if (e.signal && !e.signal.startsWith('demo')) ids.add(e.signal);
    let yes = 0, no = 0, unk = 0;
    for (const id of ids) { const c = clusterById[id]; if (c && c.sound === 'yes') yes++; else if (c && c.sound === 'no') no++; else unk++; }
    return `<div class="card">${cardHead('access', 'Barrierefrei unterwegs', esc(ACCESS_LABEL[settings.access.type]))}
      ${ids.size ? `<ul class="facts"><li>${ic('sound')}<span>Ampeln mit Tonsignal</span><b>${yes}</b></li><li>${ic('light')}<span>ohne Tonsignal</span><b>${no}</b></li><li>${ic('info')}<span>ohne Angabe</span><b>${unk}</b></li></ul>` : `<p class="small muted">Nach den ersten Fahrten: Ampeln mit Tonsignal auf deinen Wegen.</p>`}
      </div>`;
  }
  // Verkehrsmittel für „Ohne Ziel aufzeichnen“: ein Symbol neben dem Knopf, ein Tipp öffnet die Auswahl
  function updateModeChip() {
    const m = selectedMode(), u = $('#btn-mode use');
    if (u) u.setAttribute('href', '#i-' + (MODE_ICON[m] || 'route'));
    $('#btn-mode-t').textContent = `Verkehrsmittel: ${MODES[m] ? MODES[m].label : m}. Ändern`;
    $$('#mode-pop [data-setmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setmode === m)));
  }
  function closeModePop(focusChip) {
    $('#mode-pop').hidden = true; $('#btn-mode').setAttribute('aria-expanded', 'false');
    if (focusChip) $('#btn-mode').focus();
  }
  $('#btn-mode').addEventListener('click', () => {
    const open = $('#mode-pop').hidden;
    $('#mode-pop').hidden = !open; $('#btn-mode').setAttribute('aria-expanded', String(open));
    if (open) { updateModeChip(); const on = $('#mode-pop [aria-pressed="true"]'); if (on) on.focus({ preventScroll: true }); }
  });
  $('#mode-pop').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-setmode]');
    if (!b) return;
    setModeVoice(b.dataset.setmode); closeModePop(true);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#mode-pop').hidden) closeModePop(true); });
  function renderToday() {
    updateModeChip();
    const group = MODE_GROUP[selectedMode()];
    renderAccRow();
    renderStatus(group);
    renderVorfahrt();
    renderPlanTeaser();
    if (lageOn() && Date.now() - lageAt >= 300000) loadLage().then((ok) => { if (ok && heuteOn()) renderToday(); });
    if (group === 'oepnv' && lageOn() && Date.now() - mbAt >= 900000) loadMobiel().then((ok) => { if (ok && heuteOn()) renderToday(); });
    if (group === 'oepnv' && lageOn() && (Date.now() - fpAt >= 6 * 3600e3 || fpWrong())) loadFahrplan().then(() => { if (heuteOn()) renderVorfahrt(); });
  }
  function sortedRoutes(group) {
    const now = new Date().getHours();
    const hourGap = (g) => Math.min(...g.trips.map((t) => { const d = Math.abs(new Date(t.start).getHours() - now); return Math.min(d, 24 - d); }));
    const own = (g) => g.trips.filter((t) => MODE_GROUP[t.mode] === group).length;
    let routes = findRoutes(trips.filter((t) => !t.demo)).sort((a, b) => own(b) - own(a) || hourGap(a) - hourGap(b));
    if (routes.some(own)) routes = routes.filter(own);   // Wege mit anderen Verkehrsmitteln nur, solange es keine eigenen gibt
    return { routes, own };
  }
  // Heute: „Dein Weg heute“ als ruhige Liste mit Ampelpunkt; Meldungen sind eine Zeile, Einzelheiten beim Antippen
  const plain = (h) => String(h || '').replace(/<[^>]+>/g, '');
  const wrow = (dot, text, right, act) => `<${act ? `button type="button" ${act}` : 'div'} class="wrow"><span class="dot ${dot}"></span><span class="wrow-text">${text}</span>${right ? `<span class="wrow-right">${right}</span>` : ''}${act ? ic('chevron', 'wrow-go') : ''}</${act ? 'button' : 'div'}>`;
  // „Dein Weg heute“: oben die Woche in drei Zahlen, darunter eine Karte für den Weg mit Wartezeit, Stau und Störungen
  let wegSay = '';
  function renderStatus(group) {
    const real = trips.filter((t) => !t.demo);
    const { routes, own } = sortedRoutes(group);
    const ownRoute = routes.find((g) => own(g));
    const mine = ownRoute ? ownRoute.trips.filter((t) => MODE_GROUP[t.mode] === group) : [];
    const bh = mine.length ? bestHour(mine) : null;
    const say = [];
    let html = '', detail = '';
    // 1) Diese Woche
    const week = real.filter((t) => t.start >= weekStart()), wag = aggregate(week);
    if (week.length) {
      const sig = wag.halts + wag.passes;
      const tiles = [[String(week.length), `Fahrt${week.length === 1 ? '' : 'en'}`], [sig ? fmtPct(wag.halts / sig) : '–', 'Ampeln mit Halt'], [hm(wag.wait / 1000), 'an Ampeln gewartet']];
      html += `<button type="button" class="wk" data-goto="stats"><span class="wk-head">Diese Woche${ic('chevron', 'wrow-go')}</span><span class="wk-tiles">${tiles.map(([v, l]) => `<span class="wk-t"><b>${v}</b><span>${l}</span></span>`).join('')}</span></button>`;
      say.push(`Diese Woche: ${tiles.map(([v, l]) => `${v} ${l}`).join(', ')}.`);
    } else if (real.length) html += `<p class="wk-none small muted">Diese Woche noch keine Fahrt.</p>`;
    // 2) Auf deinem Weg: Fahrzeit, Wartezeit an Ampeln, Stau und Störungen zusammen
    const items = [];   // { dot, art, name, right, act }
    let delay = 0, nHits = 0, nLines = 0;
    if (group === 'oepnv' && lageOn() && mbItems().mine.some((it) => mbState(it) === 'aktiv')) {
      const act = mbItems().mine.filter((it) => mbState(it) === 'aktiv'); nHits = act.length;
      act.slice(0, 3).forEach((x) => items.push({ dot: 'amber', art: 'Störung', name: x.titel, right: mbLines(x), act: 'data-weg="mobiel"' }));
    } else if (lageOn() && lageCache) {
      const { lines, hits } = myLage(group);
      nLines = lines.length;
      hits.forEach((x) => { delay += x.delay || 0; }); nHits = hits.length;
      hits.slice(0, 3).forEach((x) => items.push({ dot: LAGE_CLS[x.art] === 'red' ? 'red' : 'amber', art: cap(LAGE_LABEL[x.art]), name: x.titel, right: delayText(x.delay) }));
      if (hits.length > 3) items.push({ dot: 'amber', art: '', name: `und ${hits.length - 3} weitere Meldung${hits.length > 4 ? 'en' : ''}`, right: '' });
      if (hits.length && vfOpen) detail = `<ul class="lg-list vf-detail">${hits.slice(0, 6).map((y) => lageRow(y.art, lageBtn(y), [LAGE_LABEL[y.art], delayText(y.delay), y.richtungText, lines.length > 1 ? 'auf ' + y.line.name : ''].filter(Boolean).map(esc).join(' · '), y.art !== 'zaeh' ? y.texts[0] : '')).join('')}</ul>`
        + `<p class="small muted lg-src">Stand ${clock(lageCache.t || Date.now())} Uhr · ${esc(lageSrc((lageCache.quellen || []).map((q) => q.name)))}</p>`;
    }
    const red = items.some((x) => x.dot === 'red');
    const nums = [];
    if (ownRoute) nums.push([hm(avgOf(mine.map((t) => (t.end || t.start) - t.start)) / 1000), 'Ø Fahrzeit']);
    if (bh) nums.push([`${fmtDur(bh.nowAvg)} min`, 'Ø an Ampeln um diese Zeit']);
    if (delay >= 60) nums.push([`+${Math.round(delay / 60)} min`, 'durch Stau']);
    const state = nHits ? (red ? 'red' : 'amber') : lageOn() && lageCache ? 'green' : 'grey';
    const badge = nHits ? `${nHits} Meldung${nHits === 1 ? '' : 'en'}` : lageOn() && lageCache ? 'frei' : lageOn() ? 'lädt …' : '';
    // „frei“ nur, wenn es eigene Wege gibt, auf denen geprüft wurde
    if (ownRoute || items.length || (lageOn() && nLines)) {
      const title = ownRoute ? 'Dein häufigster Weg' : 'Auf deinen Wegen';
      const list = items.length ? `<ul class="lw-list">${items.map((x) => `<li><span class="dot ${x.dot}"></span><span class="lw-name">${x.art ? `<b>${esc(x.art)}</b> · ` : ''}${esc(x.name)}</span>${x.right ? `<span class="lw-right">${esc(x.right)}</span>` : ''}</li>`).join('')}</ul>` : '';
      const mb = items.some((x) => x.act);
      const more = items.length ? `<button type="button" class="lw-more" ${mb ? 'data-weg="mobiel"' : `data-weg="lage" aria-expanded="${vfOpen}"`}>${list}<span class="lw-go">${mb ? 'Zu den Abfahrten' : vfOpen ? 'Weniger anzeigen' : 'Einzelheiten und Karte'}${ic('chevron', 'wrow-go')}</span></button>` : '';
      html += `<div class="lw ${state}"><div class="lw-head"><span class="lw-title">${title}</span>${badge ? `<span class="lw-badge">${badge}</span>` : ''}</div>`
        + (nums.length ? `<div class="lw-nums">${nums.map(([v, l]) => `<span><b>${v}</b><span>${l}</span></span>`).join('')}</div>` : '')
        + (!items.length && lageOn() && lageCache && nLines ? `<p class="lw-ok small">Keine Störungen, kein Stau, keine Baustellen auf deinen Wegen in Bielefeld.</p>` : '')
        + more + '</div>';
      say.push(`${title}: ${badge === 'frei' ? 'frei' : badge}. ${nums.map(([v, l]) => `${v} ${l}`).join(', ')}${nums.length ? '.' : ''} ${items.map((x) => `${x.art ? x.art + ': ' : ''}${x.name}${x.right ? ', ' + x.right : ''}.`).join(' ')}`);
    }
    if (!real.length) say.push('Noch keine Fahrt.');
    wegSay = say.join(' ').replace(/\s+/g, ' ').trim();
    $('#weg').innerHTML = html;
    $('#st-detail').innerHTML = detail;
    const tl = $('#weg').closest('.today-list'); if (tl) tl.hidden = !html && !detail;   // ohne Fahrten und Meldungen keine leere Überschrift
    const top = computeTips()[0];
    $('#tip-strip').innerHTML = top ? `<button type="button" class="tip-strip" data-goto="tips">${ic('bulb')}<span>${top.num ? `<b>${top.num}</b> · ` : ''}${plain(top.short)}</span>${ic('chevron')}</button>` : '';
  }
  ['#weg', '#tip-strip'].forEach((id) => $(id).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-weg],[data-goto]');
    if (!b) return;
    if (b.dataset.goto) showView(b.dataset.goto);
    else if (b.dataset.weg === 'lage') { vfOpen = !vfOpen; renderStatus(MODE_GROUP[selectedMode()]); }
    else if (b.dataset.weg === 'mobiel') { if (!$('#vorfahrt').hidden) $('#vorfahrt').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));

  // ---------- Flowtown-Server: Ebene „Wir“, KI-Einschätzung, Meldungen ----------
  const apiBase = () => (settings.server.url || '').trim().replace(/\/+$/, '');
  async function api(pathPart, opts) {
    const res = await fetchWithTimeout(apiBase() + pathPart, opts || {}, pathPart === '/api/ki' || pathPart === '/api/assist' ? 45000 : pathPart.startsWith('/api/vergleich') ? 30000 : 15000);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.fehler || 'HTTP ' + res.status);
    return j;
  }
  const postJson = (pathPart, body) => api(pathPart, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function contributorId() {
    if (!settings.cid) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      settings.cid = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      store.set('settings', settings);
    }
    return settings.cid;
  }
  // Nur Ampel, Richtung (Achtel), Zeitfenster, Wartezeit; Fahrten, Orte und Uhrzeiten bleiben auf dem Gerät
  const wirItems = (t) => t.events.filter((e) => e.signal && /^c\d+$/.test(e.signal)).map((e) => ({
    s: e.signal, d: e.heading == null ? -1 : Math.round(e.heading / 45) % 8, w: timeWindow(e.t), wait: e.type === 'halt' ? e.wait : 0, halt: e.type === 'halt'
  }));
  async function flushWir(trip) {
    if (!apiBase() || !settings.server.wir) return;
    const queue = store.get('wirQueue', []);
    if (trip && !trip.demo) queue.push(trip.id);
    const left = [];
    for (const id of queue.slice(-50)) {
      const t = trips.find((x) => x.id === id);
      if (!t) continue;
      try { await postJson('/api/wir', { cid: contributorId(), items: wirItems(t) }); } catch (e) { left.push(id); }
    }
    store.set('wirQueue', left);
  }
  let wirCache = null, wirAt = 0, newsCache = [], newsAt = 0;
  async function loadWir() {
    if (!apiBase() || !settings.server.wir) return null;
    if (wirCache && Date.now() - wirAt < 600000) return wirCache;
    const ids = Array.from(new Set([].concat(...trips.map((t) => t.events.filter((e) => e.signal && /^c\d+$/.test(e.signal)).map((e) => e.signal))))).slice(0, 400);
    if (!ids.length) return null;
    try { wirCache = (await api('/api/wir?s=' + ids.join(','))).werte || {}; wirAt = Date.now(); } catch (e) { /* ohne Server weiter */ }
    return wirCache;
  }
  // Werte anderer für eine Ampel in einer Richtung, über alle Zeitfenster
  function othersAt(signal, heading) {
    if (!wirCache) return null;
    const d = heading == null ? -1 : Math.round(heading / 45) % 8;
    let v = 0, h = 0, w = 0, n = 0;
    for (const k in wirCache) {
      const [s, dd] = k.split('|');
      if (s !== signal || Number(dd) !== d) continue;
      const x = wirCache[k]; v += x.v; h += x.h; w += x.avg * x.h; n = Math.max(n, x.n);
    }
    return v ? { n, share: h / v, avg: h ? w / h : 0 } : null;
  }
  async function loadNews() {
    if (!apiBase()) { newsCache = []; return; }
    if (Date.now() - newsAt < 600000) return;
    try { newsCache = (await api('/api/news')).meldungen || []; newsAt = Date.now(); } catch (e) { /* ohne Server weiter */ }
  }
  // Meldungen nur, wenn sie die eigenen Wege betreffen (oder für die ganze Stadt gelten); geprüft wird auf dem Gerät
  function myNews() {
    const pts = [];
    for (const t of trips) if (!t.demo) for (const e of t.events) if (e.signal) pts.push(e);
    return newsCache.filter((n) => n.lat == null || n.lon == null || pts.some((q) => dist(q, n) <= (n.radius_m || 300)));
  }

  // ---------- Verkehrslage vor der Fahrt ----------
  // Der Server liefert die Lage für ganz Bielefeld; welche Meldungen die eigenen Wege betreffen, prüft nur das Gerät.
  let lageCache = null, lageAt = 0, lageLoading = false;
  const lageOn = () => !!apiBase() && settings.server.lage !== false;
  async function loadLage() {
    if (!lageOn() || lageLoading || Date.now() - lageAt < 300000) return false;
    lageLoading = true;
    try { lageCache = await api('/api/lage'); lageAt = Date.now(); return true; }
    catch (e) { lageAt = Date.now() - 240000; return false; }   // in einer Minute noch einmal
    finally { lageLoading = false; }
  }
  // ---------- Bus und Bahn: Umleitungen von moBiel ----------
  // Der Server liest die öffentliche Seite von moBiel. Welche Linien du fährst, bleibt auf dem Handy: gefiltert wird hier.
  let mbCache = null, mbAt = 0, mbLoading = false, mbAdd = false, mbAll = false;
  async function loadMobiel() {
    if (!lageOn() || mbLoading || Date.now() - mbAt < 900000) return false;
    mbLoading = true;
    try { mbCache = await api('/api/oepnv'); mbAt = Date.now(); return true; }
    catch (e) { mbAt = Date.now() - 840000; return false; }   // in einer Minute noch einmal
    finally { mbLoading = false; }
  }
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function mbState(it) {
    const today = isoDay(new Date());
    if (it.vorbei || (it.bis && it.bis < today)) return 'vorbei';
    if (it.von && it.von > today) return new Date(it.von + 'T00:00:00') - Date.now() <= 7 * 864e5 ? 'bald' : 'spaeter';
    return 'aktiv';
  }
  const mbDay = (iso, wd) => { const d = new Date(iso + 'T12:00:00'); return (wd ? d.toLocaleDateString('de-DE', { weekday: 'short' }) + ' ' : '') + `${d.getDate()}.${d.getMonth() + 1}.`; };
  function mbWhen(it) {
    if (it.von && it.von === it.bis) return it.von === isoDay(new Date()) ? 'heute' : 'am ' + mbDay(it.von, true);
    if (mbState(it) === 'bald') return `ab ${mbDay(it.von, true)}` + (it.bis ? ` bis ${mbDay(it.bis)}` : '');
    if (it.bis) return `bis ${mbDay(it.bis, true)}`;
    return it.offen ? 'bis auf Weiteres' : it.von ? `seit ${mbDay(it.von)}` : '';
  }
  // Meldungen ohne Liniennummer (etwa „Busse in der Innenstadt“) betreffen viele: sie zählen für alle, solange sie gelten
  function mbItems() {
    const rank = (it) => (mbState(it) === 'aktiv' ? 0 : 1);
    const all = ((mbCache && mbCache.items) || []).filter((it) => ['aktiv', 'bald'].includes(mbState(it))).sort((a, b) => rank(a) - rank(b));
    const mine = settings.linien;
    const own = (it) => it.linien.some((l) => mine.includes(l));   // eigene Linien vor allgemeinen Meldungen
    return { all, mine: mine.length ? all.filter((it) => own(it) || (!it.linien.length && rank(it) === 0)).sort((a, b) => rank(a) - rank(b) || own(b) - own(a)) : [] };
  }
  const mbLines = (it) => {
    const m = it.linien.filter((l) => settings.linien.includes(l)), l = m.length ? m : it.linien;
    return l.length ? `Linie${l.length > 1 ? 'n' : ''} ${l.join(', ')}` : 'mehrere Linien';
  };
  const mbRow = (it) => lageRow(mbState(it) === 'aktiv' ? 'baustelle' : 'warnung', `<a class="mb-link" href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.titel)}</a>`,
    [mbLines(it), mbWhen(it)].filter(Boolean).map(esc).join(' · '), it.text);
  function mobielSection() {
    const mine = settings.linien;
    const chips = mine.map((l) => `<button type="button" class="vf-chip on" data-linie-del="${esc(l)}" aria-label="Linie ${esc(l)} entfernen">${esc(l)}${ic('x')}</button>`).join('')
      + (mine.length < 12 ? `<button type="button" class="vf-chip add${mbAdd ? ' on' : ''}" data-mb="add" aria-expanded="${mbAdd}">+ Linie</button>` : '');
    const form = mbAdd ? `<form class="vf-form" data-mb="linie"><label class="sr-only" for="inp-linie">Linie</label><input id="inp-linie" type="text" maxlength="8" placeholder="z. B. 21 oder N4" autocomplete="off" enterkeyhint="done"><button class="btn" type="submit">Hinzufügen</button></form>
      <div class="vf-chips" role="group" aria-label="StadtBahn-Linien">${['1', '2', '3', '4'].filter((l) => !mine.includes(l)).map((l) => `<button type="button" class="vf-chip" data-linie-add="${l}">StadtBahn ${l}</button>`).join('')}</div>` : '';
    let body;
    if (!mbCache) body = `<p class="small muted" role="status">${mbAt ? 'moBiel ist gerade nicht erreichbar.' : 'Umleitungen werden geladen …'}</p>`;
    else {
      const { all, mine: hits } = mbItems();
      const list = mbAll ? all : hits;
      const intro = mine.length ? (hits.length ? '' : '<p class="small">Auf deinen Linien ist gerade nichts gemeldet.</p>')
        : `<p class="small">${all.length ? `${all.length} Umleitung${all.length === 1 ? '' : 'en'} gemeldet.` : 'Gerade keine Umleitungen gemeldet.'} Wähle deine Linien, dann siehst du nur, was dich betrifft.</p>`;
      const more = all.length > hits.length ? `<button type="button" class="btn-link" data-mb="alle" aria-expanded="${mbAll}">${mbAll ? (mine.length ? 'Nur meine Linien' : 'Weniger') : `Alle ${all.length} zeigen`}</button>` : '';
      body = `${intro}${list.length ? `<ul class="lg-list">${list.slice(0, mbAll ? 40 : 6).map(mbRow).join('')}</ul>` : ''}${more}
        <p class="small muted lg-src">Stand ${clock(mbCache.t || Date.now())} Uhr · Quelle: <a href="${esc(mbCache.seite || 'https://www.mobiel.de/aktuelles/neueste-umleitungen/')}" target="_blank" rel="noopener">moBiel</a></p>`;
    }
    return `<section class="vf world-vor" aria-labelledby="mb-h"><h3 class="vf-title" id="mb-h">Umleitungen bei moBiel</h3>
      <div class="vf-chips" role="group" aria-label="Deine Linien">${chips}</div>${form}${body}</section>`;
  }
  function addLinie(v) {
    const l = String(v || '').toUpperCase().replace(/LINIE|\s/g, '');
    if (!/^N?\d{1,3}$/.test(l)) return false;
    if (!settings.linien.includes(l)) { settings.linien.push(l); store.set('settings', settings); }
    return true;
  }
  // ---------- Bus und Bahn: Abfahrten aus dem Fahrplan (DELFI) ----------
  // Die App lädt den ganzen moBiel-Fahrplan (etwa 150 KB) und rechnet hier. Haltestellen und Standort verlassen das Handy nicht.
  let fp = null, fpAt = 0, fpLoading = false, fpErr = '', hsAdd = false, hsOpen = null, hsHits = null, fpTried = '';
  // Fahrplan der Stadt, in der man gerade ist (Bielefeld, sonst eine Stadt mit eigenem Auszug auf dem Server)
  function fpStadtNow() {
    const p = rec && rec.last ? [rec.last.lat, rec.last.lon] : lastStart;
    const c = p && FP_STAEDTE.find((x) => p[0] >= x.box[0] && p[0] <= x.box[1] && p[1] >= x.box[2] && p[1] <= x.box[3]);
    return c ? c.id : 'bielefeld';
  }
  const fpWrong = () => !!fp && fp.stadt !== fpStadtNow();
  // Standort für die Wahl des Fahrplans: nur wenn der Zugriff schon erlaubt ist (keine neue Abfrage beim Start), höchstens 2,5 s warten
  async function fpPosQuick() {
    if ((rec && rec.last) || lastStart || !('geolocation' in navigator)) return;
    try { const q = navigator.permissions && await navigator.permissions.query({ name: 'geolocation' }); if (!q || q.state !== 'granted') return; } catch (e) { return; }
    await Promise.race([myStart(), new Promise((r) => setTimeout(r, 2500))]);
  }
  async function loadFahrplan() {
    if (!fpLoading) await fpPosQuick();
    const st = fpStadtNow();
    if (!lageOn() || fpLoading || (fpTried === st && Date.now() - fpAt < 6 * 3600e3 && (!fp || fp.stadt === st))) return false;
    fpLoading = true; fpTried = st;
    try {
      const [d] = await Promise.all([api('/api/fahrplan' + (st !== 'bielefeld' ? '?stadt=' + st : ''), { cache: 'no-cache' }), loadHst()]);
      // Haltestellen nach Namen zusammenfassen (je Steig ein Eintrag), Haltefolgen je Haltestelle
      const byName = {}, patsOf = {};
      d.stops.forEach((st, i) => { const n = st[1].replace(FP_PREFIX, ''); (byName[n] = byName[n] || []).push(i); });
      d.patterns.forEach((pat, pi) => pat.forEach((si) => { (patsOf[si] = patsOf[si] || new Set()).add(pi); }));
      fp = Object.assign(d, { byName, patsOf, names: Object.keys(byName).sort((a, b) => a.localeCompare(b, 'de')), svcDay: {}, stadt: st });
      fpAt = Date.now(); fpErr = '';
      return true;
    } catch (e) {
      const sn = (FP_STAEDTE.find((x) => x.id === st) || {}).name;
      if (fp && fp.stadt !== st) fp = null;   // kein Fahrplan einer anderen Stadt zeigen
      fpErr = /Noch kein Fahrplan/.test(e.message) ? (sn ? `Für ${sn} ist der Fahrplan auf dem Server noch nicht da.` : 'Der Fahrplan ist auf dem Server noch nicht eingerichtet.') : 'Der Fahrplan ist gerade nicht erreichbar.';
      fpAt = Date.now() - 6 * 3600e3 + 60000;   // in einer Minute noch einmal
      return false;
    } finally { fpLoading = false; }
  }
  const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  function servicesOn(day) {
    if (!fp.svcDay[day]) fp.svcDay[day] = new Set(Object.keys(fp.services).filter((k) => fp.services[k].includes(day)));
    return fp.svcDay[day];
  }
  // nächste Abfahrten an einer Haltestelle (alle Steige), auch Fahrten nach Mitternacht vom Vortag
  // Echtzeit (DELFI über den Flowtown-Server): je Fahrt Ausfall, Verspätung je Halt; die App fragt nur nach der Stadt
  let rtData = null, rtAt = 0, rtLoading = false;
  async function loadEchtzeit() {
    if (!fp || rtLoading || !apiBase() || Date.now() - rtAt < 60e3) return false;
    rtLoading = true; rtAt = Date.now();
    try {
      const d = await api('/api/echtzeit' + (fp.stadt && fp.stadt !== 'bielefeld' ? '?stadt=' + fp.stadt : ''), { cache: 'no-cache' });
      const ok = d && d.t && d.stand === fp.stand;   // nur zum selben Fahrplan
      rtData = ok ? Object.assign(d, { stadt: fp.stadt }) : null;
      if (!d.t) rtAt = Date.now() - 45e3;   // wird noch geladen: in 15 s noch einmal
      return ok;
    } catch (e) { rtData = null; return false; } finally { rtLoading = false; }
  }
  const rtFresh = () => !!(rtData && fp && rtData.stadt === fp.stadt && Date.now() - rtData.t < 5 * 60e3);
  function rtFor(ti, pat, k) {
    if (!rtFresh()) return null;
    const e = rtData.trips[ti];
    if (!e) return null;
    if (e[0] || e[3].includes(pat[k])) return { x: true };
    for (let j = k; j >= 0; j--) { const h = e[2].find((q) => q[0] === pat[j]); if (h) return { dl: Math.round(h[1] / 60) }; }
    return { dl: e[1] != null ? Math.round(e[1] / 60) : 0 };
  }
  function departures(name, now, span) {
    const idx = new Set(fp.byName[name] || []), pats = new Set();
    idx.forEach((si) => (fp.patsOf[si] || []).forEach((pi) => pats.add(pi)));
    const nowMin = now.getHours() * 60 + now.getMinutes(), out = [];
    const days = [[servicesOn(ymd(now)), 0], [servicesOn(ymd(new Date(now - 864e5))), 1440]];
    for (let ti = 0; ti < fp.trips.length; ti++) {
      const [r, pi, h, sv, start, deltas, nr] = fp.trips[ti];
      if (!pats.has(pi)) continue;
      for (const [on, shift] of days) {
        if (!on.has(sv)) continue;
        const pat = fp.patterns[pi];
        let t = start - shift;
        for (let k = 0; k < pat.length - 1; k++) {   // an der Endhaltestelle fährt nichts mehr ab
          if (k) t += deltas[k - 1];
          if (t > nowMin + span) break;
          if (idx.has(pat[k]) && t >= nowMin - 10) {
            const rx = shift === 0 ? rtFor(ti, pat, k) : null;
            if (t + (rx && rx.dl > 0 ? rx.dl : 0) >= nowMin) out.push(Object.assign({ t, line: fpLine(r, nr), kind: fp.routes[r][1], head: fp.heads[h].replace(FP_PREFIX, '') }, rx || {}));
          }
        }
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }
  // Zuglinien: ICE und IC mit Zugnummer (im Datensatz steht dort nur die Liniennummer), sonst RE6, RB69 …
  function fpLine(r, nr) {
    const [short, k, rt] = fp.routes[r], n = nr ? String(Number(nr)) : '';
    return k !== 2 ? short : rt === 101 ? `ICE ${n}` : rt === 102 && !/^[A-Z]/.test(short) ? `IC ${n}` : short;
  }
  const fpName = (si) => fp.stops[si][1].replace(FP_PREFIX, '');
  // Fahrplan-Halte in der Nähe eines Punkts, wahlweise nur von Linien einer Art (0 StadtBahn, 3 Bus, 2 Zug)
  function fpStopsNear(p, r, k) {
    if (!fp) return [];
    if (!fp.kindOf) {
      fp.kindOf = {};
      for (const tr of fp.trips) for (const si of fp.patterns[tr[1]]) (fp.kindOf[si] = fp.kindOf[si] || new Set()).add(fp.routes[tr[0]][1]);
    }
    const out = [];
    fp.stops.forEach((st, i) => { if (Math.abs(st[2] - p.lat) < 0.004 && (k == null || (fp.kindOf[i] && fp.kindOf[i].has(k))) && dist(p, { lat: st[2], lon: st[3] }) <= r) out.push(i); });
    return out;
  }
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function hsSuggest(q) {
    if (!fp) return [];
    const k = q.trim().toLowerCase();
    if (k.length < 2) return [];
    return fp.names.filter((n) => n.toLowerCase().includes(k)).sort((a, b) => a.toLowerCase().indexOf(k) - b.toLowerCase().indexOf(k)).slice(0, 6);
  }
  const hsHitList = () => (hsHits ? (hsHits.length ? `<div class="vf-chips" role="group" aria-label="Haltestellen">${hsHits.map((n) => `<button type="button" class="vf-chip" data-hs-pick="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '<p class="small muted">Keine Haltestelle gefunden.</p>') : '');
  function abfahrtSection() {
    const mine = settings.haltestellen;
    if (hsOpen && !mine.includes(hsOpen)) hsOpen = null;
    const open = hsOpen || mine[0] || null;
    const chips = mine.map((n) => `<button type="button" class="vf-chip${n === open ? ' on' : ''}" data-hs="${esc(n)}" aria-pressed="${n === open}">${esc(n)}</button>`).join('')
      + (mine.length < 6 ? `<button type="button" class="vf-chip add${hsAdd ? ' on' : ''}" data-hs-add="1" aria-expanded="${hsAdd}">+ Haltestelle</button>` : '');
    const form = hsAdd ? `<div class="vf-panel"><form class="vf-form" data-hs-form="1"><label class="sr-only" for="inp-hs">Haltestelle</label><input id="inp-hs" type="search" placeholder="Name der Haltestelle" autocomplete="off" enterkeyhint="search"><button class="btn" type="button" data-hs-near="1">${ic('pin')}In meiner Nähe</button></form>
      <div id="hs-hits">${hsHitList()}</div><p class="small muted">${ic('shield')} Haltestellen und Standort bleiben auf dem Handy. Den Fahrplan hat die App schon geladen.</p></div>` : '';
    let body = '';
    if (!fp) body = `<p class="small muted" role="status">${fpErr || 'Fahrplan wird geladen …'}</p>`;
    else if (!open) body = hsAdd ? '' : '<p class="small">Wähle deine Haltestellen, dann siehst du hier die nächsten Abfahrten.</p>';
    else {
      const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
      let list = departures(open, now, 60);
      if (list.length < 4) list = departures(open, now, 180);
      const mineL = settings.linien;
      if (!rtFresh()) loadEchtzeit().then((ok) => { if (ok) renderVorfahrt(); });
      const rows = list.slice(0, 8).map((d) => { const inMin = d.t + (d.dl > 0 ? d.dl : 0) - nowMin;
        return `<li class="dep${mineL.includes(d.line) ? ' mine' : ''}"><b class="dep-t${d.x ? ' dep-x' : ''}">${hhmm((d.t + 1440) % 1440)}${d.x ? '<span class="dep-rt bad">fällt aus</span>' : d.dl >= 1 ? `<span class="dep-rt late">+${d.dl}</span>` : d.dl != null && !d.x ? '<span class="dep-rt ok" aria-label="pünktlich">✓</span>' : ''}</b><span class="dep-line${d.kind === 0 ? ' tram' : d.kind === 2 ? ' rail' : ''}">${esc(d.line)}</span><span class="dep-head">${esc(d.head)}</span><span class="dep-in">${inMin <= 0 ? 'jetzt' : inMin < 60 ? `in ${inMin} min` : ''}</span></li>`; }).join('');
      body = rows ? `<ul class="dep-list" aria-label="Abfahrten ${esc(open)}">${rows}</ul>` : '<p class="small">In den nächsten drei Stunden fährt hier laut Fahrplan nichts.</p>';
      body += `<p class="small muted lg-src">${rtFresh() ? `Mit Echtzeit, Stand ${clock(rtData.t)} Uhr (DELFI, CC BY-SA 4.0)` : 'Laut Fahrplan, ohne Verspätungen'} · <button type="button" class="btn-link" data-hs-del="${esc(open)}">${esc(open)} entfernen</button> · Fahrplan: DELFI (CC BY 4.0), Stand ${esc((fp.stand || '').slice(8, 10) + '.' + (fp.stand || '').slice(5, 7) + '.')}</p>`;
    }
    return `<section class="vf world-vor" aria-labelledby="hs-h"><h3 class="vf-title vf-title-row" id="hs-h">Nächste Abfahrten${canSpeak && open && fp ? `<button type="button" class="vf-x vf-say" data-say-dep="${esc(open)}" aria-label="Abfahrten vorlesen">${ic('sound')}</button>` : ''}</h3>
      <div class="vf-chips" role="group" aria-label="Deine Haltestellen">${chips}</div>${form}${body}</section>`;
  }
  function addHaltestelle(n) {
    if (!fp || !fp.byName[n]) return;
    if (!settings.haltestellen.includes(n)) { settings.haltestellen.push(n); store.set('settings', settings); }
    hsOpen = n; hsAdd = false; hsHits = null;
  }
  function nearStops() {
    navigator.geolocation.getCurrentPosition((p) => {
      const me = { lat: p.coords.latitude, lon: p.coords.longitude }, best = {};
      fp.stops.forEach((st) => { const n = st[1].replace(FP_PREFIX, ''), d = dist(me, { lat: st[2], lon: st[3] }); if (best[n] == null || d < best[n]) best[n] = d; });
      hsHits = Object.keys(best).filter((n) => best[n] < 1500).sort((a, b) => best[a] - best[b]).slice(0, 5);
      const el = $('#hs-hits'); if (el) el.innerHTML = hsHitList();
    }, () => { const el = $('#hs-hits'); if (el) el.innerHTML = '<p class="small muted">Ohne Standort geht das nicht. Gib den Namen ein.</p>'; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  }
  const LAGE_RANK = { sperrung: 0, stau: 1, unfall: 2, zaeh: 3, baustelle: 4, warnung: 5 };
  const LAGE_LABEL = { sperrung: 'Sperrung', stau: 'Stau', unfall: 'Unfall', zaeh: 'zäh', baustelle: 'Baustelle', warnung: 'Hinweis' };
  const LAGE_CLS = { sperrung: 'red', stau: 'red', unfall: 'red', zaeh: 'amber', baustelle: 'amber', warnung: 'amber' };
  // Rad und zu Fuß: Stau der Autos spielt keine Rolle, Sperrungen und Baustellen schon
  const LAGE_FOR = { auto: null, oepnv: null, rad: ['sperrung', 'baustelle', 'unfall'], fuss: ['sperrung', 'baustelle'] };
  // Wege als Linie durch die Ampeln: wiederkehrende Wege und die letzten Fahrten, möglichst mit dem gewählten Verkehrsmittel
  function lageLines(group) {
    const real = trips.filter((t) => !t.demo && t.events.filter((e) => e.signal).length >= 2);
    const mine = real.filter((t) => MODE_GROUP[t.mode] === group);
    const sigs = (t) => t.events.filter((e) => e.signal);
    const line = (ts) => {
      const pool = ts.filter((t) => MODE_GROUP[t.mode] === group).length ? ts.filter((t) => MODE_GROUP[t.mode] === group) : ts;
      const pts = sigs(pool.reduce((b, x) => (sigs(x).length > sigs(b).length ? x : b), pool[0]));
      return { name: `${labelFor(pts[0])} → ${labelFor(pts[pts.length - 1])}`, pts };
    };
    const base = mine.length ? mine : real;
    const routes = findRoutes(real).filter((g) => g.trips.some((t) => base.includes(t)));
    const inRoute = new Set([].concat(...routes.map((g) => g.trips)));
    const out = routes.map((g) => line(g.trips)).concat(base.filter((t) => !inRoute.has(t)).slice(-5).map((t) => line([t])));
    return out.filter((l, i) => out.findIndex((x) => x.name === l.name) === i).slice(0, 8);
  }
  // Abstand eines Punkts zu einer Linie, in Metern (flache Näherung, genügt für eine Stadt)
  function lineDist(p, pts) {
    const kx = 111320 * Math.cos(p.lat * toR), ky = 110540;
    let best = { d: Infinity, h: null, tol: 45 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + u * dx, ay + u * dy);
      // zwischen weit entfernten Ampeln (etwa auf der Autobahn) ist die Linie nur grob, dort großzügiger
      const tol = Math.min(800, Math.max(45, Math.sqrt(l2) * 0.12));
      if (d - tol < best.d - best.tol) best = { d, h: bearing(a, b), tol };
    }
    return best;
  }
  function onLine(item, line) {
    const ps = item.pts.map((q) => ({ lat: q[0], lon: q[1] }));
    if (line.pts.length < 2) return false;
    if (ps.length === 1) { const m = lineDist(ps[0], line.pts); return m.d <= Math.max(80, m.tol); }
    const near = ps.map((q) => Object.assign({ q }, lineDist(q, line.pts))).filter((m) => m.d <= m.tol);
    if (near.length < 2) return false;
    if (!item.richtung) return true;
    // Verkehrsfluss gilt je Richtung: nur, wenn der Abschnitt in Fahrtrichtung des Wegs liegt
    const h = dist(near[0].q, near[near.length - 1].q) > 20 ? bearing(near[0].q, near[near.length - 1].q) : null;
    return h == null || angDiff(h, near[0].h) <= 50;
  }
  // Treffer je Weg, gleiche Straße zusammengefasst (HERE teilt Straßen in viele kurze Abschnitte)
  // HERE nennt manche Abschnitte nicht (dann heißen sie nur „Straße“): nach den Ampeln auf dem eigenen Weg benennen,
  // am liebsten nach Kreuzungen („Detmolder Straße zwischen Prießallee und Sieker“)
  function lageName(it, line) {
    if (it.titel && it.titel !== 'Straße') return it.titel;
    const ends = [it.pts[0], it.pts[it.pts.length - 1]].map((p) => ({ lat: p[0], lon: p[1] }));
    const named = line.pts.map((e) => ({ e, n: nameOf(e.signal) })).filter((x) => x.n);
    const nearest = (p, cross) => {
      let best = null, bd = 500;
      for (const x of named) {
        if (cross !== x.n.indexOf(' / ') > 0) continue;
        const d = dist(x.e, p);
        if (d < bd) { bd = d; best = x.n; }
      }
      return best;
    };
    const [ca, cb] = ends.map((p) => nearest(p, true));
    const plain = ends.map((p) => nearest(p, false)).filter(Boolean);
    // „Detmolder Straße 258“ hat eine Hausnummer, „B 61“ oder „A 2“ nicht: davor muss ein Wort stehen
    const houseNo = (n) => n.match(/^(.*[A-Za-zÄÖÜäöüß]{3,}.*?)\s+(\d+\s*[a-z]?)$/);
    const street = plain.length ? (houseNo(plain[0]) || [0, plain[0]])[1] : null;
    if (ca && cb && ca !== cb) {
      const pa = ca.split(' / '), pb = cb.split(' / '), common = pa.find((x) => pb.includes(x));
      const oa = pa.find((x) => x !== common), ob = pb.find((x) => x !== common);
      if (common && oa && ob) return `${common} zwischen ${oa} und ${ob}`;
    }
    const c = ca || cb;
    if (c) {
      const parts = c.split(' / ');
      return street && parts.includes(street) ? `${street} bei ${parts.find((x) => x !== street)}` : `Kreuzung ${c}`;
    }
    if (street) {
      const num = plain.map((n) => (houseNo(n) || [])[2]).find(Boolean);
      return num ? `${street} bei Nr. ${num}` : street;
    }
    return 'Abschnitt auf deinem Weg';
  }
  function myLage(group) {
    const items = ((lageCache && lageCache.items) || []).filter((it) => it && Array.isArray(it.pts) && it.pts.length && (!LAGE_FOR[group] || LAGE_FOR[group].includes(it.art)));
    const lines = lageLines(group);
    const hits = [];
    for (const line of lines) {
      const by = {};
      for (const it of items) {
        if (!onLine(it, line)) continue;
        const k = lageName(it, line);
        const h = by[k] || (by[k] = { titel: k, art: it.art, delay: 0, parts: [], texts: [], quellen: new Set(), richtungText: it.richtungText || '', line });
        if (LAGE_RANK[it.art] < LAGE_RANK[h.art]) h.art = it.art;
        if (it.delay) h.delay += it.delay;
        h.parts.push(...(it.segs || [it.pts]));
        if (it.text && !h.texts.includes(it.text)) h.texts.push(it.text);
        h.quellen.add(it.quelle);
      }
      for (const h of Object.values(by)) if (!hits.some((x) => x.titel === h.titel && x.art === h.art)) hits.push(h);
    }
    hits.sort((a, b) => LAGE_RANK[a.art] - LAGE_RANK[b.art] || b.delay - a.delay);
    return { lines, hits, total: items.length };
  }
  const lageBtn = (h) => `<button type="button" class="place" data-peek="l" data-name="${esc(h.titel)}" data-art="${h.art}" data-lines="${h.parts.map((p) => p.map((q) => q.join(',')).join(';')).join('|')}" data-pts="${h.line.pts.map((e) => `${e.lat},${e.lon}`).join(';')}">${esc(h.titel)}</button>`;
  const lageSrc = (quellen) => (quellen || []).map((q) => (q === 'HERE' ? '© HERE' : q === 'Autobahn GmbH' ? 'Autobahn GmbH des Bundes' : q)).join(', ');
  const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const delayText = (s) => (s >= 30 ? `etwa +${Math.max(1, Math.round(s / 60))} min` : '');
  const lageRow = (art, btn, sub, text) => `<li class="lg ${LAGE_CLS[art]}"><span class="lg-dot" aria-hidden="true"></span><div><b>${btn}</b><span class="small muted">${sub}</span>${text ? `<span class="small lg-text">${esc(text)}</span>` : ''}</div></li>`;

  // ---------- Vor der Fahrt: Lage auf den eigenen Wegen und gespeicherte Ziele, über dem Start-Knopf ----------
  // Ziele liegen nur auf dem Gerät. Geprüft wird nur auf Knopfdruck; der Start geht auf etwa 1 km gerundet an den Server.
  const ZIEL_MAX = 8;
  const zielUsed = (z) => z.u || parseInt(String(z.id).slice(1), 36) || 0;   // zuletzt geprüft, sonst angelegt
  const zielOldest = () => settings.ziele.reduce((a, z) => (!a || zielUsed(z) < zielUsed(a) ? z : a), null);
  let pendingPlan = null;
  let vfOpen = false, zielOpen = null, zielEdit = false, ortList = null, ortQ = '', ortMsg = '';
  const zielRes = {};   // Ziel-ID|Verkehrsmittel → { t, data } | { loading } | { error }
  if (!Array.isArray(settings.ziele)) settings.ziele = [];
  const zielFor = (group) => (group === 'auto' || group === 'rad' || group === 'oepnv' || group === 'fuss');
  let zielAb = null, conOpen = 0;   // Bus und Bahn: Start an einer eigenen Haltestelle (sonst Standort), aufgeklappte Verbindung
  const zKey = (z, group) => z.id + '|' + group + (group === 'oepnv' ? '|' + (zielAb || '') : '');
  const hm = (s) => minText(s / 60);
  const hmSay = (s) => { const m = Math.round(s / 60), h = Math.floor(m / 60); return (h ? `${h} Stunde${h === 1 ? '' : 'n'} ` : '') + `${m % 60} Minute${m % 60 === 1 ? '' : 'n'}`; };

  const PLAN_SUB = $('#plan-sub').innerHTML;
  function renderVorfahrt() {
    const el = $('#vorfahrt'), wo = $('#wohin');
    if (!apiBase()) { el.hidden = true; el.innerHTML = ''; wo.innerHTML = ''; return; }
    const group = MODE_GROUP[selectedMode()];
    const wohin = wohinSection(group);
    if (wohin === null) return;   // wird gerade geprüft, zeichnet sich danach neu
    wo.innerHTML = wohin;
    // offenes Ziel: eigene, reduzierte Seite („Weg“): Titel und Untertitel ändern sich, Ziele und Verkehrsmittel treten zurück
    const routeZ = zielOpen && zielOpen !== 'neu' && !zielEdit ? settings.ziele.find((z) => z.id === zielOpen) : null;
    $('#view-plan').classList.toggle('route', !!routeZ);
    $('#h-plan-page').textContent = routeZ ? routeZ.name : 'Wohin?';
    $('#plan-sub').innerHTML = routeZ ? esc(cap(GROUP_WITH[group])) : PLAN_SUB;
    $('#plan-back-t').textContent = routeZ && planFromBest ? 'Weg zum Ziel' : 'Heute';
    drawVfMaps();
    // Bus und Bahn: unter den Kacheln die Abfahrten und die Umleitungen von moBiel
    const rest = !lageOn() ? '' : group === 'oepnv' ? abfahrtSection() + mobielSection() : settings.haltestellen.length ? abfahrtSection() : '';
    el.hidden = !rest; el.innerHTML = rest;
  }
  // Kleine Karte im Zielfenster: Strecke, Start, Ziel und Meldungen; nicht verschiebbar, Tippen öffnet die große Karte
  let vfMaps = [];
  function drawVfMaps() {
    vfMaps.forEach((m) => { try { m.remove(); } catch (e) { /* Behälter schon ersetzt */ } });
    vfMaps = [];
    if (typeof L === 'undefined') return;
    const parse = (str) => (str || '').split(';').map((x) => x.split(',').map(Number)).filter((p) => isFinite(p[0]) && isFinite(p[1]));
    $$('#wohin .vf-map').forEach((el) => {
      const accent = getComputedStyle(el).getPropertyValue('--w-vor-acc').trim() || '#2563a8';   // Blau wie „Wohin?“ und die Navigation
      const route = parse(el.dataset.pts);
      if (route.length < 2) { el.hidden = true; return; }
      const m = L.map(el, { zoomControl: false, attributionControl: true, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      L.polyline(route, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(m);
      L.polyline(route, { color: accent, weight: 5, opacity: 0.95 }).addTo(m);
      const arts = (el.dataset.arts || '').split('|');
      (el.dataset.lines || '').split('|').forEach((x, i) => {
        const p = parse(x); if (!p.length) return;
        const col = LAGE_CLS[arts[i]] === 'red' ? '#d64933' : '#e0a326';
        if (p.length > 1) L.polyline(p, { color: col, weight: 7, opacity: 0.95 }).addTo(m); else L.circleMarker(p[0], { radius: 7, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 }).addTo(m);
      });
      L.circleMarker(route[0], { radius: 7, color: '#fff', weight: 3, fillColor: accent, fillOpacity: 1 }).addTo(m);
      L.circleMarker(route[route.length - 1], { radius: 9, color: '#fff', weight: 3, fillColor: '#15191e', fillOpacity: 1 }).addTo(m);
      m.fitBounds(route, { padding: [18, 18], maxZoom: 16 });
      vfMaps.push(m);
    });
  }
  function wohinSection(group) {
    const can = zielFor(group);
    const chips = settings.ziele.map((z) => `<button type="button" class="vf-chip${zielOpen === z.id ? ' on' : ''}" data-ziel="${z.id}" aria-expanded="${zielOpen === z.id}"${can ? '' : ' disabled'}>${esc(z.name)}</button>`).join('')
      + `<button type="button" class="vf-chip add${zielOpen === 'neu' ? ' on' : ''}" data-ziel="neu" aria-expanded="${zielOpen === 'neu'}"${can ? '' : ' disabled'}>+ Ziel</button>`;
    // offenes Ziel nach einem Wechsel des Verkehrsmittels gleich neu prüfen
    const openZ = can && zielOpen && zielOpen !== 'neu' && !zielEdit ? settings.ziele.find((z) => z.id === zielOpen) : null;
    if (openZ && !zielRes[zKey(openZ, group)]) { checkZiel(openZ); return null; }
    const panel = !can ? ''
      : zielOpen === 'neu' ? zielForm() : zielOpen ? (group === 'oepnv' ? zielPanelOepnv : zielPanel)(settings.ziele.find((z) => z.id === zielOpen), group) : '';
    return `<section class="vf world-vor" aria-labelledby="vf-h"><h3 class="vf-title" id="vf-h">Deine Ziele</h3><div class="vf-chips" role="group" aria-label="Deine Ziele">${chips}</div>${panel}</section>`;
  }
  function zielForm() {
    const list = ortList ? (ortList.length
      ? `<ul class="vf-orte">${ortList.map((o, i) => `<li><button type="button" class="vf-ort" data-ort="${i}"><b>${esc(o.name)}</b>${o.sub ? `<span class="small muted">${esc(o.sub)}</span>` : ''}</button></li>`).join('')}</ul>`
      : '<p class="small muted">Nichts gefunden. Versuch es mit Ort und Straße.</p>') : '';
    return `<div class="vf-panel"><form class="vf-form" data-vf="suche"><label class="sr-only" for="inp-ziel">Ziel: Ort, Adresse oder Einrichtung</label><input id="inp-ziel" type="search" placeholder="Ort, Adresse oder z. B. Uni Bielefeld" autocomplete="off" enterkeyhint="search" value="${esc(ortQ)}"><button class="btn" type="submit">Suchen</button></form>
      ${ortMsg ? `<p class="small muted" role="status">${esc(ortMsg)}</p>` : ''}${list}
      ${settings.ziele.length >= ZIEL_MAX ? `<p class="small muted">Du hast schon ${ZIEL_MAX} Ziele. Ein neues ersetzt „${esc(zielOldest().name)}“, das du am längsten nicht genutzt hast. Ziele löschen: lange auf ein Ziel drücken.</p>` : ''}
      <p class="small muted">${ic('shield')} Für die Prüfung gehen das Ziel und dein ungefährer Standort (auf etwa 1 km gerundet, zu Fuß auf etwa 100 m) an den Flowtown-Server und an HERE. Gespeichert wird dort nichts, deine Ziele bleiben auf dem Handy. Fährst du mit Ziel los, merkt sich die Fahrt nur dessen Namen und die geplante Zeit; die Strecke für die Navigation bleibt nur bis zum Ende der Fahrt im Speicher. Beim Losfahren mit Ziel holt die App die Strecke einmal ab deinem genauen Standort (auf etwa 10 m), damit die Navigation dort beginnt.</p></div>`;
  }
  // Ausweichroute: schneller, oder kaum langsamer und ohne den Stau auf der Strecke
  function altHtml(d) {
    const a = d.alternative, mehr = a.mehr_min != null ? a.mehr_min : Math.round((a.dauer - d.dauer) / 60);
    const zeit = mehr <= -2 ? `etwa ${-mehr} min schneller` : mehr >= 2 ? `etwa ${mehr} min länger` : 'etwa gleich schnell';
    const km = a.km && d.km ? Math.round(a.km - d.km) : 0;
    const bits = [zeit, km >= 2 ? `${km} km mehr` : km <= -2 ? `${-km} km weniger` : '', a.ohne && a.ohne.length ? 'ohne Stau: ' + a.ohne.join(', ') : '', a.stau_min >= 2 ? `dort etwa ${a.stau_min} min Stau` : ''].filter(Boolean);
    return `<div class="vf-alt"><p class="tip">${ic('route')}<span><b>Ausweichroute${a.strassen && a.strassen.length ? ' über ' + esc(a.strassen.join(', ')) : ''}</b>: ${esc(bits.join(' · '))}</span></p>`
      + (a.nav ? `<button type="button" class="btn quiet" data-vf="go-alt">${ic('route')}Ausweichroute fahren</button>` : '') + '</div>';
  }
  // B6: Vorschau der Strecke zum Vorlesen: Länge, Dauer, alle Abbiegungen, Ampeln mit Ton und Treppen (zu Fuß), Meldungen (Auto, Rad)
  function previewText(z, group, r) {
    const d = r.data, alt = group === 'fuss' && r.fuss && altAuto(r.fuss) ? r.fuss.alt : null;
    const raw = alt ? alt.pts : d.nav ? d.nav.pts : null;
    if (!raw) return '';
    const steps = (alt ? stepsFromPath(alt.pts, alt.names) : d.nav.schritte).filter((x) => x.art !== 'arrive' && x.i > 0 && x.i < raw.length);
    const cum = [0];
    for (let k = 1; k < raw.length; k++) cum.push(cum[k - 1] + dist({ lat: raw[k - 1][0], lon: raw[k - 1][1] }, { lat: raw[k][0], lon: raw[k][1] }));
    const total = cum[cum.length - 1], dauer = alt ? alt.m / 1.1 : d.dauer;
    const out = [`Vorschau zu ${z.name}: ${total >= 1000 ? fmtNum(total / 1000, 1) + ' Kilometer' : Math.round(total / 10) * 10 + ' Meter'}, etwa ${hmSay(dauer)}${alt ? ', ohne Stufen' : ''}.`];
    if (steps.length) {
      out.push(steps.length === 1 ? 'Eine Abbiegung.' : `${steps.length} Abbiegungen.`);
      let last = 0;
      steps.slice(0, 8).forEach((st, k) => { const t = navText(st); out.push(`${k ? 'Nach weiteren' : 'Nach'} ${navSayM(Math.max(10, cum[st.i] - last))} ${t.charAt(0).toLowerCase() + t.slice(1)}.`); last = cum[st.i]; });
      if (steps.length > 8) out.push(`Und ${steps.length - 8} weitere.`);
    } else out.push('Ohne Abbiegen.');
    const f = group === 'fuss' && r.fuss && !r.fuss.loading && !r.fuss.error ? (alt ? alt.r : r.fuss) : null;
    if (f) {
      const amp = f.ampeln || [], ton = amp.filter((n) => n[3] === 1).length;
      if (amp.length) out.push(`${amp.length === 1 ? 'Eine Ampel' : amp.length + ' Ampeln'}${ton ? `, davon ${ton} mit Tonsignal` : ', ohne bekanntes Tonsignal'}.`);
      const tr = (f.stellen || []).filter((x) => x.c === 'stufen');
      out.push(tr.length ? `${tr.length === 1 ? 'Eine Treppe' : tr.length + ' Treppen'}${tr[0].name ? ', etwa ' + tr[0].name : ''}.` : 'Keine Treppe bekannt.');
    }
    if (group !== 'fuss' && d.items && d.items.length) out.push(`${d.items.length === 1 ? 'Eine Meldung' : d.items.length + ' Meldungen'} auf der Strecke, zum Beispiel ${d.items[0].titel}.`);
    return out.join(' ');
  }
  // Plan für den besseren Fußweg (eigene Wegsuche): Strecke mit selbst erzeugten Abbiegehinweisen
  function fussAltPlan(z, r) {
    const a = r.fuss.alt, type = settings.access.on ? settings.access.type : 'rollator';
    return { ziel: z.id, name: z.name, lat: z.lat, lon: z.lon, t: Date.now(), dauer: Math.round(a.m / 1.1), basis: Math.round(a.m / 1.1), km: Math.round(a.m / 100) / 10,
      nav: { pts: a.pts, schritte: stepsFromPath(a.pts, a.names) }, lokal: FUSS_PEN[type] ? type : 'rollator', meldungen: [], ohneStufen: true };
  }
  function zielPanel(z, group) {
    if (!z) return '';
    const head = `<div class="vf-phead"><b>${esc(z.name)}</b>${canSpeak ? `<button type="button" class="vf-x vf-say" data-vf="say" aria-label="Vorlesen">${ic('sound')}</button>` : ''}<button type="button" class="btn-link" data-vf="edit">Bearbeiten</button><button type="button" class="vf-x" data-vf="close" aria-label="Schließen">${ic('x')}</button></div>`;
    if (zielEdit) return `<div class="vf-panel">${head}<form class="vf-form" data-vf="rename"><label class="sr-only" for="inp-zielname">Name des Ziels</label><input id="inp-zielname" type="text" maxlength="30" value="${esc(z.name)}"><button class="btn" type="submit">Speichern</button></form><button type="button" class="btn quiet danger-text" data-vf="del">${ic('trash')}Ziel löschen</button></div>`;
    const r = zielRes[zKey(z, group)];
    if (!r || r.loading) return `<div class="vf-panel">${head}<p class="small muted" role="status">Strecke wird geprüft …</p></div>`;
    if (r.error) return `<div class="vf-panel">${head}<p class="small" role="status">${esc(r.error)}</p><button type="button" class="btn quiet" data-vf="again">Noch einmal prüfen</button></div>`;
    const d = r.data, route = d.pts.map((p) => p.join(',')).join(';');
    const verzug = d.dauer - d.basis;
    const sum = `<div class="vf-sum"><b class="vf-dur">${hm(d.dauer)}</b><span class="small muted">${group === 'rad' ? 'mit dem Rad' : group === 'fuss' ? (settings.access.on && WALK_FACTOR[settings.access.type] ? `zu Fuß, in deinem Tempo etwa ${hm(d.dauer * WALK_FACTOR[settings.access.type])}` : 'zu Fuß') : verzug >= 120 ? `heute +${Math.round(verzug / 60)} min Verkehr` : 'kaum Verkehr'} · ${fmtNum(d.km, group === 'fuss' && d.km < 10 ? 1 : 0)} km${r.fallback ? ' · Start: Bielefeld' : ''}</span></div>`;
    // in Fahrtreihenfolge, damit man die Strecke von vorn nach hinten liest
    const items = d.items.slice().sort((a, b) => (a.km != null && b.km != null ? a.km - b.km : 0) || LAGE_RANK[a.art] - LAGE_RANK[b.art]);
    const extra = (it) => (it.art !== 'zaeh' && it.text && it.text.length > 14 && it.text.toLowerCase() !== LAGE_LABEL[it.art].toLowerCase() ? it.text : '');
    const btn = (it) => `<button type="button" class="place" data-peek="l" data-name="${esc(it.titel)}" data-art="${it.art}" data-lines="${(it.segs || [it.pts]).map((l) => l.map((q) => q.join(',')).join(';')).join('|')}" data-pts="${route}">${esc(it.titel)}</button>`;
    const rows = items.length
      ? `<ul class="lg-list">${items.slice(0, 4).map((it) => lageRow(it.art, btn(it), [it.km != null ? `nach ${it.km} km` : '', LAGE_LABEL[it.art], delayText(it.delay), it.richtungText && !/Richtung/.test(it.titel) ? it.richtungText : ''].filter(Boolean).map(esc).join(' · '), extra(it))).join('')}</ul>${items.length > 4 ? `<p class="small muted">und ${items.length - 4} weitere, alle auf der Karte</p>` : ''}`
      : `<p class="vf-line ok">${ic('check')}<span>Keine Meldungen entlang der Strecke</span></p>`;
    const alt = d.alternative ? altHtml(d) : '';
    let bars = '';
    if (d.abfahrt && d.abfahrt.length > 1) {
      const ds = d.abfahrt.map((a) => a.dauer), lo = Math.min(...ds), hi = Math.max(...ds);
      const best = d.abfahrt.find((a) => a.dauer === lo);
      const label = (a) => (a.t ? clock(a.t) : 'jetzt');
      const gain = d.abfahrt[0].dauer - lo;
      const say = `Beste Abfahrt ${best.t ? 'um ' + clock(best.t) : 'jetzt'}, ${hmSay(lo)}. ` + d.abfahrt.map((a) => `${label(a)}: ${hmSay(a.dauer)}`).join(', ') + '.';
      bars = `<h4 class="vf-h4">Wann losfahren?</h4><div class="vf-bars" role="img" aria-label="${esc(say)}">${d.abfahrt.map((a) => `<div class="vf-col${a === best ? ' best' : ''}"><span class="vf-bar" style="height:${Math.round(12 + (hi > lo ? (a.dauer - lo) / (hi - lo) : 0) * 44)}px"></span><span class="vf-v">${hm(a.dauer).replace(' h', '')}</span><span class="vf-t">${label(a)}</span></div>`).join('')}</div>`
        + (best.t && gain >= 300 ? `<p class="tip">${ic('clock')}<span>Um ${clock(best.t)} bist du etwa ${Math.round(gain / 60)} min kürzer unterwegs als jetzt.</span></p>` : '');
    }
    const all = `<button type="button" class="btn quiet" data-peek="l" data-name="${esc(z.name)}" data-art="stau" data-lines="${items.map((it) => (it.segs || [it.pts]).map((l) => l.map((q) => q.join(',')).join(';')).join('|')).join('|')}" data-arts="${items.map((it) => (it.segs || [it.pts]).map(() => it.art).join('|')).join('|')}" data-pts="${route}">${ic('map')}Strecke auf der Karte</button>`;
    const go = `<button type="button" class="btn primary" data-vf="go">${ic('play')}${group === 'fuss' ? 'Losgehen mit Ziel' : 'Fahrt starten mit Ziel'}</button>`
      + (canSpeak && (d.nav || (r.fuss && r.fuss.alt)) ? `<button type="button" class="btn quiet" data-vf="preview">${ic('sound')}Vorschau vorlesen</button>` : '');
    const foot = `<p class="small muted lg-src">Stand ${clock(d.t)} Uhr · ${esc(lageSrc(['HERE'].concat(d.items.some((it) => it.quelle === 'Autobahn GmbH') ? ['Autobahn GmbH'] : [])))} · <button type="button" class="btn-link" data-vf="again">neu prüfen</button></p>`;
    const lines = items.map((it) => (it.segs || [it.pts]).map((l) => l.map((q) => q.join(',')).join(';')).join('|')).join('|');
    const larts = items.map((it) => (it.segs || [it.pts]).map(() => it.art).join('|')).join('|');
    const mini = `<div class="vf-map" data-peek="l" data-name="${esc(z.name)}" data-art="stau" data-lines="${lines}" data-arts="${larts}" data-pts="${route}" role="img" aria-label="Karte der Strecke nach ${esc(z.name)}${items.length ? ', Meldungen farbig' : ''}. Tippen öffnet die große Karte."></div>`;
    const eing = group === 'fuss' && d.eingang ? `<p class="small">${ic('pin')} Der Weg führt zum ${esc(d.eingang.art)}${d.eingang.stufenlos === 'ja' ? ', stufenlos' : d.eingang.stufenlos === 'nein' ? ', mit Stufen' : d.eingang.stufenlos === 'eingeschränkt' ? ', nur eingeschränkt stufenlos' : ''}${d.eingang.automatiktuer === 'ja' ? ', Automatiktür' : ''}. <span class="muted">OpenStreetMap</span></p>` : '';
    // Reihenfolge für die Seite „Weg“: erst Zeit und Start, dann das Wichtigste auf dem Weg, alles andere zum Aufklappen
    const sayBtn = canSpeak ? `<button type="button" class="vf-x vf-say vf-route-say" data-vf="say" aria-label="Vorlesen">${ic('sound')}</button>` : '';
    const more = `<details class="more-box vf-more"${settings.access.on ? ' open' : ''}><summary>${ic('list')}Weitere Angaben</summary>${bars}${group === 'auto' ? prBlock(z, d) + bppBlock(z) : ''}${bfZielBlock(z, group)}${zielHistory(z)}${all}<p class="small muted"><button type="button" class="btn-link" data-vf="edit">Ziel bearbeiten</button></p>${foot}</details>`;
    return `<div class="vf-panel vf-route">${head}<div class="vf-top">${sum}${sayBtn}</div>${go}${mini}${alt}${rows}${eing}${group === 'rad' ? radBlock(r.rad, route) : group === 'fuss' ? fussBlock(r.fuss, route) : ''}${more}</div>`;
  }
  // ---------- Park + Ride und Radverkehrsnetz der Stadt Bielefeld (Open Data) ----------
  let stadt2 = store.get('stadt2', null), stadt2Loading = null, netzGrid = null;
  function loadStadt2() {
    if (!apiBase()) return Promise.resolve(false);
    if (stadt2Loading) return stadt2Loading;
    if (stadt2 && Date.now() - stadt2.geladen < 7 * 864e5) return Promise.resolve(true);
    stadt2Loading = api('/api/stadt-pr-radnetz').then((d) => {
      if (!d.pr || (!d.pr.length && !(d.netz || []).length)) return !!stadt2;
      stadt2 = { geladen: Date.now(), pr: d.pr, netz: d.netz || [] };
      netzGrid = null;
      store.set('stadt2', stadt2);
      return true;
    }).catch(() => false).finally(() => { stadt2Loading = null; });
    return stadt2Loading;
  }
  const netzSegM = (p, a, b) => { const ax = (a[1] - p[1]) * 68500, ay = (a[0] - p[0]) * 111320, dx = (b[1] - a[1]) * 68500, dy = (b[0] - a[0]) * 111320; const l2 = dx * dx + dy * dy; const u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0; return Math.hypot(ax + u * dx, ay + u * dy); };
  // Raster von etwa 200 m: jeder Abschnitt in allen Feldern, die er berührt
  function netzIndex() {
    if (netzGrid || !stadt2 || !stadt2.netz.length) return netzGrid;
    netzGrid = {};
    const add = (p, v) => { const k = Math.floor(p[0] / 0.0018) + '_' + Math.floor(p[1] / 0.0029); const c = netzGrid[k] || (netzGrid[k] = []); if (c[c.length - 1] !== v) c.push(v); };
    stadt2.netz.forEach((l, li) => {
      for (let i = 0; i < l[0].length - 1; i++) {
        const a = l[0][i], b = l[0][i + 1], n = Math.max(1, Math.ceil(netzSegM(a, a, b) / 100));
        for (let k = 0; k <= n; k++) add([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], li * 10000 + i);
      }
    });
    return netzGrid;
  }
  function onNetz(p) {
    const g = netzIndex();
    if (!g) return null;
    const ki = Math.floor(p[0] / 0.0018), kj = Math.floor(p[1] / 0.0029);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const v of g[(ki + a) + '_' + (kj + b)] || []) {
      const l = stadt2.netz[Math.floor(v / 10000)], i = v % 10000;
      if (netzSegM(p, l[0][i], l[0][i + 1]) <= 20) return l;
    }
    return null;
  }
  // Anteil einer Strecke auf dem Radverkehrsnetz der Stadt, Punkte etwa alle 25 m
  function netzShare(pts) {
    if (!netzIndex() || !pts || pts.length < 2) return null;
    let n = 0, on = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], k = Math.max(1, Math.round(netzSegM(a, a, b) / 25));
      for (let j = 0; j < k; j++) { n++; if (onNetz([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k])) on++; }
    }
    return n ? on / n : null;
  }
  // nächste Stadtbahn-Haltestelle zu einem Punkt und ihre Linien (aus dem Fahrplan)
  function tramNear(p, r) {
    if (!fp) return null;
    let best = null, bd = r;
    for (const i of fpStopsNear({ lat: p[0], lon: p[1] }, r, 0)) { const d = dist({ lat: p[0], lon: p[1] }, { lat: fp.stops[i][2], lon: fp.stops[i][3] }); if (d < bd) { bd = d; best = i; } }
    if (best == null) return null;
    if (!fp.tramLines) {
      fp.tramLines = {};
      for (const t of fp.trips) { const rt = fp.routes[t[0]]; if (rt[1] !== 0) continue; for (const si of fp.patterns[t[1]]) (fp.tramLines[si] = fp.tramLines[si] || new Set()).add(rt[0]); }
    }
    const name = fp.stops[best][1].replace(FP_PREFIX, '');
    const lines = new Set();
    for (const si of fp.byName[name] || [best]) for (const l of fp.tramLines[si] || []) lines.add(l);
    return { name, m: bd, lines: Array.from(lines).sort((a, b) => a.localeCompare(b, 'de', { numeric: true })) };
  }
  // Mit dem Auto in die Innenstadt: Park + Ride an der Strecke vorschlagen, weiter mit der Stadtbahn
  const CITY = { lat: 52.0237, lon: 8.5339 };
  function prBlock(z, d) {
    if (!stadt2) { loadStadt2().then((ok) => { if (ok && zielOpen === z.id) renderVorfahrt(); }); return ''; }
    if (!d.pts || d.pts.length < 2 || d.km < 4 || dist(CITY, { lat: z.lat, lon: z.lon }) > 2500) return '';
    let best = null;
    for (const p of stadt2.pr) {
      if (dist({ lat: p[0], lon: p[1] }, { lat: z.lat, lon: z.lon }) < 2000) continue;
      let bd = 800, bi = -1;
      d.pts.forEach((q, i) => { const m = dist({ lat: p[0], lon: p[1] }, { lat: q[0], lon: q[1] }); if (m < bd) { bd = m; bi = i; } });
      if (bi < 0 || bi > d.pts.length * 0.85) continue;
      if (!best || bd < best.m) best = { p, m: bd };
    }
    if (!best) return '';
    if (!fp || fpWrong()) loadFahrplan().then((ok) => { if (ok && zielOpen === z.id) renderVorfahrt(); });
    const p = best.p, st = tramNear([p[0], p[1]], 600);
    const weiter = st ? `weiter mit der Stadtbahn${st.lines.length ? ` (Linie ${esc(st.lines.join(', '))})` : ''} ab ${esc(st.name)}${st.m > 120 ? ` (${fmtLen(st.m)} zu Fuß)` : ''}` : 'weiter mit der Stadtbahn';
    return `<div class="pr-tip"><p><b>${ic('route')}Park + Ride ${esc(p[3])}</b> liegt an deiner Strecke: ${p[2]} Plätze, ${weiter}. Spart die Parkplatzsuche in der Innenstadt.</p>
      <div class="pr-btns">${st ? `<button type="button" class="btn" data-pr-ab="${esc(st.name)}">${ic('tram')}Ab ${esc(st.name)} mit Bus &amp; Bahn planen</button>` : ''}<button type="button" class="btn quiet" data-peek="r" data-name="Park + Ride ${esc(p[3])}" data-meta="Grün: Park + Ride ${esc(p[3])} (${esc(p[4])}), rot: dein Ziel" data-pts="${p[0]},${p[1]};${z.lat},${z.lon}">${ic('map')}Wo genau?</button></div></div>`;
  }
  // Behindertenparkplätze (Stadt Bielefeld und OpenStreetMap): am Ziel mit dem Auto und auf der Karte
  let bpp = store.get('bpp', null), bppLoading = null;
  function loadBpp() {
    if (!apiBase()) return Promise.resolve(false);
    if (bppLoading) return bppLoading;
    if (bpp && Date.now() - bpp.geladen < 12 * 3600e3) return Promise.resolve(true);
    bppLoading = api('/api/behindertenparkplaetze').then((d) => {
      if (!d.plaetze || !d.plaetze.length) return !!bpp;
      bpp = { geladen: Date.now(), quellen: d.quellen || [], plaetze: d.plaetze };
      store.set('bpp', bpp);
      return true;
    }).catch(() => false).finally(() => { bppLoading = null; });
    return bppLoading;
  }
  const bppNear = (lat, lon, r) => (bpp ? bpp.plaetze.map((p) => ({ p, d: dist({ lat, lon }, { lat: p[0], lon: p[1] }) })).filter((x) => x.d <= r).sort((a, b) => a.d - b.d) : []);
  const bppName = (p) => p[3] || 'Behindertenparkplatz';
  const bppSrc = (p) => (p[4] === 's' ? 'Stadt Bielefeld, Amt für Verkehr (Open Data)' : 'OpenStreetMap');
  function bppBlock(z) {
    if (!bpp) { loadBpp().then((ok) => { if (ok && zielOpen === z.id) renderVorfahrt(); }); return ''; }
    const near = bppNear(z.lat, z.lon, 400).slice(0, 3);
    const open = settings.access.on;
    if (!near.length) return open ? `<p class="small muted bpp-none">${ic('access')} Keine Behindertenparkplätze bis 400 m vom Ziel bekannt.</p>` : '';
    const rows = near.map(({ p, d }) => `<li><button type="button" class="place" data-peek="r" data-name="${esc(bppName(p))}" data-meta="Grün: Behindertenparkplatz, rot: dein Ziel (Luftlinie)" data-pts="${p[0]},${p[1]};${z.lat},${z.lon}">${esc(bppName(p))}</button><span class="small muted"> · ${fmtLen(Math.max(10, d))} bis zum Ziel${p[2] ? ` · ${p[2]} ${p[2] === 1 ? 'Platz' : 'Plätze'}` : ''}</span></li>`).join('');
    const src = Array.from(new Set(near.map(({ p }) => bppSrc(p)))).join(', ');
    const body = `<ul class="bpp-list">${rows}</ul><p class="small muted">Quelle: ${esc(src)}. Nur mit Parkausweis (blau, Rollstuhlsymbol).</p>`;
    const title = `${near.length === 1 ? 'Ein Behindertenparkplatz' : near.length + ' Behindertenparkplätze'} in der Nähe`;
    return open ? `<div class="bpp"><h4 class="vf-h4">${ic('access')}${title}</h4>${body}</div>`
      : `<details class="bpp"><summary>${ic('access')}${title}</summary>${body}</details>`;
  }
  // Barrierefrei bei Bus und Bahn: Stadtbahn mit oder ohne Hochbahnsteig laut Liste der Redaktion,
  // sonst stufenlos laut Fahrplan (für Bielefeld meist leer); Aufzüge aus den Wegen im Bauwerk (Fahrplan); Fußwege mit Weg-Check
  const hstNorm = (n) => String(n || '').toLowerCase().replace(/^(bielefeld|bi-[^,]*),\s*/, '').replace(/ß/g, 'ss').replace(/strasse|str\.?/g, 'str').replace(/[^a-z0-9äöü]/g, '');
  let hst = store.get('hst', null), hstLoading = null;
  function loadHst() {
    if (!apiBase()) return Promise.resolve(false);
    if (hstLoading) return hstLoading;
    if (hst && Date.now() - hst.geladen < 3600e3) return Promise.resolve(true);
    hstLoading = api('/api/haltestellen').then((d) => {
      hst = { geladen: Date.now(), map: Object.fromEntries((d.liste || []).map((e) => [e.k, e])) };
      store.set('hst', hst);
      return true;
    }).catch(() => false).finally(() => { hstLoading = null; });
    return hstLoading;
  }
  const hstOf = (name) => (hst && hst.map[hstNorm(name)]) || null;
  // Station mit Aufzug: gleicher Name wie eine Haltestelle in der Nähe, oder höchstens 150 m entfernt
  const liftNear = (p, names) => !!((fp && fp.stationen) || []).find((s) => s[3] > 0 && ((names && names.includes(hstNorm(s[0])) && dist(p, { lat: s[1], lon: s[2] }) <= 400) || dist(p, { lat: s[1], lon: s[2] }) <= 150));
  // ok: 1 stufenlos, 0 nicht stufenlos, 2 teilweise, null unbekannt; e: Eintrag der Liste; aufzug: Station mit Aufzug
  function stopInfo(pos, art) {
    if (!pos || !fp) return null;
    const p = { lat: pos[0], lon: pos[1] };
    const idx = fpStopsNear(p, 80, art === 'bahn' ? 0 : undefined);
    let e = null;
    if (art === 'bahn') for (const i of idx) { e = hstOf(fp.stops[i][1]); if (e) break; }
    let ok = null;
    if (e) ok = e.hbs === 'ja' ? 1 : e.hbs === 'nein' ? 0 : 2;
    else { const w = idx.map((i) => fp.stops[i][4]).filter((v) => v === 1 || v === 2); ok = w.includes(1) ? 1 : w.length ? 0 : null; }
    return { ok, e, aufzug: liftNear(p, idx.map((i) => hstNorm(fp.stops[i][1]))) };
  }
  function stopInfoHtml(s) {
    if (!s) return '';
    const what = s.ok === 1 ? `${bfMark(1)} ${s.e ? 'Hochbahnsteig' : 'stufenlos'}` : s.ok === 0 ? `${bfMark(0)} ${s.e ? 'kein Hochbahnsteig' : 'nicht stufenlos'}` : s.ok === 2 ? '<b class="bf-offen">!</b> nur teilweise stufenlos' : '';
    const parts = (what ? `<span class="con-acc${s.ok === 1 ? ' ok' : ''}">${what}</span>` : '') + (s.aufzug ? ` <span class="con-acc ok">${bfMark(1)} Aufzug</span>` : '');
    return (parts ? ' ' + parts : '') + (s.e && s.e.hinweis && s.ok !== 1 ? `<br><span class="small con-hst">${esc(s.e.hinweis)}</span>` : '');
  }
  const consOf = (d) => (d.verbindungen || []).filter((c) => Date.parse(c.ab) > Date.now() - 60000);
  // schlechtester Wert der Haltestellen einer Verbindung (für Rollstuhl und Rollator)
  function conStufen(c) {
    let bad = false;
    for (const x of c.teile) if (isTransit(x.art)) for (const pos of [x.vonPos, x.nachPos]) { const s = stopInfo(pos, x.art); if (s && s.ok === 0) bad = true; }
    return bad;
  }
  function fussSummary(r, type) {
    const important = FUSS_WEIGHT[type] || FUSS_BAD;
    const parts = r.stellen.filter((x) => important.includes(x.c)).slice(0, 2).map((x) => (x.c === 'stufen' ? 'Stufen' : `${fmtLen(x.m)} ${FUSS_CLS[x.c].label}`));
    if (r.bord && (type === 'rollstuhl' || type === 'rollator')) parts.push(r.bord === 1 ? 'hoher Bordstein' : r.bord + ' hohe Bordsteine');
    const near = r.pts ? hinwNear(r.pts) : [];
    if (near.length) parts.push(HINW[near[0].art] + ' (gemeldet)');
    return { ok: !parts.length, text: parts.join(', ') };
  }
  // Fußwege der aufgeklappten Verbindung prüfen, einmal je Verbindung
  function conCheck(c, z) {
    if (!settings.access.on || c.wcStarted) return;
    c.wcStarted = true;
    const walks = c.teile.filter((x) => x.art === 'fuss' && x.pts && x.pts.length > 1);
    walks.forEach((x) => { x.wc = { loading: true }; });
    Promise.all([loadHinweise().catch(() => null)].concat(walks.map((x) => fussRate(x.pts).then((r) => { x.wc = r || { error: true }; }).catch(() => { x.wc = { error: true }; }))))
      .then(() => { if (zielOpen === z.id) renderVorfahrt(); });
  }
  // Bus und Bahn: die nächsten Verbindungen, ab Standort oder einer eigenen Haltestelle
  const ART_LABEL = { zug: 'rail', bahn: 'tram', bus: '' };
  function zielPanelOepnv(z, group) {
    if (!z) return '';
    if (zielEdit) return zielPanel(z, group);
    const head = `<div class="vf-phead"><b>${esc(z.name)}</b>${canSpeak ? `<button type="button" class="vf-x vf-say" data-vf="say" aria-label="Vorlesen">${ic('sound')}</button>` : ''}<button type="button" class="btn-link" data-vf="edit">Bearbeiten</button><button type="button" class="vf-x" data-vf="close" aria-label="Schließen">${ic('x')}</button></div>`;
    const abList = settings.haltestellen.concat(zielAb && !settings.haltestellen.includes(zielAb) ? [zielAb] : []);
    const abs = abList.length && fp ? `<div class="vf-chips" role="group" aria-label="Start"><span class="small muted">Ab</span>${abList.map((n) => `<button type="button" class="vf-chip${zielAb === n ? ' on' : ''}" data-zab="${esc(n)}" aria-pressed="${zielAb === n}">${esc(n)}</button>`).join('')}<button type="button" class="vf-chip${zielAb ? '' : ' on'}" data-zab="" aria-pressed="${!zielAb}">${ic('pin')}Standort</button></div>` : '';
    const r = zielRes[zKey(z, group)];
    if (!r || r.loading) return `<div class="vf-panel">${head}${abs}<p class="small muted" role="status">Verbindungen werden gesucht …</p></div>`;
    if (r.error) return `<div class="vf-panel">${head}${abs}<p class="small" role="status">${esc(r.error)}</p><button type="button" class="btn quiet" data-vf="again">Noch einmal suchen</button></div>`;
    const d = r.data;
    const cons = consOf(d);
    if (conOpen >= cons.length) conOpen = 0;
    // Rollstuhl und Rollator: die erste Verbindung ohne bekannte Stufen an Haltestellen vorwählen
    const stepFree = settings.access.on && (settings.access.type === 'rollstuhl' || settings.access.type === 'rollator');
    if (!hst && stepFree) loadHst().then((ok) => { if (ok && zielOpen === z.id) renderVorfahrt(); });
    const bad = stepFree ? cons.map(conStufen) : [];
    let pickNote = '';
    if (stepFree && bad.some(Boolean)) {
      const i = bad.indexOf(false);
      if (!r.accPick) { r.accPick = true; if (i > 0) conOpen = i; }
      pickNote = i < 0 ? `<p class="small acc-pick">${bfMark(0)} Alle gefundenen Verbindungen haben eine Stadtbahn-Haltestelle ohne Hochbahnsteig.</p>` : i > 0 ? `<p class="small acc-pick">${bfMark(1)} Vorgewählt: die erste Verbindung ohne bekannte Stufen an Haltestellen.</p>` : '';
    }
    const badge = (x) => `<span class="dep-line${ART_LABEL[x.art] ? ' ' + ART_LABEL[x.art] : ''}">${esc(x.linie || '?')}</span>`;
    const rows = cons.map((c, i) => {
      const dur = (Date.parse(c.an) - Date.parse(c.ab)) / 1000, fahrt = c.teile.filter((x) => x.art !== 'fuss');
      const late = fahrt.some((x) => x.plus) ? ` · <b class="con-late">+${Math.max(...fahrt.map((x) => x.plus || 0))} min</b>` : '';
      if (i === conOpen) conCheck(c, z);
      const acc = settings.access.on;
      const stufe = (pos, art) => (acc ? stopInfoHtml(stopInfo(pos, art)) : '');
      const walkCheck = (x) => {
        if (!acc || !x.pts) return '';
        if (!x.wc || x.wc.loading) return ' · <span class="small muted">wird geprüft …</span>';
        if (x.wc.error) return '';
        const f = fussSummary(x.wc, settings.access.type);
        return ` · ${f.ok ? bfMark(1) + ' keine Hindernisse bekannt' : bfMark(0) + ' ' + esc(f.text)} <button type="button" class="btn-link" data-peek="l" data-name="Fußweg" data-art="alt" data-lines="${x.pts.map((q) => q.join(',')).join(';')}" data-pts="">Karte</button>`;
      };
      const legs = i === conOpen ? `<ol class="con-legs">${c.teile.map((x) => x.art === 'fuss'
        ? `<li class="small muted">${ic('walk')}<span>${Math.max(1, Math.round((Date.parse(x.an) - Date.parse(x.ab)) / 60000))} min zu Fuß${walkCheck(x)}</span></li>`
        : `<li>${badge(x)}<span><b>${clock(x.ab)}</b> ${esc(x.von)}${x.gleis ? `, Gleis ${esc(x.gleis)}` : ''}${x.plus ? ` <b class="con-late">+${x.plus}</b>` : ''}${stufe(x.vonPos, x.art)}<br><span class="small">Richtung ${esc(x.ziel)}</span><br><b>${clock(x.an)}</b> ${esc(x.nach)}${stufe(x.nachPos, x.art)}</span></li>`).join('')}</ol>` : '';
      return `<li><button type="button" class="con${i === conOpen ? ' on' : ''}" data-con="${i}" aria-expanded="${i === conOpen}"><span class="con-t"><b>${clock(c.ab)} → ${clock(c.an)}</b><span class="small">${hm(dur)} · ${c.umstiege ? `${c.umstiege}× umsteigen` : 'direkt'}${late}${bad[i] ? ` · <span class="con-step">${bfMark(0)} Stufen</span>` : ''}</span></span><span class="con-lines">${fahrt.map(badge).join('')}</span></button>${legs}</li>`;
    }).join('');
    const list = rows ? `<ul class="con-list">${rows}</ul>` : '<p class="small">Gerade keine Verbindung gefunden.</p>';
    const go = cons.length ? `<button type="button" class="btn primary" data-vf="go">${ic('play')}Fahrt starten mit Ziel</button>` : '';
    const foot = `<p class="small muted lg-src">Stand ${clock(d.t)} Uhr · © HERE${d.quellen && d.quellen.length ? ', ' + esc(d.quellen.join(', ')) : ''}${r.fallback ? ' · Start: Bielefeld' : ''} · <button type="button" class="btn-link" data-vf="again">neu suchen</button></p>`;
    return `<div class="vf-panel">${head}${abs}${pickNote}${list}${bfZielBlock(z, group)}${zielHistory(z)}${go}${foot}</div>`;
  }
  // Aus deinen Fahrten: frühere Fahrten zu diesem Ziel, nur angekommene
  // Rad: wie gut ist die Strecke für das Rad, und wo fehlt ein Radweg
  const fmtLen = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${fmtNum(m / 1000, 1)} km`);
  function radBlock(r, route) {
    if (!r) return '';
    if (r.loading) return '<p class="small muted" role="status">Radwege entlang der Strecke werden geprüft …</p>';
    if (r.error) return `<p class="small muted">${esc(r.error)}</p>`;
    const known = r.total - r.m.unbekannt;
    const share = netzShare(route.split(';').map((x) => x.split(',').map(Number)));
    if (share == null && !stadt2) loadStadt2();
    const netz = share != null ? `<p class="rad-netz">${ic('bike')}<span>${share >= 0.05 ? `Zu <b>${Math.round(share * 100)} %</b> auf dem Radverkehrsnetz der Stadt` : 'Kaum auf dem Radverkehrsnetz der Stadt'}</span></p>` : '';
    if (known < r.total * 0.3) return `<p class="small muted">Zu dieser Strecke gibt es kaum Angaben zu Radwegen.</p>${netz}`;
    const order = ['gut', 'ruhig', 'mittel', 'schlecht'];
    const pct = (k) => Math.round(r.m[k] / known * 100);
    const good = pct('gut') + pct('ruhig');
    const title = pct('schlecht') >= 20 ? 'Teils ohne Radweg' : good >= 75 ? 'Gut mit dem Rad' : 'Gemischt';
    const say = order.filter((k) => pct(k)).map((k) => `${pct(k)} % ${RAD_CLS[k].kurz}`).join(', ');
    const bar = `<div class="rad-bar" role="img" aria-label="${esc(say)}">${order.map((k) => (r.m[k] ? `<i style="width:${(r.m[k] / known * 100).toFixed(1)}%;background:${RAD_CLS[k].col}"></i>` : '')).join('')}</div>`;
    const legend = `<p class="rad-legend small">${order.filter((k) => pct(k)).map((k) => `<span><i style="background:${RAD_CLS[k].col}"></i>${pct(k)} % ${esc(RAD_CLS[k].kurz)}</span>`).join('')}</p>`;
    const rows = r.ohne.slice(0, 3).map((x) => `<li class="vf-line"><button type="button" class="place" data-peek="l" data-name="${esc(x.name)}" data-art="rad" data-lines="${x.pts.map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';')}" data-pts="${route}">${esc(x.name)}</button><span class="small muted"> · ${fmtLen(x.m)} ohne Radweg</span></li>`).join('');
    return `<div class="rad-rate"><h4 class="vf-h4">${title}</h4>${bar}${legend}${netz}${rows ? `<ul class="rad-ohne">${rows}</ul>` : ''}<p class="small muted">Radwege laut OpenStreetMap, nicht überall vollständig${share != null ? '; Radverkehrsnetz: Stadt Bielefeld' : ''}.</p></div>`;
  }
  function zielHistory(z) {
    const mine = trips.filter((t) => t.plan && t.plan.ziel === z.id && !(t.plan.rest > 2));
    if (!mine.length) return '';
    const diffs = mine.map((t) => (t.end - t.start) - t.plan.dauer * 1000), avgD = avgOf(diffs);
    const sign = (ms) => { const m = Math.round(ms / 60000); return m >= 2 ? `${m} min länger als geplant` : m <= -2 ? `${-m} min schneller als geplant` : 'wie geplant'; };
    let line = mine.length === 1 ? `Einmal gefahren: ${hm((mine[0].end - mine[0].start) / 1000)}, ${sign(diffs[0])}.` : `${mine.length}× gefahren: Ø ${hm(avgOf(mine.map((t) => t.end - t.start)) / 1000)}, im Schnitt ${sign(avgD)}.`;
    // Muster nach Zeitfenster, erst ab vier Fahrten und zwei im selben Fenster
    if (mine.length >= 4) {
      const by = {};
      mine.forEach((t, i) => (by[timeWindow(t.start)] = by[timeWindow(t.start)] || []).push(diffs[i]));
      const worst = Object.keys(by).filter((w) => by[w].length >= 2).map((w) => ({ w, d: avgOf(by[w]) })).sort((a, b) => b.d - a.d)[0];
      if (worst && worst.d - avgD >= 600000) line += ` ${WINDOWS.find((x) => x.id === worst.w).label}: im Schnitt ${Math.round(worst.d / 60000)} min länger als geplant.`;
    }
    return `<div class="vf-hist"><h4 class="vf-h4">Aus deinen Fahrten</h4><p class="small">${esc(line)}</p></div>`;
  }
  let lastStart = null;
  function myStart() {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => { lastStart = [p.coords.latitude, p.coords.longitude]; resolve(lastStart); }, () => resolve(null), { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 });
    });
  }
  // nur außerhalb von Bielefeld (über 25 km vom Jahnplatz): der Standort auf etwa 1 km gerundet, damit „Hauptbahnhof“ den dortigen meint
  async function ortNear() {
    let p = rec && rec.last ? [rec.last.lat, rec.last.lon] : lastStart;
    if (!p) p = await Promise.race([myStart(), new Promise((r) => setTimeout(() => r(null), 2500))]);
    if (!p || dist({ lat: p[0], lon: p[1] }, { lat: 52.0211, lon: 8.5325 }) < 25000) return '';
    return '&near=' + p.map((x) => Math.round(x * 100) / 100).join(',');
  }
  async function checkZiel(z, force) {
    const group = MODE_GROUP[selectedMode()];
    const key = zKey(z, group);
    z.u = Date.now(); store.set('settings', settings);
    const old = zielRes[key];
    if (!force && old && old.data && Date.now() - old.t < 300000) return;
    zielRes[key] = { loading: true };
    renderVorfahrt();
    if (!bfData) loadBf().then(() => { if (zielOpen === z.id && bfNear(z)) renderVorfahrt(); }).catch(() => {});
    if (!faq && settings.access.on) loadFaq().then(() => { if (zielOpen === z.id) renderVorfahrt(); });
    // Bus und Bahn ab einer eigenen Haltestelle: deren Lage ist öffentlich und darf genau mit
    const halt = group === 'oepnv' && zielAb && fp && fp.byName[zielAb] ? fp.stops[fp.byName[zielAb][0]] : null;
    const pos = halt ? [halt[2], halt[3]] : await myStart();
    const from = halt ? pos : (pos || [52.02, 8.53]).map((x) => (group === 'fuss' ? Math.round(x * 1000) / 1000 : Math.round(x * 100) / 100));   // sonst auf etwa 1 km gerundet (zu Fuß auf etwa 100 m), ohne Standort: Bielefeld
    try {
      const data = await api(`/api/ziel?from=${from.join(',')}&to=${z.lat},${z.lon}&mode=${group}${halt ? '&ab=halt' : ''}${group === 'fuss' && settings.access.on ? '&profil=' + settings.access.type : ''}`);
      zielRes[key] = { t: Date.now(), data, fallback: !pos };
      if (group === 'fuss' && data.pts && data.pts.length > 1) {
        const res = zielRes[key];
        res.fuss = { loading: true };
        Promise.all([fussRate(data.pts), settings.access.on ? loadFaq() : null, loadHinweise().catch(() => null)]).then(async ([r]) => {
          res.fuss = r || { error: 'Zu diesem Weg gibt es keine Angaben.' };
          const type = settings.access.on ? settings.access.type : null;
          if (r && FUSS_PEN[type] && fussBad(r, type) > 30) {
            if (zielOpen === z.id) renderVorfahrt();
            const alt = await fussRoute(data.pts[0], data.pts[data.pts.length - 1], type).catch(() => null);
            const mainM = data.km * 1000;
            if (alt && alt.m <= mainM * 1.8 + 300) {
              const ra = await fussRate(alt.pts).catch(() => null);
              if (ra && fussBad(ra, type) < fussBad(r, type) * 0.6) r.alt = { pts: alt.pts, names: alt.names, m: alt.m, plus: alt.m - mainM, r: ra };
            }
            r.altDone = true;
          }
        })
          .catch((e) => { res.fuss = { error: /kennt/.test(e.message) ? 'Für den Weg-Check braucht der Flowtown-Server ein Update.' : 'Der Weg konnte gerade nicht geprüft werden.' }; })
          .then(() => { if (zielOpen === z.id) renderVorfahrt(); });
      }
      if (group === 'rad' && data.pts && data.pts.length > 1) {
        const res = zielRes[key];
        res.rad = { loading: true };
        radRate(data.pts).then((r) => { res.rad = r || { error: 'Zu dieser Strecke gibt es keine Angaben zu Radwegen.' }; })
          .catch(() => { res.rad = { error: 'Die Radwege konnten gerade nicht geprüft werden.' }; })
          .then(() => { if (zielOpen === z.id) renderVorfahrt(); });
      }
    } catch (e) {
      zielRes[key] = { error: e.message === 'Failed to fetch' ? 'Keine Verbindung zum Server.' : e.message };
    }
    if (zielOpen === z.id) renderVorfahrt();
    if (sayAfterZiel === z.id && zielOpen === z.id) { sayAfterZiel = null; setTimeout(() => sayPanel($('#wohin .vf-panel')), 80); }
  }
  async function searchOrt(q) {
    ortQ = q; ortMsg = 'Suche …'; ortList = null; renderVorfahrt();
    await loadBf().catch(() => null);
    // außerhalb von Bielefeld zuerst die Treffer vor Ort, nicht die Orte von Bethel
    const near = await ortNear(), local = /bielefeld/i.test(q) || !near ? bfSearch(q) : [];
    try { ortList = local.concat(((await api('/api/ort?q=' + encodeURIComponent(q) + near)).orte || []).filter((o) => !local.some((l) => dist(l, o) < 80))); ortMsg = ''; }
    catch (e) { ortList = local.length ? local : null; ortMsg = local.length ? '' : e.message; }
    renderVorfahrt();
  }
  function addZiel(o) {
    const z = { id: 'z' + Date.now().toString(36), name: o.name.split(',')[0].slice(0, 30), sub: o.sub || '', lat: o.lat, lon: o.lon, u: Date.now() };
    if (o.bf) z.bf = o.bf;
    while (settings.ziele.length >= ZIEL_MAX) { const old = zielOldest(); settings.ziele = settings.ziele.filter((x) => x !== old); }
    settings.ziele.push(z); store.set('settings', settings);
    ortList = null; ortQ = ''; ortMsg = '';
    zielOpen = z.id; zielEdit = false;
    checkZiel(z);
  }
  // Bedienung: Klicks, Formulare und langes Drücken auf einen Ziel-Chip (öffnet Bearbeiten)
  let pressTimer = null, pressed = false;
  // Ereignisse aus „Wohin fahren?“ (Leiste unter dem Kopf) und aus Abfahrten und Umleitungen (unter den Kacheln)
  const onVf = (type, fn) => ['#wohin', '#vorfahrt'].forEach((id) => $(id).addEventListener(type, fn));
  onVf('pointerdown', (ev) => {
    const c = ev.target.closest('.vf-chip[data-ziel]:not(.add)');
    pressed = false;
    if (!c || c.disabled) return;
    pressTimer = setTimeout(() => { pressed = true; zielOpen = c.dataset.ziel; zielEdit = true; renderVorfahrt(); }, 550);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => onVf(t, () => clearTimeout(pressTimer)));
  onVf('click', (ev) => {
    if (pressed) { pressed = false; ev.preventDefault(); return; }
    const sd = ev.target.closest('[data-say-dep]');
    if (sd && fp) {
      const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), name = sd.dataset.sayDep;
      const list = departures(name, now, 60).slice(0, 5);
      speak(list.length ? `Nächste Abfahrten ${name}: ` + list.map((d) => { const m = d.t - nowMin; return `${d.kind === 0 ? 'Stadtbahn' : d.kind === 2 ? '' : 'Bus'} ${d.line} nach ${d.head}, ${m <= 0 ? 'jetzt' : `in ${m} Minute${m === 1 ? '' : 'n'}`}`; }).join('. ') + '.' : `${name}: in der nächsten Stunde keine Abfahrt.`, { now: true, force: true });
      return;
    }
    const hs = ev.target.closest('[data-hs],[data-hs-add],[data-hs-pick],[data-hs-near],[data-hs-del]');
    if (hs) {
      const d = hs.dataset;
      if (d.hsNear) { nearStops(); return; }
      if (d.hs) hsOpen = d.hs;
      else if (d.hsAdd) { hsAdd = !hsAdd; hsHits = null; }
      else if (d.hsPick) addHaltestelle(d.hsPick);
      else if (d.hsDel) { settings.haltestellen = settings.haltestellen.filter((n) => n !== d.hsDel); store.set('settings', settings); hsOpen = null; }
      renderVorfahrt();
      if (hsAdd && d.hsAdd) { const i = $('#inp-hs'); if (i) i.focus(); }
      return;
    }
    const m = ev.target.closest('[data-mb]:not(form),[data-linie-del],[data-linie-add]');
    if (m) {
      if (m.dataset.linieDel) { settings.linien = settings.linien.filter((l) => l !== m.dataset.linieDel); store.set('settings', settings); }
      else if (m.dataset.linieAdd) { addLinie(m.dataset.linieAdd); mbAdd = false; }
      else if (m.dataset.mb === 'add') mbAdd = !mbAdd;
      else if (m.dataset.mb === 'alle') mbAll = !mbAll;
      renderToday();
      if (mbAdd && m.dataset.mb === 'add') { const i = $('#inp-linie'); if (i) i.focus(); }
      return;
    }
    const c = ev.target.closest('[data-ziel]');
    if (c) {
      const id = c.dataset.ziel;
      zielEdit = false;
      zielOpen = zielOpen === id ? null : id;
      if (zielOpen && id !== 'neu') checkZiel(settings.ziele.find((z) => z.id === id));
      renderVorfahrt();
      if (zielOpen === 'neu') { const i = $('#inp-ziel'); if (i) i.focus(); }
      return;
    }
    const o = ev.target.closest('[data-ort]');
    if (o && ortList) { addZiel(ortList[Number(o.dataset.ort)]); return; }
    const prAb = ev.target.closest('[data-pr-ab]');
    if (prAb) {
      const zz = settings.ziele.find((x) => x.id === zielOpen);
      setModeUI('bahn'); settings.mode = 'bahn'; store.set('settings', settings); applyModeWords('bahn');
      zielAb = prAb.dataset.prAb; conOpen = 0;
      renderToday();   // prüft das offene Ziel mit Bus und Bahn ab der Haltestelle
      if (zz && !zielRes[zKey(zz, 'oepnv')]) checkZiel(zz);
      return;
    }
    const ab = ev.target.closest('[data-zab]');
    if (ab) {
      zielAb = ab.dataset.zab || null; conOpen = 0;
      const zz = settings.ziele.find((x) => x.id === zielOpen);
      if (zz) checkZiel(zz); else renderVorfahrt();
      return;
    }
    const cn = ev.target.closest('[data-con]');
    if (cn) { const i = Number(cn.dataset.con); conOpen = conOpen === i ? -1 : i; renderVorfahrt(); return; }
    const b = ev.target.closest('[data-vf]');
    if (!b) return;
    const z = settings.ziele.find((x) => x.id === zielOpen);
    const act = b.dataset.vf;
    if (act === 'say') { sayPanel(b.closest('.vf-panel')); return; }
    if (act === 'preview' && z) { const r = zielRes[zKey(z, MODE_GROUP[selectedMode()])]; if (r && r.data) { unlockSpeech(); speak(previewText(z, MODE_GROUP[selectedMode()], r), { now: true, force: true }); } return; }
    if (act === 'close') { zielOpen = null; zielEdit = false; }
    else if (act === 'edit') zielEdit = !zielEdit;
    else if (act === 'again' && z) { checkZiel(z, true); return; }
    else if (act === 'go' && z) {
      const r = zielRes[zKey(z, MODE_GROUP[selectedMode()])];
      if (!r || !r.data) return;
      const d = r.data;
      if (d.mode === 'oepnv') {
        // geplant: von jetzt bis zur Ankunft der gewählten Verbindung; aufgezeichnet wird mit dem ersten Verkehrsmittel
        const cs = consOf(d), c = cs[conOpen] || cs[0] || d.verbindungen[0], first = c.teile.find((x) => isTransit(x.art));
        const dauer = Math.max(60, Math.round((Date.parse(c.an) - Date.now()) / 1000));
        pendingPlan = { ziel: z.id, name: z.name, lat: z.lat, lon: z.lon, t: Date.now(), dauer, basis: dauer, km: null, meldungen: [],
          verbindung: c.teile.filter((x) => x.art !== 'fuss').map((x) => `${x.linie} ${clock(x.ab)}`).join(', ') };
        if (first) setModeUI(first.art);
      } else if (d.mode === 'fuss' && r.fuss && altAuto(r.fuss)) pendingPlan = fussAltPlan(z, r);
      else pendingPlan = { ziel: z.id, name: z.name, lat: z.lat, lon: z.lon, t: d.t, dauer: d.abfahrt ? d.abfahrt[0].dauer : d.dauer, basis: d.basis, km: d.km, nav: d.nav || null,
        meldungen: d.items.slice(0, 3).map((it) => ({ titel: it.titel, art: it.art, km: it.km })) };
      zielOpen = null;
      startTrip();
      return;
    }
    else if (act === 'go-fussalt' && z) {
      const r = zielRes[zKey(z, MODE_GROUP[selectedMode()])];
      if (!r || !r.fuss || !r.fuss.alt) return;
      pendingPlan = fussAltPlan(z, r);
      zielOpen = null;
      startTrip();
      return;
    }
    else if (act === 'go-alt' && z) {
      const r = zielRes[zKey(z, MODE_GROUP[selectedMode()])], a = r && r.data && r.data.alternative;
      if (!a || !a.nav) return;
      const ohne = a.ohne || [];
      pendingPlan = { ziel: z.id, name: z.name, lat: z.lat, lon: z.lon, t: r.data.t, dauer: a.dauer, basis: a.dauer, km: a.km, nav: a.nav, via: a.via || null, ausweich: true,
        meldungen: r.data.items.filter((it) => !ohne.includes(it.titel)).slice(0, 3).map((it) => ({ titel: it.titel, art: it.art, km: it.km })) };
      zielOpen = null;
      startTrip();
      return;
    }
    else if (act === 'del' && z) { settings.ziele = settings.ziele.filter((x) => x !== z); store.set('settings', settings); zielOpen = null; zielEdit = false; }
    else return;
    renderVorfahrt();
  });
  onVf('input', (ev) => {
    if (ev.target.id !== 'inp-hs') return;
    hsHits = ev.target.value.trim().length >= 2 ? hsSuggest(ev.target.value) : null;
    const el = $('#hs-hits'); if (el) el.innerHTML = hsHitList();
  });
  // Abfahrten laufen mit der Uhr: jede halbe Minute neu, solange nichts eingegeben wird
  setInterval(() => {
    if (fp && !hsAdd && !mbAdd && heuteOn() && MODE_GROUP[selectedMode()] === 'oepnv' && settings.haltestellen.length) renderVorfahrt();
  }, 30000);
  onVf('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target.closest('[data-vf],[data-mb],[data-hs-form]');
    if (!f) return;
    if (f.dataset.hsForm) { const hits = hsSuggest($('#inp-hs').value); if (hits.length === 1) { addHaltestelle(hits[0]); renderVorfahrt(); } return; }
    if (f.dataset.mb === 'linie') {
      const i = $('#inp-linie');
      if (addLinie(i.value)) { mbAdd = false; renderToday(); } else { i.value = ''; i.placeholder = 'Nur Nummern wie 3, 21 oder N4'; }
      return;
    }
    if (f.dataset.vf === 'suche') { const q = $('#inp-ziel').value.trim(); if (q.length >= 2) searchOrt(q); }
    if (f.dataset.vf === 'rename') {
      const z = settings.ziele.find((x) => x.id === zielOpen), name = $('#inp-zielname').value.trim();
      if (z && name) { z.name = name.slice(0, 30); store.set('settings', settings); }
      zielEdit = false; renderVorfahrt();
    }
  });

  // ---------- Tipps: feste Auswertung auf dem Gerät, noch ohne KI ----------
  const BIKE_KMH = 15, WALK_KMH = 4.8;   // Annahmen für Schätzungen
  const median = (xs) => { const v = xs.slice().sort((x, y) => x - y), m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const dayLabel = (t) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const routePts = (g) => g.trips[0].events.filter((e) => e.signal).map((e) => `${e.lat},${e.lon}`).join(';');
  // Ampeln des Wegs für die kleine Karte: aus den geladenen Ampeldaten, sonst aus der Fahrt selbst
  const routeMapPts = (g) => { const fromSig = g.sig.map((id) => { const c = clusterById[id]; return c ? `${c.lat},${c.lon}` : ''; }).filter(Boolean); return fromSig.length >= 2 ? fromSig.join(';') : routePts(g); };
  const routeName = (g) => `<button type="button" class="place" data-peek="r" data-pts="${routePts(g)}" data-name="${esc(labelFor(g.first))} → ${esc(labelFor(g.last))}">${esc(labelFor(g.first))}<span class="arrow" aria-label="nach">→</span>${esc(labelFor(g.last))}</button>`;

  // Ungewöhnlich lange Wartezeit an einer Ampel in den letzten 7 Tagen, verglichen mit den übrigen Besuchen
  function tipAnomalies(list) {
    const out = anomalyList(list);
    if (!out.length) return null;
    const first = out[0];
    return { prio: 0, icon: 'alert', cls: 'amber', title: 'Auffällige Ampel auf deinem Weg', cat: 'Ampel', num: durText(first.e.wait), act: `<button type="button" class="btn quiet tip-go" data-peek="p" data-name="${esc(labelFor(first.e))}" data-lat="${first.e.lat}" data-lon="${first.e.lon}">${ic('map')}Auf der Karte</button>`,
      short: `${esc(labelFor(first.e))}: ${durText(first.e.wait)} gewartet, sonst Ø ${durText(first.usual)}.`,
      html: `<ul class="facts">${out.slice(0, 3).map((x) => `<li>${ic('light')}<span>${dayLabel(x.e.t)} · ${placeFor(x.e)}</span><b>${durText(x.e.wait)}</b></li>`).join('')}</ul>
        <p class="small muted">Sonst Ø ${out.slice(0, 3).map((x) => durText(x.usual)).join(' bzw. ')}. Baustelle, Sperrung oder Stau?</p>` };
  }
  function anomalyList(list) {
    const since = Date.now() - 7 * 864e5;
    const visits = {};
    for (const t of list) for (const e of t.events) if (e.signal) (visits[e.signal] = visits[e.signal] || []).push({ e, trip: t.id });
    const out = [];
    for (const t of list) {
      if (t.start < since) continue;
      for (const e of t.events) {
        if (e.type !== 'halt' || !e.signal || e.wait < 60000) continue;
        const others = visits[e.signal].filter((v) => v.trip !== t.id && (e.heading == null || v.e.heading == null || angDiff(v.e.heading, e.heading) <= 45))
          .map((v) => (v.e.type === 'halt' ? v.e.wait : 0));
        if (others.length < 3) continue;
        const usual = median(others);
        if (e.wait >= 2 * usual + 30000) out.push({ e, usual });
      }
    }
    return out.sort((x, y) => y.e.t - x.e.t);
  }
  // Wege: beste Abfahrtszeit und andere Verkehrsmittel im Vergleich
  function tipRoutes(list) {
    return findRoutes(list).slice(0, 3).map((g) => {
      const km = avgOf(g.trips.map((t) => t.distance)) / 1000;
      const byMode = {};
      for (const t of g.trips) (byMode[MODE_GROUP[t.mode]] = byMode[MODE_GROUP[t.mode]] || []).push(t);
      const car = byMode.auto || [];
      const carMs = car.length ? avgOf(car.map((t) => t.end - t.start)) : null;
      const rows = [];
      const row = (m, label, ms, est, extra) => rows.push(`<div>${ic(MODE_ICON[m])}<span>${label}${est ? ' <span class="tag-est">geschätzt</span>' : ''}${extra ? `<br><span class="small muted">${extra}</span>` : ''}</span><b>${durText(ms)}</b></div>`);
      if (car.length) {
        const costs = car.map(tripCosts).filter(Boolean);
        const energy = costs.filter((c) => c.energy != null);
        const cost = energy.length ? avgOf(energy.map((c) => c.energy)) : avgOf(costs.map((c) => c.halts));
        row('auto', 'Auto', carMs, false, `davon ${durText(avgOf(car.map(tripWait)))} an Ampeln · ca. ${fmtEuro(cost)} ${energy.length ? 'Sprit oder Strom' : 'fürs Warten'}`);
      }
      if (byMode.oepnv) row('bahn', 'Bus und Bahn', avgOf(byMode.oepnv.map((t) => t.end - t.start)), false, `davon ${durText(avgOf(byMode.oepnv.map(tripWait)))} an Ampeln`);
      let bikeMs = null;
      if (byMode.rad) row('rad', 'Rad', bikeMs = avgOf(byMode.rad.map((t) => t.end - t.start)), false, `davon ${durText(avgOf(byMode.rad.map(tripWait)))} an Ampeln`);
      else if (km <= 15) row('rad', 'Rad', bikeMs = km / BIKE_KMH * 3600000, true, `${fmtNum(km, 1)} km bei ${BIKE_KMH} km/h, ohne Ampeln`);
      if (byMode.fuss) row('fuss', 'Zu Fuß', avgOf(byMode.fuss.map((t) => t.end - t.start)), false);
      else if (km <= 3) row('fuss', 'Zu Fuß', km / WALK_KMH * 3600000, true, `${fmtNum(km, 1)} km bei ${fmtNum(WALK_KMH, 1)} km/h`);
      const bh = car.length ? bestHour(car) : bestHour(g.trips);
      let short = bh.text || '';
      let prio = bh.text ? 1.5 : 2.5;
      // Rad als Alternative zum Auto oder zu Bus und Bahn
      const baseMs = carMs || (byMode.oepnv ? avgOf(byMode.oepnv.map((t) => t.end - t.start)) : null);
      if (baseMs && bikeMs && !byMode.rad && bikeMs <= baseMs * 1.25) {
        short = `Mit dem Rad wärst du auf diesem Weg etwa gleich schnell wie ${carMs ? 'mit dem Auto' : 'mit Bus und Bahn'} (geschätzt).`;
        prio = 1;
      }
      const zEnd = settings.ziele.find((z) => dist(z, g.last) <= 300);
      const act = zEnd ? `<button type="button" class="btn quiet tip-go" data-tipgo="plan" data-z="${zEnd.id}">${ic('route')}${prio === 1 ? 'Mit dem Rad prüfen' : 'Weg zu ' + esc(zEnd.name) + ' prüfen'}</button>`
        : `<button type="button" class="btn quiet tip-go" data-peek="r" data-name="${esc(labelFor(g.first))} → ${esc(labelFor(g.last))}" data-pts="${routeMapPts(g)}">${ic('map')}Auf der Karte</button>`;
      return { prio, act, icon: prio === 1 ? 'bike' : 'route', title: routeName(g), meta: `Dein Weg · ${g.trips.length}× unterwegs`, short: short || `${g.trips.length}× unterwegs auf diesem Weg.`,
        head: prio === 1 ? 'Rad ist gleich schnell' : bh.text ? 'Beste Abfahrtszeit' : 'Dein Weg', cat: prio === 1 ? 'Rad' : 'Weg', num: prio === 1 ? minText(Math.max(1, Math.round(bikeMs / 60000))) : bh.text ? `${bh.best}–${bh.best + 1} Uhr` : `${g.trips.length}×`,
        html: `${bh.text ? `<p class="tip">${ic('bulb')}<span>${bh.text}</span></p>` : ''}${prio === 1 ? `<p class="tip">${ic('bike')}<span>${short}</span></p>` : ''}<div class="alt">${rows.join('')}</div>` };
    });
  }
  function tipTimeEaters(list) {
    const ag = aggregate(list);
    if (!ag.halts) return null;
    const top = ag.approaches.filter((x) => x.halts).sort((x, y) => y.wait - x.wait).slice(0, 3);
    const share = top.reduce((x, y) => x + y.wait, 0) / ag.wait;
    const what = top.length === 1 ? 'eine Ampel' : `${top.length} Ampeln`;
    const tpts = top.map((x) => `${x.sample.lat},${x.sample.lon}`).join(';');
    return { prio: 2, icon: 'hourglass', cls: 'bad', title: 'Wo du Zeit verlierst', cat: 'Ampeln', num: fmtPct(share),
      act: `<button type="button" class="btn quiet tip-go" data-peek="r" data-name="Deine größten Zeitfresser" data-meta="${top.length} Ampeln mit der meisten Wartezeit" data-pts="${tpts}">${ic('map')}Auf der Karte</button>`,
      short: `${fmtPct(share)} deiner Wartezeit an Ampeln entfallen auf ${what}.`,
      html: `<p>${fmtPct(share)} deiner Wartezeit an Ampeln entfallen auf ${what}:</p><ul class="facts">${top.map((x) => { const o = othersAt(x.signal, x.h); return `<li>${ic('light')}<span>${placeFor(x.sample)}${x.h != null ? `<span class="others">Richtung ${esc(dirShort(x.h))}</span>` : ''}${o ? `<span class="others">Andere (${o.n}): ${fmtPct(o.share)} mit Halt, Ø ${durText(o.avg)}</span>` : ''}</span><b>${durText(x.wait)}</b></li>`; }).join('')}</ul>` };
  }
  // Autofahrten: Wartezeit an Ampeln je km nach Zeitfenster
  // Autofahrten: Wartezeit an Ampeln je km je Zeitfenster
  function windowStats(list, minTrips) {
    const per = {};
    for (const t of list) {
      if (t.mode !== 'auto' || t.distance < 1000) continue;
      const w = timeWindow(t.start);
      (per[w] = per[w] || []).push(tripWait(t) / (t.distance / 1000));
    }
    return WINDOWS.filter((w) => per[w.id] && per[w.id].length >= minTrips).map((w) => ({ w, v: avgOf(per[w.id]), n: per[w.id].length }));
  }
  function tipWindows(list) {
    const ws = windowStats(list, 2);
    if (ws.length < 2) return null;
    ws.sort((x, y) => x.v - y.v);
    const best = ws[0], worst = ws[ws.length - 1];
    if (worst.v - best.v < 5000) return null;
    return { prio: 3, icon: 'clock', title: 'Wann es besser fließt', meta: 'Mit dem Auto, Wartezeit je km', cat: 'Zeit', num: '−' + durText(worst.v - best.v),
      act: `<button type="button" class="btn quiet tip-go" data-tipgo="plan">${ic('clock')}Abfahrt planen</button>`,
      short: `${worst.w.label} wartest du je km am längsten, ${best.w.label} am kürzesten.`,
      html: `<ul class="facts">${ws.map((x) => `<li>${ic('clock')}<span>${esc(x.w.label)} <span class="small muted">(${x.n} Fahrten)</span></span><b>${durText(x.v)}</b></li>`).join('')}</ul>` };
  }
  function tipStyle(list) {
    const since = Date.now() - 30 * 864e5;
    const car = list.filter((t) => t.mode === 'auto' && t.start >= since && t.stats);
    const steady = car.map((t) => t.stats.steadyShare).filter((x) => x != null);
    const km = car.reduce((x, t) => x + t.distance, 0) / 1000;
    if (!steady.length || km < 5) return null;
    const share = avgOf(steady), brakes = car.reduce((x, t) => x + (t.stats.brakes || 0), 0) / km * 100;
    if (share >= 0.4 && brakes < 2) return null;
    return { prio: 4, icon: 'wave', title: 'Gleichmäßiger fahren', meta: 'Die letzten 30 Tage', cat: 'Fahrweise', num: fmtPct(share),
      short: `Du fährst zu Ø ${fmtPct(share)} gleichmäßig.`,
      html: `<ul class="facts"><li>${ic('wave')}<span>gleichmäßig gefahren</span><b>${fmtPct(share)}</b></li><li>${ic('alert')}<span>starke Bremsungen je 100 km</span><b>${fmtNum(brakes, 1)}</b></li></ul>
        <p class="small muted">Tipp: früh vom Gas und auf Rot zurollen, oft wird es vorher grün.</p>` };
  }
  function tipCosts(list) {
    const since = Date.now() - 30 * 864e5;
    const cs = list.filter((t) => t.start >= since).map(tripCosts).filter(Boolean);
    if (!cs.length) return null;
    const halts = cs.reduce((x, c) => x + c.halts, 0);
    if (halts < 0.05) return null;
    return { prio: 5, icon: 'euro', cls: 'amber', title: 'Was dich das Warten kostet', meta: 'Die letzten 30 Tage, geschätzt', cat: 'Kosten', num: fmtEuro(halts),
      act: `<button type="button" class="btn quiet tip-go" data-tipgo="stats">${ic('chart')}Im Verlauf ansehen</button>`,
      short: `Ampelhalte kosteten dich etwa ${fmtEuro(halts)}.`,
      html: `<div class="big-line">${ic('euro')}<span><b>${fmtEuro(halts)}</b> für Leerlauf und Anfahren bei ${cs.length} Autofahrt${cs.length === 1 ? '' : 'en'}</span></div>` };
  }
  function tipNews() {
    const ns = myNews();
    if (!ns.length) return null;
    return { prio: -1, icon: 'bell', cls: 'amber', title: 'Meldungen für deine Wege', cat: 'Meldung', num: String(ns.length), short: `${esc(ns[0].titel)}${ns.length > 1 ? ` und ${ns.length - 1} weitere Meldung${ns.length > 2 ? 'en' : ''}` : ''}.`,
      html: `<ul class="ki-list">${ns.map((n) => `<li>${ic('bell')}<span><strong>${esc(n.titel)}</strong>${n.text ? `<br>${esc(n.text)}` : ''}${n.quelle ? `<br><span class="small muted">Quelle: ${esc(n.quelle)}${n.bis ? ` · bis ${esc(n.bis)}` : ''}</span>` : ''}</span></li>`).join('')}</ul>` };
  }
  function computeTips(mode) {
    const list = trips.filter((t) => !t.demo && (!mode || mode === 'alle' || MODE_GROUP[t.mode] === mode));
    const oe = !mode || mode === 'alle' || mode === 'oepnv', rad = !mode || mode === 'alle' || mode === 'rad';
    // zuerst, was den Weg besser macht (Meldungen, anderes Verkehrsmittel, Abfahrt, Umstieg), dann Ampeln, Fahrweise und Kosten
    const BUCKET = { Meldung: 0, Rad: 1, Weg: 1, Linie: 1, Umstieg: 1, Zeit: 2, Ampel: 3, Ampeln: 3, Fahrweise: 4, Kosten: 4 };
    const bk = (x) => (BUCKET[x.cat] != null ? BUCKET[x.cat] : 2);
    return [tipNews(), tipAnomalies(list)].concat(tipRoutes(list), [tipTimeEaters(list), oe ? tipLines(list) : null, oe ? tipTransfers(list) : null, rad ? tipRad(list) : null, tipWindows(list), tipStyle(list), tipCosts(list)])
      .filter(Boolean).sort((x, y) => bk(x) - bk(y) || x.prio - y.prio);
  }
  // ---------- Tipps für Bus und Bahn: Pünktlichkeit je Linie (Abgleich mit dem Fahrplan) und Umstiege ----------
  const lateMin = (h) => (h[2] - h[1]) / 60000;
  function tipLines(list) {
    const by = {};
    for (const t of list) for (const l of t.fahrplan || []) {
      const seen = l.halte.filter((h) => h[2] != null);
      if (seen.length < 2) continue;
      const k = `${l.mode}|${l.linie}`;
      const x = by[k] || (by[k] = { mode: l.mode, linie: l.linie, ziele: {}, dep: [], gain: [], amp: 0, ampN: 0, n: 0 });
      x.n++; x.ziele[l.ziel] = (x.ziele[l.ziel] || 0) + 1;
      x.dep.push(lateMin(seen[0])); x.gain.push(lateMin(seen[seen.length - 1]) - lateMin(seen[0]));
      x.amp += l.amp || 0; x.ampN += l.ampN || 0;
    }
    const lines = Object.values(by).filter((x) => x.n >= 2);
    if (!lines.length) return null;
    lines.forEach((x) => { x.avgDep = avgOf(x.dep); x.avgGain = avgOf(x.gain); x.end = avgOf(x.dep) + avgOf(x.gain); x.p = x.dep.filter((d) => d <= 2).length / x.n; });
    lines.sort((a, b) => b.end - a.end);
    const w = lines[0], who = w.mode === 'bus' ? 'Bus' : w.mode === 'zug' ? 'Zug' : 'Stadtbahn';
    const sgn = (m) => { const r = Math.round(m); return r > 0 ? `+${r} min` : r < 0 ? `−${-r} min` : '±0 min'; };
    const ziel = Object.keys(w.ziele).sort((a, b) => w.ziele[b] - w.ziele[a])[0];
    const late = w.end >= 1.5;
    const short = late ? `${who} ${w.linie} kommt bei dir im Schnitt ${Math.round(w.end)} min später an als im Fahrplan${w.avgGain >= 1 ? `, ${Math.round(w.avgGain) === 1 ? 'eine Minute' : Math.round(w.avgGain) + ' min'} davon unterwegs` : ''}.`
      : `${who} ${w.linie} war auf deinen ${w.n} Fahrten meist pünktlich.`;
    const amp = w.mode !== 'zug' && w.amp >= 60000 ? `<p class="small">An Ampeln stand ${w.mode === 'bus' ? 'der Bus' : 'die Bahn'} dabei zusammen ${durText(w.amp)} (${w.ampN} Halte). Mit Vorrang an Ampeln wäre das Zeit für alle Fahrgäste.</p>` : '';
    return { prio: late ? 2 : 6, icon: w.mode === 'bus' ? 'bus' : 'tram', title: `Linie ${w.linie}`, head: late ? `Linie ${w.linie}: meist ${Math.round(w.end)} min später` : `Linie ${w.linie}: meist pünktlich`,
      meta: `Richtung ${ziel}, ${w.n} Fahrten gemessen`, cat: 'Linie', num: sgn(w.end), short,
      act: `<button type="button" class="btn quiet tip-go" data-tipgo="plan">${ic('clock')}${late ? 'Früher losfahren planen' : 'Abfahrten ansehen'}</button>`,
      html: `<ul class="facts">${lines.slice(0, 4).map((x) => `<li>${ic(x.mode === 'bus' ? 'bus' : 'tram')}<span>${esc(x.linie)} <span class="small muted">(${x.n} Fahrten, ${fmtPct(x.p)} pünktlich ab)</span></span><b>${sgn(x.end)}</b></li>`).join('')}</ul>${amp}<p class="small muted">Abfahrt und Ankunft, wie Flowtown sie gemessen hat, verglichen mit dem Fahrplan (DELFI). Pünktlich heißt hier: höchstens 2 min später.</p>` };
  }
  function tipTransfers(list) {
    const by = {};
    for (const t of list) for (const r of t.transfers || []) {
      if (r.lat == null) continue;
      const k = r.stop || `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
      const x = by[k] || (by[k] = { name: r.stop || 'Umstieg', lat: r.lat, lon: r.lon, w: [], missed: 0 });
      x.w.push(r.wait); if (r.missed) x.missed++;
    }
    const all = Object.values(by);
    if (!all.length) return null;
    all.forEach((x) => { x.avg = avgOf(x.w); });
    const top = all.filter((x) => x.w.length >= 2 || x.missed).sort((a, b) => (b.missed - a.missed) || (b.avg - a.avg))[0];
    if (!top || (top.avg < 4 * 60000 && !top.missed)) return null;
    return { prio: 3, icon: 'walk', title: `Umsteigen: ${top.name}`, head: top.name === 'Umstieg' ? 'Umsteigen auf deinem Weg' : `Umsteigen: ${top.name}`,
      meta: `${top.w.length}× umgestiegen`, cat: 'Umstieg', num: durText(top.avg),
      short: `Du wartest hier im Schnitt ${Math.round(top.avg / 60000)} Minuten${top.missed ? `, ${top.missed === 1 ? 'einmal' : top.missed + '-mal'} den Anschluss verpasst` : ''}. Eine Bahn früher oder später kann den Umstieg sparen.`,
      act: `<button type="button" class="btn quiet tip-go" data-peek="p" data-name="${esc(top.name)}" data-lat="${top.lat}" data-lon="${top.lon}">${ic('map')}Auf der Karte</button><button type="button" class="btn quiet tip-go" data-tipgo="plan">${ic('clock')}Verbindung planen</button>`,
      html: `<ul class="facts">${all.sort((a, b) => b.avg - a.avg).slice(0, 4).map((x) => `<li>${ic('walk')}<span>${esc(x.name)} <span class="small muted">(${x.w.length}×${x.missed ? `, ${x.missed}× verpasst` : ''})</span></span><b>${durText(x.avg)}</b></li>`).join('')}</ul><p class="small muted">„Anschluss verpasst“ markierst du in der Fahrtbilanz.</p>` };
  }
  // ---------- Tipps fürs Rad: Stücke ohne Radweg auf dem Weg zu deinen Zielen ----------
  function tipRad(list) {
    if (!list.some((t) => MODE_GROUP[t.mode] === 'rad') && settings.mode !== 'rad') return null;
    const done = [], todo = [];
    for (const z of settings.ziele.slice(0, 4)) {
      const r = zielRes[zKey(z, 'rad')];
      if (r && r.rad && r.rad.m) done.push({ z, r }); else todo.push(z);
    }
    const bad = done.map(({ z, r }) => ({ z, r, run: r.rad.ohne[0], pct: r.rad.m.schlecht / Math.max(1, r.rad.total - r.rad.m.unbekannt) })).filter((x) => x.run).sort((a, b) => b.run.m - a.run.m)[0];
    if (bad) {
      return { prio: 2, icon: 'bike', title: `Rad zu ${bad.z.name}`, head: `Ohne Radweg: ${bad.run.name}`, meta: `Auf dem Weg zu ${bad.z.name}`, cat: 'Rad', num: fmtLen(bad.run.m),
        short: `Auf dem Weg zu ${bad.z.name} fährst du ${fmtLen(bad.run.m)} ohne Radweg an der ${bad.run.name}. Flowtown zeigt dir, ob es eine ruhigere Strecke gibt.`,
        act: `<button type="button" class="btn quiet tip-go" data-peek="l" data-name="${esc(bad.run.name)}" data-art="rad" data-lines="${bad.run.pts.map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';')}" data-pts="${bad.r.data.pts.map((q) => q.join(',')).join(';')}">${ic('map')}Auf der Karte</button><button type="button" class="btn quiet tip-go" data-tipgo="planrad" data-z="${bad.z.id}">${ic('bike')}Radweg prüfen</button>`,
        html: `<ul class="facts">${done.map(({ z, r }) => `<li>${ic('bike')}<span>${esc(z.name)}</span><b>${fmtPct(1 - r.rad.m.schlecht / Math.max(1, r.rad.total - r.rad.m.unbekannt))} mit Radweg</b></li>`).join('')}</ul><p class="small muted">Radwege laut OpenStreetMap, nicht überall vollständig.</p>` };
    }
    const okR = done.map(({ z, r }) => ({ z, k: r.rad.total - r.rad.m.unbekannt, g: r.rad.m.gut + r.rad.m.ruhig })).filter((x) => x.k > 300).sort((a, b) => b.g / b.k - a.g / a.k)[0];
    if (okR) return { prio: 6, icon: 'bike', title: `Rad zu ${okR.z.name}`, head: `Gut mit dem Rad: ${okR.z.name}`, cat: 'Rad', num: fmtPct(okR.g / okR.k),
      short: `Der Weg zu ${okR.z.name} führt zu ${fmtPct(okR.g / okR.k)} über Radwege oder ruhige Straßen, ohne längere Stücke ohne Radweg.`,
      act: `<button type="button" class="btn quiet tip-go" data-tipgo="planrad" data-z="${okR.z.id}">${ic('bike')}Weg ansehen</button>` };
    if (todo.length && !done.length) {
      const z = todo[0];
      return { prio: 5, icon: 'bike', title: 'Radweg-Check', head: `Radweg-Check: ${z.name}`, cat: 'Rad',
        short: `Wie viel vom Weg zu ${z.name} hat einen Radweg, wo wird es holprig oder eng? Flowtown prüft die Strecke.`,
        act: `<button type="button" class="btn quiet tip-go" data-tipgo="planrad" data-z="${z.id}">${ic('bike')}Radweg prüfen</button>`,
        html: '<p class="small">Die Prüfung nutzt Radwege aus OpenStreetMap und das Radverkehrsnetz der Stadt Bielefeld.</p>' };
    }
    return null;
  }
  // Bus und Bahn: Fahrten mit dem Fahrplan abgleichen, damit die Linien-Tipps Daten haben (einmal je Fahrt)
  function tipsFahrplan() {
    const need = trips.filter((t) => !t.demo && !('fahrplan' in t && t.fpV === 2) && (isTransit(t.mode) || (t.legs || []).some((l) => isTransit(l.mode)))).slice(-25);
    if (!need.length) return;
    if (!fp) { loadFahrplan().then((ok) => { if (ok && !$('#view-tips').hidden) { tipsFahrplan(); renderTips(); } }); return; }
    need.forEach((t) => ensureFahrplan(t));
  }
  // „Lies mir die Tipps vor“: Profil zuerst, dann die drei wichtigsten Tipps
  let tipsSay = [];
  function readTips() {
    unlockSpeech();
    if (!canSpeak) return false;
    const txt = tipsSay.length ? tipsSay.join(' ') : 'Noch keine Tipps für dich. Nach ein paar Fahrten weiß ich mehr.';
    speak(txt, { now: true, force: true });
    return true;
  }
  // ---------- Tipps nach Profil (Barrierefreiheit): aus Fahrten, Zielen und offenen Daten ----------
  const TIP_MODES = [['alle', 'Alle'], ['auto', 'Auto'], ['rad', 'Rad'], ['oepnv', 'Bus & Bahn'], ['fuss', 'Zu Fuß']];
  let tipMode = null;
  function tipModeCounts() {
    const c = {};
    trips.filter((t) => !t.demo).forEach((t) => { const g = MODE_GROUP[t.mode]; if (g) c[g] = (c[g] || 0) + 1; });
    return c;
  }
  const visitedClusters = (list) => {
    const seen = new Map();
    for (const t of list) for (const e of t.events) { const c = e.signal && clusterById[e.signal]; if (c && !seen.has(c.id)) seen.set(c.id, { c, e }); }
    return [...seen.values()];
  };
  const mapBtn = (name, pts, meta) => `<button type="button" class="btn quiet tip-go" data-peek="r" data-name="${esc(name)}"${meta ? ` data-meta="${esc(meta)}"` : ''} data-pts="${pts.map((q) => `${q.lat},${q.lon}`).join(';')}">${ic('map')}Auf der Karte</button>`;
  const niceName = (e) => { const n = labelFor(e); return /\d+[.,]\d{3}/.test(n) ? 'Ampel ohne Namen' : n; };
  function profileTips(list) {
    if (!settings.access.on) return [];
    const type = settings.access.type, out = [];
    const mob = type === 'rollstuhl' || type === 'rollator';
    // 1. zweimal warten an derselben Ampel zu Fuß: die Grünphase reicht nicht für die ganze Straße
    if (mob || type === 'andere' || type === 'ruhe') {
      const by = {};
      for (const t of list) for (const e of t.events) {
        if (e.type !== 'halt' || !e.signal || e.queued || (e.halts || 1) < 2) continue;
        if (!(e.mode === 'fuss' || t.mode === 'fuss')) continue;
        const x = by[e.signal] || (by[e.signal] = { n: 0, e, trips: new Set() });
        x.n++; x.trips.add(t.id);
      }
      const two = Object.values(by).sort((a, b) => b.n - a.n);
      if (two.length) out.push({ icon: 'light', head: `Zweimal warten: ${niceName(two[0].e)}`, text: `${two[0].trips.size === 1 ? 'Auf einem Weg' : `Auf ${two[0].trips.size} Wegen`} musstest du hier mitten auf der Straße ein zweites Mal warten. Die Grünphase reicht nicht für die ganze Querung.${settings.server.wir ? ' Deine Messung zeigt das der Stadt.' : ' Wenn du Fahrten anonym teilst, sieht das auch die Stadt.'}${two.length > 1 ? ` Auch an ${two.length - 1} weiteren Ampel${two.length > 2 ? 'n' : ''}.` : ''}`, act: mapBtn('Zweimal warten', two.slice(0, 5).map((x) => x.e), 'Ampeln, an denen du mitten auf der Straße erneut wartest'), prio: 1 });
    }
    // 2. Haltestellen ohne Hochbahnsteig an deinen Zielen und wo du gewartet hast
    if (mob && fp) {
      const places = settings.ziele.map((z) => ({ lat: z.lat, lon: z.lon, z }));
      for (const t of list) for (const e of t.events) if (e.type === 'halt' && e.atStop) places.push({ lat: e.lat, lon: e.lon });
      const checked = new Set(), bad = [];
      for (const q of places.slice(0, 60)) {
        const idx = fpStopsNear(q, q.z ? 400 : 80, 0);
        for (const i of idx) {
          const name = fp.stops[i][1].replace(FP_PREFIX, '');
          if (checked.has(name)) continue;
          checked.add(name);
          const info = stopInfo([fp.stops[i][2], fp.stops[i][3]], 'bahn');
          if (info && info.ok === 0) bad.push({ name, lat: fp.stops[i][2], lon: fp.stops[i][3], z: q.z });
        }
      }
      if (bad.length) {
        const b = bad[0];
        // nächster stufenloser Einstieg in der Nähe
        let alt = null, ad = 900;
        fp.stops.forEach((st, i) => {
          const d = dist(b, { lat: st[2], lon: st[3] });
          if (d < ad && d > 30 && fp.kindOf && fp.kindOf[i] && fp.kindOf[i].has(0)) { const inf = stopInfo([st[2], st[3]], 'bahn'); if (inf && inf.ok === 1) { ad = d; alt = { name: st[1].replace(FP_PREFIX, ''), d }; } }
        });
        out.push({ icon: 'tram', head: `Kein Hochbahnsteig: ${b.name}`, text: `${b.z ? `Bei deinem Ziel ${b.z.name}` : 'Auf deinen Wegen'} liegt die Haltestelle ${b.name} ohne stufenlosen Einstieg.${alt ? ` Stufenlos geht es an ${alt.name}, etwa ${roundM(alt.d)} m entfernt.` : ''}${bad.length > 1 ? ` Dazu ${bad.length - 1} weitere.` : ''}`, act: mapBtn('Haltestellen ohne Hochbahnsteig', bad.slice(0, 6)), prio: 2 });
      }
    }
    // 3. an deinen Zielen: rollstuhlgerechte Toilette und Behindertenparkplatz
    if (mob && settings.ziele.length) {
      const rows = [];
      for (const z of settings.ziele.slice(0, 4)) {
        const wc = ((bfData && bfData.wc) || []).filter((w) => w[2] === 1).map((w) => ({ w, d: dist(z, { lat: w[0], lon: w[1] }) })).filter((x) => x.d <= 400).sort((a, b) => a.d - b.d)[0];
        const pk = bppNear(z.lat, z.lon, 400)[0];
        if (wc || pk) rows.push(`<b>${esc(z.name)}</b>: ${[wc && `rollstuhlgerechte Toilette ${roundM(wc.d)} m`, pk && `Behindertenparkplatz ${roundM(pk.d)} m`].filter(Boolean).join(', ')}`);
      }
      if (rows.length) out.push({ icon: 'pin', head: 'An deinen Zielen', html: rows.join('<br>'), act: `<button type="button" class="btn quiet tip-go" data-tipgo="mapacc">${ic('map')}Barrierefrei auf der Karte</button>`, prio: 3 });
    }
    // 4. Sehen: Ampeln ohne Tonsignal auf deinen Wegen; Hören: Ampeln mit Vibration
    if (type === 'sehen' || type === 'hoeren') {
      const vis = visitedClusters(list);
      const key = type === 'sehen' ? 'sound' : 'vib', word = type === 'sehen' ? 'Tonsignal' : 'Vibration';
      const yes = vis.filter((x) => accOf(x.c)[key] === 'yes'), no = vis.filter((x) => accOf(x.c)[key] === 'no'), unk = vis.length - yes.length - no.length;
      if (vis.length) out.push({ icon: type === 'sehen' ? 'sound' : 'light', head: `${word} an deinen Ampeln`, prio: 1,
        text: `${yes.length} von ${vis.length} Ampeln auf deinen Wegen haben ${type === 'sehen' ? 'ein Tonsignal' : 'eine Vibration am Taster'}${no.length ? `, ${no.length} nicht${(() => { const nm = [...new Set(no.map((x) => niceName(x.e)))].filter((v) => v !== 'Ampel ohne Namen'); return nm.length && nm.length <= 2 ? ': ' + nm.join(', ') : ''; })()}` : ''}.${unk ? ` Bei ${unk} ist es nicht erfasst. Nach dem nächsten Weg zu Fuß fragt Flowtown kurz nach.` : ''}`,
        act: no.length ? mapBtn(`Ampeln ohne ${word}`, no.slice(0, 8).map((x) => x.c)) : '' });
      if (type === 'sehen') out.push({ icon: 'mic', head: begleitOn() ? 'Begleitmodus ist an' : 'Begleitmodus zu Fuß', prio: 4,
        text: begleitOn() ? 'Zu Fuß kündigt Flowtown Ampeln an, sagt Richtungen als Uhrzeit und warnt bei falscher Richtung. Frag jederzeit: Wo bin ich?' : 'Flowtown kann dich zu Fuß begleiten: Ampeln mit Ausstattung, Richtungen als Uhrzeit, Warnung bei falscher Richtung.',
        act: `<button type="button" class="btn quiet tip-go" data-tipgo="wo">${ic('mic')}Wo bin ich?</button>` });
    }
    // 5. Orte an deinen Zielen laut „Bielefeld barrierefrei erleben“: was für dein Profil passt und was fehlt
    if (bfData && bfData.orte && settings.ziele.length) {
      const chk = BF_CHECK[type] || BF_CHECK.andere, rows = [];
      for (const z of settings.ziele.slice(0, 5)) {
        const o = bfNear(z);
        if (!o) continue;
        const vals = chk.map(([k, label]) => [bfGet(o, k), label]).filter(([v]) => v != null);
        if (!vals.length) continue;
        const yes = vals.filter(([v]) => v === 1).map(([, l]) => l), no = vals.filter(([v]) => v === 0).map(([, l]) => l);
        rows.push({ z, o, yes, no, html: `<b>${esc(z.name)}</b>${o.n && o.n !== z.name ? ` (${esc(o.n)})` : ''}: ${yes.length ? `${bfMark(1)} ${esc(yes.join(', '))}` : ''}${yes.length && no.length ? '; ' : ''}${no.length ? `${bfMark(0)} ${esc(no.join(', '))}` : ''}` });
      }
      if (rows.length) out.push({ icon: 'access', head: rows.length === 1 ? `${rows[0].z.name}: so ist es vor Ort` : 'Deine Ziele: so ist es vor Ort', html: rows.map((r) => r.html).join('<br>'), prio: 2,
        text: rows.map((r) => `${r.z.name}: ${r.yes.length ? 'vorhanden: ' + r.yes.join(', ') : ''}${r.yes.length && r.no.length ? '; ' : ''}${r.no.length ? 'fehlt: ' + r.no.join(', ') : ''}.`).join(' '),
        act: `<button type="button" class="btn quiet tip-go" data-tipgo="plan" data-z="${rows[0].z.id}">${ic('route')}Weg zu ${esc(rows[0].z.name)}</button>` });
    }
    // 6. Einfache Sprache, Ruhe, Hören: was Flowtown unterwegs für dich tut
    if (type === 'lernen') out.push({ icon: 'mic', head: 'Frag einfach: Wo bin ich?', prio: 3,
      text: 'Tippe auf den Knopf oder sag „Wo bin ich?“. Flowtown sagt dir die Straße, die nächste Ampel und die Haltestelle. In kurzen Sätzen.',
      act: `<button type="button" class="btn quiet tip-go" data-tipgo="wo">${ic('mic')}Wo bin ich?</button>` });
    if (type === 'ruhe') out.push({ icon: 'clock', head: 'Mit Ruhe planen', prio: 4,
      text: 'Flowtown zeigt vor der Fahrt Stau, Baustellen und Sperrungen. So weißt du vorher, ob es eng wird, und kannst früher losgehen oder eine Pause einplanen. Im Notfall hilft der rote Knopf oben.',
      act: `<button type="button" class="btn quiet tip-go" data-tipgo="plan">${ic('clock')}Weg planen</button>` });
    if (type === 'hoeren') out.push({ icon: 'info', head: 'Alles auch als Text', prio: 4,
      text: 'Was Flowtown ansagt, steht immer auch auf dem Bildschirm: Ampeln, Haltestellen, Umstiege. Fragen kannst du tippen statt sprechen.',
      act: '' });
    // 7. noch nichts: Ziel speichern, dann gibt es Hinweise
    if (!out.length && !settings.ziele.length) out.push({ icon: 'pin', head: 'Speichere ein Ziel', prio: 9,
      text: 'Mit einem Ziel zeigt Flowtown dir sofort, was es dort gibt: Haltestellen mit oder ohne Stufen, Toiletten, Parkplätze und wie der Ort für dich passt.',
      act: `<button type="button" class="btn quiet tip-go" data-tipgo="plan">${ic('pin')}Ziel speichern</button>` });
    return out.sort((a, b) => a.prio - b.prio);
  }
  // ohne Profil: auf der Tipps-Seite gleich wählen können
  function profPicker() {
    const want = goals().some((g) => g === 'stufenlos' || g === 'blick');
    return `<section class="tip-prof tip-pick" aria-labelledby="tip-pick-h"><h3 id="tip-pick-h">${ic('access')}Tipps für Menschen mit Behinderung</h3><p>${want ? 'Du hast gesagt, dass dir Barrierefreiheit wichtig ist. ' : ''}Wähle dein Profil, dann zeigt Flowtown dir hier Haltestellen ohne Stufen, Ampeln mit Tonsignal, Toiletten und Hinweise an deinen Zielen.</p><button type="button" class="btn" data-profset="1">${ic('access')}Profil wählen</button></section>`;
  }
  const ACC_SHORT = ACCESS_LABEL;
  // ohne Fahrten: schon jetzt etwas zu den Zielen, aus der Verkehrslage
  function zielTips() {
    if (!settings.ziele.length || !lageCache) return [];
    const out = [];
    for (const z of settings.ziele.slice(0, 4)) {
      const it = (lageCache.items || []).find((x) => Array.isArray(x.pts) && x.pts.some((q) => dist(z, { lat: q[0], lon: q[1] }) <= 300));
      if (it) out.push({ icon: 'alert', head: `${cap(LAGE_LABEL[it.art] || 'Meldung')} bei ${z.name}`, text: it.titel || it.text || '', act: `<button type="button" class="btn quiet tip-go" data-tipgo="plan" data-z="${z.id}">${ic('route')}Weg prüfen</button>` });
    }
    return out;
  }
  // Tipps: je Tipp eine Zeile mit Titel, einem Satz und der Wirkung als Marke; Einzelheiten beim Antippen
  let tipOpen = null;
  // Farben der Tipps: blau, was beim Planen hilft (Weg, Zeit, Alternativen); grün, was Ampeln und Fahrweise betrifft
  const TIP_WORLD = { Linie: 'plan', Umstieg: 'plan', Ampeln: 'red', Ampel: 'hist', Kosten: 'red', Meldung: 'hist', Weg: 'plan', Rad: 'plan', Zeit: 'plan', Fahrweise: 'go' };
  function renderTips() {
    const counts = tipModeCounts(), used = Object.keys(counts);
    if (!tipMode || (tipMode !== 'alle' && !counts[tipMode])) tipMode = used.length > 1 ? used.sort((a, b) => counts[b] - counts[a])[0] : 'alle';
    const tips = computeTips(tipMode);
    const n = trips.filter((t) => !t.demo).length;
    const real = trips.filter((t) => !t.demo);
    const prof = profileTips(real), zt = n ? [] : zielTips();
    const easy = settings.access.on && settings.access.type === 'lernen';
    $('#tips-small').textContent = tips.length ? `${tips.length} für dich, aus ${n} Fahrt${n === 1 ? '' : 'en'}. Tippe für Einzelheiten.` : n ? 'Mit diesem Verkehrsmittel noch zu wenig Fahrten.' : 'Noch keine Fahrten. Schon jetzt für dich:';
    const card = (x, i) => `<div class="tipcard${i === 0 ? ' tip-top' : ''}" data-world="${TIP_WORLD[x.cat] || 'tip'}"><button type="button" class="tip-row" data-tip="${i}" aria-expanded="${tipOpen === i}"><span class="tip-ic">${ic(x.icon)}</span><span class="tip-main">${i === 0 && tips.length > 1 ? '<em class="tip-kick">Wichtigster Tipp</em>' : ''}<b>${x.head || plain(x.title)}</b><span>${plain(x.short)}</span></span>${x.num ? `<span class="tip-num">${x.num}</span>` : ''}</button>${tipOpen === i ? `<div class="tip-detail">${x.html}</div>` : ''}${x.act ? `<div class="tip-act">${x.act}</div>` : ''}</div>`;
    const pcard = (x) => `<div class="prof-tip"><span class="prof-ic">${ic(x.icon)}</span><div><b>${esc(x.head)}</b><p>${x.html || esc(x.text || '')}</p>${x.act ? `<div class="tip-act">${x.act}</div>` : ''}</div></div>`;
    const news = '';   // Meldungen erscheinen nur, wenn es welche für die eigenen Wege gibt
    const sw = used.length > 1 ? `<div class="seg pill tip-modes" role="group" aria-label="Tipps nach Verkehrsmittel">${TIP_MODES.filter(([k]) => k === 'alle' || counts[k]).map(([k, l]) => `<button type="button" data-tipmode="${k}" aria-pressed="${tipMode === k}">${l}</button>`).join('')}</div>` : '';
    const pickTop = !settings.access.on && goals().some((g) => g === 'stufenlos' || g === 'blick');
    const profBox = !settings.access.on ? (pickTop ? profPicker() : '') : `<section class="tip-prof" aria-labelledby="tip-prof-h"><h3 id="tip-prof-h">${ic('access')}Für dich: ${esc(ACCESS_LABEL[settings.access.type])}</h3>${prof.length ? prof.slice(0, easy ? 2 : 4).map(pcard).join('') : `<p class="small">Sobald du Wege mit Flowtown gemacht oder Ziele gespeichert hast, stehen hier Hinweise für dein Profil: Hindernisse, Haltestellen, Ampeln.</p>`}</section>`;
    const top = easy ? 3 : 3, first = tips.slice(0, top), rest = easy ? [] : tips.slice(top);
    const say = (h, t) => `${plain(h)}. ${plain(t || '')}`.replace(/\s+/g, ' ').trim();
    tipsSay = (settings.access.on ? prof.slice(0, easy ? 2 : 4).map((x) => say(x.head, x.text || x.html)) : []).concat(first.map((x) => say(x.head || x.title, x.short)), n ? [] : zt.map((x) => say(x.head, x.text)));
    const readBtn = canSpeak && tipsSay.length ? `<button type="button" class="btn quiet tip-go tip-read" data-tipgo="read">${ic('sound')}Lies mir die Tipps vor</button>` : '';
    $('#tips-body').innerHTML = readBtn + profBox + sw + (tips.length ? `<h3 class="eyebrow">Für deine Wege</h3>${first.map(card).join('')}${rest.length ? `<details class="more-box tip-more"${tipOpen != null && tipOpen >= top ? ' open' : ''}><summary>${ic('list')}Weitere Tipps (${rest.length})</summary><div class="tip-list">${rest.map((x, j) => card(x, j + top)).join('')}</div></details>` : ''}`
      : zt.length ? `<h3 class="eyebrow">Schon jetzt für deine Ziele</h3><section class="tip-prof plain">${zt.map(pcard).join('')}</section>`
      : n && tipMode !== 'alle' ? `<p class="lead-text">${cap(GROUP_WITH[tipMode] || 'damit')} hat Flowtown noch keine eigenen Tipps für dich. Nach ein paar weiteren Fahrten stehen hier Alternativen, Hindernisse und die beste Abfahrt.</p>`
      : `<p class="lead-text">Nach ein paar Fahrten auf deinen üblichen Wegen steht hier, womit du am besten hinkommst, die beste Abfahrt, Ausweichwege und Hindernisse auf deinen Wegen.</p>`)
      + (!settings.access.on && !pickTop ? profPicker() : '')
      + (() => { const f = faqCards(), k = kiCard(); return (f ? `<div class="tip-acc">${f}</div>` : '') + (k ? `<div class="tip-help"><h3 class="eyebrow">Mehr Hilfe</h3>${k}</div>` : ''); })() + news;
    if (settings.access.on && !faq) loadFaq().then(() => { if (faq && !$('#view-tips').hidden) renderTips(); });
    if (tipMode === 'alle' || tipMode === 'oepnv') tipsFahrplan();
    const mobP = ['rollstuhl', 'rollator'].includes(settings.access.type);
    if (settings.access.on && !tipsProfLoading && (!bfData || (mobP && (!bpp || !fp)))) {
      tipsProfLoading = true;
      Promise.allSettled([bpp || !mobP ? 0 : loadBpp(), bfData ? 0 : loadBf(), fp || !mobP ? 0 : loadFahrplan()]).then((r) => { if (r.some((x) => x.value) && !$('#view-tips').hidden) renderTips(); });
    }
    requestNames([].concat(...trips.map((t) => t.events.filter((e) => e.signal))), () => { if (!$('#view-tips').hidden) renderTips(); });
    // Werte anderer und Meldungen nachladen, dann einmal neu zeichnen
    if (!tipsLoading && apiBase() && (Date.now() - newsAt > 600000 || (settings.server.wir && Date.now() - wirAt > 600000))) {
      tipsLoading = true;
      Promise.all([loadNews(), loadWir()]).then(() => { if (!$('#view-tips').hidden) renderTips(); }).finally(() => { tipsLoading = false; });
    }
  }
  let tipsLoading = false, tipsProfLoading = false;
  // ---------- KI-Einschätzung ----------
  const kiState = { busy: false, error: '', result: store.get('ki', null) };
  // Ampelnamen im KI-Text antippbar machen: nur genaue Treffer, längste Namen zuerst
  function kiLinker() {
    const known = {};
    for (const t of trips) if (!t.demo) for (const e of t.events) if (e.signal) { const n = labelFor(e); if (n.length >= 6 && !known[n]) known[n] = e; }
    const namesSorted = Object.keys(known).sort((x, y) => y.length - x.length);
    return (text) => {
      let out = esc(text);
      const slots = [];
      for (const n of namesSorted) {
        const en = esc(n);
        if (out.indexOf(en) < 0) continue;
        out = out.split(en).join(`\u0000${slots.length}\u0000`);
        slots.push(placeBtn(n, known[n].lat, known[n].lon));
      }
      return out.replace(/\u0000(\d+)\u0000/g, (m, i) => slots[Number(i)]);
    };
  }
  // wofür eine Einschätzung gilt: Verkehrsmittel und Profil
  const kiFor = (mode) => [mode && mode !== 'alle' ? cap(GROUP_WITH[mode]) : 'Alle Wege', settings.access.on ? ACCESS_LABEL[settings.access.type] : ''].filter(Boolean).join(' · ');
  function kiCard() {
    if (!apiBase()) return '';
    if (!settings.server.ki) return `<div class="card">${cardHead('spark', 'KI-Einschätzung', 'Mistral, EU')}<p class="small muted">Unter „Mehr“ erlauben, dann gibt es persönliche Empfehlungen.</p></div>`;
    const r = kiState.result;
    const L2 = kiLinker();
    const forNow = kiFor(tipMode || 'alle'), stale = r && (r.fuer || 'Alle Wege') !== forNow;
    const body = r ? `<p class="ki-for small">${ic('spark')}Für: ${esc(r.fuer || 'Alle Wege')}</p><p>${L2(r.einschaetzung)}</p>${r.groesster_hebel ? `<p class="tip">${ic('spark')}<span><strong>Größter Hebel:</strong> ${L2(r.groesster_hebel)}</span></p>` : ''}<ul class="ki-list">${r.empfehlungen.map((e) => `<li>${ic('bulb')}<span><strong>${L2(e.titel)}</strong><br>${L2(e.text)}</span></li>`).join('')}</ul>
      <p class="small muted">${esc(r.modell || 'Mistral')} · ${esc(dayLabel(r.t))} · KI kann sich irren</p>` : '<p class="small muted">Persönliche Einschätzung aus deinen Werten.</p>';
    return `<div class="card">${cardHead('spark', 'KI-Einschätzung', 'Mistral, EU')}${body}${kiState.error ? `<p class="msg warn">${esc(kiState.error)}</p>` : ''}
      <button type="button" class="btn${r && !stale ? '' : ' primary'}" id="btn-ki" ${kiState.busy ? 'disabled' : ''}>${ic('spark')}${kiState.busy ? 'Einschätzung wird erstellt …' : stale ? `Neu einschätzen für ${esc(forNow)}` : r ? 'Neu einschätzen' : `Einschätzung holen${forNow !== 'Alle Wege' ? ': ' + esc(forNow) : ''}`}</button></div>`;
  }
  // Zusammengefasste Werte für die KI: keine Koordinaten, keine Uhrzeiten einzelner Fahrten, keine Start- und Zielorte
  function kiFacts(mode) {
    const list = trips.filter((t) => !t.demo && (!mode || mode === 'alle' || MODE_GROUP[t.mode] === mode));
    const since = Date.now() - 30 * 864e5;
    const recent = list.filter((t) => t.start >= since);
    const s = (ms) => Math.round(ms / 1000);
    const groups = {};
    for (const t of recent) {
      const g = groups[MODE_GROUP[t.mode]] || (groups[MODE_GROUP[t.mode]] = { fahrten: 0, km: 0, warten_an_ampeln_s: 0, halte_an_ampeln: 0 });
      g.fahrten++; g.km += t.distance / 1000; g.warten_an_ampeln_s += s(tripWait(t)); g.halte_an_ampeln += t.events.filter((e) => e.type === 'halt' && e.signal).length;
    }
    for (const g of Object.values(groups)) g.km = Math.round(g.km * 10) / 10;
    const ag = aggregate(list);
    // wie belastbar ein Wert ist, nach Zahl der Fahrten dahinter
    const sure = (n) => (n >= 6 ? 'hoch' : n >= 3 ? 'mittel' : 'niedrig (erster Eindruck)');
    const minWeek = (ms, perWeek) => Math.round(ms * perWeek / 6000) / 10;
    const ersparnisse = [];
    const zeitfresser = ag.approaches.filter((x) => x.halts).sort((x, y) => y.wait - x.wait).slice(0, 5).map((x) => {
      const o = othersAt(x.signal, x.h);
      return { ampel: labelFor(x.sample), richtung: x.h != null ? dirShort(x.h) : null, vorbeigekommen: x.halts + x.passes, gehalten: x.halts, warten_gesamt_s: s(x.wait),
        sicherheit: sure(x.halts + x.passes),
        andere: o ? { personen: o.n, anteil_mit_halt: Math.round(o.share * 100) / 100, warten_je_halt_s: s(o.avg) } : undefined };
    });
    const wege = findRoutes(list).slice(0, 3).map((g) => {
      const byMode = {};
      for (const t of g.trips) (byMode[MODE_GROUP[t.mode]] = byMode[MODE_GROUP[t.mode]] || []).push(t);
      const km = avgOf(g.trips.map((t) => t.distance)) / 1000;
      const out = { von: labelFor(g.first), nach: labelFor(g.last), km: Math.round(km * 10) / 10, gemessen: {} };
      for (const m of Object.keys(byMode)) out.gemessen[m] = { fahrten: byMode[m].length, dauer_min: Math.round(avgOf(byMode[m].map((t) => t.end - t.start)) / 6000) / 10, warten_an_ampeln_s: s(avgOf(byMode[m].map(tripWait))) };
      if (!byMode.rad && km <= 15) { out.rad_geschaetzt_min_ohne_ampeln = Math.round(km / BIKE_KMH * 600) / 10; out.rad_ampeln_unbekannt = true; }
      if (!byMode.fuss && km <= 3) out.zu_fuss_geschaetzt_min = Math.round(km / WALK_KMH * 600) / 10;
      const bh = bestHour(byMode.auto || g.trips);
      if (bh.text) out.beste_abfahrt = { stunde: bh.best, warten_s: s(bh.bestAvg), sonst_s: s(bh.ref) };
      // wie oft und wann: Abfahrten je Stunde mit Ø Wartezeit an Ampeln
      const inMonth = g.trips.filter((t) => t.start >= since).length;
      const perWeek = inMonth / (30 / 7);
      out.fahrten_pro_woche = Math.round(perWeek * 10) / 10;
      // Ersparnisse rechnet die App selbst, die KI wählt nur aus
      const name = `${out.von} → ${out.nach}`;
      if (bh.text) {
        const base = byMode.auto || g.trips;
        const nBest = base.filter((t) => new Date(t.start).getHours() === bh.best).length;
        ersparnisse.push({ weg: name, was: `Abfahrt zwischen ${bh.best} und ${bh.best + 1} Uhr`, je_fahrt_s: s(bh.ref - bh.bestAvg),
          minuten_pro_woche: minWeek(bh.ref - bh.bestAvg, perWeek), sicherheit: sure(Math.min(nBest, base.length - nBest)) });
      }
      const ownMs = byMode.auto ? avgOf(byMode.auto.map((t) => t.end - t.start)) : byMode.oepnv ? avgOf(byMode.oepnv.map((t) => t.end - t.start)) : null;
      if (ownMs && out.rad_geschaetzt_min_ohne_ampeln) {
        const diff = ownMs - out.rad_geschaetzt_min_ohne_ampeln * 60000;
        ersparnisse.push({ weg: name, was: `Rad statt ${byMode.auto ? 'Auto' : 'Bus und Bahn'}`, je_fahrt_s: s(diff), minuten_pro_woche: minWeek(diff, perWeek),
          sicherheit: 'niedrig (Rad nur geschätzt, ohne Ampeln)', hinweis: Math.abs(diff) < 60000 ? 'etwa gleich schnell' : diff < 0 ? 'mit dem Rad langsamer' : 'mit dem Rad schneller' });
      }
      const hours = {};
      for (const t of g.trips) { const h = new Date(t.start).getHours(); (hours[h] = hours[h] || []).push(tripWait(t)); }
      out.abfahrten = Object.keys(hours).map(Number).sort((x, y) => x - y).map((h) => ({ stunde: h, fahrten: hours[h].length, warten_an_ampeln_s: s(avgOf(hours[h])) }));
      return out;
    });
    const plain = (x) => String(x).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const car = recent.filter((t) => t.mode === 'auto' && t.stats);
    const steady = car.map((t) => t.stats.steadyShare).filter((x) => x != null);
    const carKm = car.reduce((x, t) => x + t.distance, 0) / 1000;
    const costs = recent.map(tripCosts).filter(Boolean);
    const trs = recent.reduce((x, t) => x.concat(t.transfers || []), []);
    return {
      zeitraum: 'letzte 30 Tage', profil_barrierefrei: settings.access.on ? ACCESS_LABEL[settings.access.type] : null,
      verkehrsmittel: groups, zeitfresser, wege,
      auto_warten_je_km_nach_zeitfenster: windowStats(list, 1).map((x) => ({ zeitfenster: x.w.label, fahrten: x.n, warten_je_km_s: s(x.v) })),
      auffaelligkeiten_7_tage: anomalyList(list).slice(0, 5).map((x) => ({ tag: dayLabel(x.e.t), ampel: labelFor(x.e), warten_s: s(x.e.wait), sonst_s: s(x.usual) })),
      fokus_verkehrsmittel: mode && mode !== 'alle' ? GROUP_WITH[mode] : null,
      barrierefrei_hinweise: settings.access.on ? profileTips(list).slice(0, 5).map((x) => plain(x.head) + ': ' + plain(x.text || x.html || '')) : null,
      app_hinweise: computeTips(mode).filter((x) => x.icon !== 'bell').map((x) => plain(x.title) + ': ' + plain(x.short)),
      fahrweise_auto: steady.length ? { gleichmaessig_anteil: Math.round(avgOf(steady) * 100) / 100, starke_bremsungen_je_100km: carKm ? Math.round(car.reduce((x, t) => x + (t.stats.brakes || 0), 0) / carKm * 1000) / 10 : null } : null,
      kosten_ampelhalte_eur_geschaetzt: costs.length ? Math.round(costs.reduce((x, c) => x + c.halts, 0) * 100) / 100 : null,
      moegliche_ersparnisse: ersparnisse,
      umstiege: trs.length ? { anzahl: trs.length, warten_je_umstieg_s: s(avgOf(trs.map((r) => r.wait))), anschluss_verpasst: trs.filter((r) => r.missed).length } : null
    };
  }
  async function runKi() {
    kiState.busy = true; kiState.error = ''; renderTips();
    try {
      await loadWir();
      const mode = tipMode || 'alle';
      const r = await postJson('/api/ki', { facts: kiFacts(mode) });
      kiState.result = Object.assign({ t: Date.now(), fuer: kiFor(mode) }, r);
      store.set('ki', kiState.result);
    } catch (e) {
      kiState.error = 'Die Einschätzung hat nicht geklappt: ' + e.message;
    }
    kiState.busy = false;
    if (!$('#view-tips').hidden) renderTips();
  }

  // ---------- Zeitleiste: Fahrten nach Tagen und Uhrzeiten ----------
  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function dayTitle(ts) {
    const diff = Math.round((dayStart(Date.now()) - ts) / 864e5);
    const label = new Date(ts).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    return diff === 0 ? `Heute · ${label}` : diff === 1 ? `Gestern · ${label}` : label;
  }
  // Wohin die Zeit einer Fahrt ging: fahren, Ampel, langsam oder Stau, Haltestelle
  function tripBar(t, wait) {
    const dur = Math.max(1, (t.end || t.start) - t.start);
    const stop = t.events.reduce((a, e) => a + (e.type === 'halt' && e.atStop ? e.wait : 0), 0);
    const slow = t.mode === 'fuss' ? 0 : Math.max(0, slowMs(t) - wait - stop);
    const pc = (x) => Math.min(100, x / dur * 100).toFixed(1) + '%';
    return `<span class="tbar" aria-hidden="true"><i class="drive" style="width:${pc(Math.max(0, dur - wait - stop - slow))}"></i><i class="stop" style="width:${pc(stop)}"></i><i class="slow" style="width:${pc(slow)}"></i><i class="amp" style="width:${pc(wait)}"></i></span>`;
  }
  // „Auto → Zu Fuß → Stadtbahn“; ohne Abschnitte nur das Verkehrsmittel
  function legChain(t) {
    const ms = (t.legs && t.legs.length > 1 ? t.legs.map((l) => l.mode) : [t.mode]).filter((m, i, a) => i === 0 || m !== a[i - 1]);
    return ms.map((m) => (MODES[m] ? MODES[m].label : m)).join(' → ');
  }
  // Eine Zeile je Fahrt: Uhrzeit, Verkehrsmittel, Ziel, Dauer und Strecke, rechts nur die Wartezeit an Ampeln
  function tripRow(t) {
    const h = t.events.filter((e) => e.type === 'halt' && e.signal);
    const wait = h.reduce((x, e) => x + e.wait, 0);
    const time = new Date(t.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const trs = (t.transfers || []).length;
    const pill = h.length ? `<span class="pill ${wait > 60000 ? 'red' : 'amber'}">${ic('hourglass')}${fmtDur(wait)}<span class="sr-only"> Wartezeit an ${h.length} Ampel${h.length === 1 ? '' : 'n'}</span></span>` : `<span class="pill green">${ic('check')}<span class="sr-only">Ohne Ampelhalt</span></span>`;
    return `<li><button type="button" class="trow" data-review="${t.id}">
      <span class="t-time">${time}</span>
      <span class="chip sm">${ic(MODE_ICON[t.mode] || 'route')}</span>
      <span class="t-main"><b>${legChain(t)}${t.demo ? ' <span class="badge">Demo</span>' : ''}</b>${t.plan ? `<span class="t-dest">${esc(t.plan.name)}</span>` : ''}<span class="t-sub">${minText(Math.max(1, Math.round(((t.end || t.start) - t.start) / 60000)))} · ${fmtNum(t.distance / 1000, 1)} km${trs ? ` · ${trs} Umstieg${trs === 1 ? '' : 'e'}` : ''}</span></span>
      <span class="t-pills">${pill}</span>
      ${ic('chevron', 't-go')}
    </button></li>`;
  }
  function tripTimeline(list, maxRows) {
    const sorted = list.slice().sort((x, y) => y.start - x.start).slice(0, maxRows || 1e9);
    const days = [];
    for (const t of sorted) { const k = dayStart(t.start); const d = days[days.length - 1]; if (d && d.k === k) d.trips.push(t); else days.push({ k, trips: [t] }); }
    return days.map((d) => `<div class="day"><h4 class="day-title">${dayTitle(d.k)}</h4><ul class="tlist">${d.trips.map(tripRow).join('')}</ul></div>`).join('');
  }

  // Überschrift auf Heute: das Versprechen von Flowtown, passend zu dem, was beim Einstieg wichtig war
  const HEUTE_TITEL = { schnell: 'Schneller ankommen.', stufenlos: 'Stufenlos ankommen.', blick: 'Ohne Blick aufs Display.', rad: 'Sicher mit dem Rad.', stadt: 'Gemeinsam besser ankommen.' };
  function renderHeuteTitel() {
    const g = goals()[0], t = (g && HEUTE_TITEL[g]) || 'Besser ankommen.', h = $('#h-start');
    h.textContent = t; h.classList.toggle('long', t.length > 18);
  }
  function renderLastTrip() {
    renderHeuteTitel();
    $('#today-date').textContent = new Date().toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
    const hr = new Date().getHours();
    $('#today-date').textContent = (hr < 5 ? 'Gute Nacht' : hr < 11 ? 'Guten Morgen' : hr < 18 ? 'Guten Tag' : 'Guten Abend') + ' · ' + $('#today-date').textContent;
    $('#hints').open = false;
    $('#hints').hidden = trips.some((x) => !x.demo);   // die Anleitung nur bis zur ersten echten Fahrt
    $('#go-note').hidden = trips.some((x) => !x.demo);   // die Erklärung unter „Ohne Ziel aufzeichnen“ nur, solange es noch keine Fahrt gibt
  }

  // ---------- Pilot: Fahrten pseudonym auf den Server, mit Code ----------
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const showCode = (c) => { const n = normCode(c); return n.length === 10 ? `${n.slice(0, 2)}-${n.slice(2, 6)}-${n.slice(6)}` : n; };
  const pilotOn = () => !!(settings.pilot && settings.pilot.code) && !!apiBase();
  // einfacher Fingerabdruck einer Fahrt: geänderte Fahrten (etwa neue Bewertungen) gehen erneut raus
  const tripHash = (t) => { const s = JSON.stringify(t); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return s.length + ':' + h; };
  let pilotBusy = false;
  async function syncPilot() {
    if (!pilotOn() || pilotBusy || !navigator.onLine) return;
    const sent = store.get('pilotSent', {});
    const todo = trips.filter((t) => !t.demo && sent[t.id] !== tripHash(t));
    if (!todo.length) return;
    pilotBusy = true;
    try {
      for (let i = 0; i < todo.length; i += 20) {
        const part = todo.slice(i, i + 20);
        const r = await postJson('/api/pilot/upload', { code: settings.pilot.code, trips: part });
        part.forEach((t) => { sent[t.id] = tripHash(t); });
        store.set('pilotSent', sent);
        Object.assign(settings.pilot, { last: Date.now(), n: r.n, error: '' });
        store.set('settings', settings);
      }
    } catch (e) {
      settings.pilot.error = e.message === 'Failed to fetch' ? 'Keine Verbindung, nächster Versuch beim nächsten Öffnen.' : e.message;
      store.set('settings', settings);
    } finally { pilotBusy = false; }
    if (!$('#view-more').hidden) renderPilotCard();
  }
  // Code prüfen und verbinden; liegen schon Fahrten auf dem Server und keine auf dem Handy, werden sie geholt
  async function connectPilot(code, consent) {
    const c = normCode(code);
    if (c.length !== 10 || !c.startsWith('FT')) throw new Error('Der Code hat die Form FT-XXXX-XXXX.');
    if (!consent) throw new Error('Bitte bestätige, dass deine Fahrten für den Pilot übertragen werden dürfen.');
    if (!apiBase()) throw new Error('Unter „Mehr“ fehlt die Adresse des Servers.');
    const r = await postJson('/api/pilot/check', { code: c });
    settings.pilot = { code: c, since: Date.now(), n: r.n, last: 0, error: '' };
    store.set('settings', settings);
    store.set('pilotSent', {});
    let restored = 0;
    if (r.n && !trips.some((t) => !t.demo)) restored = await restorePilot();
    syncPilot();
    return { onServer: r.n, restored };
  }
  async function restorePilot() {
    const r = await postJson('/api/pilot/restore', { code: settings.pilot.code });
    const sent = store.get('pilotSent', {});
    let added = 0;
    for (const t of r.trips || []) {
      if (trips.some((x) => x.id === t.id)) continue;
      trips.push(t); sent[t.id] = tripHash(t); added++;
    }
    trips.sort((a, b) => a.start - b.start);
    saveTrips(); store.set('pilotSent', sent);
    return added;
  }
  // Einstellungen: je Bereich eine Zeile, die sagt, was gerade gilt
  function renderMoreSubs() {
    const sv = settings.server || {};
    let host = '';
    try { host = sv.url ? new URL(sv.url).host : ''; } catch (e) { host = sv.url; }
    const on = [sv.lage !== false && 'Verkehrslage', sv.wir && 'Beitragen', sv.ki && 'KI'].filter(Boolean);
    $('#server-sub').textContent = host ? `${host}${on.length ? ' · ' + on.join(', ') : ''}` : (apiBase() ? `Standard-Server${on.length ? ' · ' + on.join(', ') : ''}` : 'Kein Server eingetragen');
    $('#price-sub').textContent = `Sprit ${fmtNum(settings.fuelPrice, 2)} € · Strom ${fmtNum(settings.powerPrice, 2)} €`;
    $('#cut-sub').textContent = settings.cut ? `${settings.cut} m um Start und Ziel werden nicht gespeichert` : 'Start und Ziel werden nicht ausgespart';
    $('#signals-sub').textContent = clusters.length ? `${clusters.length} Kreuzungen gespeichert` : 'Noch keine Ampeln geladen';
    const n = trips.filter((t) => !t.demo).length, d = trips.length - n;
    $('#data-sub').textContent = `${n} Fahrt${n === 1 ? '' : 'en'} auf diesem Handy${d ? `, dazu ${d} Demo` : ''}`;
  }
  function renderPilotCard() {
    const el = $('#pilot-card');
    const head = '';
    const p0 = settings.pilot;
    $('#pilot-sub').textContent = p0 ? `Code ${showCode(p0.code).replace(/-\w{4}$/, '-····')}${p0.error ? ', Fehler beim Übertragen' : `, ${p0.n || 0} Fahrt${p0.n === 1 ? '' : 'en'} übertragen`}` : 'Mit Code dabei sein';
    if (!settings.pilot) {
      el.innerHTML = `${head}<label class="field" for="m-code">Pilot-Code<input id="m-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="FT-XXXX-XXXX"></label>
        <label class="check"><input type="checkbox" id="m-pilot"><span>Meine Fahrten für den Pilot übertragen</span></label>
        <p class="small muted">Pseudonym: Halte an Ampeln, Zeiten, Strecke im 150-m-Raster, Bewertungen. Kein Name, keine Start- und Zielorte.</p>
        <button type="button" class="btn" data-pilot="connect">${ic('check')}Code verbinden</button><p class="small" id="pilot-msg" role="status" aria-live="polite"></p>`;
      return;
    }
    const p = settings.pilot;
    const state = p.error ? `<p class="small">${ic('alert')} ${esc(p.error)}</p>`
      : `<p class="small muted">${p.n || 0} Fahrt${p.n === 1 ? '' : 'en'} auf dem Server${p.last ? ' · zuletzt übertragen ' + new Date(p.last).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : ''}</p>`;
    el.innerHTML = `${head}${state}
      <div class="btn-col">
        <button type="button" class="btn" data-pilot="sync">${ic('upload')}Jetzt übertragen</button>
        <button type="button" class="btn" data-pilot="restore">${ic('download')}Fahrten vom Server holen</button>
        <button type="button" class="btn danger-text" data-pilot="delete"${p.armDelete ? ' data-armed="1"' : ''}>${ic('trash')}${p.armDelete ? 'Wirklich alles auf dem Server löschen?' : 'Meine Pilot-Daten auf dem Server löschen'}</button>
        <button type="button" class="btn quiet" data-pilot="leave">Code von diesem Handy entfernen</button>
      </div><p class="small" id="pilot-msg" role="status" aria-live="polite"></p>`;
  }
  $('#pilot-card').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-pilot]');
    if (!b) return;
    const msg = (t) => { const m = $('#pilot-msg'); if (m) m.textContent = t; };
    const act = b.dataset.pilot;
    try {
      if (act === 'connect') {
        msg('Code wird geprüft …');
        const r = await connectPilot($('#m-code').value, $('#m-pilot').checked);
        renderPilotCard();
        msg(r.restored ? `Verbunden. ${r.restored} Fahrten vom Server geholt.` : 'Verbunden. Deine Fahrten werden übertragen.');
      } else if (act === 'sync') {
        store.set('pilotSent', {}); msg('Wird übertragen …'); await syncPilot(); renderPilotCard(); msg(settings.pilot.error || 'Übertragen.');
      } else if (act === 'restore') {
        msg('Wird geholt …'); const n = await restorePilot(); renderPilotCard(); msg(n ? `${n} Fahrten vom Server ergänzt.` : 'Alle Fahrten vom Server sind schon auf dem Handy.');
      } else if (act === 'delete') {
        if (!settings.pilot.armDelete) { settings.pilot.armDelete = true; renderPilotCard(); return; }
        await postJson('/api/pilot/delete', { code: settings.pilot.code });
        settings.pilot = null; store.set('settings', settings); store.set('pilotSent', {});
        renderPilotCard(); msg('Deine Pilot-Daten auf dem Server sind gelöscht. Auf dem Handy bleibt alles.');
      } else if (act === 'leave') {
        settings.pilot = null; store.set('settings', settings); store.set('pilotSent', {});
        renderPilotCard(); msg('Code entfernt. Auf dem Server bleibt, was schon übertragen ist.');
      }
    } catch (e) { msg(e.message === 'Failed to fetch' ? 'Keine Verbindung zum Server.' : e.message); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncPilot(); });

  // ---------- Einstieg beim ersten Start ----------
  function openWelcome() {
    $('#w-lage').checked = settings.server.lage !== false;
    $('#w-wir').checked = !!settings.server.wir;
    $('#w-ki').checked = !!settings.server.ki;
    const code = new URLSearchParams(location.search).get('code');   // Einladungslink: …/flowtown/?code=FT-XXXX-XXXX
    if (code) { $('#w-code').value = showCode(code); history.replaceState(null, '', location.pathname); }
    introOnly = false;
    welcomeStep(1);
    showView('welcome');
  }
  // Startseite in zwei Schritten: erst erklären, was Flowtown kann, dann um Erlaubnis fragen
  let introOnly = false;
  function welcomeStep(n) {
    $('#w-step1').hidden = n !== 1; $('#w-step2').hidden = n !== 2;
    renderWelcomeAccess();
    if (n === 2) speak('Schritt 2 von 2: Was darf Flowtown? Verkehrslage laden ist an. Fahrten anonym beitragen und KI-Einschätzung sind aus. Alles lässt sich später ändern. Ganz unten: Los geht es.', { now: true });
    $('#btn-intro-next').textContent = introOnly ? 'Zurück zur App' : 'Weiter';
    $('#w-steps1').hidden = introOnly;
    $('#w-intro').hidden = !introOnly; $('#w-intro-note').hidden = !introOnly;   // beim ersten Start kurz halten, zum Erklären alles zeigen
    const h = $(n === 1 ? '#h-welcome' : '#h-welcome2');
    h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  // ---------- Was ist dir wichtig? Auswahl auf der Begrüßung und unter Mehr; „Heute“ zeigt dazu zuerst passende Bausteine ----------
  const GOALS = {
    schnell: { label: 'Schneller ankommen', fd: ['clock', 'Beste Abfahrt zu deinem Ziel', 'Stau, Baustellen und die beste Zeit'] },
    stufenlos: { label: 'Ohne Stufen', cls: 'acc', fd: ['access', 'Stufenlose Haltestellen und Orte', 'Hochbahnsteige, Aufzüge, Toiletten auf der Karte'] },
    blick: { label: 'Ohne Blick aufs Display', cls: 'blue', fd: ['mic', 'Wo bin ich?', 'Adresse, Ampel und Haltestelle, vorgelesen'] },
    rad: { label: 'Mit dem Rad', fd: ['bike', 'Radwege auf der Karte', 'Gute Wege, holprige Stellen, Baustellen'] },
    stadt: { label: 'Die Stadt verbessern', fd: ['chart', 'Deine Wirkung für Bielefeld', 'Fahrten anonym beitragen, Ampeln bewerten'] }
  };
  const goals = () => (Array.isArray(settings.goals) ? settings.goals : []).filter((g) => GOALS[g]);
  function renderGoals() {
    const g = goals();
    $$('.goal-chip').forEach((b) => b.setAttribute('aria-pressed', String(g.includes(b.dataset.goal))));
    $('#goals-sub').textContent = g.length ? g.map((k) => GOALS[k].label).join(' · ') : 'Noch nichts gewählt';
    const el = $('#fuer-dich');
    if (!el) return;
    // schon eingerichtet, aber noch nichts gewählt: einmal fragen
    if (!g.length && settings.onboarded && !settings.goalsAsked) {
      el.hidden = false;
      el.innerHTML = `<div class="fd-ask"><button type="button" class="fd" data-fd="wahl">${ic('check')}<span><b>Was ist dir wichtig?</b><span>Wähle aus, dann zeigt Flowtown dir das zuerst.</span></span>${ic('chevron', 'wrow-go')}</button><button type="button" class="vf-x" data-fd="nein" aria-label="Hinweis ausblenden">${ic('x')}</button></div>`;
      return;
    }
    el.hidden = !g.length;
    el.innerHTML = g.length ? `<h3 class="eyebrow">Für dich</h3><div class="fd-list">${g.slice(0, 1).map((k) => { const [icon, t, sub] = GOALS[k].fd; return `<button type="button" class="fd${GOALS[k].cls ? ' ' + GOALS[k].cls : ''}" data-fd="${k}">${ic(icon)}<span><b>${t}</b><span>${sub}</span></span>${ic('chevron', 'wrow-go')}</button>`; }).join('')}</div>` : '';
  }
  function toggleGoal(k, fromWelcome) {
    const g = goals(), on = !g.includes(k);
    settings.goals = on ? g.concat(k) : g.filter((x) => x !== k);
    // was sich daraus gleich ergibt; Einwilligungen bleiben sichtbar und abwählbar
    if (on && k === 'blick' && canSpeak && !voiceOn()) setVoice(true);
    if (on && k === 'rad' && fromWelcome) { settings.mode = 'rad'; setModeUI('rad'); }
    if (on && k === 'stadt' && fromWelcome) $('#w-wir').checked = true;
    store.set('settings', settings);
    renderGoals();
    if (fromWelcome) renderWelcomeAccess();
    speak(on ? `${GOALS[k].label}: gewählt.${k === 'stufenlos' && !settings.access.on ? ' Wähle weiter unten dein Profil.' : ''}` : `${GOALS[k].label}: abgewählt.`, { now: true });
  }
  $('#w-goals').addEventListener('click', (ev) => { const b = ev.target.closest('.goal-chip'); if (b) toggleGoal(b.dataset.goal, true); });
  $('#set-goals').addEventListener('click', (ev) => { const b = ev.target.closest('.goal-chip'); if (b) toggleGoal(b.dataset.goal, false); });
  $('#fuer-dich').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-fd]');
    if (!b) return;
    const k = b.dataset.fd;
    if (k === 'wahl' || k === 'nein') {
      settings.goalsAsked = true; store.set('settings', settings);
      if (k === 'wahl') { showView('more'); const d = $('#box-goals'); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); } }
      renderGoals(); return;
    }
    if (k === 'schnell') { const z = settings.ziele[0]; if (z) openPlan(z.id); else showView('plan'); }
    else if (k === 'blick') { unlockSpeech(); whereAmI(true); }
    else if (k === 'stufenlos' || k === 'rad') {
      if (k === 'stufenlos') { mapLayers.acc = true; mapLayers.tram = true; } else mapLayers.rad = true;
      settings.mapLayers = mapLayers; store.set('settings', settings);
      showView('map');
    } else if (k === 'stadt') {
      if (!settings.server.wir) { showView('more'); const d = $('#box-server'); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); } }
      else showView('stats');
    }
  });
  renderGoals();
  // Begrüßung: Vorlesen, Profil und große Schrift gleich hier einstellen
  function renderWelcomeAccess() {
    const v = $('#w-voice');
    v.hidden = !canSpeak;
    v.setAttribute('aria-pressed', String(voiceOn()));
    v.querySelector('span').textContent = voiceOn() ? 'Vorlesen und Ansagen sind an' : 'Vorlesen und Ansagen einschalten';
    $$('#w-acc .acc-chip').forEach((b) => b.setAttribute('aria-pressed', String(settings.access.on && settings.access.type === b.dataset.wacc)));
    $('#w-big').checked = !!settings.big;
    // Profil aufgeklappt, wenn schon eins gewählt ist oder „Ohne Stufen“ bzw. „Ohne Blick aufs Display“ wichtig ist
    if (settings.access.on || goals().some((g) => g === 'stufenlos' || g === 'blick')) setWelcomeAcc(true);
    $('#w-acc-h span').textContent = settings.access.on ? `Profil: ${ACCESS_LABEL[settings.access.type]}` : 'Barrierefrei unterwegs? Profil wählen';
  }
  function setWelcomeAcc(open) {
    $('#w-acc-body').hidden = !open;
    $('#w-acc-h').setAttribute('aria-expanded', String(open));
  }
  $('#w-acc-h').addEventListener('click', () => setWelcomeAcc($('#w-acc-body').hidden));
  const WELCOME_SAY = 'Willkommen bei Flowtown. Die grüne Welle beginnt bei dir. Weniger warten, besser ankommen, mit Auto, Bus und Bahn, Rad oder zu Fuß. '
    + 'Vor der Fahrt zeigt Flowtown Stau und Baustellen und die beste Verbindung. Unterwegs erkennt die App jeden Halt an der Ampel selbst und sagt dir Wechsel und Hindernisse an. Danach siehst du, wo die Zeit geblieben ist. '
    + 'Deine Fahrten bleiben auf deinem Handy. Darunter wählst du, was dir wichtig ist. Weiter unten kannst du dein Profil wählen: Rollstuhl, Rollator oder Gehhilfe, Ich sehe schlecht oder nichts, Ich höre schlecht oder nichts, Einfache Sprache oder Ruhe und Pausen. Dann tippe auf Weiter.';
  $('#w-voice').addEventListener('click', () => {
    setVoice(!voiceOn());
    renderWelcomeAccess();
    if (voiceOn()) speak(WELCOME_SAY, { now: true }); else if (canSpeak) speechSynthesis.cancel();
  });
  $('#w-acc').addEventListener('click', (ev) => {
    const b = ev.target.closest('.acc-chip');
    if (!b) return;
    const on = !(settings.access.on && settings.access.type === b.dataset.wacc);
    settings.access = { on, type: b.dataset.wacc };
    if (on && b.dataset.wacc === 'sehen' && !settings.voice && canSpeak) settings.voice = { on: true, rate: 1 };
    store.set('settings', settings);
    applyAccessUI(); renderWelcomeAccess();
    speak(on ? `Profil ${ACCESS_LABEL[b.dataset.wacc]} gewählt.` : 'Kein Profil.', { now: true });
  });
  $('#w-big').addEventListener('change', (ev) => { settings.big = ev.target.checked; store.set('settings', settings); applyAccessUI(); });
  $('#btn-intro-next').addEventListener('click', () => { if (introOnly) showView('more'); else welcomeStep(2); });
  $('#btn-intro-back').addEventListener('click', () => welcomeStep(1));
  $('#btn-intro').addEventListener('click', () => { introOnly = true; showView('welcome'); welcomeStep(1); });
  $('#btn-welcome').addEventListener('click', async () => {
    const msg = $('#welcome-msg');
    Object.assign(settings.server, { lage: $('#w-lage').checked, wir: $('#w-wir').checked, ki: $('#w-ki').checked });
    $('#inp-wir').checked = settings.server.wir; $('#inp-ki').checked = settings.server.ki; $('#inp-lage').checked = settings.server.lage;
    const code = $('#w-code').value.trim();
    if (code) {
      msg.textContent = 'Code wird geprüft …';
      try {
        const r = await connectPilot(code, $('#w-pilot').checked);
        msg.textContent = r.restored ? `${r.restored} Fahrten vom Server geholt.` : '';
      } catch (e) { msg.textContent = e.message === 'Failed to fetch' ? 'Keine Verbindung zum Server. Den Code kannst du später unter „Mehr“ eintragen.' : e.message; return; }
    }
    settings.onboarded = VERSION;
    store.set('settings', settings);
    showView('start');
    speak('Flowtown ist bereit. Oben gibst du dein Ziel ein, oder du wählst, womit du unterwegs bist, und tippst auf Ohne Ziel aufzeichnen.', { now: true });
  });

  // ---------- Hinweis: zum Home-Bildschirm hinzufügen ----------
  // Im Browser-Tab löscht Safari Daten von Seiten, die 7 Tage nicht geöffnet wurden; die installierte App ist davon ausgenommen
  const standalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; renderA2hs(); });
  function renderA2hs() {
    const el = $('#a2hs');
    if (standalone() || settings.a2hsHide) { el.hidden = true; return; }
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    el.hidden = false;
    el.innerHTML = `<div class="a2hs-text"><b>Als App auf den Home-Bildschirm</b><span>${ios ? 'In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“.' : installEvt ? 'Dann startet Flowtown wie eine App.' : 'Im Browser-Menü „Zum Startbildschirm hinzufügen“ wählen.'} Im Browser-Tab können deine Fahrten sonst nach einiger Zeit verloren gehen.</span>${installEvt ? `<button type="button" class="btn" data-a2hs="install">${ic('download')}Installieren</button>` : ''}</div>
      <button type="button" class="vf-x" data-a2hs="hide" aria-label="Hinweis ausblenden">${ic('x')}</button>`;
  }
  $('#a2hs').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-a2hs]');
    if (!b) return;
    if (b.dataset.a2hs === 'install' && installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; }
    else { settings.a2hsHide = true; store.set('settings', settings); }
    renderA2hs();
  });

  // ---------- Ereignisse ----------
  $('#btn-start').addEventListener('click', startTrip);
  $('#btn-plan').addEventListener('click', () => openPlan(settings.ziele.length || !apiBase() ? null : 'neu'));
  $('#plan-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = $('#plan-q').value.trim();
    if (q.length >= 2) { $('#plan-q').blur(); planSearch(q); }
  });
  $('#plan-teaser').addEventListener('click', (ev) => {
    const po = ev.target.closest('[data-plan-ort]');
    if (po && planList) { planPick(planList[Number(po.dataset.planOrt)]); return; }
    const pg = ev.target.closest('[data-plan-go]');
    if (pg) { const z = settings.ziele.find((x) => x.id === pg.dataset.planGo); if (z) { z.u = Date.now(); store.set('settings', settings); planGoZiel(z); } return; }
    const c = ev.target.closest('[data-plan-ziel]');
    if (c) { openPlan(c.dataset.planZiel); return; }
    const bz = ev.target.closest('[data-best-ziel]');
    if (bz) { bestZiel = bz.dataset.bestZiel; renderPlanTeaser(); return; }
    if (ev.target.closest('[data-best="go"]')) { unlockSpeech(); runBest(); return; }
    if (ev.target.closest('[data-best-other]')) { unlockSpeech(); startIntent('vergleich'); return; }
    const bm = ev.target.closest('[data-best-mode]');
    if (bm) { const z = settings.ziele.find((x) => x.id === bestZiel); setModeVoice(BEST_MODE[bm.dataset.bestMode]); if (z) openPlan(z.id); }
  });
  $('#btn-plan-back').addEventListener('click', () => { if (planFromBest && bestZiel) { planFromBest = false; showView('best'); } else showView('start'); });
  $('#btn-best-back').addEventListener('click', () => showView('start'));
  $('#best-wrap').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-best="go"]')) { unlockSpeech(); runBest(); return; }
    const bm = ev.target.closest('[data-best-mode]');
    if (bm) { const z = settings.ziele.find((x) => x.id === bestZiel); setModeVoice(BEST_MODE[bm.dataset.bestMode]); if (z) { planFromBest = true; openPlan(z.id); } }
  });
  $('#tips-body').addEventListener('click', (ev) => {
    if (ev.target.closest('#btn-ki')) { runKi(); return; }
    if (ev.target.closest('[data-profset]')) { openProfileSettings(); return; }
    const pa = ev.target.closest('[data-tipacc]');
    if (pa) {
      const k = pa.dataset.tipacc;
      settings.access = { on: true, type: k };
      if (k === 'sehen' && !settings.voice && canSpeak) settings.voice = { on: true, rate: 1 };
      store.set('settings', settings);
      applyAccessUI(); tipsProfLoading = false; renderTips();
      speak(`Profil ${ACCESS_LABEL[k]} gewählt. Ändern kannst du es unter Mehr.`, { now: true });
      const h = $('#tip-prof-h'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
      return;
    }
    const m = ev.target.closest('[data-tipmode]');
    if (m) { tipMode = m.dataset.tipmode; tipOpen = null; renderTips(); return; }
    const go = ev.target.closest('[data-tipgo]');
    if (go) {
      const k = go.dataset.tipgo;
      if (k === 'plan') { if (go.dataset.z) openPlan(go.dataset.z); else showView('plan'); }
      else if (k === 'stats') showView('stats');
      else if (k === 'mapacc') { mapLayers.acc = true; mapLayers.tram = true; settings.mapLayers = mapLayers; store.set('settings', settings); showView('map'); }
      else if (k === 'wo') { unlockSpeech(); whereAmI(true); }
      else if (k === 'read') readTips();
      else if (k === 'planrad') { settings.mode = 'rad'; store.set('settings', settings); setModeUI('rad'); openPlan(go.dataset.z); }
      return;
    }
    const t = ev.target.closest('.tip-row[data-tip]');
    if (t) { const i = Number(t.dataset.tip); tipOpen = tipOpen === i ? null : i; renderTips(); }
    const fq = ev.target.closest('.tip-row[data-faq]');
    if (fq) { faqOpen = faqOpen === fq.dataset.faq ? null : fq.dataset.faq; renderTips(); }
  });
  const saveServer = () => {
    settings.server = { url: $('#inp-server').value.trim(), wir: $('#inp-wir').checked, ki: $('#inp-ki').checked, lage: $('#inp-lage').checked };
    store.set('settings', settings);
    wirCache = null; wirAt = 0; newsAt = 0; lageAt = 0; lageCache = null;
    if (settings.server.wir) flushWir();
  };
  $('#inp-ask-stats').checked = !!settings.assistStats;
  $('#inp-ask-stats').addEventListener('change', (ev) => { settings.assistStats = ev.target.checked; store.set('settings', settings); renderMoreSubs(); });
  ['#inp-server', '#inp-wir', '#inp-ki', '#inp-lage'].forEach((id) => $(id).addEventListener('change', () => { saveServer(); renderMoreSubs(); }));
  $('#btn-server-test').addEventListener('click', async () => {
    saveServer();
    const st = $('#server-status');
    if (!apiBase()) { st.textContent = 'Bitte zuerst die Adresse eintragen.'; return; }
    st.textContent = 'Verbindung wird geprüft …';
    try {
      const h = await api('/api/health');
      const lg = h.lage ? ` Verkehrslage: Autobahn${h.lage.here ? ' und Stadt (HERE)' : ', Stadt noch ohne HERE-Schlüssel'}.` : '';
      st.textContent = `Verbunden. KI ${h.ki ? 'bereit (' + h.modell + ')' : 'auf dem Server noch nicht eingerichtet'}. Werte anderer ab ${h.kMin} Personen.${lg}`;
    } catch (e) { st.textContent = 'Keine Verbindung: ' + e.message; }
  });
  ['#view-stats', '#view-map'].forEach((id) => $(id).addEventListener('click', (ev) => { const b = ev.target.closest('button[data-goto]'); if (b) showView(b.dataset.goto); }));
  $('#mode-row').addEventListener('click', (ev) => { const b = ev.target.closest('.leg-chip'); if (b) changeMode(b.dataset.leg); });
  $('#btn-leg-yes').addEventListener('click', () => { if (legSuggest) changeMode(legSuggest.mode, legSuggest.t); });
  $('#btn-leg-no').addEventListener('click', () => { if (legSuggest) { legNo = { mode: legSuggest.mode, t: Date.now() }; } hideLegSuggest(); });
  $$('input[name="mgroup"], input[name="pt"]').forEach((i) => i.addEventListener('change', () => {
    $('#pt-row').hidden = $('input[name="mgroup"]:checked').value !== 'oepnv';
    settings.mode = selectedMode(); store.set('settings', settings);
    applyModeWords(settings.mode);
    renderToday();
  }));
  // Heute und Planen: eine Zeile zeigt das Profil; gewählt wird es an einer Stelle, unter Mehr → Barrierefrei unterwegs
  let accTipOpen = null;
  function renderAccRow() {
    const group = MODE_GROUP[selectedMode()];
    const show = group === 'oepnv' || group === 'fuss';
    const a = settings.access;
    $('#prof-line-text').innerHTML = a.on ? `Profil: <b>${esc(ACCESS_LABEL[a.type])}</b> · ändern` : 'Barrierefrei? Profil wählen';
    const pb = $('#prof-btn');
    if (pb) { pb.classList.toggle('on', !!a.on); const t = a.on ? `Profil: ${ACCESS_LABEL[a.type]}. Ändern` : 'Barrierefrei? Profil wählen'; pb.setAttribute('aria-label', t); pb.title = t; }
    const box = $('#acc-tips');
    if (!show || !settings.access.on) { box.hidden = true; box.innerHTML = ''; return; }
    if (!faq) { loadFaq().then(() => { if (faq) renderAccRow(); }); return; }
    const type = settings.access.type, mine = FAQ_GROUPS[type] || [];
    const oepnv = (e) => /Nahverkehr/.test(e.kat) || e.orte.some((o) => ['Haltestelle Rathaus', 'Jahnplatz', 'Hauptbahnhof'].includes(o));
    const list = faq.eintraege.filter((e) => e.id !== 'AS-35' && e.gruppen.some((g) => mine.includes(g)) && (group === 'oepnv' ? oepnv(e) : !oepnv(e))).slice(0, 3);
    const hint = group === 'fuss' ? 'Tippe auf „Weg planen“ und wähle ein Ziel: Flowtown prüft den Weg auf Stufen, Pflaster und Bordsteine und sucht einen besseren.' : 'Auf der Karte unter „Stadtbahn“ siehst du, welche Haltestellen stufenlos sind.';
    box.innerHTML = `<p class="acc-hint">${ic('access')}<span><b>${esc(ACCESS_LABEL[type])}:</b> ${esc(hint)}</span></p>`
      + list.map((e) => `<div class="tipcard" data-world="tip"><button type="button" class="tip-row" data-acctip="${e.id}" aria-expanded="${accTipOpen === e.id}"><span class="tip-ic">${ic('info')}</span><span class="tip-main"><b>${esc(e.frage)}</b><span>${esc(firstSentence(e.antwort))}</span></span></button>${accTipOpen === e.id ? `<div class="tip-detail">${faqHtml(e)}</div>` : ''}</div>`).join('');
    box.hidden = false;
  }
  // springt zur einen Stelle, an der das Profil gewählt wird
  function openProfileSettings() {
    showView('more');
    const d = $('#box-access'); if (!d) return;
    d.open = true;
    setTimeout(() => { d.scrollIntoView({ block: 'start' }); $('#set-access').focus({ preventScroll: true }); }, 50);
  }
  $('#prof-line').addEventListener('click', openProfileSettings);
  $('#prof-btn').addEventListener('click', openProfileSettings);
  $('#acc-tips').addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-acctip]');
    if (t) { accTipOpen = accTipOpen === t.dataset.acctip ? null : t.dataset.acctip; renderAccRow(); }
  });
  // Profil barrierefrei: auf „Heute“ und in den Einstellungen, beide zeigen immer dasselbe
  function applyAccessUI() {
    const a = settings.access;
    $('#set-access').value = a.on ? a.type : 'aus';
    $('#set-big').checked = !!settings.big;
    $('#set-voice').checked = voiceOn();
    $('#set-voice-rate').value = String((settings.voice && settings.voice.rate) || 1);
    $('#box-voice').hidden = !canSpeak;
    $('#access-sub').textContent = (a.on ? ACCESS_LABEL[a.type] : 'Kein Profil') + (settings.big ? ' · große Schrift' : '');
    $('#ansagen-sub').textContent = (voiceOn() ? 'Ansagen an' : 'Ansagen aus') + (settings.begleit ? ' · Begleitmodus' : '');
    document.documentElement.classList.toggle('gross', !!settings.big);
  }
  $('#set-access').addEventListener('change', (ev) => {
    const v = ev.target.value;
    if (v === 'sehen' && !settings.voice && canSpeak) settings.voice = { on: true, rate: 1 };
    settings.access = { on: v !== 'aus', type: v === 'aus' ? settings.access.type : v };
    store.set('settings', settings);
    applyAccessUI();
  });
  $('#set-big').addEventListener('change', (ev) => { settings.big = ev.target.checked; store.set('settings', settings); applyAccessUI(); });
  function updateVoiceBtn() {
    const b = $('#btn-voice');
    if (!b) return;
    b.hidden = !canSpeak;
    b.setAttribute('aria-pressed', String(voiceOn()));
    b.querySelector('span').textContent = voiceOn() ? 'Ansagen an' : 'Ansagen aus';
  }
  function setVoice(on) {
    settings.voice = Object.assign({ rate: 1 }, settings.voice || {}, { on });
    store.set('settings', settings);
    applyAccessUI(); updateVoiceBtn();
  }
  ['#btn-mic', '#btn-mic-drive'].forEach((id) => { const b = $(id); if (b) { b.hidden = id === '#btn-mic' || !SR; b.addEventListener('click', () => listen()); } });
  askBar(document.body.dataset.view || 'start');
  // Symbol des Sprechen-Knopfes (Mikrofon oder Telefonhörer) und großer Sprachmodus
  function applySprechIcon() {
    const u = $('#fab-mic use'); if (u) u.setAttribute('href', '#i-' + sprechIcon());
    $('#fab-mic').setAttribute('aria-label', settings.sprechIcon === 'phone' ? 'Mit Flowtown sprechen' : 'Flowtown fragen');
    $('#set-sprechicon').value = settings.sprechIcon === 'phone' ? 'phone' : 'mic';
    $('#set-sprechgross').checked = !!settings.sprechGross;
  }
  $('#set-sprechicon').addEventListener('change', (ev) => { settings.sprechIcon = ev.target.value; store.set('settings', settings); applySprechIcon(); });
  $('#set-sprechgross').addEventListener('change', (ev) => { settings.sprechGross = ev.target.checked; store.set('settings', settings); });
  const sprechUrl = new URL('./?sprechen=1', location.href).href;
  $('#sprech-url').value = sprechUrl;
  $('#btn-sprech-copy').addEventListener('click', async () => {
    const i = $('#sprech-url'); let ok = false;
    try { await navigator.clipboard.writeText(sprechUrl); ok = true; } catch (e) { i.focus(); i.select(); }
    moreMsg(ok ? 'Link kopiert.' : 'Link markiert: bitte kopieren.');
  });
  applySprechIcon();
  let sosBack = null;
  function openSos() {
    const el = $('#sos'), src = $('#box-krise .tip-detail');
    sosBack = document.activeElement;
    const body = src ? src.cloneNode(true) : document.createElement('div');
    body.querySelectorAll('a[href="tel:112"]').forEach((a) => { const li = a.closest('li'); if (li) li.remove(); });
    el.innerHTML = `<div class="assist-head"><b id="sos-h">${ic('sos')}Notfall und Hilfe</b><button type="button" class="vf-x" data-sos="close" aria-label="Schließen">${ic('x')}</button></div>
      <a class="sos-call" href="tel:112">${ic('phone')}<span><b>112 anrufen</b><small>Feuerwehr und Rettungsdienst</small></span></a>`;
    body.classList.add('sos-body');
    el.appendChild(body);
    el.hidden = false;
    const x = el.querySelector('[data-sos="close"]'); if (x) x.focus();
  }
  function closeSos() { $('#sos').hidden = true; if (sosBack && sosBack.focus) sosBack.focus(); }
  $('#btn-sos').addEventListener('click', () => { if ($('#sos').hidden) openSos(); else closeSos(); });
  $('#sos').addEventListener('click', (ev) => { if (ev.target.closest('[data-sos="close"]')) closeSos(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#sos').hidden) closeSos(); });
  $('#assist').addEventListener('click', (ev) => {
    const ai = ev.target.closest('[data-askintent]');
    if (ai) { unlockSpeech(); startIntent(ai.dataset.askintent); return; }
    const ae = ev.target.closest('[data-askex]');
    if (ae) { unlockSpeech(); askAssist(ae.dataset.askex, false); return; }
    const ans = ev.target.closest('[data-intentans]');
    if (ans) { unlockSpeech(); askAssist(ans.dataset.intentans, false); return; }
    const b = ev.target.closest('[data-assist]');
    if (!b || b.tagName === 'FORM') return;
    const a = b.dataset.assist;
    if (a === 'close') { pendingIntent = null; assistBig = false; $('#assist').hidden = true; $('#assist').classList.remove('big'); if (canSpeak) speechSynthesis.cancel(); if (recog) { recog.userAbort = true; recog.abort(); } micStatus(''); }
    else if (a === 'mic') { unlockSpeech(); listen(); }
    else if (a === 'say') { unlockSpeech(); speak(assistLast, { now: true, force: true }); }
    else if (a === 'ziel' && assistAct) {
      const x = assistAct, near = settings.ziele.find((z) => dist(z, x) < 150);
      if (x.mode) setModeVoice(x.mode === 'oepnv' ? 'bahn' : x.mode);
      $('#assist').hidden = true;
      if (near) openPlan(near.id); else { addZiel({ name: x.name, lat: x.lat, lon: x.lon }); showView('plan'); }
    }
  });
  $('#assist').addEventListener('submit', (ev) => { ev.preventDefault(); unlockSpeech(); const i = $('#assist-inp'); if (i && i.value.trim()) askAssist(i.value, false); });
  $('#ask-mic').addEventListener('click', () => listen());
  $('#fab-mic').addEventListener('click', () => openAssistEmpty());
  $('#plan-mic').addEventListener('click', () => { unlockSpeech(); startIntent('weg'); });
  // Beispielfragen auf Heute: ein Tipp stellt die Frage
  $('#ask-hero').addEventListener('click', (ev) => {
    if (ev.target.closest('#ask-allow')) {
      showView('more');
      const d = $('#box-server'); if (d) d.open = true;
      setTimeout(() => { const c = $('#inp-ask-stats'); if (c) { c.scrollIntoView({ block: 'center' }); c.focus({ preventScroll: true }); } }, 50);
      return;
    }
    const it = ev.target.closest('[data-askintent]');
    if (it) { unlockSpeech(); startIntent(it.dataset.askintent); return; }
    const b = ev.target.closest('[data-askex]');
    if (!b) return;
    $('#ask-inp').value = b.dataset.askex;
    $('#ask-bar').requestSubmit();
  });
  $('#ask-bar').addEventListener('submit', (ev) => { ev.preventDefault(); unlockSpeech(); const i = $('#ask-inp'); if (i.value.trim()) { if (WO_RE.test(cmdNorm(i.value))) whereAmI(false); else if (TIPS_RE.test(cmdNorm(i.value))) { renderTips(); readTips(); } else askAssist(i.value, false); i.value = ''; i.blur(); } });
  document.addEventListener('pointerdown', (ev) => { if (ev.target.closest('#btn-start, .vf-say, #w-voice, #btn-voice, #btn-voice-test')) unlockSpeech(); }, true);
  document.addEventListener('pointerdown', (ev) => { if (ev.target.closest('#btn-mic, #btn-mic-drive, #ask-mic, #fab-mic, #plan-mic, .assist-mic, #ask-bar .btn') && compassWanted()) compassStart(true); }, true);
  $('#set-compass').checked = compassWanted();
  $('#set-begleit').checked = begleitOn();
  $('#set-navtone').checked = settings.navTone !== false;
  $('#set-geradeaus').value = settings.geradeaus == null ? '' : String(settings.geradeaus);
  $('#set-geradeaus').addEventListener('change', (ev) => { settings.geradeaus = ev.target.value === '' ? null : Number(ev.target.value); store.set('settings', settings); });
  $('#set-navtone').addEventListener('change', (ev) => { settings.navTone = ev.target.checked; store.set('settings', settings); if (ev.target.checked) { audioUnlock(); chime('hinweis'); } });
  $('#set-begleit').addEventListener('change', (ev) => { settings.begleit = ev.target.checked; store.set('settings', settings); if (ev.target.checked && !compassOn) compassStart(true); });
  $('#set-compass').addEventListener('change', (ev) => { settings.compass = ev.target.checked; store.set('settings', settings); if (ev.target.checked) compassStart(true).then((ok) => { if (!ok) { $('#set-compass').checked = false; micStatus('Der Kompass ist auf diesem Gerät nicht verfügbar oder nicht freigegeben.'); } }); });
  $('#btn-voice').addEventListener('click', () => { setVoice(!voiceOn()); if (voiceOn()) speak('Ansagen an.', { now: true }); else if (canSpeak) speechSynthesis.cancel(); });
  $('#set-voice').addEventListener('change', (ev) => { setVoice(ev.target.checked); if (ev.target.checked) speak('Ansagen sind an. So klingt Flowtown unterwegs.', { now: true }); });
  $('#set-voice-rate').addEventListener('change', (ev) => { settings.voice = Object.assign({ on: voiceOn() }, settings.voice || {}, { rate: Number(ev.target.value) || 1 }); store.set('settings', settings); speak('So schnell spreche ich jetzt.', { now: true, force: true }); });
  // beim Öffnen der Einstellung und vor dem Aufklappen der Liste frisch nachsehen
  $('#box-ansagen').addEventListener('toggle', () => { if ($('#box-ansagen').open && canSpeak) pickVoice(); });
  ['focus', 'pointerdown'].forEach((t) => $('#set-voice-name').addEventListener(t, () => { if (canSpeak && speechSynthesis.getVoices().filter((v) => /^de/i.test(v.lang)).length !== voicesDe.length) pickVoice(); }));
  $('#set-voice-name').addEventListener('change', (ev) => {
    settings.voice = Object.assign({ on: voiceOn(), rate: 1 }, settings.voice || {}, { name: ev.target.value || null });
    store.set('settings', settings);
    pickVoice();
    speak('So klinge ich jetzt.', { now: true, force: true });
  });
  $('#btn-voice-test').addEventListener('click', () => speak('In 200 Metern Baustelle, Ravensberger Straße. Fußgänger können die Baustelle auf dem gegenüberliegenden Gehweg passieren.', { now: true, force: true }));
  $('#btn-end').addEventListener('click', () => { $('#btn-end').hidden = true; $('#btn-end-confirm').hidden = false; $('#btn-end-cancel').hidden = false; $('#btn-end-confirm').focus(); });
  $('#btn-end-cancel').addEventListener('click', () => { resetEndButtons(); $('#btn-end').focus(); });
  $('#btn-end-confirm').addEventListener('click', finishTrip);
  $('#btn-demo').addEventListener('click', demoRun);
  $('#btn-demo-clear').addEventListener('click', () => {
    const n = trips.filter((t) => t.demo).length;
    trips = trips.filter((t) => !t.demo); saveTrips();
    moreMsg(n ? `${n} Demo-Fahrt${n === 1 ? '' : 'en'} gelöscht.` : 'Keine Demo-Daten vorhanden.');
  });
  $('#btn-wipe').addEventListener('click', () => { $('#wipe-confirm').hidden = false; $('#btn-wipe').hidden = true; });
  $('#btn-wipe-no').addEventListener('click', () => { $('#wipe-confirm').hidden = true; $('#btn-wipe').hidden = false; });
  $('#btn-wipe-yes').addEventListener('click', () => {
    trips = []; saveTrips();
    $('#wipe-confirm').hidden = true; $('#btn-wipe').hidden = false;
    moreMsg('Alle Fahrten gelöscht.');
  });
  $('#btn-reload-signals').addEventListener('click', () => {
    moreMsg('Standort wird abgefragt …');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        moreMsg('Ampeln werden geladen …');
        fetchSignals({ lat: p.coords.latitude, lon: p.coords.longitude })
          .then((n) => moreMsg(`${n} Signalstandorte im Umkreis von 5 km geladen.`))
          .catch(() => moreMsg('Die Ampeldaten konnten nicht geladen werden. Bitte später noch einmal versuchen.'));
      },
      () => moreMsg('Ohne Standort lassen sich keine Ampeln in deiner Nähe laden.'),
      { enableHighAccuracy: false, timeout: 15000 }
    );
  });
  $('#inp-cut').addEventListener('change', (ev) => { settings.cut = Number(ev.target.value); store.set('settings', settings); renderMoreSubs(); });
  function bindPrice(id, key) {
    $(id).addEventListener('change', (ev) => {
      const v = Number(ev.target.value.trim().replace(',', '.'));
      if (!isFinite(v) || v <= 0 || v > 10) { moreMsg('Bitte einen Preis wie 1,75 eingeben.'); ev.target.value = fmtNum(settings[key], 2); return; }
      settings[key] = Math.round(v * 100) / 100; store.set('settings', settings);
      ev.target.value = fmtNum(settings[key], 2);
      moreMsg('Preis gespeichert.');
    });
  }
  bindPrice('#inp-fuel', 'fuelPrice');
  bindPrice('#inp-power', 'powerPrice');

  $('#view-more').addEventListener('toggle', (ev) => {
    if (ev.target.classList && ev.target.classList.contains('setbox') && ev.target.open) $$('#view-more details.setbox[open]').forEach((d) => { if (d !== ev.target) d.open = false; });
  }, true);
  // ---------- Start ----------
  setModeUI(settings.mode);
  applyModeWords(settings.mode);
  if (!ACCESS_LABEL[settings.access.type]) settings.access.type = 'rollator';
  applyAccessUI();
  $('#inp-server').value = settings.server.url || '';
  $('#inp-wir').checked = !!settings.server.wir;
  $('#inp-ki').checked = !!settings.server.ki;
  $('#inp-lage').checked = settings.server.lage !== false;
  // Meldungen beim Start laden, damit sie auf „Heute“ erscheinen
  loadNews().then(() => { if (newsCache.length && heuteOn()) renderToday(); });
  $('#inp-cut').value = String(settings.cut);
  $('#inp-fuel').value = fmtNum(settings.fuelPrice, 2);
  $('#inp-power').value = fmtNum(settings.powerPrice, 2);
  $('#app-version').textContent = VERSION;
  $('.proto').textContent = 'Prototyp ' + VERSION;   // zeigt zugleich: das Programm läuft
  setTimeout(loadServerTools, 1500);
  clusters = buildClusters(signalNodes());
  // Ampelanlagen der Stadt einmal pro Woche holen; nicht während einer Aufzeichnung neu einteilen
  loadLsa().then((ok) => {
    if (!ok || rec) return;
    clusters = buildClusters(signalNodes());
    updateSignalsInfo();
    if (trips.map((t) => tidyTrip(t)).some(Boolean)) saveTrips();
  });
  // Ältere Fahrten nachbearbeiten: Rückstau-Halte (ab 0.6.0), Kreuzungen und Warten vor der Abfahrt (ab 0.9.0)
  if (trips.map((t) => tidyTrip(t)).some(Boolean)) saveTrips();
  updateSignalsInfo();
  if (!document.body.dataset.view) document.body.dataset.view = 'start';   // Farbe des Kopfs schon beim ersten Öffnen
  askBar(document.body.dataset.view);
  renderToday();
  renderLastTrip();
  renderA2hs();
  if (!settings.onboarded || new URLSearchParams(location.search).get('code')) openWelcome();
  else if (new URLSearchParams(location.search).get('sprechen') === '1' || location.hash === '#sprechen') {
    // Link zum Startbildschirm: gleich der Sprachmodus; zum Sprechen genügt ein Tipp (Handys erlauben das Mikrofon nur nach einer Berührung)
    document.title = 'Flowtown sprechen';
    const m = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (m) m.setAttribute('content', 'Flowtown sprechen');
    showView('start');
    if (apiBase()) openAssistEmpty({ big: true, launch: true });
  }
  syncPilot();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
    // neue Version übernommen: einmal neu laden, damit sie sofort sichtbar ist (nie während einer Aufzeichnung)
    if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', () => { if (!rec) location.reload(); });
  }

  // Aktualisieren oben rechts: neue Version holen und alles neu laden (in den Homescreen-Apps fehlt das Herunterziehen)
  $('#btn-refresh').addEventListener('click', async () => {
    if (rec) return;   // nie während einer Aufzeichnung
    const b = $('#btn-refresh');
    b.classList.add('busy'); b.disabled = true;
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) {
        await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 4000))]);
        // kommt eine neue Version, lädt der Wechsel des Service Workers die Seite selbst neu
        if (reg.installing || reg.waiting) { setTimeout(() => location.reload(), 4000); return; }
      }
    } catch (e) { /* ohne Service Worker einfach neu laden */ }
    location.reload();
  });

  // Für Tests von außen erreichbar
  window.__ww = { onPosition: (p) => onPosition(p), lineEst: (t) => { lineEstimate(t); showStopLine(); }, state: () => ({ rec, trips, clusters }), demoRun, review: (id) => openReview(trips.find((t) => t.id === id)), compass: () => ({ on: compassOn, c: compass }), legAsk: (m, f) => showLegSuggest(m, Date.now(), f) };
})();
