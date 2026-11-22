# Erfassungsschema Haltestelle

Stand 22.11.2026. Gilt für jede Haltestelle gleich, damit die Ergebnisse vergleichbar bleiben. Fotos liegen lokal unter `fotos/<haltestelle>/`, nicht im Repository (siehe `.gitignore`).

## 1. Grundregeln fürs Fotografieren

- **Format:** Breitformat, Handy waagerecht, Original-Datei unverändert lassen.
- **Höhe:** Standardaufnahmen auf Hüfthöhe (etwa 1 m), leicht nach unten geneigt, damit Boden und Umfeld zu sehen sind.
- **Abstand:** Wege und Bahnsteige alle 5 m fotografieren, fortlaufend nummeriert.
- **Nahaufnahmen** (Leitstreifen, Taster, Kanten): aus etwa 50 cm, mit einem Gegenstand oder Maßband für den Maßstab.
- **Maße nur mit Maßband:** Bordsteinhöhe, Stufenhöhe, Breite. Maßband quer zur Kante halten, auf der Kante anlegen, Foto von oben.
- **Steigung:** Neigungs-App auf dem Handy, Screenshot des Wertes mitfotografieren.
- **Personen:** nicht gezielt fotografieren. Im Bild ist das nicht schlimm, wir schwärzen vor dem Speichern.
- **Uhrzeit:** Fotos bei Tageslicht. Beleuchtung zusätzlich am Abend fotografieren.

## 2. Dateinamen

`<haltestelle>_<YYYY-MM-DD>_<HHMM>_<nr>_<feld>.jpg`

Beispiel: `sieker_2026-11-23_1030_007_ankunft-einstieg.jpg`

Feld-Codes stehen unten. `nr` ist fortlaufend pro Haltestelle, nicht pro Feld.

## 3. Pflichtfelder pro Haltestelle

Jedes Feld braucht mindestens ein Foto. Wo nichts vorhanden ist, schreibst du das als Notiz („kein Taster“).

| Feld-Code | Was fotografieren | Zusatz |
|---|---|---|
| `uebersicht` | Gesamtansicht des Bahnsteigs in Richtung Fahrtrichtung, Haltestellenschild mit Namen | Fahrtrichtung notieren |
| `zugang` | Weg vom Gehweg bis zum Wartebereich, alle 5 m | Rampe, Treppe oder Aufzug erkennbar? |
| `einstieg` | Seitenaufnahme aus Hüfthöhe, Bahnsteigkante und Fahrzeug im Bild | Bahnsteighöhe mit Maßband, Abstand zum Wagen |
| `leitstreifen` | Nahaufnahme am Boden, Verlauf bis zum Wartebereich, Unterbrechungen | Ob Rillen oder Noppen |
| `querung` | Taster, Ampel, Aufmerksamkeitsfelder am Bordstein | Tonsignal ja oder nein, Taster mit Hand-Symbol oder ohne |
| `info` | Vitrine (Lesbarkeit aus 1 m), Anzeige, Haltestellenschild | Echtzeit-Anzeige mit oder ohne Sprachausgabe |
| `sitz` | Sitze, Wartehäuschen | Anzahl, Sitzhöhe mit Maßband |
| `hindernis` | Gullys, Rinnen, Pfosten, Abfallbehälter, Laub, Schienen | Schlitzbreite, Stufenkanten |
| `beleuchtung` | Mast und Leuchte, am Abend fotografieren | Helligkeit subjektiv notieren |
| `automat` (falls vorhanden) | Gesamtansicht, Display aus 1 m, Bedienfeld, Seite mit Kopfhörer-Anschluss | Höhe von Display und Tasten mit Maßband, Braille ja oder nein |

## 4. Sieker (Endhaltestelle, zwei Seiten und Busbahnhof)

Sieker hat drei Bereiche. Jeder Bereich bekommt eigene Nummern und den eigenen Feld-Code als Präfix.

- **`ankunft-`:** Stadtbahn-Haltestelle, an der die Bahn ankommt. Alle Pflichtfelder.
- **`abfahrt-`:** Stadtbahn-Haltestelle auf der gegenüberliegenden Seite, an der die Bahn wieder abfährt. Alle Pflichtfelder.
- **`bus-<bussteig-nr>`:** jeden Bussteig im Busbahnhof einzeln: Nummer am Schild, Bordsteinhöhe, Leitstreifen, Zugang. Pro Bussteig mindestens `uebersicht`, `einstieg` und `leitstreifen`.

Zusätzlich für Sieker:
- **Zugang zwischen den Seiten:** Fotos, wie man von der Ankunftsseite zur Abfahrtsseite kommt (Querung, Ampel, Umweg). Feld `wechsel`.
- **Fahrtrichtung** auf jedem `uebersicht`-Foto mitfotografieren.

## 5. Teutoburger Straße (nicht barrierefrei, Kontrollfall)

Die Liste sagt laut bisheriger Angabe: kein Hochbahnsteig, Einstieg über Stufen, mit Rollstuhl nicht möglich. Diese Haltestelle prüft, ob das Schema auch den Fall „nicht barrierefrei“ gut beschreibt.

Pflichtfelder wie oben, zusätzlich:
- `stufen`: jede Stufe fotografieren, Anzahl notieren, Stufenhöhe und Auftritt mit Maßband, Handlauf ja oder nein.
- `alternative`: Schild oder Plan mit der nächsten barrierefreien Möglichkeit (Haltestelle, Richtung), falls vorhanden.

## 6. Umfang und Zeit

Eine Seite ohne Automat und ohne Busbahnhof: etwa 25 bis 40 Fotos. Sieker mit zwei Stadtbahnseiten und Busbahnhof: voraussichtlich 80 bis 120 Fotos. Teutoburger Straße: etwa 25 Fotos.

Wir messen die Zeit pro Haltestelle und tragen sie hier ein, damit wir später hochrechnen können:
- Sieker: ______ min
- Teutoburger Straße: ______ min

## 7. Abgabe

Die Fotos ordnest du nach Haltestelle in `fotos/sieker/` und `fotos/teutoburger-strasse/`. Du kannst sie in den Chat schicken oder mir den Ordner für die Auswertung freigeben, wie besprochen. Jede Foto-Serie bekommt eine kurze Notiz mit Datum, Uhrzeit, Wetter und Auffälligkeiten.
