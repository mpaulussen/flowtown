// Flowtown Redaktion: Objekte erfassen, prüfen, Bericht. Spricht mit /api/redaktion/* des Flowtown-Servers.
(function () {
  'use strict';
  var VERSION = '0.1.0';
  var DEFAULT_SERVER = 'https://songdeepdive.de/flowtown-api';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* Speicher voll oder gesperrt */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } }
  };
  var S = { server: '', token: '', rolle: '', name: '', objekte: [], entw: 0, queue: ls.get('rd.queue', []), pos: null, cur: null, notizen: {} };
  var JNW = ['ja', 'teilweise', 'nein'];

  // ---------- Server und Anmeldung
  function defaultServer() {
    var w = ls.get('ww.settings', null);   // gleiche Herkunft wie die Nutzer-App: deren Serveradresse übernehmen
    return (w && w.server && w.server.url) || DEFAULT_SERVER;
  }
  S.server = ls.get('rd.server', '') || defaultServer();
  var sess = ls.get('rd.sitzung', null);
  if (sess && sess.token) { S.token = sess.token; S.rolle = sess.rolle; S.name = sess.name; }
  function base() { return S.server.replace(/\/+$/, ''); }
  function api(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    if (S.token) h.Authorization = 'Bearer ' + S.token;
    return fetch(base() + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && S.token && path !== '/api/redaktion/login') { logout('Bitte neu anmelden.'); }
        if (!r.ok) { var e = new Error(j.fehler || ('Fehler ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function logout(msg) {
    S.token = ''; ls.del('rd.sitzung'); go('#/login'); if (msg) $('#login-msg').textContent = msg;
  }

  // ---------- Warteschlange (Erfassung ohne Netz)
  function saveQueue() { ls.set('rd.queue', S.queue); netState(); }
  function netState() {
    var n = $('#net'); var q = S.queue.length;
    n.className = 'net' + (q || !navigator.onLine ? ' warn' : '');
    n.textContent = !navigator.onLine ? 'Ohne Netz' + (q ? ', ' + q + ' warten' : '') : q ? q + ' warten auf Senden' : '';
    var mq = $('#mehr-queue'); if (mq) mq.textContent = q ? q + ' Angabe' + (q === 1 ? '' : 'n') + ' warten' : 'Nichts wartet.';
  }
  var flushing = false;
  function flush() {
    if (flushing || !S.queue.length || !S.token || !navigator.onLine) return Promise.resolve();
    flushing = true;
    function next() {
      if (!S.queue.length) { flushing = false; netState(); return Promise.resolve(); }
      var it = S.queue[0];
      return api(it.path, { method: 'POST', body: it.body }).then(function () { S.queue.shift(); saveQueue(); return next(); }, function (e) {
        if (e.status && e.status < 500 && e.status !== 401 && e.status !== 429) { S.queue.shift(); saveQueue(); return next(); }   // wird nie angenommen: verwerfen
        flushing = false; netState();
      });
    }
    return next();
  }
  function send(path, body) {
    return api(path, { method: 'POST', body: body }).then(function (j) { return { ok: true, j: j }; }, function (e) {
      if (e.status) throw e;   // der Server hat geantwortet und abgelehnt
      S.queue.push({ path: path, body: body, t: Date.now() }); saveQueue();
      return { ok: false, queued: true };
    });
  }

  // ---------- Hilfen
  function ago(t) {
    if (!t) return '';
    var d = Math.max(0, Date.now() - t), m = Math.round(d / 60000);
    if (m < 2) return 'gerade eben'; if (m < 90) return 'vor ' + m + ' Minuten';
    var h = Math.round(d / 3600000); if (h < 36) return 'vor ' + h + ' Stunden';
    var dd = Math.round(d / 86400000); if (dd < 60) return 'vor ' + dd + ' Tagen';
    return 'vor ' + Math.round(dd / 30) + ' Monaten';
  }
  function distM(a, b, c, d) { return Math.round(Math.hypot((a - c) * 111320, (b - d) * 68500)); }
  function osmLink(o) { return 'https://www.openstreetmap.org/?mlat=' + o.lat + '&mlon=' + o.lon + '#map=19/' + o.lat + '/' + o.lon; }
  var ABBILD = { yes: 'ja', no: 'nein', limited: 'teilweise' };

  // ---------- Navigation
  var VIEWS = ['login', 'liste', 'objekt', 'entwuerfe', 'bericht', 'mehr'];
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function route() {
    var h = location.hash || '#/liste', m = /^#\/([a-z]+)(?:\/(.+))?$/.exec(h) || [0, 'liste'];
    var v = m[1];
    if (!S.token) v = 'login';
    else if (v === 'login') v = 'liste';
    if (VIEWS.indexOf(v) < 0) v = 'liste';
    if (v === 'entwuerfe' && S.rolle !== 'redaktion') v = 'liste';
    VIEWS.forEach(function (x) { $('#v-' + x).hidden = x !== v; });
    $('#tabs').hidden = v === 'login';
    document.querySelectorAll('#tabs a').forEach(function (a) { var on = a.dataset.t === (v === 'objekt' ? 'liste' : v); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#t-entw').hidden = S.rolle !== 'redaktion';
    document.title = { login: 'Anmelden', liste: 'Objekte', objekt: 'Objekt', entwuerfe: 'Entwürfe', bericht: 'Bericht', mehr: 'Mehr' }[v] + ' – Flowtown Redaktion';
    if (v === 'liste') loadListe();
    else if (v === 'objekt') loadObjekt(decodeURIComponent(m[2] || ''));
    else if (v === 'entwuerfe') loadEntwuerfe();
    else if (v === 'bericht') loadBericht();
    else if (v === 'mehr') renderMehr();
    if (v !== 'objekt') { var hh = $('#v-' + v + ' h1'); if (hh && !window.__rdFirst) { window.__rdFirst = 1; } else if (hh) hh.setAttribute('tabindex', '-1'); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  // ---------- Liste
  function loadListe() {
    var cached = ls.get('rd.cache.objekte', null);
    if (cached && !S.objekte.length) { S.objekte = cached.objekte; renderListe(); }
    api('/api/redaktion/objekte').then(function (j) {
      S.objekte = j.objekte; S.entw = j.entwuerfe || 0; ls.set('rd.cache.objekte', { objekte: j.objekte, t: j.t });
      var g = $('#fl-gebiet'), cur = g.value, set = {}; j.objekte.forEach(function (o) { set[o.gebiet] = 1; });
      g.innerHTML = '<option value="">alle</option>' + Object.keys(set).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
      g.value = cur;
      $('#t-entw').textContent = 'Entwürfe' + (S.entw ? ' (' + S.entw + ')' : '');
      renderListe();
    }, function (e) { if (!S.objekte.length) $('#liste-zahl').textContent = 'Keine Verbindung zum Server: ' + e.message; });
  }
  function renderListe() {
    var g = $('#fl-gebiet').value, p = $('#fl-prio').value, q = $('#fl-q').value.trim().toLowerCase(), nf = $('#fl-faellig').checked;
    var l = S.objekte.filter(function (o) { return (!g || o.gebiet === g) && (!p || String(o.prio) === p) && (!nf || o.faellig) && (!q || (o.name + ' ' + o.art + ' ' + o.lage).toLowerCase().indexOf(q) >= 0); });
    if (S.pos) { l.forEach(function (o) { o.dist = distM(S.pos[0], S.pos[1], o.lat, o.lon); }); l.sort(function (a, b) { return a.dist - b.dist; }); }
    $('#liste-zahl').textContent = l.length + ' Objekt' + (l.length === 1 ? '' : 'e') + (S.pos ? ', nächstes zuerst' : '');
    $('#liste').innerHTML = l.slice(0, 200).map(function (o) {
      var pr = o.gesamt ? Math.round(100 * o.erfasst / o.gesamt) : 0;
      return '<li><a class="item" href="#/objekt/' + encodeURIComponent(o.id) + '"><span class="t">' + esc(o.name) + '</span>'
        + (o.abgelaufen ? '<span class="chip warn">abgelaufen</span>' : o.erfasst < o.gesamt ? '<span class="chip">offen</span>' : '<span class="chip">aktuell</span>') + '<br>'
        + '<span class="s">' + esc(o.art) + ' · ' + esc(o.gebiet) + ' · Priorität ' + o.prio + (o.dist != null ? ' · ' + (o.dist >= 1000 ? (o.dist / 1000).toFixed(1).replace('.', ',') + ' km' : o.dist + ' m') : '') + '</span>'
        + (o.lage ? '<br><span class="s">' + esc(o.lage) + '</span>' : '')
        + '<div class="bar" role="img" aria-label="' + o.erfasst + ' von ' + o.gesamt + ' Fragen erfasst"><i style="width:' + pr + '%"></i></div><span class="s">' + o.erfasst + ' von ' + o.gesamt + ' erfasst' + (o.zuletzt ? ', zuletzt ' + ago(o.zuletzt) : '') + '</span></a></li>';
    }).join('') || '<li class="muted">Nichts gefunden. Filter lockern?</li>';
  }
  ['fl-gebiet', 'fl-prio', 'fl-faellig'].forEach(function (id) { $('#' + id).addEventListener('change', renderListe); });
  $('#fl-q').addEventListener('input', renderListe);
  $('#f-filter').addEventListener('submit', function (e) { e.preventDefault(); });
  $('#b-nah').addEventListener('click', function () {
    if (!navigator.geolocation) { $('#liste-zahl').textContent = 'Dieses Gerät kann den Standort nicht bestimmen.'; return; }
    $('#liste-zahl').textContent = 'Standort wird bestimmt …';
    navigator.geolocation.getCurrentPosition(function (p) { S.pos = [p.coords.latitude, p.coords.longitude]; renderListe(); }, function () { $('#liste-zahl').textContent = 'Standort nicht erlaubt. Die Liste bleibt nach Priorität sortiert.'; }, { enableHighAccuracy: true, timeout: 15000 });   // der Standort bleibt auf dem Gerät und wird nicht gesendet
  });

  // ---------- Objekt und Checkliste
  function loadObjekt(id) {
    var key = 'rd.obj.' + id, cached = ls.get(key, null);
    if (cached) renderObjekt(cached);
    else { $('#h-objekt').textContent = 'Lädt …'; $('#checkliste').innerHTML = ''; $('#objekt-kopf').innerHTML = ''; }
    api('/api/redaktion/objekt?id=' + encodeURIComponent(id)).then(function (j) { ls.set(key, j); trimCache(); if (S.cur !== 'busy') renderObjekt(j); }, function (e) {
      if (!cached) { $('#h-objekt').textContent = 'Objekt nicht geladen'; $('#objekt-msg').textContent = e.message; }
    });
  }
  function trimCache() {
    var ks = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('rd.obj.') === 0) ks.push(k); } } catch (e) { return; }
    if (ks.length > 40) ks.slice(0, ks.length - 40).forEach(ls.del);
  }
  function artTyp(f) {
    var a = String(f.antwort || '');
    if (/^ja \/ teilweise/.test(a)) return { t: 'jnw' };
    if (/^Zahl/.test(a)) return { t: 'zahl', nein: /oder nein/.test(a) };
    if (/^Text|^Datum/.test(a)) return { t: 'text' };
    var o = a.split(' / ').map(function (x) { return x.trim(); }).filter(Boolean);
    return o.length > 1 ? { t: 'wahl', o: o.filter(function (x) { return !/^weiß nicht$/i.test(x); }) } : { t: 'text' };
  }
  function renderObjekt(j) {
    S.data = j; var o = j.objekt;
    $('#h-objekt').textContent = o.name;
    $('#objekt-msg').textContent = '';
    $('#objekt-kopf').innerHTML = '<div class="kopf"><p><b>' + esc(o.art) + '</b> · ' + esc(o.gebiet) + ' · Priorität ' + o.prio + '</p>'
      + (o.lage ? '<p>' + esc(o.lage) + '</p>' : '') + '<p class="muted">Quelle: ' + esc(o.quelle) + '</p>'
      + '<div class="row"><a class="btn" href="' + osmLink(o) + '" target="_blank" rel="noopener">Auf der Karte</a>' + (o.osm ? '<a class="btn" href="' + esc(o.osm) + '" target="_blank" rel="noopener">OSM-Eintrag</a>' : '') + '</div></div>';
    var ent = {}; (j.entwuerfe || []).forEach(function (e) { ent[e.merkmal] = e; });
    $('#checkliste').innerHTML = j.checkliste.map(function (f, i) {
      var t = artTyp(f), x = f.fakt, hint = '';
      var now = x ? '<p class="now">Aktuell: <b>' + esc(x.wert) + (f.einheit && /^[\d.,-]+$/.test(x.wert) ? ' ' + esc(f.einheit) : '') + '</b> · ' + ago(x.geprueft) + ' · ' + esc(x.von)
        + ' <span class="chip ' + (x.frisch ? '' : 'warn') + '">' + (x.frisch ? 'aktuell' : 'nicht mehr geprüft') + '</span></p>' : '<p class="now muted">Noch keine Angabe.</p>';
      if (ent[f.merkmal]) now += '<p class="now"><span class="chip warn">Entwurf</span> ' + esc(ent[f.merkmal].wert) + ' von ' + esc(ent[f.merkmal].von) + ', wartet auf Freigabe</p>';
      var bk = f.bekannt && !x ? f.bekannt : null;
      if (bk) { var v = ABBILD[String(bk.wert).toLowerCase()] || bk.wert; hint = '<p class="hint">' + esc(bk.quelle) + ' sagt: ' + esc(bk.wert) + ' (nicht geprüft)</p>'; }
      var ctl = '';
      if (t.t === 'jnw' || t.t === 'wahl') {
        var opts = (t.t === 'jnw' ? JNW : t.o).concat(['weiß nicht']);
        ctl = '<div class="opts" role="group" aria-label="Antwort">' + opts.map(function (w) { return '<button type="button" class="btn' + (x && x.wert === w ? ' sel' : '') + '" data-i="' + i + '" data-w="' + esc(w) + '">' + esc(w) + '</button>'; }).join('') + '</div>';
      } else if (t.t === 'zahl') {
        ctl = '<div class="num"><label class="sr" for="z' + i + '" style="position:absolute;left:-999px">' + esc(f.frage) + '</label><input id="z' + i + '" inputmode="decimal" autocomplete="off" placeholder="' + esc(f.einheit || 'Zahl') + '"><button type="button" class="btn primary" data-i="' + i + '" data-z="1">Speichern</button>'
          + '<button type="button" class="btn" data-i="' + i + '" data-w="weiß nicht">weiß nicht</button>' + (t.nein ? '<button type="button" class="btn" data-i="' + i + '" data-w="nein">nein</button>' : '') + '</div>';
      } else {
        ctl = '<div class="num"><label class="sr" for="z' + i + '" style="position:absolute;left:-999px">' + esc(f.frage) + '</label><input id="z' + i + '" autocomplete="off" maxlength="200"><button type="button" class="btn primary" data-i="' + i + '" data-z="1">Speichern</button><button type="button" class="btn" data-i="' + i + '" data-w="weiß nicht">weiß nicht</button></div>';
      }
      var bestaet = x && S.rolle === 'redaktion' ? '<div class="opts"><button type="button" class="btn" data-i="' + i + '" data-b="1">Stimmt noch</button><button type="button" class="btn" data-i="' + i + '" data-r="1">Zurückziehen</button></div>' : '';
      var klasseA = f.klasse === 'A' ? '<p class="hint">Gilt 12 Stunden, danach wieder fällig.</p>' : '';
      return '<section class="q' + (x && x.frisch ? ' done' : '') + '" id="q' + i + '"><h3>' + esc(f.frage) + '</h3>' + (f.hinweis ? '<p class="hint">' + esc(f.hinweis) + '</p>' : '') + hint + klasseA + now + ctl + bestaet
        + '<details><summary>Notiz</summary><input id="n' + i + '" maxlength="300" autocomplete="off" aria-label="Notiz zu dieser Frage"></details></section>';
    }).join('');
    $('#verlauf').innerHTML = (j.verlauf || []).map(function (v) {
      var m = (j.checkliste.filter(function (c) { return c.merkmal === v.merkmal; })[0] || {}).frage || v.merkmal;
      return '<li>' + new Date(v.t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + esc(v.von) + ' · ' + (v.art === 'erfassung' ? esc(m) + ': <b>' + esc(v.wert) + '</b>' + (v.status === 'entwurf' ? ' (Entwurf)' : '') : v.art === 'bestaetigung' ? 'bestätigt: ' + esc(m) : v.art === 'zurueck' ? 'zurückgezogen: ' + (v.merkmal === '*' ? 'alle Angaben' : esc(m)) : v.art === 'freigabe' ? (v.ok ? 'Entwurf freigegeben' : 'Entwurf abgelehnt') : esc(v.art)) + (v.notiz ? ' – ' + esc(v.notiz) : '') + '</li>';
    }).join('') || '<li class="muted">Noch nichts erfasst.</li>';
  }
  function speichere(i, wert, bestaetigen) {
    var j = S.data, f = j.checkliste[i], o = j.objekt, nt = $('#n' + i); var notiz = nt ? nt.value.trim() : '';
    var body = { objekt: o.id, merkmal: f.merkmal, wert: wert, notiz: notiz }; if (f.klasse === 'A') body.gilt_h = 12;
    var msg = $('#objekt-msg'); msg.className = 'msg'; msg.textContent = 'Wird gespeichert …';
    var p = bestaetigen ? send('/api/redaktion/bestaetigen', { objekt: o.id, merkmal: f.merkmal, gilt_h: body.gilt_h }) : send('/api/redaktion/fakt', body);
    p.then(function (r) {
      var direkt = S.rolle === 'redaktion';
      if (bestaetigen || direkt) f.fakt = { wert: bestaetigen ? f.fakt.wert : wert, notiz: notiz, geprueft: Date.now(), von: S.name, stufe: 2, frisch: true };
      else (j.entwuerfe = j.entwuerfe || []).push({ merkmal: f.merkmal, wert: wert, von: S.name });
      j.verlauf = [{ t: Date.now(), art: bestaetigen ? 'bestaetigung' : 'erfassung', objekt: o.id, merkmal: f.merkmal, wert: wert, von: S.name, notiz: notiz, status: direkt ? 'gueltig' : 'entwurf' }].concat(j.verlauf || []);
      ls.set('rd.obj.' + o.id, j);
      renderObjekt(j);
      var m2 = $('#objekt-msg'); m2.className = 'msg ok';
      m2.textContent = r.queued ? 'Auf dem Gerät gespeichert. Wird gesendet, sobald Netz da ist.' : direkt || bestaetigen ? 'Gespeichert.' : 'Als Entwurf gespeichert. Die Redaktion gibt es frei.';
      var q = $('#q' + i); if (q) q.scrollIntoView({ block: 'nearest' });
      var nxt = $('#q' + (i + 1)); if (nxt && !r.queued) { /* weiter zur nächsten Frage, ohne Fokus zu stehlen */ }
    }, function (e) { msg.className = 'msg'; msg.textContent = e.message; });
  }
  $('#checkliste').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-i]'); if (!b) return;
    var i = Number(b.dataset.i);
    if (b.dataset.b) return speichere(i, null, true);
    if (b.dataset.r) {
      if (!confirm('Diese Angabe zurückziehen? Sie gilt dann nicht mehr und wird nicht mehr genannt.')) return;
      var jj = S.data, ff = jj.checkliste[i];
      return api('/api/redaktion/zurueck', { method: 'POST', body: { objekt: jj.objekt.id, merkmal: ff.merkmal } }).then(function () { ff.fakt = null; jj.verlauf = [{ t: Date.now(), art: 'zurueck', objekt: jj.objekt.id, merkmal: ff.merkmal, von: S.name }].concat(jj.verlauf || []); ls.set('rd.obj.' + jj.objekt.id, jj); renderObjekt(jj); var m3 = $('#objekt-msg'); m3.className = 'msg ok'; m3.textContent = 'Angabe zurückgezogen.'; }, function (e) { var m4 = $('#objekt-msg'); m4.className = 'msg'; m4.textContent = e.message; });
    }
    if (b.dataset.z) { var v = $('#z' + i).value.trim(); if (!v) { var m = $('#objekt-msg'); m.className = 'msg'; m.textContent = 'Bitte eine Antwort eintragen oder „weiß nicht“ wählen.'; return; } return speichere(i, v); }
    if (b.dataset.w != null) speichere(i, b.dataset.w);
  });

  // ---------- Entwürfe
  function loadEntwuerfe() {
    api('/api/redaktion/entwuerfe').then(function (j) {
      $('#entwuerfe').innerHTML = j.entwuerfe.map(function (e) {
        return '<li><div class="item"><span class="t">' + esc(e.objekt_name) + '</span><br><span class="s">' + esc(e.frage || e.merkmal) + '</span><p>Neu: <b>' + esc(e.wert) + '</b>' + (e.vorher ? ' (bisher: ' + esc(e.vorher) + ')' : '') + ' · ' + esc(e.von) + ', ' + ago(e.t) + (e.notiz ? '<br>Notiz: ' + esc(e.notiz) : '') + '</p>'
          + '<button class="btn primary" data-e="' + esc(e.eid) + '" data-ok="1">Freigeben</button> <button class="btn" data-e="' + esc(e.eid) + '" data-ok="0">Ablehnen</button></div></li>';
      }).join('') || '<li class="muted">Keine Entwürfe.</li>';
      $('#t-entw').textContent = 'Entwürfe' + (j.entwuerfe.length ? ' (' + j.entwuerfe.length + ')' : '');
    }, function (e) { $('#entwuerfe').innerHTML = '<li class="msg">' + esc(e.message) + '</li>'; });
  }
  $('#entwuerfe').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-e]'); if (!b) return;
    api('/api/redaktion/freigabe', { method: 'POST', body: { eid: b.dataset.e, ok: b.dataset.ok === '1' } }).then(loadEntwuerfe, function (e) { alert(e.message); });
  });

  // ---------- Bericht
  function loadBericht() {
    api('/api/redaktion/bericht').then(function (j) {
      function tab(titel, g) {
        return '<h2>' + esc(titel) + '</h2><div class="scroll"><table class="bt"><thead><tr><th>Gruppe</th><th class="n">Objekte</th><th class="n">erfasst</th><th class="n">aktuell</th><th class="n">ohne Angabe</th></tr></thead><tbody>'
          + Object.keys(g).map(function (k) { var e = g[k]; return '<tr><td>' + esc(k) + '</td><td class="n">' + e.objekte + '</td><td class="n">' + (e.fragen ? Math.round(100 * e.erfasst / e.fragen) : 0) + ' %</td><td class="n">' + (e.fragen ? Math.round(100 * e.frisch / e.fragen) : 0) + ' %</td><td class="n">' + e.ohneAngabe + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }
      var rk = j.rueckmeldungen;
      $('#bericht').innerHTML = '<p><b>' + j.objekte + '</b> Objekte im Pilotgebiet, <b>' + j.faellig + '</b> davon fällig, <b>' + j.entwuerfe + '</b> Entwürfe warten.</p>'
        + '<p class="muted">„erfasst“ und „aktuell“ sind Anteile aller Checklisten-Fragen der Gruppe. „aktuell“ heißt innerhalb der Frist der Frischeklasse geprüft.</p>'
        + tab('Nach Priorität', j.nachPrio) + tab('Nach Gebiet', j.nachGebiet) + tab('Nach Objektart', j.nachArt)
        + '<h2>Rückmeldungen der Nutzenden</h2><p>' + rk.gut + '× „Stimmt“, ' + rk.falsch + '× „Stimmt nicht“, ' + rk.veraltet + '× „Veraltet“.</p>'
        + '<h2>Was am häufigsten fehlt</h2>' + (j.luecken.length ? '<div class="scroll"><table class="bt"><thead><tr><th>Thema</th><th>Ort</th><th>Profil</th><th class="n">Fragen</th><th class="n">ohne Antwort</th></tr></thead><tbody>' + j.luecken.map(function (l) { return '<tr><td>' + esc(l.thema) + '</td><td>' + esc(l.ort || '–') + '</td><td>' + esc(l.profil || '–') + '</td><td class="n">' + l.fragen + '</td><td class="n">' + l.ohne_antwort + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">Noch keine Daten.</p>');
    }, function (e) { $('#bericht').innerHTML = '<p class="msg">' + esc(e.message) + '</p>'; });
  }

  // ---------- Mehr
  function renderMehr() {
    $('#mehr-wer').innerHTML = 'Angemeldet als <b>' + esc(S.name) + '</b> (' + (S.rolle === 'redaktion' ? 'Redaktion' : 'Mitwirkende') + '). Server: ' + esc(base());
    $('#b-export').hidden = S.rolle !== 'redaktion'; netState();
  }
  $('#b-sync').addEventListener('click', function () { flush(); });
  $('#b-logout').addEventListener('click', function () { if (S.queue.length && !confirm(S.queue.length + ' Angaben warten noch auf das Senden und gehen verloren. Trotzdem abmelden?')) return; S.queue = []; saveQueue(); logout('Abgemeldet.'); });
  $('#b-export').addEventListener('click', function () {
    fetch(base() + '/api/redaktion/export', { headers: { Authorization: 'Bearer ' + S.token } }).then(function (r) { return r.blob(); }).then(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'flowtown-redaktion-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); });
  });

  // ---------- Login
  $('#in-server').value = S.server;
  $('#f-login').addEventListener('submit', function (e) {
    e.preventDefault();
    S.server = $('#in-server').value.trim() || defaultServer(); ls.set('rd.server', S.server);
    var msg = $('#login-msg'); msg.textContent = 'Wird geprüft …';
    api('/api/redaktion/login', { method: 'POST', body: { code: $('#in-code').value } }).then(function (j) {
      S.token = j.token; S.rolle = j.rolle; S.name = j.name; ls.set('rd.sitzung', { token: j.token, rolle: j.rolle, name: j.name });
      msg.textContent = ''; $('#in-code').value = ''; S.objekte = []; go('#/liste'); flush();
    }, function (er) { msg.textContent = er.status ? er.message : 'Keine Verbindung zum Server. Stimmt die Adresse unter „Server“?'; });
  });

  window.addEventListener('online', function () { netState(); flush(); });
  window.addEventListener('offline', netState);
  $('#ver').textContent = VERSION;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* ohne Offline-Hülle weiter */ });
  netState(); route(); flush();
})();
