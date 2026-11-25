# Stadt-Daten: Checkliste und Datenstufen

Stand: 25.11.2026. Zweck: Bevor Flowtown in einer Stadt Angaben macht, prüfen wir, welche Daten dort wirklich vorliegen. Die App zeigt nur das, was die Stufe hergibt.

Bielefeld ist der Ausnahmefall mit offenen Daten. Heilbronn ist der Regelfall: teils gute Landesdaten, für die Stadt selbst vieles nur verstreut.

---

## Teil 1: Checkliste für eine neue Stadt

Jede Frage wird mit Quelle, Lizenz und Stand notiert. Wer die Antwort nicht findet, schreibt „nicht gefunden“ und nicht „gibt es nicht“.

### A. Fahrplan (Bus und Bahn)
1. Gibt es einen GTFS-Fahrplan für die Stadt oder den Verbund (Landes- oder Bundesportal, Verbund, Stadt)?
2. Umfasst er die Stadt selbst, nicht nur das Umland?
3. Wie aktuell ist er (Gültigkeit, Versionsdatum)? Ältere als ein Jahr nicht übernehmen.
4. Lizenz: Datenlizenz Deutschland (dl-de/by-2-0), CC BY 4.0 oder anders? Namensnennung nötig?
5. Echtzeit: offen zugänglich, oder nur auf Antrag mit persönlichem Zugang?

### B. Haltestellen und Barrierefreiheit
6. Gibt es einen Datensatz mit Merkmalen je Haltestelle (Einstieg, Aufzug, Leitelemente, Busbord)?
7. Umfasst er die Stadt selbst?
8. Ist der Status geprüft oder nur „Rohdaten“?
9. Gibt es OpenStreetMap-Angaben (`wheelchair`) und wie viele Haltestellen sind leer?
10. Gibt es eine Liste der laufenden oder geplanten Umbauten der Stadt (Pressemitteilung, Beschluss, Protokoll)?

### C. Straßen und Verkehrslage
11. Baustellen: Stadt, Land oder beides? Gilt der Datensatz für Stadtstraßen oder nur für Bundes- und Landesstraßen?
12. Aktualität: Stand 2026, oder älter?
13. Verkehrsmeldungen (Staus, Sperrungen): verfügbar?

### D. Weitere Angaben
14. Toiletten, Behindertenparkplätze, Aufzüge an Haltestellen oder Bahnhöfen, Parkhäuser: vorhanden?
15. Lizenz und Namensnennung je Datensatz.

### E. Ansprechperson und Aufwand
16. Wer ist für Verkehr, Barrierefreiheit und Daten zuständig (Stadt, Verbund, Verkehrsunternehmen, Landkreis)?
17. Gibt es eine Inklusionsvertretung oder einen Beirat, der Umbauten abstimmt?
18. Geschätzter Aufwand, bis die Stadt einen Datenstand hat: Stunden und Wochen.

---

## Teil 2: Datenstufen

Die App kennzeichnet jede Angabe mit der Stufe und der Quelle.

| Stufe | Bedeutung | Beispiel | Darstellung in der App |
|---|---|---|---|
| **1: Offen und aktuell** | Strukturierter Datensatz, Stand innerhalb eines Jahres, Lizenz klar | Fahrplan Heilbronn (HNV/NVBW, Stand 03.10.2026) | Angabe mit Quelle und Stand |
| **2: Landesdaten mit Lücken** | Landes- oder Verbundsdaten, die die Stadt nur teilweise abdecken | Barrierefreiheit an BW-Haltestellen (Landkreis Heilbronn ja, Stadt nein) | Angabe nur für abgedeckte Orte, sonst „keine Angabe“ |
| **3: Manuell aus Veröffentlichungen** | Presse oder Stadtmitteilung, von Hand übernommen, mit Datum | Umbauten der Stadt Heilbronn laut Pressemitteilung 18.08.2026 | Angabe mit „laut Stadt, Stand …“ und Hinweis auf Vollständigkeit |
| **4: Keine Daten** | Nichts gefunden oder veraltet | Stadt Heilbronn: Baustellen im Stadtgebiet (nur Daten 2021 bis 2023) | „Dazu habe ich keine Angabe.“ mit Ort, wo man es erfährt |

### Regeln

- **Keine Stufe wird geschätzt.** Gibt es keinen Datensatz, ist es Stufe 4.
- **Veraltete Daten fallen eine Stufe.** Ein Datensatz aus 2021 ist für Baustellen Stufe 4, nicht Stufe 1.
- **Mischformen ausweisen.** Hat eine Stadt Stufe 1 beim Fahrplan und Stufe 4 bei Barrierefreiheit, zeigt die App beides getrennt.
- **Lizenz beachten.** Datenlizenz Deutschland und CC BY verlangen Namensnennung, ODbL (OpenStreetMap) verlangt Namensnennung und Weitergabe unter gleichen Bedingungen für abgeleitete Datenbanken.

---

## Teil 3: Beispiel Heilbronn (Stand 25.11.2026)

| Bereich | Quelle | Stufe |
|---|---|---|
| Fahrplan Stadtwerke Heilbronn | NVBW (HNV), dl-de/by-2-0, Stand 03.10.2026 | 1 |
| Echtzeit | Landesportal mobidata-bw (TRIAS), Zugang nur auf Anfrage | Anfrage nötig |
| Barrierefreiheit Haltestellen | Landesdatensatz BFRK: keine Stadt-Haltestellen, Landkreis ja, Rohdaten | 2 für den Landkreis, 4 für die Stadt |
| Umbauten Haltestellen Stadt | Pressemitteilung 18.08.2026 mit Einzelnamen, nicht vollständig (rund 80 laut Stadt) | 3 |
| OpenStreetMap `wheelchair` | 417 Haltestellen-Bereiche, 304 ohne Angabe, Stand Abruf 25.11.2026 | 3 (lückenhaft) |
| Baustellen Stadt | Stadtportal, nur 2021 bis 2023 | 4 |
| Baustellen Bundes-, Landes-, Kreisstraßen | Landesdatensatz, dl-by-de/2.0 | 2 |
| Verkehrsmeldungen | Landesdatensatz LMS BW, Stand 26.10.2026 | 1 (für Landesstraßen) |

**Folge für den Pitch:** Heilbronn bekommt die Fahrplanauskunft voll, die Barrierefreiheit nur mit Ausnahmen, und die Baustellen im Stadtgebiet gar nicht. Das ist ein ehrlicher Stand und keine Schwäche, wenn die App ihn zeigt.

---

## Teil 4: Regeln für den Ausbau in neue Städte

Jede Stadt bekommt einen Status. Der Status legt fest, welche Module die App dort aktiviert.

### Status
- **Start:** Kernmodule laufen mit Stufe 1 bis 2. Alle Angaben sind belegt.
- **Start mit Einschränkungen** (Kurzform in der App: „Teilstart“): Einzelne Module laufen nur mit Stufe 3 oder 4. Die App sagt das in jeder Antwort, wo es gilt.
- **Warten:** Ein Pflichtdatum fehlt. Ein Start wäre unehrlich.
- **Nicht möglich:** Lizenz oder Ansprechperson fehlen dauerhaft.

### Regeln
1. **Fahrplan ist Pflicht.** Ohne Fahrplan Stufe 1 gibt es keinen Start.
2. **Barrierefreiheit der Haltestellen** wird aktiviert, wenn Stufe 1 bis 3 vorliegt und mindestens **50 Prozent** der Haltestellen der Stadt Angaben haben. Darunter gilt für das ganze Modul Stufe 4.
3. **Baustellen** werden aktiviert, wenn ein Datensatz die Stadtstraßen umfasst. Sonst gilt Stufe 4.
4. **Echtzeit** wird aktiviert, wenn ein Zugang besteht. Sonst bleibt es beim Fahrplan, mit Hinweis.
5. **Lizenz:** erlaubt sind Datenlizenz Deutschland (dl-de/by-2-0), CC BY 4.0 und ODbL, jeweils mit Namensnennung. CC BY-SA 4.0 (DELFI-Echtzeit) ist erlaubt, wenn die Namensnennung und die Weitergabe unter gleichen Bedingungen eingehalten werden; die Rechtsprüfung dazu steht noch aus. Alles andere ist ein Ausschluss.
6. **Ansprechperson:** ohne benannte Stelle keine Datenpflege. Dann höchstens Stufe 1 mit Stand-Warnung.
7. **Aktualität:** Daten älter als zwölf Monate fallen eine Stufe.
8. **Prüfkatalog:** Eine Stadt geht erst live, wenn ihr Prüfkatalog keine falschen Antworten zeigt (Regel M2 in `UX-PLAN.md`).

### Beispiel Heilbronn
Status: **Teilstart.** Regel 1 erfüllt (Fahrplan Stufe 1). Regel 2 greift nur für den Landkreis, die Stadt steht als Stufe 4, bis die Liste der Stadt vorliegt. Baustellen im Stadtgebiet: Stufe 4. Echtzeit: Zugang fehlt.

## Teil 5: Prüfung Mönchengladbach (Stand 25.11.2026)

| Bereich | Befund | Stufe |
|---|---|---|
| Fahrplan | DELFI-Auszug Stadt und Region, 15.075 Fahrten, 3.251 Haltestellen, gültig bis 12.12.2026, CC BY 4.0 | 1 |
| Echtzeit | DELFI-Trip-Updates über Mobilithek, im Server für alle Fahrplan-Städte | 1, Lizenz CC BY-SA 4.0 nach Regel 5 zu prüfen |
| Haltestellen-Barrierefreiheit | Kein offener Datensatz. Die Stadt nutzt laut bsk-mg.de eine Excel-Liste mit Stand 2014. Faktencheck Linie 016: 12 von 36 Bussteigen erfüllen die Anforderungen | 4 |
| Umbau-Liste Haltestellen | Die Stadt spricht von 1.163 Haltepunkten und einem schrittweisen Umbau, eine Liste mit Stand habe ich nicht gefunden | 4 |
| Baustellen | Informationsdienst der Stadt von 2021, Übersicht der NEW kein Open-Data-Datensatz | 4 |
| Verkehrsmeldungen | Straßen.NRW noch nicht freigegeben | Warten |
| Parkplätze | Parkplatz-Portal der Stadt, rund 80 barrierefreie Stellplätze mit Foto und Route, Stand Dezember 2025 (nur Stellplätze) | 3 |
| Ansprechperson | Geodatenstelle der Stadt und NEW | benannt |
| Inklusionsbeirat | nicht geprüft | offen |

**Status: Teilstart** (wie Heilbronn). Das Echtzeit-Modul läuft, sobald die Lizenz CC BY-SA geklärt ist; bis dahin „Warten“ für Echtzeit.

**Nächste Schritte:** OpenStreetMap-Abfrage für Mönchengladbach auf dem Server, Anfrage an Geodatenstelle und NEW, Prüfkatalog für Mönchengladbach (M2), Rechtsprüfung zu CC BY-SA.

## Offene Punkte

- Die Datenstufe ist noch nicht in der App sichtbar. Das kommt als eigener Schritt.
- Die Anfrage an die Stadt Heilbronn (vollständige Liste der etwa 80 Haltestellen) ist noch nicht versendet.
- Bielefeld hat für Baustellen, Toiletten und Parkplätze noch offene Lizenzfragen (siehe `TODO.md`).
