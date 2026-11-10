# Regeln der Assistenz: Wer antwortet, womit und wie sicher

Stand 10. November 2026. Grundlage sind 287 Testfragen aus `PRUEFKATALOG.md` und vier Testläufe (`PRUEFERGEBNIS-2026-11-10.md`). Die Läufe haben gezeigt: Was die KI nur nach einer Regel im Text tun soll, tut sie nicht jedes Mal. Deshalb gilt ab jetzt: **Alles, was sicher oder immer gleich sein muss, beantwortet der Server selbst, ohne KI.**

## 1. Die drei Antwortwege

Der Server prüft jede Frage in dieser Reihenfolge. Der erste passende Weg antwortet.

| Nr. | Weg | Wer antwortet | Wofür | Garantie |
| --- | --- | --- | --- | --- |
| 1 | **Festantwort** | Tabelle `server/festantworten.csv`, ohne KI | Notfall, Sicherheit, Preise, Regeln, Dinge, die die App nicht kann oder nicht weiß, Hilfe zur App, Fragen über Flowtown | Wortgleich, solange das Muster der Frage trifft |
| 2 | **Direktantwort** | Server setzt die Antwort aus Daten zusammen, ohne KI | Standort mit Adresse, Aufzug an Stadtbahn und Hauptbahnhof, Liste der Haltestellen mit Hochbahnsteig | Antwort kommt aus den Daten, nie erfunden |
| 3 | **KI mit Werkzeugen** | Mistral formuliert, was die Werkzeuge liefern | Wege, Vergleiche, Abfahrten, Orte, Barrierefreiheit von Gebäuden | Fakten nur aus den Werkzeugen; Rest nach den Regeln unten |

**Wo die Garantie endet:** Eine Festantwort greift nur, wenn das Muster die Frage trifft. Fragt jemand in ganz anderen Worten, geht die Frage an die KI. Deshalb gibt es zusätzlich Absicherungen im Server (Regel R9) und eine Abdeckungsmessung (Abschnitt 6).

## 2. Die Regeln

| Nr. | Regel | Wie sie durchgesetzt wird |
| --- | --- | --- |
| R1 | **Fakten nur aus einer Quelle:** Tabelle, Werkzeug oder Direktantwort. Fehlt die Quelle, sagt die Assistenz „Dazu habe ich keine Angabe“ und nennt, wo man nachfragen kann. | Festantworten FA40 bis FA56, Systemtext |
| R2 | **Telefonnummern nur aus der Festantwort-Tabelle,** mit Quelle und Stand. Die KI nennt nie eine Nummer. | `sauber()` streicht Sätze mit Nummern aus KI-Antworten (außer 110 und 112); Nummern stehen nur in FA04, FA10 |
| R3 | **Keine erfundenen Funktionen oder Menüpunkte.** Es gibt: die Reiter Heute, Tipps, Verlauf, Karte, Mehr, das Suchfeld „Wohin?“, das rote Plus, auf der Karte „Hindernis melden“, unter Mehr die Einstellungen. | Festantworten FA60 bis FA66; Systemtext mit der Liste der Stellen |
| R4 | **Zeit:** Die Werkzeuge kennen nur „jetzt“. Bei einer Uhrzeit, einem Wochentag, „morgen“ oder einem Feiertag sagt die Assistenz das offen und nennt keine Abfahrts- oder Losgehzeit. | FA41; zusätzlich ein Hinweis an der Frage für die KI |
| R5 | **Notfall, Verletzung, Krise, Bedrohung:** feste Antwort mit 112, 110 oder Telefonseelsorge, nie von der KI. Für gehörlose Menschen nora und Tess, nie „ruf an“. | FA01 bis FA06 |
| R6 | **Aufzüge:** Für die Stadtbahn gibt es keinen Live-Status. Die Assistenz sagt nie „laut moBiel in Betrieb“. Sie nennt, ob laut Fahrplan ein Aufzug da ist, ob in Flowtown ein Ausfall gemeldet ist, und „bitte vor Ort prüfen“. Für DB-Bahnhöfe nennt sie den Status der DB. | Direktantwort Aufzug; Orte, die sie nicht findet, heißen „den Ort finde ich nicht“ |
| R7 | **Standort:** Der genaue Standort geht nur an den Flowtown-Server und an HERE, nie an Mistral. Die Adresse setzt der Server selbst zusammen. | Direktantwort Standort; Adressen werden aus dem Gesprächsverlauf an Mistral gestrichen; Datenschutzerklärung und Einwilligung angepasst |
| R8 | **Nie „es gibt keine X“,** wenn die Daten nur nichts liefern. Stattdessen „dazu habe ich nichts gefunden“. Ein Ort bekommt nur den Typ, der zu seinem Namen passt. | Systemtext; Festantwort FA53 für Hotels und Restaurants |
| R9 | **Absicherung gegen Ausrutscher der KI:** keine wiederholten Sätze, höchstens fünf Sätze, kein Markdown, keine Telefonnummern, keine unbekannten Werkzeugnamen. Antwortet Mistral mit Fehler 400, antwortet der Server einmal ohne Werkzeuge. | `sauber()`, Prüfung der Werkzeugnamen im Server |
| R10 | **Rückfragen nur, wenn das Ziel wirklich fehlt.** Bei allgemeinen Fragen („Gibt es Gebärdensprache?“) antwortet sie oder sagt „keine Angabe“. | FA28, FA81, Systemtext |
| R11 | **Ton:** Bei Angst oder Unruhe zuerst ein ruhiger Satz. Keine kühle Absage („Dazu kann ich nichts sagen“), sondern was die Person stattdessen tun kann. | FA13, FA82, FA87; Systemtext |
| R12 | **Profil:** Rollstuhl und Rollator: stufenlose Bahn vor Auto, nie Treppen oder Rolltreppe empfehlen. Hören: nie zum Anrufen raten. Sehen: Orientierung und Ampeln mit Ton. Gruppen ab fünf Personen: kein Auto. | FA03, FA86; Gruppen-Hinweis im Server; Rangfolge im Werkzeug `vergleich` (E15) |
| R13 | **Länge:** Antworten für die Sprachausgabe haben höchstens drei Sätze, Festantworten höchstens vier, ohne Tabellen und Sonderzeichen. | `sauber()`; Festantworten werden so geschrieben |
| R14 | **Sprache:** Die Antwort kommt in der Sprache der Frage; Orts- und Liniennamen bleiben unverändert. | Systemtext |
| R15 | **Pflege der Festantworten:** Jede Zeile nennt Quelle und Stand. Zeilen mit Fakten (Nummern, Regeln, Zuständigkeiten) gehen erst nach Prüfung auf Status `freigegeben`. | Spalten Quelle, Stand, Status in `festantworten.csv` |
| R16 | **Jede Änderung wird geprüft:** erst `festantworten`-Test (Abdeckung, falsche Treffer), dann Gesamtlauf. | Abschnitt 6 |

## 3. Lösungsplan für alles, was nicht oder falsch beantwortet wurde

Spalte „Sicherheit“: **fest** = der Server antwortet ohne KI, das Ergebnis ist bei jeder Frage dieser Art gleich. **Daten** = hängt an einer neuen Quelle. **Werkzeug** = der Server muss mehr berechnen, bis dahin bleibt die KI verantwortlich.

| Problem | Beispiele | Lösung | Sicherheit | Stand |
| --- | --- | --- | --- | --- |
| Preise, Tickets, Tarife, Regeln für Hund, Fahrrad, Scooter | K018 K019 K020 K128 K129 K058 K132 K133 | Festantworten FA40, FA12 mit Verweis auf moBiel | fest | gebaut |
| Ausweis, Wertmarke, Begleitperson, Mobilitätsservice, Fundsachen | K130 K131 K120 K121 K211 K134 | Festantworten FA10, FA11, FA14 aus „Bahnreisen mit Behinderung“ in der App | fest | gebaut |
| Aufzug an Stadtbahn und Hauptbahnhof (Fall Jahnplatz) | K046 K047 K064 K117 K284 K311 | Direktantwort, dazu Datenstrom von moBiel (E2) | fest, mit E2 live | Direktantwort gebaut, E2 offen |
| Zeitfragen (Uhrzeit, Tag, Feiertag) | K021 K022 K033 K034 K197 K204 | Festantwort FA41; später Fahrplan mit Zeitpunkt (E1) | fest | FA41 gebaut, E1 offen |
| Notfall, Verfolgung, Krise, Notruf ohne Hören | K208 K213 K216 K278 K090 | Festantworten FA01 bis FA06 | fest | gebaut |
| Falsche Menüpunkte, Hilfe zur App | K186 K187 K192 K193 K210 K221 K225 K241 | Festantworten FA60 bis FA66 | fest | gebaut |
| Fragen über Flowtown (Wer, Kosten, Quellen, Aktualität, Datenschutz) | K319 bis K328 | Festantworten FA70 bis FA77 | fest | gebaut |
| Standort und Adresse | K001 K004 K009 | Genauer Standort, Direktantwort mit Adresse von HERE | fest | gebaut |
| Dinge, die die App nicht kann (Taxi, Buchen, Erinnerung, Anrufen) | K292 bis K306 | Festantworten FA20 bis FA27 | fest | gebaut |
| Daten, die es nicht gibt (Wetter, Auslastung, Grünphase, Steigung, Bänke, Trinkwasser, Laden, Stellplätze, Parkregeln) | K067 K068 K105 K112 K043 K059 K158 K053 K137 K139 | Ehrliche Festantworten FA42 bis FA51; Quellen siehe Abschnitt 4 | fest | gebaut; Daten E3, E4, E8 offen |
| Orte, die die Suche je Lauf anders liefert (Apotheke, Arzt, Supermarkt, Werkstatt) | K150 K159 K160 K164 | Orte aus OpenStreetMap fest im Server speichern, statt HERE-Freitext je Frage (E8) | Daten | offen |
| Hinweise, die bei jedem Lauf wechseln (Eingang, Rückweg, Pünktlichkeit, unbekannte Linie) | K116 K135 K032 K144 | Direktantworten oder Werkzeug-Änderungen (E11, E12, E14) | Werkzeug | offen |
| Rollstuhl: Auto vor Bahn, Rollator: Auto | K266 K271 K070 K127 K110 | Rangfolge nach Profil im Werkzeug `vergleich` (E15) | Werkzeug | offen |
| Gehtempo mit Rollator, Radwege, Radweganteil | K061 K146 K147 | Gehtempo je Profil (E13), Radverkehrsnetz der Stadt, das der Server schon lädt (E10); bis dahin FA55 | Daten | offen |
| Mehrere Behinderungen gleichzeitig | K317 | Mehrfachprofil in der App (E16) | Werkzeug | offen |
| Antworten, die ohne Verlauf nicht prüfbar sind | K096 K196 und die 8 „nicht prüfbar“ | Testlauf mit Verlauf, Auswertung und gespeichertem Ziel (E5) | Test | offen |

## 4. Quellen, die wir zusätzlich einbinden sollten

Alle Vorschläge sind noch nicht geprüft (Lizenz, Aktualität, Aufwand). Bei jedem gilt: Die Antwort sagt „laut <Quelle>, Stand <Datum>“.

| Bedarf | Quelle | Art | Bemerkung |
| --- | --- | --- | --- |
| Aufzugsstatus der Stadtbahn | moBiel | Datenstrom oder Abruf | Fallbeispiel Jahnplatz; ohne diese Quelle bleibt „kein Live-Status“ |
| Fahrplan mit Zeitpunkt (morgen, Sonntag, Feiertag, „um 8 Uhr da sein“) | DELFI-Fahrplan (liegt schon vor) | Server fragt mit Datum und Uhrzeit | E1, keine neue Quelle nötig |
| Radwege und Radweganteil | Radverkehrsnetz der Stadt Bielefeld (liegt schon vor) | Anteil der Route berechnen | E10, keine neue Quelle nötig |
| Bänke, Trinkwasser, Apotheken, Ärzte, Geldautomaten, Ladesäulen, Fahrradständer, Wickeltische | OpenStreetMap | Abfrage in festen Rechtecken wie bei den Barrierefrei-Daten, Ergebnis im Server gespeichert | E8; lückenhaft, deshalb „laut OpenStreetMap“ |
| Ladesäulen vollständiger | Ladesäulenregister der Bundesnetzagentur | wöchentlicher Abzug | Lizenz und Format prüfen |
| Wetter, Glätte-Warnungen | Deutscher Wetterdienst, Open Data | Abruf je Stadt | E3; nur Warnungen und Vorhersage, nicht den Zustand eines Gehwegs |
| Steigung und Gefälle | Höhenmodell des Landes NRW (Open Data) | Höhenprofil entlang des Weges | E4 |
| Grünzeiten von Ampeln | Stadt Bielefeld (Verkehrstechnik) | Anfrage an die Stadt, Daten nur auf Zusage | unsicher |
| Fahrzeug-Ausstattung (Plätze für Rollstühle, Rollatoren, Kinderwagen) | moBiel | Auskunft oder Tabelle von moBiel | dann Festantwort statt „keine Angabe“ |
| Tarife und Ticketregeln | moBiel | Auskunft oder Tabelle von moBiel | dann Festantwort statt Verweis auf mobiel.de |
| Parkregeln, Breite der Behindertenparkplätze | Stadt Bielefeld | Auskunft | dann Festantwort |

## 5. Manuelle Antworten pflegen

**Wo:** `server/festantworten.csv`, auf dem Server unter `/opt/flowtown/server/`. Der Server liest die Datei bei Änderung nach spätestens einer Minute neu, ein Neustart ist nicht nötig. Eine andere Datei geht mit `FESTANTWORTEN_CSV` in `/etc/flowtown.env`.

| Spalte | Inhalt |
| --- | --- |
| ID | z. B. FA41, nur zur Verwaltung |
| Thema | kurze Bezeichnung |
| Muster | Regulärer Ausdruck auf die Frage in Kleinbuchstaben, z. B. `fahrkarte|ticket` |
| Ausnahme | Regulärer Ausdruck: trifft er zu, gilt die Zeile nicht |
| Profil | leer, oder nur für dieses Profil (`hoeren`, `sehen`, `rollstuhl` …) |
| Antwort | genau der Text, der gesprochen und angezeigt wird, höchstens vier Sätze |
| Quelle, Stand | woher die Angabe stammt und wann sie geprüft wurde |
| Katalog | zugehörige Nummern im Prüfkatalog |
| Status | `freigegeben` oder `entwurf`; nur freigegebene Zeilen antworten |

**Reihenfolge:** Die erste passende Zeile gewinnt. Sicherheit steht deshalb oben, Allgemeines unten.

**Neue Zeile anlegen:**
1. Frage im Wortlaut der Nutzenden aufschreiben, mehrere Varianten.
2. Muster so eng wie möglich schreiben, damit keine anderen Fragen getroffen werden. Im Zweifel eine **Ausnahme** ergänzen.
3. Prüfen: `node flowtown-server.mjs festantworten pruefkatalog.csv` zeigt, welche Katalogfragen treffen. Eine Datei mit Fragen, die **nicht** treffen dürfen, prüft man genauso (so ist `FA71`, „Flowtown ist kostenlos“, nicht auf „Was kostet das Parken?“ gekommen).
4. Erst dann `freigegeben` setzen.

**Wann eine Festantwort richtig ist:** Wenn die Antwort für alle gleich sein muss (Sicherheit, Recht, Zuständigkeit), wenn die Daten fehlen und „keine Angabe“ die ehrliche Antwort ist, oder wenn die Antwort bei der KI von Lauf zu Lauf wechselt. **Wann nicht:** Wenn die Antwort von Ort, Uhrzeit oder Profil abhängt. Dafür sind Werkzeuge da.

## 6. Prüfen und messen

- **Abdeckung:** `node flowtown-server.mjs festantworten pruefkatalog.csv` zeigt je Katalogfrage die Festantwort und am Ende, wie viele von 287 eine haben (aktuell 130, dazu die Direktantworten). Das lässt sich ohne Mistral und ohne Internet prüfen und läuft in Sekunden.
- **Falsche Treffer:** dieselbe Prüfung mit einer Liste von Fragen, die keine Festantwort bekommen dürfen. Aktuell 28 Fragen ohne Fehltreffer. Im dritten Gesamtlauf beantwortete der Server 142 der 287 Fragen selbst, davon 135 mit Ergebnis „erfüllt“.
- **Gesamtlauf:** `testlauf pruefkatalog.csv` auf dem Server. Die Festantworten erscheinen darin mit Werkzeug `festantwort FAxx`, Direktantworten mit `direkt`.
- **Kritische Fälle mehrfach:** Jahnplatz-Aufzug, Notruf, Telefonnummern, Zeitfragen: je mindestens fünf Läufe, weil die KI schwankt.

## 7. Offene Entscheidungen

1. **Freigabe der Festantworten mit Fakten.** Nummern und Regeln in FA04, FA10, FA11 stammen aus den geprüften Seiten der App (Stand November 2026). Alles in den Zeilen FA70 bis FA77 stammt aus dem Projekt und der Datenschutzerklärung. Bitte einmal gegenlesen.
2. **Genauer Standort:** ist umgesetzt (Einwilligung in der App wird beim ersten Mal neu abgefragt). Die Datenschutzerklärung ist angepasst. Sie sollte vor dem Pilot noch juristisch geprüft werden.
3. **Wo moBiel liefert:** Sobald moBiel Aufzugsdaten bereitstellt, ersetzt der Datenstrom den Satz „kein Live-Status“ in R6.
