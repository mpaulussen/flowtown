# Flowtown in Beispielen: sechs Such- und Antwortpfade

Stand 13.11.2026, App 0.102.1. Entwurf zum Lesen und Gegenlesen, noch nicht für Dritte gedacht.

## So lest ihr die Beispiele

Jeder Baustein trägt eine Kennzeichnung:

- **[ECHT]** Der Inhalt kommt aus unseren Daten oder aus einem Testlauf der Assistenz. Der genaue Wortlaut kann sich ändern, weil eine KI die Antwort formuliert.
- **[BEISPIEL]** Erfunden, aber realistisch: Personen, Uhrzeiten, Verspätungen, Messwerte, Zustände.
- **[POTENZIAL]** Technisch nah, aber noch nicht gebaut oder noch nicht mit Daten gefüllt.

Alle sechs Personen sind erfunden.

## Die Daten dahinter (alle [ECHT], Stand 11.11.2026)

- Fahrplan von moBiel und DELFI, gültig 24.10. bis 12.12.2026 (Bielefeld, Mönchengladbach, Paderborn)
- Aufzugsdatenbank der DB: 3.015 Anlagen mit Status, davon 164 am 11.11. außer Betrieb (Momentaufnahme)
- Stadt Bielefeld: 322 Ampelanlagen, 48 öffentliche Toiletten, 122 Behindertenparkplätze (dazu 159 aus OpenStreetMap)
- 38 Stadtbahn-Haltestellen mit Angabe zum Hochbahnsteig
- 47 Hinweise aus dem Altstadt-Projekt von barrierefrAI
- Pilotgebiet: 481 Objekte im Katalog (Altstadt, Hauptbahnhof, Bethel, Universität), 33 davon Priorität 1 (Aufzüge und Stadtbahn-Haltestellen)
- Prüfkatalog: 334 Fragen. Letzter Gesamtlauf: 256 von 287 Fragen erfüllt, 22 teilweise, 0 nicht erfüllt, 1 falsch, 8 nicht prüfbar

**Ehrlich dazu:** Die Bewertung der Testläufe hat bisher Claude nach der Konsolenausgabe vorgenommen, nicht Betroffene. Die Antworten der KI schwanken von Lauf zu Lauf. Die Redaktion hat gerade erst begonnen.

---

## 1. Rollstuhl: „Geht der Aufzug am Jahnplatz?“

**Ayşe [BEISPIEL]**, 34, E-Rollstuhl, fährt morgens mit der Stadtbahn zur Arbeit. Anlass ist der Zeitungsbericht der Neuen Westfälischen vom 10.11. zu den Aufzügen am Jahnplatz.

**Frage:** „Geht der Aufzug am Jahnplatz?“

**Antwort heute [ECHT]:** „Am Jahnplatz gibt es laut Fahrplan einen Aufzug. Für Aufzüge an Stadtbahn-Haltestellen gibt es keinen Live-Status, bitte vor Ort prüfen.“

**Mit der Redaktion [Mechanismus gebaut, Wert BEISPIEL]:** „… Laut Redaktion, geprüft vor 2 Stunden: Aufzug zum Jahnplatz-Forum ist in Betrieb.“ (Der Aufzug „zum Jahnplatz-Forum“ steht in unserem Katalog echt. Die Prüfung ist erfunden.)

**Mit Live-Daten von moBiel [POTENZIAL]:** „Der Aufzug zum Jahnplatz-Forum ist seit 07:42 Uhr außer Betrieb. Plan B: …“

**Folgefrage:** „Dann sag mir einen anderen Weg zur Kunsthalle.“

**Antwort [BEISPIEL]:** „Fahr mit der Linie 4 bis Rathaus und steig dort aus. Von dort sind es etwa 700 Meter zu Fuß bis zur Kunsthalle, ohne Stufen.“

**Folgefrage:** „Wie komme ich an der Haltestelle Rathaus mit dem Rollstuhl in die Stadtbahn?“

**Antwort [ECHT, Altstadt-Projekt]:** Die Hochbahnsteige können große Kanten und teils gefährliche Lücken haben. Bewährt hat sich, rückwärts aus der Bahn zu fahren, damit die großen Hinterräder die Kante zuerst nehmen. Den blauen Taster an der Tür drücken, damit die Türen länger offen bleiben.

**Was das zeigt:** Flowtown sagt ehrlich, was es nicht weiß, nennt trotzdem einen Weg und kennt die Praxis vor Ort. Mit einer Schnittstelle von moBiel würde aus „bitte prüfen“ eine echte Auskunft.

---

## 2. Rollator: „Wie lange brauche ich zum Jahnplatz?“

**Herr Brandt [BEISPIEL]**, 72, geht mit Rollator.

**Frage:** „Wie lange brauche ich mit dem Rollator zum Jahnplatz?“

**Antwort [ECHT, Testlauf]:** „Geschätzt 10 Minuten mit Rollator“, statt 5 Minuten ohne Hilfsmittel. Flowtown rechnet mit einem langsameren Tempo. Die Annahme dazu wird im Pilot mit echten Wegen geprüft.

**Folgefrage:** „Welcher Weg in der Altstadt ist mit dem Rollator gut?“

**Antwort [ECHT, Altstadt-Projekt]:** Gut geeignet ist die Obernstraße mit ihrem gleichmäßigen Pflaster, am besten in der Straßenmitte. Meiden sollte man das Kopfsteinpflaster am Alten Markt, Schotterwege, dichte Menschenmengen und enge Gänge. Schon zwei Stufen können ein großes Hindernis sein.

**Folgefrage:** „Gibt es unterwegs eine Bank zum Ausruhen?“

**Antwort heute [Verhalten ECHT, Wortlaut BEISPIEL]:** Flowtown weiß das noch nicht und sagt es offen, etwa „Dazu habe ich keine Angabe.“ (In den Testläufen K150 und K160 antwortet es bei fehlenden Ortsdaten so ähnlich: „Dazu kann ich nichts sagen.“)

**Mit Bänken aus OpenStreetMap [POTENZIAL]:** „Eine Bank ist 60 Meter vor dir, am Rand der Obernstraße.“ (Bank und Entfernung erfunden. Bänke stehen in OpenStreetMap, sind aber noch nicht eingebunden.)

**Folgefrage:** „Reicht meine Umsteigezeit am Hauptbahnhof, wenn ich langsam gehe?“

**Antwort heute [ECHT]:** „Ich kenne deine genaue Umsteigezeit nicht.“ Dazu nennt Flowtown die Linien, die dort abfahren.

**Mit Tempo-Rechnung [POTENZIAL]:** „Bei deinem Tempo brauchst du etwa 6 Minuten vom Gleis zum Aufzug. Die nächste Verbindung ist in 9 Minuten.“

**Was das zeigt:** Das Tempo des Profils verändert die Antwort. Und wo Flowtown etwas nicht weiß, sagt es das, statt zu raten.

---

## 3. Sehen: „Wo bin ich?“

**Lena [BEISPIEL]**, 29, blind, Langstock und VoiceOver, steht in der Altstadt.

**Frage:** „Wo bin ich?“

**Antwort [ECHT, Standort aus einem Testlauf]:** „Du stehst bei Altstädter Kirchplatz 3, Bielefeld.“ Dazu in der App: **[BEISPIEL]** „Auf 12 Uhr, etwa 40 Meter, ist eine Ampel mit Tonsignal.“

**Folgefrage:** „Gibt es Blindenleitsysteme in der Innenstadt?“

**Antwort [ECHT, Altstadt-Projekt]:** „Teilweise.“ In Teilen der Fußgängerzone gibt es Orientierungsbordsteine für den Langstock, taktile Leitsysteme zum Beispiel in der Bahnhofstraße und in Teilen der Obernstraße. Vollständigkeit und Zustand sind unterschiedlich. Der Hauptbahnhof hat ein Blindenleitsystem.

**Folgefrage:** „Woran kann ich mich ohne Sicht orientieren?“

**Antwort [ECHT, Altstadt-Projekt]:** Hilfreich sind das Brunnenplätschern am Alten Markt, Kirchenglocken, der Geruch von Bäckereien oder Blumenläden, Hauswände und Bordsteinkanten sowie das gleichmäßige Pflaster der Obernstraße, die ein leichtes Quergefälle zur Mitte hat.

**Unterwegs [ECHT, gebaut]:** Navigation mit Ansagen und Hinweiston, zum Beispiel „Die Strecke beginnt 30 Meter vor dir, auf 2 Uhr“. Eine Treppe wird 6 Meter vorher angesagt, mit Stufenzahl und Handlauf. Die Ansagen orientieren sich an der Norm ITU-T F.921.

**Was das zeigt:** Orientierung ohne Bild, auf Zuruf, mit Wissen, das sonst nirgends zusammensteht.

---

## 4. Hören: „Wann fährt die nächste Bahn?“

**Jonas [BEISPIEL]**, 41, gehörlos.

**Frage:** „Wann fährt die nächste Bahn ab Jahnplatz?“

**Antwort [Aufbau ECHT, Zeiten BEISPIEL]:** „Die nächste Linie 4 Richtung Universität fährt in 5 Minuten, laut Fahrplan.“ Alles als Text, kein Ton nötig. Verspätungen in Echtzeit sind **[POTENZIAL]**, sobald die Echtzeitdaten laufen.

**Folgefrage:** „Wie setze ich einen Notruf ab, wenn ich nicht hören oder sprechen kann?“

**Antwort [ECHT, Altstadt-Projekt]:** Die offizielle Notruf-App nora setzt einen Notruf ohne Sprechen ab und sendet den Standort automatisch. Vorher herunterladen und registrieren. Über die Tess Relay-Dienste geht der Notruf per Video- oder Textchat über Dolmetscher. Das WIS-Notrufsystem arbeitet mit Gebärdensprache und lässt sich auch über externe Taster auslösen. Notruf-SMS geht nur nach vorheriger Anmeldung.

**Folgefrage:** „Gibt es Induktionsschleifen?“

**Antwort [ECHT, Altstadt-Projekt]:** Vereinzelt, zum Beispiel in Kirchen, Theatern, Museen oder an Schaltern. Informationen dazu sind oft Mangelware. Auf das Piktogramm achten und gezielt nachfragen.

**Mit Gebäudedaten [Datenfeld ECHT, Ergebnis BEISPIEL]:** „Im Haus X gibt es eine Höranlage.“ Die Daten von Bethel („Bielefeld barrierefrei erleben“) haben ein Feld dafür. Welche Gebäude es haben, steht dort.

**Befehl:** „Sag es mir ohne Ton.“ **[ECHT]** „Ich antworte ohne Ton.“ Die App schaltet die Ansagen aus.

**Was das zeigt:** Flowtown hängt nie an Ton oder Sprache. Und es kennt den Weg zum Notruf ohne Stimme.

---

## 5. Einfache Sprache: „Ich habe mich verlaufen“

**Mara [BEISPIEL]**, 19, braucht einfache Sprache.

**Frage:** „Ich habe mich verlaufen.“

**Antwort [ECHT, feste Antwort]:** „Bei Gefahr oder Verletzung ruf sofort die 112. Wenn du dich verlaufen hast oder nicht weiterkommst: Sprich Menschen in der Nähe an, zum Beispiel in einem Geschäft oder an einer Haltestelle. Du kannst sagen: ‚Ich komme hier nicht weiter. Können Sie mir helfen?‘ In Bus und Stadtbahn hilft das Fahrpersonal …“

**Folgefrage:** „Erkläre mir das in einfacher Sprache.“

**Antwort [Mechanismus ECHT, Wortlaut BEISPIEL]:** „Du hast dich verlaufen. Das ist nicht schlimm. Frag einen Menschen. Sag: ‚Ich komme nicht weiter. Kannst du mir helfen?‘ Wenn es gefährlich ist, ruf die 112.“

**Folgefrage:** „Ich brauche Leichte Sprache. Was hilft mir in der Altstadt?“

**Antwort [ECHT, Altstadt-Projekt]:** Plant nur wenige Dinge für einen Tag. Schreibt wichtige Adressen auf. Sagt den Leuten: „Bitte sprechen Sie langsam und einfach.“ Die Tourist-Information ist im Neuen Rathaus, Niederwall 23. Sie bekommen dort Hilfe und einen Stadt-Plan. Macht oft Pausen.

**Was das zeigt:** Die Sicherheit steht immer oben, die Sprache passt sich an, und der Weg zum Menschen ist kurz.

---

## 6. Ruhe und Reize: „Wann ist die Altstadt ruhiger?“

**Tim [BEISPIEL]**, 26, Autismus, Reizüberflutung in Menschenmengen.

**Frage:** „Ich vertrage Trubel schlecht. Wann ist die Altstadt ruhiger?“

**Antwort [ECHT, Altstadt-Projekt]:** Wochentags am frühen Vormittag. Samstags ist die Obernstraße sehr voll. Noise-Cancelling-Kopfhörer und feste Pausen an ruhigen Orten helfen gegen Reizüberflutung.

**Folgefrage:** „Wo finde ich ruhige Rückzugsorte?“

**Antwort [ECHT, Altstadt-Projekt]:** Zum Beispiel im Ravensberger Park, im Bürgerpark, im Botanischen Garten, in den Grünzügen entlang der Lutter oder in der Stadtbibliothek am Neumarkt, außerhalb von Veranstaltungen.

**Folgefrage:** „Wie bereite ich den Besuch vor?“

**Antwort [ECHT, Altstadt-Projekt]:** Vorhersehbarkeit hilft: einen Tagesplan machen, einen Plan B haben, Hilfsmittel wie Kopfhörer einpacken, belebte Orte wie Obernstraße, Jahnplatz und Alter Markt zu ruhigen Zeiten besuchen.

**Ruhige Wege [POTENZIAL]:** „Der ruhigste Weg zum Hauptbahnhof führt über die Grünzüge an der Lutter. Er ist 9 Minuten länger, aber ohne Hauptstraße.“ (Erfunden. Das Profil „Ruhe“ gibt es, eine Wegsuche nach Ruhe noch nicht.)

**Was das zeigt:** Auch unsichtbare Bedürfnisse bekommen eine konkrete, ortsgenaue Antwort.

---

## Zugabe: ohne Behinderung

**Sabine [BEISPIEL]**, Pendlerin, fährt je nach Tag Auto oder Bahn.

**Frage:** „Womit komme ich heute am besten zur Uni?“

**Antwort [Mechanismus ECHT, Werte BEISPIEL]:** „Heute am besten mit der Stadtbahn Linie 4: 17 Minuten, ohne Umsteigen. Mit dem Auto 19 Minuten plus Parkplatzsuche. Auf der Detmolder Straße ist gerade viel Verkehr.“

**Frage:** „Wo warte ich lange?“

**Antwort [Mechanismus ECHT, Wert BEISPIEL, braucht eigene Fahrten]:** „Am längsten wartest du an der Kreuzung Detmolder Straße, im Schnitt 1 Minute 5 Sekunden um 8 Uhr.“

**Was das zeigt:** Dieselbe App, dieselben Daten, ohne Profil. Der Vorteil ist weniger Warten, nicht nur Barrierefreiheit.

---

## Was das für Stakeholder heißt (drei Sätze)

1. Flowtown beantwortet Fragen, die Betroffene wirklich stellen, mit Daten aus Fahrplan, Stadt, Bethel und eigener Redaktion, und nennt zu jeder Antwort Quelle und Alter.
2. Wo Daten fehlen, sagt es das offen und nennt einen anderen Weg. Aus jeder Lücke macht die Redaktion einen Erfassungsauftrag.
3. Mit Live-Daten von moBiel (Aufzüge) und Echtzeit wird aus „bitte prüfen“ eine verlässliche Auskunft.

## Wo es heute noch dünn ist

- Kein Live-Status der Stadtbahn-Aufzüge. Dazu liegt eine Anfrage an moBiel noch bei uns.
- Die Redaktion erfasst gerade erst. Die Beispiele mit „laut Redaktion“ zeigen den Mechanismus, nicht schon viele Daten.
- Das Gehtempo für Rollator und Rollstuhl ist eine Annahme, im Pilot zu prüfen.
- Die Bewertung der Testläufe stammt nicht von Betroffenen. Eine Prüfung mit Betroffenen und Fachleuten (zum Beispiel Orientierung und Mobilität) steht aus.
- Die Antworten aus dem Altstadt-Projekt sind Inhalte von barrierefrAI selbst und noch nicht von Dritten gegengelesen.
