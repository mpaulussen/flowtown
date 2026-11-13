# Persönliches Profil: erster Start, Wege, Flowtown lernt mit

Stand 13.11.2026. Entwurf, bisher nur im Klick-Dummy umgesetzt (Rundgang Schritte 1 bis 4). In der App ist noch nichts davon gebaut.

## Idee

Ein dauerhaftes Profil, das aus drei Teilen besteht und sich auf zwei Wegen füllt: von Hand oder aus den Fahrten.

| Teil | Beispiel | Von Hand | Aus Fahrten gelernt |
| --- | --- | --- | --- |
| **Mein Bedarf** | Rollstuhl, Rollator, sehen, hören, einfache Sprache, Ruhe, oder kein Profil | sechs Kacheln, mehrere möglich | nein (bleibt bewusst Entscheidung der Person) |
| **Unterwegs mit** | Auto, Öffis, Rad, zu Fuß, Wohnort | Chips | „Du nutzt oft Bus und Bahn. Öffis ergänzen?“ |
| **Meine Wege** | täglich Detmold → Bielefeld, alle zwei Wochen Bielefeld → Mönchengladbach | Von, Nach, Wie oft | „Du fährst oft von Bielefeld nach Mönchengladbach. Als Weg merken?“ |

## Erster Start (drei Schritte)

1. **Wer bist du, und womit bist du oft unterwegs?** Sechs Kacheln, mehrere möglich, oder „Kein besonderes Profil“. Darunter die Verkehrsmittel als Knöpfe mit Symbol: Auto, Öffis, Rad, zu Fuß (mehrere möglich).
2. **Wo lebst du, welche Wege fährst du oft?** Wohnort und oft gefahrene Wege. Man muss nichts eintragen.
3. **So sieht das für dich aus.** Sofort ein Beispiel: die eigenen Wege mit Meldungen von heute und eine Frage, die zum Profil passt (zum Beispiel Rollstuhl: „Geht der Aufzug am Jahnplatz?“). Ein zweites Beispiel zeigt die ehrliche Antwort „keine Angabe“.

## Mein Profil (unter Einstellungen)

Alle Einträge sind als **„von dir“** oder **„gelernt aus deinen Fahrten“** gekennzeichnet.

**Flowtown lernt mit:**
- Nur auf dem Handy. Flowtown schlägt vor, die Person entscheidet mit Ja oder Nein.
- Lernen lässt sich abschalten.
- Vorschläge entstehen aus wiederkehrenden Fahrten (Zahl der Fahrten und Zeitraum stehen dabei, damit man sieht, warum).
- Das Bedarfsprofil wird nie automatisch verändert.

## Was damit möglich wird

- **Dein Weg heute:** Die Seite zeigt zuerst die eigenen Wege mit Meldungen (Stau, Störung, Baustelle).
- **Morgenwarnung (Idee, noch nicht gebaut):** „Soll Flowtown dir morgens sagen, wie dein Weg Detmold → Bielefeld heute aussieht?“ Das ist TODO L4.
- **Antworten:** Wege und Verkehrsmittel des Profils fließen in „Womit komme ich am besten?“ ein.

## Offene Fragen

1. **Datenschutz:** Das Lernen braucht gespeicherte Fahrten. Heute liegen sie nur auf dem Handy. Das soll so bleiben: Lernen geschieht auf dem Gerät, nichts davon geht an den Server. Die Datenschutzerklärung muss das beschreiben.
2. **Wie viele Fahrten für einen Vorschlag?** Im Dummy: 4 Fahrten in 8 Wochen für einen seltenen Weg, 9 in 2 Wochen für einen täglichen. Werte noch ungeprüft.
3. **Wo gibt es das Profil erstmals?** Sofort im ersten Start (wie im Dummy) oder erst nach der ersten Aufzeichnung?
4. **Mehrere Bedarfe:** Kombinationen wie Rollator und Ruhe sind möglich. Die Reihenfolge der Beispielfrage nimmt den ersten gewählten Bedarf.
5. **Profil teilen oder sichern:** Wie kommt das Profil auf ein neues Handy? („Sichern und übertragen“ gibt es schon für Fahrten.)
