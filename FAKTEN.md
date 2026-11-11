# Fakten mit Herkunft: Datenmodell für die Datenqualität

Stand 11.11.2026. Zweck: Jede Angabe, auf die sich Flowtown stützt, trägt ihre Herkunft und ihr Alter. Die Assistenz nennt beides. Was nicht mehr geprüft ist, wird als „nicht mehr geprüft“ gezeigt und nicht still weiterverwendet.

## Ein Fakt

| Feld | Bedeutung |
| --- | --- |
| `objekt` | Was beschrieben wird: Haltestelle, Gebäudeeingang, Aufzug, WC, Querung, Weg |
| `merkmal` | Was darüber gesagt wird: `stufenlos`, `rampe`, `aufzug_in_betrieb`, `tuerbreite_cm`, `ampel_ton` … |
| `wert` | `ja`, `teilweise`, `nein`, `weiss_nicht` oder eine Zahl mit Einheit |
| `quelle` | Betreiber, amtlich, Redaktion vor Ort, Nutzende, automatisch (OSM, Fahrplan) |
| `stufe` | Vertrauensstufe 1 bis 5 (siehe unten) |
| `erfasst` | Datum der Erfassung |
| `geprueft` | Datum der letzten Prüfung und wer (nur Redaktion) |
| `bestaetigt` / `widersprochen` | Zahl der Bestätigungen und Widersprüche durch Nutzende |
| `gilt_bis` | Ablaufdatum, abgeleitet aus der Frischeklasse |

## Vertrauensstufen

1. Betreiber oder amtlich (zum Beispiel moBiel, DB, Stadt)
2. Redaktion vor Ort geprüft
3. mehrfach von Nutzenden bestätigt
4. einmal gemeldet
5. automatisch übernommen (OSM, Fahrplan)

Die Assistenz nennt bei Angaben zur Barrierefreiheit Stufe oder Quelle und Alter: „laut Redaktion, geprüft im Oktober“. Sie erfindet nie eine Quelle.

## Frischeklassen

| Klasse | Beispiele | gilt |
| --- | --- | --- |
| A | Aufzug und Rampe: aktueller Status | Minuten bis Stunden |
| B | Baustelle, Sperrung | Tage |
| C | Eingang, Schwelle, Türbreite, Rampenneigung | Monate (Vorschlag: 6) |
| D | WC, Ampel mit Ton, Bordstein, Belag | etwa ein Jahr |

Nach Ablauf gilt der Fakt als „nicht mehr geprüft“ und steht in der Prüfliste der Redaktion.

## Was schon läuft (Schritt 1, App 0.101.0)

- **Lückenzähler:** Der Server zählt je Monat, Thema, bekanntem Ort und Profilart, wie oft eine Antwort fehlte. Keine Frage, keine Person. Anzeigen: `node flowtown-server.mjs luecken`. Oben steht, was zuerst erfasst werden sollte.
- **Rückmeldung:** Unter jeder Antwort „Stimmt“, „Stimmt nicht“, „Veraltet“. Nur bei den beiden letzten gehen Frage und Antwort an die Redaktion. Anzeigen: `node flowtown-server.mjs rueckmeldungen`.
- **Quelle und Stand in der Antwort:** Die Assistenz nennt, wenn ein Werkzeug sie liefert, die Quelle und den Stand (zum Beispiel „Bielefeld barrierefrei erleben“).

## Redaktions-App (Version 0.1.0, 11.11.2026)

Gebaut: Speicher als Protokoll (`fakten.jsonl`), Zugang mit Einladungscodes, Objektliste, Checkliste je Objekt, Bestätigen, Entwürfe und Freigabe, Verlauf, Bericht, CSV-Export, Warteschlange ohne Netz. Siehe `REDAKTION.md`.

## Was noch fehlt

- Anbindung der Fakten an die Werkzeuge der Assistenz (M2b): Antworten nennen Quelle „Redaktion“, Stufe und Alter.
- Fotos, neue Objekte in der App, Zweitprüfung bei wichtigen Merkmalen.
- Automatische Quellen: OSM-Lückenbericht, Fahrplan-Felder für Rollstuhl-Einstieg, DWD-Wetter, Gehtempo aus Fahrten.

Entscheidungen (11.11.): Pilotgebiet Altstadt, Hauptbahnhof, Bethel und Uni. Zunächst ein Redakteur (Markus Paulußen). Redaktions-App als eigene PWA. Kein Rückfluss nach OpenStreetMap.
