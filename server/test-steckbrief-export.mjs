// Tests für den Bahnsteig-Steckbrief-Export. Aufruf: node test-steckbrief-export.mjs
import assert from 'node:assert/strict';
import { profileAus, bewerte, steckbriefAus, slug } from './steckbrief-export.mjs';

const jetzt = Date.parse('2026-11-22T12:00:00Z');
const heute = { geprueft: Date.parse('2026-11-22T10:00:00Z'), von: 'Test' };
const m = (klasse = 'D', antwort = 'ja / teilweise / nein / weiß nicht', einheit = '') => ({ merkmal: 'x', klasse, antwort, einheit, profile: 'rollstuhl', kurzname: 'X' });

// Profile: Kurzformen aus der Redaktion
assert.deepEqual(profileAus('sehen'), ['blind', 'sehbehindert']);
assert.deepEqual(profileAus('hoeren, lernen'), ['hoerbehindert']);
assert.deepEqual(profileAus('rollstuhl, rollator, kinderwagen'), ['rollstuhl', 'rollator', 'kinderwagen']);
assert.deepEqual(profileAus('unbekannt'), []);

// Bewertung: nur „ja“ ist „passt“; „weiß nicht“, fehlende, abgelaufene und Vorschläge nie
assert.equal(bewerte(m(), { ...heute, wert: 'ja' }, jetzt).status, 'passt');
assert.equal(bewerte(m(), { ...heute, wert: 'teilweise' }, jetzt).status, 'beachten');
assert.equal(bewerte(m(), { ...heute, wert: 'nein' }, jetzt).status, 'passt nicht');
assert.equal(bewerte(m(), { ...heute, wert: 'weiß nicht' }, jetzt).status, 'unbekannt');
assert.equal(bewerte(m(), null, jetzt).status, 'unbekannt');
assert.equal(bewerte(m(), { ...heute, wert: 'ja', vorschlag: true }, jetzt).status, 'vorschlag');
assert.equal(bewerte(m('A'), { ...heute, wert: 'ja' }, jetzt + 2 * 864e5).status, 'unbekannt', 'Klasse A nach zwei Tagen abgelaufen');
assert.equal(bewerte(m('D'), { ...heute, wert: 'ja' }, jetzt + 2 * 864e5).status, 'passt', 'Klasse D noch frisch');
assert.equal(bewerte(m('D', 'Zahl', 'cm'), { ...heute, wert: '10' }, jetzt).status, 'beachten', 'Maße werden angezeigt, nicht bewertet');

// Eintrag: Regeln je Profil, nur Merkmale mit Angaben als Items, Unerfasstes ist unbekannt
const cl = [
  { merkmal: 'hochbahnsteig', frage: 'F', antwort: 'ja / teilweise / nein / weiß nicht', einheit: '', klasse: 'D', profile: 'rollstuhl, rollator', kurzname: 'Einstieg' },
  { merkmal: 'querung', frage: 'F', antwort: 'ja / teilweise / nein / weiß nicht', einheit: '', klasse: 'D', profile: 'sehen', kurzname: 'Taster' },
];
const e = steckbriefAus([{ id: 'a', name: 'Prießallee' }, { id: 'b', name: 'Ohne Angaben' }], cl, { a: { hochbahnsteig: { ...heute, wert: 'ja' }, querung: { ...heute, wert: 'nein' } } }, jetzt);
assert.equal(e.length, 1, 'Objekte ohne Angaben fallen weg');
assert.equal(e[0].id, 'priessallee');
assert.equal(e[0].items.length, 2);
assert.deepEqual(e[0].profiles.map((p) => p.id), ['rollstuhl', 'rollator', 'blind', 'sehbehindert']);
assert.deepEqual(e[0].profiles[0].rules, [['hochbahnsteig', 'passt', 'ja']]);
assert.deepEqual(e[0].profiles[2].rules, [['querung', 'passt nicht', 'nein']]);
assert.equal(e[0].items[0].art, 'aktuell', 'vor einer Stunde geprüft');
assert.equal(e[0].items[0].herkunft, 'Nutzer');

// Maße mit Grenzen (cm)
assert.equal(bewerte({ ...m('D', 'Zahl', 'cm'), merkmal: 'spalt_cm' }, { ...heute, wert: '4' }, jetzt).status, 'passt');
assert.equal(bewerte({ ...m('D', 'Zahl', 'cm'), merkmal: 'spalt_cm' }, { ...heute, wert: '6' }, jetzt).status, 'beachten');
assert.equal(bewerte({ ...m('D', 'Zahl', 'cm'), merkmal: 'spalt_cm' }, { ...heute, wert: '10' }, jetzt).status, 'passt nicht');
assert.equal(bewerte({ ...m('D', 'Zahl', 'cm'), merkmal: 'hoehe_cm' }, { ...heute, wert: '-4' }, jetzt).status, 'passt', 'Höhe zählt mit Vorzeichen als Betrag');
assert.equal(bewerte({ ...m('D', 'Zahl', 'cm'), merkmal: 'platz_cm' }, { ...heute, wert: '160' }, jetzt).status, 'passt');
assert.equal(bewerte({ ...m('D', 'Zahl', 'cm'), merkmal: 'platz_cm' }, { ...heute, wert: '120' }, jetzt).status, 'passt nicht');
// aktuell nur innerhalb von sieben Tagen
assert.equal(steckbriefAus([{ id: 'a', name: 'X' }], cl, { a: { hochbahnsteig: { ...heute, wert: 'ja', geprueft: jetzt - 8 * 864e5 } } }, jetzt)[0].items[0].art, 'dauerhaft');

assert.equal(slug('Prießallee Süd'), 'priessallee-sued');
console.log('steckbrief-export: alle Tests bestanden');
