#!/usr/bin/env python3
"""Fahrplan von moBiel aus dem deutschlandweiten DELFI-Datensatz (GTFS) herausziehen.

Aufruf: python3 fahrplan-bielefeld.py <gtfs.zip> <ziel.json> [Betreiber-Muster]

Liest die ZIP-Datei Zeile für Zeile, ohne sie auszupacken (stop_times.txt allein hat ausgepackt
etwa 4 GB). Behält die Fahrten der Betreiber, deren Name auf das Muster passt (Standard: moBiel),
und alle Züge (Nah- und Fernverkehr), die in Bielefeld halten, mit ihren Halten in der Region.
Schreibt eine kleine JSON-Datei: Haltestellen, Linien, Haltefolgen, Verkehrstage und Abfahrten.
Nur Standardbibliothek, damit es auf jedem Server mit Python 3 läuft.
"""
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import zipfile

CITY = (51.90, 52.12, 8.38, 8.70)     # Süd, Nord, West, Ost: Bielefeld
REGION = (51.55, 52.60, 7.70, 9.60)   # Halte von Zügen nur in diesem Rahmen (Ostwestfalen und Umgebung)
RAIL = {2} | set(range(100, 118))     # GTFS: Eisenbahn und erweiterte Bahn-Typen


def kind(rt):
    """0 StadtBahn, 3 Bus, 2 Zug (GTFS-Typen vereinheitlicht)"""
    return 2 if rt in RAIL else 0 if rt == 0 or 900 <= rt <= 906 or 400 <= rt <= 405 else 3


def inside(box, lat, lon):
    return box[0] <= lat <= box[1] and box[2] <= lon <= box[3]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    pattern = re.compile(sys.argv[3] if len(sys.argv) > 3 else 'moBiel', re.I)
    t0 = time.time()
    z = zipfile.ZipFile(src)
    rows = lambda name: csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig', newline=''))

    feed = next(rows('feed_info.txt'), {})
    agency_name = {a['agency_id']: a['agency_name'] for a in rows('agency.txt')}
    agencies = {k for k, v in agency_name.items() if pattern.search(v)}
    if not agencies:
        sys.exit('Kein Betreiber passt auf ' + pattern.pattern)

    # Haltestellen der Region vorab, damit beim großen Durchlauf jede Zeile schnell geprüft ist
    region, in_city = {}, set()
    for s in rows('stops.txt'):
        try:
            lat, lon = float(s['stop_lat']), float(s['stop_lon'])
        except ValueError:
            continue
        if inside(REGION, lat, lon):
            region[s['stop_id']] = [s['stop_id'], s['stop_name'], round(lat, 5), round(lon, 5)]
            if inside(CITY, lat, lon):
                in_city.add(s['stop_id'])

    routes, route_idx, rail_routes = [], {}, set()
    for r in rows('routes.txt'):
        rt = int(r['route_type'] or 3)
        if r['agency_id'] in agencies or rt in RAIL:
            route_idx[r['route_id']] = len(routes)
            if r['agency_id'] in agencies:
                routes.append([r['route_short_name'], kind(rt)])
            else:   # Züge: GTFS-Typ (101 ICE, 102 IC/EC) und Betreiber
                routes.append([r['route_short_name'], 2, rt, agency_name.get(r['agency_id'], '')])
                rail_routes.add(r['route_id'])

    trips, heads, head_idx = {}, [], {}
    for t in rows('trips.txt'):
        ri = route_idx.get(t['route_id'])
        if ri is None:
            continue
        h = t['trip_headsign']
        if h not in head_idx:
            head_idx[h] = len(heads)
            heads.append(h)
        # Züge: Zugnummer merken (ICE 549), und ob die Fahrt Bielefeld berührt, zeigt erst stop_times
        trips[t['trip_id']] = [ri, t['service_id'], head_idx[h], t['trip_short_name'] if t['route_id'] in rail_routes else '', [], t['route_id'] not in rail_routes]

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
            sid = v[col['stop_id']]
            if sid not in region:
                continue
            dep = v[col['departure_time']] or v[col['arrival_time']]
            if not dep:
                continue
            h, m, s = (int(x) for x in dep.split(':'))
            tr[4].append((int(v[col['stop_sequence']]), sid, h * 60 + m + (1 if s >= 30 else 0)))
            if sid in in_city:
                tr[5] = True

    trips = {k: tr for k, tr in trips.items() if tr[5]}
    used = {s for tr in trips.values() for _, s, _ in tr[4]}
    stops, stop_idx = [], {}
    for sid in sorted(used):
        stop_idx[sid] = len(stops)
        stops.append(region[sid])

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
        out_trips.append([tr[0], pat_idx[seq], tr[2], tr[1], times[0], [b - a for a, b in zip(times, times[1:])]] + ([tr[3]] if tr[3] else []))
    # nur Linien und Verkehrstage, die übrig bleiben
    used_routes = sorted({t[0] for t in out_trips})
    remap = {old: new for new, old in enumerate(used_routes)}
    for t in out_trips:
        t[0] = remap[t[0]]
    out_trips.sort(key=lambda t: (t[0], t[4]))
    used_services = {t[3] for t in out_trips}
    out = {
        'quelle': 'DELFI', 'lizenz': 'CC BY 4.0', 'stand': feed.get('feed_version', ''),
        'gilt': [feed.get('feed_start_date', ''), feed.get('feed_end_date', '')],
        'stops': stops, 'routes': [routes[i] for i in used_routes], 'heads': heads, 'patterns': patterns,
        'services': {k: sorted(v) for k, v in days.items() if v and k in used_services}, 'trips': out_trips
    }
    with open(dst + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(dst + '.tmp', dst)
    rail = sum(1 for t in out_trips if out['routes'][t[0]][1] == 2)
    print(f'{len(out_trips)} Fahrten, davon {rail} Züge, {len(used_routes)} Linien, {len(stops)} Haltestellen, {len(patterns)} Haltefolgen in {time.time() - t0:.0f} s')

if __name__ == '__main__':
    main()
