#!/usr/bin/env python3
"""Fahrplan von moBiel aus dem deutschlandweiten DELFI-Datensatz (GTFS) herausziehen.

Aufruf: python3 fahrplan-bielefeld.py <gtfs.zip> <ziel.json> [Betreiber-Muster]

Liest die ZIP-Datei Zeile für Zeile, ohne sie auszupacken (stop_times.txt allein hat ausgepackt
etwa 4 GB). Behält nur die Fahrten der Betreiber, deren Name auf das Muster passt (Standard: moBiel),
und schreibt eine kleine JSON-Datei: Haltestellen, Linien, Haltefolgen, Verkehrstage und Abfahrten.
Nur Standardbibliothek, damit es auf jedem Server mit Python 3 läuft.
"""
import csv
import datetime as dt
import io
import json
import re
import sys
import time
import zipfile


def main():
    src, dst = sys.argv[1], sys.argv[2]
    pattern = re.compile(sys.argv[3] if len(sys.argv) > 3 else 'moBiel', re.I)
    t0 = time.time()
    z = zipfile.ZipFile(src)
    rows = lambda name: csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig', newline=''))

    feed = next(rows('feed_info.txt'), {})
    agencies = {a['agency_id'] for a in rows('agency.txt') if pattern.search(a['agency_name'])}
    if not agencies:
        sys.exit('Kein Betreiber passt auf ' + pattern.pattern)

    routes, route_idx = [], {}
    for r in rows('routes.txt'):
        if r['agency_id'] in agencies:
            route_idx[r['route_id']] = len(routes)
            routes.append([r['route_short_name'], int(r['route_type'] or 3)])

    trips, heads, head_idx = {}, [], {}
    for t in rows('trips.txt'):
        ri = route_idx.get(t['route_id'])
        if ri is None:
            continue
        h = t['trip_headsign']
        if h not in head_idx:
            head_idx[h] = len(heads)
            heads.append(h)
        trips[t['trip_id']] = [ri, t['service_id'], head_idx[h], t['direction_id'] or '0', []]

    # stop_times: erst nur das erste Feld prüfen, das ist bei 4 GB der teure Teil
    with z.open('stop_times.txt') as f:
        text = io.TextIOWrapper(f, encoding='utf-8-sig', newline='')
        head = next(csv.reader([text.readline()]))
        col = {k: i for i, k in enumerate(head)}
        for line in text:
            tid = line.split(',', 1)[0].strip('"')
            tr = trips.get(tid)
            if tr is None:
                continue
            v = next(csv.reader([line]))
            dep = v[col['departure_time']] or v[col['arrival_time']]
            if not dep:
                continue
            h, m, s = (int(x) for x in dep.split(':'))
            tr[4].append((int(v[col['stop_sequence']]), v[col['stop_id']], h * 60 + m + (1 if s >= 30 else 0)))

    used = {s for tr in trips.values() for _, s, _ in tr[4]}
    stops, stop_idx = [], {}
    for s in rows('stops.txt'):
        if s['stop_id'] in used:
            stop_idx[s['stop_id']] = len(stops)
            stops.append([s['stop_id'], s['stop_name'], round(float(s['stop_lat']), 5), round(float(s['stop_lon']), 5)])

    # Verkehrstage je Dienst: Wochentage im Zeitraum plus Ausnahmen
    services = {tr[1] for tr in trips.values()}
    days = {}
    for c in rows('calendar.txt'):
        if c['service_id'] not in services:
            continue
        d, end = dt.datetime.strptime(c['start_date'], '%Y%m%d').date(), dt.datetime.strptime(c['end_date'], '%Y%m%d').date()
        flags = [c[k] == '1' for k in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')]
        on = days.setdefault(c['service_id'], set())
        while d <= end:
            if flags[d.weekday()]:
                on.add(d.strftime('%Y%m%d'))
            d += dt.timedelta(days=1)
    for c in rows('calendar_dates.txt'):
        if c['service_id'] not in services:
            continue
        on = days.setdefault(c['service_id'], set())
        (on.add if c['exception_type'] == '1' else on.discard)(c['date'])

    # gleiche Haltefolgen zusammenfassen; je Fahrt nur Abfahrt am ersten Halt und Abstände in Minuten
    patterns, pat_idx, out_trips = [], {}, []
    for tr in trips.values():
        st = sorted(tr[4])
        if len(st) < 2:
            continue
        seq = tuple(stop_idx[s] for _, s, _ in st)
        if seq not in pat_idx:
            pat_idx[seq] = len(patterns)
            patterns.append(list(seq))
        times = [m for _, _, m in st]
        out_trips.append([tr[0], pat_idx[seq], tr[2], tr[1], times[0], [b - a for a, b in zip(times, times[1:])]])
    out_trips.sort(key=lambda t: (t[0], t[4]))

    out = {
        'quelle': 'DELFI', 'lizenz': 'CC BY 4.0', 'stand': feed.get('feed_version', ''),
        'gilt': [feed.get('feed_start_date', ''), feed.get('feed_end_date', '')],
        'stops': stops, 'routes': routes, 'heads': heads, 'patterns': patterns,
        'services': {k: sorted(v) for k, v in days.items() if v}, 'trips': out_trips
    }
    with open(dst + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    import os
    os.replace(dst + '.tmp', dst)
    print(f'{len(routes)} Linien, {len(out_trips)} Fahrten, {len(stops)} Haltestellen, {len(patterns)} Haltefolgen in {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
