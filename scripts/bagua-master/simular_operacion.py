"""Simulación realista de la operación del servicio de residuos sólidos de Bagua (DATOS SINTÉTICOS).

Mientras la Gerencia no entregue información oficial, el producto se demuestra con datos simulados
anclados en el Bagua real: edificios de Overture, calles con nombre, sectores rotulados en los
planos municipales, rutas DWG ajustadas a las calles y los tiempos de paso documentados en
«RUTAS CON TIEMPO.dwg». Las personas, documentos, predios, padrones, visitas, entregas y
toneladas son ficticios y deterministas (misma semilla ⇒ mismo resultado).

Escribe solo en destinos local/test habilitados (BAGUA_DEPLOYMENT y BAGUA_FIXTURE_DATABASE, igual
que gestion:seed) y solo bajo la fuente sintética SINTETICO-LOCAL-V1. Reemplaza en una transacción
lo que ella misma generó (códigos BG-, SIM-, promotor.*) sin tocar ningún otro registro.

  .venv-gis/Scripts/python scripts/bagua-master/simular_operacion.py
"""
import csv
import datetime as dt
import io
import json
import math
import os
import random
import subprocess
import uuid
from collections import defaultdict
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, MultiLineString, Point, shape

import simular_ejecucion as ejec

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/bagua-master'
OUT = DATA / 'simulacion'
TO_UTM = Transformer.from_crs(4326, 32717, always_xy=True)
TO_GEO = Transformer.from_crs(32717, 4326, always_xy=True)
NS = uuid.UUID('6f1d2c84-5b1e-4c3a-9a40-3b2a1f0c9e11')
SEED = 20261122
SOURCE = 'SINTETICO-LOCAL-V1'
EVIDENCIA = 'Simulación realista Bagua v1 · datos sintéticos para demostración; no es información municipal.'
INICIO = dt.date(2026, 5, 4)
# «Hoy» es el día en que corre la simulación (hora de Lima); se puede fijar con SIM_HOY y SIM_AHORA.
_LIMA_NOW = dt.datetime.now(dt.timezone(dt.timedelta(hours=-5)))
HOY = dt.date.fromisoformat(os.environ['SIM_HOY']) if os.environ.get('SIM_HOY') else _LIMA_NOW.date()
AHORA_MIN = (int(os.environ['SIM_AHORA'][:2]) * 60 + int(os.environ['SIM_AHORA'][3:5]) if os.environ.get('SIM_AHORA')
             else _LIMA_NOW.hour * 60 + _LIMA_NOW.minute)
FERIADOS = {dt.date(2026, 6, 7), dt.date(2026, 6, 29), dt.date(2026, 7, 23), dt.date(2026, 7, 28),
            dt.date(2026, 7, 29), dt.date(2026, 8, 6), dt.date(2026, 8, 30), dt.date(2026, 10, 8),
            dt.date(2026, 11, 1), dt.date(2026, 12, 8), dt.date(2026, 12, 9), dt.date(2026, 12, 25)}
RUTAS_TIEMPO = ['MUN-1001', 'MUN-2001', 'MUN-2002', 'CAD-PRIMAVERA', 'CAD-RUTAS']
QR_DESDE = dt.date(2026, 9, 1)  # entrega de stickers QR a los inscritos
CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'


def qr_code(rng):
    """Mismo formato que backend/src/shared/codigo-qr.ts: 7 aleatorios + control con pesos impares."""
    body = ''.join(rng.choice(CROCKFORD) for _ in range(7))
    total = sum((2 * i + 1) * CROCKFORD.index(ch) for i, ch in enumerate(body))
    return body + CROCKFORD[total % 32]


def uid(*parts):
    return str(uuid.uuid5(NS, '|'.join(map(str, parts))))


def utm(geom):
    return shapely.transform(geom, lambda xy: np.column_stack(TO_UTM.transform(xy[:, 0], xy[:, 1])))


def lonlat(x, y):
    lon, lat = TO_GEO.transform(x, y)
    return round(lon, 7), round(lat, 7)


def read_lines(path):
    with path.open(encoding='utf8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


# ---------------------------------------------------------------- base de datos
def psql(sql, stdin_extra=''):
    result = subprocess.run(
        ['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
         'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        cwd=ROOT, input=sql + stdin_extra, text=True, capture_output=True, encoding='utf8')
    if result.returncode != 0:
        raise SystemExit(f'psql falló:\n{result.stderr[-4000:]}')
    return result.stdout


def env_file():
    values = {}
    for line in (ROOT / '.env').read_text(encoding='utf8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def assert_fixture_target():
    """Misma regla que backend/src/db/fixture-target.ts: destino local/test y base designada."""
    env = env_file()
    if env.get('BAGUA_DEPLOYMENT') not in ('local', 'test') or not env.get('BAGUA_FIXTURE_DATABASE'):
        raise SystemExit('Destino no habilitado para datos sintéticos (BAGUA_DEPLOYMENT/BAGUA_FIXTURE_DATABASE).')
    current = psql('SELECT current_database();').strip()
    if current != env['BAGUA_FIXTURE_DATABASE']:
        raise SystemExit('La base conectada no es la designada para datos sintéticos.')


def query_json(sql):
    out = psql(f"SELECT coalesce(json_agg(t),'[]') FROM ({sql}) t;").strip()
    return json.loads(out)


# ---------------------------------------------------------------- catálogos de nombres
NOMBRES_M = ['José', 'Luis', 'Carlos', 'Juan', 'Miguel', 'Jorge', 'Víctor', 'Manuel', 'Pedro', 'César',
             'Segundo', 'Wilmer', 'Edwin', 'Elmer', 'Nilton', 'Hernán', 'Walter', 'Julio', 'Óscar', 'Raúl',
             'Fernando', 'Alberto', 'Roberto', 'Marco', 'Jhonatan', 'Kevin', 'Anderson', 'Deyvis', 'Franklin',
             'Teodoro', 'Eusebio', 'Santos', 'Alejandro', 'Ricardo', 'Wilder', 'Isaías', 'Rubén', 'Ángel']
NOMBRES_F = ['María', 'Rosa', 'Carmen', 'Ana', 'Luz', 'Juana', 'Elena', 'Gladys', 'Marleny', 'Nelly',
             'Yolanda', 'Doris', 'Flor', 'Milagros', 'Patricia', 'Sonia', 'Elizabeth', 'Lucía', 'Rocío',
             'Yesenia', 'Karina', 'Maribel', 'Edith', 'Norma', 'Teresa', 'Esther', 'Silvia', 'Rosario',
             'Celinda', 'Nancy', 'Delia', 'Mercedes', 'Lourdes', 'Fiorella', 'Diana', 'Sheyla', 'Melissa']
APELLIDOS = ['Vásquez', 'Díaz', 'Fernández', 'Guevara', 'Tapia', 'Chávez', 'Huamán', 'Mego', 'Delgado',
             'Rojas', 'Torres', 'Cubas', 'Montenegro', 'Becerra', 'Saldaña', 'Bustamante', 'Núñez', 'Pérez',
             'Sánchez', 'Ramírez', 'Cieza', 'Campos', 'Cruz', 'Mondragón', 'Rimarachín', 'Tantaleán',
             'Idrogo', 'Burga', 'Silva', 'Herrera', 'Julca', 'Llatas', 'Olano', 'Requejo', 'Zamora',
             'Villegas', 'Altamirano', 'Carranza', 'Malca', 'Paredes', 'Coronel', 'Gálvez', 'Muñoz',
             'Castro', 'Rodríguez', 'García', 'Flores', 'Ruiz', 'Vargas', 'Medina', 'Hoyos', 'Tenorio',
             'Fustamante', 'Correa', 'Oblitas', 'Calderón', 'Uriarte', 'Chuquizuta', 'Ushiñahua', 'Yalta']
JURIDICAS = ['Inversiones {a} E.I.R.L.', 'Comercial {a} S.A.C.', 'Distribuidora {a} E.I.R.L.',
             'Negociaciones {a} S.R.L.', 'Servicios Generales {a} S.A.C.']
ESTABLECIMIENTOS = {
    'Comercio': ['Bodega {n}', 'Minimarket {s}', 'Librería {s}', 'Ferretería {s}', 'Botica {s}',
                 'Panadería {s}', 'Bazar {s}', 'Tienda de abarrotes {n}', 'Distribuidora {s}'],
    'Restaurante': ['Restaurante {s}', 'Pollería {s}', 'Cevichería {s}', 'Juguería {n}', 'Chifa {s}',
                    'Menú {n}'],
    'Hospedaje': ['Hostal {s}', 'Hospedaje {s}'],
    'Institución educativa': ['I.E. N.° {num}', 'I.E.I. N.° {num2}'],
    'Institución pública': ['Oficina zonal {s}', 'Centro de salud {s}'],
    'Taller': ['Taller de mecánica {s}', 'Carpintería {s}', 'Vulcanizadora {s}'],
    'Mercado': ['Mercado de abastos {s}'],
}
EPONIMOS = ['San Martín', 'Santa Rosa', 'El Amazonas', 'Los Andes', 'La Amistad', 'El Progreso',
            'San Juan', 'Bagua Grande', 'El Marañón', 'Señor de los Milagros', 'Virgen del Carmen',
            'Los Ángeles', 'La Esperanza', 'El Sol', 'Utcubamba', 'Nueva Era', 'San José', 'La Económica',
            'El Ahorro', 'Mi Perú', 'Los Pinos', 'Santa Elena', 'Sabor Amazónico', 'El Buen Gusto']


class Gen:
    def __init__(self, seed):
        self.r = random.Random(seed)
        self.used_dni = set()

    def persona(self):
        r = self.r
        female = r.random() < 0.52
        nombre = r.choice(NOMBRES_F if female else NOMBRES_M)
        if r.random() < 0.35:
            nombre += ' ' + r.choice(NOMBRES_F if female else NOMBRES_M)
        ap = r.sample(APELLIDOS, 2)
        return f'{nombre} {ap[0]} {ap[1]}', female

    def dni(self):
        # Bloque reservado 9xxxxxxx: identificadores ficticios de demostración.
        while True:
            value = f'9{self.r.randint(0, 9_999_999):07d}'
            if value not in self.used_dni:
                self.used_dni.add(value)
                return value

    def ruc(self):
        while True:
            value = f'20999{self.r.randint(0, 999_999):06d}'
            if value not in self.used_dni:
                self.used_dni.add(value)
                return value

    def establecimiento(self, uso, owner_first):
        r = self.r
        tpl = r.choice(ESTABLECIMIENTOS[uso])
        return tpl.format(n=owner_first, s=r.choice(EPONIMOS), num=r.randint(16201, 16299),
                          num2=r.randint(301, 399))

    def juridica(self):
        return self.r.choice(JURIDICAS).format(a=self.r.choice(EPONIMOS))


# ---------------------------------------------------------------- territorio
def short_street(name):
    for long_, short in (('Avenida ', 'Av. '), ('Jirón ', 'Jr. '), ('Pasaje ', 'Psje. '),
                         ('Prolongación ', 'Prol. '), ('Carretera ', 'Carr. ')):
        if name.startswith(long_):
            return short + name[len(long_):]
    return name


class Streets:
    def __init__(self):
        self.lines, self.names, self.classes = [], [], []
        by_name = defaultdict(list)
        for f in read_lines(DATA / 'intermedio/red_vial.geojsonl'):
            p = f['properties']
            if f['geometry']['type'] != 'LineString' or p.get('clase') in ('footway', 'path', 'track', 'steps'):
                continue
            g = utm(shape(f['geometry']))
            self.lines.append(g)
            self.names.append(p.get('nombre'))
            self.classes.append(p.get('clase'))
            if p.get('nombre'):
                by_name[p['nombre']].append(g)
        self.tree = STRtree(np.asarray(self.lines, dtype=object))
        # Eje principal de cada calle con nombre, para numerar las puertas a lo largo de ella.
        self.axis = {}
        for name, geoms in by_name.items():
            pts = np.vstack([np.asarray(g.coords) for g in geoms])
            center = pts.mean(axis=0)
            _, _, vt = np.linalg.svd(pts - center, full_matrices=False)
            direction = vt[0]
            if direction[0] < 0 or (abs(direction[0]) < 1e-9 and direction[1] < 0):
                direction = -direction
            proj = (pts - center) @ direction
            self.axis[name] = (center, direction, proj.min())

    def nearest_named(self, pt, max_m=45):
        idx = self.tree.query(pt, predicate='dwithin', distance=max_m)
        best = None
        for i in idx:
            if not self.names[i]:
                continue
            d = self.lines[i].distance(pt)
            if best is None or d < best[0]:
                best = (d, i)
        return best

    def is_avenue(self, pt, max_m=22):
        for i in self.tree.query(pt, predicate='dwithin', distance=max_m):
            if self.classes[i] in ('primary', 'secondary', 'trunk'):
                return True
        return False

    def address(self, pt):
        found = self.nearest_named(pt)
        if not found:
            return None, None
        _, i = found
        name = self.names[i]
        center, direction, start = self.axis[name]
        rel = np.array([pt.x, pt.y]) - center
        along = rel @ direction - start
        side = direction[0] * rel[1] - direction[1] * rel[0]
        number = 100 + int(along)
        number = number - number % 2 + (0 if side > 0 else 1)
        return short_street(name), max(number, 101)


def load_sectors():
    rows = query_json("""SELECT regexp_replace(initcap(lower(replace(text_value, E'\\n', ' '))), '\\s+', ' ', 'g') AS nombre,
                                ST_X(ST_Centroid(geom)) AS lon, ST_Y(ST_Centroid(geom)) AS lat
                         FROM public.cad_features WHERE text_value ILIKE 'sector%' AND geom IS NOT NULL""")
    sectors = {}
    for r in rows:
        name = r['nombre'].replace('Sector ', '').replace('Urb. Marañon', 'Urb. Marañón').strip()
        name = {'Cesar Vallejo': 'César Vallejo', 'Centro America': 'Centro América', 'La Union': 'La Unión',
                'Rey Florian': 'Rey Florián'}.get(name, name)
        x, y = TO_UTM.transform(r['lon'], r['lat'])
        sectors.setdefault(name, (x, y))
    # El cercado (centro histórico) no tiene rótulo de sector en los planos: Plaza de Armas.
    sectors['Cercado'] = TO_UTM.transform(-78.53160, -5.63893)
    names = list(sectors)
    pts = np.asarray([sectors[n] for n in names])
    return names, pts


def sector_of(names, pts, x, y):
    return names[int(np.argmin(((pts - [x, y]) ** 2).sum(axis=1)))]


# ---------------------------------------------------------------- rutas y tiempos de paso
def load_routes():
    data = json.loads((DATA / 'rutas/rutas.json').read_text(encoding='utf8'))
    routes = {}
    for r in data['rutas']:
        routes[r['codigo']] = {
            'geom': utm(shape(r['geometria'])),
            'dwg': utm(shape(r['geometria_dwg'])),
            'shift': r['ajuste_coherencia']['traslacion_m'],
            'fuente': r['fuente_archivo'],
            'marcadores': [m for m in data['marcadores'] if m['ruta'] == r['codigo']],
        }
    return routes


def time_anchors(routes):
    labels = query_json("""SELECT properties->>'ref' AS ref, properties->>'nombre' AS hora,
                                  ST_X(geom) AS lon, ST_Y(geom) AS lat
                           FROM public.municipal_cartography WHERE kind='horario'""")
    anchors = []
    for lab in labels:
        try:
            h, m = lab['hora'].split(':')
            minutes = int(h) * 60 + int(m)
        except ValueError:
            continue
        p = Point(*TO_UTM.transform(lab['lon'], lab['lat']))
        dist = sorted((routes[c]['dwg'].distance(p), c) for c in RUTAS_TIEMPO if c in routes)
        if not dist or dist[0][0] > 40:
            continue
        d, code = dist[0]
        dx, dy = routes[code]['shift']
        moved = Point(p.x + dx, p.y + dy)
        line = routes[code]['geom']
        snapped = line.interpolate(line.project(moved))
        anchors.append({'id': f"hp-{lab['ref']}", 'ruta': code, 'min': minutes, 'dist': round(d, 1),
                        'x': snapped.x, 'y': snapped.y})
    return anchors


def window_from(anchors, code, default):
    mins = sorted(a['min'] for a in anchors if a['ruta'] == code)
    if len(mins) < 5:
        return default
    clusters, current = [], [mins[0]]
    for m in mins[1:]:
        if m - current[-1] > 50:
            clusters.append(current)
            current = [m]
        else:
            current.append(m)
    clusters.append(current)
    main = max(clusters, key=len)
    start = (main[0] - 10) // 15 * 15
    end = -(-(main[-1] + 10) // 15) * 15
    return start, end


def hhmm(minutes):
    return f'{minutes // 60:02d}:{minutes % 60:02d}'


def turno(minutes):
    return 'mañana' if minutes < 12 * 60 else 'tarde' if minutes < 19 * 60 else 'noche'


def programming(anchors):
    w1001 = window_from(anchors, 'MUN-1001', (6 * 60, 10 * 60))
    w2001 = window_from(anchors, 'MUN-2001', (6 * 60, 10 * 60))
    w2002 = window_from(anchors, 'MUN-2002', (14 * 60, 18 * 60))
    wprim = window_from(anchors, 'CAD-PRIMAVERA', (6 * 60 + 30, 9 * 60 + 30))
    rows = [
        ('PRG-1001-CONV', 'MUN-1001', 'convencional', 'Recolección convencional · Ruta 1001', [1, 3, 5], w1001,
         ['César Vallejo', 'La Primavera'], 'Compactadora EGW-781 · 15 m³', 'Municipalidad Provincial de Bagua'),
        ('PRG-2001-CONV', 'MUN-2001', 'convencional', 'Recolección convencional · Ruta 2001', [2, 4, 6], w2001,
         ['César Vallejo', 'La Primavera'], 'Compactadora EGW-782 · 15 m³', 'Municipalidad Provincial de Bagua'),
        ('PRG-2002-CONV', 'MUN-2002', 'convencional', 'Recolección convencional · Ruta 2002', [1, 3, 5], w2002,
         ['Inca Kola', 'Centro América', 'San Isidro'], 'Volquete EGX-114 · 12 m³', 'Municipalidad Provincial de Bagua'),
        ('PRG-2026-CONV', 'CAD-2026', 'convencional', 'Recolección convencional · Tomaque, Brujo Pata y Casuarinas',
         [2, 4, 6], (14 * 60, 17 * 60 + 30), ['Tomaque', 'Brujo Pata', 'Las Casuarinas'],
         'Volquete EGX-115 · 12 m³', 'Municipalidad Provincial de Bagua'),
        ('PRG-PRIM-CONV', 'CAD-PRIMAVERA', 'convencional', 'Recolección convencional · La Primavera', [2, 5], wprim,
         ['La Primavera', 'Rey Florián'], 'Compactadora EGW-782 · 15 m³', 'Municipalidad Provincial de Bagua'),
        ('PRG-RUTAS-COM', 'CAD-RUTAS', 'comercial', 'Recolección comercial nocturna · mercado y paradero',
         [1, 2, 3, 4, 5, 6], (20 * 60, 23 * 60), ['Cercado', 'Centro América'], 'Compactadora EGW-782 · 15 m³',
         'Municipalidad Provincial de Bagua'),
        ('PRG-ORG', 'MUN-ORGANICA', 'organicos', 'Recolección selectiva de orgánicos', [2, 5], (7 * 60, 11 * 60),
         [], 'Motofurgón municipal MF-03', 'Municipalidad Provincial de Bagua · planta de compostaje'),
        ('PRG-1001-REC', 'MUN-1001', 'reciclables', 'Recolección selectiva de reciclables · zona norte', [6],
         (8 * 60, 12 * 60), ['César Vallejo', 'La Primavera'], 'Motofurgón MF-01',
         'Asociación de Recicladores Nuevo Amanecer de Bagua'),
        ('PRG-2001-REC', 'MUN-2001', 'reciclables', 'Recolección selectiva de reciclables · zona centro', [6],
         (13 * 60 + 30, 17 * 60 + 30), ['Cercado', 'César Vallejo'], 'Motofurgón MF-02',
         'Asociación de Recicladores Nuevo Amanecer de Bagua'),
        ('PRG-2002-REC', 'MUN-2002', 'reciclables', 'Recolección selectiva de reciclables · zona sur', [3],
         (14 * 60, 17 * 60 + 30), ['Inca Kola', 'Centro América'], 'Motofurgón MF-01',
         'Asociación de Recicladores Nuevo Amanecer de Bagua'),
    ]
    return [{'id': r[0], 'ruta': r[1], 'servicio': r[2], 'nombre': r[3], 'dias': r[4], 'inicio': r[5][0],
             'fin': r[5][1], 'sectores': r[6], 'vehiculo': r[7], 'operador': r[8]} for r in rows]


# ---------------------------------------------------------------- simulación
def main():
    assert_fixture_target()
    OUT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    gen = Gen(SEED + 1)
    admin = query_json("SELECT id FROM gestion.usuario WHERE rol='administrador' AND activo ORDER BY creado_en LIMIT 1")
    fuente = query_json(f"SELECT id FROM gestion.fuente WHERE codigo='{SOURCE}'")
    if not admin or not fuente:
        raise SystemExit('Faltan el administrador local o la fuente sintética.')
    admin_id, fuente_id = admin[0]['id'], fuente[0]['id']
    version_overture = json.loads((ROOT / 'scripts/bagua-master/ambito.json').read_text(encoding='utf8'))['overture']['version']

    print('Territorio ...', flush=True)
    streets = Streets()
    sector_names, sector_pts = load_sectors()
    routes = load_routes()
    anchors = time_anchors(routes)
    progs = programming(anchors)
    print(f'  {len(anchors)} tiempos de paso asociados a rutas; {len(sector_names)} sectores', flush=True)

    hidden = set(json.loads((DATA / 'coherencia/ocultos_automaticos.json').read_text(encoding='utf8'))['edificio'])
    # Edificios ya vinculados a otros predios (escenarios previos): no se comparten.
    hidden |= {r['edificio_id'] for r in query_json(
        f"SELECT DISTINCT v.edificio_id FROM gestion.vinculo_espacial v JOIN gestion.predio p ON p.id=v.predio_id "
        f"WHERE v.estado IN ('confirmado','propuesto','revision') AND p.codigo NOT LIKE 'BG-%'")}
    urban = shapely.union_all([routes[c]['geom'] for c in ('MUN-1001', 'MUN-2001', 'MUN-2002', 'MUN-ORGANICA')]).buffer(140)
    candidates = []
    for f in read_lines(DATA / 'intermedio/original/edificios.geojsonl'):
        bid = f['properties']['id']
        if bid in hidden:
            continue
        g = utm(shape(f['geometry']))
        if not 30 <= g.area <= 2500:
            continue
        c = g.representative_point()
        if not urban.contains(c):
            continue
        candidates.append((bid, g, c))
    print(f'  {len(candidates)} edificaciones candidatas en el área urbana', flush=True)

    org_line = routes['MUN-ORGANICA']['geom']
    rec_lines = {c: routes[c]['geom'] for c in ('MUN-1001', 'MUN-2001', 'MUN-2002')}
    near_org, near_rec = [], []
    for i, (_, g, c) in enumerate(candidates):
        if org_line.distance(c) <= 60:
            near_org.append(i)
        d, code = min((line.distance(c), code) for code, line in rec_lines.items())
        if d <= 60:
            near_rec.append((i, code))
    rng.shuffle(near_org)
    rng.shuffle(near_rec)
    org_sel = set(near_org[:min(380, int(len(near_org) * 0.55))])
    rec_route = {}
    for i, code in near_rec:
        if len(rec_route) >= min(520, int(len(near_rec) * 0.45)):
            break
        rec_route[i] = code
    rest = [i for i in range(len(candidates)) if i not in org_sel and i not in rec_route]
    rng.shuffle(rest)
    chosen = sorted(org_sel | set(rec_route) | set(rest[:260]))
    print(f'  {len(chosen)} predios simulados ({len(org_sel)} orgánicos, {len(rec_route)} reciclables)', flush=True)

    # ---- predios, personas y vínculos
    usos_dom = ['Casa habitación'] * 85 + ['Vivienda y comercio'] * 15
    largest = sorted(chosen, key=lambda i: -candidates[i][1].area)
    special = {}
    for i in largest[:12]:
        special[i] = rng.choice(['Institución educativa', 'Institución educativa', 'Institución pública',
                                 'Hospedaje', 'Taller'])
    near_center = [i for i in largest[:60] if candidates[i][2].distance(Point(*TO_UTM.transform(-78.5316, -5.6389))) < 450]
    if near_center:
        special[near_center[0]] = 'Mercado'

    predios, personas, vinculos, enlaces, asignaciones = [], [], [], [], []
    owners = []
    used_addresses = set()
    person_n = 0

    def new_person(tipo='natural'):
        nonlocal person_n
        person_n += 1
        if tipo == 'juridica':
            name, female, doc = gen.juridica(), None, gen.ruc()
        else:
            (name, female), doc = gen.persona(), gen.dni()
        pid = uid('persona', person_n)
        personas.append({'id': pid, 'codigo': f'BG-PER-{person_n:05d}', 'nombre': name, 'tipo': tipo, 'documento': doc})
        return pid, name

    for n, i in enumerate(chosen, start=1):
        bid, g, c = candidates[i]
        street, number = streets.address(c)
        avenue = streets.is_avenue(c)
        if i in special:
            uso = special[i]
        elif avenue and rng.random() < 0.45:
            uso = rng.choice(['Comercio', 'Comercio', 'Vivienda y comercio', 'Restaurante', 'Hospedaje', 'Taller'])
        elif rng.random() < 0.07:
            uso = rng.choice(['Comercio', 'Restaurante', 'Taller'])
        else:
            uso = rng.choice(usos_dom)
        address = f'{street} {number}' if street else f'Pasaje sin nombre, lote {rng.randint(1, 40):02d}'
        while address in used_addresses:
            address += '-A' if not address.endswith('-A') else 'A'
        used_addresses.add(address)
        sector = sector_of(sector_names, sector_pts, c.x, c.y)
        lon, lat = lonlat(c.x, c.y)
        pid = uid('predio', bid)
        predios.append({'id': pid, 'codigo': f'BG-{n:05d}', 'direccion': address, 'sector': sector, 'uso': uso,
                        'lon': lon, 'lat': lat, 'edificio': bid, 'i': i})
        # Contribuyente: persona natural (o jurídica para algunos comercios); algunos tienen varios predios.
        if owners and rng.random() < 0.10:
            owner = rng.choice(owners)
        elif uso in ('Comercio', 'Restaurante', 'Hospedaje', 'Taller') and rng.random() < 0.3:
            owner = new_person('juridica')
        else:
            owner = new_person()
            owners.append(owner)
        desde_prop = dt.date(rng.randint(1998, 2024), rng.randint(1, 12), rng.randint(1, 28))
        vinculos.append({'predio': pid, 'persona': owner[0], 'tipo': 'contribuyente', 'desde': desde_prop})
        representante = owner
        if uso in ('Casa habitación', 'Vivienda y comercio') and rng.random() < 0.24:
            tenant = new_person()
            vinculos.append({'predio': pid, 'persona': tenant[0], 'tipo': 'arrendatario',
                             'desde': dt.date(rng.randint(2016, 2026), rng.randint(1, 10), rng.randint(1, 28))})
            representante = tenant
        elif owner[1].endswith(('E.I.R.L.', 'S.A.C.', 'S.R.L.')) or rng.random() < 0.08:
            rep = new_person()
            vinculos.append({'predio': pid, 'persona': rep[0], 'tipo': 'responsable_servicio',
                             'desde': dt.date(rng.randint(2019, 2026), rng.randint(1, 10), rng.randint(1, 28))})
            representante = rep
        predios[-1]['representante'] = representante
        predios[-1]['owner_first'] = representante[1].split()[0]
        enlaces.append({'id': uid('enlace', pid), 'predio': pid, 'edificio': bid})
        conv = next((p for p in progs if p['servicio'] == 'convencional'
                     and routes[p['ruta']]['geom'].distance(c) <= 90), None)
        asignaciones.append({'id': uid('asig', pid), 'predio': pid, 'servicio': 'SIM-CONVENCIONAL',
                             'desde': dt.date(2025, 1, 1), 'ruta': conv['ruta'] if conv else None})

    # ---- servicios, materiales y padrón
    servicios = [('SIM-CONVENCIONAL', 'Recolección convencional'), ('SIM-ORGANICOS', 'Recolección selectiva de orgánicos'),
                 ('SIM-RECICLABLES', 'Recolección selectiva de reciclables'), ('SIM-COMERCIAL', 'Recolección comercial')]
    materiales = [('SIM-ORG', 'Residuos orgánicos'), ('SIM-PAPEL', 'Papel y cartón'), ('SIM-PET', 'Plástico PET'),
                  ('SIM-RIGIDO', 'Plástico rígido'), ('SIM-VIDRIO', 'Vidrio'), ('SIM-METAL', 'Metales'),
                  ('SIM-TETRA', 'Tetra Pak'), ('SIM-VERDE', 'Residuos de áreas verdes')]
    by_i = {p['i']: p for p in predios}
    participaciones = []

    def enroll(servicio, i, prefix, k, route=None):
        p = by_i[i]
        domiciliario = p['uso'] in ('Casa habitación', 'Vivienda y comercio')
        roll = rng.random()
        if roll < 0.35:
            desde = dt.date(2026, 3, 2)
        elif roll < 0.65:
            desde = dt.date(2026, rng.randint(4, 6), rng.randint(1, 28))
        elif roll < 0.9:
            desde = dt.date(2026, rng.randint(7, 9), rng.randint(1, 28))
        else:
            desde = dt.date(2026, rng.randint(10, 11), rng.randint(1, 10))
        perfil = rng.choices(['comprometido', 'regular', 'ocasional', 'desinteresado'], [38, 34, 20, 8])[0]
        hasta = None
        if perfil == 'desinteresado' and rng.random() < 0.6:
            hasta = min(desde + dt.timedelta(days=rng.randint(45, 120)), HOY)
        participaciones.append({
            'id': uid('part', servicio, p['id']), 'predio': p['id'], 'servicio': servicio, 'desde': desde, 'hasta': hasta,
            'tipo_generador': 'domiciliario' if domiciliario else 'no_domiciliario',
            'representante': p['representante'][0],
            'habitantes': rng.choices(range(1, 10), [5, 12, 18, 22, 18, 11, 7, 4, 3])[0] if domiciliario else None,
            'establecimiento': None if domiciliario else gen.establecimiento(p['uso'], p['owner_first']),
            'tipo_establecimiento': None if domiciliario else p['uso'],
            'codigo_padron': f'{prefix}-{k:04d}', 'zona': p['sector'], 'perfil': perfil, 'uso': p['uso'],
            'ruta': route})

    for k, i in enumerate(sorted(org_sel, key=lambda i: by_i[i]['codigo']), start=1):
        enroll('SIM-ORGANICOS', i, 'ORG', k, 'MUN-ORGANICA')
    for k, i in enumerate(sorted(rec_route, key=lambda i: by_i[i]['codigo']), start=1):
        enroll('SIM-RECICLABLES', i, 'REC', k, rec_route[i])

    # ---- stickers QR: la mayoría de los inscritos activos ya recibió el suyo
    qr_rng = random.Random(SEED + 7)
    codigos_qr, qr_predios, used_codes = [], set(), set()
    for part in participaciones:
        if part['hasta'] is None and part['predio'] not in qr_predios and qr_rng.random() < 0.88:
            code = qr_code(qr_rng)
            while code in used_codes:
                code = qr_code(qr_rng)
            used_codes.add(code)
            qr_predios.add(part['predio'])
            codigos_qr.append({'codigo': code, 'predio': part['predio'],
                               'fecha': QR_DESDE + dt.timedelta(days=qr_rng.randint(0, 20))})
    qr_since = {c['predio']: c['fecha'] for c in codigos_qr}

    # ---- usuarios de campo (no pueden iniciar sesión: hash inválido)
    promotores = [('promotor.tapia', 'Luis Tapia Guevara · promotor ambiental'),
                  ('promotor.mego', 'Rosa Mego Díaz · promotora ambiental'),
                  ('promotor.cubas', 'Wilmer Cubas Rojas · reciclador asociado'),
                  ('promotor.huaman', 'Gladys Huamán Torres · recicladora asociada'),
                  ('promotor.delgado', 'Nilton Delgado Saldaña · reciclador asociado')]
    choferes = sorted(set(ejec.CONDUCTORES.values())) + [ejec.BALANZA]
    users = [{'id': uid('usuario', u), 'usuario': u, 'nombre': n} for u, n in promotores + choferes]
    user_id = {u['usuario']: u['id'] for u in users}
    responsable = {'MUN-ORGANICA': [users[0]['id'], users[1]['id']], 'MUN-1001': [users[2]['id']],
                   'MUN-2001': [users[3]['id']], 'MUN-2002': [users[4]['id'], users[2]['id']]}

    # ---- visitas y entregas
    print('Visitas y entregas ...', flush=True)
    prog_by = {('SIM-ORGANICOS', 'MUN-ORGANICA'): next(p for p in progs if p['id'] == 'PRG-ORG')}
    for p in progs:
        if p['servicio'] == 'reciclables':
            prog_by[('SIM-RECICLABLES', p['ruta'])] = p
    outages = {}
    for key, prog in prog_by.items():
        days = [INICIO + dt.timedelta(d) for d in range((HOY - INICIO).days + 1)]
        days = [d for d in days if d.isoweekday() in prog['dias'] and d not in FERIADOS]
        outages[key] = set(rng.sample(days, k=max(1, len(days) // 30)))

    # El último día programado de cada servicio queda como recorrido en curso: solo una parte de
    # los participantes ya fue visitada, para poder demostrar el registro en campo.
    last_day = {}
    for key, prog in prog_by.items():
        d = HOY
        while d.isoweekday() not in prog['dias'] or d in FERIADOS or d in outages[key]:
            d -= dt.timedelta(1)
        last_day[key] = d
    visitas, entregas = [], []
    rec_materials = [('Papel y cartón', 0.75, 0.4, 2.6), ('Plástico PET', 0.7, 0.2, 1.3), ('Plástico rígido', 0.35, 0.1, 0.9),
                     ('Vidrio', 0.25, 0.3, 2.2), ('Metales', 0.2, 0.05, 0.5), ('Tetra Pak', 0.18, 0.05, 0.35)]
    mult = {'Restaurante': 7, 'Mercado': 35, 'Hospedaje': 3, 'Institución educativa': 5, 'Institución pública': 2.5,
            'Comercio': 3, 'Taller': 1.5, 'Vivienda y comercio': 1.4, 'Casa habitación': 1}
    base_p = {'comprometido': 0.88, 'regular': 0.66, 'ocasional': 0.36, 'desinteresado': 0.12}
    for part in participaciones:
        key = (part['servicio'], part['ruta'])
        prog = prog_by[key]
        start = max(part['desde'], INICIO)
        end = min(part['hasta'] or HOY, HOY)
        resp = responsable[part['ruta']]
        d = start
        while d <= end:
            pending_today = d == last_day[key] and rng.random() < 0.6
            if d.isoweekday() in prog['dias'] and d not in FERIADOS and d not in outages[key] and not pending_today:
                p = base_p[part['perfil']]
                if d.month == 7:
                    p -= 0.08
                if (d - part['desde']).days < 21:
                    p += 0.06
                p = min(max(p, 0.02), 0.97)
                deliver = rng.random() < p
                result = 'entrego' if deliver else ('ausente' if rng.random() < 0.25 else 'no_entrego')
                vid = uid('visita', part['id'], d.isoformat())
                who = resp[(d.toordinal() // 7) % len(resp)]
                hour = prog['inicio'] + rng.randint(0, max(prog['fin'] - prog['inicio'] - 5, 5))
                created = f'{d.isoformat()} {hour // 60:02d}:{hour % 60:02d}:{rng.randint(0, 59):02d}-05'
                obs = ''
                if result == 'ausente':
                    obs = rng.choice(['Vivienda cerrada', 'Nadie atendió', 'Fuera de casa', ''])
                elif result == 'no_entrego':
                    obs = rng.choice(['Sin residuos segregados', 'Mezcló residuos', 'Entregará la próxima semana', '', ''])
                since = qr_since.get(part['predio'])
                origen = 'qr' if since and d >= since and rng.random() < 0.78 else 'lista'
                visitas.append({'id': vid, 'part': part['id'], 'fecha': d, 'resultado': result, 'obs': obs,
                                'resp': who, 'clave': uid('clave-visita', vid), 'creado': created, 'origen': origen})
                if deliver:
                    weighed_p = 0.7 if d < dt.date(2026, 6, 15) else 0.96
                    factor = mult[part['uso']] * ((part['habitantes'] or 4) / 4)
                    if part['servicio'] == 'SIM-ORGANICOS':
                        mats = [('Residuos orgánicos', rng.lognormvariate(math.log(2.1 * factor), 0.35))]
                    else:
                        mats = [(m, rng.uniform(lo, hi) * (factor ** 0.8)) for m, prob, lo, hi in rec_materials
                                if rng.random() < prob] or [('Papel y cartón', rng.uniform(0.4, 1.5) * factor)]
                    for k, (material, kg) in enumerate(mats):
                        weighed = rng.random() < weighed_p
                        eid = uid('entrega', vid, material)
                        entregas.append({'id': eid, 'part': part['id'], 'fecha': d, 'material': material,
                                         'cantidad': round(max(kg, 0.1), 1) if weighed else None, 'resp': who,
                                         'clave': uid('clave-entrega', eid), 'creado': created, 'visita': vid})
            d += dt.timedelta(1)
    print(f'  {len(visitas)} visitas, {len(entregas)} entregas', flush=True)

    # ---- valorización mensual por actor
    actores = [
        {'id': uid('actor', 'ASOREC'), 'codigo': 'SIM-ASOREC-NUEVO-AMANECER',
         'nombre': 'Asociación de Recicladores Nuevo Amanecer de Bagua', 'tipo': 'asociacion_recicladores',
         'registro': 'Registro municipal N.° 004-2024-MPB/GGARS · constancia de formalización vigente', 'socios': 14},
        {'id': uid('actor', 'EORS'), 'codigo': 'SIM-EORS-ECOAMAZONAS', 'nombre': 'Ecoservicios Amazonas S.A.C.',
         'tipo': 'eo_rs', 'registro': 'EO-RS con registro autoritativo vigente · convenio N.° 012-2026-MPB', 'socios': None},
        {'id': uid('actor', 'PLANTA'), 'codigo': 'SIM-PLANTA-COMPOST', 'nombre': 'Planta municipal de compostaje de Bagua',
         'tipo': 'planta_municipal', 'registro': 'Administración directa · Gerencia de Gestión Ambiental', 'socios': None},
    ]
    monthly = defaultdict(float)
    for e in entregas:
        if e['cantidad'] is None:
            continue
        monthly[(e['fecha'].replace(day=1), e['material'])] += e['cantidad']
    valorizaciones = []
    factura = 120
    for month in sorted({m for m, _ in monthly}):
        if month >= HOY.replace(day=1):
            continue  # el mes en curso aún no se liquida
        last = (month.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(1)
        for material in ['Papel y cartón', 'Plástico PET', 'Plástico rígido', 'Vidrio', 'Metales', 'Tetra Pak']:
            kg = monthly.get((month, material), 0) * rng.uniform(0.9, 0.96) * rng.uniform(1.12, 1.28)
            if kg < 20:
                continue
            for half, day in ((0.48, 15), (0.52, last.day)):
                factura += 1
                valorizaciones.append({'actor': actores[0]['id'], 'periodo': month, 'fecha': month.replace(day=min(day, last.day)),
                                       'material': material, 't': round(kg * half / 1000, 3), 'tipo': 'factura',
                                       'num': f'E001-{factura:06d}', 'obs': 'Venta a acopiador mayorista (simulado)'})
        eors = monthly.get((month, 'Papel y cartón'), 0) * rng.uniform(0.15, 0.25)
        if eors > 20:
            valorizaciones.append({'actor': actores[1]['id'], 'periodo': month, 'fecha': last, 'material': 'Papel y cartón',
                                   't': round(eors / 1000, 3), 'tipo': 'factura', 'num': f'F001-{month:%Y%m}',
                                   'obs': 'Cartón de generadores no domiciliarios (simulado)'})
        org = monthly.get((month, 'Residuos orgánicos'), 0) * rng.uniform(0.97, 1.0)
        valorizaciones.append({'actor': actores[2]['id'], 'periodo': month, 'fecha': last, 'material': 'Residuos orgánicos',
                               't': round(org / 1000, 3), 'tipo': 'registro_planta', 'num': f'RP-{month:%Y-%m}',
                               'obs': 'Ingreso a pilas de compostaje (simulado)'})
        valorizaciones.append({'actor': actores[2]['id'], 'periodo': month, 'fecha': last,
                               'material': 'Residuos de áreas verdes', 't': round(rng.uniform(1.1, 2.6), 3),
                               'tipo': 'registro_planta', 'num': f'RP-{month:%Y-%m}',
                               'obs': 'Poda y mantenimiento de parques (simulado)'})

    # ---- infraestructura
    infra = build_infrastructure(rng, streets, candidates, urban)

    print('Ejecución de rutas y pesaje ...', flush=True)
    puntos = ejec.control_points(progs, routes, anchors, streets, TO_UTM.transform)
    kinds = {'disposicion_final': 'relleno', 'planta_organicos': 'planta', 'centro_acopio': 'acopio'}
    destinations = {kinds[i['tipo']]: TO_UTM.transform(i['lon'], i['lat']) for i in infra if i['tipo'] in kinds}
    ejecuciones, eventos, pesajes, avisos, cambios = ejec.simulate(
        random.Random(SEED + 11), progs, puntos, destinations, HOY, AHORA_MIN, FERIADOS, uid, lonlat, INICIO)
    for e in ejecuciones:
        e['conductor'] = user_id[e['conductor']]
    balanza_id = user_id[ejec.BALANZA[0]]
    print(f'  {len(puntos)} puntos de control, {len(ejecuciones)} ejecuciones, {len(eventos)} eventos, '
          f'{len(pesajes)} tickets ({round(sum(p["bruto"] - p["tara"] for p in pesajes) / 1000)} t), {len(avisos)} avisos',
          flush=True)
    operacion = {'puntos': puntos, 'ejecuciones': ejecuciones, 'eventos': eventos, 'pesajes': pesajes,
                 'avisos': avisos, 'cambios': cambios, 'balanza': balanza_id}

    summary = {
        'predios': len(predios), 'personas': len(personas), 'vinculos': len(vinculos),
        'participaciones': len(participaciones), 'visitas': len(visitas), 'entregas': len(entregas),
        'valorizaciones': len(valorizaciones), 'infraestructura': len(infra), 'programaciones': len(progs),
        'tiempos_de_paso': len(anchors), 'codigos_qr': len(codigos_qr),
        'kg_registrados': round(sum(e['cantidad'] or 0 for e in entregas)),
        'puntos_control': len(puntos), 'ejecuciones': len(ejecuciones), 'eventos_ruta': len(eventos),
        'tickets_balanza': len(pesajes), 't_pesadas': round(sum(p['bruto'] - p['tara'] for p in pesajes) / 1000, 1),
        'hoy': HOY.isoformat(),
    }
    (OUT / 'resumen.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    load(admin_id, fuente_id, version_overture, predios, personas, vinculos, enlaces, asignaciones, servicios,
         materiales, participaciones, users, visitas, entregas, actores, valorizaciones, infra, progs, anchors,
         codigos_qr, operacion)


def build_infrastructure(rng, streets, candidates, urban):
    """Contenedores y puntos limpios en cruces de calles con nombre, centro de acopio y planta."""
    conns = [utm(shape(f['geometry'])) for f in read_lines(DATA / 'intermedio/conectores.geojsonl')]
    crossings = []
    for c in conns:
        if not urban.contains(c):
            continue
        names = sorted({streets.names[i] for i in streets.tree.query(c, predicate='dwithin', distance=4)
                        if streets.names[i]})
        if len(names) >= 2:
            crossings.append((c, names, streets.is_avenue(c, 6)))
    rng.shuffle(crossings)
    items = []

    def add(kind, name, desc, horario, mats, pt):
        lon, lat = lonlat(pt.x, pt.y)
        items.append({'id': f'INF-{kind[:3].upper()}-{len(items) + 1:03d}', 'tipo': kind, 'nombre': name,
                      'descripcion': desc, 'horario': horario, 'materiales': mats, 'lon': lon, 'lat': lat})

    picked = []
    for c, names, avenue in crossings:
        if any(c.distance(p) < 260 for p in picked):
            continue
        picked.append(c)
        a, b = (short_street(n) for n in names[:2])
        if len(picked) <= 3:
            add('punto_limpio', f'Punto limpio · {a} con {b}', 'Módulo de contenedores de colores para reciclables.',
                'Todos los días · 06:00–20:00', ['Papel y cartón', 'Plástico PET', 'Vidrio', 'Metales'], c)
        else:
            add('contenedor', f'Contenedor · {a} con {b}', 'Contenedor de 1,1 m³ para residuos comunes.',
                'Vaciado con la ruta convencional', [], c)
        if len(picked) >= 22:
            break
    center = Point(*TO_UTM.transform(-78.5316, -5.6389))
    acopio = max((c for c in candidates if 250 <= c[1].area <= 900 and 600 < c[2].distance(center) < 1300
                  and streets.is_avenue(c[2], 30)), key=lambda c: c[1].area, default=None)
    if acopio:
        street, number = streets.address(acopio[2])
        add('centro_acopio', 'Centro de acopio · Asociación Nuevo Amanecer',
            f'{street} {number}. Clasificación y enfardado de reciclables antes de su venta.',
            'Lunes a sábado · 08:00–17:00', ['Papel y cartón', 'Plástico PET', 'Plástico rígido', 'Vidrio', 'Metales'],
            acopio[2])
    hull = urban.convex_hull
    best = None
    built = STRtree(np.asarray([cand[2] for cand in candidates], dtype=object))
    for line in streets.lines:
        for x, y in line.coords:
            p = Point(x, y)
            d = hull.exterior.distance(p)
            if hull.contains(p) or not 350 <= d <= 900:
                continue
            if len(built.query(p, predicate='dwithin', distance=140)):
                continue
            score = d + (p.y - center.y) * -0.2
            if best is None or score > best[0]:
                best = (score, p)
    if best:
        add('planta_organicos', 'Planta municipal de compostaje',
            'Pilas de compostaje y área de maduración; recibe los orgánicos segregados y la poda.',
            'Lunes a sábado · 07:00–15:00', ['Residuos orgánicos', 'Residuos de áreas verdes'], best[1])
    # Relleno sanitario: fuera de la ciudad, junto a una vía, lejos de las viviendas.
    far = None
    for line in streets.lines:
        for x, y in line.coords:
            p = Point(x, y)
            d = p.distance(center)
            if not 3000 <= d <= 9000 or len(built.query(p, predicate='dwithin', distance=300)):
                continue
            score = -abs(d - 5200) + (p.y - center.y) * 0.3
            if far is None or score > far[0]:
                far = (score, p)
    if far is None:
        far = (0, max((Point(x, y) for line in streets.lines for x, y in line.coords), key=lambda p: p.distance(center)))
    add('disposicion_final', 'Relleno sanitario de Bagua',
        'Celdas de disposición final, balanza de pesaje y poza de lixiviados. Recibe la recolección convencional.',
        'Todos los días · 06:00–23:30', [], far[1])
    return items


# ---------------------------------------------------------------- carga
def csv_block(table, columns, rows):
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator='\n')
    for row in rows:
        writer.writerow(['\\N' if v is None else v for v in row])
    return (f"COPY {table} ({', '.join(columns)}) FROM STDIN WITH (FORMAT csv, NULL '\\N');\n"
            + buffer.getvalue() + '\\.\n')


def pg_array(values, kind='text'):
    if kind == 'int':
        return '{' + ','.join(str(v) for v in values) + '}'
    return '{' + ','.join('"' + str(v).replace('"', '\\"') + '"' for v in values) + '}'


def load(admin_id, fuente_id, version_overture, predios, personas, vinculos, enlaces, asignaciones, servicios,
         materiales, participaciones, users, visitas, entregas, actores, valorizaciones, infra, progs, anchors,
         codigos_qr, operacion):
    print('Cargando en la base (una transacción) ...', flush=True)
    sim_predios = f"(SELECT id FROM gestion.predio WHERE fuente_id='{fuente_id}' AND codigo LIKE 'BG-%')"
    sim_parts = f'(SELECT id FROM gestion.participacion WHERE predio_id IN {sim_predios})'
    sql = [
        'BEGIN;',
        "SELECT pg_advisory_xact_lock(hashtext('bagua:simulacion-operacion-v1'));",
        # Reemplazo de lo generado por esta misma simulación (nada más).
        f'DELETE FROM gestion.entrega_revision WHERE entrega_id IN (SELECT id FROM gestion.entrega WHERE participacion_id IN {sim_parts});',
        f'DELETE FROM gestion.entrega WHERE participacion_id IN {sim_parts};',
        f'DELETE FROM gestion.visita WHERE participacion_id IN {sim_parts};',
        f'DELETE FROM gestion.participacion WHERE predio_id IN {sim_predios};',
        f'DELETE FROM gestion.asignacion WHERE predio_id IN {sim_predios};',
        f'DELETE FROM gestion.vinculo WHERE predio_id IN {sim_predios};',
        f'DELETE FROM gestion.vinculo_espacial WHERE predio_id IN {sim_predios};',
        f'DELETE FROM gestion.codigo_qr WHERE predio_id IN {sim_predios};',
        f'DELETE FROM gestion.historial WHERE predio_id IN {sim_predios};',
        f'DELETE FROM gestion.predio WHERE id IN {sim_predios};',
        f"DELETE FROM gestion.persona WHERE fuente_id='{fuente_id}' AND codigo LIKE 'BG-PER-%';",
        "DELETE FROM gestion.valorizacion WHERE actor_id IN (SELECT id FROM gestion.actor WHERE codigo LIKE 'SIM-%');",
        "DELETE FROM gestion.actor WHERE codigo LIKE 'SIM-%';",
        "DELETE FROM gestion.pesaje WHERE registrado_por IN (SELECT id FROM gestion.usuario WHERE usuario='tecnico.balanza') OR ejecucion_id IN (SELECT e.id FROM gestion.ruta_ejecucion e JOIN gestion.usuario u ON u.id=e.conductor_id WHERE u.usuario LIKE 'conductor.%');",
        "DELETE FROM gestion.ruta_evento WHERE ejecucion_id IN (SELECT e.id FROM gestion.ruta_ejecucion e JOIN gestion.usuario u ON u.id=e.conductor_id WHERE u.usuario LIKE 'conductor.%');",
        "DELETE FROM gestion.ruta_ejecucion WHERE id IN (SELECT e.id FROM gestion.ruta_ejecucion e JOIN gestion.usuario u ON u.id=e.conductor_id WHERE u.usuario LIKE 'conductor.%');",
        "DELETE FROM bagua_master.ruta_programacion_cambio WHERE origen='simulacion';",
        "DELETE FROM bagua_master.aviso_servicio WHERE origen='simulacion';",
        'DELETE FROM bagua_master.ruta_punto_control;',
        'DELETE FROM bagua_master.ruta_programacion;',
        'DELETE FROM bagua_master.infraestructura;',
        'DELETE FROM bagua_master.ruta_hora_paso;',
    ]
    for code, name in servicios:
        sql.append(f"INSERT INTO gestion.servicio(codigo,nombre) VALUES('{code}','{name}') "
                   f"ON CONFLICT(codigo) DO UPDATE SET nombre=excluded.nombre, activo=true;")
    for code, name in materiales:
        sql.append(f"INSERT INTO gestion.material(codigo,nombre) VALUES('{code}','{name}') "
                   f"ON CONFLICT(codigo) DO UPDATE SET nombre=excluded.nombre, activo=true;")
    for u in users:
        # Hash inválido a propósito: estas cuentas de campo simuladas no pueden iniciar sesión.
        sql.append(f"INSERT INTO gestion.usuario(id,nombre,usuario,password_hash,rol) VALUES('{u['id']}','{u['nombre']}',"
                   f"'{u['usuario']}','!simulado-sin-acceso','registro') ON CONFLICT(usuario) DO UPDATE SET nombre=excluded.nombre;")
    sql = '\n'.join(sql) + '\n'
    blocks = [
        csv_block('gestion.persona', ['id', 'fuente_id', 'codigo', 'nombre', 'tipo', 'documento'],
                  [(p['id'], fuente_id, p['codigo'], p['nombre'], p['tipo'], p['documento']) for p in personas]),
        csv_block('gestion.predio', ['id', 'fuente_id', 'codigo', 'direccion', 'sector', 'uso', 'observaciones', 'ubicacion',
                                     'evidencia_ubicacion', 'estado_ubicacion'],
                  [(p['id'], fuente_id, p['codigo'], p['direccion'], p['sector'], p['uso'], EVIDENCIA,
                    json.dumps({'type': 'Point', 'coordinates': [p['lon'], p['lat']]}),
                    'Simulación: centro de la edificación vinculada', 'verificada') for p in predios]),
        csv_block('gestion.vinculo', ['predio_id', 'persona_id', 'tipo', 'desde', 'evidencia'],
                  [(v['predio'], v['persona'], v['tipo'], v['desde'], EVIDENCIA) for v in vinculos]),
    ]
    tail = ['CREATE TEMP TABLE sim_asig (id uuid, predio uuid, servicio text, desde date, ruta text) ON COMMIT DROP;',
            csv_block('sim_asig', ['id', 'predio', 'servicio', 'desde', 'ruta'],
                      [(a['id'], a['predio'], a['servicio'], a['desde'], a['ruta']) for a in asignaciones]),
            "INSERT INTO gestion.asignacion(id,predio_id,servicio_id,desde,estado,evidencia) "
            "SELECT a.id,a.predio,s.id,a.desde,'confirmada',"
            f"'{EVIDENCIA} Ruta ' || coalesce(a.ruta,'sin ruta cercana') FROM sim_asig a JOIN gestion.servicio s ON s.codigo=a.servicio;",
            'CREATE TEMP TABLE sim_part (id uuid, predio uuid, servicio text, desde date, hasta date, tipo_generador text,'
            ' representante uuid, habitantes int, establecimiento text, tipo_establecimiento text, codigo_padron text, zona text) ON COMMIT DROP;',
            csv_block('sim_part', ['id', 'predio', 'servicio', 'desde', 'hasta', 'tipo_generador', 'representante', 'habitantes',
                                   'establecimiento', 'tipo_establecimiento', 'codigo_padron', 'zona'],
                      [(p['id'], p['predio'], p['servicio'], p['desde'], p['hasta'], p['tipo_generador'], p['representante'],
                        p['habitantes'], p['establecimiento'], p['tipo_establecimiento'], p['codigo_padron'], p['zona'])
                       for p in participaciones]),
            'INSERT INTO gestion.participacion(id,predio_id,servicio_id,desde,hasta,evidencia,tipo_generador,representante_id,'
            'habitantes,establecimiento,tipo_establecimiento,codigo_padron,zona) '
            f"SELECT p.id,p.predio,s.id,p.desde,p.hasta,'{EVIDENCIA}',p.tipo_generador,p.representante,p.habitantes,"
            'p.establecimiento,p.tipo_establecimiento,p.codigo_padron,p.zona FROM sim_part p JOIN gestion.servicio s ON s.codigo=p.servicio;',
            csv_block('gestion.visita', ['id', 'participacion_id', 'fecha', 'resultado', 'observaciones', 'responsable_id', 'clave', 'creado_en', 'origen'],
                      [(v['id'], v['part'], v['fecha'], v['resultado'], v['obs'], v['resp'], v['clave'], v['creado'], v['origen']) for v in visitas]),
            csv_block('gestion.codigo_qr', ['codigo', 'predio_id', 'generado_por', 'generado_en', 'escaneos'],
                      [(c['codigo'], c['predio'], admin_id, f"{c['fecha']} 09:00:00-05", 0) for c in codigos_qr]),
            csv_block('gestion.entrega', ['id', 'participacion_id', 'fecha', 'material', 'cantidad', 'unidad', 'responsable_id',
                                          'clave', 'creado_en', 'visita_id'],
                      [(e['id'], e['part'], e['fecha'], e['material'], e['cantidad'], 'kg' if e['cantidad'] is not None else None,
                        e['resp'], e['clave'], e['creado'], e['visita']) for e in entregas]),
            # Vínculo edificio–predio: se propone y se confirma, como exige la revisión espacial.
            csv_block('gestion.vinculo_espacial', ['id', 'predio_id', 'edificio_id', 'criterio', 'evidencia', 'version_overture', 'creado_por'],
                      [(e['id'], e['predio'], e['edificio'], 'seleccion_mapa', EVIDENCIA, version_overture, admin_id) for e in enlaces]),
            f"UPDATE gestion.vinculo_espacial SET estado='confirmado', version=2, revisado_por='{admin_id}', revisado_en=now(),"
            f" motivo='Simulación: edificación que contiene el predio' WHERE predio_id IN {sim_predios};",
            csv_block('gestion.actor', ['id', 'codigo', 'nombre', 'tipo', 'registro', 'socios'],
                      [(a['id'], a['codigo'], a['nombre'], a['tipo'], a['registro'], a['socios']) for a in actores]),
            csv_block('gestion.valorizacion', ['actor_id', 'periodo', 'fecha', 'material', 'toneladas', 'comprobante_tipo',
                                               'comprobante_numero', 'observaciones', 'registrado_por'],
                      [(v['actor'], v['periodo'], v['fecha'], v['material'], v['t'], v['tipo'], v['num'], v['obs'], admin_id)
                       for v in valorizaciones if v['t'] > 0]),
            'CREATE TEMP TABLE sim_infra (id text, tipo text, nombre text, descripcion text, horario text, materiales text[], lon float8, lat float8) ON COMMIT DROP;',
            csv_block('sim_infra', ['id', 'tipo', 'nombre', 'descripcion', 'horario', 'materiales', 'lon', 'lat'],
                      [(i['id'], i['tipo'], i['nombre'], i['descripcion'], i['horario'], pg_array(i['materiales']), i['lon'], i['lat'])
                       for i in infra]),
            'INSERT INTO bagua_master.infraestructura(id,tipo,nombre,descripcion,horario,materiales,geom) '
            'SELECT id,tipo,nombre,descripcion,horario,materiales,ST_SetSRID(ST_MakePoint(lon,lat),4326) FROM sim_infra;',
            csv_block('bagua_master.ruta_programacion', ['id', 'ruta_codigo', 'servicio', 'nombre', 'dias', 'hora_inicio', 'hora_fin',
                                                         'turno', 'sectores', 'vehiculo', 'operador', 'nota'],
                      [(p['id'], p['ruta'], p['servicio'], p['nombre'], pg_array(p['dias'], 'int'), hhmm(p['inicio']), hhmm(p['fin']),
                        turno(p['inicio']), pg_array(p['sectores']), p['vehiculo'], p['operador'],
                        'Programación simulada; ventana horaria tomada de los tiempos de paso del plano cuando existen.')
                       for p in progs]),
            'CREATE TEMP TABLE sim_hora (id text, ruta text, hora text, dist numeric, lon float8, lat float8) ON COMMIT DROP;',
            csv_block('sim_hora', ['id', 'ruta', 'hora', 'dist', 'lon', 'lat'],
                      [(a['id'], a['ruta'], hhmm(a['min']), a['dist'], *lonlat(a['x'], a['y'])) for a in anchors]),
            "INSERT INTO bagua_master.ruta_hora_paso(id,ruta_codigo,hora,distancia_trazo_m,fuente_archivo,geom) "
            "SELECT DISTINCT ON (id) id,ruta,hora::time,dist,'RUTAS CON TIEMPO.dwg',ST_SetSRID(ST_MakePoint(lon,lat),4326) FROM sim_hora;",
            "UPDATE bagua_master.ruta_programacion SET vehiculo_placa=substring(vehiculo from '([A-Z]{3}-[0-9]{3}|MF-[0-9]{2})');",
            *operation_blocks(operacion, admin_id),
            'COMMIT;',
            "SELECT 'predios', count(*) FROM gestion.predio WHERE codigo LIKE 'BG-%';",
            "SELECT 'ejecuciones', count(*) FROM gestion.ruta_ejecucion;",
            "SELECT 'tickets', count(*), round(sum(peso_neto_kg)/1000) FROM gestion.pesaje;",
            "SELECT 'visitas', count(*) FROM gestion.visita;",
            "SELECT 'entregas con visita', count(*) FROM gestion.entrega WHERE visita_id IS NOT NULL;",
            "SELECT 'valorizaciones', count(*) FROM gestion.valorizacion;"]
    print(psql(sql, ''.join(blocks) + '\n'.join(tail) + '\n'))


def operation_blocks(op, admin_id):
    vehiculos = ['INSERT INTO gestion.vehiculo(placa,descripcion,tipo,capacidad_m3,tara_kg,anio) VALUES ' + ','.join(
        f"('{v[0]}','{v[1]}','{v[2]}',{v[3]},{v[4]},{v[5]})" for v in ejec.VEHICULOS)
        + ' ON CONFLICT(placa) DO UPDATE SET descripcion=excluded.descripcion,tipo=excluded.tipo,'
          'capacidad_m3=excluded.capacidad_m3,tara_kg=excluded.tara_kg,anio=excluded.anio,activo=true;']
    return vehiculos + [
        'CREATE TEMP TABLE sim_pc (id text, prog text, orden int, nombre text, hora text, base text, lon float8, lat float8) ON COMMIT DROP;',
        csv_block('sim_pc', ['id', 'prog', 'orden', 'nombre', 'hora', 'base', 'lon', 'lat'],
                  [(p['id'], p['prog'], p['orden'], p['nombre'], hhmm(p['min'] % 1440), p['base'], *lonlat(p['x'], p['y']))
                   for p in op['puntos']]),
        'INSERT INTO bagua_master.ruta_punto_control(id,programacion_id,orden,nombre,hora_programada,base,geom) '
        'SELECT id,prog,orden,nombre,hora::time,base,ST_SetSRID(ST_MakePoint(lon,lat),4326) FROM sim_pc;',
        csv_block('gestion.ruta_ejecucion', ['id', 'programacion_id', 'ruta_codigo', 'servicio', 'fecha', 'vehiculo',
                                             'conductor_id', 'estado', 'motivo_interrupcion', 'clave', 'creado_en'],
                  [(e['id'], e['prog'], e['ruta'], e['servicio'], e['fecha'], e['vehiculo'], e['conductor'], e['estado'],
                    e['motivo'], e['clave'], e['creado']) for e in op['ejecuciones']]),
        'CREATE TEMP TABLE sim_ev (id uuid, ejecucion uuid, tipo text, momento timestamptz, punto text, destino text,'
        ' lon float8, lat float8, precision real, clave uuid, registrado timestamptz) ON COMMIT DROP;',
        csv_block('sim_ev', ['id', 'ejecucion', 'tipo', 'momento', 'punto', 'destino', 'lon', 'lat', 'precision', 'clave', 'registrado'],
                  [(e['id'], e['ejecucion'], e['tipo'], e['momento'], e['punto'], e['destino'], e['lon'], e['lat'],
                    e['precision'], e['clave'], e['registrado']) for e in op['eventos']]),
        'INSERT INTO gestion.ruta_evento(id,ejecucion_id,tipo,momento,punto_id,destino,geom,precision_m,clave,registrado_en) '
        'SELECT id,ejecucion,tipo,momento,punto,destino,CASE WHEN lon IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(lon,lat),4326) END,'
        'precision,clave,registrado FROM sim_ev;',
        csv_block('gestion.pesaje', ['id', 'ejecucion_id', 'destino', 'fecha', 'hora', 'ticket', 'vehiculo', 'peso_bruto_kg',
                                     'tara_kg', 'registrado_por', 'creado_en'],
                  [(w['id'], w['ejecucion'], 'relleno', w['fecha'], w['hora'], w['ticket'], w['vehiculo'], w['bruto'], w['tara'],
                    op['balanza'], w['creado']) for w in op['pesajes']]),
        csv_block('bagua_master.aviso_servicio', ['id', 'tipo', 'titulo', 'mensaje', 'programaciones', 'desde', 'hasta',
                                                  'origen', 'publicado_por', 'creado_en'],
                  [(a['id'], a['tipo'], a['titulo'], a['mensaje'], pg_array(a['progs']), a['desde'], a['hasta'], 'simulacion',
                    admin_id, f"{a['creado']} 10:00:00-05") for a in op['avisos']]),
        csv_block('bagua_master.ruta_programacion_cambio', ['id', 'programacion_id', 'anterior', 'nuevo', 'motivo', 'desde',
                                                            'origen', 'usuario_id', 'creado_en'],
                  [(c['id'], c['prog'], json.dumps(c['anterior'], ensure_ascii=False), json.dumps(c['nuevo'], ensure_ascii=False),
                    c['motivo'], c['desde'], 'simulacion', admin_id, f"{c['desde'] - dt.timedelta(days=3)} 11:00:00-05")
                   for c in op['cambios']]),
    ]


if __name__ == '__main__':
    main()
