# Mitbewerber und Einordnung: barrierefreie Navigation mit Sprach-KI

Stand: 13.11.2026. Recherche per Websuche, **ohne eigene Tests der Apps** und ohne Abruf der Originalseiten (die Hosts waren in der Arbeitsumgebung gesperrt; Aussagen stammen aus Suchzusammenfassungen und sind, wo nötig, so markiert). „Nichts gefunden“ heißt nicht „gibt es nicht“.

## Kurzfassung

- **Sprache + KI allein ist kein Alleinstellungsmerkmal.** Google bringt Gemini-Sprachnavigation inzwischen auch in Deutschland für Fußgänger, Rad und ÖPNV; „Ask Maps“ (freie Fragen) war nach den neuesten gefundenen Berichten in Deutschland noch nicht verfügbar.
- **Eine Lücke, die ich gefunden habe:** Ich habe **kein** deutsches Angebot gefunden, das freie Sprachfragen zum ÖPNV mit **geprüften, belegten Antworten** und **barrierefreien Daten** (Aufzüge, Ampeln mit Ton, Barrierefreiheit von Orten, Profil) verbindet. Das ist ein Befund der Suche, kein Beweis.
- **Forschung stützt den Ansatz „belegt statt geraten“:** Studien zu Be My AI und Seeing AI zeigen hohe Fehlerraten; Fachleute fordern, dass Assistenten für Blinde „zurückhaltend sein, Belege verlangen, ablehnen“ können.
- **Offen:** Nutzertests mit der Zielgruppe, ein direkter Vergleich mit Google/Gemini bei denselben Fragen, Datentiefe außerhalb von Bielefeld und OWL.

## Wer was kann

| Anbieter | Was belegt ist | Was für Flowtown zählt |
| --- | --- | --- |
| **Google Maps mit Gemini** | Gemini-Navigation per Sprache seit 11/2025 für Autofahrer, seit 2026 auch für Fußgänger, Rad und ÖPNV, laut Bericht auch in Deutschland (googlewatchblog, 01/2026). „Ask Maps“ (freie Fragen) seit 03/2026 in USA/Indien, später weitere Länder; ein Bericht vom 08/2026 nennt Deutschland noch nicht. „Barrierefreie Orte“ (Rollstuhlsymbol für Eingang, Toilette, Parkplatz) seit 11/2022 auch in Deutschland. Stufenfreie ÖPNV-Routen 2018 angekündigt, anfangs nur wenige Städte; Daten großenteils von Local Guides. | Größter Mitbewerber, allgemeiner Zweck, schnell im Nachziehen. Für Blinde speziell fand ich bei Gemini-Navigation nichts; ältere Zugänglichkeitsfunktionen betreffen Lens-Beschreibungen. Wie belastbar Gemini-Antworten zu Abfahrten und Umstiegen sind, habe ich **nicht geprüft**. |
| **Be My Eyes / Be My AI** | Vor allem menschliche Freiwillige und Mitarbeitende; Moovit-Anbindung (Freiwillige helfen bei Routen); Amtrak-Pilot mit Agenten; Be My AI beschreibt Szenen, ist laut Quellen keine Navigation. | Ergänzung, kein Ersatz für belegte Fahrplanauskunft. |
| **Soundscape Community** | Open-Source-Nachfolger von Microsoft Soundscape (2023 eingestellt): Audio-Orientierung im Freien, Wanderrouten. | Orientierung draußen, keine ÖPNV-Auskunft. |
| **BlindSquare, Lazarillo, Ariadne GPS, GoodMaps Outdoors (früher Seeing Eye GPS), Envision** | Blinden-Navigation zu Fuß, Orte in der Nähe, teils Abbiegehinweise; Envision eher KI-Sehhilfe. Quellenlage dünn und teils alt. | Fokus Fußweg und Orte, nicht geprüfte ÖPNV-Fragen. |
| **Moovit** | Stufenfreie Routen und Rollstuhlinfos laut Meldungen 2017 bis 2021 (damals wenige Städte), Screenreader-Unterstützung, Be-My-Eyes-Anbindung. | Aktueller Umfang in Deutschland nicht belegt. |
| **Deutsche Bahn** | „DB Bahnhof live“ ab 31.12.2024 nicht mehr als App, Funktionen (Aufzugsstatus mit Push, Wagenreihung) in die Web-App bahnhof.de verlagert; **DB Info** (Web und App) soll Mitte 11/2026 starten (Ankündigung, nennt Aufzugsverfügbarkeit). „DB Barrierefrei“ 2018 vorgestellt, heutiger Stand unklar. Zum DB Navigator fand ich **keinen** Sprachassistenten. Kritik: Informationen zu defekten Aufzügen fehlen oft. | Aufzugsdaten kommen von der DB selbst; DB Info startet in diesen Tagen und ist ein Ausgangspunkt für Vergleich und evtl. Datenquelle. |
| **Deutsche Projekte** | VBB-App „Bus & Bahn“ für Blinde (Sprachein- und -ausgabe über das Betriebssystem); **Sinn2** (Baden-Württemberg, Mobilitätspreis); **OD2Guide** (mFUND, contagt, 2021 bis 2024, Audio-Chatbot mit KI-Dialog und Beacons; Ergebnisse des Chatbots nicht gefunden); **LOC.id** (Hannover, Pilot); **SmartAIs** (Hinderniserkennung, Preis); Wheelmap; „Hürdenlose Navigation“ (Heidelberg). | Zeigt, dass das Thema gefördert wird; meist regional, Beacon-basiert oder ohne freie Sprachfragen. Aktuelle Verfügbarkeit nicht geprüft. |

## Was die Forschung sagt

- CHI-2026-Tagebuchstudie (20 blinde und sehbehinderte Nutzer von Seeing AI und Be My AI, 551 Einträge): Gesprächsgenauigkeit 56,6 %, Halluzinationsrate 34,6 % bei Texterkennung; Hinweis, dass man sich bei folgenreichen Aufgaben nicht ohne Gegenprüfung verlassen kann. ÖPNV war mit etwa 10 % der Nutzungen ein Nebenfall.
- StreetReaderAI (ASSETS 2025): Tendenz, KI-Ausgaben **zu sehr zu glauben**, als Herausforderung.
- Positionspapier (arXiv, 05/2026): Assistenten für Blinde müssen **zurückstellen, mehr Belege verlangen oder ablehnen** können; Navigation sei folgenreich und vor Ort schwer zu überprüfen.

Das passt zu Flowtowns Ansatz (Quellenprüfung, „Dazu habe ich keine Angabe“), ist aber **kein Beleg, dass Flowtown es besser macht**: Die Studien betreffen andere Apps.

## Wo Flowtown sich vermutlich unterscheidet (Hypothesen, zu belegen)

1. **Nichts erfinden:** Uhrzeiten, Linien, Dauer, Orte werden gegen Werkzeug-Ergebnisse geprüft; sonst ehrliche Absage. Messbar machen (Testreihe heute: 114 Fragen, 0 Fehler, 4 Eingriffe, davon alle zu Recht).
2. **Ehrlichkeit bei Echtzeit:** „keine Abweichung gemeldet“ statt „pünktlich“; Umsteigezeit mit Richtwert und Quelle.
3. **Barrierefreie Daten und Profil:** Aufzüge, Ampeln mit Tonsignal, Barrierefreiheit von Orten, Profil (z. B. Sehbehinderung, Rollstuhl), Lernen aus eigenen Fahrten.
4. **Lokale Tiefe in Bielefeld und OWL** und Datenschutz mit EU-Hosting.

## Wo Flowtown nicht (oder noch nicht) vorne liegt

- **Reichweite:** Fahrplanausschnitte (Ostwestfalen, Mönchengladbach, Paderborn, Detmold), Echtzeit nur für nahe Fahrten, Aufzugsstatus der Stadtbahn ohne Live-Daten.
- **Spracherkennung** kommt vom Betriebssystem; falsch verstandene Orte sind nicht ausgeschlossen.
- **Kein Nutzertest** mit der Zielgruppe; Sprachmodus erst seit heute stabil.
- **Große Anbieter können nachziehen** (Gemini-Funktionen kommen schnell, DB Info startet jetzt).

## Empfohlene nächste Schritte

1. **Direktvergleich:** Dieselben 30 bis 40 Fragen aus `server/testreihe.txt` in Google Maps (Gemini) und, wo möglich, anderen Apps stellen, Antworten festhalten und mit dem echten Fahrplan prüfen. Ergebnis: eine belegte Aussage „X % der Antworten falsch oder unbelegt bei Google, Y % bei Flowtown“. Das wäre der stärkste Beleg für den USP.
2. **Nutzertest** mit fünf bis zehn Menschen aus der Zielgruppe (blind, sehbehindert, Rollstuhl), reale Wege.
3. **Positionierung:** nicht „KI-Sprachassistent“, sondern „Auskunft, die nur sagt, was belegt ist, mit Barrierefreiheit vor Ort“. Das Versprechen sichtbar machen (z. B. Quelle und Stand an jeder Antwort).
4. **Beobachten:** DB Info (Start Mitte 11/2026), Ask Maps in Deutschland, OD2Guide-Schlussbericht.

## Quellen (Auswahl)

Hinweis: Die Links stammen aus den Suchergebnissen. Welche Zahl genau in welchem Dokument steht (besonders die Studienwerte), habe ich nicht an den Originalen nachgelesen; vor einer Veröffentlichung bitte prüfen.

- Google Maps mit Gemini: <https://www.techcrunch.com/2026/03/12/google-maps-is-getting-an-ai-ask-maps-feature-and-upgraded-immersive-navigation/>, <https://www.googlewatchblog.de/2026/01/google-maps-navigation-gemini-startet-jetzt-auch-in-deutschland-fuer-fussgaenger-fahrrad-und-oepnv-video/>, <https://onlinemarketing.de/technologie/ask-maps-mehr-maerkte-essen-bestellen>, <https://thurrott.com/a-i/340190/ask-maps-in-google-maps-expands-to-over-150-new-countries-adds-new-agentic-features>
- Google barrierefreie Orte und Routen: <https://blog.google/intl/de-de/produkte/suchen-entdecken/google-maps-barrierefreie-orte-barrierefreiheit>, <https://www.googlewatchblog.de/2018/03/google-maps-barrierefreie-routenplanung/>
- Be My Eyes: <https://www.bemyeyes.com/?p=21193521>, <https://coolblindtech.com/be-my-eyes-joining-moovit-to-make-public-transit-more-accessible-for-blind-and-low-vision-travelers/>
- Soundscape Community: <https://www.applevis.com/apps/ios/navigation/soundscape-community>
- Navigations-Apps für Blinde: <https://www.incobs.de/tests-english/items/ios-navigation-apps.html>, <https://acb-indiana.org/news/news/2026/orientation-and-mobility-apps/>
- Moovit: <https://moovit.com/blog/moovit-makes-london-more-accessible/>
- Deutsche Bahn: <https://www.bahnhof.de/entdecken/bahnhof-de-wird-dbinfo>, <https://www.bahnhof.de/entdecken/db-bahnhof-live>, <https://railway-news.com/db-launches-new-app-for-passengers-with-impairments/>
- Deutsche Projekte: <https://www.bmv.de/SharedDocs/DE/Artikel/mFUND/Projekte/od2guide.html>, <https://www.vbb.de/vbb-services/barrierefreiheit/bus-bahn-app-barrierefrei/>, <https://www.bundesregierung.de/breg-de/aktuelles/barrierefreiheit-im-strassenverkehr-2322608>
- Forschung: <https://arxiv.org/html/2605.13579v1>, <https://arxiv.org/abs/2601.15291v1>, <https://afb.org/sites/default/files/2026-06/Navigating%20Toward%20AI%20-%20Transportation%20Report%20-%20Accessible.pdf>
