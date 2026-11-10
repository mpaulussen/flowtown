# Flowtown – offene Punkte

Stand: 6. November 2026. Quellen: Studien (CHI '26, IJHCI 2026, Verde u. a. 2026, Bleau u. a. 2026), Norm ITU-T F.921 (08/2018), Testläufe der Assistenz.

## A. Server und Korrekturtabelle (Betrieb)
- [ ] Server aktualisieren: `cd /opt/flowtown && sudo git pull && sudo systemctl restart flowtown`
- [ ] Korrekturtabelle: Zeile 8 (Rathaus) Korrektur leeren und „gut“ setzen, übrige Zeilen prüfen
- [ ] Tabelle als CSV veröffentlichen, Link als `BEISPIELE_CSV_URL` in `/etc/flowtown.env`, Server neu starten
- [ ] Testlauf wiederholen: `sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs testlauf'`

## B. Navigation nach ITU-T F.921
Schnell machbar:
- [x] B1 (0.93.0) Hinweiston (zwei Töne) vor jeder Navigationsansage, drei aufsteigende Töne am Ziel
- [x] B2 (0.93.0) Taste „Wiederholen“ im Navigationsfeld und Sprachbefehl „Wiederholen“
- [x] B3 (0.93.0) Startansage sprechen („Die Strecke beginnt 30 Meter vor dir, auf 2 Uhr.“)
- [x] B4 (0.93.0) Zielansage mit Zugang aus „Bielefeld barrierefrei erleben“ („Der stufenlose Eingang ist der Seiteneingang.“)

Mittlerer Aufwand:
- [x] B5 (0.94.0) Treppe 6 m vorher ansagen: hoch oder runter, Stufenzahl unter 12, Handlauf (OSM `incline`, `step_count`, `handrail` im Fußnetz mitliefern)
- [x] B6 (0.94.0) Vorschau: Strecke vor dem Start vorlesen (Abbiegungen, Ampeln mit Ton, Treppen)
- [x] B7 (0.94.0) „Weiter geradeaus“ als Bestätigung, einstellbar (10 m, 25 m, 50 m, aus)
- [x] B8 (0.94.0) Barrierefreiester Weg: Route meidet Stufen bei Profil Rollstuhl oder Rollator, statt nur zu warnen

## C. KI-Assistenz und Daten
- [x] C1 (0.95.0: plan_b in den Werkzeugergebnissen) Plan B: bei Störung, defektem Aufzug oder Stufen immer eine Alternative nennen
- [x] C2 (0.95.0: Werkzeug rueckweg mit letzten Abfahrten heute) Rückweg mitdenken („Wann muss ich zurück, damit es noch stufenlos geht?“)
- [x] C3 (0.95.0: Werkzeug hilfe_menschen und Sprachbefehl) Hilfe durch Menschen: Servicekontakte und Videohilfe (etwa Be My Eyes) in unübersichtlichen Lagen
- [x] C4 (0.95.0: Weg zu Fuß endet am Eingang, stufenlos bei Rollstuhl und Rollator) Eingang statt Gebäudemitte für Ziele (OSM-Eingänge, Bethel)
- [x] C5 (0.95.0: angaben_fehlen je Profil) Lücken offen sagen („Zur Türbreite habe ich keine Angabe.“)
- [x] C6 (0.95.0: Regel „laut Karte, nie eine Zusage“; „Sicher ans Ziel“ heißt jetzt „Weg prüfen lassen“) Prüfen: Ampel-Angaben nur als Information, nie als Sicherheitszusage
- [x] C7 (0.92.3: Aufzüge und Rolltreppen an DB-Bahnhöfen mit Status über die Mobilithek, DB InfraGO OpenStation) Aufzugsstatus der DB für den Hauptbahnhof prüfen (offene Schnittstelle FaSta)
- [x] C8 (geprüft 9.11.: 19 Meldungen auf mobiel.de, alle Linien richtig gelesen; 32 Linien einschließlich Nachtlinien und Umland sind korrekt gezählt, kein Fehler) moBiel-Meldungen prüfen: Ist „39 Buslinien“ zu hoch gezählt?
- [x] C9 (0.95.0 für die Sprachausgabe: „1:26 min“ wird „1 Minute 26 Sekunden“; die Anzeige bleibt „1:26“, G2 offen) Zeitformat „1 min 26 s“ (Entscheidung offen)

## D. Texte in App, Flyer und Datenschutz
- [ ] D1 „Flowtown ergänzt Langstock und Blindenhund“ in Einstieg, Datenschutzseite und Flyer
- [ ] D2 Erklärung „Was Flowtown prüft“: Kriterien und Datenquellen
- [ ] D3 Ansprache für neue Ziele: „Neues Ziel? Frag vorher, was dich dort erwartet.“

## E. Mitgestaltung, Bekanntheit, Antrag
- [ ] E1 Betroffene und Reha-Lehrkräfte (Orientierung und Mobilität) bewerten die Korrekturtabelle mit; kurze Anleitung dazu
- [ ] E2 Test mit Betroffenen in der echten Umgebung planen und dokumentieren (F.921, alle Studien)
- [ ] E3 Testfragen und Bewertungen offen veröffentlichen
- [ ] E4 Absatz für Antrag und Flyer mit den geprüften Quellen, F.921 als „orientiert sich an“
- [ ] E5 CHI '26 im Volltext lesen, bevor sie zitiert wird; ASSETS 2020 nicht als aktuellen Stand zitieren

## F. Andere Städte (nach der Testfahrt Bielefeld – Mönchengladbach)
Erledigt in 0.91.0: kein Ampel-Nachladen über etwa 80 km/h, Fahrten haben im Speicher Vorrang, Ortssuche und Assistenz am Standort, Hinweis „keine Daten außerhalb von Bielefeld“.
- [x] F1 Testfahrt Bielefeld – Mönchengladbach (6.11.) ausgewertet: Aufzeichnung lückenlos bis auf 82 s, Ampeln in Bielefeld und Mönchengladbach erkannt, auf der Autobahn keine Ampelsuche. Stau A2 Bönen richtig vorhergesagt (aber +2 statt gut +5 min). Gefahren wurde über A2, Oberhausen, Moers, Krefeld statt A40 und A52: beide Staus umfahren, 22 km mehr.
- [x] F1a Ausweichroute bei Stau (0.92.0): bis zu drei Alternativen, Vorschlag, wenn eine kaum langsamer ist und den Stau umfährt; „Ausweichroute fahren“, Navigation bleibt beim Neuberechnen darauf
- [x] F1b Stau aus dem fließenden Verkehr (HERE, Geschwindigkeit je Abschnitt); Halte ohne Ampel in der Fahrt als „Stau oder Halt ohne Ampel“ mit Dauer
- [ ] F1c Nach weiteren Fahrten prüfen: Verzögerung im Stau eher unterschätzt; Grenzen für Stau und zäh anpassen
- [x] F2 (0.97.0) Toiletten, Behindertenparkplätze und Ampeln mit Tonsignal aus OpenStreetMap auch außerhalb von Bielefeld (am Ziel); Eingänge überall aus OpenStreetMap
- [x] F3 Fahrplan für Mönchengladbach aus dem DELFI-Datensatz (0.92.2): alle Busse und Bahnen dort, Züge mit Halten in der Region; App lädt den Fahrplan der Stadt, in der man ist; Assistenz nennt Abfahrten. Weitere Städte: Eintrag in STADT_FP (Server) und FP_STAEDTE (App)
- [ ] F4 Quellen je Stadt sammeln (Open Data der Stadt, Barrierefrei-Datenbanken wie Wheelmap)
- [x] F5 Öffentliche Toiletten der Stadt Bielefeld (48, davon 23 barrierefrei, mit Öffnungszeiten und Entgelt) in Karte, am Ziel und in der KI (0.92.1). Offen: Lizenz bei der Stadt klären (Open.NRW nennt „andere geschlossene Lizenz“)
- [ ] F6 Mobilithek: DB-Aufzüge (0.92.3) und DELFI-Echtzeit (0.92.4) laufen. Straßen.NRW (VIZ 1056533255515164672, Arbeitsstellen 1056533308808019968, Umleitungen 1056533361559556096) ist angebunden und wartet auf die Freigabe (HTTP 404). Nach der Freigabe prüfen mit `node flowtown-server.mjs mobilithek` und den Leser an die echten DATEX-II-Daten anpassen
- [ ] F7 Später, je Stadt auf Open.NRW: Behindertenparkplätze (Köln, Düsseldorf, Gelsenkirchen, Neuss, Bochum, Moers), barrierefreie Toiletten (Dortmund, Duisburg, Köln, Münster, Neuss), Ampeln mit Tonsignal (Köln), Aufzüge KVB (Köln), Baustellen (Köln, Dortmund, Duisburg, Münster, Aachen), Parkhaus-Belegung (Köln, Münster, Bonn), Bänke (Bochum, Soest, Neuss); landesweit Soll-Fahrplan NRW (GTFS, CC BY 4.0, Beta) und Leihroller und Leihräder (Dott, VOI, Bolt, Lime, nextbike)

## G. Entscheidungen
- [x] G1 (vorläufig: ohne Einstellung im Begleitmodus alle 25 m, sonst aus; wählbar aus, 10, 25, 50 m) Vorgabe für „Weiter geradeaus“: 10 m wie in der Norm oder 25 m?
- [ ] G2 Zeitformat „1 min 26 s“: ja oder nein?
- [ ] G3 Google-Sheets-Connector freischalten, damit die Tabelle direkt bearbeitet werden kann?

## H. Grundstruktur der App (Variante A)
- [x] H1 (0.96.0) Heute beginnt mit „Wohin?“: Suchfeld mit Mikrofon, gespeicherte Ziele als Chips, darunter Verkehrsmittel und Profil; „Ohne Ziel aufzeichnen“ bleibt als zweite Möglichkeit
- [x] H2 (0.96.0) Fester Mikrofonknopf auf allen Seiten öffnet Frag Flowtown mit Beispielfragen; die KI-Karte auf Heute entfällt
- [x] H3 (0.96.0) Abfahrten mit Echtzeit stehen auf Heute statt unter „Wohin?“
- [x] H4 (0.96.1) „Mehr“ in vier Bereiche geordnet (Für dich, Daten und Datenschutz, Mitmachen und Testen, Hilfe); Profil und „Ansagen und Sprache“ getrennt
- [ ] H5 Englisches Konzept auf den Stand 0.96 bringen
- [x] F8 (0.97.0) Paderborn: Fahrplan aus DELFI (Eintrag in STADT_FP und FP_STAEDTE), A44 in LAGE_ROADS. Gefunden wurde keine offene Datenquelle der Stadt mit Toiletten oder Behindertenparkplätzen; offen: opendata-paderborn.de prüfen, Echtzeit der PaderSprinter
