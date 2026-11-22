# Erfassung und Ausgabe: eine Lösung

Stand 22.11.2026. Vorschlag zur Entscheidung. Ersetzt den Foto-Weg aus `erfassung/SCHEMA-HALTESTELLE.md` und den Ablauf aus `PROTOTYP-BARRIEREN.md`. Baut auf `REDAKTION.md` (Redaktions-App und Checklisten) und `PROFIL-KONZEPT.md` (Lernen auf dem Handy) auf.

## Das Problem heute

Es laufen vier Wege nebeneinander:

1. Fotoserie nach Schema (25 bis 120 Fotos je Haltestelle), dann Erfassungsbogen als CSV von Hand.
2. Prototyp mit eingebetteten Daten, Bewertung per Python-Skript.
3. Bahnsteig-Steckbrief in der App mit Regeln je Profil, die ich von Hand geschrieben habe.
4. Redaktions-App mit Checklisten, Rollen, Freigabe und Frischeklassen (`redaktion/`, `server/checklisten.csv`). Die gibt es schon.

Damit entstehen zwei Systeme für dieselbe Aufgabe. Die Bewertung je Profil steht pro Haltestelle von Hand in `data/steckbrief.json`. Das ist der Grund, warum es sich aufwendig anfühlt. Die Lösung ist, auf einen Weg zu kommen.

## Der Vorschlag in vier Schichten

### 1. Erfassen: die Redaktions-App, nicht eine neue App

Die Redaktions-App ist die Erfassungsapp für Redaktion und Tester. Sie ist getrennt von der Nutzer-App, hat Einladungscodes und speichert offline. Dafür fehlt nur die Objektart „Bahnsteig / Haltestelle“ mit den 14 Merkmalen, die heute in `steckbrief.json` stehen.

Je Merkmal nur drei Schritte:

- Antwort antippen: ja, teilweise, nein oder weiß nicht. „Weiß nicht“ ist immer erlaubt.
- Maß nur, wenn es zählt (Einstiegshöhe, Spalt). Mit Zahl und Einheit.
- Foto **optional**, nur als Beleg, wenn die Antwort strittig ist. Fotos bleiben lokal, nie im Repo (`fotos/` ist ausgeschlossen).

Eine Haltestelle ist damit in einer knappen Erfassungsrunde machbar statt in einer Fotoserie. Die Zeit wird gemessen, bevor entschieden wird, ob es breiter ausgerollt wird.

Sonderfälle ohne eigenes Schema:

- **Sieker:** zwei Stadtbahn-Objekte (Ankunft, Abfahrt) und je Bussteig ein Objekt „Bushaltestelle“. Der Weg zwischen den Seiten ist ein Hinweis-Objekt.
- **Teutoburger Straße:** derselbe Katalog. Sie ist der Kontrollfall für „nicht barrierefrei“.
- **Jahnplatz und Hauptbahnhof:** später, wenn der Rest läuft.

### 2. Speichern: ein Datenmodell für jede Angabe

Jede Angabe bekommt dieselben Felder, egal woher sie kommt:

| Feld | Inhalt |
| --- | --- |
| Wert | ja, teilweise, nein, weiß nicht, oder Zahl mit Einheit |
| Herkunft | vor Ort geprüft, OSM, Bethel, Nutzerrückmeldung, Vorschlag |
| Stand | Datum der Prüfung |
| Frischeklasse | A bis D, wie in `checklisten.csv` |
| Erfasser | wer, für die Nachvollziehbarkeit |

Das Format entspricht dem, was `steckbrief.json` schon hat. Neu ist: „aktuell“ oder „dauerhaft“ wird **aus der Frischeklasse abgeleitet**, nicht von Hand gesetzt. Klasse A und B gelten als aktuell, C und D als dauerhaft.

Freigabe bleibt wie gehabt: Mitwirkende erfassen Entwürfe, die Redaktion gibt frei. Zurückziehen geht jederzeit.

### 3. Bewerten: eine feste Regeltabelle, keine Regeln von Hand

Die Bewertung je Profil kommt nicht mehr aus handgeschriebenen Sätzen pro Haltestelle. Sie kommt aus einer **einmaligen Tabelle Merkmal × Profil**, die im Code steht und getestet ist:

| Antwort | Bewertung |
| --- | --- |
| ja | passt |
| teilweise | eingeschränkt |
| nein | passt nicht |
| weiß nicht | unbekannt, nie „passt“ |

Welche Merkmale für welches Profil zählen, steht schon in der Spalte „Profile“ von `server/checklisten.csv`. Die Tabelle wird daraus abgeleitet. Die Begründung je Zeile ist ein fester Text je Merkmal, nicht je Haltestelle. Der Satz „Achtung: 1 Punkt passt nicht“ entsteht so automatisch.

### 4. Ausgeben: wenig zeigen, und die App lernt pro Person

**Ausgabe.** Ein Fazit je Profil, darunter die Angaben. Der Umfang bleibt wie jetzt: Standard „alle Hinweise“, auf Wunsch „nur Neues und aktuelle“. Das ist bereits umgesetzt.

**Lernen pro Person.** Das folgt `PROFIL-KONZEPT.md`, also lokal auf dem Handy, sicherbar, ohne stille Änderung:

- Die App merkt sich, welche Merkmale eine Person am häufigsten öffnet, und welche sie mit „Stimmt nicht“ markiert.
- Ab drei Besuchen schlägt sie vor: „Du schaust oft auf Einstieg und Anzeige. Zuerst zeigen?“ Die Person bestätigt oder lehnt ab.
- „Stimmt nicht“ geht als Rückmeldung an die Redaktion, wie bei den Wegen schon.
- Das Profil in den Einstellungen bleibt die Grundlage, die Gewohnheit verfeinert sie nur.

**Einspeisen in Flowtown.** Die Redaktions-Daten werden als `steckbrief.json` exportiert. Die Redaktions-App hat bisher nur einen CSV-Export (`REDAKTION.md`), der Export nach `steckbrief.json` muss also noch gebaut werden. Die Nutzer-App lädt nur diese Datei. Sie kennt keine Fotos und keine Erfassung.

## Entscheidungen, die du treffen musst

1. **Erfassung in der bestehenden Redaktions-App** (empfohlen), statt einer zweiten App. Die Liste der Rollen und der Zugang bleiben, nur die Objektart kommt dazu.
2. **Fotos nur optional** als Beleg (empfohlen). Die Pflicht-Fotoserie aus `SCHEMA-HALTESTELLE.md` wird überholt.
3. **Regeltabelle aus `checklisten.csv`** statt handgeschriebener Regeln je Haltestelle (empfohlen).
4. **Lernen über Vorschläge ab drei Besuchen**, nie still (empfohlen, wie bei den Wegen).
5. **Überholt:** `erfassung/SCHEMA-HALTESTELLE.md` und die Fotopflicht in `PROTOTYP-BARRIEREN.md`. Sie bleiben als Verweis, werden aber nicht mehr gepflegt.

## Pilot, in dieser Reihenfolge

1. Prießallee als Objekt in der Redaktions-App anlegen und die 14 Merkmale mit den Angaben aus `data/steckbrief.json` erfassen. Die Zeit messen.
2. Regeltabelle aus `checklisten.csv` ableiten, mit einem Test, der die Bewertung je Profil prüft.
3. Export nach `steckbrief.json` erzeugen und mit dem Stand der Probe vergleichen. Abweichungen sind Fehler in der Tabelle, nicht in den Haltestellen.
4. Erst danach das Lernen in der Nutzer-App bauen.
5. Sieker und Teutoburger Straße als Objekte nach demselben Muster, wenn die Prießallee passt.

## Was das nicht löst

- Die Zahlen für Zugang und Höhen sind vor Ort zu messen. Das kann keine Liste ersetzen.
- Ob ein Profil „passt“, bleibt eine Einschätzung auf Grundlage der Angaben. Der Test mit 3 bis 5 Personen aus der Zielgruppe steht noch aus.
- Für den Export braucht es eine Freigabe durch die Redaktion, bevor Daten in die Nutzer-App gelangen.
