# Prototyp: Barriere-Profil für Haltestellen und Wege

Stand: 21.11.2026. Ziel: zeigen, wie Erfassung, Bewertung und Darstellung für verschiedene Behinderungs- und Mobilitätsbedürfnisse funktionieren, an einem konkreten Beispiel (Haltestelle Prießallee) und einer Strecke Altstadt–Hauptbahnhof. Das ist ein Vorzeige-Prototyp, kein Produkt.

## Der USP, den der Prototyp zeigen soll

1. **Bewertung je Profil:** Dieselbe Haltestelle wird für Rollstuhl, Blindheit, Sehbehinderung, Rollator, Kinderwagen und Hörbehinderung getrennt bewertet.
2. **Jeder Wert hat Herkunft und Stand:** manuell geprüft (wer, wann), aus OpenStreetMap (Stand), vorgeschlagen durch KI (ungeprüft), von der Stadt oder der DB.
3. **„Unbekannt“ ist ein gleichwertiger Zustand.** Fehlt eine Angabe, steht dort „unbekannt“ und nie „passt“.

## Drei Spuren

**A. Manuelle Erfassung**
- Erfassungsbogen mit festen Feldern (siehe unten), pro Haltestelle und Foto-Serie.
- Foto-Muster: Breitformat, Hüfthöhe, Foto alle 5 m, fortlaufende Nummer, Straße im Namen.
- Erfasser und Datum je Eintrag.

**B. Automatische Unterstützung**
- OpenStreetMap-Abfrage über den Server (Haltestellen, Eingänge, Aufzüge, Tags wie `wheelchair`, `tactile_paving`, `kerb`, `ramp`). Die Abfragen haben wir im Server schon für Haltestellen und Eingänge.
- Fahrplan-Daten: Hochbahnsteig-Liste, Abfahrten.
- Aufzugsmeldungen (Flowtown-Meldungen und DB-Status, wo vorhanden).
- KI-Vorschläge aus Fotos, zum Beispiel „Leitlinie vermutlich vorhanden“, immer als Vorschlag markiert und erst nach Bestätigung übernommen.

**C. Bewertung und Darstellung**
- Matrix: Merkmal × Profil → passt / eingeschränkt / passt nicht / unbekannt.
- Darstellung je Profil: Ampel, ein Satz Begründung, Herkunft und Stand.
- Sprachausgabe der Zusammenfassung, Textansicht daneben.

## Erfassungsfelder (Startset für eine Haltestelle)

| Feld | Werte |
|---|---|
| Zugang zur Haltestelle | stufenlos / Rampe / Stufen (Anzahl) / unbekannt |
| Hochbahnsteig | ja / nein / unbekannt |
| Aufzug | vorhanden ja/nein, Status, Meldung |
| Bodenindikatoren (Leitlinie) | vorhanden und unbeschädigt / vorhanden, beschädigt / fehlt / unbekannt |
| Querung mit Tonsignal | ja / nein / unbekannt |
| Bahnsteigkante (Noppen) | ja / nein / unbekannt |
| Beleuchtung | gut / mittel / schlecht / unbekannt |
| Sitzplatz | ja / nein / unbekannt |
| Information | Anzeige ja/nein, Durchsage ja/nein |

## Profile (Startset)

Rollstuhl, Rollator, blind, sehbehindert, Kinderwagen, gehunsicher oder älter, hörbehindert.

## Bewertungsregeln (Beispiele)

- Hochbahnsteig ja → Rollstuhl: passt; Rollator: passt; Kinderwagen: passt.
- Hochbahnsteig unbekannt → Rollstuhl: unbekannt (nie „passt“).
- Leitlinie vorhanden und unbeschädigt → blind: passt, nur mit Foto-Beleg oder manueller Prüfung.
- Leitlinie nur als KI-Vorschlag → blind: unbekannt, mit Hinweis „vorgeschlagen, nicht geprüft“.
- Aufzug mit gemeldeter Störung → Rollstuhl und Rollator: passt nicht, mit Meldung und Datum.

## Ablauf des Prototyps

1. **Prießallee manuell:** Foto-Serie nach Muster, Erfassungsbogen ausfüllen. Zeit messen.
2. **Prießallee automatisch:** OSM-Abfrage und Fahrplan-Abgleich für denselben Ort, ohne Fotos. Ergebnis mit dem Bogen vergleichen.
3. **KI-Vorschläge:** Fotos durch die Bildanalyse laufen lassen, Vorschläge markieren, Abweichungen zu deinem Bogen zählen.
4. **Bewertungsmatrix im Server:** Regeln oben als Code mit Tests.
5. **Klick-Prototyp:** eine Haltestelle, sechs Profile umschaltbar, Herkunft je Wert sichtbar, Sprachausgabe.
6. **Vorzeigen:** Prießallee vollständig, Jahnplatz oder Hauptbahnhof als zweites Beispiel, ein Abschnitt der Altstadt-Strecke.

## Was der Prototyp beweisen soll

- Wie viel Zeit eine Haltestelle manuell kostet.
- Wie viele Merkmale automatisch ausreichend gut sind, und wo nicht.
- Dass die Darstellung für verschiedene Profile verständlich ist (Test mit 3 bis 5 Personen aus der Zielgruppe).
- Dass „unbekannt“ und Herkunft klar sichtbar sind.

## Offene Entscheidungen (mit Vorschlag)

- Startprofile: Rollstuhl, Rollator, blind, sehbehindert, Kinderwagen. Hörbehinderung im zweiten Schritt.
- Strecke: Abschnitt Jahnplatz → Hauptbahnhof, zehn Fotos je 50 m.
- Technik für KI-Vorschläge: zunächst das Bildmodell, das wir schon kennen; das Video-Werkzeug ist für diesen Zweck nicht nötig.
