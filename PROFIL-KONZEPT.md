# Persönliches Profil: erster Start, Wege, Flowtown lernt mit

Stand 13.11.2026. Entwurf, bisher nur im Klick-Dummy umgesetzt (Rundgang Schritte 1 bis 5). In der App ist noch nichts davon gebaut.

## Entscheidungen (13.11.2026)

1. **Lernen nur auf dem Handy,** das Profil lässt sich **sichern** (Datei) und wiederherstellen.
2. **Vorschläge ab drei Fahrten.**
3. **Das Profil gibt es von Anfang an,** im ersten Start. Es ist die Grundlage dafür, dass jede Person sofort einen eigenen Nutzen sieht, der Flowtown von anderen Apps unterscheidet.

## Idee

Ein dauerhaftes Profil aus drei Teilen, das sich auf zwei Wegen füllt: von Hand oder aus den Fahrten.

| Teil | Beispiel | Von Hand | Aus Fahrten gelernt |
| --- | --- | --- | --- |
| **Unterwegs mit** | Auto, Öffis, Rad, zu Fuß | Knöpfe mit Symbol, mehrere möglich | „Du nutzt oft Bus und Bahn. Öffis ergänzen?“ |
| **Mein Bedarf** | Rollstuhl, Rollator, sehen, hören, einfache Sprache, Ruhe, oder kein besonderes Profil | Kacheln, mehrere möglich | nein, bleibt bewusst Entscheidung der Person |
| **Meine Wege** | täglich Detmold → Bielefeld, alle zwei Wochen Bielefeld → Mönchengladbach | Von, Nach, Wie oft | „Du fährst oft von Bielefeld nach Mönchengladbach. Als Weg merken?“ |

## Erster Start (drei Schritte)

1. **Womit bist du oft unterwegs, und brauchst du etwas Besonderes?** Zuerst die Verkehrsmittel. Darunter „Kein besonderes Profil“ als erste Kachel, dann Rollstuhl, Rollator, sehen, hören, einfache Sprache, Ruhe. So fragt die App nicht zuerst nach Behinderung, sondern nach der Art, wie man sich bewegt.
2. **Wo lebst du, welche Wege fährst du oft?** Wohnort und oft gefahrene Wege. Man muss nichts eintragen.
3. **Flowtown kennt jetzt deine Wege.** Sofort der Nutzen: dieselbe Karte „Dein Weg jetzt“, die später auf Heute steht, mit Meldung, Empfehlung und Hinweis zum Bedarf. Darunter drei Dinge, die sich für diese Person ändern, und zwei Beispielfragen.

## Wie das Profil in die App eingreift

| Ansicht | Was sich nach Profil, Verkehrsmitteln und Wegen richtet |
| --- | --- |
| **Heute** | Ziele-Knöpfe aus den eigenen Wegen. Neue Karte **„Dein Weg jetzt“**: Meldung zum Weg (zum Beispiel Stau auf der B66, +12 Minuten), Empfehlung nach den Verkehrsmitteln („Heute lieber mit der Bahn: pünktlich, 44 Minuten. Mit dem Auto 53 Minuten im Stau.“), eine Zeile zum Bedarf, und der Grund („Weil du Detmold → Bielefeld täglich fährst und oft Auto und Bahn nutzt“). Das Verkehrsmittel beim Aufzeichnen ist das meistgenutzte. |
| **Dein Weg heute** | Die eigenen Wege mit Meldung zuerst, dann Orte wie Herforder Straße. |
| **Weg zum Ziel** | Das schnellste der eigenen Verkehrsmittel steht oben („Für dich: du bist oft mit Auto, Öffis und zu Fuß unterwegs“). Bei Rollstuhl oder Rollator Bus und Bahn. |
| **Tipps** | „Für dich“ nach Bedarf (zum Beispiel Rollator: Obernstraße gut, Alter Markt meiden) und „Beste Abfahrt“ für den eigenen Weg. |
| **Verlauf** | Fahrten benannt nach den eigenen Wegen und Verkehrsmitteln. |
| **Karte** | Ebenen nach Verkehrsmitteln vorgewählt: Rad zeigt Radwege, Öffis die Stadtbahn, Auto Staus und Baustellen. |
| **Fragen** | Beispielfragen nach Bedarf, Weg und Verkehrsmittel, zum Beispiel „Wie ist mein Weg heute?“. |
| **Einstellungen** | Eine Zeile fasst zusammen: „Rollator oder Gehhilfe · Auto, Öffis · 1 Weg“. |

Der Dummy zeigt den Zusammenhang: Wer beim Lernmoment „Öffis ergänzen“ bestätigt, sieht die Empfehlung auf Heute sofort von Auto auf Bahn wechseln.

## Quelle und Alter bei jeder Empfehlung

Entscheidung 13.11.2026: **Jede Empfehlung nennt ihre Quelle und wie alt die Angabe ist.** Im Dummy umgesetzt (Rundgang Schritte 6 und 7).

- **Immer sichtbar:** unter „Dein Weg jetzt“, in „Dein Weg heute“ und in der Antwort auf „Wie ist mein Weg heute?“ steht zum Beispiel: „Quelle: Verkehrslage (HERE), Meldungen von moBiel · Stand 07:05 Uhr, vor 8 Minuten“. Im Dummy zusätzlich „Beispielwerte“.
- **Zu alt:** Ist der Stand älter als **30 Minuten**, gibt Flowtown **keine Empfehlung** mehr. Die Karte sagt: „Keine Empfehlung: Die Angaben sind zu alt.“, die Zeile zeigt „–“ statt Minuten, und „Neu laden“ ist als Knopf da. Auch die Antwort im Assistenten nennt das und verweist auf die Bahn-App.
- **Grund:** Lieber keine Empfehlung als eine falsche. Das passt zum Grundsatz von FAKTEN.md (Quelle, Datum, Frischeklasse).
- **Offen:** Die 30 Minuten sind ein **Vorschlag**. Für Verkehrslage (ändert sich schnell) sind sie plausibel, für Fahrplan und Aufzugsstatus braucht es andere Grenzen (siehe Frischeklassen A bis D). In der App muss die Grenze je Quelle festgelegt werden.

## Vorlesen beim Öffnen und Morgenmeldung

Im Dummy umgesetzt (Rundgang Schritt 8, in „Mein Profil“ die Karte „Ansagen und Morgenmeldung“). Gedacht vor allem für Menschen mit Sehbehinderung, nutzbar für alle.

1. **Beim Öffnen vorlesen.** Für das Profil „Ich sehe schlecht oder nichts“ standardmäßig an, sonst aus. Flowtown liest „Dein Weg jetzt“ mit Quelle und Alter vor. Auf der Karte gibt es zusätzlich immer den Knopf „Vorlesen“. Ist die Angabe zu alt, wird das vorgelesen statt einer Empfehlung.
2. **Morgenmeldung.** Aus, bis die Person sie einschaltet. Uhrzeit wählbar (Mo bis Fr). Eine Benachrichtigung mit einem kurzen, für sich verständlichen Text; der Screenreader (VoiceOver, TalkBack) liest sie vor. Bei alten Angaben steht dort „Angaben zu alt, keine Empfehlung“.
3. **Ansagen unterwegs** gibt es schon in der Navigation.

**Datenschutz-Entwurf:** Für Wege im Gebiet Bielefeld erfährt der Server nur „sende um 7:00 eine Meldung an dieses Gerät“, nicht den Weg. Das Handy holt beim Eintreffen die Lage selbst und prüft sie. Für Wege außerhalb des Gebiets müsste das Handy die Strecke abfragen, der Server sähe dann Start und Ziel auf etwa 1 km (siehe „Entscheidungen“ unten).

**Grenzen:**
- Nicht möglich: ungefragte Sprachausgabe im Hintergrund. Browser und installierte Web-App können nicht von sich aus sprechen.
- Benachrichtigungen brauchen die installierte App (auf dem iPhone: zum Home-Bildschirm hinzugefügt) und eine **Push-Funktion am Server, die es noch nicht gibt.**
- **Nicht mit Screenreadern und nicht mit Betroffenen getestet.** Der Dummy zeigt nur Text und nutzt die Sprachausgabe des Browsers.
- Die 30-Minuten-Regel (siehe oben) gilt auch hier. Die Meldung um 7:00 ist nur so gut wie der Stand der Daten um diese Zeit.

## Wie echte Daten in „Dein Weg jetzt“ einfließen

Stand 13.11.2026, nach Durchsicht von `server/flowtown-server.mjs`, `server/README.md` und `app.js`. Geprüft ist der Code, nicht der laufende Server. Alle Zahlen im Dummy sind Beispiele.

### Bausteine: was es schon gibt, was fehlt

| Baustein im Dummy | Echte Quelle | Bielefeld | Detmold → Bielefeld | Bielefeld ↔ Mönchengladbach |
| --- | --- | --- | --- | --- |
| **Stau, Störung, Baustelle auf dem Weg (Auto)** | `/api/lage`: HERE, Autobahn GmbH (A2, A33, A44), Straßen.NRW, Baustellen der Stadt. Die App prüft auf dem Handy, was den eigenen Weg betrifft. | **Da.** | **Teilweise.** Das Gebiet der Lage ist ein Rahmen um Bielefeld (8,38 bis 8,70 Ost, 51,90 bis 52,12 Nord). Nach meiner Kenntnis der Koordinaten liegt Detmold östlich davon. Das Gebiet müsste nach Osten wachsen. | **Fehlt** außer der A2 im Rahmen. Der Rest der Strecke geht nur über die Streckenabfrage (nächste Zeile). |
| **Zeit mit dem Auto im Stau** | `/api/ziel` und `/api/vergleich`: Strecke von HERE mit Störungen auf genau dieser Strecke. Braucht den HERE-Schlüssel, hat ein Tageslimit je Gerät. | **Da.** | **Da.** | **Da.** Die Testfahrt Bielefeld – Mönchengladbach (TODO F1) hat die Stauvorhersage auf der A2 richtig getroffen. |
| **Bahn pünktlich? Zeit mit der Bahn** | Fahrplan von DELFI und Echtzeit (GTFS-RT, Mobilithek), nur für Fahrten in den Fahrplan-Auszügen. Verbindungen sonst über HERE Transit. | **Da** (moBiel und Züge mit Halt in Bielefeld). | **Wahrscheinlich.** Es gibt keinen Auszug für Detmold. Die Züge Detmold – Bielefeld stehen vermutlich im Bielefelder Auszug („Züge mit Halten in Ostwestfalen“). **Nicht geprüft**, Befehl unten. | **Teilweise.** Es gibt Auszüge für beide Städte, die Fahrten dazwischen sind nicht durchgehend drin. Ob HERE Transit Verspätungen kennt, ist **nicht geprüft**. |
| **Meldungen von moBiel** | `/api/oepnv` liest die öffentliche Seite von moBiel. | **Da.** | Nur für den Teil in Bielefeld. | **Nein**, in Mönchengladbach fährt ein anderer Betreiber. Eine Quelle dafür ist nicht angebunden. |
| **Zeile zum Bedarf** (Aufzug, Bank, Ampel mit Ton) | Aufzugsstatus der DB (SIRI FM, Mobilithek), Fakten aus der Redaktions-App, OpenStreetMap | **Teilweise.** DB-Bahnhöfe live, moBiel-Aufzüge offen (E2), Redaktionsfakten erst nach der ersten Erfassungsrunde. | OpenStreetMap, sonst nichts. | OpenStreetMap, sonst nichts. |
| **Der Weg selbst** | Ortssuche `/api/ort` (HERE). Wiederkehrende Wege erkennt die App schon aus den Fahrten (`findRoutes`). | **Da.** | **Da.** | **Da.** |
| **Quelle und Alter** | `/api/lage` liefert für jede Quelle den Stand. Quellen älter als 30 Minuten (Baustellen der Stadt: 6 Stunden) lässt der Server schon heute weg. | **Da.** | **Da.** | **Da.** |
| **Morgenmeldung** | Push vom Server | **Fehlt** (neu zu bauen). | **Fehlt.** | Nicht vorgesehen, der Weg ist selten. |

**Folgerungen**
- Die 30-Minuten-Regel entspricht dem, was der Server heute schon tut. Sie lässt sich in der App ohne neue Daten umsetzen.
- Die Quellenzeile darf nur Quellen nennen, die wirklich zum Weg beigetragen haben. „Meldungen von moBiel“ auf einem Weg nach Detmold oder Mönchengladbach wäre falsch. Im Dummy steht sie noch für alle Wege. Das muss in der App aus den echten Quellen der Antwort gebildet werden.
- Die Empfehlung „Bahn statt Auto“ hat im Dummy feste Texte. Echt entsteht sie aus dem Vergleich Auto (HERE mit Verkehr) gegen Bahn (Fahrplan plus Echtzeit). Wo einer der beiden Werte fehlt, gibt es **keine Empfehlung**, nur die vorhandenen Angaben und den Hinweis, was fehlt.

### Datenschutz-Zielkonflikt

Die Lage für das Gebiet ist für alle gleich, das Handy filtert selbst: Der Server erfährt keinen Weg. Die Streckenabfrage (Zeit im Stau, Verbindung) verrät dem Server Start und Ziel, gerundet auf etwa 1 km. Das ist heute schon so und in der Datenschutzerklärung beschrieben, wenn jemand ein Ziel prüft.

### Entscheidungen (13.11.2026)

1. **Das Gebiet der Lage wächst mit den Suchen der Nutzenden, nicht auf Vorrat.** Vorerst bleibt es beim Gebiet Bielefeld mit HERE. Das Gebiet wird nicht fest nach Osten erweitert.
2. **Für Wege außerhalb des Gebiets** (Detmold, Mönchengladbach) fragt das Handy die Strecke beim Server ab. Der Server sieht dabei **Start und Ziel auf etwa 1 km genau.** Einverstanden. In der Datenschutzerklärung und in der App muss das vor der ersten Abfrage stehen.

**Folgen**
- **Bielefeld:** Der Weg bleibt auf dem Handy, der Server erfährt nichts.
- **Detmold → Bielefeld und Mönchengladbach:** Streckenabfrage auf Wunsch („Weg jetzt prüfen“). Die Quellenzeile nennt nur, was dabei wirklich geliefert wurde.
- **Morgenmeldung:** Für Wege im Gebiet Bielefeld reicht die Uhrzeit auf dem Server. Für einen Weg außerhalb müsste das Handy zur Uhrzeit die Strecke abfragen, der Server sähe also jeden Morgen Start und Ziel. Das ist **eine eigene Entscheidung**, sobald die Morgenmeldung gebaut wird. Bis dahin steht im Dummy nicht mehr „der Server kennt nur die Uhrzeit“, sondern beide Fälle.
- **Offen: wie das Gebiet „mit den Suchen wächst“.** Vorschlag, noch nicht entschieden und nicht gebaut: Der Server holt die Lage für Kacheln von etwa 10 km, in denen in den letzten Tagen jemand ein Ziel geprüft hat, und merkt sich nur die Kachel, keine Person. Das ist eine Ausbaustufe nach Schritt 2 der Reihenfolge unten.
- **Tageslimit je Gerät:** Die Streckenabfrage hat eines. Das muss reichen, ohne dass Nutzende ausgesperrt werden. Zu prüfen.

### Reihenfolge für die App (M8a)

1. Wege speichern (Ortssuche oder aus Fahrten), nur auf dem Handy.
2. „Dein Weg jetzt“ für Wege im Gebiet der Lage: Meldungen aus `/api/lage`, Quelle und Alter aus der Antwort, 30-Minuten-Regel.
3. Streckenabfrage für Wege außerhalb des Gebiets (Detmold, Mönchengladbach) auf Wunsch, mit Hinweis zu Start und Ziel. Das Gebiet der Lage bleibt vorerst Bielefeld.
4. Vergleich Auto gegen Bahn über die vorhandenen Abfragen, ohne Empfehlung bei fehlenden Werten.
5. Gebiet der Lage nach Nachfrage wachsen lassen (Kacheln, siehe oben), wenn die Nutzung es zeigt.
6. Vorlesen beim Öffnen (nur App, keine neue Datenquelle nötig).
7. Morgenmeldung (braucht Push am Server und die Datenschutzerklärung).

### Zwei Prüfungen auf dem Server (noch offen)

Ob die Züge nach Detmold im Bielefelder Auszug stehen und ob der Auszug für Mönchengladbach Bielefeld kennt:

```bash
grep -o 'Detmold[^"]*' /var/lib/flowtown/fahrplan.json | sort -u | head
grep -o 'Bielefeld[^"]*' /var/lib/flowtown/fahrplan-moenchengladbach.json | sort -u | head
```

Kommt nichts, fehlt der Halt im Auszug. Dann wäre ein Eintrag „Detmold“ in `STADT_FP` nötig (Stadtrahmen und Regionsrahmen), wie für Paderborn.

### Was ich nicht geprüft habe

- die Lage der Koordinaten von Detmold gegenüber dem Rahmen (aus dem Gedächtnis),
- Kosten und Limits des HERE-Vertrags,
- ob GTFS-RT Verspätungen für alle Züge nach Detmold liefert,
- ob HERE Transit Echtzeit kennt,
- wer in Mönchengladbach Meldungen zu Bus und Bahn veröffentlicht und ob es eine offene Schnittstelle gibt.

## Mein Profil (unter Einstellungen)

Alle Einträge sind als **„von dir“** oder **„gelernt aus deinen Fahrten“** gekennzeichnet.

**Flowtown lernt mit:**
- Nur auf dem Handy. Ab drei Fahrten schlägt Flowtown vor, die Person entscheidet mit Ja oder Nein.
- Lernen lässt sich abschalten.
- Zu jedem Vorschlag steht, warum („3 Fahrten in 6 Wochen, meist freitags“).
- Das Bedarfsprofil wird nie automatisch verändert.

**Profil sichern:** Die Datei enthält nur Bedarf, Verkehrsmittel und Wege, keine Fahrten. Sie hilft beim Handywechsel. „Sichern und übertragen“ für Fahrten gibt es schon.

## Was damit möglich wird

- **Morgenwarnung (Idee, noch nicht gebaut):** „Soll Flowtown dir morgens sagen, wie dein Weg Detmold → Bielefeld heute aussieht?“ (TODO L4)
- **Unterscheidung von anderen Apps:** Flowtown richtet sich nach der Person (Wege, Verkehrsmittel, Bedarf) und sagt bei jeder Antwort, woher sie kommt.

## Was noch offen ist

1. **Datenschutz:** Lernen geschieht auf dem Gerät, nichts davon geht an den Server. Die Datenschutzerklärung muss das beschreiben, ebenso die gesicherte Profildatei.
2. **Echte Meldungen:** Geklärt im Abschnitt „Wie echte Daten in ‚Dein Weg jetzt‘ einfließen“: Lage für Bielefeld da, Detmold nur nach Erweiterung des Gebiets, Mönchengladbach auf Wunsch über die Streckenabfrage. Zu entscheiden sind das Gebiet und die Sichtbarkeit von Start und Ziel.
3. **Empfehlung „Bahn statt Auto“:** Der Vergleich ist mit den vorhandenen Abfragen möglich (Auto mit Verkehr, Bahn mit Fahrplan und Echtzeit), aber nur, wo beide Werte vorliegen. Sonst keine Empfehlung. Im Dummy sind es Beispielwerte.
4. **Mehrere Bedarfe:** Kombinationen sind möglich. Die Beispielfrage und die Zeile zum Bedarf nehmen den ersten gewählten.
5. **Wie viele Fahrten für den ersten Vorschlag?** Drei, wie entschieden. Wie lange zurück gezählt wird (6 Wochen im Dummy), ist noch offen.
