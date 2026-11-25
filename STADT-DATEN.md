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

## Offene Punkte

- Die Datenstufe ist noch nicht in der App sichtbar. Das kommt als eigener Schritt.
- Die Anfrage an die Stadt Heilbronn (vollständige Liste der etwa 80 Haltestellen) ist noch nicht versendet.
- Bielefeld hat für Baustellen, Toiletten und Parkplätze noch offene Lizenzfragen (siehe `TODO.md`).
