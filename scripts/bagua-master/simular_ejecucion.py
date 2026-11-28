"""Simulación de la ejecución de las rutas y del pesaje (DATOS SINTÉTICOS). La usa simular_operacion.py.

Arma, de forma determinista y anclada en el Bagua real:
  * los vehículos del servicio con su tara;
  * los puntos de control de cada programación, en orden, con la hora a la que el vehículo debería
    pasar: las horas salen de los tiempos de paso reales del plano «RUTAS CON TIEMPO» cuando la ruta
    los tiene; si no, de la posición a lo largo del recorrido;
  * la ejecución diaria desde el piloto (septiembre en dos rutas, octubre en todas): salida, paso por
    los puntos con atrasos realistas (lunes y días de lluvia más cargados, vehículos antiguos más
    lentos), averías ocasionales, viajes al relleno y tickets de balanza registrados en la oficina;
  * los avisos del servicio (feriados, mantenimiento, campaña) y el cambio de vehículo de la Ruta 2026.
"""
import datetime as dt
import math
import random
import re
from collections import defaultdict

import numpy as np
from shapely.geometry import Point

PILOTO = {'PRG-1001-CONV': dt.date(2026, 9, 1), 'PRG-2002-CONV': dt.date(2026, 9, 1)}
PILOTO_GENERAL = dt.date(2026, 10, 1)
# Kilos netos por ejecución (día normal) y viajes al relleno.
NETO_KG = {'PRG-1001-CONV': 6400, 'PRG-2001-CONV': 5900, 'PRG-2002-CONV': 4700, 'PRG-2026-CONV': 3300,
           'PRG-PRIM-CONV': 2900, 'PRG-RUTAS-COM': 2600}
VIAJES = {'PRG-2002-CONV': 2}
VEHICULOS = [
    ('EGW-781', 'Compactadora EGW-781 · 15 m³', 'compactadora', 15, 11200, 2014),
    ('EGW-782', 'Compactadora EGW-782 · 15 m³', 'compactadora', 15, 11600, 2019),
    ('EGX-114', 'Volquete EGX-114 · 12 m³', 'volquete', 12, 9400, 2011),
    ('EGX-115', 'Volquete EGX-115 · 12 m³', 'volquete', 12, 9700, 2016),
    ('MF-01', 'Motofurgón MF-01', 'motofurgon', 1.5, 420, 2021),
    ('MF-02', 'Motofurgón MF-02', 'motofurgon', 1.5, 420, 2021),
    ('MF-03', 'Motofurgón municipal MF-03', 'motofurgon', 1.5, 430, 2022),
]
CONDUCTORES = {
    'EGW-781': ('conductor.vasquez', 'Segundo Vásquez Mego · chofer de compactadora'),
    'EGW-782': ('conductor.tantalean', 'Elmer Tantaleán Cubas · chofer de compactadora'),
    'EGX-114': ('conductor.idrogo', 'Hernán Idrogo Burga · chofer de volquete'),
    'EGX-115': ('conductor.olano', 'Wilder Olano Requejo · chofer de volquete'),
    'MF-01': ('conductor.julca', 'Kevin Julca Saldaña · conductor de motofurgón'),
    'MF-02': ('conductor.julca', 'Kevin Julca Saldaña · conductor de motofurgón'),
    'MF-03': ('conductor.llatas', 'Teodoro Llatas Núñez · conductor de motofurgón'),
}
BALANZA = ('tecnico.balanza', 'Marleny Requejo Cieza · asistente de la Gerencia (balanza)')
AVERIAS = ['Llanta pinchada en la ruta', 'Falla del sistema hidráulico de la compactadora',
           'Lluvia intensa: calles anegadas', 'Falla eléctrica del vehículo', 'Falta de combustible']
VIAJE_MIN = {'relleno': (24, 34), 'planta': (10, 16), 'acopio': (8, 14)}
DESTINO = {'convencional': 'relleno', 'comercial': 'relleno', 'organicos': 'planta', 'reciclables': 'acopio'}
PLACA = re.compile(r'\b([A-Z]{3}-\d{3}|MF-\d{2})\b')
CAMBIO_2026 = dt.date(2026, 11, 2)  # desde aquí la Ruta 2026 la cubre el volquete EGX-115


def placa(vehiculo):
    m = PLACA.search(vehiculo or '')
    return m.group(1) if m else None


# ---------------------------------------------------------------- puntos de control
def place_name(streets, pt, fallback):
    near = []
    for i in streets.tree.query(pt, predicate='dwithin', distance=28):
        name = streets.names[i]
        if name:
            near.append((streets.lines[i].distance(pt), name))
    near.sort()
    names = []
    for _, name in near:
        if name not in names:
            names.append(name)
    short = [_short(n) for n in names]
    if len(short) >= 2:
        return f'{short[0]} con {short[1]}'
    street, number = streets.address(pt)
    if street:
        return f'{street}, cuadra {max(1, (number - 100) // 100 + 1)}'
    # Lejos de una calle con nombre (periferia): la calle con nombre más cercana como referencia.
    found = streets.nearest_named(pt, 400)
    if found:
        return f'Cerca de {_short(streets.names[found[1]])}'
    return fallback


def cuadra_name(streets, pt):
    street, number = streets.address(pt)
    return f'{street}, cuadra {max(1, (number - 100) // 100 + 1)}' if street else None


def _short(name):
    for long_, short in (('Avenida ', 'Av. '), ('Jirón ', 'Jr. '), ('Pasaje ', 'Psje. '),
                         ('Prolongación ', 'Prol. '), ('Carretera ', 'Carr. ')):
        if name.startswith(long_):
            return short + name[len(long_):]
    return name


def ordered_path(geom, start=None, step=120.0):
    """Recorrido ordenado de un trazo hecho de tramos sueltos: vecino más cercano entre muestras."""
    samples = []
    for line in getattr(geom, 'geoms', [geom]):
        n = max(1, int(line.length // step))
        samples += [line.interpolate(i / n, normalized=True) for i in range(n + 1)]
    pts = np.asarray([(p.x, p.y) for p in samples])
    if start is None:
        center = pts.mean(axis=0)
        first = int(np.argmax(((pts - center) ** 2).sum(axis=1)))
    else:
        first = int(np.argmin(((pts - [start.x, start.y]) ** 2).sum(axis=1)))
    used = np.zeros(len(pts), bool)
    order, cur = [first], first
    used[first] = True
    for _ in range(len(pts) - 1):
        d = ((pts - pts[cur]) ** 2).sum(axis=1)
        d[used] = np.inf
        cur = int(np.argmin(d))
        if not np.isfinite(d[cur]):
            break
        used[cur] = True
        order.append(cur)
    path = pts[order]
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(path, axis=0).T))]
    return path, seg


def control_points(progs, routes, anchors, streets, to_utm):
    by_route = defaultdict(list)
    for a in anchors:
        by_route[a['ruta']].append(a)
    conv = {p['ruta']: p for p in progs if p['servicio'] == 'convencional'}
    out = []
    for prog in progs:
        code = prog['ruta']
        c = conv.get(code, prog)
        window = [a for a in by_route.get(code, []) if c['inicio'] <= a['min'] <= c['fin']]
        chosen = []
        if len(window) >= 5:
            last = None
            for a in sorted(window, key=lambda a: (a['min'], a['id'])):
                if last and (a['min'] - last['min'] < 6 or math.hypot(a['x'] - last['x'], a['y'] - last['y']) < 200):
                    continue
                chosen.append(a)
                last = a
            if len(chosen) > 16:
                idx = np.linspace(0, len(chosen) - 1, 16).round().astype(int)
                chosen = [chosen[i] for i in sorted(set(idx))]
            span_c = max(c['fin'] - c['inicio'], 1)
            rows = []
            for a in chosen:
                minute = a['min'] if prog is c else round(prog['inicio'] + (a['min'] - c['inicio']) * (prog['fin'] - prog['inicio']) / span_c)
                rows.append((minute, a['x'], a['y'], 'plano'))
        else:
            marker = next((m for m in routes[code]['marcadores'] if m.get('tipo') == 'inicio'), None)
            start = None
            if marker:
                start = Point(*to_utm(marker['lon'], marker['lat']))
            path, cum = ordered_path(routes[code]['geom'], start)
            total = cum[-1] or 1
            n = int(min(14, max(5, total // 650)))
            rows = []
            for k in range(n):
                target = total * (k + 0.5) / n
                i = int(np.searchsorted(cum, target))
                i = min(i, len(path) - 1)
                minute = round(prog['inicio'] + 10 + (prog['fin'] - prog['inicio'] - 20) * target / total)
                rows.append((minute, path[i][0], path[i][1], 'recorrido'))
        used = set()
        for k, (minute, x, y, base) in enumerate(rows, start=1):
            pt = Point(x, y)
            name = place_name(streets, pt, f'Punto {k}')
            if name in used:  # dos puntos junto al mismo cruce: se nombra por la cuadra
                name = cuadra_name(streets, pt) or name
            if name in used:
                name = f'{name} · tramo {sum(1 for u in used if u.startswith(name)) + 1}'
            used.add(name)
            out.append({'id': f"{prog['id']}-P{k:02d}", 'prog': prog['id'], 'orden': k, 'min': int(minute),
                        'x': x, 'y': y, 'base': base, 'nombre': name})
    return out


# ---------------------------------------------------------------- ejecuciones
def stamp(day, minutes, seconds=0):
    t = dt.datetime.combine(day, dt.time(0)) + dt.timedelta(minutes=minutes, seconds=seconds)
    return t.strftime('%Y-%m-%d %H:%M:%S') + '-05'


def simulate(rng, progs, points, destinations, hoy, now_min, feriados, uid, lonlat, inicio):
    """Ejecuciones, eventos y tickets. `destinations`: {'relleno': (x, y), 'planta': ..., 'acopio': ...}."""
    pts = defaultdict(list)
    for p in points:
        pts[p['prog']].append(p)
    for v in pts.values():
        v.sort(key=lambda p: p['orden'])
    tara = {v[0]: v[4] for v in VEHICULOS}
    rain = {}

    def rainy(day):
        if day not in rain:
            r = random.Random(f'lluvia-{day}')
            rain[day] = r.random() < {9: 0.08, 10: 0.16, 11: 0.2}.get(day.month, 0.05)
        return rain[day]

    # Avisos: feriados, mantenimiento con recuperación anunciada y campaña informativa.
    avisos, suspended = [], defaultdict(set)
    for f, titulo, mensaje in [
        (dt.date(2026, 10, 8), 'Jueves 8 de octubre, feriado: sin recolección',
         'Por el feriado del Combate de Angamos no hay recolección convencional ni selectiva. '
         'El servicio se normaliza el viernes 9 en su horario habitual.'),
        (dt.date(2026, 12, 8), 'Feriados del 8 y 9 de diciembre: sin recolección',
         'El martes 8 (Inmaculada Concepción) y el miércoles 9 (Batalla de Ayacucho) no hay recolección. '
         'Por favor no saque sus residuos esos días; el servicio vuelve el jueves 10.'),
    ]:
        hasta = f + dt.timedelta(days=1) if f.month == 12 else f
        avisos.append({'id': uid('aviso', f), 'tipo': 'suspension', 'titulo': titulo, 'mensaje': mensaje,
                       'progs': [], 'desde': f, 'hasta': hasta, 'creado': f - dt.timedelta(days=4)})
    maintenance = [('PRG-2001-CONV', dt.date(2026, 10, 20), 'EGW-782'), ('PRG-1001-CONV', dt.date(2026, 11, 11), 'EGW-781')]
    for prog_id, day, plate in maintenance:
        prog = next(p for p in progs if p['id'] == prog_id)
        nxt = day + dt.timedelta(days=1)
        avisos.append({'id': uid('aviso', prog_id, day), 'tipo': 'suspension',
                       'titulo': f"{prog['nombre'].split(' · ')[-1]}: sin servicio el {day:%d/%m}",
                       'mensaje': f'La compactadora {plate} está en mantenimiento preventivo. La recolección de esta '
                                  f'ruta se recupera el {nxt:%d/%m} en el mismo horario.',
                       'progs': [prog_id], 'desde': day, 'hasta': day, 'creado': day - dt.timedelta(days=1)})
        suspended[prog_id].add(day)
    avisos.append({'id': uid('aviso', 'campana-dic'), 'tipo': 'informativo',
                   'titulo': 'Campaña «Bagua Recicla» en la Plaza de Armas',
                   'mensaje': 'El sábado 5 de diciembre, de 8:00 a 13:00, entregue papel, cartón, botellas y latas '
                              'en el módulo de la Plaza de Armas. Los inscritos en el programa reciben su sticker.',
                   'progs': [], 'desde': hoy, 'hasta': dt.date(2026, 12, 5), 'creado': hoy - dt.timedelta(days=2)})
    for a in avisos:
        if a['tipo'] == 'suspension' and not a['progs']:
            d = a['desde']
            while d <= a['hasta']:
                for p in progs:
                    suspended[p['id']].add(d)
                d += dt.timedelta(days=1)

    ejecuciones, eventos, pesajes = [], [], []
    ticket_no = 41250
    forced_missed = None
    forced_break = None
    for prog in progs:
        start = PILOTO.get(prog['id'], PILOTO_GENERAL)
        destino = DESTINO[prog['servicio']]
        plist = pts[prog['id']]
        if not plist:
            continue
        # Antes del piloto el chofer no registraba la ruta, pero la balanza del relleno ya pesaba cada
        # viaje: esos tickets existen (sin ejecución asociada) y la oficina los registra igual.
        if destino == 'relleno' and inicio < start:
            for n in range((start - inicio).days):
                day = inicio + dt.timedelta(n)
                if day.isoweekday() not in prog['dias'] or day in feriados or day in suspended[prog['id']]:
                    continue
                r = random.Random(f"{prog['id']}|{day}|balanza")
                if r.random() < 0.012:
                    continue
                vehiculo = prog['vehiculo']
                if prog['id'] == 'PRG-2026-CONV' and day < CAMBIO_2026:
                    vehiculo = 'Compactadora EGW-781 · 15 m³'
                t_kg = tara.get(placa(vehiculo), 9500)
                trips = VIAJES.get(prog['id'], 2 if (prog['id'] == 'PRG-1001-CONV' and day.isoweekday() == 1 and r.random() < 0.5) else 1)
                factor = (1.15 if day.isoweekday() == 1 else 1.0) * (1.25 if (day - dt.timedelta(1)) in feriados else 1.0)
                factor *= (0.93 if day.month == 7 else 1.0) * r.lognormvariate(0, 0.11)
                neto = NETO_KG.get(prog['id'], 3000) * factor
                shares = [1.0] if trips == 1 else [0.56, 0.44]
                end = plist[-1]['min'] + r.uniform(0, 25) + r.uniform(*VIAJE_MIN['relleno'])
                for k in range(trips):
                    if r.random() < 0.004:
                        continue
                    hora = end + k * r.uniform(70, 95) + r.uniform(4, 11)
                    net = round(neto * shares[k] / 10) * 10
                    pesajes.append({'id': uid('pesaje', prog['id'], day, k), 'ejecucion': None, 'fecha': day,
                                    'hora': f'{int(hora // 60) % 24:02d}:{int(hora % 60):02d}', 'ticket': '',
                                    'vehiculo': vehiculo, 'bruto': t_kg + net, 'tara': t_kg,
                                    'creado': stamp(day + dt.timedelta(days=1), 9 * 60 + r.randint(0, 150))})
        days = [start + dt.timedelta(n) for n in range((hoy - start).days + 1)]
        days = [d for d in days if d.isoweekday() in prog['dias'] and d not in feriados and d not in suspended[prog['id']]]
        if prog['id'] == 'PRG-2026-CONV':
            recent = [d for d in days if hoy - dt.timedelta(6) <= d <= hoy - dt.timedelta(2)]
            forced_missed = recent[-1] if recent else None
        if prog['id'] == 'PRG-2002-CONV':
            recent = [d for d in days if hoy - dt.timedelta(6) <= d <= hoy - dt.timedelta(1)]
            forced_break = recent[0] if recent else None
        for day in days:
            r = random.Random(f"{prog['id']}|{day}")
            if day == forced_missed and prog['id'] == 'PRG-2026-CONV':
                continue
            if day < hoy and r.random() < 0.012:
                continue  # el vehículo no salió y nadie lo avisó
            plate = placa(prog['vehiculo'])
            vehiculo = prog['vehiculo']
            if prog['id'] == 'PRG-2026-CONV' and day < CAMBIO_2026:
                plate, vehiculo = 'EGW-781', 'Compactadora EGW-781 · 15 m³'
            conductor = CONDUCTORES.get(plate, CONDUCTORES['MF-01'])[0]
            delay = min(max(r.gauss(3, 6), -8), 40)
            if day.isoweekday() == 1:
                delay += 4
            if plate in ('EGX-114', 'EGW-781'):
                delay += 2.5
            wet = rainy(day)
            if wet:
                delay += r.uniform(4, 12)
            months = (day.year - start.year) * 12 + day.month - start.month
            adoption = [0.78, 0.88, 0.93][min(months, 2)]
            salida = plist[0]['min'] - 12 + delay
            breaks_at = None
            if (day == forced_break and prog['id'] == 'PRG-2002-CONV') or (day < hoy and r.random() < 0.014):
                breaks_at = r.randint(2, max(2, len(plist) - 2))
            eid = uid('ejecucion', prog['id'], day)
            evs, drift, last = [], 0.0, salida
            if day == hoy and salida > now_min:
                continue
            first = plist[0]
            sx, sy = first['x'] + r.uniform(-250, 250), first['y'] + r.uniform(-250, 250)
            evs.append(('salida', salida, None, None, (sx, sy), r.uniform(5, 20)))
            broke = False
            for k, p in enumerate(plist, start=1):
                drift += r.gauss(0.35, 1.3) + (0.4 if wet else 0)
                t = max(p['min'] + delay + drift, last + 1.2)
                last = t
                if breaks_at and k == breaks_at:
                    broke = True
                    break
                if r.random() > adoption:
                    continue
                gps = r.random() > 0.08
                pos = (p['x'] + r.gauss(0, 12), p['y'] + r.gauss(0, 12)) if gps else None
                evs.append(('paso', t, p['id'], None, pos, r.uniform(4, 25) if gps else None))
            estado = 'interrumpida' if broke else 'completada'
            motivo = r.choice(AVERIAS) if broke else None
            trips = 0
            if not broke:
                lo, hi = VIAJE_MIN[destino]
                trips = VIAJES.get(prog['id'], 2 if (prog['id'] == 'PRG-1001-CONV' and day.isoweekday() == 1 and r.random() < 0.5) else 1)
                if destino != 'relleno':
                    trips = 1
                t = last + r.uniform(lo, hi)
                dx, dy = destinations[destino]
                for n in range(trips):
                    evs.append(('llegada', t, None, destino, (dx + r.gauss(0, 15), dy + r.gauss(0, 15)), r.uniform(5, 15)))
                    t += r.uniform(70, 95)
            if day == hoy:
                evs = [e for e in evs if e[1] <= now_min]
                estado = 'completada' if any(e[0] == 'llegada' for e in evs) else ('interrumpida' if broke else 'en_curso')
                if broke and evs[-1][1] < now_min - 5:
                    estado = 'interrumpida'
            ejecuciones.append({'id': eid, 'prog': prog['id'], 'ruta': prog['ruta'], 'servicio': prog['servicio'],
                                'fecha': day, 'vehiculo': vehiculo, 'conductor': conductor, 'estado': estado,
                                'motivo': motivo, 'clave': uid('clave-ejecucion', eid), 'creado': stamp(day, salida, 20)})
            for i, (tipo, minutes, punto, dest, pos, prec) in enumerate(evs):
                lon, lat = lonlat(*pos) if pos else (None, None)
                sent = minutes + (r.uniform(0.05, 0.6) if r.random() > 0.1 else r.uniform(5, 40))  # sin señal: llega luego
                eventos.append({'id': uid('evento', eid, i), 'ejecucion': eid, 'tipo': tipo,
                                'momento': stamp(day, int(minutes), int((minutes % 1) * 60)), 'punto': punto,
                                'destino': dest, 'lon': lon, 'lat': lat, 'precision': round(prec, 1) if prec else None,
                                'clave': uid('clave-evento', eid, i), 'registrado': stamp(day, int(sent), int((sent % 1) * 60))})
            # Tickets de balanza: la oficina los registra al día siguiente (los más recientes pueden faltar).
            if destino == 'relleno' and not broke:
                factor = (1.15 if day.isoweekday() == 1 else 1.0) * (1.25 if (day - dt.timedelta(1)) in feriados else 1.0)
                factor *= (1.06 if wet else 1.0) * r.lognormvariate(0, 0.11)
                neto = NETO_KG.get(prog['id'], 3000) * factor
                arrivals = [e for e in evs if e[0] == 'llegada']
                shares = [1.0] if len(arrivals) == 1 else [0.56, 0.44]
                for n, ev in enumerate(arrivals):
                    ticket_no += 1
                    if day == hoy:
                        continue
                    age = (hoy - day).days
                    if (age <= 2 and r.random() < 0.4) or r.random() < 0.004:
                        continue
                    t_kg = tara.get(plate, 9500)
                    net = round(neto * shares[min(n, len(shares) - 1)] / 10) * 10
                    hora = ev[1] + r.uniform(4, 11)
                    reg_day = day + dt.timedelta(days=1 if (day.isoweekday() < 6 or r.random() < 0.3) else 2)
                    pesajes.append({'id': uid('pesaje', eid, n), 'ejecucion': eid, 'fecha': day,
                                    'hora': f'{int(hora // 60) % 24:02d}:{int(hora % 60):02d}',
                                    'ticket': f'RS-{ticket_no:06d}', 'vehiculo': vehiculo,
                                    'bruto': t_kg + net, 'tara': t_kg,
                                    'creado': stamp(reg_day, 9 * 60 + r.randint(0, 150))})
    # Numeración de la balanza en orden de llegada.
    for n, w in enumerate(sorted(pesajes, key=lambda w: (w['fecha'], w['hora'], w['id'])), start=1):
        w['ticket'] = f'RS-{38900 + n:06d}'
    cambios = [{'id': uid('cambio', 'PRG-2026-CONV', CAMBIO_2026), 'prog': 'PRG-2026-CONV',
                'anterior': {'vehiculo': 'Compactadora EGW-781 · 15 m³', 'vehiculoPlaca': 'EGW-781'},
                'nuevo': {'vehiculo': 'Volquete EGX-115 · 12 m³', 'vehiculoPlaca': 'EGX-115'},
                'motivo': 'La compactadora no entra a las calles sin asfaltar de Tomaque y Brujo Pata en temporada '
                          'de lluvias; el volquete sí. La compactadora EGW-781 queda para la Ruta 1001.',
                'desde': CAMBIO_2026}]
    return ejecuciones, eventos, pesajes, avisos, cambios
