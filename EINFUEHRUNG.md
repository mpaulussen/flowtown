# Einführung in Flowtown

Stand: 23.11.2026. Für neue Mitwirkende. Dieses Dokument fasst zusammen, was Flowtown ist, welche Teile es gibt, wo die Daten herkommen, wie Erfassung und Ausgabe zusammenhängen und was offen ist. Die Details stehen in den verlinkten Dokumenten im Repo.

**Achtung, bitte zuerst lesen:**
- `README.md` im Hauptordner beschreibt noch den früheren Ampel-Prototyp („Die grüne Welle beginnt bei dir“). Das ist nicht mehr Flowtown in seiner heutigen Form. Diese Einführung ist maßgeblich.
- Die DB-Timetables-API wird abgelöst (OpenBoards). Die Abschaltung ist für Mitte 2027 vorgesehen. Details unter „Datenquellen“.
- Das Projekt OD2Guide ist ausgeschieden. Seine Daten werden nicht genutzt (Lizenz nicht geklärt, Fotos nicht übernehmen).

---

## 1. Was Flowtown ist

Flowtown ist eine barrierefreie Navigations-App (eine Web-App, die sich wie eine App installieren lässt) für Bielefeld und Ostwestfalen-Lippe. Sie richtet sich an Menschen mit Rollstuhl, Rollator, Sehbehinderung, Blindheit, Hörbehinderung, Bedarf an Ruhe oder einfacher Sprache.

Das Besondere, und der Kern des Ansatzes:
- **Belegt statt geraten.** Eine Angabe wird nur gezeigt, wenn ein Werkzeug oder eine Quelle sie liefert. Fehlt sie, sagt Flowtown „keine Angabe“ oder „vor Ort prüfen“. Das ist im Prompt der Assistenz und in der Quellenprüfung festgelegt (`ASSISTENZ-REGELN.md`).
- **„Unbekannt“ ist nie „passt“.** Ein fehlender, veralteter oder nur vorgeschlagener Wert wird als unbekannt angezeigt.
- **Herkunft und Stand.** Jede Angabe nennt, woher sie kommt, und wann sie geprüft wurde. Empfehlungen zur Fahrt nennen Quelle und Alter (`PROFIL-KONZEPT.md`).
- **Profil statt Einheitsantwort.** Die Bewertung richtet sich nach dem Bedarf der Person.

Die Kurzfassung steht in `WAS-FLOWTOWN-KANN.md`, auch zum Weitergeben.

---

## 2. Die Teile

| Teil | Wo im Repo | Für wen | Adresse |
|---|---|---|---|
| **Nutzer-App** | `index.html`, `app.js`, `style.css`, `sw.js` | Menschen, die unterwegs sind | https://mpaulussen.github.io/flowtown/ |
| **Redaktions-App** | `redaktion/` | Redaktion und Mitwirkende (Erfassung vor Ort) | https://mpaulussen.github.io/flowtown/redaktion/ |
| **Server** | `server/` | Verbindet die Apps mit Datenquellen und der Assistenz | Läuft auf einem Ubuntu-Server, siehe `server/README.md` |
| **Steckbrief (Probe)** | `data/steckbrief.json`, Menü „Mehr“ → „Bahnsteige (Probe)“ | Test mit Haltestellen (Prießallee) | in der Nutzer-App |
| **Prototyp** | `prototyp/` | Vorführung der Bewertung je Profil | überholt, nur zur Vorführung |

### Nutzer-App
- Reines HTML, CSS und JavaScript, **kein Build-Schritt**. Die Datei `app.js` ist groß (über 500 KB) und enthält fast alles.
- Die Version steht in `const VERSION` in `app.js`. Der Service-Worker `sw.js` hat einen Cache-Namen (`CACHE`), der **dieselbe Versionsnummer** tragen muss, sonst bekommen Handys die neue Version nicht.
- Die Assistenz (Sprache und Text) läuft über den Server. Die App schickt dabei den Gesprächszustand mit, der Server speichert nichts.
- Profile in den Einstellungen: `rollstuhl`, `rollator`, `sehen`, `hoeren`, `lernen`, `ruhe`, `andere`. Für den Steckbrief werden sie auf `blind`, `sehbehindert`, `hoerbehindert`, `gehunsicher` und weitere abgebildet.

### Redaktions-App
- Eigene Web-App, getrennt von der Nutzer-App (`REDAKTION.md`).
- Zugang mit **Einladungscode** (Format `RD-XXXX-XXXX`). Der Server speichert nur einen Hash.
- Rollen: `redaktion` (erfasst gültig, gibt Entwürfe frei, exportiert) und `mitwirkend` (erfasst Entwürfe).
- Eine Angabe je Merkmal: Antwort (ja, teilweise, nein, weiß nicht, oder eine Zahl), optional **Lage** („Ende des Bahnsteigs Richtung Innenstadt“) und Notiz.
- Die Speicherung ist ein Protokoll (`fakten.jsonl` im Datenordner). Zurückziehen ist möglich, das Protokoll bleibt.
- Die Version steht in `redaktion/app.js` (`VERSION`) und in `redaktion/sw.js` (`CACHE`).

### Server
- Node.js, **ohne Abhängigkeiten** (`server/flowtown-server.mjs`, eine Datei von vielen tausend Zeilen).
- Läuft als Dienst `flowtown` unter `/opt/flowtown`. Daten liegen im Datenordner (`DATA_DIR`, auf dem Server meist `/var/lib/flowtown`).
- **Zugangsdaten nur in `/etc/flowtown.env`**, nie im Repo und nie im Chat. Beispiel mit allen Namen: `server/flowtown.env.example`.
- Aktualisieren: siehe Abschnitt 7.

### Steckbrief (Probe)
- Ein Bahnsteig mit Merkmalen, Bewertung je Profil und Auswahl „Alle Hinweise“ oder „Nur Neues und aktuelle“.
- Die Daten kommen aus dem Export der Redaktion (`steckbrief-export`). Nicht von Hand bearbeiten, sondern über den Export.
- Die Auswahl ist bei jedem Öffnen wieder zu treffen. Der Stand des letzten Besuchs wird lokal auf dem Handy gemerkt.

---

## 3. Datenquellen

| Quelle | Wofür | Zugang | Hinweise |
|---|---|---|---|
| **DELFI-Fahrplan** (GTFS, opendata-oepnv.de) | Fahrpläne Bus und Bahn | Freigabe-Link in `DELFI_GTFS_URL` | Hauptquelle für den ÖPNV |
| **DB Timetables** | Echtzeit für Züge (zweite Quelle, nur wenn nicht bei DELFI) | `DB_CLIENT_ID`, `DB_API_KEY` | **Wird abgelöst** durch OpenBoards, Abschaltung vrsl. Mitte 2027. Keine neuen Abos mehr für Timetables. Lizenz CC BY 4.0, Nennung der DB nötig. Siehe `TODO.md` V13. |
| **DB OpenBoards** | Nachfolger von Timetables | Abo im DB API Marketplace | Noch nicht umgesetzt. Die Doku ist dünn: POST statt GET, Basis-URL und Felder fehlen. Spezifikation auf developer-docs.deutschebahn.com nachlesen. |
| **HERE** | Verkehrslage, Verbindungen mit Umstieg | `HERE_API_KEY` | Kostenloser Schlüssel bei platform.here.com |
| **OpenStreetMap** (Overpass, Nominatim) | Haltestellen, Aufzüge, Ampeln, Toiletten, Radwege | Frei, mit Namensnennung (ODbL) | Fehlt dort etwas, steht es im Katalog als „Fehlt“. Das heißt nicht, dass es das Merkmal nicht gibt. |
| **Mobilithek** | Echtzeit Bus und Bahn (GTFS-RT), Straßen.NRW (DATEX II), Aufzüge DB | Zugang über Mobilithek | Siehe `server/README.md` |
| **Bethel („Bielefeld barrierefrei erleben“)** | Barrierefreiheit von Gebäuden und Orten | `BETHEL_DATA` | Fremde Quelle, Stand vor Gebrauch prüfen |
| **moBiel** | Umleitungen, Störungen | Öffentliche Meldungen, `MOBIEL_MIN` | |
| **Stadt Bielefeld** | Ampeln, Baustellen, Park + Ride, Radnetz, Behindertenparkplätze, Toiletten | `STADT_DATEN` u. a. | |
| **Mistral** (KI-Assistenz) | Sprache und Text der Antworten | `MISTRAL_API_KEY`, `MISTRAL_MODEL` | Die KI formuliert nur. Die Fakten kommen aus Werkzeugen und Angaben, nicht aus dem Modell. |
| **Redaktion** | Vor-Ort-Angaben zu Haltestellen, Aufzügen, Gebäuden | Redaktions-App | Die wichtigste Quelle für Bielefeld, mit Herkunft und Stand |

**Nicht verwenden:**
- **OD2Guide-Daten** (contagt, ODbL, Erhebungen 2024 in Mannheim, Heidelberg, München und Birkenfeld): ausgeschieden. Keine Fotos aus solchen Datensätzen.
- **Fotos von Personen** (Passanten, Kennzeichen): nie ins Repo. Der Ordner `fotos/` ist in `.gitignore`.

---

## 4. Daten und Begriffe

- **Objekt:** eine Haltestelle, ein Aufzug, ein WC, eine Ampel, ein Gebäude. Die ID beginnt mit der Objektart, zum Beispiel `stadtbahn_haltestelle-priessallee`.
- **Merkmal:** eine Eigenschaft eines Objekts, zum Beispiel `hochbahnsteig` (Einstieg eben), `spalt_cm`, `querung` (Taster mit Tonsignal). Die Liste steht in `server/checklisten.csv`, nach Objektart.
- **Checkliste:** `server/checklisten.csv` mit Frage, erlaubten Antworten, Einheit, Frischeklasse, Profilen und Messhinweis. Die Spalte „Profile“ bestimmt, für welches Profil ein Merkmal zählt. Kurzformen: `sehen` (blind und sehbehindert), `hoeren`, `ruhe`.
- **Angabe (Fakt):** ein erfasster Wert mit Erfasser, Zeitpunkt, optionaler Lage und Notiz. Es gibt keine Löschung, nur Zurückziehen.
- **Frischeklasse:** Wie lange eine Angabe gilt, bevor sie „nicht mehr geprüft“ ist. Im Server: A ein Tag, B sieben Tage, C 180 Tage, D 365 Tage. Klasse A kann ein eigenes Ablaufdatum haben: Die Redaktions-App setzt 12 Stunden, der Server erlaubt bis 72 Stunden.
- **Aktuell:** Im Steckbrief gilt eine Angabe als aktuell, wenn sie in den letzten sieben Tagen geprüft wurde (`steckbrief-export.mjs`). Das ist eine andere Regel als die Frischeklasse.
- **Bewertung je Profil:** ja → passt, teilweise → beachten, nein → passt nicht, weiß nicht → unbekannt, Vorschlag aus Foto → vorschlag (nie passt). Abgelaufene Angaben sind unbekannt.
- **Maße (cm):** Spalt und Höhenunterschied bis 5 cm passt, bis 7,5 cm beachten, darüber passt nicht. Platz zum Wenden ab 150 cm passt. Quellen: TSI PRM (höchstens 75 mm Spalt, 50 mm Höhe) und die Empfehlung von 5 cm (ADAC). Die Richtwerte in den Messhinweisen der Checkliste stammen aus Erinnerung und sind **noch nicht gegen DIN 18040 und DIN 32984 geprüft** (`REDAKTION.md`, Abschnitt „Was ich nicht prüfen konnte“).
- **Katalog:** `objektkatalog-pilot.csv` im Datenordner. Erzeugt aus OpenStreetMap und Bethel mit dem Befehl `objektkatalog`. Haltestellen, die von Hand angelegt wurden (Quelle „von Hand“), bleiben beim Neu-Erzeugen erhalten.
- **Export:** `steckbrief-export` liest Katalog, Checkliste und Angaben und erzeugt das Format von `data/steckbrief.json`. Die Datei wird geprüft und dann ins Repo übernommen. Die App liest nur diese Datei.
- **Lage:** Pro Merkmal, wo genau es liegt. Sie wird im Steckbrief unter der Angabe gezeigt.

---

## 5. Wie Erfassung und Ausgabe zusammenhängen

Das ist das Konzept aus `ERFASSUNG-AUSGABE.md`:

1. **Erfassen:** Die Redaktion oder Mitwirkende füllen die Checkliste in der Redaktions-App aus. Jede Angabe bekommt einen Erfasser und einen Zeitpunkt.
2. **Speichern:** Der Server schreibt die Angaben in das Protokoll.
3. **Bewerten:** Die Regeltabelle aus der Checkliste ordnet jedem Profil die Merkmale zu und bewertet sie. Es gibt keine handgeschriebenen Regeln je Haltestelle.
4. **Exportieren:** `steckbrief-export` erzeugt die Datei für die App.
5. **Ausgeben:** Die App zeigt je Profil ein Fazit und die Angaben. Die Auswahl „Alle“ oder „Nur Neues“ wird beim Öffnen gefragt, Standard ist „Alle“.

**Noch nicht gebaut:** Das Lernen pro Person (Vorschläge ab drei Besuchen, nur auf dem Handy, sicherbar). Das Konzept steht in `ERFASSUNG-AUSGABE.md` und `PROFIL-KONZEPT.md`.

**Noch fehlt:** Eine Markierung in der Redaktions-App, dass eine Angabe ein Vorschlag aus einem Foto ist. Der Export erwartet das Feld `vorschlag`, die App setzt es noch nicht.

---

## 6. Arbeitsweise und Regeln

- **Commits und Pushes auf `main`** sind der übliche Ablauf. Die Commit-Nachrichten beschreiben, was sich ändert, und sind auf Deutsch. Die Projekthistorie zeigt das Format.
- **Versionen erhöhen** bei jeder App-Änderung: `VERSION` in `app.js` und `CACHE` in `sw.js` (beide gleich). Bei der Redaktions-App das Paar `redaktion/app.js` und `redaktion/sw.js`.
- **Aufgaben** stehen in `TODO.md` mit Nummern (V1 bis V14 und A-Reihen). Erledigte Punkte sind mit [x] markiert.
- **Keine Schlüssel im Repo oder im Chat.** Schlüssel gehören in `/etc/flowtown.env` auf dem Server.
- **Keine Fotos von Personen im Repo.**
- **Keine Angaben erfinden.** Lieber „keine Angabe“ oder „vor Ort prüfen“ als eine geratene Zahl oder eine geratene Uhrzeit.
- **Datenschutz:** Der Standort bleibt auf dem Gerät, auch wenn in der Redaktions-App nach Entfernung sortiert wird. Die Datenschutzerklärung steht in `datenschutz.html`.

---

## 7. Betrieb auf dem Server

### Aktualisieren
```bash
cd /opt/flowtown && sudo git pull && sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown
```

### Gesundheit prüfen
Der Endpunkt `/api/health` zeigt, welche Quellen laufen, und ob der Datenordner schreibbar ist. Der Server läuft als Benutzer `flowtown`, Befehle, die als root laufen, brauchen danach das `chown` auf den Datenordner.

### Befehle (alle mit `node flowtown-server.mjs <Befehl>`, im Ordner `/opt/flowtown/server`, mit `set -a; . /etc/flowtown.env` davor)

| Befehl | Zweck |
|---|---|
| `redaktion-code <rolle> <Name>` | Einladungscode für die Redaktions-App |
| `redaktion-zugang` | Zugänge anzeigen |
| `redaktion-sperren <Anfang>` | Zugang sperren |
| `redaktion-zuruecksetzen <ID\|alle>` | Angaben zurückziehen (zum Beispiel nach Testeingaben) |
| `tagesbericht [Tage]` | „Heute zu tun“: Rückmeldungen, Entwürfe, fällige Objekte |
| `objektkatalog [Gebiet]` | Katalog aus OpenStreetMap und Bethel neu erzeugen |
| `objekt-anlegen <Name> <Breite> <Länge>` | Haltestelle von Hand in den Katalog eintragen |
| `steckbrief-export [Datei]` | Steckbrief für die App erzeugen |
| `luecken`, `rueckmeldungen`, `hinweise` | Lücken und Rückmeldungen |
| `db-test`, `echtzeit-test`, `fahrplan`, `haltestellen`, `mobilithek`, `stadtdaten` | Prüfen der Datenquellen |
| `assist-testreihe <Datei>` | Testreihe mit der Assistenz (braucht den Mistral-Schlüssel) |
| `folge-test <Datei>` | Testreihe ohne KI, nur die Regeln der Folgefragen |
| `testlauf`, `festantworten`, `beispiele`, `barrierefrei` | weitere Prüfungen, siehe `server/README.md` |

Vollständige Erklärung in `server/README.md` (Abschnitte zu jeder Quelle).

---

## 8. Entwicklung und Tests

### Ordnung im Repo
- `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`: Nutzer-App
- `redaktion/`: Redaktions-App
- `server/`: Server, Checklisten, Testreihen, Haltestellen-Liste (`haltestellen.csv`), Festantworten (`festantworten.csv`)
- `data/`: Steckbrief und Altstadt-FAQ
- `erfassung/`: Erfassungsschema (teilweise überholt, Fotos sind nicht mehr vorgesehen)
- `prototyp/`: Prototyp mit Bewertung je Profil (überholt)
- `vendor/`: Leaflet und anderes fremdes Material mit Lizenzen

### Tests
- **Steckbrief-Export:** `node server/test-steckbrief-export.mjs` (ohne Server, ohne Abhängigkeiten)
- **Testreihe der Assistenz:** `server/testreihe.txt` und `server/testreihe-quellen.txt`. Regeln in der Quellendatei: `Frage ;; muss: … ;; nicht: …`, `@absage` für ehrliche Absagen. Lauf mit `assist-testreihe` (mit KI) oder `folge-test` (ohne KI).
- **Browser-Tests:** Die Testskripte mit Playwright liegen außerhalb des Repos. Sie prüfen Ansichten auf dem iPhone-13-Profil und Fehler in der Konsole.

### Wo der Stand steht
- `TODO.md`: Aufgaben und Entscheidungen mit Datum
- `FAKTEN.md`: Datenmodell und Vertrauensstufen
- `ERFASSUNG-AUSGABE.md`: Konzept Erfassung und Ausgabe, mit Stand und offenen Punkten
- `REDAKTION.md`: Redaktions-App, Objektkatalog, Export, Befehle
- `ASSISTENZ-REGELN.md`: wie die Assistenz antwortet und was sie nicht darf
- `PROFIL-KONZEPT.md`: persönliches Profil, Lernen auf dem Handy
- `MARKTANALYSE.md`: Mitbewerber und Forschung (Websuche, nicht getestet)
- `PRUEFERGEBNIS-2026-11-10.md`, `PRUEFKATALOG.md`: Prüfungen der Nutzer-App

---

## 9. Offene Punkte (Stand 23.11.2026)

**Erfassung und Daten**
- Prießallee: Lage eintragen (das Feld gibt es seit heute), danach Export neu erzeugen und ins Repo übernehmen.
- Zweite Haltestelle: Sieker oder Teutoburger Straße, Zeit pro Haltestelle messen. Die Haltestelle muss vorher im Katalog stehen (`objekt-anlegen`).
- Markierung für Vorschläge aus Fotos in der Redaktions-App.
- Die Richtwerte der Messhinweise gegen DIN 18040 und DIN 32984 prüfen.

**Ausgabe und Nutzung**
- Lernen pro Person (nur auf dem Handy, mit Vorschlägen ab drei Besuchen).
- Test mit drei bis fünf Personen aus der Zielgruppe, vor Ort, mit exportierten Hinweisen mit Lage. Die Prüffrage: Kann jemand vor Ort erkennen, wo eine Querung, ein Leitstreifen oder eine Engstelle liegt?
- Verknüpfung des Steckbriefs mit Haltestellensuche oder Standort (bewusst noch nicht gemacht).

**Datenquellen**
- DB Timetables → OpenBoards: Umstellung vor Mitte 2027 (`TODO.md`, V13).
- Nach jedem Lauf von `objektkatalog` prüfen, ob die von Hand angelegten Haltestellen noch da sind. Seit dem Update am 23.11. bleiben sie erhalten.

**Markt und Förderung**
- Direktvergleich mit Google Maps (Gemini) bei denselben Fragen aus der Testreihe, mit Belegen.
- Förderung: Die Förderlage ist ungeklärt. Die frühere Angabe zu mFUND und OD2Guide war nicht belegt und ist gestrichen.
- Die Konkurrenz: Google bietet Sprachnavigation für Fußgänger, Rad und ÖPNV laut Bericht seit Januar 2026 auch in Deutschland. Die DB-Info-App soll Mitte November 2026 mit Aufzugsverfügbarkeit starten. Beides ist nicht selbst getestet.

---

## 10. Glossar

- **Angabe:** ein erfasster Wert zu einem Merkmal, mit Erfasser und Zeitpunkt.
- **Assistenz:** das Gespräch in der App, Text und Sprache, mit Werkzeugen und Regeln.
- **Checkliste:** die Fragen je Objektart in `server/checklisten.csv`.
- **Export:** die Datei, die aus Angaben und Checkliste für die App erzeugt wird.
- **Frischeklasse:** wie lange eine Angabe gilt (A bis D).
- **Katalog:** Liste der Objekte im Pilotgebiet mit Hinweis, was fehlt.
- **Lage:** wo genau ein Merkmal liegt, zum Beispiel „Ende des Bahnsteigs Richtung Innenstadt“.
- **Merkmal:** eine Eigenschaft, die erfasst wird.
- **Mitwirkend:** eine Rolle in der Redaktions-App, die Entwürfe einreicht.
- **Objekt:** eine Haltestelle, ein Aufzug, ein WC und ähnliches.
- **Profil:** der Bedarf einer Person (zum Beispiel Rollstuhl, blind).
- **Redaktion:** die Rolle, die Angaben gültig macht und exportiert.
- **Regeltabelle:** die Zuordnung von Merkmalen zu Profilen und Bewertungen, aus der Checkliste abgeleitet.
- **Steckbrief:** die Ansicht eines Bahnsteigs in der App, mit Bewertung je Profil.
- **Unbekannt:** der Zustand, wenn keine gültige Angabe vorliegt. Nie „passt“.
