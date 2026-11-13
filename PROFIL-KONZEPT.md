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

**Datenschutz-Entwurf:** Der Server erfährt nur „sende um 7:00 eine Meldung an dieses Gerät“, nicht den Weg. Das Handy holt beim Eintreffen die Lage für den gespeicherten Weg selbst. Das passt zu „Lernen nur auf dem Handy“.

**Grenzen:**
- Nicht möglich: ungefragte Sprachausgabe im Hintergrund. Browser und installierte Web-App können nicht von sich aus sprechen.
- Benachrichtigungen brauchen die installierte App (auf dem iPhone: zum Home-Bildschirm hinzugefügt) und eine **Push-Funktion am Server, die es noch nicht gibt.**
- **Nicht mit Screenreadern und nicht mit Betroffenen getestet.** Der Dummy zeigt nur Text und nutzt die Sprachausgabe des Browsers.
- Die 30-Minuten-Regel (siehe oben) gilt auch hier. Die Meldung um 7:00 ist nur so gut wie der Stand der Daten um diese Zeit.

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
2. **Echte Meldungen:** Die Meldung zum eigenen Weg (Stau, Störung) braucht Verkehrslage und moBiel-Meldungen für die gespeicherte Strecke. Die Lage für Bielefeld gibt es, Strecken außerhalb (Detmold, Mönchengladbach) nur teilweise.
3. **Empfehlung „Bahn statt Auto“:** Vergleichen der echten Zeiten braucht den Fahrplan der Verbindung und die Verkehrslage. Im Dummy sind es Beispielwerte.
4. **Mehrere Bedarfe:** Kombinationen sind möglich. Die Beispielfrage und die Zeile zum Bedarf nehmen den ersten gewählten.
5. **Wie viele Fahrten für den ersten Vorschlag?** Drei, wie entschieden. Wie lange zurück gezählt wird (6 Wochen im Dummy), ist noch offen.
