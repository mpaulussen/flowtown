# Flowtown: Unabhängige Analyse für die Preisvergabe

Stand: 24.11.2026. Rolle: Juror mit Schwerpunkt Apps, Navigation, Stadtmobilität und Barrierefreiheit, der das Projekt zum ersten Mal sieht.

Grundlage: Website (Startseite und 13 Unterseiten), rund ein Dutzend verschiedene Screenshots der App (Version 0.112.10), Code-Umfang, `MARKTANALYSE.md`, `PRUEFERGEBNIS-2026-11-10.md` (vier Prüfläufe mit 287 Fragen), `TODO.md`, `FAKTEN.md`, `datenschutz.html`.

Nicht geprüft: die App selbst auf einem Gerät, die Sprachfunktion im echten Gebrauch, die App mit Screenreader, die Rechtstexte durch eine Fachperson. Wo ich urteile, ohne es selbst gesehen zu haben, steht das dabei.

---

## Kurzurteil

**Flowtown hat die richtige Idee und den ehrlichsten Umgang mit KI, den ich in dieser Kategorie gesehen habe. Als Produkt ist es aber noch drei Produkte gleichzeitig, und keines davon ist fertig.**

Die Haltung „belegt statt geraten“ ist kein Werbesatz, sondern messbar umgesetzt: ein Prüfkatalog mit 287 Fragen, vier dokumentierte Läufe, die falschen Antworten von 37 auf 7 gesenkt. Das ist selten und verdient Anerkennung.

Gleichzeitig ist die App überladen. Ampel-Wartezeiten, ÖPNV-Auskunft, Barrierefreiheit, Autoverkehr, Redaktion und Sprachassistenz stehen gleichberechtigt nebeneinander. Es gibt keinen einzigen Test mit Menschen aus der Zielgruppe. Und die Website verspricht eine Klarheit, die die App noch nicht einlöst.

**Empfehlung:** Nominierung ja. Hauptpreis noch nicht. Ein Sonderpreis für verantwortungsvolle KI oder ein Förderpreis mit der Auflage eines Nutzertests wäre angemessen.

---

## Bewertung nach Kriterien

Skala 1 (schwach) bis 5 (herausragend).

| Kriterium | Punkte | Kurzbegründung |
| --- | :---: | --- |
| Problem und Relevanz | **5** | Barrierefreie Mobilität ist ein echtes, ungelöstes Problem. Die Lücke ist gut belegt. |
| Innovation und Alleinstellung | **4** | Belegte KI-Antworten mit Quelle und Stand sind neu. Sprache allein ist es nicht mehr (Google Gemini). |
| Verlässlichkeit der Inhalte | **4** | Vorbildlich gemessen. 7 von 287 Antworten sind noch falsch, und die Antworten schwanken. |
| Produkt und UX | **2** | Zu viele Einstiege, zu viele Begriffe, überdeckende Knöpfe. Kein Nutzertest. |
| Barrierefreiheit der App selbst | **3** | Gute Ansätze (große Knöpfe, Ansagen nach ITU-T F.921). Ohne Screenreader- und Nutzertest nicht belegbar. |
| Gestaltung | **3** | Website modern und klar. App wirkt solide, aber uneinheitlich, und App und Website sehen nicht aus wie ein Produkt. |
| Funktionsumfang und Fokus | **2** | Sehr viel Funktion, zu wenig Fokus. Die Kernzielgruppe geht unter. |
| Technik und Betrieb | **3** | Funktioniert, aber zwei sehr große Einzeldateien und ein einziger Betreiber. |
| Markt und Wettbewerb | **3** | Ehrlich analysiert. Google und DB Info sind ernste Konkurrenz. |
| Geschäftsmodell und Skalierung | **1** | Keins beschrieben. Die Skalierung über Bielefeld hinaus hängt an einer Redaktion. |
| Team und Umsetzung | **3** | Beeindruckende Geschwindigkeit und Dokumentation. Sehr hohe Abhängigkeit von einer Person. |
| Datenschutz und Recht | **3** | Datenschutzerklärung ausführlich und ehrlich. Rechtstexte sind Entwürfe und trotzdem öffentlich. |

**Gesamt: 2,9 von 5.** Stark in Haltung und Methode, schwach in Fokus, UX-Nachweis und Geschäftsmodell.

---

## Was überzeugt

### 1. Ehrlichkeit als Produktprinzip
„Unbekannt ist nie passt.“ Jede Angabe trägt Quelle, Vertrauensstufe und Ablaufdatum (`FAKTEN.md`). Fehlt eine Angabe, sagt die App „keine Angabe“ und erfindet nichts. In der App ist das sichtbar: „keine Hindernisse bekannt“ statt „barrierefrei“, „Stufen“ mit rotem Kreuz, „Aufzug“ mit Haken. Das ist genau die Lehre aus der Forschung zu Be My AI und Seeing AI (Halluzinationsraten über 30 %).

### 2. Messen statt behaupten
Ein Prüfkatalog mit 287 Fragen, vier dokumentierte Läufe, jede falsche Antwort mit Ursache benannt (`PRUEFERGEBNIS-2026-11-10.md`). Die Entwicklung von 37 falschen auf 7 falsche Antworten ist nachvollziehbar. Besonders stark: Das Team schreibt selbst, dass Regeln im KI-Prompt unzuverlässig sind und nur Regeln im Server greifen. Diese Einsicht fehlt vielen KI-Startups.

### 3. KI formuliert nur, Fakten kommen aus Werkzeugen
Fahrplan, Aufzüge, Adressen und Notfallantworten kommen aus Daten oder festen Tabellen. Die KI (Mistral, EU-Rechenzentren) bekommt keine Koordinaten. Das ist datenschutzfreundlich und fachlich richtig.

### 4. Profil-Logik mit konkretem Nutzen
„Rad: nicht für dein Profil“, „Kein Hochbahnsteig: Teutoburger Straße, stufenlos geht es an Mozartstraße/Synagoge, etwa 350 m“. Das ist der beste Moment in der App: konkret, lokal, mit Alternative. Davon braucht es mehr.

### 5. Orientierung an Normen
Ansagen mit Hinweiston, Treppenwarnung sechs Meter vorher, Wiederholen per Sprachbefehl. Die Navigation orientiert sich an ITU-T F.921. Das ist fachlich ernsthaft.

### 6. Dokumentation
Die Unterlagen sind außergewöhnlich gründlich: Einführung, Datenmodell, Redaktionsabläufe, Marktanalyse mit Unsicherheiten. Wer übernimmt, findet sich zurecht.

---

## Was unbedingt besser werden muss

### 1. Fokus: drei Produkte in einer App (kritisch)
Ich sehe drei Produkte:
- einen **Ampel-Logger** für Autofahrende („Dein Flow“, Wartezeit, Halte, Spritkosten in den Einstellungen),
- eine **barrierefreie ÖPNV-Auskunft** mit KI,
- ein **Erfassungswerkzeug** für die Redaktion.

Das spiegelt sich überall. Das App-Manifest beschreibt noch „Die grüne Welle beginnt bei dir. Weniger Stopps, weniger Sprit“. Die README beschreibt den Ampel-Prototyp. Die Website sagt „Dein Weg, mit Auto, Öffis, Fahrrad und barrierefrei“. Die Fahrt-Ansicht zeigt einem Menschen im Rollstuhl groß „0 km/h“ und „Ampeln ohne Halt“.

**Was ich erwarte:** Eine Kernzielgruppe und einen Kernablauf. Mein Vorschlag: Menschen mit Mobilitäts- oder Sehbehinderung im ÖPNV in Bielefeld. Alles andere wird ausgeblendet oder kommt später. Ampel-Logger und Auto-Ablauf sind eigene Produkte oder Zusatzfunktionen, nicht der Kern.

### 2. Kein einziger Test mit der Zielgruppe (kritisch)
`TODO.md` E2 „Test mit Betroffenen in der echten Umgebung“ ist offen. Die Marktanalyse sagt es selbst: „kein Nutzertest mit der Zielgruppe“. Für ein Produkt, das blinden Menschen und Rollstuhlnutzenden den Weg zeigt, ist das der größte Mangel. Ein Prüfkatalog mit Testfragen ersetzt keinen Menschen, der mit Langstock an der Haltestelle steht.

**Was ich erwarte:** Fünf bis acht Menschen aus der Zielgruppe, drei echte Aufgaben, dokumentiert. Das kostet zwei Wochen und ist die Voraussetzung für jeden Preis in dieser Kategorie.

### 3. Bedienung: zu viele Wege, zu viele Begriffe
Aus den Screenshots:
- **Fünf oder mehr Sprach-Einstiege:** Sprachknopf auf „Heute“, Mikrofon im Suchfeld, schwebender Mikrofon-Knopf, schwebender Telefon-Knopf, Mikrofone in Tipps und Verlauf.
- **Schwebende Knöpfe verdecken Inhalt:** Der grüne Telefon-Knopf liegt über der Fahrzeit „16 min“ beim Rad, über Abfahrten und über Texten. Für Menschen mit Sehbehinderung ist verdeckter Text ein echtes Hindernis.
- **Begriffe vermischt:** Weg, Fahrt, Ziel, Wege, Meine Wege, Dein Weg heute, Fahrt starten mit Ziel, Ohne Ziel aufzeichnen.
- **Redaktion in der Nutzer-App:** „Hinweis aufnehmen (Standort und Diktat · Redaktion)“ steht ganz oben in den Einstellungen für alle, obwohl es nur für Mitwirkende mit Code gedacht ist.
- **Rohdaten sichtbar:** „K1 bei Bielefeld (zaeh)“ mit „ae“ statt „ä“. Kleinigkeit, aber sie zeigt, dass Daten ungefiltert durchgereicht werden.
- **Versions-Etikett im Kopf:** „Prototyp 0.112.10“ nimmt in jeder Ansicht Platz weg.

### 4. Verlässlichkeit: 7 von 287 sind in diesem Feld zu viel
2,4 % falsche Antworten klingen wenig. Aber die Fehler sind von der gefährlichen Art: eine falsche Fahrtrichtung (K032), eine falsche Abfahrtszeit bei einem Termin (K022), die Staatsanwaltschaft als Polizeiwache (K215), eine Aussage ohne Quelle zum Feiertagsfahrplan (K034). Dazu kommt: **Die Antworten schwanken von Lauf zu Lauf**, das schreibt das Team selbst.

**Was ich erwarte:** Für Sicherheit, Zeit und Richtung keine Antwort der KI ohne Serverprüfung. Eine Testreihe, die vor jeder Veröffentlichung automatisch läuft. Eine öffentliche Fehlerquote auf der Website, das wäre glaubwürdiger als jedes Versprechen.

### 5. Website und App sind zwei Marken
Die Website ist blau und orange, modern und klar. Die App ist grün und wirkt anders. Wer von der Website in die App wechselt, erkennt das Produkt nicht sofort wieder. Die Website verspricht einen Ablauf in vier Schritten, die App hat keinen erkennbaren Ablauf, sondern viele gleichwertige Einstiege.

### 6. Rechtliches: Entwürfe sind live
Impressum, Nutzungsbedingungen und Barrierefreiheitserklärung sind öffentlich, aber als „Entwurf, rechtlich prüfen lassen“ markiert. Für ein Produkt, das Menschen über Wege und Notfälle informiert, ist das ein Haftungsrisiko. Die Seite „Aktuelles“ ist leer und trotzdem verlinkt. Das wirkt unfertig.

### 7. Kein Geschäftsmodell
Ich habe kein Erlösmodell gefunden. Kostenlos für Nutzende ist richtig. Aber wer zahlt? Ansätze gibt es (Lückenbericht für Kommunen, „Barriere-Atlas von unten“), aber nichts ist beziffert. Für eine Preisvergabe brauche ich mindestens: Wer ist Kunde, was kostet es, was ist der nächste Vertrag.

### 8. Skalierung hängt an einer Redaktion mit einer Person
„Zunächst ein Redakteur.“ Die wichtigste Quelle für Bielefeld ist die Prüfung vor Ort. Das skaliert nicht auf eine zweite Stadt, ohne dass sich das Modell ändert. Dazu kommt: Die DB-Schnittstelle für Echtzeit wird Mitte 2027 abgeschaltet, der Nachfolger ist nicht umgesetzt.

### 9. Technik: Wartbarkeit
Die App steckt in einer Datei mit über 7.500 Zeilen (rund 550 KB), der Server in einer mit über 5.000 Zeilen. Kein Build-Schritt ist eine bewusste Entscheidung und hat Vorteile. Aber für ein Team ab zwei Personen wird das zum Engpass. Automatisierte Tests für die App habe ich nicht gesehen.

### 10. Datenschutz-Versprechen genauer formulieren
Die Website sagt „Keine Cookies“. Für die Website stimmt das. Die App speichert Fahrten und Einstellungen im Browser. Das ist kein Cookie, wirkt für Laien aber ähnlich. Die Datenschutzerklärung erklärt das sauber, die Startseite verkürzt es.

---

## Risiken für die Jury

| Risiko | Einschätzung |
| --- | --- |
| Falsche Auskunft führt zu Gefahr | mittel. Ehrliche Grundhaltung, aber 7 falsche Antworten und schwankende Ergebnisse |
| Große Anbieter ziehen nach | hoch. Google Gemini-Navigation, DB Info mit Aufzugsstatus |
| Abhängigkeit von einer Person | hoch. Entwicklung, Redaktion und Betrieb in einer Hand |
| Datenquelle fällt weg | mittel. DB Timetables endet 2027 |
| Rechtliche Angriffsfläche | mittel. Entwürfe öffentlich |

---

## Was ich in 90 Tagen sehen will

1. **Ein Satz Positionierung.** Zum Beispiel: „Die ÖPNV-Auskunft für Bielefeld, die nur sagt, was belegt ist, mit Barrierefreiheit vor Ort.“ Ampel-Logger raus aus dem Kern.
2. **Nutzertest mit acht Menschen** aus der Zielgruppe, mit Video oder Protokoll. Dazu die drei größten Probleme und was geändert wurde.
3. **Startbildschirm mit einer Hauptaktion**, ein Sprach-Einstieg, keine verdeckenden Knöpfe, Redaktion aus der Nutzer-App.
4. **Null falsche Antworten** bei Zeit, Richtung und Sicherheit im Prüfkatalog, abgesichert durch den Server.
5. **Direktvergleich mit Google Maps** bei denselben 40 Fragen, wie in der Marktanalyse schon vorgeschlagen. Das wäre der stärkste Beleg für den Unterschied.
6. **Ein unterschriebener Pilotpartner**, zum Beispiel moBiel oder die Stadt, mit Daten oder Geld.
7. **Geprüfte Rechtstexte** oder die Entwürfe vom Netz nehmen.

---

## Abschließende Bewertung

Flowtown ist das seltene Projekt, bei dem ich der Methode mehr traue als der Oberfläche. Das ist gut für die Zukunft und schlecht für heute. Die Idee „belegt statt geraten“ ist stark genug, um ein Produkt zu tragen. Aber das Produkt muss sich entscheiden, für wen es da ist, und es muss diesen Menschen begegnen.

**Votum:** Nominierung. Kein Hauptpreis in dieser Runde. Sonderpreis „Verantwortungsvolle KI“ oder Förderpreis mit der Auflage: Nutzertest und Fokus bis zur nächsten Runde.
