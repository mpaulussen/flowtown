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


**Quellenprüfung der Assistenz (seit 13.11.2026):** Antworten zu Bus und Bahn dürfen nur enthalten, was die Werkzeuge geliefert haben. Das Werkzeug `fahrt_pruefen` beantwortet „Hält der Zug nach X in Y?“ aus dem Fahrplan, mit Echtzeit, und sagt „nicht prüfbar“, wenn das Ziel nicht im Fahrplanausschnitt liegt. Nennt die KI trotzdem Linien oder Ziele, die nicht im Ergebnis stehen, oder antwortet sie ohne Fahrplan-Werkzeug, lässt der Server sie einmal korrigieren und setzt sonst eine feste Absage („Dazu habe ich keine Angabe aus einer sicheren Quelle …“). Im Protokoll steht dann `Quellenprüfung: <Grund>`. Ausprobieren: `node flowtown-server.mjs fahrt-pruefen Detmold Osnabrück` (ohne KI) und `node flowtown-server.mjs assist-frage "Hält der Zug nach Osnabrück in Detmold?"` (mit KI).

**Selbsttest der Echtzeit-Zuordnung:** `node flowtown-server.mjs echtzeit-test` nimmt echte Fahrten mit Echtzeit aus dem Datenstrom und prüft, ob die Zuordnung sie wiederfindet (richtig, keine eindeutige Zuordnung, falsch).

**Echtzeit für eine Fahrt prüfen:** `node flowtown-server.mjs echtzeit-leg "RE 82" 51.9387 8.8742 2026-11-13T07:12:00+01:00` sagt, ob zu einer Fahrt von HERE (Linie, Haltestelle als Breite und Länge, geplante Abfahrt) eine Echtzeit eindeutig zuzuordnen ist. Ergebnis `null` heißt: keine sichere Zuordnung, die App zeigt dann keine Verspätung. Gleiche Zuordnung nutzt der Vergleich „Dein Weg jetzt“ (`/api/vergleich`, Feld `echtzeit`).

**Weitere Städte:** Aus demselben Datensatz zieht der Server auch Auszüge für Mönchengladbach, Paderborn und Detmold (Detmold seit 13.11.2026: Der Bielefelder Auszug enthält nur Züge mit Halt in Bielefeld, Detmold hatte darin nur zwei Bushaltestellen): alle Busse und Bahnen, die dort halten, gleich welcher Betreiber, und die Züge mit ihren Halten in der Region (`fahrplan-moenchengladbach.json`, `fahrplan-paderborn.json`). Die App lädt den Fahrplan der Stadt, in der man gerade ist (`/api/fahrplan?stadt=moenchengladbach`), und die Assistenz nennt dort Abfahrten. Fehlt nach einem Update ein Auszug, holt der Server den Datensatz einmal gleich neu, nicht erst nachts. Welche Städte, steht in `FAHRPLAN_STAEDTE` in `/etc/flowtown.env` (kommagetrennt; leer = nur Bielefeld; ohne Eintrag: Mönchengladbach und Paderborn). Neue Städte bekommen im Server einen Eintrag in `STADT_FP` mit Stadt- und Regionsrahmen; in der App einen in `FP_STAEDTE`.

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

### Aufzüge an DB-Bahnhöfen (Mobilithek)

Der Server holt über die Mobilithek die Stammdaten aller Aufzüge und Rolltreppen an DB-Bahnhöfen (DB InfraGO „OpenStation NeTEx“, einmal pro Woche, etwa 300 MB, behalten werden nur Aufzüge und Rolltreppen) und alle 5 Minuten ihren Status („OpenStation SIRI FM“). Lizenz CC0. Flowtown nennt dann am Ziel und in der Assistenz, welcher Aufzug außer Betrieb ist, und zeigt die Aufzüge auf der Karte unter „Barrierefrei“ (rot: außer Betrieb).

Einrichtung: Maschinenzertifikat der Mobilithek nach `/etc/flowtown/mobilithek.p12` (`chown root:flowtown`, `chmod 640`), in `/etc/flowtown.env` `MOBILITHEK_CERT=/etc/flowtown/mobilithek.p12` und `MOBILITHEK_CERT_PASS='…'`. Die Abo-IDs sind voreingestellt; andere mit `MOBILITHEK_ABO_NETEX` und `MOBILITHEK_ABO_SIRIFM`. Abgeholt wird mit `curl` (Container-Schnittstelle). `/api/health` zeigt unter `aufzuegeDb` Anzahl, Stand und wie viele gerade außer Betrieb sind.

### Echtzeit für Bus und Bahn (Mobilithek, DELFI GTFS-RT)

Verspätungen und Ausfälle kommen aus dem deutschlandweiten Datenstrom von DELFI (GTFS-RT Trip Updates, CC BY-SA 4.0) über die Mobilithek, mit demselben Maschinenzertifikat wie die DB-Aufzüge. Der Server holt ihn nur, wenn in den letzten 15 Minuten jemand Abfahrten angesehen oder die Assistenz gefragt hat, dann höchstens alle 90 Sekunden, und behält nur die Fahrten aus den Fahrplan-Auszügen (Bielefeld, Mönchengladbach). Dafür schreibt der Auszug die Fahrt-Kennungen in `fahrplan.ids.json` (bleibt auf dem Server); fehlen sie nach dem Update, holt der Server den Fahrplan einmal gleich neu. Die App fragt `/api/echtzeit?stadt=…` (nur die Stadt) und rechnet die Verspätungen selbst ein. Abo-ID ändern mit `MOBILITHEK_ABO_GTFSRT`. `/api/health` zeigt unter `echtzeit` Stand, Zahl der Fahrten und Größe des Datenstroms.

### Straßen.NRW: Verkehrsmeldungen, Baustellen, Umleitungen (Mobilithek, DATEX II)

Drei Abos der Mobilithek (Landesbetrieb Straßenbau NRW, Datenlizenz Deutschland – Zero), sobald Straßen.NRW sie freigibt: Verkehrsmeldungen der VIZ.NRW (Staus, Unfälle, Sperrungen, Glätte), Arbeitsstellen und Umleitungen außerhalb der Autobahnen. Der Server holt sie nur bei Bedarf (Lage oder Strecke angefragt): Meldungen alle 3, Baustellen und Umleitungen alle 30 Minuten; solange ein Abo noch nicht freigegeben ist (HTTP 404), einmal pro Stunde. Sie kommen auf die geprüfte Strecke (nicht doppelt zu Meldungen der Autobahn GmbH oder HERE) und in die Lage für Bielefeld. Abo-IDs ändern mit `MOBILITHEK_ABO_VIZ`, `MOBILITHEK_ABO_ARBEITSSTELLEN`, `MOBILITHEK_ABO_UMLEITUNGEN`. `/api/health` zeigt unter `strassenNrw` je Abo Anzahl und Stand oder „wartet auf Freigabe“.

Alle Mobilithek-Abos auf einmal prüfen: `sudo bash -c 'set -a; . /etc/flowtown.env; node /opt/flowtown/server/flowtown-server.mjs mobilithek'`

### Treppen im Fußwegnetz

Die Kacheln des Fußwegnetzes (`/api/fussnetz`) tragen bei Treppen jetzt Stufenzahl (`step_count`), Richtung (`incline` up/down) und Handlauf (`handrail`, `handrail:left/right/center`) aus OpenStreetMap. Die App sagt damit unterwegs Treppen an (etwa 25 m und 6 m vorher). Ältere Kacheln erneuert der Server einmal im Hintergrund, wenn sie abgerufen werden.

### Assistenz: Plan B, Rückweg, Hilfe, Eingang, Lücken

- **Plan B (`plan_b`)** steht in den Ergebnissen von `weg_check`, `vergleich`, `ort_info`, `oepnv_stoerungen` und `rueckweg`, wenn es ein Hindernis gibt (Stufen, Sperrung, Störung, Aufzug außer Betrieb). Die Alternativen stammen aus den Daten (Stadtbahn mit Hochbahnsteig, andere Aufzüge am Bahnhof, neu berechnen), nie aus dem Modell.
- **`rueckweg`**: letzte Abfahrten heute an Haltestellen bis 500 m um das Ziel (Bielefeld, Mönchengladbach), Aufzüge am Bahnhof, Verbindungen jetzt zurück.
- **`hilfe_menschen`**: Möglichkeiten, wenn die Person nicht weiterweiß (Passanten, Be My Eyes, Servicepersonal am Bahnhof, Mobilitätsservice der Bahn, moBiel-Kundenservice). Ohne Telefonnummern, mit Verweis auf bahn.de und mobiel.de.
- **Eingang (`eingang`)**: Zu Fuß endet die Strecke am Eingang des Ziels (OpenStreetMap `entrance`, bis 70 m, bei Rollstuhl und Rollator zuerst ein stufenloser, sonst Haupteingang). Overpass bekommt nur feste Rechtecke von etwa 670 × 410 m, nie das genaue Ziel.
- **Lücken (`angaben_fehlen`)**: je Profil, was zum Gebäude fehlt (Türbreite, Aufzuggröße, Leitsystem, Induktionsschleife …). Die KI sagt das offen.
- Ergebnisse von Werkzeugen werden bei 4000 Zeichen gekürzt: Wichtiges (`plan_b`, `eingang`, `angaben_fehlen`) steht deshalb am Anfang.

### Öffentliche Toiletten der Stadt

Der Server holt einmal am Tag die öffentlichen Toiletten der Stadt Bielefeld aus dem Geodienst der Stadt (Open Data „Öffentliche Toiletten“, www.bielefeld01.de): Name, Adresse, Öffnungszeiten, barrierefrei ja oder nein, Entgelt. Sie gehen vor den Toiletten aus OpenStreetMap; eine OSM-Toilette bis 30 m daneben fällt weg. Sie erscheinen auf der Karte, am Ziel und in der Assistenz. Abschalten wie alle Stadtdaten mit `STADT_DATEN=0`. `/api/health` zeigt unter `toilettenStadt` Anzahl und Stand.

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

### Assistenz: freie Fragen (Stufe 3 der Sprachsteuerung)

Fragen, die kein fester Sprachbefehl sind („Wo ist die nächste rollstuhlgerechte Toilette?“, „Welche Haltestelle hier ist stufenlos?“), beantwortet Mistral aus den Flowtown-Daten. Getippt geht das auf der Seite „Wohin?“ unter „Frag Flowtown“. Mistral darf dafür sechs Werkzeuge nutzen: Orte in der Nähe (Toiletten, Behindertenparkplätze, Aufzüge, Park + Ride, Orte von Bethel), Haltestelle (Hochbahnsteig, Aufzug, Abfahrten laut Fahrplan), stufenlose Haltestellen in der Nähe, Weg zu einem Ziel (HERE), Verkehrslage, Hinweise der Redaktion und gemeldete Hindernisse. Antworten sind höchstens drei Sätze; Fakten nur aus den Werkzeugen.

Voraussetzung: `MISTRAL_API_KEY` in `/etc/flowtown.env` (wie für die KI-Einschätzung) und vor dem Pilot der Vertrag zur Auftragsverarbeitung mit Mistral, Training mit den Daten aus. Grenze je IP und Tag: `ASSIST_PER_DAY` (Standard 60). `/api/health` zeigt `assistenz: true`.

Testen auf dem Server: `cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs frage "Wo ist die nächste rollstuhlgerechte Toilette?" 52.0214 8.5339 Rollstuhl'` zeigt die Antwort und welche Werkzeuge benutzt wurden.

### Womit am besten? Vergleich und neue Werkzeuge der Assistenz

Ab App-Version 0.88 kann der Server mehr. Die App fragt `/api/health` und zeigt die passenden Beispielfragen und den Knopf „Womit heute am besten?“ erst, wenn der Server sie meldet (`werkzeuge`). Nach dem Aktualisieren (`git pull`, `systemctl restart flowtown`) ist alles sofort da; eine Einrichtung ist nicht nötig.

- `GET /api/vergleich?from=…&to=…&profil=rollstuhl`: vergleicht Auto (mit etwa 5 Minuten fürs Parken), Bus und Bahn, Rad und zu Fuß und gibt eine Empfehlung mit Grund. Empfohlen wird das umweltfreundlichste Verkehrsmittel, das höchstens ein Viertel der schnellsten Reisezeit später ankommt (mindestens 5, höchstens 15 Minuten); mit `vorrang=schnell` zählt nur die Ankunft. Jede Möglichkeit hat eine grobe CO₂-Schätzung (Auto 160 g, Bus 80 g, Stadtbahn 60 g je Personenkilometer, nach Durchschnittswerten des Umweltbundesamts). Mit Profil zählt, was dafür wichtig ist: Hochbahnsteige, Stufen und Kopfsteinpflaster auf dem Fußweg, Behindertenparkplatz am Ziel. Nur auf Knopfdruck; zählt wie eine Ziel-Prüfung (`ZIEL_PER_DAY`) und braucht vier HERE-Abfragen (Auto, Rad, Fuß, Bus und Bahn) plus Ortsnamen für Meldungen.
- Werkzeuge der Assistenz:
  - `vergleich`: dasselbe für Fragen wie „Womit komme ich am besten zur Arbeit?“.
  - `weg_check`: Hindernisse auf dem Fußweg zu einem Ziel (Stufen, Belag, Steigung, hohe Bordsteine, Gleise, Ampeln mit und ohne Tonsignal), Baustellen und gemeldete Hindernisse. Nutzt die Kacheln des Weg-Checks (`fussnetz`); fehlt eine, holt der Server sie und antwortet nach höchstens 6 Sekunden mit dem, was da ist.
  - `oepnv_stoerungen`: Umleitungen von moBiel und in der App gemeldete defekte Aufzüge.
  - `ampeln_mit_ton`: Ampeln in der Nähe mit Tonsignal laut OpenStreetMap und den Rückmeldungen nach Fahrten.
  - `abfahrten_in_der_naehe`: die nächsten Abfahrten laut Fahrplan an den nächsten Haltestellen, ohne dass jemand eine Haltestelle nennen muss.
  - `ort_info`: was an einem Ort zählt, an dem die Person sein will: Barrierefreiheit des Gebäudes (Bethel), nächstes rollstuhlgerechtes WC, Toilette, Behindertenparkplatz, Stadtbahn mit Hochbahnsteig, gemeldete Hindernisse. Dieselben Angaben stehen als `am_ziel` auch in `vergleich` und `weg_check`.
- `meine_auswertung` enthält jetzt auch den Vergleich der eigenen Fahrten nach Verkehrsmittel und die eigenen Ampel-Bewertungen (etwa „Grün zu kurz“).

### Rangfolge nach Profil und Gehtempo

- **Rollstuhl und Rollator:** `vergleich` (Assistenz und „Womit heute am besten?“ in der App) ordnet zu Fuß vor Bus und Bahn vor Auto, mit größerem Spielraum als ohne Profil (ein Drittel der schnellsten Zeit, 10 bis 20 Minuten statt 5 bis 15). Sagt die Person „mit dem Rollator“, „mit dem Rollstuhl“ oder „zu Fuß“, geht ein geeigneter Fußweg (ohne Stufen, höchstens 40 Minuten) vor. Das Auto bleibt möglich, wenn es deutlich schneller ist, etwa bei Fernreisen.
- **Gehtempo:** Für Rollator und Rollstuhl rechnet der Server die Gehzeit nach einer Annahme: Rollator 2,5 km/h, Rollstuhl 3,5 km/h (HERE rechnet mit Fußgängern ohne Hilfsmittel). Die Antwort sagt „geschätzt“. Einstellbar mit `GEHTEMPO_ROLLATOR_KMH` und `GEHTEMPO_ROLLSTUHL_KMH` in `/etc/flowtown.env`. Die Werte sind Annahmen und sollten im Pilot mit echten Wegen geprüft werden.
- **Genauer Standort:** Die Werkzeuge `weg` und `vergleich` nutzen jetzt den genauen Standort (etwa 1 m) statt 100 m.

### Festantworten und Direktantworten (ohne KI)

Fragen, bei denen die Antwort sicher und immer gleich sein muss, beantwortet der Server selbst, ohne Mistral. Das Regelwerk steht in `ASSISTENZ-REGELN.md`.

- **Festantworten:** `server/festantworten.csv` (Spalten ID, Thema, Muster, Ausnahme, Profil, Antwort, Quelle, Stand, Katalog, Status). Das Muster ist ein regulärer Ausdruck auf die Frage in Kleinbuchstaben. Die erste Zeile mit Status `freigegeben`, deren Muster trifft und deren Ausnahme nicht trifft, gewinnt. Der Server liest die Datei bei Änderung nach spätestens einer Minute neu. Eine andere Datei: `FESTANTWORTEN_CSV="/pfad/datei.csv"` in `/etc/flowtown.env`. Festantworten brauchen keinen Mistral-Schlüssel.
- **Direktantworten** (im Code): „Wo bin ich?“, „Wie heißt die Straße?“, „Ich suche Hausnummer 14“ (Adresse von HERE, `HERE_KEY` nötig); Fragen zu Aufzügen an Stadtbahn und Hauptbahnhof (kein Live-Status von moBiel, gemeldete Ausfälle aus Flowtown, Status der DB); „Liste der stufenlosen Haltestellen“.
- **Standort:** Die App schickt für Fragen den genauen Standort (auf etwa 1 m). Er geht nur an HERE und die eigenen Werkzeuge, nie an Mistral. Adressen aus „Wo bin ich?“ entfernt der Server aus dem Gesprächsverlauf, bevor er ihn an Mistral weitergibt.
- **Prüfen ohne Mistral:** `node flowtown-server.mjs festantworten pruefkatalog.csv` zeigt je Frage die passende Festantwort und am Ende die Abdeckung. Eine eigene Liste mit Fragen, die keine Festantwort bekommen dürfen, prüft man mit derselben CSV-Form (Spalten `Nr;Frage;Profil`).

### Teststrecke: Antworten der Assistenz prüfen und korrigieren

Die Assistenz lernt aus geprüften Beispielen: Zu jeder neuen Frage bekommt Mistral die bis zu drei ähnlichsten korrigierten Antworten als Vorbild für Aufbau, Ton und Länge. Die Fakten kommen weiter nur aus den Werkzeugen.

1. **Testlauf** auf dem Server (stellt alle Fragen aus `server/testfragen.csv` an die echte Assistenz, etwa zwei Minuten; zählt wie 36 Fragen bei Mistral und HERE):
   ```bash
   cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs testlauf'
   ```
   Ergebnis: `/var/lib/flowtown/testlauf/testlauf-<Datum>.csv` mit Frage, Profil, Antwort, benutzten Werkzeugen und leeren Spalten zum Ausfüllen. Eigene Fragen: eine eigene CSV mit denselben Spalten (`Nr;Thema;Profil;Frage;Breite;Länge`) als zusätzlichen Pfad angeben. Den großen Prüfkatalog (`pruefkatalog.csv`, 328 Einträge, siehe `PRUEFKATALOG.md`) startet man so: `node flowtown-server.mjs testlauf pruefkatalog.csv`; dessen Spalten „Gruppe“ und „Erwartung“ stehen dann in der Ergebnistabelle.
2. **Korrigieren** in Google Tabellen oder Excel (Datei importieren, Trennzeichen Semikolon):
   - Spalte **Bewertung**: `gut`, `teils` oder `falsch`.
   - Spalte **Korrigierte Antwort**: so, wie Flowtown hätte antworten sollen (höchstens drei Sätze, gut zum Vorlesen). Leer lassen, wenn die Antwort gut war.
   - Spalte **Notiz**: für dich, wird nicht genutzt.
   Als Beispiel zählt jede Zeile mit korrigierter Antwort und jede mit Bewertung `gut`. Zeilen mit `falsch` ohne Korrektur werden übersprungen. Mehrere Testläufe dürfen untereinander in derselben Tabelle stehen.
3. **Bereitstellen**, wie die Redaktionstabelle: in Google Tabellen *Datei > Freigeben > Im Web veröffentlichen*, nur dieses Blatt, Format CSV, und den Link in `/etc/flowtown.env` eintragen:
   ```
   BEISPIELE_CSV_URL="https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&single=true&output=csv"
   ```
   Oder die Datei als `/var/lib/flowtown/beispiele.csv` ablegen. Der Server liest sie beim Start und danach stündlich; sofort prüfen mit `node flowtown-server.mjs beispiele`. `/api/health` zeigt die Zahl unter `beispiele`.
4. **Wirkung prüfen:** einen neuen Testlauf machen und die Antworten vergleichen; die Spalte „Beispiele genutzt“ zeigt, wie viele Vorbilder je Frage dabei waren.

### Gemeldete Hindernisse prüfen

`node flowtown-server.mjs hinweise` listet alle Meldungen mit Kennung, Art, Stelle, Datum, Bestätigungen und einem Kartenlink. `node flowtown-server.mjs hinweis <Kennung> geprueft` markiert eine Meldung als von der Redaktion geprüft (Häkchen in der App, bleibt fünf Jahre, verschwindet erst nach drei „Ist weg“), `… hinweis <Kennung> weg` löscht sie. Danach `sudo chown -R flowtown: /var/lib/flowtown && sudo systemctl restart flowtown`.

### Datenqualität: Lückenzähler und Rückmeldungen

Ab App 0.101.0 gibt es zwei Auswertungen, beide ohne Namen, ohne Standort und ohne IP-Adresse. Konzept: `FAKTEN.md`.

Der **Lückenzähler** zählt je Monat, Thema, bekanntem Ort (Haltestelle oder Gebäude von Bethel) und Profilart, wie oft eine Antwort fehlte („keine Angabe“, „weiß ich nicht“). Die Frage selbst wird nicht gespeichert. Anzeigen, oben steht, was zuerst erfasst werden sollte:

```bash
cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs luecken'
```

Nur ein Monat: `… luecken 2026-11`. Datei: `/var/lib/flowtown/qualitaet/luecken.json`.

**Rückmeldungen:** Unter jeder Antwort kann man „Stimmt“, „Stimmt nicht“ oder „Veraltet“ antippen. Bei „Stimmt“ gehen nur Thema und Profilart an den Server, bei den beiden anderen auch Frage und Antwort (die Person hat das ausdrücklich gewählt). Antworten auf „Wo bin ich?“ werden nie übermittelt. Anzeigen:

```bash
cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs rueckmeldungen'
```

Datei: `/var/lib/flowtown/qualitaet/rueckmeldungen.jsonl`. Wer nicht möchte, dass Frage und Antwort gespeichert werden, löscht die Zeilen mit `art` gleich `falsch` oder `veraltet` nach der Prüfung.

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

**Angaben am Ziel außerhalb von Bielefeld:** Für Orte außerhalb von Bielefeld (etwa Paderborn) holt der Server Toiletten, Behindertenparkplätze und Ampeln mit Tonsignal aus OpenStreetMap (Overpass), in festen Rechtecken von 0,01° (etwa 1,1 × 0,7 km, mit Rand), nie mit dem genauen Ziel; die Auswahl nach Entfernung passiert auf dem Server. Die Ergebnisse stehen drei Tage im Speicher. Die Assistenz sagt dazu offen, dass die Angaben nur so vollständig sind wie die Einträge in OpenStreetMap. Auch der Eingang des Ziels (für Wege zu Fuß) kommt jetzt überall aus OpenStreetMap. `LAGE_ROADS` enthält jetzt auch die A44.
