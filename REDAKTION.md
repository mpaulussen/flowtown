# Redaktion: Pilotgebiet, Objektkatalog und Checklisten

Stand 11.11.2026. Entwurf als Grundlage für die Redaktions-App (TODO M2). Konzept: `FAKTEN.md`.

## Pilotgebiet

Altstadt, Hauptbahnhof, Bethel und Uni Bielefeld. Die Gebiete stehen in `server/pilotgebiet.json`. Altstadt und Hauptbahnhof haben feste Mittelpunkte (wie bei den Orten der Altstadt-FAQ), Bethel und Uni werden beim Lauf in OpenStreetMap nach dem Namen gesucht. **Der gefundene Mittelpunkt wird mit Kartenlink ausgegeben: bitte prüfen** und bei Bedarf `lat` und `lon` in der Datei eintragen.

## Objektkatalog erzeugen

Der Server holt die Objekte aus OpenStreetMap, ergänzt Gebäude von Bethel („Bielefeld barrierefrei erleben“) und gemeldete Hindernisse und schreibt eine Tabelle. Er braucht dafür Netz, nicht diesen Rechner.

```bash
cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs objektkatalog'
```

Nur ein Gebiet: `… objektkatalog Hauptbahnhof`. Ergebnis: `/var/lib/flowtown/qualitaet/objektkatalog-pilot.csv`. Spalten: ID, Objektart, Name, Gebiet, Breite, Länge, Priorität, Fehlt (Zahl), Fehlt, Bekannt, Quelle, Status.

- **Bekannt** zeigt, was OpenStreetMap oder Bethel schon sagen, zum Beispiel `zugang_stufenlos=yes (OSM)`. Das sind Angaben der Stufe 5 (automatisch) oder 2 (Bethel), noch nicht von der Redaktion geprüft.
- **Fehlt** nennt die Merkmale aus der Checkliste, zu denen nichts bekannt ist. Das ist die Erfassungsliste.
- **Priorität** 1 bis 3, danach nach Gebiet und Zahl der Lücken sortiert.

## Objektarten und Checklisten

Die Fragen stehen in `server/checklisten.csv` (Spalten Objektart, Merkmal, Frage, Antwort, Einheit, Klasse, Profile, OSM-Tag, Messhinweis). Die Klasse ist die Frischeklasse (A Minuten bis Stunden, B Tage, C Monate, D etwa ein Jahr). Antworten sind ja, teilweise, nein oder weiß nicht, eine Zahl mit Einheit oder eine Auswahl.

| Objektart | Priorität | Fragen | Beispiele |
| --- | --- | ---: | --- |
| Stadtbahn-Haltestelle (`stadtbahn_haltestelle`) | 1 | 10 | Ist der Einstieg in die Bahn ebenerdig (Hochbahnsteig); Kommt man stufenlos zum Bahnsteig (Rampe oder Aufzug); Gibt es einen Aufzug? Wenn ja, als eigenes Objekt anlegen. … |
| Bushaltestelle (`bushaltestelle`) | 3 (am Hauptbahnhof 2) | 8 | Wie hoch ist die Bordkante an der Haltestelle; Ist der Einstieg stufenlos möglich; Gibt es einen taktilen Leitstreifen oder ein Einstiegsfeld … |
| Aufzug (`aufzug`) | 1 | 10 | Ist der Aufzug jetzt in Betrieb; Passt ein Rollstuhl hinein und wieder hinaus; Wie breit ist die Tür der Kabine … |
| Öffentliches Gebäude, Eingang (`gebaeude_eingang`) | 2 | 10 | Gibt es einen stufenlosen Eingang; Wie hoch ist die höchste Schwelle am stufenlosen Eingang; Wie breit ist die Tür … |
| WC (`wc`) | 2 | 8 | Ist der Zugang zum WC stufenlos; Wie kommt man hinein; Wie breit ist die Tür … |
| Ampel und Querung (`querung_ampel`) | 3 | 8 | Gibt es ein Tonsignal; Gibt es ein Vibrationssignal am Taster; Wie hoch ist die höchste Bordkante an der Querung … |
| Behindertenparkplatz (`behindertenparkplatz`) | 2 | 6 | Wie viele Behindertenparkplätze gibt es hier; Wie breit ist ein Stellplatz; Wie weit ist es zum Eingang des Ziels … |
| Wegabschnitt, Hindernis (`hindernis_weg`) | 1 (gemeldet von Nutzenden) | 7 | Wie ist der Belag; Wie steil ist der Weg; Wie breit ist der Weg an der schmalsten Stelle … |

**Sehr wichtig:** „Weiß nicht“ ist immer erlaubt und besser als geraten.

## Erster Lauf auf dem Server (11.11.2026)

Mittelpunkte gefunden: Bethel 52.00698, 8.52530, Uni 52.03745, 8.49382. Der erste Lauf ergab 774 Objekte (Priorität 1: 54, 2: 329, 3: 391), darunter 312 Ampeln und 256 Gebäude. Das war mehr als geplant (300 bis 500), weil OpenStreetMap Haltestellen je Bahnsteig und Ampeln je Furt führt und Kreuzungssignale ohne Fußgängerquerung mitzählten. Deshalb jetzt:

- Ampeln nur noch, wenn sie als Fußgängerquerung oder mit Ton oder Vibration eingetragen sind.
- Gleichnamige Haltestellen (60 m) und nahe Ampeln (25 m) gelten als ein Objekt.
- Banken, Apotheken, Praxen und Kinos haben Priorität 3.

Zweiter Lauf: 675 OSM-Elemente zu 482 Objekten zusammengefasst, 487 Objekte insgesamt (Priorität 1: 34, 2: 210, 3: 243). Ganz oben stehen richtig die Aufzüge und Stadtbahn-Haltestellen (Hauptbahnhof, Jahnplatz, Rathaus, Landgericht, Bethel, Universität). Viele Aufzüge haben in OpenStreetMap keinen Namen. Dafür gibt es jetzt die Spalten **Lage** (Beschreibung, Ebene, Betreiber, Kennung, nächstes benanntes Objekt mit Abstand) und **OSM-Link**. Haltestellen mit Zusatz „(U)“ gelten als eine, Bushaltestellen gleichen Namens bis 80 m ebenso. Unter den Gebäuden stehen Rathaus, Bibliothek, Klinik, Post und Polizei zuerst.

Wer anfangen will: **Priorität 1 (34 Objekte) zuerst**, das sind die Aufzüge und Stadtbahn-Haltestellen und damit der Fall Jahnplatz. Danach Priorität 2, zuerst die öffentlichen Einrichtungen. Priorität 3 später.

## Redaktions-App (Version 0.1.0)

Eigene Web-App, getrennt von der Nutzer-App: **https://mpaulussen.github.io/flowtown/redaktion/** (Dateien in `redaktion/`). Sie spricht mit `/api/redaktion/*` des Flowtown-Servers.

**Einrichten (einmal):**

```bash
cd /opt/flowtown && sudo git pull && sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown
```

Das `chown` ist wichtig: Der Katalog wurde als root erzeugt, der Server läuft als Benutzer `flowtown` und könnte sonst nichts in `/var/lib/flowtown/qualitaet` speichern (auch nicht den Lückenzähler). `/api/health` zeigt unter `qualitaet.schreibbar`, ob es klappt.

**Zugang:** Einladungscodes (`RD-XXXX-XXXX`), der Server speichert nur einen Hash.

```bash
cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs redaktion-code redaktion Markus' && sudo chown -R flowtown: /var/lib/flowtown
```

Rollen: `redaktion` (erfasst gültig, bestätigt, gibt Entwürfe frei, exportiert) und `mitwirkend` (erfasst Entwürfe, die die Redaktion freigibt). Zugänge anzeigen: `… redaktion-zugang`. Sperren: `… redaktion-sperren <Anfang der Kennung>`, laufende Sitzungen enden sofort. Anmeldung gilt 30 Tage, nach acht falschen Codes Sperre für eine Viertelstunde.

**Was die App kann:**
- **Objekte:** Liste nach Priorität, Gebiet, Suche, „nur fällige“, auf Wunsch nach Entfernung (der Standort bleibt auf dem Gerät).
- **Erfassen:** Je Objekt die Checkliste. Ja, teilweise, nein oder weiß nicht antippen, Zahlen mit Einheit eintragen, optional eine Notiz. Jede Antwort wird sofort gespeichert. Ohne Netz landet sie in einer Warteschlange auf dem Gerät und geht später raus. OSM- und Bethel-Angaben stehen als Hinweis dabei („OSM sagt: yes, nicht geprüft“).
- **Prüfen:** „Stimmt noch“ bestätigt eine Angabe. Nach Ablauf der Frischeklasse steht „nicht mehr geprüft“, das Objekt gilt als fällig. Klasse A (Aufzug in Betrieb) gilt 12 Stunden.
- **Entwürfe:** Die Redaktion gibt Angaben von Mitwirkenden frei oder lehnt sie ab.
- **Verlauf** je Objekt (wer, wann, was), **Bericht** (Abdeckung und Aktualität nach Priorität, Gebiet und Objektart, Rückmeldungen der Nutzenden, was am häufigsten fehlt) und **CSV-Export**.

Die Angaben liegen als Protokoll in `/var/lib/flowtown/qualitaet/fakten.jsonl`. Sicherung: diese Datei und `redaktion-zugang.json` kopieren.

**Anbindung an die Assistenz (M2b, 11.11.2026):**
- **Aufzugsstatus:** Fragt jemand nach einem Aufzug an einer Stadtbahn-Haltestelle oder am Hauptbahnhof, hängt die Direktantwort einen Satz an, wenn die Redaktion einen Status erfasst hat: „Laut Redaktion, geprüft vor 2 Stunden: Aufzug zum Gleis 8: in Betrieb.“ Ist die Prüfung älter als 12 Stunden, steht dort „nicht mehr aktuell“ mit Datum, nie als gültige Auskunft. Der Satz kommt zusätzlich zu den Angaben der DB und den Meldungen von moBiel.
- **Neues Werkzeug `redaktion_fakten`:** Für Fragen zu einem bestimmten Ort oder Aufzug (Maße von Tür und Kabine, Schwelle, Eingang, WC, Haltestelle). Die KI nennt die Angabe „laut Redaktion“ mit Zeitpunkt und sagt offen, wenn die Redaktion den Ort noch nicht erfasst hat.
- **Vorschau:** `node flowtown-server.mjs redaktion-satz Hauptbahnhof` zeigt, was die Assistenz zu einem Ort aus den Angaben der Redaktion sagen würde (Satz der Direktantwort und Ergebnis des Werkzeugs).
- Zuordnung: Aufzüge gelten für eine Haltestelle, wenn sie höchstens 200 m entfernt sind oder den Namen in der Lage nennen.

**Noch nicht gebaut:** Fotos, neue Objekte, die im Katalog fehlen, Zweitprüfung.

## Was ich nicht prüfen konnte

- **Netz:** Der Befehl wurde hier nur mit einer selbst gebauten Beispieldatei getestet (Overpass ist in dieser Umgebung gesperrt). Auf dem Server fehlt noch der erste echte Lauf.
- **Richtwerte** in den Messhinweisen (zum Beispiel Tür mindestens 90 cm, Rampe höchstens 6 %, Kabine 110 mal 140 cm, Taster höchstens 85 cm) stammen aus meiner Erinnerung an DIN 18040 und DIN 32984. Vor der Nutzung gegen die Normen und gegen die Vorgaben von Bethel und der Behindertenbeauftragten prüfen.
- **OpenStreetMap-Lücken:** Was dort fehlt, steht im Katalog als „Fehlt“. Das heißt nicht, dass es das Merkmal nicht gibt. Ampeln in OpenStreetMap sind teils Kreuzungssignale ohne Fußgängerquerung.
- **Bethel und Uni:** Die Namenssuche kann daneben liegen.
