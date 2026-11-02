# Flowtown-Server

Kleiner Server ohne Abhängigkeiten (Node 18 oder neuer) für sechs Aufgaben:

- **Ebene „Wir“**: Die App sendet je Ampel nur Richtung (Achtel), Zeitfenster und Wartezeit. Der Server speichert Summen je Ampel, Richtung und Zeitfenster und zeigt sie erst, wenn mindestens `K_MIN` verschiedene Personen beigetragen haben. Fahrten, Uhrzeiten, Start und Ziel kommen nie an.
- **KI-Einschätzung**: Die App schickt zusammengefasste Werte (keine Koordinaten), der Server fragt Mistral und gibt Einschätzung und Empfehlungen zurück. Anfragen werden nicht gespeichert, höchstens `KI_PER_DAY` je IP und Tag.
- **Meldungen**: `news.json` im Datenordner, von dir gepflegt. Die App zeigt nur Meldungen, die ihre eigenen Wege berühren; das prüft sie selbst.
- **Verkehrslage vor der Fahrt** (`GET /api/lage`): Stau, Störungen, Baustellen und Sperrungen für ganz Bielefeld. Quellen: Autobahn GmbH des Bundes (A2, A33, ohne Schlüssel) und HERE (Stadtstraßen, mit Schlüssel). Der Server holt höchstens alle `LAGE_MIN` Minuten neu und nur, wenn eine App fragt; alle Apps bekommen dasselbe Gesamtbild. Welche Meldungen die eigenen Wege betreffen, prüft die App auf dem Handy.
- **Ziel prüfen** (`GET /api/ort`, `GET /api/ziel`): Nur auf Knopfdruck. Die App schickt das Ziel und ihren Standort, auf etwa 1 km gerundet. Der Server fragt HERE nach der Strecke mit Verkehr (jetzt und vier spätere Abfahrtszeiten), holt Störungen entlang der Strecke (HERE, Autobahn GmbH) und vergisst die Anfrage nach 3 Minuten. Störungen nimmt der Server aus der Streckenberechnung von HERE (nur was auf genau dieser Strecke liegt), benennt sie mit Straße und Ort („A2 bei Kamen“) und ergänzt Sperrungen und Staus der Autobahn GmbH. Etwa fünf bis sieben HERE-Abfragen je Prüfung, höchstens `ZIEL_PER_DAY` Prüfungen je IP und Tag. Braucht denselben HERE-Schlüssel.

## Einrichten auf Ubuntu (songdeepdive-Server)

```bash
node --version                                   # 18 oder neuer
sudo useradd --system --home /opt/flowtown --shell /usr/sbin/nologin flowtown
sudo git clone https://github.com/mpaulussen/flowtown.git /opt/flowtown
sudo mkdir -p /var/lib/flowtown && sudo chown flowtown: /var/lib/flowtown

sudo cp /opt/flowtown/server/flowtown.env.example /etc/flowtown.env
sudo nano /etc/flowtown.env                      # Mistral-Schlüssel und SALT eintragen (openssl rand -hex 32)
sudo chmod 600 /etc/flowtown.env

sudo cp /opt/flowtown/server/flowtown.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now flowtown
systemctl status flowtown                        # „Flowtown-Server auf 127.0.0.1:8787, KI an …“
```

Falls `node` nicht unter `/usr/bin/node` liegt (zum Beispiel mit nvm): Pfad mit `which node` prüfen und in `flowtown.service` anpassen.

### Über die bestehende Domain erreichbar machen (nginx)

Den Block aus `nginx-flowtown.conf` in den `server { … }`-Block der songdeepdive-Domain (Port 443) einfügen, dann:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl https://<deine-domain>/flowtown-api/api/health
```

Antwort: `{"ok":true,"ki":true,"modell":"mistral-small-latest","kMin":5}`

### In der App

„Mehr“ → „Flowtown-Server“: Adresse `https://<deine-domain>/flowtown-api` eintragen, „Verbindung prüfen“, dann die beiden Häkchen nach Wunsch setzen.

### Aktualisieren

```bash
cd /opt/flowtown && sudo git pull && sudo systemctl restart flowtown
```

### Verkehrslage einrichten

Autobahn-Meldungen laufen sofort. Für die Stadtstraßen:

1. Auf platform.here.com ein kostenloses Konto anlegen, eine App anlegen und dort einen **API Key** erzeugen.
2. Auf dem Server `sudo nano /etc/flowtown.env` und diese Zeile ergänzen (den Schlüssel nicht weitergeben):
   ```
   HERE_API_KEY=dein-schluessel
   ```
3. `sudo systemctl restart flowtown`, dann in der App unter „Mehr“ auf „Verbindung prüfen“: dort steht „Verkehrslage: Autobahn und Stadt (HERE)“.

Bei 5 Minuten Abstand sind das höchstens knapp 600 HERE-Abfragen am Tag (Fluss und Störungen), egal wie viele Leute die App nutzen. Die aktuellen Freikontingente und Nutzungsbedingungen bitte bei HERE prüfen. Weitere Autobahnen: `LAGE_ROADS=A2,A33,A30`.

### Wohin fahren? mit Bus und Bahn

Die Ortssuche nutzt HERE Discover (Orte und Einrichtungen wie „Uni Bielefeld“) und HERE Geocode (Adressen) mit demselben Schlüssel.

Nutzt denselben HERE-Schlüssel mit der HERE Public Transit API (Verbindungen deutschlandweit, mit Zügen). Meldet die App „Die Verbindungssuche ist für den HERE-Schlüssel noch nicht freigeschaltet“, auf platform.here.com in der App beim Schlüssel prüfen, ob „Public Transit“ dazugehört. Jede Suche ist eine Abfrage; sie zählt wie die Ziel-Prüfung (`ZIEL_PER_DAY`).

### Umleitungen von moBiel

Laufen ohne Einrichtung. Der Server liest höchstens alle 15 Minuten die öffentliche Seite https://www.mobiel.de/aktuelles/neueste-umleitungen/ (nur wenn jemand in der App „Bus und Bahn“ gewählt hat) und gibt Titel, Linien, Zeitraum, den ersten Satz und den Link weiter: `/api/oepnv`. Welche Linien jemand fährt, erfährt der Server nicht. Liefert die Seite nichts Lesbares mehr (etwa nach einem Umbau bei moBiel), bleibt die letzte gute Liste bis zu 24 Stunden stehen; im Protokoll steht dann `moBiel: …`. Abstand ändern: `MOBIEL_MIN=30`.

### Fahrplan von moBiel (DELFI)

Der Server holt einmal pro Woche nachts (3 bis 5 Uhr) den deutschlandweiten Fahrplan von DELFI (GTFS, etwa 550 MB), zieht mit `fahrplan-bielefeld.py` nur moBiel und alle Züge mit Halt in Bielefeld heraus (RE, RB, IC, ICE mit ihren Halten in Ostwestfalen) (etwa 40 Sekunden, rund 130 MB Arbeitsspeicher) und löscht die große Datei wieder. Übrig bleibt `fahrplan.json` mit knapp 2 MB; die App lädt sie gepackt mit etwa 150 KB und rechnet die Abfahrten auf dem Handy.

1. Python 3 muss da sein (bei Ubuntu vorinstalliert): `python3 --version`. Kurzzeitig braucht der Server etwa 600 MB freien Platz: `df -h /var/lib`.
2. In `/etc/flowtown.env` den persönlichen Freigabe-Link von opendata-oepnv.de eintragen (Datensatz „Deutschlandweite Sollfahrplandaten (GTFS)“, Knopf „Teilen“ bzw. Download-Link), in Anführungszeichen:
   ```
   DELFI_GTFS_URL="https://www.opendata-oepnv.de/index.php?id=1384&tx_vrrkit_view%5Bsharing%5D=…"
   ```
3. `sudo systemctl restart flowtown`. Fehlt der Fahrplan, holt der Server ihn sofort (etwa eine Minute), danach wöchentlich. Ins Protokoll schauen: `sudo journalctl -u flowtown -n 20` zeigt „Fahrplan: 91 Linien, … Fahrten“.

Nach einem Update des Auszugs (etwa 0.24 mit Zügen) einfach die alte Datei löschen und neu starten, dann holt der Server sofort neu: `sudo rm /var/lib/flowtown/fahrplan.json && sudo systemctl restart flowtown`.

Von Hand neu holen: `sudo bash -c 'set -a; . /etc/flowtown.env; node /opt/flowtown/server/flowtown-server.mjs fahrplan' && sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown`. Lizenz: CC BY 4.0, Quelle DELFI e.V.; die App nennt sie unter den Abfahrten.

### Radwege (OpenStreetMap)

Laufen ohne Einrichtung. Der Server lädt nach dem Start die Radwege für ganz Bielefeld bei der Overpass-API (FOSSGIS e.V.) in Kacheln von etwa 3 × 2 km, stuft sie ein (eigener Radweg, ruhige Straße, Radstreifen oder Tempo 30, ohne Radweg) und legt sie gepackt unter `/var/lib/flowtown/radnetz/` ab: rund 90 Kacheln, zusammen etwa 10 bis 25 MB. Er fragt immer nur eine Kachel zur Zeit mit Pause dazwischen, das erste Füllen dauert deshalb 10 bis 30 Minuten; danach erneuert er alte Kacheln alle 14 Tage nachts (2 bis 5 Uhr). Die App holt fertige Kacheln von `/api/radnetz?k=…` in Sekundenbruchteilen. Kacheln außerhalb Bielefelds holt der Server bei Bedarf und behält sie ebenfalls. Im Protokoll: „Radwege: 88 Kacheln geladen“.

Ist ein Overpass-Server überlastet (Fehler 429, 502 oder 504), versucht der Server es beim nächsten (Standard: overpass-api.de, dann overpass.kumi.systems) und wiederholt bis zu zweimal mit Pause. An diese Server geht nur das Kartenrechteck, nichts über Nutzer*innen. Einstellungen (optional): `OVERPASS_URL=` mit einer eigenen, durch Kommas getrennten Liste, `RAD_PREFETCH=0` schaltet das Vorab-Laden ab (dann nur bei Bedarf).

### Weg-Check zu Fuß

„Wohin fahren?“ prüft ab 0.39 auch Fußwege (HERE, Fußgänger). Für den Weg-Check holt der Server Wege mit Belag, Stufen, Steigung, Bordsteine, Gleisquerungen und Ampeln aus OpenStreetMap, in denselben Kacheln wie die Radwege, unter `/var/lib/flowtown/fussnetz/` (`/api/fussnetz`). Vorab nur die Innenstadt (9 Kacheln), der Rest bei Bedarf. Keine Einrichtung nötig.

### Barrierefrei: Orte von Bethel, Toiletten und Aufzüge

Laufen ohne Einrichtung. Der Server holt beim ersten Start und danach einmal pro Woche nachts die Angaben zu rund 100 Gebäuden von „Bielefeld barrierefrei erleben“ (v. Bodelschwinghsche Stiftungen Bethel, Neue Schmiede; Kriterien motorisch, visuell, auditiv, kognitiv) über deren öffentliche Schnittstelle, ein Gebäude nach dem anderen mit Pausen (etwa 2 bis 3 Minuten), dazu rollstuhlgerechte Toiletten und Aufzüge aus OpenStreetMap. Ergebnis: `/var/lib/flowtown/barrierefrei.json`, rund 90 KB; die App lädt sie gepackt mit etwa 10 KB über `/api/barrierefrei`. Von Hand neu holen: `node flowtown-server.mjs barrierefrei` (mit derselben Umgebung wie beim Fahrplan). Im Protokoll: „Barrierefrei: 102 Orte, … Toiletten, … Aufzüge“.

Die Nutzung der Daten von Bethel bitte mit der Neuen Schmiede abstimmen (kultur@neue-schmiede.de); die App nennt die Quelle und verlinkt jeden Ort auf bielefeld-barrierefrei.de. Abschalten: `BETHEL_DATA=0` (dann nur OpenStreetMap).

Seit 0.37 merkt sich der Fahrplan-Auszug auch, welche Haltestellen laut DELFI stufenlos sind. Damit das gleich wirkt, den Auszug einmal neu holen: `sudo rm /var/lib/flowtown/fahrplan.json && sudo systemctl restart flowtown`.

### Redaktion: Hinweise in einer gemeinsamen Tabelle pflegen

Die Hinweise unter „Gut zu wissen“ (Tipps, Karte, Weg-Check, Ziele) kommen aus einer Tabelle, die ihr im Team pflegt. Die App bringt die Altstadt-FAQ als Grundstock mit; sobald die Tabelle eingerichtet ist, gilt deren Inhalt.

1. In Google Tabellen eine neue Tabelle anlegen und `server/redaktion-vorlage.csv` importieren (Datei > Importieren > Hochladen, Trennzeichen automatisch). Spalten: ID, Kategorie, Frage, Antwort, Ort, Zielgruppen, Breite, Länge, Aktiv, Gültig bis.
2. Datei > Freigeben > Im Web veröffentlichen: das Tabellenblatt wählen, Format „Kommagetrennte Werte (.csv)“, Veröffentlichen. Den Link kopieren.
3. In `/etc/flowtown.env` eintragen, in Anführungszeichen: `REDAKTION_CSV_URL="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"`, dann `sudo systemctl restart flowtown`.
4. Prüfen: `cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs faq'` zeigt die Zahl der Hinweise und jede fehlerhafte Zeile. `/api/health` zeigt unter `redaktion` Anzahl und Stand.

Der Server holt die Tabelle stündlich; Änderungen sind also spätestens nach einer Stunde in der App (oder sofort mit dem Befehl aus Schritt 4 und einem Neustart). Fehlerhafte Zeilen überspringt er und nennt sie im Protokoll; ist die Tabelle nicht erreichbar, bleibt die letzte gute Fassung.

Regeln für die Spalten:
- **ID**: eindeutig, z. B. AS-48 oder RE-01. **Frage** und **Antwort** sind Pflicht; Zeilenumbrüche in der Antwort sind erlaubt.
- **Ort**: einer oder mehrere, mit Komma: Alter Markt, Obernstraße, Haltestelle Rathaus, Jahnplatz, Hauptbahnhof, Bahnhofstraße, Kunsthalle, Altstadt, Innenstadt, Bielefeld (allgemein).
- **Zielgruppen**: mit Komma, aus Rollstuhl, Rollator, Sehbehinderung, Hörbehinderung, Ältere Menschen, Vorübergehende Einschränkung, Psychische Erkrankung, Neurodivergenz, Chronische Erkrankung, Leichte Sprache, Alle.
- **Breite/Länge** (freiwillig): für einen Hinweis zu genau einer Stelle, z. B. 52.02139 und 8.53389 (Punkt oder Komma). Dann zeigt die Karte dort ein eigenes kleines i, und der Weg-Check nennt ihn, wenn ein Weg vorbeiführt. Koordinaten: in Google Maps lange auf die Stelle drücken.
- **Aktiv**: „nein“ blendet eine Zeile aus (Entwurf). **Gültig bis**: TT.MM.JJJJ, danach verschwindet der Hinweis von selbst.

Statt eines Links geht auch eine Datei: `/var/lib/flowtown/faq.csv` (gleicher Aufbau, Komma oder Semikolon).

### Stadtbahn: Haltestellen mit und ohne Hochbahnsteig

Der DELFI-Fahrplan sagt für Bielefeld bei keiner Haltestelle, ob sie stufenlos ist. Diese Angabe kommt deshalb aus einer kleinen Liste der Redaktion. Die App zeigt sie in Bus & Bahn bei jeder Verbindung („✗ kein Hochbahnsteig“ mit Hinweis), markiert Verbindungen mit „✗ Stufen“ und wählt mit Profil Rollstuhl oder Rollator die erste Verbindung ohne bekannte Stufen vor. Auf der Karte unter „Stadtbahn“ sind die Haltestellen grün (Hochbahnsteig), rot (keiner) oder gelb (teilweise).

Spalten: **Haltestelle** (Name wie im Fahrplan, z. B. Teutoburger Straße; „Str.“ geht auch), **Hochbahnsteig** (ja, nein oder teilweise), **Hinweis** (z. B. „Nur Richtung Sieker mit Hochbahnsteig“), **Quelle**. Trenner Komma oder Semikolon.

Der Server nimmt die erste vorhandene Quelle:
1. `HALTESTELLEN_CSV_URL` in `/etc/flowtown.env`, z. B. ein zweites Blatt der Redaktions-Tabelle, veröffentlicht als CSV (wie oben),
2. die Datei `/var/lib/flowtown/haltestellen.csv`,
3. `server/haltestellen.csv` aus dem Repository (Grundstock).

Er liest die Liste beim Start und dann stündlich und nennt im Protokoll jede Zeile, die er nicht zuordnen kann. `/api/health` zeigt unter `haltestellen` Anzahl und Quelle.

**Liste vervollständigen:** `cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs haltestellen'` listet alle Stadtbahn-Haltestellen aus dem Fahrplan mit dem Eintrag der Liste und einem Vorschlag aus OpenStreetMap (Bahnsteig mit Höhe oder Rollstuhl-Angabe), und schreibt `/var/lib/flowtown/haltestellen-vorschlag.csv`. Die Datei in die Tabelle importieren, die Vorschläge prüfen (am besten mit der offiziellen Liste von moBiel), leere Zeilen ausfüllen.

**Aufzüge:** Der Fahrplan-Auszug zieht aus DELFI die Wege in Stationen (Aufzüge, Rolltreppen, Treppen), z. B. Hauptbahnhof, Jahnplatz, Nordpark. Die App zeigt dann „✓ Aufzug“. Dafür den Fahrplan einmal neu holen: `sudo rm /var/lib/flowtown/fahrplan.json && sudo systemctl restart flowtown` (dauert einige Minuten).

### Behindertenparkplätze

Mit dem Auto zeigt „Wohin?“ beim Ziel die Behindertenparkplätze bis 400 m entfernt. Mit Profil ist der Abschnitt offen, ohne Profil eingeklappt. Auf der Karte erscheinen sie unter „Barrierefrei“ als blaues P.

Der Server holt sie einmal am Tag aus zwei Quellen:
1. **OpenStreetMap** (Stellplätze mit `parking_space=disabled`, Parkplätze mit `capacity:disabled`). Das geht ohne Einrichtung.
2. **Stadt Bielefeld, Open Data** „Schwerbehindertenparkplätze“ (CC BY 4.0). Der Server holt die CSV-Ausgabe des Geodienstes der Stadt (www.bielefeld01.de) von selbst, ohne Einrichtung. Eine andere Quelle geht mit `BEHINDERTENPARKPLAETZE_URL="…"` in `/etc/flowtown.env` (CSV oder GeoJSON), abschalten mit `BEHINDERTENPARKPLAETZE_URL=0`; dann gilt auch eine Datei `/var/lib/flowtown/behindertenparkplaetze.csv` (oder `.geojson`).

Der Server erkennt Koordinaten in Breite/Länge oder UTM 32 (Rechtswert/Hochwert, EPSG:25832) und sucht sich Spalten für Standort und Anzahl. Stellen aus OpenStreetMap, die die Stadt schon hat, fallen weg.

Prüfen: `cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs parkplaetze'` zeigt die Zahl je Quelle, welche Spalten erkannt wurden, und die ersten Einträge. Danach `sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown`.

### Daten der Stadt Bielefeld: Ampelanlagen, Baustellen, Park + Ride, Radverkehrsnetz

Der Server holt von selbst aus dem Geodienst der Stadt (Open Data Bielefeld, CC BY 4.0, www.bielefeld01.de):
- **Ampelanlagen** (wöchentlich): 322 Anlagen mit Nummer und Art (Kreuzung, Fußgängerampel, Stadtwerke, Straßen.NRW). Die App ergänzt damit OpenStreetMap: Wo im geladenen Gebiet bis 80 m keine Ampel aus OpenStreetMap steht, nimmt sie die Anlage der Stadt dazu. Jede Kreuzung bekommt die Nummer der nächsten Anlage (bis 50 m); „Meine Ampeln“ auf der Karte zeigt sie, z. B. „Anlage Nr. 723 · Fußgängerampel“. Bestehende Kreuzungen behalten ihre Kennung, ältere Fahrten passen weiter.
- **Aktuelle Baustellen** (alle 30 Minuten, zusammen mit der Verkehrslage): Straße, Abschnitt, Art der Arbeiten, Zeitraum und, wo vorhanden, der Hinweis für den Fuß- und Radverkehr. Sie erscheinen auf der Karte unter „Baustellen“, in „Dein Weg heute“ und bei „Wohin?“ entlang der Strecke; zu Fuß mit dem Hinweis für den Fußverkehr.

- **Park + Ride** (wöchentlich): 7 Anlagen mit Zahl der Plätze. Fährt man mit dem Auto in die Innenstadt (Ziel bis 2,5 km vom Jahnplatz, Strecke ab 4 km) und liegt eine Anlage bis 800 m an der Strecke, schlägt „Wohin?“ sie vor, mit Stadtbahn-Haltestelle und Linien; ein Knopf plant ab dort mit Bus und Bahn weiter. Auf der Karte unter „Stadtbahn“ als blaues P+R.
- **Radverkehrsnetz** (wöchentlich, Datensatz „Radverkehrskonzepte“): 545 Abschnitte, etwa 417 km. Auf der Karte unter „Radwege“ als dünne gestrichelte Linie, auch weit herausgezoomt; bei „Wohin?“ mit dem Rad steht, zu wie viel Prozent die Strecke darauf liegt.

Prüfen: `cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs stadtdaten'`. Abschalten mit `STADT_DATEN=0` in `/etc/flowtown.env`. `/api/health` zeigt `ampelanlagen` und `baustellenStadt`.

### Gemeldete Hindernisse prüfen

`node flowtown-server.mjs hinweise` listet alle Meldungen mit Kennung, Art, Stelle, Datum, Bestätigungen und einem Kartenlink. `node flowtown-server.mjs hinweis <Kennung> geprueft` markiert eine Meldung als von der Redaktion geprüft (Häkchen in der App, bleibt fünf Jahre, verschwindet erst nach drei „Ist weg“), `… hinweis <Kennung> weg` löscht sie. Danach `sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown`.

### Hinweise von Nutzer*innen

Ab 0.40 können Nutzer*innen auf der Karte Hindernisse melden (Stufe, hoher Bordstein, schlechter Belag, Aufzug defekt, Gehweg blockiert, Toilette nicht nutzbar, Ampel, „gut zugänglich“), bestätigen oder als erledigt markieren. Nur feste Arten, kein freier Text, gespeichert ohne IP in `/var/lib/flowtown/hinweise.json`. Aufzüge verfallen nach 7 Tagen, blockierte Wege und Toiletten nach 14, Ampeln nach 180, bauliche Hindernisse nach 365 Tagen; zwei „Ist weg“ entfernen einen Hinweis. Höchstens 30 Meldungen je IP und Tag (nur im Arbeitsspeicher). Einen Hinweis von Hand löschen: Eintrag aus der Datei entfernen und den Dienst neu starten.

Die Orte der Altstadt-FAQ (Alter Markt, Obernstraße, Haltestelle Rathaus, Jahnplatz, Hauptbahnhof, Bahnhofstraße, Kunsthalle) bestimmt der Server aus OpenStreetMap, Haltestellen notfalls aus dem Fahrplan (DELFI), und liefert sie mit `/api/barrierefrei` aus. Welche Orte er kennt, zeigt `/api/health` unter `faqOrte`. Den Punkt für Plätze und Straßen nimmt der Server von HERE (Adresssuche), den Umriss von OpenStreetMap; ohne HERE die Fläche des Platzes bzw. die Mitte entlang der Straße. Zum Prüfen und Nachholen von Hand: `node flowtown-server.mjs faq-orte` zeigt je Ort die Koordinaten und ihre Quelle und speichert sie. Einen Ort selbst festlegen (geht immer vor): `node flowtown-server.mjs faq-ort "Alter Markt" 52.0214 8.5339`, aufheben mit `… faq-ort "Alter Markt" weg`. Danach jeweils `sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown`.

### Pilot: Codes vergeben und Fahrten exportieren

Testpersonen bekommen einen Pilot-Code (Form `FT-XXXX-XXXX`). Mit Code und Einwilligung überträgt die App ihre Fahrten pseudonym an den Server (ohne Zielnamen). Der Server speichert nur einen Hash des Codes, nie einen Namen.

Neue Codes erzeugen, hier 5 Stück:

```bash
sudo bash -c 'set -a; . /etc/flowtown.env; node /opt/flowtown/server/flowtown-server.mjs neue-codes 5' && sudo chown -R flowtown: /var/lib/flowtown
```

Die Ausgabe (Code und Pseudonym) nur bei dir aufbewahren, etwa in einer Liste mit den Namen. Ein Neustart ist nicht nötig.

Einladungslink für eine Testperson: `https://mpaulussen.github.io/flowtown/?code=FT-XXXX-XXXX`

Alle Pilotfahrten als eine Datei exportieren (für den Ampel-Report):

```bash
sudo bash -c 'set -a; . /etc/flowtown.env; node /opt/flowtown/server/flowtown-server.mjs export' > pilot-export.json
```

Die Daten liegen in `/var/lib/flowtown/pilot/`, eine Datei je Code. Testpersonen können ihre Daten in der App unter „Mehr“ → „Pilot“ selbst löschen.

### Meldungen pflegen

Vorlage: `news.example.json`. Die Datei liegt als `/var/lib/flowtown/news.json` und wird bei jeder Anfrage neu gelesen, ein Neustart ist nicht nötig. `lat`/`lon`/`radius_m` weglassen für Meldungen, die für die ganze Stadt gelten.

## Datenschutz

- Mistral: In der Mistral-Konsole prüfen, dass API-Daten nicht zum Training verwendet werden und wie lange Mistral Anfragen aufbewahrt.
- Vor einer öffentlichen Nutzung braucht die App eine Datenschutzerklärung, die Server, Mistral und die Ebene „Wir“ beschreibt.
- Verkehrslage: Der Server ruft HERE und die Autobahn-API ohne Daten der Nutzer ab; die App lädt nur das Gesamtbild.
- Pilot: pseudonym je Code, ohne Zielnamen. Vor dem Pilot die Datenschutzerklärung (`datenschutz.html`, Entwurf) fertigstellen und prüfen lassen.
- Daten liegen in `/var/lib/flowtown/wir.json`. Löschen setzt die Ebene „Wir“ zurück.
