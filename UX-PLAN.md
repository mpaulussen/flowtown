# UX-Plan für die Flowtown-App

Stand: 24.11.2026. Grundlage: `UX-NOTIZEN.md` und `JURY-ANALYSE.md`. Ziel: eine App, die eine Kernzielgruppe in einem klaren Ablauf führt.

**Kernzielgruppe (entschieden 25.11.2026, E1):** Menschen mit Behinderung, ältere Menschen und Menschen, die Assistenz brauchen, in Stadt, Öffentlichem Nahverkehr und beim Auto (Behindertenparkplätze), mit Orten, die Barrierefreiheitshinweise haben.
**Kernablauf:** Ziel sagen → Weg wählen → unterwegs begleitet werden → Angabe bestätigen oder melden.

Aufwand: **S** bis ein Tag, **M** bis drei Tage, **L** eine Woche oder mehr.

---

## Phase 0: Entscheidungen (vor allem anderen)

- [x] **E1 Kernzielgruppe festlegen.** Entschieden am 25.11.2026: Mobilität für Menschen mit Behinderung, ältere Menschen und Menschen, die Assistenz brauchen. Unterwegs in der Stadt, im Öffentlichen Nahverkehr und beim Auto (Behindertenparkplätze), mit Orten, die Barrierefreiheitshinweise haben. Alles andere richtet sich danach.
- [x] **E2 Rolle des Ampel-Loggers klären.** Entschieden am 25.11.2026: Ampel-Logger vorerst verstecken. Die App erfasst und navigiert nur Straßen, Navigation und Öffentlichen Nahverkehr. Ergänzt am 27.11.2026: Im Modus „Standard“ bleibt ein Ampel-Schalter erhalten (siehe K9). Die drei Schritte unten gelten dann für den Modus „Einfach“ und für den Standardwert des Schalters. Umsetzung in drei Schritten, noch offen: (1) Anzeige ausblenden (Karte, Fahrt, Mehr, Profil), (2) Haltestellen an Ampeln nicht mehr aufzeichnen, (3) keine Ampeldaten mehr in `/api/pilot/upload` und `/api/wir` senden. Mit einem Schalter in `app/app.js`, damit es ohne Neuentwicklung zurückgeholt werden kann.
- [ ] **E3 Begriffe festlegen.** Vorschlag: **Ziel** = wohin, **Weg** = geplante Strecke, **Fahrt** = Aufzeichnung unterwegs. Liste in `UX-NOTIZEN.md` ergänzen.
- [x] **E4 Eine Marke.** Entschieden am 27.11.2026: Die Website übernimmt Layout und Bedienung der App. Blau und Orange bleiben als Akzente, wenige zusätzliche Farbnuancen. Umsetzung als eigener Schritt (K8).

**Fertig, wenn:** die vier Entscheidungen schriftlich im Repo stehen.

---

## Phase 1: Schnelle Korrekturen (1 Woche, ohne Nutzertest möglich)

- [x] **U1 Manifest und Beschreibung aktualisieren** (S). `app/manifest.webmanifest` und `app/index.html` Zeile 7 sagen noch „Die grüne Welle … weniger Sprit“.
  *Fertig, wenn:* beim Installieren der App die aktuelle Beschreibung erscheint.
- [x] **U2 Versions-Etikett aus dem Kopf entfernen** (S). `<span class="proto">Prototyp</span>` (Zeile 72) und die Versionsnummer gehören unter „Mehr“.
  *Fertig, wenn:* der Kopf nur Logo und höchstens zwei Knöpfe zeigt.
- [x] **U3 Schwebender Knopf verdeckt keinen Inhalt** (S). `#fab-mic` liegt über Fahrzeiten und Texten. Unteren Abstand jeder Ansicht um die Höhe des Knopfes vergrößern.
  *Fertig, wenn:* auf keinem Screen Text oder Zahlen unter dem Knopf liegen (Prüfung mit 320 px und 200 % Schrift).
- [x] **U4 Redaktion aus der Nutzer-App** (S). Einträge „Hinweis aufnehmen“ in `app/index.html` (Zeile 372 und 408) nur zeigen, wenn ein Redaktionscode hinterlegt ist.
  *Fertig, wenn:* Nutzende ohne Code keinen Redaktions-Eintrag sehen.
- [x] **U5 Rohdaten lesbar machen** (S). Stand: App und Server geben Verkehrsarten als Wort aus (`LAGE_WORT` in `server/flowtown-server.mjs`). „K1 bei Bielefeld (zaeh)“ kommt aus den Verkehrsdaten. Beim Server in Klartext übersetzen („stockender Verkehr“).
  *Fertig, wenn:* keine Kürzel und kein „ae/oe/ue“ in der Oberfläche erscheinen.
- [x] **U6 Begriffe vereinheitlichen** (M). Stand: Begriffe nach E3 festgelegt (Ziel, Weg, Fahrt), Glossar unter „Mehr“. Die bestehenden Texte passten bereits, es waren keine Umbenennungen nötig. Nach E3 alle Texte in `app/index.html` und `app/app.js` durchgehen.
  *Fertig, wenn:* jeder Begriff nur in einer Bedeutung vorkommt.
- [x] **U7 Leere Zustände mit Handlung** (M). Verlauf ohne Fahrten: Knopf „Testfahrt ansehen“. Karte ohne Verbindung: Liste der Angaben in der Nähe statt nur Fehlermeldung.
  *Fertig, wenn:* jeder leere Zustand einen nächsten Schritt anbietet.

---

## Stand Phase 1 (25.11.2026)

Umgesetzt: U1 bis U5 und U7 vollständig. U6 erledigt mit E3 (Begriffe). Version 0.113.0 in `app/app.js` und `app/sw.js`. Geprüft: Syntax, Browser ohne Seitenfehler, Versionsanzeige in Mehr, keine Redaktions-Links in der Nutzer-App, Knopf „Testfahrt ansehen“ im leeren Verlauf. Die Konsolenfehler der Sandbox stammen aus dem fehlenden Server-Zugang.

## Phase 2: Nutzertest (2 Wochen, Voraussetzung für Phase 3)

- [ ] **T1 Teilnehmende finden** (M). Sechs bis acht Personen: zwei mit Rollstuhl oder Rollator, zwei blind oder sehbehindert, eine hörbehindert, ein bis zwei ältere Menschen ohne Hilfsmittel. Zum Beispiel über Bethel.
- [ ] **T2 Aufgaben festlegen** (S):
  1. Finde heraus, wie du zum Hauptbahnhof kommst.
  2. Finde einen Weg ohne Stufen.
  3. Starte eine Fahrt und beende sie.
  4. Melde eine Angabe, die nicht stimmt.
  5. Stelle eine Frage per Sprache.
- [ ] **T3 Messgrößen** (S): Aufgabe geschafft ja/nein, Zeit, Zahl der Hilfen, Zufriedenheit (SUS-Fragebogen), wörtliche Zitate.
- [ ] **T4 Screenreader-Prüfung** (M). Kernablauf mit VoiceOver (iPhone) und TalkBack (Android). Jeder Knopf hat einen verständlichen Namen, die Reihenfolge stimmt.
- [ ] **T5 Auswertung** (S). Die fünf größten Probleme, sortiert nach Häufigkeit und Schwere, als Datei im Repo.

**Fertig, wenn:** die Auswertung im Repo liegt und Phase 3 danach angepasst ist.

---

## Phase 3: Kernablauf umbauen (3 bis 4 Wochen)

- [ ] **K1 Startbildschirm mit einer Hauptaktion** (M). Oben „Wohin?“ mit Mikrofon im Feld. Darunter „Ohne Ziel aufzeichnen“ als zweite Option. Hinweise, Karten und Home-Bildschirm-Tipp weiter unten.
  *Fertig, wenn:* im ersten sichtbaren Bereich nur eine Frage und höchstens zwei Knöpfe stehen.
- [ ] **K2 Ein Sprach-Einstieg** (M). Ein fester Ort für Sprache. Mikrofone in Tipps und Verlauf entfernen, `#fab-mic` nur während einer Fahrt oder als einziger Einstieg.
  *Fertig, wenn:* es pro Ansicht höchstens einen Mikrofon-Knopf gibt.
- [ ] **K3 Tab-Leiste mit vier Punkten** (M). Heute, Karte, Tipps, Mehr. Der Verlauf erscheint als Karte in „Heute“, sobald Fahrten vorhanden sind.
- [ ] **K4 Art der Einschränkung beim ersten Start** (M). Entschieden am 27.11.2026, ersetzt die frühere Fassung („Profil erst bei Bedarf“). Beim ersten Start fragt die App nach der Art der Einschränkung oder „Keine“. Diese Angabe steuert den Rest: Mit Einschränkung ist der Modus „Einfach“ voreingestellt, ohne Einschränkung „Standard“. Umschalten jederzeit unter „Mehr“. Die Angabe ist freiwillig und überspringbar (dann „Standard“). Anforderungen: nur die Art, nie Name oder Adresse; Speicherung nur auf dem Gerät; an den Server nur der Typ, den die Antworten brauchen.
  *Auswahl (Mehrfachauswahl erlaubt, „Einfach“ gilt, sobald eine Option gewählt ist):*
  1. Ich fahre mit dem Rollstuhl (Rollstuhl)
  2. Ich gehe mit Rollator oder Gehhilfe (Rollator)
  3. Ich sehe nicht gut oder gar nicht (Sehen)
  4. Ich höre nicht gut oder gar nicht (Hören)
  5. Ich brauche einfache Sprache oder mehr Zeit zum Lesen (Lernen)
  6. Ich brauche Ruhe und wenig Reize (Ruhe)
  7. Ich brauche Begleitung oder Hilfe beim Ein- und Aussteigen (Begleitung)
  8. Ich bin älter und brauche etwas mehr Unterstützung (Ältere)
  9. Keine davon (Modus „Standard“)
  10. Etwas anderes (Freitext, wird nicht gespeichert)
- [ ] **K5 Fahrt-Ansicht nach Verkehrsmittel** (M). Bus, Bahn, zu Fuß: nächster Halt, Hinweise, großer Knopf „Fahrt beenden“. Keine km/h-Anzeige. Auto: Ampeln und Wartezeit.
- [ ] **K6 Einheitliche Zeichen für Angaben** (S). ✓ vorhanden, ✗ nicht vorhanden, ? keine Angabe. Immer mit Text, nie nur Farbe oder Symbol. Eine kurze Erklärung beim ersten Auftreten.
- [ ] **K7 Kürzere Texte** (S). Erklärungen in Formularen auf eine Zeile kürzen, Details per Link.
- [ ] **K8 Eine Marke** (L). Nach E4 die Farben und Formen in `app/style.css` angleichen.
- [ ] **K9 Standard-Modus ist der heutige Funktionsumfang** (S). Entschieden am 27.11.2026: Die App hat heute schon den vollen Funktionsumfang (Karte, Routen, Abfahrten, Verlauf, Fahrzeiten für Bus, Bahn, Auto, Rad und zu Fuß, Straßen und Verkehrslage). Dieser Stand ist „Standard“. Neu zu bauen ist nur der Schalter. Der Ampel-Schalter bleibt im Modus „Standard“ erhalten (Ein/Aus unter „Mehr“), Standardwert: aus (bestätigt am 27.11.2026). Im Modus „Einfach“ gibt es keinen Ampel-Schalter.
- [ ] **K10 Modus „Einfach“ als Reduktion** (M). Der Modus zeigt nur die Funktionen aus K5 bis K7 und dem Kernablauf: Sprache, Ziel, Weg, Abfahrten, Angabe melden, Hilfe. Alles andere ist ausgeblendet, nicht gelöscht. Die Quellen- und Stand-Angaben bleiben in beiden Modi gleich.
  *Vorschlag Liste (zu bestätigen):*
  - **Bleibt sichtbar:** Startfrage „Wohin?“ mit Sprache, Ziel und Weg, Abfahrten in der Nähe, Begleitung unterwegs (Fahrt), Angabe melden, Hilfe, Angaben zur Quelle, die Karte mit den Hinweisen zur Barrierefreiheit und die Tipps.
  - **Ausgeblendet:** Verlauf, Auswertung und Diagramme, Ampel-Schalter (es gibt ihn im Modus Einfach nicht), Profil-Details, Redaktion, Gespräch-Historie über mehrere Themen, Einstellungen außer Modus und Sprache.

---

## Phase 4: Vertrauen sichtbar machen (2 Wochen)

- [ ] **V1 Quelle und Stand in gleicher Form** (S). Jede Antwort und jede Angabe zeigt Quelle und Stand an derselben Stelle, in derselben Schrift.
- [ ] **V2 Rückmeldung abschließen** (S). Nach „Stimmt nicht“ zeigt die App, was passiert: „Die Redaktion prüft das. Du kannst die App normal weiter nutzen.“
- [ ] **V3 Kritische Antworten absichern** (M). Zeit, Richtung und Sicherheit nur aus Serverdaten, nicht aus der KI allein (siehe `PRUEFERGEBNIS-2026-11-10.md`, die sieben falschen Antworten).
  *Fertig, wenn:* der Prüfkatalog in diesen Bereichen null falsche Antworten zeigt, in zwei Läufen nacheinander.

---

## Phase 5: Messen (laufend)

- [ ] **M1 Zweiter Nutzertest** mit denselben Aufgaben nach Phase 3.
  Ziele: mindestens 80 % der Aufgaben ohne Hilfe geschafft, SUS-Wert mindestens 70, keine Aufgabe mit mehr als zwei Hilfen.
- [ ] **M2 Prüfkatalog vor jeder Veröffentlichung** automatisch laufen lassen. Neue falsche Antworten stoppen die Veröffentlichung.
- [ ] **M3 Fehlerquote auf der Website** veröffentlichen (Seite „Quellen“), sobald sie stabil ist.

---

## Nicht jetzt

- Neue Funktionen (Telefon-Assistenz, weitere Städte, Morgenwarnung), bis Phase 3 abgeschlossen ist.
- Neue Datenquellen, außer sie beheben ein Problem aus dem Nutzertest.

## Reihenfolge auf einen Blick

| Woche | Inhalt |
| --- | --- |
| 1 | Phase 0 Entscheidungen, Phase 1 schnelle Korrekturen |
| 2 bis 3 | Phase 2 Nutzertest |
| 4 bis 7 | Phase 3 Kernablauf |
| 8 bis 9 | Phase 4 Vertrauen |
| 10 | Phase 5 zweiter Test |

## Entscheidungen zum Testlauf (25.11.2026)

- **Umfang:** vollständiger Lauf, alle 287 Fragen.
- **Bewertung:** jede Erwartung wird mit Ja oder Nein beantwortet.
- **Ziel:** null falsche Antworten (gezählt werden nur die falschen).
- **Prüfung:** zunächst nur durch den Projektverantwortlichen. Eine unabhängige zweite Prüfung kommt später.
- **Wiederholung:** vor jeder Veröffentlichung, wie in M2 festgelegt.
