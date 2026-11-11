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

## J. Telefon-Assistenz (Meilenstein für absolute Barrierefreiheit)
Konzept: Abschnitt „Telefon-Assistenz“ im Gesamtkonzept. Eine Rufnummer, unter der sehr alte Menschen ohne Smartphone mit Flowtown sprechen: Abfahrten, Aufzug, Weg beschreiben, Toiletten, Hilfe, Notfall.
- [x] J0 (0.98.0) Zwischenschritt ohne Rufnummer: Sprechen-Knopf unten rechts als Mikrofon oder Telefonhörer, großer Sprachmodus, Link `?sprechen=1` für den Startbildschirm und als Verknüpfung im Manifest
- [x] J0a (0.98.1 und 0.98.2) Sprachmodus wie ein Anruf (Zustand, Wellen, Gesprächszeit, roter Hörer) und geduldiges Zuhören: 4 Sekunden Pause nach dem letzten Wort, bis zu 30 Sekunden auf den Anfang, Anzeige des Verstandenen. Mit älteren Menschen prüfen, ob 4 Sekunden reichen
- [ ] J1 Rahmen klären: Anbieter und deutsche Rufnummer (0521) mit Auftragsverarbeitungsvertrag, Kosten je Minute, Tageslimit, wer die Nummer dauerhaft betreibt
- [ ] J2 Mistral Voxtral 3 prüfen: Telefonie über SIP, deutsche Stimme, Latenz im Telefonklang (Ankündigung vom Oktober 2026, Dokumentation lesen)
- [ ] J3 Prototyp: eine Nummer, nur Abfahrten und Aufzug, mit Server-Endpunkt, der die Frage als Text entgegennimmt (dieselben Werkzeuge wie die App)
- [ ] J4 Gesprächsregeln: langsam, höchstens zwei Sätze, Wiederholen, Taste 0 für Servicekontakte, Ziffern statt Sprache, Notfall sofort 112
- [ ] J5 Datenschutz: Hinweis am Anfang, keine Aufnahme, keine Speicherung der Nummer, Datenschutzseite ergänzen
- [ ] J6 Test mit älteren Menschen und Menschen mit Hörbehinderung (Telefonklang, Dialekt, Hörgerät), Messgrößen wie bei der Assistenz

## K. Prüfkatalog: Fragen und Erwartungen der Nutzenden
Katalog: `PRUEFKATALOG.md` und `server/pruefkatalog.csv` (334 Einträge in 26 Gruppen, 293 davon als Fragen an die Assistenz).
- [x] K0 (10.11.) Katalog angelegt, mit Erwartung, Prüfweg und Vermutung je Eintrag; `testlauf` reicht Gruppe und Erwartung in der Ergebnistabelle durch
- [x] K1 (10.11.) Erster Testlauf mit 287 Fragen, nach Konsolenausgabe bewertet: 163 erfüllt, 53 teils, 26 nicht erfüllt, 37 falsch, 8 nicht prüfbar (`PRUEFERGEBNIS-2026-11-10.md`)
- [x] K1a (10.11.) Server: Texte als Liste, unbekannte Werkzeugnamen, Wiederholungen, Telefonnummern, Aufzug-Hinweis, elf neue Regeln im Systemtext (noch nicht auf dem Server geprüft)
- [x] K1b (10.11.) Wiederholung der 63 Fehler: 16 falsch und 11 nicht erfüllt sind jetzt erfüllt, 3 bleiben falsch (K124, K284, K313), 8 nicht erfüllt
- [x] K1c (10.11.) Zweite Korrekturrunde im Code (Aufzug am Ort, Fährt-noch, Steigung, Anschluss, Verfolgung, Startbildschirm, Gruppen-Hinweis), noch nicht auf dem Server
- [x] K1d (10.11.) Gesamtlauf mit 287 Fragen: 190 erfüllt, 73 teils, 7 nicht erfüllt, 9 falsch, 8 nicht prüfbar; Rückschritte bei K018, K032, K046, K102, K116, K117, K157, K173, K210, K292 u. a.
- [x] K1e (10.11.) Dritte Korrekturrunde im Code (Haltestelle der richtigen Stadt, leere Aufzugsmeldungen, sieben neue Regeln, Fehler 400)
- [x] K1f (10.11.) Zweiter Gesamtlauf: 199 erfüllt, 65 teils, 8 nicht erfüllt, 7 falsch, 8 nicht prüfbar; 24 besser, 16 schlechter, 247 gleich
- [x] K1g (10.11.) Vierte Korrekturrunde im Code: „Hauptbahnhof“ = Hbf der eigenen Stadt (K046), Zeit-Hinweis an der Frage bei Uhrzeit, Wochentag, Feiertag, Regel „nichts gefunden“ statt „gibt es nicht"
- [ ] K1h Server aktualisieren, Gesamtlauf wiederholen; Ziel: höchstens 3 falsch. Wichtig: Läufe schwanken, wichtige Fälle (Jahnplatz-Aufzug, Notruf, Telefonnummern, Zeitfragen) mehrfach stellen und Prüfregeln im Server (E9)
- [ ] K2 App-Zeilen (Prüfweg App) am Handy durchgehen, Ergebnis in die Spalten Status und Ergebnis
- [ ] K3 Lücken auswerten: erst `falsch` (erfundene Auskünfte), dann `nicht erfüllt` nach Zahl der betroffenen Profile; daraus die nächsten Entwicklungsschritte
- [ ] K4 Beobachtungs-Zeilen mit echten Personen und Geräten (VoiceOver, TalkBack, Dialekt, Display aus)
- [ ] K5 Nach den ersten Pilot-Wochen echte Fragen aus der Nutzung (ohne personenbezogene Daten) in den Katalog aufnehmen
- [ ] K6 Entwicklungsliste aus dem ersten Testlauf: E1 Fahrplan mit Zeitpunkt, E2 Aufzugsstatus der Stadtbahn (moBiel), E3 Wetter, E4 Höhenprofil, E5 Testlauf mit Auswertung und Verlauf, E6 Standort als Straße (Datenschutz klären), E7 Sprachen prüfen, E8 fehlende Datenquellen (Bänke, Trinkwasser, Apotheken, Ärzte, Stellplätze, Ladeorte), E9 zweite Prüfung der Antworten, E10 Radweganteil für die Assistenz (K147)
- [x] K7 (10.11.) Regelwerk und Lösungsplan: `ASSISTENZ-REGELN.md` (drei Antwortwege, 16 Regeln, Quellenplan, Pflege der Tabelle)
- [x] K8 (10.11.) Festantworten: `server/festantworten.csv` mit 67 Zeilen, trifft 128 von 287 Katalogfragen, 0 Fehltreffer bei 28 Gegenfragen; Direktantworten für Standort (genau, Adresse von HERE), Aufzug (Stadtbahn, Hauptbahnhof), Haltestellenliste
- [x] K9 (10.11.) Genauer Standort für Fragen (App 0.100.0, Einwilligung wird neu abgefragt, Datenschutzerklärung angepasst, Adressen nie an Mistral)
- [x] K10 (10.11.) Gesamtlauf 3: 244 erfüllt, 30 teils, 2 nicht erfüllt, 3 falsch, 8 nicht prüfbar; 142 Fragen vom Server selbst beantwortet, davon 135 erfüllt
- [x] K10a (10.11.) Nachbesserung: FA91 (Lärm), FA92 (Sicherheit von Radwegen), Zeit-Hinweis nicht bei Öffnungszeiten, Regel „Standort nutzen, nie danach fragen“
- [x] K10b (10.11.) Gesamtlauf 4: 251 erfüllt, 24 teils, 2 nicht erfüllt, 2 falsch, 8 nicht prüfbar; 145 Fragen vom Server selbst beantwortet, davon 137 erfüllt
- [x] K10c (10.11.) Nachbesserung: FA93 (mehrere Einschränkungen), FA94 (Nachtverbindung), FA95 (Aufzug im Parkhaus)
- [x] K10d (10.11.) Gesamtlauf 5: 252 erfüllt, 25 teils, 0 nicht erfüllt, 2 falsch, 8 nicht prüfbar. Fehler 400 bei mehr als drei Werkzeugaufrufen gefunden und behoben (K118)
- [ ] K10e Server aktualisieren (Fix für den Fehler 400). Zeilen mit Fakten gegenlesen, danach mit den Werkzeugen (K11) und Quellen (K12) weitermachen.
- [ ] (alt) K10d Server aktualisieren, Gesamtlauf wiederholen. Zeilen mit Fakten (FA04, FA10, FA11, FA70 bis FA77) gegenlesen. Danach weiter mit den Werkzeugen (K11) und Quellen (K12) statt mit weiteren Texten
- [ ] K11 Neue Werkzeug-Aufgaben aus dem Lösungsplan: E11 Pünktlichkeit direkt, E12 rueckweg mit Richtung, E13 Gehtempo je Profil, E14 unbekannte Linie, E15 Rangfolge nach Profil in vergleich und weg (kein Auto vor Bahn bei Rollstuhl), E16 Mehrfachprofil in der App
- [ ] K12 Quellen einbinden (Reihenfolge nach Nutzen): E2 moBiel-Aufzugsstatus, E1 Fahrplan mit Zeitpunkt, E10 Radweganteil, E8 Orte aus OpenStreetMap (Bänke, Trinkwasser, Apotheken, Ärzte, Geldautomaten, Ladesäulen, Fahrradständer), E3 Wetter, E4 Höhenprofil
- [x] K13 (10.11.) E15 und E13 gebaut: Rangfolge nach Profil in `vergleich` (Rollstuhl, Rollator: zu Fuß vor Bahn vor Auto, größerer Spielraum, „mit dem Rollator“ heißt Fußweg), Gehtempo je Profil (Rollator 2,5 km/h, Rollstuhl 3,5 km/h, Annahme), genauer Standort in `weg` und `vergleich`, Regel für Dauerfragen mit Umstiegen. Mit Testwerten geprüft, noch nicht im Lauf (betrifft auch „Womit heute am besten?“ in der App)
- [x] K13b (11.11.) Gesamtlauf 6 mit E15 und E13: 256 erfüllt, 22 teils, 0 nicht erfüllt, 1 falsch, 8 nicht prüfbar; K061, K070, K116 behoben
- [x] K13c (11.11.) Hinweis „stufenlos nur mit Beleg“ im Werkzeug und im Systemtext (K271)
- [ ] K13a Gehtempo im Pilot mit echten Wegen prüfen und die Annahmen anpassen

## L. Leitidee und offene Fragen aus Sicht der Nutzenden (11.11.)
- [x] L1 Leitidee **„Barriere-Atlas von unten“** ins Konzept (deutsch und englisch): Bielefelds Barrieren als Bild, das aus den Wegen, Meldungen und Messwerten der Nutzenden wächst; jeder Eintrag mit Quelle, Datum und Zahl der Bestätigungen; „weiß ich nicht“ ist ein gültiger Zustand; keine Zusage und kein amtliches Zertifikat. Erledigt (11.11.) in „Flowtown Concept (English)“ (Abschnitt „The barrier atlas from below“) und im deutschen „Flowtown Gesamtkonzept“ (Abschnitt „Der Barriere-Atlas von unten“).
- [x] L2 Offene Fragen ins Konzept (englisch und deutsch erledigt, 11.11.): E2 Aufzugsstatus moBiel; Umsteigezeit im eigenen Tempo; Rollstuhlplatz und Rampe im Fahrzeug; Knopf „Ich komme nicht weiter“; Blind, gehörlos, schwerhörig getrennt und einfache Sprache; Morgenwarnung als Web-App (iPhone); Pflege und Verfall der Atlas-Einträge.
- [x] L3 (11.11.) Neue Testfragen als Gruppe 26 im Prüfkatalog (K329 bis K334, noch nicht gelaufen; Lauf: `testlauf pruefkatalog.csv K329,K330,K331,K332,K333,K334`): Umsteigezeit im eigenen Tempo, Rampe im nächsten Bus, nächste Notrufsäule, Antwort ohne Ton, einfache Sprache, „Wer kann mir jetzt helfen?“
- [x] L3a (11.11.) Gruppe 26 gelaufen: 2 erfüllt, 4 teils (K329, K332, K333, K334). Vorschläge in `PRUEFERGEBNIS-2026-11-10.md`, „Neunter Lauf“.
- [x] L3b (11.11.) Umgesetzt (App 0.100.2, Server): FA96/FA97 „Hilfe jetzt“ (Gefahr zuerst, Be My Eyes nur beim Sehprofil, Gegenfragen ohne Fehltreffer); „ohne Ton“ und „einfache Sprache“ als Einstellungen in der App (sofort bestätigt, ohne KI; „einfache Sprache“ nach einer Antwort schreibt diese um); Server kennt `kontext.einfach` und die Regel für Wünsche ohne Frage.
- [x] L3c (11.11.) Server aktualisiert, Gruppe 26 noch einmal gelaufen: 5 erfüllt, 1 teils. Offen: K329 (Gehtempo bei Abfahrten und Umstiegen) ist noch offen.
- [ ] L4 Morgenwarnung für feste Wege (Konzept für Mobil), danach „Ich komme nicht weiter“ und Umsteigezeit nach Tempo

## M. Datenqualität und Redaktion (Entscheidungen 11.11.: Pilotgebiet Altstadt, Hauptbahnhof, Bethel, Uni; zunächst ein Redakteur; eigene PWA; kein OSM-Rückfluss)
Konzept: `FAKTEN.md` und der Abschnitt „Datenqualität und Redaktion“ im Gesamtkonzept (deutsch und englisch).
- [x] M1a (0.101.0) Lückenzähler im Server (`luecken`), ohne Fragen und Personen
- [x] M1b (0.101.0) „Stimmt / Stimmt nicht / Veraltet“ unter Antworten, Server `rueckmeldungen`, Datenschutzerklärung ergänzt
- [x] M1c (0.101.0) Systemregel: Quelle und Stand nennen, wenn ein Werkzeug sie liefert
- [ ] M1d Server aktualisieren, nach einer Woche `luecken` und `rueckmeldungen` ansehen
- [ ] M1e Quelle und Stand in weitere Werkzeugergebnisse einbauen (Aufzüge, Haltestellen, Toiletten, Parkplätze)
- [ ] M2 Redaktions-App (eigene PWA `/redaktion`): Fakten-Speicher (JSON-Zeilen plus Schnappschuss), Rollen mit Einladungscodes, Erfassen vor Ort mit Checkliste, Prüfliste nach Frischeklasse, Änderungsprotokoll, Qualitätsbericht
- [ ] M2a Objektkatalog und Checklisten für das Pilotgebiet (Stadtbahn-Haltestellen mit Aufzug und Rampe, Eingänge öffentlicher Gebäude, WC, Ampeln und Querungen, Dauerhindernisse; 6 bis 10 Fragen je Objektart)
- [ ] M3 Automatische Quellen: OSM-Lückenbericht (Orte ohne `wheelchair`), Fahrplan-Felder für Rollstuhl-Einstieg prüfen (K330), DWD-Wetter (E3), Wheelmap-Lizenz und Reisen für Alle klären
- [ ] M3a Anfragen: moBiel (Aufzugsstatus E2, Fahrzeugdaten), Stadt Bielefeld (Haltestellenkataster, Bordsteinabsenkungen)
- [ ] M4 Lernen aus Fahrten: Gehtempo je Profil, Umwege und Abbrüche, nur anonym und ab Mindestzahl (K13a)
- [ ] M5 Bericht für Stadt und moBiel aus dem Qualitätsbericht
