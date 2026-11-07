# Flowtown – offene Punkte

Stand: 6. November 2026. Quellen: Studien (CHI '26, IJHCI 2026, Verde u. a. 2026, Bleau u. a. 2026), Norm ITU-T F.921 (08/2018), Testläufe der Assistenz.

## A. Server und Korrekturtabelle (Betrieb)
- [ ] Server aktualisieren: `cd /opt/flowtown && sudo git pull && sudo systemctl restart flowtown`
- [ ] Korrekturtabelle: Zeile 8 (Rathaus) Korrektur leeren und „gut“ setzen, übrige Zeilen prüfen
- [ ] Tabelle als CSV veröffentlichen, Link als `BEISPIELE_CSV_URL` in `/etc/flowtown.env`, Server neu starten
- [ ] Testlauf wiederholen: `sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs testlauf'`

## B. Navigation nach ITU-T F.921
Schnell machbar:
- [ ] B1 Hinweiston (zwei Töne) vor jeder Navigationsansage, drei aufsteigende Töne am Ziel
- [ ] B2 Taste „Wiederholen“ im Navigationsfeld und Sprachbefehl „Wiederholen“
- [ ] B3 Startansage sprechen („Die Strecke beginnt 30 Meter vor dir, auf 2 Uhr.“)
- [ ] B4 Zielansage mit Zugang aus „Bielefeld barrierefrei erleben“ („Der stufenlose Eingang ist der Seiteneingang.“)

Mittlerer Aufwand:
- [ ] B5 Treppe 6 m vorher ansagen: hoch oder runter, Stufenzahl unter 12, Handlauf (OSM `incline`, `step_count`, `handrail` im Fußnetz mitliefern)
- [ ] B6 Vorschau: Strecke vor dem Start vorlesen (Abbiegungen, Ampeln mit Ton, Treppen)
- [ ] B7 „Weiter geradeaus“ als Bestätigung, einstellbar (10 m, 25 m, 50 m, aus)
- [ ] B8 Barrierefreiester Weg: Route meidet Stufen bei Profil Rollstuhl oder Rollator, statt nur zu warnen

## C. KI-Assistenz und Daten
- [ ] C1 Plan B: bei Störung, defektem Aufzug oder Stufen immer eine Alternative nennen
- [ ] C2 Rückweg mitdenken („Wann muss ich zurück, damit es noch stufenlos geht?“)
- [ ] C3 Hilfe durch Menschen: Servicekontakte und Videohilfe (etwa Be My Eyes) in unübersichtlichen Lagen
- [ ] C4 Eingang statt Gebäudemitte für Ziele (OSM-Eingänge, Bethel)
- [ ] C5 Lücken offen sagen („Zur Türbreite habe ich keine Angabe.“)
- [ ] C6 Prüfen: Ampel-Angaben nur als Information, nie als Sicherheitszusage
- [ ] C7 Aufzugsstatus der DB für den Hauptbahnhof prüfen (offene Schnittstelle FaSta)
- [ ] C8 moBiel-Meldungen prüfen: Ist „39 Buslinien“ zu hoch gezählt?
- [ ] C9 Zeitformat „1 min 26 s“ (Entscheidung offen)

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
- [ ] F2 Toiletten, Behindertenparkplätze und Ampeln mit Tonsignal aus OpenStreetMap auch außerhalb von Bielefeld (am Ziel)
- [ ] F3 Fahrplan für andere Verbünde (DELFI-Daten für ganz Deutschland, für Mönchengladbach VRR und NEW)
- [ ] F4 Quellen je Stadt sammeln (Open Data der Stadt, Barrierefrei-Datenbanken wie Wheelmap)
- [x] F5 Öffentliche Toiletten der Stadt Bielefeld (48, davon 23 barrierefrei, mit Öffnungszeiten und Entgelt) in Karte, am Ziel und in der KI (0.92.1). Offen: Lizenz bei der Stadt klären (Open.NRW nennt „andere geschlossene Lizenz“)
- [ ] F6 Mobilithek (Konto angelegt, Organisation wartet auf Bestätigung, Stand 7.11.). Danach: Maschinenzertifikat (.p12) nach /etc/flowtown/mobilithek.p12, Passwort als MOBILITHEK_CERT_PASS in /etc/flowtown.env; Abo-IDs an Claude. Abos ohne Freigabe zuerst: DB OpenStation SIRI FM (Aufzüge und Rolltreppen an DB-Bahnhöfen, CC0), DELFI-Realtime GTFS-RT Trip Updates (Echtzeit, CC BY-SA). Mit Freigabe durch Straßen.NRW: VIZ.NRW für Nordrhein-Westfalen – Gesamtdatensatz, LVZ.NRW Arbeitsstellen im nachgeordneten Netz NRW, LVZ.NRW Umleitungen von Arbeitsstellen NRW (alle Datenlizenz Deutschland – Zero, DATEX II, jede Minute). Abruf: https://mobilithek.info:8443/mobilithek/api/v1.0/subscription/<ID>/clientPullService?subscriptionID=<ID> mit Zertifikat
- [ ] F7 Später, je Stadt auf Open.NRW: Behindertenparkplätze (Köln, Düsseldorf, Gelsenkirchen, Neuss, Bochum, Moers), barrierefreie Toiletten (Dortmund, Duisburg, Köln, Münster, Neuss), Ampeln mit Tonsignal (Köln), Aufzüge KVB (Köln), Baustellen (Köln, Dortmund, Duisburg, Münster, Aachen), Parkhaus-Belegung (Köln, Münster, Bonn), Bänke (Bochum, Soest, Neuss); landesweit Soll-Fahrplan NRW (GTFS, CC BY 4.0, Beta) und Leihroller und Leihräder (Dott, VOI, Bolt, Lime, nextbike)

## G. Entscheidungen
- [ ] G1 Vorgabe für „Weiter geradeaus“: 10 m wie in der Norm oder 25 m?
- [ ] G2 Zeitformat „1 min 26 s“: ja oder nein?
- [ ] G3 Google-Sheets-Connector freischalten, damit die Tabelle direkt bearbeitet werden kann?
