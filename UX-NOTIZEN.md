# UX-Notizen zur App

Stand: 24.11.2026. Grundlage: Screenshots der App (Version 0.112.10) und der Startseite. Das ist keine Nutzerprüfung. Die Punkte sind Vorschläge, die mit Menschen aus der Zielgruppe geprüft werden sollten (siehe `TODO.md`, Punkt E2).

## Priorität

1. **Eine Hauptaktion pro Bildschirm.** Der Startbildschirm „Heute“ hat acht konkurrierende Elemente: Sprachknopf, Suchfeld, „Ohne Ziel aufzeichnen“, Auto-Umschalter, „Weg planen“, Hinweis zum Home-Bildschirm, „Dein Weg heute“ und die Karte. Vorschlag: „Wohin?“ mit Mikrofon oben, „Ohne Ziel aufzeichnen“ als zweite Option. Der Rest weiter unten oder im Menü.

2. **Ein Mikrofon-Einstieg.** Es gibt mindestens fünf Wege zu sprechen: Sprachknopf auf dem Startbildschirm, Mikrofon im Suchfeld, grüner Mikrofon-Knopf unten rechts, Mikrofon im Verlauf, Mikrofon in den Tipps. Vorschlag: ein fester Ort, zum Beispiel in der Tab-Leiste. Die schwebenden Knöpfe entfallen.

3. **Einheitliche Begriffe.** Heute: „Weg“, „Fahrt“, „Ziel“, „Wege“, „Meine Wege“, „Dein Weg heute“, „Bahnsteige (Probe)“. Vorschlag: **Weg** = geplante Strecke, **Fahrt** = Aufzeichnung, **Ziel** = Zielort. Ein Glossar in „Mehr“.

4. **Redaktion aus der Nutzer-App herausnehmen.** „Hinweis aufnehmen (Standort und Diktat · Redaktion)“ steht in den Einstellungen für alle. Die Erfassung ist für Mitwirkende mit Einladungscode gedacht und hat schon eine eigene App (`redaktion/`). Vorschlag: aus der Nutzer-App entfernen oder nur mit Code zeigen.

5. **Profil erst fragen, wenn es gebraucht wird.** Die Einführung fragt Profil, Verkehrsmittel, Erlaubnisse und Pilot-Optionen auf einmal. Vorschlag: mit „Ohne Profil starten“ beginnen. Das Profil fragen, sobald eine Angabe davon abhängt.

6. **Leere Zustände mit einer Aktion.** Der Verlauf zeigt bei fehlenden Fahrten nur einen Hinweistext. Die Karte zeigt ohne Verbindung eine Fehlermeldung. Vorschlag: „Testfahrt ansehen“ bzw. eine Liste der Angaben in der Nähe.

7. **Fahrt-Ansicht ruhiger.** Während der Fahrt stehen vier Zahlen und ein Verkehrsmittel-Raster mit sechs Knöpfen auf dem Bildschirm. Vorschlag: nächster Halt, zwei Zahlen (Ampeln ohne Halt, Wartezeit), ein großer Knopf „Fahrt beenden“. Der Rest nach der Fahrt.

8. **Kürzere Erklärungen.** Längere Hinweise im Formular, zum Beispiel „Die Suche läuft über den Flowtown-Server und HERE“. Vorschlag: eine Zeile, Details per Link.

9. **Tab-Leiste mit vier Punkten.** Heute, Karte, Tipps, Mehr. Der Verlauf erscheint in „Heute“, sobald Fahrten vorhanden sind.

## Test vor Umsetzung

Fünf bis acht Menschen aus der Zielgruppe, jeweils mit eigenem Hilfsmittel. Drei Aufgaben:
- Ein Ziel finden und einen Weg anlegen.
- Eine Fahrt aufnehmen und beenden.
- Eine Angabe melden, die nicht stimmt.

Notiert wird, wo die Person zögert oder abbricht. Das sind die eigentlichen Probleme.

## Offen

- Ob Verlauf in „Heute“ oder in „Mehr“ besser ist.
- Ob die Sprachfunktion im Startbildschirm oder in der Tab-Leiste sitzen soll.
- Wie viel Erklärung neue Nutzende vertragen.
