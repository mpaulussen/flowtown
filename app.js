/* Flowtown Prototyp: zeichnet Halte und Durchfahrten an Ampeln auf. Alle Daten bleiben im Browser. */
(function () {
  'use strict';

  const VERSION = '0.45.0';
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
  const ACCESS_LABEL = { rollstuhl: 'Rollstuhl', rollator: 'Rollator, Gehhilfe oder langsamer zu Fuß', sehen: 'Sehbehinderung', hoeren: 'Hörbehinderung', lernen: 'Einfache Sprache und klare Wege', ruhe: 'Ruhe und Pausen', andere: 'andere Einschränkung' };
  // Zu Fuß ist man einen Weg gegangen, nicht gefahren
  const DEFAULT_SERVER = 'https://songdeepdive.de/flowtown-api';
  const WORDS = {
    fahrt: { one: 'Fahrt', many: 'Fahrten', none: 'Noch keine Fahrt', start: 'Losfahren', end: 'Fahrt beenden', cont: 'Weiterfahren', time: 'Fahrzeit',
      past: 'gefahren', bilanz: 'Fahrtbilanz', last: 'Letzte Fahrt', review: 'Wie war deine Fahrt?', short: 'Die Fahrt war zu kurz und wurde nicht gespeichert.',
      hold: 'Handy in die Halterung, App geöffnet lassen. Der Bildschirm bleibt an.', during: 'Während der Fahrt nichts antippen. Bewertet wird erst danach.' },
    weg: { one: 'Weg', many: 'Wege', none: 'Noch kein Weg', start: 'Losgehen', end: 'Weg beenden', cont: 'Weitergehen', time: 'Gehzeit',
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
  if (!signalCache.stops || !signalCache.acc || signalCache.v !== 3) { signalCache.stops = {}; signalCache.acc = signalCache.acc || {}; signalCache.areas = []; signalCache.v = 3; }
  let names = store.get('names3', {});   // 'names3': Querstraßen ohne Bahnsteignamen (ab 0.9.0)
  const names2 = store.get('names2', {}); // mit Querstraße (0.6.0 bis 0.8.0)
  const oldNames = store.get('names', {}); // nur Straße (bis 0.5.0), als Übergang bis die neuen Namen da sind
  const nameOf = (id) => names[id] || names2[id] || oldNames[id] || null;
  let clusters = [];   // wird beim Start aus den gespeicherten Ampeln aufgebaut
  let alias = {};      // 'c' + Signalstandort -> Kreuzung, damit ältere Fahrten zur aktuellen Einteilung passen
  let clusterById = {};
  const saveTrips = () => store.set('trips', trips);

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
    if (s >= 3600) return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ' h';
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
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
          sound: accFlag(part, 's'), vib: accFlag(part, 'v') };
        list.push(c); clusterById[c.id] = c;
        for (const p of part) alias['c' + p.id] = c.id;
      }
    }
    return list;
  }
  function nearStop(p) {
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
    const q = `[out:json][timeout:25];(node${ar}[highway=traffic_signals];node${ar}[crossing=traffic_signals];node${ar}[railway=tram_stop];node${ar}[public_transport=stop_position];node${ar}[highway=bus_stop];);out;`;
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
        for (const el of json.elements || []) {
          if (el.type !== 'node') continue;
          const tg = el.tags || {};
          if (tg.highway === 'traffic_signals' || tg.crossing === 'traffic_signals') {
            signalCache.nodes[el.id] = [round5(el.lat), round5(el.lon)]; n++;
            const a = {};
            if (tg['traffic_signals:sound']) a.s = tg['traffic_signals:sound'];
            if (tg['traffic_signals:vibration']) a.v = tg['traffic_signals:vibration'];
            if (Object.keys(a).length) signalCache.acc[el.id] = a; else delete signalCache.acc[el.id];
          }
          else signalCache.stops[el.id] = tg.name ? [round5(el.lat), round5(el.lon), tg.name] : [round5(el.lat), round5(el.lon)];
        }
        signalCache.areas = signalCache.areas.filter((a) => dist(a, p) > 1000);
        // ohne eine einzige Ampel (auf dem Land möglich, oder ein Aussetzer): nur einen Tag als geladen merken
        signalCache.areas.push({ lat: round5(p.lat), lon: round5(p.lon), r: AREA_RADIUS, fetched: Date.now() - (n ? 0 : 29 * 864e5) });
        store.set('signals', signalCache);
        clusters = buildClusters(signalCache.nodes);
        updateSignalsInfo();
        // Halte aus Fahrten, bei denen die Ampeldaten fehlten, jetzt zuordnen
        if (!rec && trips.map((t) => tidyTrip(t)).some(Boolean)) saveTrips();
        return n;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Ampeldaten nicht erreichbar');
  }
  function updateSignalsInfo() {
    const n = clusters.length;
    $('#signals-info').textContent = n
      ? `${n} Ampel-Kreuzungen gespeichert (${Object.keys(signalCache.nodes).length} Signalstandorte, ${Object.keys(signalCache.stops).length} Haltestellenpunkte, ${signalCache.areas.length} Gebiet${signalCache.areas.length === 1 ? '' : 'e'}).`
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

  function findSignal(p, heading, radius) {
    let best = null, bestScore = Infinity;
    for (const c of allClusters()) {
      const d = dist(c, p);
      if (d > radius) continue;
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
          const near = train ? null : findSignal(s, s.heading, cfg.haltRadius);
          const atStop = rec.transfer ? !near && nearStop(s) : train ? nearStop(s) || fpStopsNear(s, 250, 2).length > 0 : isTransit(rec.curMode) && nearStop(s);
          const sig = atStop ? null : near;
          // keine Ampel in der Nähe, aber eine voraus: vermutlich Stau davor (endgültig zugeordnet wird am Ende der Fahrt)
          const queueSig = !sig && !atStop && !train ? findSignal(s, s.heading, QUEUE_M) : null;
          rec.stop = { t0: s.t, lat: s.lat, lon: s.lon, heading: s.heading, signal: sig, atStop, queueSig };
          rec.fastSince = null;
        }
      } else {
        rec.slowSince = null;
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
      setDriveState(`Umstieg · ${fmtDur(t - rec.transfer.t)}`, 'transfer');
    } else if (rec.stop) {
      const label = rec.stop.signal ? 'Halt an Ampel' : rec.stop.queueSig ? 'Stau vor Ampel' : rec.stop.atStop ? 'Halt an Haltestelle' : 'Halt';
      setDriveState(`${label} · ${fmtDur(t - rec.stop.t0)}`, 'halt');
    } else {
      setDriveState(vs < cfg.stopV ? 'Langsam …' : 'Unterwegs', 'moving');
    }
    if (rec.samples.length >= 3) detectLeg(p, vs, t);
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
    for (const c of allClusters()) {
      if (dist(c, p) > cfg.passRadius) continue;
      if (rec.recentPass[c.id] && t - rec.recentPass[c.id] < 90000) continue;
      if (rec.lastHaltAt[c.id] && t - rec.lastHaltAt[c.id] < 180000) continue;
      rec.recentPass[c.id] = t;
      rec.trip.events.push({ type: 'pass', signal: c.id, lat: round5(c.lat), lon: round5(c.lon), t, heading: heading == null ? null : Math.round(heading), mode: rec.curMode });
    }
  }

  function endStop(tEnd) {
    const s = rec.stop;
    rec.stop = null; rec.slowSince = null; rec.fastSince = null;
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
        (target.type === 'halt' || e.heading == null || angDiff(bearing(e, target), e.heading) <= 45);
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
  function tidyTrip(trip) {
    const ev = trip.events;
    let changed = false;
    // Halte ohne Ampel nachträglich zuordnen, etwa wenn die Ampeldaten während der Fahrt nicht da waren.
    // Durchfahrten ohne Halt lassen sich nicht nachholen: dafür fehlt die Spur.
    for (const e of ev) {
      if (trip.demo || e.type !== 'halt' || e.signal || e.atStop) continue;
      const p = e.at ? { lat: e.at[0], lon: e.at[1] } : e, mode = e.mode || trip.mode;
      if (isTransit(mode) && nearStop(p)) { e.atStop = true; delete e.queueSig; changed = true; continue; }
      const c = findSignal(p, e.heading, (MODES[mode] || MODES.auto).haltRadius);
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
    // Zwei Ampeln direkt hintereinander, dicht beieinander und kurz nacheinander: dieselbe Kreuzung
    for (let i = 0; i < ev.length - 1; i++) {
      const a = ev[i], b = ev[i + 1];
      if (!a.signal || !b.signal) continue;
      if (a.signal !== b.signal && dist(a, b) > JUNCTION_M) continue;
      if (b.t - (a.tEnd || a.t) > JUNCTION_MS) continue;
      let drop = i + 1;
      if (a.type === 'halt' && b.type === 'halt') {
        a.wait += b.wait; a.halts = (a.halts || 1) + (b.halts || 1); a.tEnd = b.tEnd;
        if (b.queued) a.queued = true;
        if (a.rating == null && b.rating != null) a.rating = b.rating;
        if (b.tags) a.tags = Array.from(new Set((a.tags || []).concat(b.tags)));
      } else if (a.type === 'pass' && b.type === 'halt') {
        drop = i;   // der Halt zählt, die Durchfahrt davor gehört dazu
      }
      ev.splice(drop, 1); i = Math.max(-1, i - 2); changed = true;
    }
    return changed;
  }

  function maybeFetchSignals(p, first) {
    if (rec.trip.demo) return;
    if (areaCovers(p)) return;
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
    if (!fp && lageOn()) loadFahrplan().catch(() => {});
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
      rec.trip.plan = Object.assign({}, pendingPlan); delete rec.trip.plan.lat; delete rec.trip.plan.lon;
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
  }

  function enterDriveView() {
    hideWarn();
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
      if (!rec.trip.demo && rec.lastFixAt && Date.now() - rec.lastFixAt > GAP_MS) setDriveState('Kein GPS-Empfang, etwa im Tunnel. Die Lücke wird überbrückt.', '');
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

  // ---------- Umsteigen (Bus und Bahn) ----------
  const isTransit = (m) => m === 'bus' || m === 'bahn' || m === 'zug';
  const nowT = () => (rec.samples.length ? rec.samples[rec.samples.length - 1].t : Date.now());
  function closeLeg(t) {
    const legs = rec.trip.legs || (rec.trip.legs = []);
    legs.push({ mode: rec.curMode, t0: rec.legStart != null ? rec.legStart : (rec.trip.start || t), t1: t });
    rec.legStart = t;
  }
  function switchMode(mode) {
    rec.curMode = mode; rec.cfg = MODES[mode];
    rec.slowSince = null; rec.fastSince = null;
  }
  function startTransfer(at) {
    if (!rec || rec.transfer || !isTransit(rec.curMode)) return;
    const t = at || nowT();
    if (rec.stop) endStop(t);   // die Bahn stand an der Haltestelle: dieser Halt endet mit dem Aussteigen
    const p = rec.samples[rec.samples.length - 1] || rec.last || {};
    closeLeg(t);
    rec.transfer = { t, from: rec.curMode, lat: p.lat, lon: p.lon };
    switchMode('fuss');
    updateTransferUI();
    setDriveState('Umstieg · 0:00', 'transfer');
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
  }
  // ---------- Wechsel erkennen: aussteigen, parken, einsteigen ----------
  // Vorschlag mit großem Knopf und Vibration; ohne Antwort gilt er nach 30 Sekunden. „Nein“ hält ihn 3 Minuten fern.
  let legSuggest = null, legNo = null, legTimer = null;
  const LEG_TEXT = { fuss: 'Jetzt zu Fuß', bahn: 'Weiter mit Stadtbahn', bus: 'Weiter mit Bus', zug: 'Weiter mit Zug', auto: 'Weiter mit Auto', rad: 'Weiter mit Rad' };
  function hideLegSuggest() { legSuggest = null; clearTimeout(legTimer); $('#leg-suggest').hidden = true; }
  function showLegSuggest(mode, t, frage) {
    if (legSuggest && legSuggest.mode === mode) return;
    if (legNo && legNo.mode === mode && Date.now() - legNo.t < 180000) return;
    legSuggest = { mode, t };
    $('#leg-suggest-text').textContent = frage;
    $('#btn-leg-yes').textContent = LEG_TEXT[mode];
    $('#leg-suggest').hidden = false;
    try { if (navigator.vibrate) navigator.vibrate([150, 80, 150]); } catch (e) { /* ohne Vibration */ }
    clearTimeout(legTimer);
    legTimer = setTimeout(() => { if (legSuggest && legSuggest.mode === mode) changeMode(mode, t); }, 30000);
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
    // 3. zu Fuß: 25 s schnell → eingestiegen; an einer Haltestelle Stadtbahn, Bus oder Zug, sonst Rad oder Auto
    else if (cur === 'fuss' && d.fast && t - d.fast.t >= 25000) {
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
    const t = at || nowT();
    if (rec.stop) endStop(t);
    if (rec.transfer) { rec.transfer = null; }
    closeLeg(t);
    switchMode(mode);
    updateTransferUI();
  }
  function updateTransferUI() {
    const cur = rec ? (rec.transfer ? 'fuss' : rec.curMode) : null;
    $$('#mode-row .leg-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.leg === cur)));
    $('#mode-q').textContent = rec && rec.transfer ? 'Umstieg zu Fuß. Weiter mit …' : 'Unterwegs mit';
    const n = rec && rec.trip.legs ? rec.trip.legs.length + 1 : 1;
    $('#drive-leg').hidden = !rec || n < 2;
    if (rec) $('#drive-leg').textContent = rec.transfer ? `Abschnitt ${n} · Umstieg zu Fuß` : `Abschnitt ${n} · ${MODES[rec.curMode].label}`;
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
    saveTrips();
    flushWir(trip);
    syncPilot();
    openReview(trip);
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
    return { mode, linie: fpLine(tr[0], tr[6]), ziel: fp.heads[tr[2]].replace(/^Bielefeld,\s*/, ''),
      halte: m.map(({ hi, j }) => [fpName(pat[j]), base + times[j] * 60000, halts[hi].tEnd]),
      amp: amps.reduce((x, e) => x + e.wait, 0), ampN: amps.length };
  }
  function matchFahrplan(t) {
    const legs = t.legs && t.legs.length ? t.legs : [{ mode: t.mode, t0: t.start, t1: t.end }];
    return legs.filter((l) => isTransit(l.mode)).map((l) => matchLeg(t, l.mode, l.t0, l.t1 || t.end)).filter(Boolean);
  }
  // einmal je Fahrt abgleichen, solange der Fahrplan die Fahrt abdeckt; das Ergebnis bleibt an der Fahrt
  function ensureFahrplan(t) {
    if (t.demo || 'fahrplan' in t || !(isTransit(t.mode) || (t.legs || []).some((l) => isTransit(l.mode)))) return false;
    if (!fp) { loadFahrplan().then((ok) => { if (ok && reviewTrip === t && ensureFahrplan(t)) openReview(t); }); return false; }
    const day = ymd(new Date(t.start));
    if (day < fp.gilt[0] || day > fp.gilt[1]) return false;
    t.fahrplan = matchFahrplan(t);
    saveTrips();
    return true;
  }
  function fahrplanHtml(t) {
    if (!t.fahrplan || !t.fahrplan.length) return '';
    return t.fahrplan.map((l) => {
      const f = l.halte[0], z = l.halte[l.halte.length - 1];
      const late = (h) => Math.round((h[2] - h[1]) / 60000), sign = (x) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '±0');
      const gain = late(z) - late(f);
      const verdict = gain >= 1 ? `${gain} min Verspätung unterwegs aufgebaut` : gain <= -1 ? `${-gain} min unterwegs aufgeholt` : 'Unterwegs im Plan geblieben';
      const who = l.mode === 'bus' ? 'der Bus' : l.mode === 'zug' ? 'der Zug' : 'die Bahn';
      const amp = l.mode === 'zug' ? '' : l.amp ? ` Dazwischen stand ${who} ${durText(l.amp)} an Ampeln (${l.ampN} Halt${l.ampN === 1 ? '' : 'e'}).` : ` Dazwischen musste ${who} an keiner Ampel halten.`;
      const rows = l.halte.map((h) => `<tr><td>${esc(h[0])}</td><td>${clock(h[1])}</td><td>${clock(h[2])}</td><td>${sign(late(h))}</td></tr>`).join('');
      return `<div class="fp-leg"><p class="fp-head"><span class="dep-line${l.mode === 'bahn' ? ' tram' : l.mode === 'zug' ? ' rail' : ''}">${esc(l.linie)}</span><span>→ ${esc(l.ziel)}</span></p>
        <p class="small muted">Laut Fahrplan ${esc(f[0])} ${clock(f[1])} bis ${esc(z[0])} ${clock(z[1])} · Abfahrt ${sign(late(f))} min, zuletzt ${sign(late(z))} min</p>
        <p class="fp-verdict"><b>${verdict}.</b>${amp}</p>
        <details class="fp-more"><summary>Halt für Halt</summary><table class="fp-table"><thead><tr><th>Halt</th><th>Plan</th><th>Ist</th><th>min</th></tr></thead><tbody>${rows}</tbody></table></details></div>`;
    }).join('') + `<p class="small muted lg-src">Fahrplan: DELFI (CC BY 4.0). Ist ist die Abfahrt, wie Flowtown sie gemessen hat.</p>`;
  }

  // ---------- Bewertung ----------
  let reviewTrip = null;
  function openReview(trip) {
    reviewTrip = trip;
    const halts = trip.events.filter((e) => e.type === 'halt' && e.signal);
    const passes = trip.events.filter((e) => e.type === 'pass').length;
    const atStop = trip.events.filter((e) => e.type === 'halt' && e.atStop).length;
    const other = trip.events.filter((e) => e.type === 'halt' && !e.signal && !e.atStop).length;
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
      other ? pill('info', `${other} ohne Ampel`) : ''
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
      <ul class="pl-legend">${stop ? `<li><span class="lg-dot stop"></span>${durText(stop)} an Haltestellen</li>` : ''}<li><span class="lg-dot red"></span>etwa ${Math.round(slow / 60000)} min langsam oder im Stau</li><li><span class="lg-dot"></span>${Math.round(amp / 60000)} min an Ampeln</li></ul>
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
      <ul class="pl-legend row-legend">${transit ? `<li><span class="lg-dot stop"></span>${durText(stopT)} an Haltestellen</li>` : ''}${slow >= 60000 ? `<li><span class="lg-dot red"></span>etwa ${Math.round(slow / 60000)} min langsam oder Stau</li>` : ''}<li><span class="lg-dot"></span>${durText(wait)} an Ampeln</li></ul>
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
      </article>`).join('');
  }
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
        html: () => `${legend}<div class="timeline">${tripTimeline(list, 6)}</div>${list.length > 6 ? `<details class="more-box"><summary>${ic('list')}Ältere anzeigen (${list.length - 6} weitere)</summary><div class="timeline">${tripTimeline(list.slice().sort((x, y) => y.start - x.start).slice(6))}</div></details>` : ''}` },
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
    $('#peek-meta').textContent = kind === 'r' ? `${pts.length} Ampeln auf diesem Weg · grün: erste, rot: letzte Ampel`
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
    const b = ev.target.closest('button.place, button[data-peek]');
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
    const card = (e) => `<div class="tipcard" data-world="tip"><button type="button" class="tip-row" data-faq="${e.id}" aria-expanded="${faqOpen === e.id}"><span class="tip-ic">${ic('info')}</span><span class="tip-main"><b>${esc(e.frage)}</b><span>${esc(firstSentence(e.antwort))}</span></span></button>${faqOpen === e.id ? `<div class="tip-detail">${faqHtml(e)}</div>` : ''}</div>`;
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
      altHtml = `<div class="alt-weg"><p><b>${ic('route')} Besserer Weg für dich</b><br>${esc(fewer.join(', ') || 'mit weniger Hindernissen')}, ${plus ? `etwa ${plus} m länger (+${Math.max(1, Math.round(plus / 60))} min)` : 'kaum länger'}.</p>`
        + `<button type="button" class="btn quiet" data-peek="l" data-name="Besserer Weg" data-art="alt" data-lines="${r.alt.pts.map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';')}" data-pts="${route}">${ic('map')}Weg auf der Karte</button></div>`;
    } else if (FUSS_PEN[type] && lines.length && !r.altDone) altHtml = '<p class="small muted" role="status">Flowtown sucht einen Weg mit weniger Hindernissen …</p>';
    else if (FUSS_PEN[type] && lines.length && r.altDone) altHtml = '<p class="small muted">Einen besseren Weg ohne große Umwege gibt es laut den Kartendaten nicht.</p>';
    return `<div class="rad-rate"><h4 class="vf-h4">${title}${type ? ' · ' + esc(ACCESS_LABEL[type]) : ''}</h4>${bar}${lines.length ? `<ul class="rad-ohne bf-list">${lines.join('')}</ul>` : ''}${altHtml}`
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
    for (const t of tiles) for (const w of t.ways) {
      const f = pen[w.c] == null ? 1.1 : pen[w.c];
      if (f === Infinity) continue;
      for (let i = 0; i < w.g.length - 1; i++) {
        if (!inBox(w.g[i]) && !inBox(w.g[i + 1])) continue;
        const a = node(w.g[i]), b = node(w.g[i + 1]);
        const d = dist({ lat: lat[a], lon: lon[a] }, { lat: lat[b], lon: lon[b] });
        adj[a].push(b, d, d * f); adj[b].push(a, d, d * f);
      }
    }
    const extra = new Float64Array(lat.length);
    for (const t of tiles) for (const n of t.nodes) { const i = id.get(n[0] + ',' + n[1]); if (i != null) extra[i] += n[2] === 'b' ? pen.b : n[2] === 'g' ? pen.g : 0; }
    const snap = (p) => { let best = -1, bd = 80; for (let i = 0; i < lat.length; i++) { if (!adj[i].length) continue; const d = dist({ lat: lat[i], lon: lon[i] }, { lat: p[0], lon: p[1] }); if (d < bd) { bd = d; best = i; } } return best; };
    const s = snap(from), e = snap(to);
    if (s < 0 || e < 0) return null;
    // A*: Kosten = Länge mal Aufschlag, Schätzung = Luftlinie (nie zu hoch, weil Aufschläge mindestens 1 sind)
    const g = new Float64Array(lat.length).fill(Infinity), prev = new Int32Array(lat.length).fill(-1), len = new Float64Array(lat.length);
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
      for (let k = 0; k < a.length; k += 3) {
        const v = a[k], c = g[u] + a[k + 2] + extra[v];
        if (c < g[v]) { g[v] = c; prev[v] = u; len[v] = len[u] + a[k + 1]; push([c + h(v), v]); }
      }
    }
    if (g[e] === Infinity) return null;
    const path = [];
    for (let i = e; i >= 0; i = prev[i]) path.push([lat[i], lon[i]]);
    path.reverse();
    return { pts: path, m: len[e] };
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
  function renderMap() {
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
        L.circleMarker([a.lat, a.lon], { radius: 8 + Math.sqrt(avgAll) * 5, color: col, weight: 2, fillColor: col, fillOpacity: 0.45 })
          .bindPopup(`<strong>${esc(labelFor(a.sample))}</strong><br>${n} Fahrten, ${fmtPct(a.halts / n)} mit Halt<br>Ø Wartezeit ${Math.round(avgAll)} s, längste ${fmtS(a.maxWait)}${a.up || a.down ? `<br>Bewertung: ${a.up} gut, ${a.down} schlecht` : ''}${settings.access.on ? `<br>${esc(accText(a.signal))}` : ''}<br><br>${dirLines}`)
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
      parts.push(`<div class="rad-keys">${Object.keys(RAD_CLS).map((k) => `<span class="rad-key"><i style="background:${RAD_CLS[k].col}"></i>${keyText[k]}</span>`).join('')}</div><p class="muted">Radwege laut OpenStreetMap, nicht überall vollständig.</p>`);
    }
    if (mapLayers.acc) parts.push(`<p><b>Barrierefrei${settings.access.on ? ' für ' + esc(ACCESS_LABEL[settings.access.type]) : ''}:</b> Orte von „Bielefeld barrierefrei erleben“ (Bethel). Grün: passt, gelb: teilweise, rot: eher nicht, grau: keine Angabe. Blaue Punkte: rollstuhlgerechte Toiletten. Blaues i mit gestrichelter Linie: Straße oder Platz mit Hinweisen aus der Altstadt-FAQ, die Linie zeigt, welcher Bereich gemeint ist${settings.access.on ? '' : '. Wähle in den Einstellungen dein Profil, dann zeigt die Karte, was für dich zählt'}.</p>`);
    if (mapLayers.tram) parts.push('<p><b>Stadtbahn:</b> Linien von Haltestelle zu Haltestelle, vereinfacht. Tippe auf eine Haltestelle für die nächsten Abfahrten.</p>');
    const n = (k) => (lageCounts[k] != null ? ` (${lageCounts[k]})` : '');
    if (mapLayers.lage) parts.push(`<div class="rad-keys"><span class="rad-key"><i style="background:#e0a326"></i>Baustelle${n('baustelle')}</span><span class="rad-key"><i class="dash"></i>Sperrung${n('sperrung')}</span></div>`);
    if (mapLayers.stau) parts.push(`<div class="rad-keys"><span class="rad-key"><i style="background:#d64933"></i>Stau</span><span class="rad-key"><i style="background:#e0a326;opacity:.75"></i>stockend</span></div><p class="muted">Stau jetzt${n('stau')}: Verkehrsfluss von HERE, alle paar Minuten neu.</p>`);
    $('#map-legend').innerHTML = parts.join('') || '<p class="muted">Schalte oben eine Ebene ein.</p>';
  }
  // Radwege der sichtbaren Kacheln, eine nach der anderen (der Dienst erlaubt nur zwei Anfragen gleichzeitig)
  let radRenderer = null, radDrawn = '', radRun = 0;
  async function drawRad() {
    if (!map || !mapLayers.rad) return;
    const g = groups.rad, b = map.getBounds();
    if (map.getZoom() < 14) { g.clearLayers(); radDrawn = ''; mapStatus('Für die Radwege näher heranzoomen.'); return; }
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
        .bindPopup(`<strong>Rollstuhlgerechte Toilette</strong>${w[3] ? '<br>' + esc(w[3]) : ''}${w[4] ? '<br>mit Euroschlüssel' : ''}<br><span class="muted">Laut OpenStreetMap</span>`).addTo(g);
    }
    for (const a of bfData.lift || []) {
      L.circleMarker([a[0], a[1]], { radius: 4, color: '#1d5fa6', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }).bindPopup('<strong>Aufzug</strong><br><span class="muted">Laut OpenStreetMap, ohne Angabe, ob er gerade geht</span>').addTo(g);
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
  async function drawTram() {
    const g = groups.tram;
    g.clearLayers();
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
        const n = fp.stops[si][1].replace(/^Bielefeld,\s*/, '');
        if (!stopsShown[n]) stopsShown[n] = [fp.stops[si][2], fp.stops[si][3], fp.stops[si][4]];
        else if (fp.stops[si][4] && !stopsShown[n][2]) stopsShown[n][2] = fp.stops[si][4];
      }
    });
    for (const n of Object.keys(stopsShown)) {
      L.circleMarker(stopsShown[n].slice(0, 2), { radius: 5, color: '#15191e', weight: 2, fillColor: '#ffffff', fillOpacity: 1 })
        .bindPopup(() => {
          const deps = departures(n, new Date(), 30).slice(0, 4);
          const w = stopsShown[n][2];
          return `<strong>${esc(n)}</strong>${w === 1 ? '<br>' + bfMark(1) + ' stufenlos zugänglich' : w === 2 ? '<br>' + bfMark(0) + ' nicht stufenlos' : ''}${deps.length ? '<br>' + deps.map((d) => `${hhmm(d.t % 1440)} · ${esc(d.line)} → ${esc(d.head)}`).join('<br>') : '<br>In der nächsten halben Stunde keine Abfahrt.'}`;
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
      const pop = `<strong>${esc(it.titel || LAGE_LABEL[it.art] || 'Meldung')}</strong><br>${esc(it.fluss && it.art !== 'sperrung' ? (it.art === 'stau' ? 'Stau' : 'stockender Verkehr') : LAGE_LABEL[it.art] || '')}${it.bis ? esc(fmtBis(it.bis)) : ''}${it.text ? '<br>' + esc(it.text) : ''}<br><span style="color:#5b636b">${esc(it.quelle || '')}</span>`;
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
  function showView(name) {
    if (name !== 'map') stopMyLocation();
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
    document.body.dataset.view = name;   // Farbe und Ruhe je Ansicht (Aufzeichnung ohne Menü)
    const tabFor = { drive: 'start', review: 'stats', plan: 'start' };
    // Womit? und das Profil gehören zu beiden Seiten: Heute (Losfahren) und Planen
    if (name === 'start' || name === 'plan') { const slot = $('#mode-slot-' + name), box = $('#mode-box'); if (box.parentNode !== slot) slot.appendChild(box); }
    $$('.tabs button').forEach((b) => {
      const active = b.dataset.view === (tabFor[name] || name);
      if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (name === 'stats') renderStats();
    if (name === 'tips') renderTips();
    if (name === 'map') { mapFitted = false; renderMap(); }
    if (name === 'start') { renderToday(); renderLastTrip(); }
    if (name === 'plan') { $('#plan-off').hidden = !!apiBase(); renderToday(); }
    if (name === 'more') { updateSignalsInfo(); renderPilotCard(); renderMoreSubs(); }
    if (name === 'start') renderA2hs();
    const h = $('#view-' + name + ' h2');
    if (h && name !== 'drive') { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  // ---------- Heute: Verkehrsmittel, eigene Wege, beste Abfahrtszeit ----------
  const heuteOn = () => !$('#view-start').hidden || !$('#view-plan').hidden;
  // Heute, Karte „Wohin?“: die eigenen Ziele zum direkten Antippen, Planen öffnet eine eigene Seite
  function renderPlanTeaser() {
    const el = $('#plan-teaser');
    el.innerHTML = apiBase() && settings.ziele.length
      ? `<div class="vf-chips" role="group" aria-label="Deine Ziele">${settings.ziele.map((z) => `<button type="button" class="vf-chip" data-plan-ziel="${z.id}">${esc(z.name)}</button>`).join('')}</div>`
      : '';
    $('#btn-plan span').textContent = settings.ziele.length ? 'Weg planen' : 'Erstes Ziel anlegen';
  }
  function openPlan(id) {
    zielEdit = false;
    if (id) { zielOpen = id; if (id !== 'neu') { const z = settings.ziele.find((x) => x.id === id); if (z) checkZiel(z); } }
    showView('plan');
    if (zielOpen === 'neu') { const i = $('#inp-ziel'); if (i) i.focus(); }
  }
  const MODE_GROUP = { auto: 'auto', rad: 'rad', bus: 'oepnv', bahn: 'oepnv', zug: 'oepnv', fuss: 'fuss' };
  const GROUP_WITH = { auto: 'mit dem Auto', rad: 'mit dem Rad', oepnv: 'mit Bus und Bahn', fuss: 'zu Fuß' };
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const durText = (ms) => (ms >= 3600000 ? fmtDur(ms) : fmtDur(ms) + ' min');
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
  function renderToday() {
    const group = MODE_GROUP[selectedMode()];
    renderAccRow();
    renderStatus(group);
    renderVorfahrt();
    renderPlanTeaser();
    if (lageOn() && Date.now() - lageAt >= 300000) loadLage().then((ok) => { if (ok && heuteOn()) renderToday(); });
    if (group === 'oepnv' && lageOn() && Date.now() - mbAt >= 900000) loadMobiel().then((ok) => { if (ok && heuteOn()) renderToday(); });
    if (group === 'oepnv' && lageOn() && Date.now() - fpAt >= 6 * 3600e3) loadFahrplan().then(() => { if (heuteOn()) renderVorfahrt(); });
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
  function renderStatus(group) {
    const real = trips.filter((t) => !t.demo);
    const { routes, own } = sortedRoutes(group);
    const ownRoute = routes.find((g) => own(g));
    const mine = ownRoute ? ownRoute.trips.filter((t) => MODE_GROUP[t.mode] === group) : [];
    const bh = mine.length ? bestHour(mine) : null;
    const rows = [];
    let detail = '', hit = false;
    if (group === 'oepnv' && lageOn() && mbItems().mine.some((it) => mbState(it) === 'aktiv')) {
      mbItems().mine.filter((it) => mbState(it) === 'aktiv').slice(0, 2).forEach((x) => rows.push(wrow('amber', esc(x.titel), esc(mbLines(x)), 'data-weg="mobiel"')));
      hit = true;
    } else if (lageOn() && lageCache) {
      const { lines, hits } = myLage(group);
      hits.slice(0, 2).forEach((x) => rows.push(wrow(LAGE_CLS[x.art] === 'red' ? 'red' : 'amber', esc(`${cap(LAGE_LABEL[x.art])}: ${x.titel}`), vfOpen ? 'weniger' : 'ansehen', `data-weg="lage" aria-expanded="${vfOpen}"`)));
      hit = hits.length > 0;
      if (hits.length > 2) rows.push(wrow('amber', `und ${hits.length - 2} weitere Meldung${hits.length > 3 ? 'en' : ''}`, '', `data-weg="lage" aria-expanded="${vfOpen}"`));
      if (hit && vfOpen) detail = `<ul class="lg-list vf-detail">${hits.slice(0, 6).map((y) => lageRow(y.art, lageBtn(y), [LAGE_LABEL[y.art], delayText(y.delay), y.richtungText, lines.length > 1 ? 'auf ' + y.line.name : ''].filter(Boolean).map(esc).join(' · '), y.art !== 'zaeh' ? y.texts[0] : '')).join('')}</ul>`
        + `<p class="small muted lg-src">Stand ${clock(lageCache.t || Date.now())} Uhr · ${esc(lageSrc((lageCache.quellen || []).map((q) => q.name)))}</p>`;
    }
    if (ownRoute) rows.unshift(wrow(hit ? 'amber' : 'green', 'Dein häufigster Weg', `<b>${hit ? 'Ø ' + hm(avgOf(mine.map((t) => (t.end || t.start) - t.start)) / 1000) : 'frei'}</b>`));
    else if (lageOn() && lageCache && !hit) rows.unshift(wrow('green', 'Keine Meldungen auf deinen Wegen', ''));
    else if (lageOn() && !lageCache) rows.unshift(wrow('grey', 'Verkehrslage wird geladen …', ''));
    if (bh) rows.push(wrow('grey', 'An Ampeln um diese Zeit', `<b>Ø ${fmtDur(bh.nowAvg)} min</b>`));
    const week = real.filter((t) => t.start >= weekStart()), wag = aggregate(week);
    if (week.length) rows.push(wrow('grey', 'Diese Woche', `<b>${week.length} Fahrt${week.length === 1 ? '' : 'en'}</b>${wag.halts + wag.passes ? ` · ${fmtPct(wag.halts / (wag.halts + wag.passes))} mit Halt` : ''}`, 'data-goto="stats"'));
    if (!real.length) rows.push(wrow('grey', 'Noch keine Fahrt. Wähle oben, womit du unterwegs bist, und tippe auf Losfahren.', ''));
    $('#weg').innerHTML = rows.join('');
    $('#st-detail').innerHTML = detail;
    const top = computeTips()[0];
    $('#tip-strip').innerHTML = top ? `<button type="button" class="tip-strip" data-goto="tips">${ic('bulb')}<span>${top.num ? `<b>${top.num}</b> · ` : ''}${plain(top.short)}</span>${ic('chevron')}</button>` : '';
  }
  ['#weg', '#tip-strip'].forEach((id) => $(id).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-weg],[data-goto]');
    if (!b) return;
    if (b.dataset.goto) showView(b.dataset.goto);
    else if (b.dataset.weg === 'lage') { vfOpen = !vfOpen; renderStatus(MODE_GROUP[selectedMode()]); }
    else if (b.dataset.weg === 'mobiel') { showView('plan'); if (!$('#vorfahrt').hidden) $('#vorfahrt').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));

  // ---------- Flowtown-Server: Ebene „Wir“, KI-Einschätzung, Meldungen ----------
  const apiBase = () => (settings.server.url || '').trim().replace(/\/+$/, '');
  async function api(pathPart, opts) {
    const res = await fetchWithTimeout(apiBase() + pathPart, opts || {}, pathPart === '/api/ki' ? 45000 : 15000);
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
  let fp = null, fpAt = 0, fpLoading = false, fpErr = '', hsAdd = false, hsOpen = null, hsHits = null;
  async function loadFahrplan() {
    if (!lageOn() || fpLoading || Date.now() - fpAt < 6 * 3600e3) return false;
    fpLoading = true;
    try {
      const d = await api('/api/fahrplan', { cache: 'no-cache' });
      // Haltestellen nach Namen zusammenfassen (je Steig ein Eintrag), Haltefolgen je Haltestelle
      const byName = {}, patsOf = {};
      d.stops.forEach((st, i) => { const n = st[1].replace(/^Bielefeld,\s*/, ''); (byName[n] = byName[n] || []).push(i); });
      d.patterns.forEach((pat, pi) => pat.forEach((si) => { (patsOf[si] = patsOf[si] || new Set()).add(pi); }));
      fp = Object.assign(d, { byName, patsOf, names: Object.keys(byName).sort((a, b) => a.localeCompare(b, 'de')), svcDay: {} });
      fpAt = Date.now(); fpErr = '';
      return true;
    } catch (e) {
      fpErr = /Noch kein Fahrplan/.test(e.message) ? 'Der Fahrplan ist auf dem Server noch nicht eingerichtet.' : 'Der Fahrplan ist gerade nicht erreichbar.';
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
  function departures(name, now, span) {
    const idx = new Set(fp.byName[name] || []), pats = new Set();
    idx.forEach((si) => (fp.patsOf[si] || []).forEach((pi) => pats.add(pi)));
    const nowMin = now.getHours() * 60 + now.getMinutes(), out = [];
    const days = [[servicesOn(ymd(now)), 0], [servicesOn(ymd(new Date(now - 864e5))), 1440]];
    for (const [r, pi, h, sv, start, deltas, nr] of fp.trips) {
      if (!pats.has(pi)) continue;
      for (const [on, shift] of days) {
        if (!on.has(sv)) continue;
        const pat = fp.patterns[pi];
        let t = start - shift;
        for (let k = 0; k < pat.length - 1; k++) {   // an der Endhaltestelle fährt nichts mehr ab
          if (k) t += deltas[k - 1];
          if (t > nowMin + span) break;
          if (idx.has(pat[k]) && t >= nowMin) out.push({ t, line: fpLine(r, nr), kind: fp.routes[r][1], head: fp.heads[h].replace(/^Bielefeld,\s*/, '') });
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
  const fpName = (si) => fp.stops[si][1].replace(/^Bielefeld,\s*/, '');
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
      const rows = list.slice(0, 8).map((d) => { const inMin = d.t - nowMin;
        return `<li class="dep${mineL.includes(d.line) ? ' mine' : ''}"><b class="dep-t">${hhmm((d.t + 1440) % 1440)}</b><span class="dep-line${d.kind === 0 ? ' tram' : d.kind === 2 ? ' rail' : ''}">${esc(d.line)}</span><span class="dep-head">${esc(d.head)}</span><span class="dep-in">${inMin <= 0 ? 'jetzt' : inMin < 60 ? `in ${inMin} min` : ''}</span></li>`; }).join('');
      body = rows ? `<ul class="dep-list" aria-label="Abfahrten ${esc(open)}">${rows}</ul>` : '<p class="small">In den nächsten drei Stunden fährt hier laut Fahrplan nichts.</p>';
      body += `<p class="small muted lg-src">Laut Fahrplan, ohne Verspätungen · <button type="button" class="btn-link" data-hs-del="${esc(open)}">${esc(open)} entfernen</button> · Fahrplan: DELFI (CC BY 4.0), Stand ${esc((fp.stand || '').slice(8, 10) + '.' + (fp.stand || '').slice(5, 7) + '.')}</p>`;
    }
    return `<section class="vf world-vor" aria-labelledby="hs-h"><h3 class="vf-title" id="hs-h">Nächste Abfahrten</h3>
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
      fp.stops.forEach((st) => { const n = st[1].replace(/^Bielefeld,\s*/, ''), d = dist(me, { lat: st[2], lon: st[3] }); if (best[n] == null || d < best[n]) best[n] = d; });
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
  let pendingPlan = null;
  let vfOpen = false, zielOpen = null, zielEdit = false, ortList = null, ortQ = '', ortMsg = '';
  const zielRes = {};   // Ziel-ID|Verkehrsmittel → { t, data } | { loading } | { error }
  if (!Array.isArray(settings.ziele)) settings.ziele = [];
  const zielFor = (group) => (group === 'auto' || group === 'rad' || group === 'oepnv' || group === 'fuss');
  let zielAb = null, conOpen = 0;   // Bus und Bahn: Start an einer eigenen Haltestelle (sonst Standort), aufgeklappte Verbindung
  const zKey = (z, group) => z.id + '|' + group + (group === 'oepnv' ? '|' + (zielAb || '') : '');
  const hm = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h` : `${m} min`; };
  const hmSay = (s) => { const m = Math.round(s / 60), h = Math.floor(m / 60); return (h ? `${h} Stunde${h === 1 ? '' : 'n'} ` : '') + `${m % 60} Minute${m % 60 === 1 ? '' : 'n'}`; };

  function renderVorfahrt() {
    const el = $('#vorfahrt'), wo = $('#wohin');
    if (!apiBase()) { el.hidden = true; el.innerHTML = ''; wo.innerHTML = ''; return; }
    const group = MODE_GROUP[selectedMode()];
    const wohin = wohinSection(group);
    if (wohin === null) return;   // wird gerade geprüft, zeichnet sich danach neu
    wo.innerHTML = wohin;
    // Bus und Bahn: unter den Kacheln die Abfahrten und die Umleitungen von moBiel
    const rest = group === 'oepnv' && lageOn() ? abfahrtSection() + mobielSection() : '';
    el.hidden = !rest; el.innerHTML = rest;
  }
  function wohinSection(group) {
    const can = zielFor(group);
    const chips = settings.ziele.map((z) => `<button type="button" class="vf-chip${zielOpen === z.id ? ' on' : ''}" data-ziel="${z.id}" aria-expanded="${zielOpen === z.id}"${can ? '' : ' disabled'}>${esc(z.name)}</button>`).join('')
      + (settings.ziele.length < ZIEL_MAX ? `<button type="button" class="vf-chip add${zielOpen === 'neu' ? ' on' : ''}" data-ziel="neu" aria-expanded="${zielOpen === 'neu'}"${can ? '' : ' disabled'}>+ Ziel</button>` : '');
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
      <p class="small muted">${ic('shield')} Für die Prüfung gehen das Ziel und dein ungefährer Standort (auf etwa 1 km gerundet, zu Fuß auf etwa 100 m) an den Flowtown-Server und an HERE. Gespeichert wird dort nichts, deine Ziele bleiben auf dem Handy. Fährst du mit Ziel los, merkt sich die Fahrt nur dessen Namen und die geplante Zeit.</p></div>`;
  }
  function zielPanel(z, group) {
    if (!z) return '';
    const head = `<div class="vf-phead"><b>${esc(z.name)}</b><button type="button" class="btn-link" data-vf="edit">Bearbeiten</button><button type="button" class="vf-x" data-vf="close" aria-label="Schließen">${ic('x')}</button></div>`;
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
    const alt = d.alternative ? `<p class="tip">${ic('route')}<span>Ausweichen${d.alternative.strassen.length ? ' über ' + esc(d.alternative.strassen.join(', ')) : ''}: etwa ${Math.round((d.dauer - d.alternative.dauer) / 60)} min schneller</span></p>` : '';
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
    const go = `<button type="button" class="btn primary" data-vf="go">${ic('play')}${group === 'fuss' ? 'Losgehen mit Ziel' : 'Fahrt starten mit Ziel'}</button>`;
    const foot = `<p class="small muted lg-src">Stand ${clock(d.t)} Uhr · ${esc(lageSrc(['HERE'].concat(d.items.some((it) => it.quelle === 'Autobahn GmbH') ? ['Autobahn GmbH'] : [])))} · <button type="button" class="btn-link" data-vf="again">neu prüfen</button></p>`;
    return `<div class="vf-panel">${head}${sum}${group === 'rad' ? radBlock(r.rad, route) : group === 'fuss' ? fussBlock(r.fuss, route) : ''}${alt}${rows}${bars}${bfZielBlock(z, group)}${zielHistory(z)}${go}${all}${foot}</div>`;
  }
  // Barrierefrei bei Bus und Bahn: Haltestellen stufenlos laut Fahrplan, Fußwege mit Weg-Check
  function stopAccess(pos) {
    if (!pos || !fp) return null;
    const near = fpStopsNear({ lat: pos[0], lon: pos[1] }, 80).map((i) => fp.stops[i][4]).filter((v) => v === 1 || v === 2);
    return near.includes(1) ? 1 : near.length ? 0 : null;
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
    const head = `<div class="vf-phead"><b>${esc(z.name)}</b><button type="button" class="btn-link" data-vf="edit">Bearbeiten</button><button type="button" class="vf-x" data-vf="close" aria-label="Schließen">${ic('x')}</button></div>`;
    const abs = settings.haltestellen.length && fp ? `<div class="vf-chips" role="group" aria-label="Start"><span class="small muted">Ab</span>${settings.haltestellen.map((n) => `<button type="button" class="vf-chip${zielAb === n ? ' on' : ''}" data-zab="${esc(n)}" aria-pressed="${zielAb === n}">${esc(n)}</button>`).join('')}<button type="button" class="vf-chip${zielAb ? '' : ' on'}" data-zab="" aria-pressed="${!zielAb}">${ic('pin')}Standort</button></div>` : '';
    const r = zielRes[zKey(z, group)];
    if (!r || r.loading) return `<div class="vf-panel">${head}${abs}<p class="small muted" role="status">Verbindungen werden gesucht …</p></div>`;
    if (r.error) return `<div class="vf-panel">${head}${abs}<p class="small" role="status">${esc(r.error)}</p><button type="button" class="btn quiet" data-vf="again">Noch einmal suchen</button></div>`;
    const d = r.data, now = Date.now();
    const cons = (d.verbindungen || []).filter((c) => Date.parse(c.ab) > now - 60000);
    if (conOpen >= cons.length) conOpen = 0;
    const badge = (x) => `<span class="dep-line${ART_LABEL[x.art] ? ' ' + ART_LABEL[x.art] : ''}">${esc(x.linie || '?')}</span>`;
    const rows = cons.map((c, i) => {
      const dur = (Date.parse(c.an) - Date.parse(c.ab)) / 1000, fahrt = c.teile.filter((x) => x.art !== 'fuss');
      const late = fahrt.some((x) => x.plus) ? ` · <b class="con-late">+${Math.max(...fahrt.map((x) => x.plus || 0))} min</b>` : '';
      if (i === conOpen) conCheck(c, z);
      const acc = settings.access.on;
      const stufe = (pos) => { if (!acc) return ''; const a = stopAccess(pos); return a === 1 ? ` <span class="con-acc ok">${bfMark(1)} stufenlos</span>` : a === 0 ? ` <span class="con-acc">${bfMark(0)} nicht stufenlos</span>` : ''; };
      const walkCheck = (x) => {
        if (!acc || !x.pts) return '';
        if (!x.wc || x.wc.loading) return ' · <span class="small muted">wird geprüft …</span>';
        if (x.wc.error) return '';
        const f = fussSummary(x.wc, settings.access.type);
        return ` · ${f.ok ? bfMark(1) + ' keine Hindernisse bekannt' : bfMark(0) + ' ' + esc(f.text)} <button type="button" class="btn-link" data-peek="l" data-name="Fußweg" data-art="alt" data-lines="${x.pts.map((q) => q.join(',')).join(';')}" data-pts="">Karte</button>`;
      };
      const legs = i === conOpen ? `<ol class="con-legs">${c.teile.map((x) => x.art === 'fuss'
        ? `<li class="small muted">${ic('walk')}<span>${Math.max(1, Math.round((Date.parse(x.an) - Date.parse(x.ab)) / 60000))} min zu Fuß${walkCheck(x)}</span></li>`
        : `<li>${badge(x)}<span><b>${clock(x.ab)}</b> ${esc(x.von)}${x.gleis ? `, Gleis ${esc(x.gleis)}` : ''}${x.plus ? ` <b class="con-late">+${x.plus}</b>` : ''}${stufe(x.vonPos)}<br><span class="small">Richtung ${esc(x.ziel)}</span><br><b>${clock(x.an)}</b> ${esc(x.nach)}${stufe(x.nachPos)}</span></li>`).join('')}</ol>` : '';
      return `<li><button type="button" class="con${i === conOpen ? ' on' : ''}" data-con="${i}" aria-expanded="${i === conOpen}"><span class="con-t"><b>${clock(c.ab)} → ${clock(c.an)}</b><span class="small">${hm(dur)} · ${c.umstiege ? `${c.umstiege}× umsteigen` : 'direkt'}${late}</span></span><span class="con-lines">${fahrt.map(badge).join('')}</span></button>${legs}</li>`;
    }).join('');
    const list = rows ? `<ul class="con-list">${rows}</ul>` : '<p class="small">Gerade keine Verbindung gefunden.</p>';
    const go = cons.length ? `<button type="button" class="btn primary" data-vf="go">${ic('play')}Fahrt starten mit Ziel</button>` : '';
    const foot = `<p class="small muted lg-src">Stand ${clock(d.t)} Uhr · © HERE${d.quellen && d.quellen.length ? ', ' + esc(d.quellen.join(', ')) : ''}${r.fallback ? ' · Start: Bielefeld' : ''} · <button type="button" class="btn-link" data-vf="again">neu suchen</button></p>`;
    return `<div class="vf-panel">${head}${abs}${list}${bfZielBlock(z, group)}${zielHistory(z)}${go}${foot}</div>`;
  }
  // Aus deinen Fahrten: frühere Fahrten zu diesem Ziel, nur angekommene
  // Rad: wie gut ist die Strecke für das Rad, und wo fehlt ein Radweg
  const fmtLen = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${fmtNum(m / 1000, 1)} km`);
  function radBlock(r, route) {
    if (!r) return '';
    if (r.loading) return '<p class="small muted" role="status">Radwege entlang der Strecke werden geprüft …</p>';
    if (r.error) return `<p class="small muted">${esc(r.error)}</p>`;
    const known = r.total - r.m.unbekannt;
    if (known < r.total * 0.3) return '<p class="small muted">Zu dieser Strecke gibt es kaum Angaben zu Radwegen.</p>';
    const order = ['gut', 'ruhig', 'mittel', 'schlecht'];
    const pct = (k) => Math.round(r.m[k] / known * 100);
    const good = pct('gut') + pct('ruhig');
    const title = pct('schlecht') >= 20 ? 'Teils ohne Radweg' : good >= 75 ? 'Gut mit dem Rad' : 'Gemischt';
    const say = order.filter((k) => pct(k)).map((k) => `${pct(k)} % ${RAD_CLS[k].kurz}`).join(', ');
    const bar = `<div class="rad-bar" role="img" aria-label="${esc(say)}">${order.map((k) => (r.m[k] ? `<i style="width:${(r.m[k] / known * 100).toFixed(1)}%;background:${RAD_CLS[k].col}"></i>` : '')).join('')}</div>`;
    const legend = `<p class="rad-legend small">${order.filter((k) => pct(k)).map((k) => `<span><i style="background:${RAD_CLS[k].col}"></i>${pct(k)} % ${esc(RAD_CLS[k].kurz)}</span>`).join('')}</p>`;
    const rows = r.ohne.slice(0, 3).map((x) => `<li class="vf-line"><button type="button" class="place" data-peek="l" data-name="${esc(x.name)}" data-art="rad" data-lines="${x.pts.map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';')}" data-pts="${route}">${esc(x.name)}</button><span class="small muted"> · ${fmtLen(x.m)} ohne Radweg</span></li>`).join('');
    return `<div class="rad-rate"><h4 class="vf-h4">${title}</h4>${bar}${legend}${rows ? `<ul class="rad-ohne">${rows}</ul>` : ''}<p class="small muted">Laut OpenStreetMap, nicht überall vollständig.</p></div>`;
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
  function myStart() {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => resolve([p.coords.latitude, p.coords.longitude]), () => resolve(null), { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 });
    });
  }
  async function checkZiel(z, force) {
    const group = MODE_GROUP[selectedMode()];
    const key = zKey(z, group);
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
      const data = await api(`/api/ziel?from=${from.join(',')}&to=${z.lat},${z.lon}&mode=${group}${halt ? '&ab=halt' : ''}`);
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
              if (ra && fussBad(ra, type) < fussBad(r, type) * 0.6) r.alt = { pts: alt.pts, m: alt.m, plus: alt.m - mainM, r: ra };
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
  }
  async function searchOrt(q) {
    ortQ = q; ortMsg = 'Suche …'; ortList = null; renderVorfahrt();
    await loadBf().catch(() => null);
    const local = bfSearch(q);
    try { ortList = local.concat(((await api('/api/ort?q=' + encodeURIComponent(q))).orte || []).filter((o) => !local.some((l) => dist(l, o) < 80))); ortMsg = ''; }
    catch (e) { ortList = local.length ? local : null; ortMsg = local.length ? '' : e.message; }
    renderVorfahrt();
  }
  function addZiel(o) {
    const z = { id: 'z' + Date.now().toString(36), name: o.name.split(',')[0].slice(0, 30), sub: o.sub || '', lat: o.lat, lon: o.lon };
    if (o.bf) z.bf = o.bf;
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
    if (act === 'close') { zielOpen = null; zielEdit = false; }
    else if (act === 'edit') zielEdit = !zielEdit;
    else if (act === 'again' && z) { checkZiel(z, true); return; }
    else if (act === 'go' && z) {
      const r = zielRes[zKey(z, MODE_GROUP[selectedMode()])];
      if (!r || !r.data) return;
      const d = r.data;
      if (d.mode === 'oepnv') {
        // geplant: von jetzt bis zur Ankunft der gewählten Verbindung; aufgezeichnet wird mit dem ersten Verkehrsmittel
        const c = d.verbindungen[conOpen] || d.verbindungen[0], first = c.teile.find((x) => isTransit(x.art));
        const dauer = Math.max(60, Math.round((Date.parse(c.an) - Date.now()) / 1000));
        pendingPlan = { ziel: z.id, name: z.name, lat: z.lat, lon: z.lon, t: Date.now(), dauer, basis: dauer, km: null, meldungen: [],
          verbindung: c.teile.filter((x) => x.art !== 'fuss').map((x) => `${x.linie} ${clock(x.ab)}`).join(', ') };
        if (first) setModeUI(first.art);
      } else pendingPlan = { ziel: z.id, name: z.name, lat: z.lat, lon: z.lon, t: d.t, dauer: d.abfahrt ? d.abfahrt[0].dauer : d.dauer, basis: d.basis, km: d.km,
        meldungen: d.items.slice(0, 3).map((it) => ({ titel: it.titel, art: it.art, km: it.km })) };
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
  const routeName = (g) => `<button type="button" class="place" data-peek="r" data-pts="${routePts(g)}" data-name="${esc(labelFor(g.first))} → ${esc(labelFor(g.last))}">${esc(labelFor(g.first))}<span class="arrow" aria-label="nach">→</span>${esc(labelFor(g.last))}</button>`;

  // Ungewöhnlich lange Wartezeit an einer Ampel in den letzten 7 Tagen, verglichen mit den übrigen Besuchen
  function tipAnomalies(list) {
    const out = anomalyList(list);
    if (!out.length) return null;
    const first = out[0];
    return { prio: 0, icon: 'alert', cls: 'amber', title: 'Auffällig auf deinen Wegen', cat: 'Ampel', num: durText(first.e.wait),
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
      return { prio, icon: prio === 1 ? 'bike' : 'route', title: routeName(g), meta: `Dein Weg · ${g.trips.length}× unterwegs`, short: short || `${g.trips.length}× unterwegs auf diesem Weg.`,
        head: prio === 1 ? 'Rad ist gleich schnell' : bh.text ? 'Beste Abfahrtszeit' : 'Dein Weg', cat: prio === 1 ? 'Rad' : 'Weg', num: prio === 1 ? `${Math.max(1, Math.round(bikeMs / 60000))} min` : bh.text ? `${bh.best}–${bh.best + 1} Uhr` : `${g.trips.length}×`,
        html: `${bh.text ? `<p class="tip">${ic('bulb')}<span>${bh.text}</span></p>` : ''}${prio === 1 ? `<p class="tip">${ic('bike')}<span>${short}</span></p>` : ''}<div class="alt">${rows.join('')}</div>` };
    });
  }
  function tipTimeEaters(list) {
    const ag = aggregate(list);
    if (!ag.halts) return null;
    const top = ag.approaches.filter((x) => x.halts).sort((x, y) => y.wait - x.wait).slice(0, 3);
    const share = top.reduce((x, y) => x + y.wait, 0) / ag.wait;
    const what = top.length === 1 ? 'eine Ampel' : `${top.length} Ampeln`;
    return { prio: 2, icon: 'hourglass', cls: 'bad', title: 'Deine größten Zeitfresser', cat: 'Ampeln', num: fmtPct(share),
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
    return { prio: 5, icon: 'euro', cls: 'amber', title: 'Was dich Ampeln kosten', meta: 'Die letzten 30 Tage, geschätzt', cat: 'Kosten', num: fmtEuro(halts),
      short: `Ampelhalte kosteten dich etwa ${fmtEuro(halts)}.`,
      html: `<div class="big-line">${ic('euro')}<span><b>${fmtEuro(halts)}</b> für Leerlauf und Anfahren bei ${cs.length} Autofahrt${cs.length === 1 ? '' : 'en'}</span></div>` };
  }
  function tipNews() {
    const ns = myNews();
    if (!ns.length) return null;
    return { prio: -1, icon: 'bell', cls: 'amber', title: 'Meldungen für deine Wege', cat: 'Meldung', num: String(ns.length), short: `${esc(ns[0].titel)}${ns.length > 1 ? ` und ${ns.length - 1} weitere Meldung${ns.length > 2 ? 'en' : ''}` : ''}.`,
      html: `<ul class="ki-list">${ns.map((n) => `<li>${ic('bell')}<span><strong>${esc(n.titel)}</strong>${n.text ? `<br>${esc(n.text)}` : ''}${n.quelle ? `<br><span class="small muted">Quelle: ${esc(n.quelle)}${n.bis ? ` · bis ${esc(n.bis)}` : ''}</span>` : ''}</span></li>`).join('')}</ul>` };
  }
  function computeTips() {
    const list = trips.filter((t) => !t.demo);
    return [tipNews(), tipAnomalies(list)].concat(tipRoutes(list), [tipTimeEaters(list), tipWindows(list), tipStyle(list), tipCosts(list)])
      .filter(Boolean).sort((x, y) => x.prio - y.prio);
  }
  // Tipps: je Tipp eine Zeile mit Titel, einem Satz und der Wirkung als Marke; Einzelheiten beim Antippen
  let tipOpen = null;
  const TIP_WORLD = { Ampeln: 'hist', Ampel: 'hist', Kosten: 'hist', Meldung: 'hist', Weg: 'vor', Rad: 'go', Zeit: 'map', Fahrweise: 'go' };
  function renderTips() {
    const tips = computeTips();
    const n = trips.filter((t) => !t.demo).length;
    $('#tips-small').textContent = tips.length ? `${tips.length} für dich, aus ${n} Fahrt${n === 1 ? '' : 'en'}. Tippe für Einzelheiten.` : `Noch zu wenig Daten (${n} Fahrt${n === 1 ? '' : 'en'}).`;
    const card = (x, i) => `<div class="tipcard" data-world="${TIP_WORLD[x.cat] || 'tip'}"><button type="button" class="tip-row" data-tip="${i}" aria-expanded="${tipOpen === i}"><span class="tip-ic">${ic(x.icon)}</span><span class="tip-main"><b>${x.head || plain(x.title)}</b><span>${plain(x.short)}</span></span>${x.num ? `<span class="tip-num">${x.num}</span>` : ''}</button>${tipOpen === i ? `<div class="tip-detail">${x.html}</div>` : ''}</div>`;
    const news = '';   // Meldungen erscheinen nur, wenn es welche für die eigenen Wege gibt
    $('#tips-body').innerHTML = (tips.length ? `<h3 class="eyebrow">Für deine Wege</h3>${tips.map(card).join('')}`
      : `<p class="lead-text">Nach ein paar Fahrten auf deinen üblichen Wegen stehen hier deine Zeitfresser, die beste Abfahrt und Alternativen mit Rad oder zu Fuß.</p>`)
      + faqCards() + `<h3 class="eyebrow">Mehr Hilfe</h3>${kiCard()}` + news;
    if (settings.access.on && !faq) loadFaq().then(() => { if (faq && !$('#view-tips').hidden) renderTips(); });
    requestNames([].concat(...trips.map((t) => t.events.filter((e) => e.signal))), () => { if (!$('#view-tips').hidden) renderTips(); });
    // Werte anderer und Meldungen nachladen, dann einmal neu zeichnen
    if (!tipsLoading && apiBase() && (Date.now() - newsAt > 600000 || (settings.server.wir && Date.now() - wirAt > 600000))) {
      tipsLoading = true;
      Promise.all([loadNews(), loadWir()]).then(() => { if (!$('#view-tips').hidden) renderTips(); }).finally(() => { tipsLoading = false; });
    }
  }
  let tipsLoading = false;
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
  function kiCard() {
    if (!apiBase()) return '';
    if (!settings.server.ki) return `<div class="card">${cardHead('spark', 'KI-Einschätzung', 'Mistral, EU')}<p class="small muted">Unter „Mehr“ erlauben, dann gibt es persönliche Empfehlungen.</p></div>`;
    const r = kiState.result;
    const L2 = kiLinker();
    const body = r ? `<p>${L2(r.einschaetzung)}</p>${r.groesster_hebel ? `<p class="tip">${ic('spark')}<span><strong>Größter Hebel:</strong> ${L2(r.groesster_hebel)}</span></p>` : ''}<ul class="ki-list">${r.empfehlungen.map((e) => `<li>${ic('bulb')}<span><strong>${L2(e.titel)}</strong><br>${L2(e.text)}</span></li>`).join('')}</ul>
      <p class="small muted">${esc(r.modell || 'Mistral')} · ${esc(dayLabel(r.t))} · KI kann sich irren</p>` : '<p class="small muted">Persönliche Einschätzung aus deinen Werten.</p>';
    return `<div class="card">${cardHead('spark', 'KI-Einschätzung', 'Mistral, EU')}${body}${kiState.error ? `<p class="msg warn">${esc(kiState.error)}</p>` : ''}
      <button type="button" class="btn${r ? '' : ' primary'}" id="btn-ki" ${kiState.busy ? 'disabled' : ''}>${ic('spark')}${kiState.busy ? 'Einschätzung wird erstellt …' : r ? 'Neu einschätzen' : 'Einschätzung holen'}</button></div>`;
  }
  // Zusammengefasste Werte für die KI: keine Koordinaten, keine Uhrzeiten einzelner Fahrten, keine Start- und Zielorte
  function kiFacts() {
    const list = trips.filter((t) => !t.demo);
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
      app_hinweise: computeTips().filter((x) => x.icon !== 'bell').map((x) => plain(x.title) + ': ' + plain(x.short)),
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
      const r = await postJson('/api/ki', { facts: kiFacts() });
      kiState.result = Object.assign({ t: Date.now() }, r);
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
  function tripRow(t) {
    const h = t.events.filter((e) => e.type === 'halt' && e.signal);
    const wait = h.reduce((x, e) => x + e.wait, 0);
    const time = new Date(t.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const trs = (t.transfers || []).length;
    return `<li><button type="button" class="trow" data-review="${t.id}">
      <span class="t-time">${time}</span>
      <span class="chip sm">${ic(MODE_ICON[t.mode] || 'route')}</span>
      <span class="t-main"><b>${legChain(t)}${t.demo ? ' <span class="badge">Demo</span>' : ''}</b><span class="t-sub">${t.plan ? `<span>→ ${esc(t.plan.name)}</span> · ` : ''}<span>${Math.max(1, Math.round(((t.end || t.start) - t.start) / 60000))} min</span> · <span>${fmtNum(t.distance / 1000, 1)} km</span>${trs ? ` · <span>${trs} Umstieg${trs === 1 ? '' : 'e'}</span>` : ''}</span>${tripBar(t, wait)}</span>
      <span class="t-pills"><span class="pill${h.length ? ' amber' : ' green'}" title="Halte an Ampeln">${ic('light')}${h.length}</span>${h.length ? `<span class="pill ${wait > 60000 ? 'red' : 'amber'}" title="gewartet">${ic('hourglass')}${fmtDur(wait)}</span>` : ''}</span>
      ${ic('chevron', 't-go')}
    </button></li>`;
  }
  function tripTimeline(list, maxRows) {
    const sorted = list.slice().sort((x, y) => y.start - x.start).slice(0, maxRows || 1e9);
    const days = [];
    for (const t of sorted) { const k = dayStart(t.start); const d = days[days.length - 1]; if (d && d.k === k) d.trips.push(t); else days.push({ k, trips: [t] }); }
    return days.map((d) => `<div class="day"><h4 class="day-title">${dayTitle(d.k)}</h4><ul class="tlist">${d.trips.map(tripRow).join('')}</ul></div>`).join('');
  }

  function renderLastTrip() {
    $('#today-date').textContent = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#hints').open = !trips.some((x) => !x.demo);   // Hinweise nur offen, solange es noch keine Fahrt gibt
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
    $('#btn-intro-next').textContent = introOnly ? 'Zurück zur App' : 'Weiter';
    $('#w-steps1').hidden = introOnly;
    const h = $(n === 1 ? '#h-welcome' : '#h-welcome2');
    h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
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
  $('#plan-teaser').addEventListener('click', (ev) => { const c = ev.target.closest('[data-plan-ziel]'); if (c) openPlan(c.dataset.planZiel); });
  $('#btn-plan-back').addEventListener('click', () => showView('start'));
  $('#tips-body').addEventListener('click', (ev) => {
    if (ev.target.closest('#btn-ki')) { runKi(); return; }
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
  // Heute, bei Bus & Bahn und zu Fuß: Profil mit einem Tipp wählen, dazu passende Hinweise
  let accTipOpen = null;
  function renderAccRow() {
    const group = MODE_GROUP[selectedMode()];
    const show = group === 'oepnv' || group === 'fuss';
    $('#acc-row').hidden = !show;
    $$('#acc-row .acc-chip').forEach((b) => b.setAttribute('aria-pressed', String(settings.access.on && settings.access.type === b.dataset.acc)));
    $('.access-row').hidden = show;   // die alte Zeile unten nur noch bei Auto und Rad
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
  $('#acc-row').addEventListener('click', (ev) => {
    const b = ev.target.closest('.acc-chip');
    if (!b) return;
    const on = !(settings.access.on && settings.access.type === b.dataset.acc);
    settings.access = { on, type: b.dataset.acc };
    store.set('settings', settings);
    applyAccessUI();
    renderToday();
  });
  $('#acc-tips').addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-acctip]');
    if (t) { accTipOpen = accTipOpen === t.dataset.acctip ? null : t.dataset.acctip; renderAccRow(); }
  });
  // Profil barrierefrei: auf „Heute“ und in den Einstellungen, beide zeigen immer dasselbe
  function applyAccessUI() {
    const a = settings.access;
    $('#inp-access').checked = !!a.on;
    $('#inp-access-type').value = a.type;
    $('#inp-access-type').hidden = !a.on;
    $('#set-access').value = a.on ? a.type : 'aus';
    $('#set-big').checked = !!settings.big;
    $('#access-sub').textContent = (a.on ? ACCESS_LABEL[a.type] : 'Kein Profil') + (settings.big ? ' · große Schrift' : '');
    document.documentElement.classList.toggle('gross', !!settings.big);
  }
  const saveAccess = () => {
    settings.access = { on: $('#inp-access').checked, type: $('#inp-access-type').value };
    store.set('settings', settings);
    applyAccessUI();
    renderToday();
  };
  $('#set-access').addEventListener('change', (ev) => {
    const v = ev.target.value;
    settings.access = { on: v !== 'aus', type: v === 'aus' ? settings.access.type : v };
    store.set('settings', settings);
    applyAccessUI();
  });
  $('#set-big').addEventListener('change', (ev) => { settings.big = ev.target.checked; store.set('settings', settings); applyAccessUI(); });
  $('#inp-access').addEventListener('change', saveAccess);
  $('#inp-access-type').addEventListener('change', saveAccess);
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
  clusters = buildClusters(signalCache.nodes);
  // Ältere Fahrten nachbearbeiten: Rückstau-Halte (ab 0.6.0), Kreuzungen und Warten vor der Abfahrt (ab 0.9.0)
  if (trips.map((t) => tidyTrip(t)).some(Boolean)) saveTrips();
  updateSignalsInfo();
  if (!document.body.dataset.view) document.body.dataset.view = 'start';   // Farbe des Kopfs schon beim ersten Öffnen
  renderToday();
  renderLastTrip();
  renderA2hs();
  if (!settings.onboarded || new URLSearchParams(location.search).get('code')) openWelcome();
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
  window.__ww = { onPosition: (p) => onPosition(p), state: () => ({ rec, trips, clusters }), demoRun, review: (id) => openReview(trips.find((t) => t.id === id)) };
})();
