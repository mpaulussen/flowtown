# Flowtown – Plan für eine Startseite

Stand: 24.11.2026. Status: **Plan, noch nicht umgesetzt.** Grundlage: Repo-Stand dieses Branches, besonders `EINFUEHRUNG.md`, `WAS-FLOWTOWN-KANN.md`, `FAKTEN.md`, `TODO.md`, `nutzung.html` und `datenschutz.html`.

---

## 1. Kurzantwort

Ja, die Startseite lässt sich mit dem vorhandenen Prototyp bauen. Die Technik bleibt gleich: reines HTML, CSS und JavaScript, kein Build-Schritt, Auslieferung über GitHub Pages (`.nojekyll` ist gesetzt).

Die wichtigste Entscheidung betrifft die **Adresse**: Heute ist die Root-Seite (`/`) schon die App (`index.html`). Eine Startseite im Root bedeutet, dass die App nach `/app/` umzieht. Dafür gibt es einen Weg, der installierte Handy-Apps nicht bricht (siehe Abschnitt 6).

---

## 2. Ziel und Zielgruppen

**Ziel der Startseite:** In zehn Sekunden verstehen, was Flowtown ist, warum man ihr trauen kann, und dann die App öffnen oder mitmachen.

| Zielgruppe | Was sie braucht |
|---|---|
| Menschen mit Mobilitätseinschränkung, Seh- oder Hörbehinderung, Bedarf an Ruhe oder einfacher Sprache (Bielefeld) | Klar, was die App kann. Wie sie mit „unbekannt“ umgeht. Wie man sie ohne Installation testet. |
| Angehörige, Reha-Fachkräfte, Orientierungs- und Mobilitätstrainer | Herkunft der Angaben, Datenschutz, Grenzen der App |
| Partner, Förderer, Stadt Bielefeld | Was es heute gibt, was geplant ist, wer dahintersteht |
| Mitwirkende (Erfassung vor Ort) | Wie man mitmacht und wer die Redaktion ist |

**Kernbotschaft** (zusammengeführt aus der Beschreibung in der Anfrage und dem Repo):

> **Barrieren unterwegs per Sprache abfragen. Fehlt eine Angabe, ergänzt man sie vor Ort.**

Zwei Zusätze aus dem Repo, die auf die Startseite gehören, weil sie Flowtown von anderen Apps unterscheiden:
- **Belegt statt geraten:** Eine Angabe wird nur gezeigt, wenn eine Quelle sie liefert. Jede Angabe nennt Herkunft und Stand.
- **„Unbekannt“ ist nie „passt“.**

Hinweis zur Positionierung: Die Beschreibung aus der Anfrage nennt Staus, Baustellen und Fahrpläne. Die Einführung stellt die **Barrierefreiheit** in den Mittelpunkt. Vorschlag: barrierefrei ist die Überschrift, Staus und Fahrpläne erscheinen als Teil von „Gerade jetzt“.

---

## 3. Stand-Check: was die Startseite zeigen darf

Eine Startseite darf nur versprechen, was heute funktioniert. Diese Liste stammt aus `WAS-FLOWTOWN-KANN.md`, `EINFUEHRUNG.md` und `TODO.md`.

| Funktion | Stand | Auf der Startseite? |
|---|---|---|
| Frage per Sprache oder Text (Assistenz, Server, KI-Modell Mistral) | heute | ja |
| Dein Weg: Ziel nennen, Verkehrsmittel vergleichen (zu Fuß, Rad, Auto, Bus, Bahn) | heute | ja |
| Gerade jetzt: Abfahrten, Störungen, Staus, Baustellen, Aufzüge, Ersatzweg | heute | ja |
| Barrierefreier Weg: Route meidet Stufen bei Rollstuhl oder Rollator | heute (B8) | ja |
| Profile (Rollstuhl, Rollator, Sehen, Hören, Lernen, Ruhe, andere) | heute | ja |
| Karte mit erfassten Barrieren | heute | ja |
| Belege mit Quelle und Stand, Rückmeldung „Stimmt / Stimmt nicht / Veraltet“ | heute | ja |
| Ansagen: Hinweiston, Warnung vor Treppen, Vorschau der Strecke | heute (B1–B6) | ja, als Liste |
| Dein Flow: Wartezeiten an Ampeln messen | im README beschrieben, in der Einführung nicht | **nein, vorerst** (siehe Entscheidung 5) |
| Aufzugsstatus DB Hauptbahnhof | heute (C7) | ja, mit Hinweis „Pilot“ |
| Aufzugsstatus moBiel | **bald** | nur als „bald“ |
| Morgenwarnung für feste Wege | **bald** | nur als „bald“ |
| Telefon-Assistenz, weitere Städte | **später** | nur als „später“, oder weglassen |
| Erfassung vor Ort per Diktat | heute, **nur für Mitwirkende** (Redaktions-App) | nicht als öffentliches Angebot |
| Native App | in Planung (Kampagnenphase) | nur als Ausblick |

**Verboten auf der Startseite** (weil nicht belegt oder im Repo ausdrücklich ausgeschlossen): freier Weg garantieren, Sicherheit zusagen, Notfall- oder Rettungsfunktion, Zahlen ohne Quelle (Nutzerzahlen, Städte, Fahrten).

---

## 4. Sitemap

```
/                         Startseite                    (NEU)
├── funktionen/           Was Flowtown kann            (NEU)
├── fuer-wen/             Für wen, mit Profilen        (NEU)
├── quellen/              Wie Flowtown belegt          (NEU, Kern des Vertrauens)
├── bielefeld/            Pilotgebiet und Stand        (NEU)
├── mitmachen/            Erfassen vor Ort, Kontakt    (NEU)
├── faq/                  Fragen und Antworten         (NEU)
├── ueber-uns/            barrierefrAI, Partner, Förderer (NEU)
├── kontakt/              Kontakt                      (NEU)
├── app/                  Die Web-App (bisherige index.html, umgezogen)
│   └── ?sprechen=1       Sprachmodus (Shortcut in der Manifest-Datei)
├── redaktion/            Redaktions-App (unverändert)
├── datenschutz/          Datenschutzerklärung         (vorhanden: datenschutz.html)
├── nutzung/              Nutzungsbedingungen          (vorhanden, Entwurf: nutzung.html)
├── impressum/            Impressum                    (FEHLT, neu)
├── barrierefreiheit/     Erklärung zur Barrierefreiheit (FEHLT, neu)
└── 404                   Seite nicht gefunden         (NEU)
```

Die Adressen mit Ordnern (`funktionen/index.html`) brauchen auf GitHub Pages keine Endung. Ordnerschreibweise, kleingeschrieben, ohne Umlaute.

### Navigation

**Kopfzeile** (auf dem Handy als Menü, Schaltfläche mit Text „Menü“):
- Funktionen · Für wen · Quellen · Bielefeld · Mitmachen
- Hervorgehobene Schaltfläche: **„App öffnen“** (führt nach `/app/`)

**Fußzeile:**
- Produkt: Funktionen, Quellen, Bielefeld, FAQ
- Mitmachen: Mitmachen, Kontakt
- Rechtliches: Impressum, Datenschutz, Nutzungsbedingungen, Barrierefreiheit
- Quellen: Hinweis auf OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL), Leaflet (BSD-2), DB (CC BY 4.0, sobald DB-Daten gezeigt werden)
- Stand: „Prototyp · kostenlos · barrierefrAI · Stand 2026“

---

## 5. Inhalte je Seite

Die Texte sind Entwürfe. Sie folgen den Schreibregeln aus `WAS-FLOWTOWN-KANN.md`: ein Gedanke pro Satz, erst das Beispiel, dann die Erklärung, höchstens drei Dinge nennen. Keine Fachbegriffe ohne Erklärung.

### 5.1 Startseite `/`

**a) Hero**
- Überschrift: *Barrieren unterwegs per Sprache abfragen.*
- Untertitel: *Flowtown sagt dir, was auf deinem Weg gilt, woher die Angabe kommt und wie alt sie ist. Fehlt etwas, sagt Flowtown das auch. Du kannst es vor Ort ergänzen.*
- Schaltflächen: **„App öffnen“** (primär) · **„So funktioniert es“** (sekundär)
- Hinweis unter den Schaltflächen: *Kostenlos. Kein Konto nötig. Prototyp, Bielefeld.*

**b) Beispielfragen** (als Chips, die Sprache zeigen)
- „Womit komme ich heute am besten zur Uni?“
- „Wann fährt die nächste Bahn ab Jahnplatz?“
- „Wo warte ich lange?“

**c) Drei Säulen** (Text aus `WAS-FLOWTOWN-KANN.md`)
1. **Dein Weg:** Sag, wohin du willst. Flowtown zeigt, womit du am besten ankommst.
2. **Gerade jetzt:** Abfahrten, Störungen, Staus, Baustellen, Aufzüge. Und ein anderer Weg, wenn etwas ausfällt.
3. **Dein Profil:** Wege, Ansagen und Antworten passen zu deinem Bedarf: Rollstuhl, Rollator, Sehen, Hören, einfache Sprache, Ruhe. Wer keins braucht, lässt es aus.

**d) „Belegt statt geraten“** (das Alleinstellungsmerkmal)
- Überschrift: *Flowtown sagt, woher es das weiß.*
- Beispiel-Darstellung einer Angabe (Muster):
  > Aufzug am Hauptbahnhof: in Betrieb
  > Quelle: Deutsche Bahn, Status laut Mobilithek, Stand heute
- Zweites Beispiel:
  > Eingang Seitenstraße: stufenlos
  > Quelle: Redaktion vor Ort, geprüft im Oktober
- Erklärung: *Fehlt eine Angabe, steht dort „keine Angabe“. Flowtown schreibt nie „passt“, wenn es das nicht belegen kann.*

**e) Warum vertrauen**
- *Unbekannt ist nie passt.*
- *Flowtown verspricht keinen freien Weg und ersetzt keinen Notruf (112).*
- *Die Verkehrsregeln und die Lage vor Ort gehen immer vor.*
- Link: „Wie Flowtown belegt“ → `/quellen/`

**f) Pilot Bielefeld** (Kurzfassung)
- *Im Pilot: Altstadt, Hauptbahnhof, Bethel, Universität. Mehr Städte sind geplant, nicht zugesagt.*
- Link: „Pilotgebiet und Stand“ → `/bielefeld/`

**g) Mitmachen** (kurz)
- *Du kennst einen Eingang, einen Aufzug oder eine Haltestelle, die Flowtown nicht richtig beschreibt? Melde sie oder hilf vor Ort mit.*
- Link: „Mitmachen“ → `/mitmachen/`

**h) Probieren ohne Installation**
- *Die App läuft im Browser. Zum Installieren: Browser-Menü, „Zum Startbildschirm hinzufügen“.*
- Link: „Anleitung“ → `/app/#installieren` (Abschnitt auf der App-Seite oder in der FAQ)

**i) Abschluss**
- Wiederholung „App öffnen“, Hinweis „Barrierefrei heißt für uns: Jede Angabe hat einen Stand und eine Quelle.“

### 5.2 Funktionen `/funktionen/`
- Intro: *Eine Assistenz, die Fragen beantwortet, und Kartenansichten für den Weg.*
- Abschnitte: Sprache und Text · Dein Weg (Wegsuche, barrierefreier Weg, Vorschau) · Gerade jetzt (Abfahrten, Störungen, Staus, Baustellen, Aufzüge, Ersatzweg) · Ansagen (Hinweiston, Treppen 6 m vorher, „weiter geradeaus“, Wiederholen) · Karte (erfasste Barrieren, Ebenen) · Rückmeldung (Stimmt / Stimmt nicht / Veraltet) · Rückweg (letzte Abfahrten)
- Jede Funktion: ein Beispiel, ein Satz Erklärung, Status („heute“ oder „bald“).
- Unten: Liste „Bald“ und „Später“ aus Abschnitt 3.

### 5.3 Für wen `/fuer-wen/`
- Eine Karte je Profil: *Rollstuhl · Rollator · Sehen (blind und sehbehindert) · Hören · Lernen und einfache Sprache · Ruhe · Andere Bedürfnisse.*
- Je Karte: was Flowtown dafür einstellt (Beispiele aus der Checkliste: Stufen, Aufzug, Spalt, Bodenindikatoren, Taster mit Tonsignal, Ruhe).
- Hinweis: *Profile sind Einstellungen. Du bleibst selbst entscheidend.*
- Verweis auf Angehörige und Fachkräfte mit Link zu `/quellen/` und `/kontakt/`.

### 5.4 Quellen `/quellen/` (wichtigste Vertrauensseite)
- Überschrift: *Woher Flowtown seine Angaben hat.*
- **Vertrauensstufen** (aus `FAKTEN.md`):
  1. Betreiber oder amtlich (zum Beispiel moBiel, DB, Stadt)
  2. Redaktion vor Ort geprüft
  3. mehrfach von Nutzenden bestätigt
  4. einmal gemeldet
  5. automatisch übernommen (OpenStreetMap, Fahrplan)
- **Frische** (vier Klassen): Aufzug und Rampe Minuten bis Stunden · Baustelle und Sperrung Tage · Eingang, Schwelle, Türbreite Monate · WC, Ampel mit Ton, Belag ungefähr ein Jahr. Danach gilt die Angabe als *nicht mehr geprüft* und wird nicht still weiterverwendet.
- **Datenquellen** als Tabelle: Fahrplan DELFI (GTFS), Echtzeit (moBiel, Bahn, bei Bedarf), OpenStreetMap, Stadt Bielefeld (Ampeln, Baustellen, Toiletten, Parkplätze), Bethel („Bielefeld barrierefrei erleben“), Redaktion vor Ort, Straßen.NRW (Verkehrslage). Pro Quelle: was sie liefert, wie oft sie aktualisiert wird, Lizenz.
- **KI-Hinweis:** *Die KI formuliert nur. Die Fakten kommen aus Werkzeugen und Angaben, nicht aus dem Modell.* Verweis auf Datenschutz.
- **Was nicht geprüft ist:** Die Richtwerte für Maße (Spalt bis 5 cm passt, 5 bis 7,5 cm beachten, darüber passt nicht) sind noch nicht gegen DIN 18040 und DIN 32984 geprüft. Das muss auf der Seite stehen, sonst ist es irreführend.
- **Nicht verwendet:** Keine Daten aus OD2Guide. Keine Fotos von Personen.

### 5.5 Bielefeld `/bielefeld/`
- Stand: Pilot. Gebiete: Altstadt, Hauptbahnhof, Bethel, Universität (Entscheidung vom 11.11.2026).
- Karte oder Liste der Pilotorte mit Stand („erfasst“, „in Arbeit“). Keine erfundenen Abdeckungsprozente.
- Beispiel: Haltestelle Prießallee als Steckbrief (Probe), mit Link zu einem öffentlichen Beispiel, wenn der Export für die Öffentlichkeit freigegeben ist.
- Was als Nächstes kommt: aus `TODO.md` in Klartext, ohne interne Nummern.

### 5.6 Mitmachen `/mitmachen/`
- Überschrift: *Hilf, Barrieren genau zu beschreiben.*
- Drei Wege:
  1. **Vor Ort erfassen (Mitwirkende):** Erfassung per Diktat mit Standort, mit Einladungscode. Hinweis: *Der Zugang ist für Mitwirkende der Redaktion. Den Code erhältst du über Kontakt.*
  2. **Melden:** „Stimmt nicht“ oder „Veraltet“ direkt in der App unter einer Antwort.
  3. **Fachlich begleiten:** Betroffene und Reha-Fachkräfte prüfen mit (aus `TODO.md`, Abschnitt E). Link zu Kontakt.
- Hinweis zur Vergütung und zu Fotos: *Keine Fotos von Personen. Keine Kennzeichen.* (Repo-Regel)
- Redaktions-App-Link: nur für Mitwirkende, nicht prominent.

### 5.7 FAQ `/faq/`
Mindestens diese Fragen, mit Antworten aus dem Repo:
- Was ist Flowtown? Ist es kostenlos? (ja, Prototyp)
- Brauche ich ein Konto? (nein, laut Start-Hinweis)
- Wo werden meine Daten gespeichert? (Browser auf dem Gerät, Export möglich: Mehr → Daten exportieren; Stand prüfen gegen `datenschutz.html`)
- Verlässt sich die App auf eine Sprach-KI? Welche? (Mistral, nur formulierend)
- Kann ich mich auf Flowtown verlassen? (Hilfsmittel, keine Anweisung; Lage vor Ort und Verkehrsregeln gehen vor)
- Was ist, wenn eine Angabe falsch ist? (Rückmeldung, Redaktion prüft)
- Funktioniert die App offline? (Nein, Stand prüfen. Redaktions-App hat eine Warteschlange ohne Netz, die Nutzer-App nicht belegt.)
- Warum funktioniert die Aufzeichnung nur, wenn die App offen ist? (Bei Web-Apps so; native App geplant)
- Wo bekomme ich Hilfe? (Kontakt, Notruf 112 bei Gefahr)
- Wie installiere ich die App? (Browser-Menü, Zum Startbildschirm hinzufügen)

### 5.8 Über uns `/ueber-uns/`
- barrierefrAI, Dr. Markus Paulußen, Bielefeld. Kurze Beschreibung, warum das Projekt entstanden ist.
- Partner und Förderer: nur nennen, was schriftlich zugesagt ist. Sonst Platzhalter: *Partner werden hier genannt, sobald sie zugestimmt haben.*
- Hintergrund für Förderer (aus `WAS-FLOWTOWN-KANN.md`): „Barriere-Atlas von unten“ als Idee, nicht als Zusage.

### 5.9 Kontakt `/kontakt/`
- E-Mail: info@barrierefrai.com (steht schon in `nutzung.html`).
- Hinweis zur Rückmeldung: Antwortzeit nicht versprechen, bis sie realistisch ist.
- Kein Kontaktformular im ersten Schritt (weniger Datenverarbeitung, keine Pflichtangaben).

### 5.10 Rechtliche Seiten
- **Impressum `/impressum/` (fehlt):** Anbieter, Anschrift und Kontakt. Die Angaben stehen schon in `nutzung.html`. Die Pflicht ergibt sich aus dem Digitale-Dienste-Gesetz. Rechtlich prüfen lassen.
- **Datenschutz `/datenschutz/`:** vorhandene Seite übernehmen. Vor Launch gegen die Realität prüfen: KI-Dienst, Standort, Server, Export, Service-Worker, keine Tracker.
- **Nutzungsbedingungen `/nutzung/`:** Entwurf vom 3.11.2026. Vor Veröffentlichung rechtlich prüfen lassen (steht so auf der Seite).
- **Barrierefreiheit `/barrierefreiheit/` (fehlt):** Erklärung mit Stand, bekannten Mängeln, Feedback-Weg und Schlichtungsstelle, sobald geprüft. Ob das Barrierefreiheitsstärkungsgesetz für diesen Dienst gilt, ist zu prüfen. Freiwillig sinnvoll in jedem Fall.

### 5.11 404
- Kurz: *Diese Seite gibt es nicht. Zur Startseite oder zur App.*

---

## 6. Technik

### Dateistruktur (Vorschlag)

```
/                          Startseite (index.html, neu)
/funktionen/index.html     ...
/fuer-wen/index.html
/quellen/index.html
/bielefeld/index.html
/mitmachen/index.html
/faq/index.html
/ueber-uns/index.html
/kontakt/index.html
/impressum/index.html
/datenschutz/index.html    (aus datenschutz.html)
/nutzung/index.html        (aus nutzung.html)
/barrierefreiheit/index.html
/404.html
/site.css                  eigene, schlanke Styles für die Startseite
/site.js                   nur Menü und Stand (kein Framework)
/assets/                   Schriften, Logo, Icons (aus vendor/fonts, icon.svg)
/app/                      die App (bisherige Dateien, umgezogen)
/redaktion/                unverändert
```

### Die App nach `/app/` verschieben
- Dateien in `app/`: `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icon*.png`, `icon.svg`.
- `vendor/` und `data/` bleiben im Root und werden aus `app/` mit `../` erreicht. Dafür prüfen: alle Pfade in `app.js`, `index.html` und `sw.js` (die Liste `SHELL` enthält `./` und relative Dateinamen).
- `sw.js` gilt nur im Ordner, in dem es liegt. Scope wird `/app/`. Bestehende Caches sind danach getrennt.
- Im Manifest: `start_url` und `scope` auf `./` in `app/` lassen.
- `app.js` Zeile 7330 (`./?sprechen=1`) bleibt richtig, wenn die App in `app/` liegt.
- **Redirect-Regel:** Ein Shortcut oder eine installierte Handy-App zeigt auf die Root-Adresse. Die Startseite erkennt den Standalone-Modus (`matchMedia('(display-mode: standalone)')`) und leitet dorthin nach `/app/` weiter. Der Shortcut `?sprechen=1` wird als `/app/?sprechen=1` weitergegeben.
- Test: Eine bereits installierte Version auf Android und iPhone öffnen, Sprachmodus testen, Offline-Verhalten prüfen.

### Startseite
- Mobile zuerst, Breite 360 bis 430 px, 16 px seitlicher Abstand, kein horizontales Scrollen.
- Schriften: Atkinson Hyperlegible (gut lesbar bei Sehbehinderung) und Bricolage Grotesque (Überschriften). Beide liegen schon lokal in `vendor/fonts/`, also **kein Google-Font-Aufruf** (Datenschutz).
- Farben: Die Token `--accent`, `--amber-tint`, `--muted` und `--line` aus `style.css` übernehmen. Hell und dunkel per `prefers-color-scheme`.
- Kein Framework, kein Build. Menü und Stand-Datum in `site.js`.
- Keine Tracker, keine externen Skripte. Falls Zählung gewünscht: nur ohne Cookies, in der Datenschutzerklärung erwähnt.
- Eine **Fassung in einfacher Sprache** der Startseite (Phase 2): Die Zielgruppe „Lernen und einfache Sprache“ ist im Profil vorgesehen.

### Barrierefreiheit der Seiten (Prüfkriterien)
- WCAG 2.2 AA als Mindestziel. Kontrast mindestens 4,5:1 im Text.
- Tastatur: alle Links und Schaltflächen erreichbar, sichtbarer Fokus.
- Bildschirmleser: `lang="de"`, Überschriften in Reihenfolge, Alternativtexte, sinnvolle Linktexte („App öffnen“, nicht „hier“).
- Text skalierbar bis 200 Prozent, keine Inhalte in Bildern.
- Animationen abschaltbar (`prefers-reduced-motion`).
- Prüfung mit axe und Lighthouse, Test mit einem Screenreader auf dem Handy.

### Qualitätssicherung
- Link-Prüfung vor jedem Launch (alle internen Adressen aus Abschnitt 4).
- Bildschirmfotos auf Handy-Breite (360 px) und Desktop, hell und dunkel.
- Test mit drei bis fünf Personen aus der Zielgruppe: Versteht man in 10 Sekunden, was Flowtown ist? (Wie im Prototyp-Plan vorgesehen.)

---

## 7. Vor dem Launch zu klären

| Punkt | Warum | Wer |
|---|---|---|
| Impressum | Fehlt im Repo. Pflicht für Websites in Deutschland. | Rechtsprüfung |
| Nutzungsbedingungen | Entwurf, steht auf der Seite „vor Veröffentlichung rechtlich prüfen“ | Rechtsprüfung |
| Datenschutz | Vor Launch auf den tatsächlichen Stand prüfen (KI-Dienst, Standort, Export) | Rechtsprüfung und Entwicklung |
| Barrierefreiheitserklärung | Pflicht prüfen. Freiwillig sinnvoll. | Rechtsprüfung |
| Quellenangaben | OpenStreetMap (ODbL) ist Pflicht. DB (CC BY 4.0) ist bei DB-Daten Pflicht. | Entwicklung |
| Fotos | Keine Fotos von Personen. Nur eigene Fotos mit Zustimmung. OD2Guide-Bilder nicht verwenden. | Redaktion |
| Zahlen und Versprechen | Keine Nutzerzahlen oder Städte ohne Quelle. Keine Aussage „sicher“ oder „frei“. | Redaktion |
| Richtwerte Maße | Noch nicht gegen DIN 18040 und DIN 32984 geprüft. Auf der Seite Hinweis. | Redaktion |

---

## 8. Umsetzung in Schritten

1. **Entscheidungen klären** (Abschnitt 9).
2. **Texte finalisieren:** Startseite, Funktionen, Quellen, Mitmachen, FAQ. Danach Abnahme durch die Redaktion.
3. **App umziehen** nach `/app/`, mit Standalone-Redirect. Eigener Branch. Installierte Version testen, bevor es live geht.
4. **Startseite bauen**, mobile zuerst. Dann Desktop.
5. **Unterseiten** nach Abschnitt 5.
6. **Rechtliche Seiten:** Impressum, Barrierefreiheit, Datenschutz und Nutzung prüfen lassen.
7. **Tests:** Bildschirm, Barrierefreiheit, Link-Prüfung, Test mit Zielgruppe.
8. **Launch:** Startseite live, App unter `/app/`, Hinweis in `README.md` (das noch den alten Ampel-Prototyp beschreibt) und in `EINFUEHRUNG.md` aktualisieren.

---

## 9. Offene Entscheidungen (mit Vorschlag)

1. **App nach `/app/` umziehen und Startseite in den Root?**
   Vorschlag: ja, mit Standalone-Redirect (Abschnitt 6).
2. **Positionierung:** barrierefrei als Überschrift, Staus und Fahrpläne als Teil von „Gerade jetzt“?
   Vorschlag: ja.
3. **Öffentliches Erfassen per Diktat:** auf der Startseite erwähnen oder nur für Mitwirkende?
   Vorschlag: nur für Mitwirkende, bis die Redaktion es freigibt. Die Startseite verspricht es nicht.
4. **„Dein Flow“ (Ampel-Wartezeiten):** als Funktion zeigen oder weglassen?
   Vorschlag: weglassen, bis die Einführung und das README übereinstimmen. Das README beschreibt noch den älteren Ampel-Prototyp.
5. **Sprache:** Deutsch zuerst, Fassung in einfacher Sprache in Phase 2?
   Vorschlag: ja.
6. **Adresse:** Auf GitHub Pages (`mpaulussen.github.io/flowtown/`) bleiben oder eine eigene Domain?
   Vorschlag: zunächst Pages, eigene Domain später. Die Redirect-Regel funktioniert in beiden Fällen.
7. **Kontaktweg:** nur E-Mail, kein Formular.
   Vorschlag: ja.

---

## 10. Was ich nicht geprüft habe

- Den Inhalt von `datenschutz.html` und `nutzung.html` im Detail. Ich habe nur die Kopfbereiche gelesen. Vor Launch vollständig prüfen.
- Die tatsächliche Darstellung auf Handy und Desktop. Es gibt noch keinen Entwurf, deshalb keine Bildschirmfotos.
- Ob die Mobilithek- und Mistral-Anbindung im Pilotgebiet stabil läuft. Das ist Voraussetzung für die Aussagen „heute“ auf der Startseite.
