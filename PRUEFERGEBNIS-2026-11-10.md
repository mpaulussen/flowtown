# Prüfergebnis vom 10. November 2026: erster Testlauf mit dem Prüfkatalog

Grundlage: Testlauf auf dem Server (`testlauf pruefkatalog.csv`, 287 Fragen, Profil und Standort wie im Katalog, ohne Verlauf und ohne Auswertung). Bewertet nach der Konsolenausgabe, die jede Antwort nach etwa 100 Zeichen abschneidet. Einzelne Bewertungen können sich beim Lesen des vollen Textes in der Tabelle ändern. Die Bewertung steht in `server/pruefkatalog.csv` (Spalten Status, Ergebnis, Notiz).

## Ergebnis auf einen Blick

| Ergebnis | Fragen | Bedeutung |
| --- | ---: | --- |
| erfüllt | 163 | Antwort passt zur Erwartung. Dazu zählen 47 ehrliche „dazu habe ich keine Angabe“ bei Dingen, die wir gar nicht wissen |
| teils | 53 | richtig, aber unvollständig, kühl oder am Ziel vorbei |
| nicht erfüllt | 26 | keine brauchbare Antwort, obwohl möglich oder nötig |
| falsch | 37 | erfundene oder irreführende Auskunft, oder technischer Fehler |
| nicht prüfbar | 8 | im Testlauf nicht prüfbar (Auswertung ausgeschaltet) |

Das Wichtigste vorweg: **Bei 37 von 287 Fragen sagt die Assistenz etwas, das nicht stimmt oder nicht belegt ist.** Das ist gefährlicher als eine fehlende Antwort. Die häufigste Ursache ist, dass die KI eine Lücke nicht zugibt, sondern füllt.

Meine Vermutung vor der Prüfung lag oft daneben. Von 79 Fragen mit Vermutung „fehlt“ hat die Assistenz 47 ehrlich als Lücke beantwortet (gut), aber 19 mit erfundenen Angaben (schlecht). Bei 59 Fragen mit Vermutung „teils“ war das Ergebnis „erfüllt“. Die Assistenz kann also mehr, als ich dachte.

## Befunde nach Dringlichkeit

### 1. Falsche Auskünfte (dringend)

**Aufzüge der Stadtbahn (das Jahnplatz-Problem).** K117 „Ist heute irgendwo ein Aufzug ausgefallen?“ → „Laut moBiel sind alle Aufzüge an Haltestellen in Betrieb.“ K046 sagt dasselbe für den Hauptbahnhof („laut moBiel“). Beides ist falsch: Es gibt keinen Live-Status der Stadtbahn-Aufzüge, und der Hauptbahnhof ist Sache der DB. Genau das darf nach dem Artikel nicht passieren. K047 (Jahnplatz) sagt wenigstens „vor Ort prüfen“, aber nicht, dass kein Status vorliegt. K284 erfindet sogar einen „Ostbahnhof Bielefeld“ mit DB-Status.

**Erfundene Telefonnummern.** K134 (Fundsache) nennt „030 29743333“ und den Fundservice der Bahn statt moBiel, K194 und K295 nennen Nummern, die nicht aus unseren Daten stammen. Die Regel „keine Telefonnummern“ steht im Systemtext, wird aber umgangen.

**Falsche Fakten ohne Quelle.** K020 erfindet ein Einzelticket (die Linie 95 gibt es: Sie steht im dritten Lauf in den Abfahrtsdaten, ich hatte sie zu Unrecht als erfunden bezeichnet), K018 gleicht „günstigster“ mit „wenig CO₂“ gleich, K132 sagt „Assistenzhunde ohne Maulkorb oder Leine“, K135 tut so, als gäbe es Linie 9, K313 empfiehlt das Auto für 20 Kinder mit Rollstühlen, K320 behauptet, alles sei „in Echtzeit“.

**Zeitfragen werden mit „jetzt“ beantwortet.** K021 „Ich muss um 8 Uhr an der Uni sein“ → „Geh spätestens um 19:02 los“, K022 „halb zehn“ → „21:35“, K033 „am Sonntag“ und K034 „Neujahr“ → Abfahrten von jetzt als Sonntagsfahrplan. Die Werkzeuge kennen nur den Zeitpunkt „jetzt“.

**Erfundene Funktionen und Menüpunkte.** „Melden“, „Entdecken“, „Laden“, „Meine Meldungen“, „Meldungen“, „Hilfe“, eine Zeitauswahl unter „Wohin?“ (K105, K140, K151, K172, K187, K192, K193). K186 kennt „Hindernis melden“ auf der Karte nicht. K080 erfindet „Liniennummer in die moBiel-App sagen“, K107 und K112 behaupten, ruhige Orte und die Auslastung nennen zu können.

**Behauptungen ohne Daten.** K149 „keine steilen Stücke“, K153 „keine Schranken oder Umlaufsperren“, K158 Trinkwasserspender im Rathaus, K026 Rad bei Regen empfohlen.

### 2. Technische Fehler

- **K181 „[object Object],[object Object],[object Object]“**: Mistral liefert den Text manchmal als Liste von Teilen, der Server hat daraus „[object Object]“ gemacht.
- **11 Antworten mit Fließtext als Werkzeugname** (K059, K073, K078, K111, K118, K170, K274, K275, K280, K299, K317). Ursache: Bei Fragen mit „zum/am/nach + Großbuchstabe“ erzwingt der Server einen Werkzeugaufruf. Passt kein Werkzeug, schreibt Mistral die Antwort als Werkzeugnamen und danach teilweise endlose Wiederholungen („Ich bin Flowtown. Ich helfe dir. …“, bei K280 und K299 unleserlich).

### 3. Falscher Notruf-Ton

K090 und K091 raten Gehörlosen zu „ruf an“ und „sag laut“. K302 („Hol mich ab“) und K299 (Beschwerde) bekommen den Notruftext. K213 und K216 („ein Mann folgt mir“, „bring mich zu einer sicheren Stelle“) bekommen nur 112, ohne belebten Ort oder 110.

### 4. Nicht erfüllt, obwohl Daten oder Antwort da wären

- **Falsches Werkzeug:** K064, K311 („Gibt es am Jahnplatz einen Aufzug?“ → „keine Angabe“, obwohl er in den Fahrplandaten steht), K314 (Liste der Hochbahnsteige), K147 (Radweganteil).
- **Unnötige Rückfrage „Wohin möchtest du?“:** K009, K027 (Bus oder Rad CO₂), K079, K089 (Gebärdensprache), K137, K139, K148. Dort wäre „dazu habe ich keine Angabe“ richtig.
- **Sprachen:** Türkisch, Arabisch und Ukrainisch (K250, K251, K252) werden nicht beantwortet, Englisch (K249) deutsch. Plattdeutsch (K253) und Tippfehler gehen gut.
- **Über Flowtown:** K321, K323, K326, K327 sind abweisend („Dazu kann ich nichts sagen“), obwohl die Antworten bekannt sind.
- **Standort:** K001, K004, K009: Der Standort ist auf 100 m gerundet, deshalb nennt die App weder Straße noch Ort. Das ist eine Entscheidung zwischen Datenschutz und Nutzen (siehe Offene Entscheidung).

### 5. Ton

Kühle Absagen („Dazu kann ich nichts sagen“) statt „Das kannst du stattdessen tun“ und keine Beruhigung bei Angst und Unruhe (K099, K102, K108, K190, K279).

### 6. Ehrliche Lücken (kein Fehler, aber nichts für die Nutzenden)

Die Assistenz hat bei diesen Fragen richtig „dazu habe ich keine Angabe“ gesagt, und wir haben die Daten nicht: Preise und Tarife, Auslastung der Bahnen, Stellplätze für Rollstühle und Rollatoren, Türbreiten und Aufzuggrößen, Gehwegbreite, Steigungen, Grünzeiten von Ampeln, Ladeorte, Sanitätshäuser, Bänke, Trinkwasser, Apotheken und Ärzte, Veranstaltungen, Zustand bei Eis und Laub. Das sind die Datenwünsche für die nächsten Schritte.

## Was ich daraufhin geändert habe (Server, noch nicht auf deinem Server)

Alle Änderungen stehen in `server/flowtown-server.mjs`. Ich habe sie mit einem lokalen Ersatz für Mistral getestet, der die beobachteten Fehler nachstellt. Echte Antworten von Mistral habe ich nicht, das zeigt erst ein neuer Testlauf.

1. **Texte als Liste** werden richtig zusammengesetzt (K181).
2. **Unbekannte Werkzeugnamen** werden verworfen. Nach einem erzwungenen Aufruf ohne passendes Werkzeug fragt der Server noch einmal ohne Zwang, sonst ganz ohne Werkzeuge. Der Fließtext landet nicht mehr in der Werkzeugliste.
3. **Antworten werden aufgeräumt:** wiederholte Sätze fallen weg, höchstens fünf Sätze, kein Markdown, und **Sätze mit Telefonnummern werden gestrichen** (außer 110 und 112).
4. **Werkzeug oepnv_stoerungen** meldet jetzt ausdrücklich: „Für Aufzüge an Stadtbahn-Haltestellen gibt es keinen Live-Status von moBiel“, und dass „alle in Betrieb“ nur für DB-Bahnhöfe gilt.
5. **Systemtext, elf neue Regeln:** Aufzüge der Stadtbahn, Zeitfragen nur für „jetzt“, Liste dessen, was die App nicht kann, keine Telefonnummern, die wahren Stellen der App (Reiter, „Wohin?“, rotes Plus, „Hindernis melden“, Mehr), Notruf nur bei Gefahr und Gehörlose nie zum Anrufen, allgemeine Fragen ohne Rückfrage, kein Auto für Gruppen, andere Sprachen, was Flowtown ist und woher die Daten kommen, Ton bei Angst.
6. **Testlauf:** `testlauf datei.csv K018,K020` oder `testlauf datei.csv ergebnis:falsch,nicht erfüllt` wiederholt nur einzelne Zeilen.

## Noch nicht umgesetzt (Entwicklungsliste)

| Nr. | Thema | Warum nicht per Text lösbar |
| --- | --- | --- |
| E1 | Fahrplan mit Zeitpunkt (morgen, Sonntag, „um 8 Uhr da sein“) | die Werkzeuge kennen nur „jetzt“ |
| E2 | Aufzugsstatus der Stadtbahn von moBiel | braucht die Daten (Fallbeispiel Jahnplatz) |
| E3 | Wetter in die Empfehlung (Regen, Glätte) | braucht eine Wetterquelle |
| E4 | Höhenprofil für Steigungen | braucht Höhendaten |
| E5 | Testlauf mit Auswertung und Verlauf, damit 8 Fragen prüfbar werden | Testlauf-Kontext erweitern |
| E6 | Standort als Adresse nennen (K001, K004) | Entscheidung, siehe unten |
| E7 | Sprachen: prüfen, ob Mistral in Türkisch, Arabisch, Ukrainisch ausreichend antwortet | nach neuem Testlauf |
| E8 | Daten, die wir nicht haben: Bänke, Trinkwasser, Apotheken, Ärzte, Stellplätze für Rollstühle, Ladeorte | Datenquellen suchen (OSM, Stadt) |
| E9 | Prüfung der Antworten mit einem zweiten Modell oder festen Regeln, bevor sie an die Person gehen | größere Änderung |

**Offene Entscheidung:** Die App rundet den Standort auf 100 m, bevor er an den Server geht. Deshalb kann die Assistenz nicht sagen „du stehst in der Obernstraße“. Möglich wäre, die Straße auf dem Handy zu bestimmen und nur den Straßennamen mitzuschicken. Das ist ein Datenschutzthema und gehört in die Datenschutzerklärung. Ich habe das nicht geändert.

## Zweiter Lauf: nur die 63 Fehler vom ersten Lauf (nach den ersten Korrekturen)

Von den 37 `falsch` und 26 `nicht erfüllt` sind nach den Änderungen vom Vormittag:

| vorher → nachher | Fragen |
| --- | ---: |
| falsch → erfüllt | 16 |
| falsch → teils | 18 |
| falsch → falsch | 3 (K124, K284, K313) |
| nicht erfüllt → erfüllt | 11 |
| nicht erfüllt → teils | 7 |
| nicht erfüllt → nicht erfüllt | 8 (K004, K009, K126, K139, K147, K216, K241, K327) |

Gesamtbild des Katalogs, wenn man die Wiederholung einrechnet (die übrigen 224 Fragen sind noch vom ersten Lauf): **190 erfüllt, 78 teils, 8 nicht erfüllt, 3 falsch, 8 nicht prüfbar.** Ob die übrigen Fragen nach den neuen Regeln noch genauso gut sind, zeigt nur ein vollständiger Lauf.

**Behoben (sichtbar im Lauf):** der Fehler „[object Object]“ (K181), alle Fließtext-als-Werkzeugname-Fälle, die erfundenen Telefonnummern, die erfundenen Menüpunkte (stattdessen „Hindernis melden“ auf der Karte, K186, K187), Notruftext bei „Hol mich ab“ und Beschwerde, Türkisch (K250), die Zeitfragen (jetzt ehrlich „kenne nur jetzt“), die Aufzug-Antwort bei K117 (kein „laut moBiel alle in Betrieb“ mehr).

**Noch nicht gut:**
- **K284** erfindet weiter den „Ostbahnhof Bielefeld“ mit DB-Status. Der Fehler kommt vom Werkzeug `oepnv_stoerungen`, das keinen Ort prüft.
- **K124** „Fährt der Bus 25 noch?“ → „fährt laut Fahrplan“, geprüft wurde nur, ob eine Störung gemeldet ist.
- **K313** empfiehlt weiter das Auto für 20 Kinder mit zwei Rollstühlen.
- **K046** widerspricht sich am Hauptbahnhof („kein Live-Status“ und „laut DB in Betrieb“).
- **K149** sagt „keine steilen Stücke“. Die Steigungsdaten aus OpenStreetMap sind lückenhaft, „keine steilen Stücke“ heißt dort „keine Angabe“.
- **K251, K252** (Arabisch, Ukrainisch) werden verstanden, aber auf Deutsch beantwortet.

**Danach geändert (zweite Runde, noch nicht auf dem Server geprüft):**
- Fragen zu einem bestimmten Aufzug gehen an das Werkzeug `haltestelle` und den DB-Status. Unbekannte Orte heißen „den Ort kenne ich nicht“. Am Hauptbahnhof gibt es beides.
- „Fährt die Linie noch?“ geht an `abfahrten_in_der_naehe`, nicht an `oepnv_stoerungen`.
- Steigung nur, wenn `weg_check` sie liefert, sonst „keine Angabe“.
- Verpasster Anschluss: nächste Abfahrten nennen. Verfolgung oder Bedrohung: belebter Ort und 110 statt 112. „Gefahr“ steht nicht mehr in der 112-Regel.
- Startbildschirm für iPhone und Android, Antwort auf Fehlermeldungen, Maße ohne Werkzeugangabe ohne Rückfrage.
- Gruppen ab fünf Personen: Der Server hängt der Frage einen Hinweis an, nicht das Auto zu empfehlen.

**Neu in der Entwicklungsliste:** E10 Radweganteil für die Assistenz (die App rechnet ihn nur lokal, K147).

## Dritter Lauf: der ganze Katalog nach den zwei Korrekturrunden

| Ergebnis | Lauf 1 | nach Wiederholung | Lauf 3 (alle 287) |
| --- | ---: | ---: | ---: |
| erfüllt | 163 | 190 | 190 |
| teils | 53 | 78 | 73 |
| nicht erfüllt | 26 | 8 | 7 |
| falsch | 37 | 3 | 9 |
| nicht prüfbar | 8 | 8 | 8 |

**Lesehilfe:** Gegenüber dem ersten Lauf sind 27 Fragen mehr erfüllt und 28 weniger falsch. Gegenüber dem Stand nach der Wiederholung ist es nicht besser geworden, vor allem weil mehr Fragen als „falsch“ zählen (3 → 9). Ein Teil davon sind echte Rückschritte, ein Teil kommt daher, dass ich diesmal alle Antworten gegen die Kriterien gelesen habe und strenger war als beim ersten Durchgang. Deshalb steht neben den Zahlen die Liste der echten Rückschritte.

**Echte Rückschritte (die Antwort hat sich verschlechtert):**
- **K046** nennt den Hauptbahnhof in Paderborn. Ursache war das Werkzeug `haltestelle`, das den Fahrplan der falschen Stadt nahm.
- **K157** liefert einen Fehler („Mistral antwortet mit 400“).
- **K116** sagt „laut Fahrplan pünktlich“ und prüft nur Störungen.
- **K117** sagt wieder „laut moBiel und Flowtown sind heute keine Aufzüge ausgefallen“. Eine leere Meldeliste liest die KI als „alles in Ordnung“.
- **K173, K210, K292** erfinden Funktionen („Restaurant suchen unter Wohin?“, „Standort teilen unter Mehr“, „Fahrdienst suchen unter Mehr“).
- **K018** nennt den Weg mit dem wenigsten CO₂ „die billigste Möglichkeit“.
- **K032** vertauscht die Richtung (letzte Bahn von Brackwede statt nach Brackwede).
- **K102** rät bei Angst vor dem Umsteigen zum belebten Ort und zur Hilfe von Passanten, wie bei Bedrohung (die neue Sicherheitsregel hat auf andere Fragen abgefärbt).
- **K127, K150, K186, K211** sind schwächer als vorher (Fußweg statt Bahn, keine Werkstatt, „Hindernis melden“ fehlt, „Bahn-Hotline“ statt Mobilitätsservice).

**Deutlich besser als im ersten Lauf (alle drei Läufe zusammen betrachtet):**
- **Aufzug am Jahnplatz** (K047, K064, K167, K311, K286, K280): „Für den Aufzug dort habe ich keinen Live-Status, bitte vor Ort prüfen.“
- **K124** „Bus 25 fährt in 2 Minuten ab Jahnplatz“ (vorher nur Störungsprüfung).
- **K126** Anschluss weg: nennt jetzt die nächsten Abfahrten.
- **K313** empfiehlt kein Auto mehr für 20 Kinder.
- **K213 und K216** (Verfolgung, sichere Stelle): „Geh zu einem belebten Ort … und ruf die 110“.
- **K241** erklärt den Startbildschirm für iPhone und Android.
- **K249, K250, K251, K303**: Englisch, Türkisch, Arabisch und Türkisch beim Übersetzen werden in der Sprache beantwortet. K252 (Ukrainisch) bleibt deutsch.
- **K322 und K323**: nennen Quellen und wer hinter Flowtown steht.
- Keine erfundenen Telefonnummern, keine Fließtext-Werkzeugnamen mehr, „[object Object]“ ist weg (K181 ✓).

**Dritte Korrekturrunde (im Code, noch nicht auf dem Server geprüft):**
- Werkzeug `haltestelle` nimmt den Fahrplan der Stadt am Standort (K046).
- Eine leere Liste gemeldeter Aufzugsausfälle heißt jetzt „keine Meldung in Flowtown; das heißt nicht, dass alle Aufzüge funktionieren“ (K117).
- Neue Regeln: günstigster Weg ohne Preise, Pünktlichkeit nur aus Abfahrten, keine Suche nach Restaurants, Fahrdiensten, Apotheken, Ärzten, Werkstätten oder Ladestationen in der App, Standort teilen macht das Handy, Angst vor dem Umsteigen ohne Bedrohung bekommt keine Sicherheitsregel, „letzte Bahn von A nach B“ in der gefragten Richtung.
- Bei Fehler 400 von Mistral antwortet der Server einmal ohne Werkzeuge und schreibt den Grund ins Log (K157).

## Vierter Lauf: zweiter Gesamtlauf nach der dritten Korrekturrunde

| Ergebnis | Lauf 1 | Gesamtlauf 1 (Lauf 3) | Gesamtlauf 2 (Lauf 4) |
| --- | ---: | ---: | ---: |
| erfüllt | 163 | 190 | **199** |
| teils | 53 | 73 | 65 |
| nicht erfüllt | 26 | 7 | 8 |
| falsch | 37 | 9 | **7** |
| nicht prüfbar | 8 | 8 | 8 |

Gegenüber dem letzten Gesamtlauf sind 24 Fragen besser, 16 schlechter und 247 gleich. Gegenüber dem ersten Lauf sind 36 Fragen mehr erfüllt und 30 weniger falsch.

**Behoben:** K046 war noch Paderborn (jetzt Ursache gefunden, siehe unten), K117 („Dazu liegt keine Meldung vor, einen Live-Status gibt es für die Stadtbahn nicht“), K210 und K292 (keine erfundenen Funktionen mehr, „Standort teilen“ heißt jetzt „in der Nachrichten-App“, K209 ebenso), K018 („Zu Preisen habe ich keine Angabe“), K284 („Dazu habe ich keine Angabe“), K157 (kein Fehler 400 mehr), K186 („Hindernis melden“ auf der Karte), K216 („Geh zu einem belebten Ort, zum Beispiel der Haltestelle Rathaus. Ruf die 110.“), Ukrainisch (K252 jetzt auf Ukrainisch).

**Die sieben falschen Antworten:**
- **K008** erfindet „dein Startort ist nur 1 Minute entfernt“.
- **K022** „geh um 21:28 los“ bei einem Termin um halb zehn.
- **K034** „am Neujahrstag fährt der Bus nach Sonntagsfahrplan“, ohne Quelle.
- **K032** „nach Brackwede“, aber Linie 2 Richtung Sieker.
- **K046** Paderborn. **Ursache gefunden:** Im Fahrplan heißt der Bielefelder Hauptbahnhof „Bielefeld Hbf“. Die Suche nach „Hauptbahnhof“ fand deshalb den Hauptbahnhof von Paderborn, der ebenfalls im Fahrplan steht.
- **K162** „es gibt keine barrierefreien Restaurants“ statt „ich habe nichts gefunden“.
- **K215** nennt die Staatsanwaltschaft als Polizeiwache (die Ortssuche lieferte sie).

**Wichtige Beobachtung: Die Antworten schwanken von Lauf zu Lauf.** K022 war im Lauf davor ehrlich („nur ab jetzt“), jetzt wieder falsch. K116 und K129 wechseln zwischen gut und ungenau. Ein einzelner Lauf zeigt also nicht, ob etwas dauerhaft gelöst ist. Was die KI nur nach einer Regel im Text tut, ist unzuverlässig. Zuverlässig wird es nur, wenn der Server es erzwingt.

**Vierte Korrekturrunde (im Code, noch nicht auf dem Server geprüft):**
- **K046:** „Hauptbahnhof“ wird als „Hbf“ gesucht, und Haltestellen der eigenen Stadt gehen vor.
- **K022, K034, K021 und alle Zeitfragen:** Bei einer Uhrzeit, einem Wochentag, „morgen“ oder einem Feiertag hängt der Server der Frage einen Hinweis an („Die Werkzeuge kennen nur Zeiten ab jetzt …“). Das ist verlässlicher als die Regel im Text, weil es direkt an der Frage steht. Ausgenommen sind Fragen nach der letzten Bahn, nachts oder dem Rückweg.
- **K162, K215:** neue Regel „dazu habe ich nichts gefunden“ statt „es gibt keine“ und Ortstypen nur nach Namen.

**Was ich nicht verbessern kann, ohne die App zu ändern:**
- K001, K004, K009, K317: die 100-m-Rundung des Standorts (Entscheidung offen).
- K146, K147: Radwege und Radweganteil (E10).
- Zeitfragen (E1): die Assistenz bleibt bei „nur ab jetzt“.

## Fünfter Lauf: dritter Gesamtlauf mit Festantworten, Direktantworten und genauem Standort

| Ergebnis | Lauf 1 | Gesamtlauf 2 (Lauf 4) | Gesamtlauf 3 (Lauf 5) |
| --- | ---: | ---: | ---: |
| erfüllt | 163 | 199 | **244** |
| teils | 53 | 65 | 30 |
| nicht erfüllt | 26 | 8 | **2** |
| falsch | 37 | 7 | **3** |
| nicht prüfbar | 8 | 8 | 8 |

Gegenüber dem vorigen Gesamtlauf sind 55 Fragen besser, 11 schlechter und 221 gleich. Gegenüber dem ersten Lauf sind 81 Fragen mehr erfüllt und 34 weniger falsch.

**Was die Festantworten und Direktantworten gebracht haben:**
- 142 Katalogfragen werden jetzt vom Server selbst beantwortet. Davon sind 135 erfüllt. Die Antworten sind im Lauf wortgleich so erschienen, wie in der Tabelle.
- **Standort mit Adresse** (K001, K004, K009): „Du stehst bei Altstädter Kirchplatz 3, Bielefeld.“ und „… nicht bei Hausnummer 14.“ Der genaue Standort und die Adresse von HERE funktionieren.
- **Jahnplatz und Hauptbahnhof** (K046, K047, K064, K117, K284, K311): „Am Jahnplatz gibt es laut Fahrplan einen Aufzug. Für Aufzüge an Stadtbahn-Haltestellen gibt es keinen Live-Status, bitte vor Ort prüfen.“ Der Ostbahnhof (K284) wird nicht mehr erfunden, Paderborn (K046) kommt nicht mehr vor. Auch die Haltestellenliste (K314) kommt aus den Daten.
- **Zeitfragen, Preise, Notruf, Hilfe zur App, Fragen über Flowtown:** wortgleich, ohne erfundene Telefonnummern und ohne erfundene Menüpunkte.

**Die 3 falschen Antworten und was ich daraufhin getan habe:**
- **K032** „nach Brackwede“, aber Linie 2 Richtung Sieker: Die KI mischt die Richtungen. Bleibt offen (E12).
- **K109** „keine laute Baustelle“: Lärm kennen die Daten nicht. Jetzt Festantwort FA91, noch nicht im Lauf geprüft.
- **K146** „der Radweg ist sicher“: unbelegt. Jetzt Festantwort FA92, noch nicht im Lauf geprüft.

**Rückschritte (11), davon einer von mir verursacht:**
- **K156** „Offen bis 22 Uhr?“ → „ich kenne nur Öffnungszeiten ab jetzt“. Das hat mein Zeit-Hinweis ausgelöst: Er hängt der Frage den Satz „Die Werkzeuge kennen nur Zeiten ab jetzt“ an, auch bei Öffnungszeiten. Im Code behoben, noch nicht im Lauf geprüft.
- Übrige: K038, K069, K118, K159, K167, K184, K252, K259 sind schwächere, aber nicht falsche Antworten der KI.

**Noch nicht gut (nicht erfüllt):** K156 (siehe oben) und K317 („Rollstuhl und schlecht sehen: Wie finde ich den Aufzug?“ fragt wieder nach dem Standort; Regel ergänzt, Mehrfachprofil E16).

**Einordnung:** Die KI-Antworten (Wege, Vergleiche, Abfahrten) bleiben der Teil, der schwankt. Dort liegt der Rest: 30 mal „teils“, vor allem Rückfragen statt Hilfe, Fußweg statt Bahn, Auto vor Bahn bei Rollstuhl und Rollator, kühle Absagen bei Orten (Arzt, Apotheke, Werkstatt). Diese Fälle lösen die Werkzeug-Änderungen E8, E11 bis E16 und neue Quellen, nicht weitere Texte.

## Sechster Lauf: vierter Gesamtlauf (mit den Nachbesserungen FA91 und FA92)

| Ergebnis | Lauf 1 | Gesamtlauf 3 (Lauf 5) | Gesamtlauf 4 (Lauf 6) |
| --- | ---: | ---: | ---: |
| erfüllt | 163 | 244 | **251** |
| teils | 53 | 30 | 24 |
| nicht erfüllt | 26 | 2 | 2 |
| falsch | 37 | 3 | **2** |
| nicht prüfbar | 8 | 8 | 8 |

Gegenüber dem letzten Gesamtlauf sind 9 Fragen besser und 3 schlechter, der Rest ist gleich geblieben. Die Zahl der falschen Antworten ist von 37 im ersten Lauf auf 2 gesunken, die der erfüllten von 163 auf 251.

**Behoben seit dem letzten Lauf:** K109 („Zu Lärm habe ich keine Angabe“), K146 (kein „sicher“ mehr), K156 („Die Toilette am Theater am alten Markt hat durchgehend geöffnet“), K093 („Bahnhof“ wird zum Hauptbahnhof), K127 (Linie 61 als Alternative bei Bahnausfall), K038, K069, K159, K184.

**Die 2 falschen Antworten:**
- **K032** „nach Brackwede“, aber Linie 2 Richtung Sieker. Die KI mischt die Richtungen. Jetzt Festantwort FA94, die ehrlich sagt, dass Nachtverbindungen von A nach B nicht zuverlässig bekannt sind.
- **K138** „die Park + Ride-Anlagen haben keine Aufzüge“. Die Daten sagen dazu nichts. Jetzt Festantwort FA95.

**Die 2 nicht erfüllten:** K116 („Ist die Linie 4 pünktlich?“ → „keine Abfahrten gefunden“, E11) und K317 (jetzt Festantwort FA93). Dazu **K086** („Wird eine Störung auch angezeigt?“), die vorher gut beantwortet war und jetzt schwach ist.

**Einordnung:** Die Festantworten FA93 bis FA95 sind neu und noch nicht im Lauf geprüft, nur gegen den Katalog und die 28 Gegenfragen. Von den 145 Fragen, die der Server selbst beantwortet, sind 137 erfüllt. Die verbleibenden 24 „teils“-Antworten liegen bei den Fragen, die die KI formuliert (Wege, Orte, Vergleiche). Sie brauchen Werkzeug-Änderungen (E8, E11 bis E16), nicht weitere Festantworten.

## Siebter Lauf: fünfter Gesamtlauf (mit FA93 bis FA95)

| Ergebnis | Lauf 1 | Gesamtlauf 4 (Lauf 6) | Gesamtlauf 5 (Lauf 7) |
| --- | ---: | ---: | ---: |
| erfüllt | 163 | 251 | **252** |
| teils | 53 | 24 | 25 |
| nicht erfüllt | 26 | 2 | **0** |
| falsch | 37 | 2 | 2 |
| nicht prüfbar | 8 | 8 | 8 |

Gegenüber dem letzten Gesamtlauf sind 7 Fragen besser und 6 schlechter. Nichts ist mehr „nicht erfüllt“. Die Zahl der falschen Antworten ist von 37 auf 2 gesunken.

**Behoben:** K032 (FA94: ehrliche Aussage statt falscher Richtung), K138 (FA95), K317 (FA93), K252 (Ukrainisch wird auf Ukrainisch beantwortet), K086, K080, K116.

**Die 2 falschen Antworten:**
- **K118** „Welche Stadtbahnhaltestellen haben keinen Aufzug?“ → Fehler „Mistral antwortet mit 400“. **Ursache gefunden und behoben:** Die KI hatte mehr als drei Werkzeuge auf einmal angefordert. Der Server hat nur drei beantwortet, aber der KI alle gemeldet. Mistral lehnt das mit „Not the same number of function calls and responses“ ab. Der Fehler bestand schon im alten Code und war bisher nur nicht aufgefallen. Der Server meldet der KI jetzt genau die drei Aufrufe, die er beantwortet, und das ist mit einem Ersatz geprüft, der wie Mistral nachzählt. In diesem Fall hat auch mein Auffangversuch bei Fehler 400 nichts genützt, weil er dieselbe fehlerhafte Nachrichtenfolge mitschickte.
- **K169** „Nimm die Stadtbahn Linie 22“. Die 22 ist ein Bus. Ein Einzelfall der KI.

**Rückschritte:** K024 (Rad als bequemster Weg bei Profil Ruhe), K038, K069, K184 (schwächere Formulierungen), dazu die zwei falschen. Keiner davon ist ein Sicherheitsproblem.

**Einordnung:** Der Katalog ist ausgereizt. Vier Läufe in Folge liegen bei 244 bis 252 erfüllt, und die Änderungen zwischen den Läufen sind jetzt vor allem zufällige Schwankungen der KI bei Wegen und Orten. Weitere Festantworten bringen kaum noch etwas. Die restlichen 25 „teils“-Antworten brauchen Werkzeug-Änderungen (E8, E11 bis E16) und neue Quellen.

## So prüfen wir, ob es besser geworden ist

Auf dem Server nach `git pull` und `sudo systemctl restart flowtown` (die Assistenz läuft im Server, ein Neustart ist diesmal nötig):

```bash
cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs testlauf pruefkatalog.csv'
```

Nur die bisherigen Fehler, in wenigen Minuten:

```bash
cd /opt/flowtown/server && sudo bash -c 'set -a; . /etc/flowtown.env; node flowtown-server.mjs testlauf pruefkatalog.csv ergebnis:falsch,nicht\ erfüllt'
```
