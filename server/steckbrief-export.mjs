// Bahnsteig-Steckbrief aus den Angaben der Redaktion (siehe ERFASSUNG-AUSGABE.md).
// Eingabe: Checkliste (server/checklisten.csv, Objektart stadtbahn_haltestelle) und die Angaben je Objekt.
// Ausgabe: Eintrag im Format von data/steckbrief.json. Die Bewertung je Profil kommt aus einer festen Regel,
// nicht aus Sätzen von Hand. Keine Abhängigkeiten, damit der Test ohne Server läuft.

// Frischeklassen wie im Server (A Tage bis Stunden, B eine Woche, C ein halbes Jahr, D ein Jahr)
const FRIST = { A: 864e5, B: 7 * 864e5, C: 180 * 864e5, D: 365 * 864e5 };

// Profile des Steckbriefs. Die Checkliste nennt die Profile entweder so oder über die Kurzformen aus der Redaktion.
export const PROFILE = {
  rollstuhl: 'Rollstuhl', rollator: 'Rollator', kinderwagen: 'Kinderwagen', blind: 'Blind',
  sehbehindert: 'Sehbehindert', hoerbehindert: 'Hörbehindert', gehunsicher: 'Gehunsicher oder älter',
};
const KURZFORM = { sehen: ['blind', 'sehbehindert'], hoeren: ['hoerbehindert'], ruhe: ['gehunsicher'], lernen: [] };

// „rollstuhl, rollator“ → ['rollstuhl', 'rollator']; unbekannte Profile werden ausgelassen
export function profileAus(text) {
  const out = [];
  for (const t of String(text || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const ids = KURZFORM[t] || (PROFILE[t] ? [t] : []);
    for (const i of ids) if (!out.includes(i)) out.push(i);
  }
  return out;
}

const STATUS = { ja: 'passt', teilweise: 'beachten', nein: 'passt nicht' };
// Grenzen in cm. Spalt und Höhenunterschied: bis 5 cm passt (Empfehlung, ADAC), bis 7,5 cm beachten (TSI PRM
// erlaubt höchstens 75 mm Spalt und 50 mm Höhe), darüber passt nicht. Platz: 150 cm zum Wenden (Checkliste).
const GRENZE = { spalt_cm: { passt: 5, beachten: 7.5 }, hoehe_cm: { passt: 5, beachten: 7.5, abs: true }, platz_cm: { passt_ab: 150 } };
// „aktuell“: vor Ort in den letzten sieben Tagen geprüft
const AKTUELL = 7 * 864e5;
const datum = (t) => new Date(t).toISOString().slice(0, 10);
const frisch = (fakt, klasse, jetzt) => (fakt.gilt_bis || fakt.geprueft + (FRIST[klasse] || FRIST.D)) > jetzt;

// Ein Merkmal bewerten. Status: passt, beachten, passt nicht, unbekannt, vorschlag.
// „weiß nicht“, fehlende, abgelaufene Angaben und Vorschläge sind nie „passt“.
export function bewerte(merkmal, fakt, jetzt = Date.now()) {
  if (!fakt) return { status: 'unbekannt', wert: '', grund: 'noch nicht erfasst' };
  const wert = String(fakt.wert == null ? '' : fakt.wert).trim();
  if (fakt.vorschlag) return { status: 'vorschlag', wert, grund: 'Vorschlag aus Foto, nicht geprüft' };
  if (!frisch(fakt, merkmal.klasse, jetzt)) return { status: 'unbekannt', wert, grund: `nicht mehr geprüft (Stand ${datum(fakt.geprueft)})` };
  if (/^Zahl/.test(merkmal.antwort || '')) {
    const maß = `${wert} ${merkmal.einheit || ''}`.trim(), g = GRENZE[merkmal.merkmal], n = Number(wert.replace(',', '.'));
    if (g && isFinite(n)) {
      if (g.passt_ab != null) return { status: n >= g.passt_ab ? 'passt' : 'passt nicht', wert: maß, grund: `Maß: ${maß}` };
      const v = g.abs ? Math.abs(n) : n;
      return { status: v <= g.passt ? 'passt' : v <= g.beachten ? 'beachten' : 'passt nicht', wert: maß, grund: `Maß: ${maß}` };
    }
    return { status: 'beachten', wert: maß, grund: `Maß: ${maß}` };   // ohne Grenze: nur anzeigen
  }
  const k = wert.toLowerCase();
  if (STATUS[k]) return { status: STATUS[k], wert: k, grund: k };
  return { status: 'unbekannt', wert, grund: 'weiß nicht' };
}

// Ein Objekt in den Eintrag des Steckbriefs
export function eintragAus({ id, name, beschreibung, quelle }, checkliste, fakten, jetzt = Date.now()) {
  const items = [];
  for (const m of checkliste) {
    const f = fakten[m.merkmal]; if (!f) continue;
    const b = bewerte(m, f, jetzt);
    items.push({
      id: m.merkmal, label: m.kurzname || m.frage, wert: b.wert || b.grund,
      herkunft: f.vorschlag ? 'Vorschlag' : 'Nutzer', stand: datum(f.geprueft), lage: f.lage || '',
      art: jetzt - f.geprueft < AKTUELL ? 'aktuell' : 'dauerhaft',
    });
  }
  const profile = Object.keys(PROFILE).filter((p) => checkliste.some((m) => profileAus(m.profile).includes(p)))
    .map((p) => ({
      id: p, name: PROFILE[p],
      rules: checkliste.filter((m) => profileAus(m.profile).includes(p))
        .map((m) => { const b = bewerte(m, fakten[m.merkmal], jetzt); return [m.merkmal, b.status, b.grund, (fakten[m.merkmal] || {}).lage || '']; }),
    }));
  const stand = Math.max(0, ...Object.values(fakten).map((f) => f.geprueft || 0));
  return { id, name, stand: datum(stand || jetzt), beschreibung: beschreibung || '', quelle: quelle || 'Angaben der Redaktion, vor Ort geprüft', items, profiles: profile };
}

// Alle Objekte mit Angaben. objekte: [{id, name}], fakten: { objektId: { merkmal: fakt } }
export function steckbriefAus(objekte, checkliste, fakten, jetzt = Date.now()) {
  return objekte
    .filter((o) => fakten[o.id] && Object.keys(fakten[o.id]).length)
    .map((o) => eintragAus({ id: slug(o.name), name: o.name }, checkliste, fakten[o.id], jetzt));
}

export function slug(s) {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
