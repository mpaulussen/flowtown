# Was Flowtown kann, in einfachen Worten

Stand 11.11.2026, App 0.101.1, Redaktions-App 0.1.0. Alles, was hier als „heute“ steht, ist gebaut. „Bald“ und „später“ sind Pläne, keine Zusagen.

## In einem Satz

**Flowtown hilft Menschen mit Behinderung, in Bielefeld gut anzukommen, und sagt immer ehrlich, woher es etwas weiß.**

## Vier Dinge, die man bekommt

| Karte | Das Versprechen | Beispielfrage |
| --- | --- | --- |
| **1 Mein Weg** | Du sagst, wohin du willst. Flowtown zeigt, womit es für dich geht: zu Fuß, Rad, Auto, Bus und Bahn. Es rechnet mit deinem Bedarf (Rollstuhl, Rollator, schlecht sehen, schlecht hören, einfache Sprache). | „Was lohnt sich mit Rollstuhl?“ |
| **2 Gerade jetzt** | Aufzug kaputt? Bahn zu spät? Baustelle? Flowtown sagt, was jetzt gilt. | „Geht der Aufzug am Jahnplatz?“ |
| **3 Plan B und Hilfe** | Wenn etwas nicht klappt, nennt Flowtown einen anderen Weg. Und es sagt, wo Menschen helfen. Der Notruf ist immer einen Tipp entfernt. | „Ich habe mich verlaufen.“ |
| **4 Ehrlich und gemeinsam** | Zu jeder Antwort sagt Flowtown, woher sie kommt und wie alt sie ist. Weiß es etwas nicht, sagt es das. Unter jeder Antwort kannst du sagen: stimmt, stimmt nicht, veraltet. | „Wie breit ist die Tür vom Aufzug am Rathaus?“ → „Dazu habe ich keine Angabe.“ |

Dazu als kleine Zugabe: **Dein Verlauf** zeigt, wo du an Ampeln wartest. Das bleibt auf deinem Handy.

## Wie man es benutzt

- **Fragen:** tippen oder sprechen, in ganz normalen Sätzen. Das Mikrofon ist auf jeder Seite.
- **Aufzeichnen:** „Ohne Ziel aufzeichnen“ misst Halte und Wartezeiten an Ampeln. Ein Ziel braucht man dafür nicht.
- **Unterwegs:** Ansagen mit Hinweiston, „Wiederholen“, „Weiter geradeaus“. Für Sehbehinderung, Hören und einfache Sprache gibt es eigene Einstellungen. „Sag es mir ohne Ton“ und „Erkläre das in einfacher Sprache“ gehen auch als Frage.
- **Mitmachen:** Hindernisse auf der Karte melden, bestätigen oder als erledigt markieren.

## Was Flowtown nicht tut

- Es **verspricht nie**, dass ein Weg frei ist. Angaben gelten „laut Karte“ oder „laut Redaktion“.
- Es **rät nicht**. Fehlt eine Angabe, steht „dazu habe ich keine Angabe“.
- Es **ersetzt keinen Notruf**. Bei Gefahr gilt 112.
- Es **speichert keine Fahrten auf dem Server**. Die bleiben auf deinem Handy, außer man nimmt am Pilot teil.

## Woher Flowtown es weiß (in fünf Worten)

Fahrplan, Stadt, Bethel, OpenStreetMap, Redaktion.

- **Fahrplan und Echtzeit:** moBiel und Bahn.
- **Stadt Bielefeld:** Ampeln, Baustellen, Toiletten, Parkplätze.
- **Bethel:** „Bielefeld barrierefrei erleben“, Gebäude mit Eingängen und Aufzügen.
- **OpenStreetMap:** Wege, Treppen, Haltestellen.
- **Redaktion:** Menschen, die Aufzüge und Eingänge **vor Ort angesehen** haben. Das ist die genaueste Quelle, aber heute noch klein (Pilotgebiet Altstadt, Hauptbahnhof, Bethel, Uni).

## Was es heute gibt, was bald kommt, was später

| Heute | Bald | Später |
| --- | --- | --- |
| Fragen, Weg nach Profil, Plan B, Rückweg, Abfahrten, Störungen, Navigation mit Ansagen, Karte mit Hinweisen, Rückmeldung unter Antworten, Redaktions-App mit Aufzugsstatus | Morgenwarnung für feste Wege („Dein Weg heute“), Gehtempo auch bei Abfahrten und Umstiegen, Aufzugsstatus von moBiel, Fotos in der Redaktions-App | Telefon-Assistenz, mehr Städte, Widget auf dem Sperrbildschirm |

## So wird Flowtown jeden Tag besser

Die Redaktion braucht dafür **10 bis 15 Minuten am Tag**. Der Server gibt dazu einen Tageszettel aus (oder die Seite „Bericht“ in der Redaktions-App, ganz oben „Heute zu tun“).

```bash
cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs tagesbericht'
```

**Täglich**
1. **Rückmeldungen ansehen:** Was hat jemand mit „stimmt nicht“ oder „veraltet“ markiert? Ursache suchen: Ist die **Angabe** falsch (in der Redaktions-App korrigieren oder zurückziehen)? Ist die **Antwort** schlecht formuliert (Festantwort oder Regel ändern)? Fehlt eine **Quelle** (in `TODO.md`)?
2. **Entwürfe freigeben,** wenn Mitwirkende etwas erfasst haben.
3. **Fälliges prüfen:** Aufzüge und Stadtbahn-Haltestellen der Priorität 1, die abgelaufen oder offen sind.
4. **Eine Lücke schließen:** Die Liste „was am häufigsten fehlt“ zeigt, wonach Menschen fragen und Flowtown keine Antwort hat. Eine davon pro Tag erfassen oder als Festantwort beantworten.

**Wöchentlich**
- Testlauf des Prüfkatalogs und Vergleich mit der Vorwoche, damit nichts schlechter wird.
- Objektkatalog neu erzeugen (neue Orte aus OpenStreetMap).
- `fakten.jsonl` sichern.

**Monatlich**
- Angaben der Frischeklassen C und D (Eingänge, WC, Ampeln) erneut ansehen.
- Bericht für Mobil und Stadt: wie viele Objekte erfasst, wie viele aktuell.
- Normwerte und Datenschutz prüfen.

Wer macht was: Erfassen vor Ort kann nur ein Mensch. Texte, Festantworten, Regeln und Auswertungen kann Claude Code ändern, wenn die Redaktion sagt, was geändert werden soll.

## Wie man alles möglichst einfach beschreibt

Regeln, die für App, Flyer, Mails und Gespräche gelten:

1. **Ein Gedanke pro Satz.** Kurze Sätze, aktive Verben.
2. **Erst das Beispiel, dann die Erklärung.** „Frag: Geht der Aufzug am Jahnplatz?“ sagt mehr als „Echtzeitdaten zur Barrierefreiheit“.
3. **Höchstens vier Dinge nennen.** Dann merkt man sie sich. Hier sind es vier Karten.
4. **Immer Quelle und Alter** bei Angaben: „laut Redaktion, geprüft vor 2 Stunden“.
5. **Ehrlich bleiben.** „Weiß ich nicht“ ist ein guter Satz.

| Statt | Besser |
| --- | --- |
| Barrierefreiheitsdaten | Angaben, ob es stufenlos geht |
| Hochbahnsteig | Bahnsteig, auf dem man ebenerdig einsteigt |
| Plan B | ein anderer Weg |
| Profil | dein Bedarf (Rollstuhl, Rollator, …) |
| Echtzeit | jetzt gerade |
| Redaktion | Menschen, die es vor Ort angesehen haben |
| Quelle | woher wir es wissen |
