"""Unificación territorial: entidades consolidadas con procedencia, relaciones y conflictos.

Lee solo paquetes derivados existentes (database/municipal/*) y capas de la tercera
pasada (data/cad/extracted/tercera/). No modifica DWG, BAK, PDF ni tablas de PostGIS.
Salida reproducible: database/municipal/territorio-unificado.json.gz.

  1. Representaciones: elementos CAD de una clase territorial (cad-reconciliation) y
     elementos derivados (sombreados, hojas, cotas, puntos, toponimia) en el marco
     adoptado. Cada representación conserva su fuente, capa, identificador y
     coordenadas originales cuando existen.
  2. Identidad: dentro de cada clase, dos representaciones son el mismo elemento solo
     si su geometría coincide (distancia de Hausdorff dentro de la tolerancia del
     tipo). Calles y sectores se agrupan por nombre normalizado. Lo demás es un
     registro original sin fusión.
  3. Atributos complementarios con procedencia: rótulos y medidas por contención,
     calles colindantes por identificador original, datos de rutas.
  4. Relaciones entre entidades distintas (forma coincidente, contención, tramo
     compartido). Nunca fusionan.
  5. Conflictos y excepciones: se registran con su evidencia; nada se descarta.

Uso: .venv-gis/Scripts/python scripts/gis/unify_territory.py
"""
import collections
import gzip
import hashlib
import json
import sys
import uuid
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon, mapping, shape
from shapely.ops import transform as shp_transform, unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid

sys.path.insert(0, str(Path(__file__).resolve().parent))
import territory_rules as R  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / 'database/municipal'
TERC = ROOT / 'data/cad/extracted/tercera'
OUT = DB / 'territorio-unificado.json.gz'
AUDIT = ROOT / 'data/cad/extracted/territorio/unificacion.json'
DATASET = 'territorio-unificado-v1'
NAMESPACE = uuid.UUID('4b1f7c2e-8a3d-4f6e-9b21-3d5c7e9a0f11')
TOMAQUE = 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg'
TO_WGS = Transformer.from_crs(32717, 4326, always_xy=True)
TO_UTM = Transformer.from_crs(4326, 32717, always_xy=True)
MATCH_MARGIN = 0.25  # búsqueda previa, mayor que la tolerancia de cualquier clase
MANZANA_LABEL_LAYERS = {'Nº MANZANA', 'N° MANZ.', 'nomenclatura Manzana'}
RPU_LAYERS = {'Limite Lote', 'Limite Manzana', 'MANZANAS'}
ROUTE_OVERLAP_M = 10.0
CONTAIN_RATIO = 0.95


def to_wgs(geom):
    return shp_transform(TO_WGS.transform, geom)


def to_utm(geom):
    return shp_transform(TO_UTM.transform, geom)


def frame_of(raw, offset):
    """Geometría GeoJSON en coordenadas brutas del DWG, desplazada al marco adoptado (EPSG:32717)."""
    dx, dy = offset
    kind = raw['type']
    if kind == 'Polygon':
        return Polygon([(x + dx, y + dy) for x, y in raw['coordinates'][0]])
    if kind == 'LineString':
        return LineString([(x + dx, y + dy) for x, y in raw['coordinates']])
    if kind == 'Point':
        return Point(raw['coordinates'][0] + dx, raw['coordinates'][1] + dy)
    raise ValueError(f'Geometría no tratada: {kind}')


def load_json(path):
    if path.suffix == '.gz':
        with gzip.open(path, 'rt', encoding='utf8') as stream:
            return json.load(stream)
    return json.loads(path.read_text(encoding='utf8'))


def digest(value):
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(text.encode('utf8')).hexdigest()


def public_geojson(geom, decimals):
    """GeoJSON con la precisión adecuada: 8 decimales en EPSG:4326 (~1 mm), 3 en metros del marco."""
    return json.loads(json.dumps(mapping(geom)), parse_float=lambda v: round(float(v), decimals))


class Union:
    def __init__(self, n):
        self.parent = list(range(n))

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def join(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            if ra < rb:
                self.parent[rb] = ra
            else:
                self.parent[ra] = rb


# ----------------------------------------------------------------------------- fuentes

def load_sources():
    return dict(
        cad=load_json(DB / 'cad-reconciliation.json.gz'),
        second=load_json(DB / 'segunda-pasada.json.gz'),
        manifest=load_json(DB / 'manifest.json'),
        cartography=load_json(DB / 'cartography.json'),
        rpu=load_json(TERC / 'complementos/rpu.geojson'),
        shading=load_json(TERC / 'complementos/sombreados-con-huecos.geojson'),
        marcos=load_json(TERC / 'pendientes/geo-43-marcos.json'),
        contradictions=[json.loads(line) for line in gzip.open(TERC / 'matriz/contradicciones.jsonl.gz', 'rt', encoding='utf8')],
        paper=load_json(TERC / 'complementos/espacio-papel-georreferenciado.geojson'),
    )


def representation(key, source, ref, layer, entity_type, kind, frame, geom_type, geometry4326,
                   crs_status, text=None, detail=None, raw=None, offset=(0.0, 0.0), origen='', attrs=None):
    return {'key': key, 'source': source, 'ref': ref, 'layer': layer, 'entityType': entity_type,
            'kind': kind, 'detail': detail, 'frame': frame, 'geomType': geom_type,
            'geometry4326': geometry4326, 'crsStatus': crs_status, 'text': text, 'raw': raw,
            'offset': [round(float(offset[0]), 3), round(float(offset[1]), 3)], 'origen': origen,
            'attrs': attrs or {}}


def build_cad_representations(src):
    """Elementos CAD de una clase territorial, con su marco adoptado y su coordenada bruta."""
    reps, excluded = [], collections.Counter()
    label_texts = []  # rótulos de manzana, para atributos por contención
    for f in src['cad']['features']:
        p = f['properties']
        if p.get('hidden'):
            excluded['oculto'] += 1
            continue
        if p['layer'] in MANZANA_LABEL_LAYERS and p.get('text'):
            label_texts.append({'source': p['source'], 'ref': p['ref'], 'text': p['text'],
                                'point': to_utm_point(f['geometry']['coordinates'])})
        gtype = f['geometry']['type'] if f['geometry'] else None
        kind, detail = R.classify(p['layer'], p['entityType'], gtype, p.get('text'))
        if not kind:
            excluded[p['layer']] += 1
            continue
        raw = f['originalGeometry']
        offset = tuple(p['offset'])
        reps.append(representation(
            key=f"{p['source']}|{p['ref']}|{p['layer']}|{p['entityType']}",
            source=p['source'], ref=p['ref'], layer=p['layer'], entity_type=p['entityType'], kind=kind,
            frame=frame_of(raw, offset), geom_type=raw['type'], geometry4326=f['geometry'],
            crs_status=p['crsStatus'], text=p.get('text'), detail=detail, raw=raw, offset=offset,
            origen='cad-reconciliation.json.gz'))
    return reps, excluded, label_texts


def to_utm_point(coords):
    x, y = TO_UTM.transform(coords[0], coords[1])
    return Point(x, y)


PRESENTATION_ONLY_LAYERS = {'NORTE'}  # flechas de norte y símbolos de presentación: no son objetos territoriales


def build_paper_space_representations(src, stats):
    """Copias georreferenciadas del plano de ubicación en espacio papel (precisión limitada, sin identidad)."""
    reps = []
    for f in src['paper']['features']:
        p = f['properties']
        if p['layer'] in PRESENTATION_ONLY_LAYERS:
            stats['simbolo_presentacion_excluido'] += 1
            continue
        geom4326 = f['geometry']
        geom = shape(geom4326)
        reps.append(representation(
            key=f"espacio-papel|{p['source']}|{p['hoja']}|{p['ref']}|{p['layer']}", source=p['source'], ref=p['ref'],
            layer=p['layer'], entity_type=p['cad_type'], kind='plano_ubicacion', frame=to_utm(geom),
            geom_type=geom.geom_type, geometry4326=geom4326, crs_status='provisional',
            text=p.get('text'), origen='tercera/complementos/espacio-papel-georreferenciado.geojson',
            attrs={'hoja': p['hoja'], 'metodo': p['metodo'], 'precision': 'RMS 16,9 m; no es identidad',
                   'interpretacion': p['interpretacion']}))
    return reps


def build_derived_representations(src):
    reps = []
    seen_shading = collections.Counter()
    for f in src['shading']['features']:
        p = f['properties']
        # Un mismo identificador puede aparecer en varios anillos: el orden del archivo lo distingue.
        base = f"sombreado|{p['source']}|{p['handle']}|{p['layer']}"
        seen_shading[base] += 1
        reps.append(representation(
            key=f"{base}|{seen_shading[base]}", source=p['source'], ref=p['handle'],
            layer=p['layer'], entity_type='HATCH', kind='sombreado', frame=to_utm(shape(f['geometry'])),
            geom_type='Polygon', geometry4326=f['geometry'],
            crs_status='adoptado' if p['source'] == TOMAQUE else 'declarado',
            origen='tercera/complementos/sombreados-con-huecos.geojson',
            attrs={'valido': bool(p['valido']), 'motivo_invalidez': p.get('motivo_invalidez'),
                   'area_neta_m2': p.get('area_neta_m2'), 'patron': p.get('pattern'), 'huecos': p.get('huecos')}))
    for f in src['second']['features']:
        p = f['properties']
        capa, attrs = p.get('kind'), dict(p.get('attributes', {}))
        origen = 'database/municipal/segunda-pasada.json.gz'
        geom4326 = f['geometry']
        frame = to_utm(shape(geom4326))
        status = p.get('crsStatus', 'declarado')
        if capa == 'hojas-planos':
            reps.append(representation(f"hoja|{p['id']}", p.get('source'), p['id'], 'hojas-planos', 'VIEWPORT', 'hoja',
                                       frame, 'Polygon', geom4326, status, origen=origen, attrs=attrs))
        elif capa == 'cotas':
            reps.append(representation(f"cota|{p['id']}", p.get('source'), p['id'], 'cotas', 'DIMENSION', 'cota',
                                       frame, 'Point', geom4326, status, origen=origen, attrs=attrs))
        elif capa == 'puntos-topograficos':
            reps.append(representation(f"punto|{p['id']}", p.get('source'), p['id'], 'puntos-topograficos', 'INSERT',
                                       'punto_topografico', frame, 'Point', geom4326, status, origen=origen,
                                       attrs=attrs))
        elif capa == 'rutas-bloques':
            geom = shape(geom4326)
            reps.append(representation(f"bloque|{p['id']}", p.get('source'), p['id'], attrs.get('capa'),
                                       'LWPOLYLINE' if geom.geom_type == 'LineString' else 'INSERT', 'ruta_candidata',
                                       to_utm(geom), geom.geom_type, geom4326, 'provisional',
                                       origen=origen, attrs={**attrs, 'comparacion_modelo': attrs.get('comparacion_modelo'),
                                                             'tipo': attrs.get('tipo')}))
        elif capa == 'toponimia':
            clase = attrs.get('clase')
            texto = attrs.get('texto')
            if clase in ('institucion', 'hidrografia'):
                reps.append(representation(f"topo|{p['id']}", p.get('source'), p['id'], attrs.get('capa'), 'TEXT',
                                           clase, frame, 'Point', geom4326, status, text=texto, origen=origen,
                                           attrs=attrs))
            elif clase == 'calle':
                reps.append(representation(f"topo-calle|{p['id']}", p.get('source'), p['id'], attrs.get('capa'),
                                           'TEXT', 'calle', frame, 'Point', geom4326, status, text=texto,
                                           origen=origen, attrs=attrs))
            elif clase == 'sector':
                reps.append(representation(f"topo-sector|{p['id']}", p.get('source'), p['id'], attrs.get('capa'),
                                           'TEXT', 'sector', frame, 'Point', geom4326, status, text=texto,
                                           detail=R.sector_name(texto), origen=origen, attrs=attrs))
    return reps


# ----------------------------------------------------------------------------- identidad

def cluster_by_identity(reps):
    """Grupos de identidad por clase, agrupados respecto a una semilla.

    Se recorren las representaciones en orden de clave. Cada una se incorpora al primer
    grupo cuya semilla (su clave mínima) coincide con ella: misma clase, mismo tipo de
    geometría y distancia de Hausdorff dentro de la tolerancia. Si ninguno coincide,
    abre un grupo nuevo. Así toda pertenencia queda demostrada frente a la referencia
    del grupo, sin encadenamientos transitivos.
    """
    result = {}
    for kind in ('manzana', 'lote', 'vivienda'):
        idx = sorted((i for i, r in enumerate(reps) if r['kind'] == kind), key=lambda i: reps[i]['key'])
        geoms = [reps[i]['frame'] for i in idx]
        tree = STRtree(geoms)
        position = {i: a for a, i in enumerate(idx)}
        cluster_of = {}
        seeds = []  # posición de la semilla de cada grupo
        compared = 0
        for a, i in enumerate(idx):
            ga, gtype = geoms[a], reps[i]['geomType']
            tol = R.tolerance(R.geometry_class(gtype))
            found = None
            for b in sorted(tree.query(ga.buffer(MATCH_MARGIN))):
                if b not in cluster_of or reps[idx[b]]['geomType'] != gtype:
                    continue
                cid = cluster_of[b]
                seed = seeds[cid]
                if seed == b:
                    compared += 1
                    if ga.hausdorff_distance(geoms[seed]) <= tol:
                        found = cid
                        break
                else:
                    compared += 1
                    if ga.hausdorff_distance(geoms[seed]) <= tol:
                        found = cid
                        break
            if found is None:
                found = len(seeds)
                seeds.append(a)
            cluster_of[a] = found
        groups = collections.defaultdict(list)
        for a, i in enumerate(idx):
            groups[cluster_of[a]].append(reps[i]['key'])
        result[kind] = {'groups': [sorted(g) for g in groups.values()], 'compared': compared}
    return result


# ----------------------------------------------------------------------------- entidades

def entity_key(kind, nombre_clave):
    return str(uuid.uuid5(NAMESPACE, f'{kind}|{nombre_clave}'))


def build_entities(reps, cluster_result, routes):
    by_key = {r['key']: r for r in reps}
    entities = []
    for kind in ('manzana', 'lote', 'vivienda'):
        for members in cluster_result[kind]['groups']:
            clave = members[0]
            entities.append({'kind': kind, 'members': members, 'clave': clave,
                             'criterio': 'geometria_identica_en_marco_adoptado' if len(members) > 1 else 'representacion_unica'})
    for kind, criterio in (('calle', 'nombre_normalizado'), ('sector', 'nombre_de_capa_normalizado')):
        names = collections.defaultdict(list)
        for r in reps:
            if r['kind'] != kind:
                continue
            name = R.normalize_name(r['text']) if kind == 'calle' else (r.get('detail') or '')
            if not name or R.is_generic_name(name):
                # Sin nombre propio no hay identidad: el rótulo se conserva como registro original.
                entities.append({'kind': kind, 'members': [r['key']], 'clave': r['key'],
                                 'criterio': 'registro_original_nombre_generico', 'nombre_normalizado': name})
                continue
            names[name].append(r['key'])
        for name in sorted(names):
            entities.append({'kind': kind, 'members': sorted(names[name]), 'clave': f'{kind}|{name}',
                             'criterio': criterio, 'nombre_normalizado': name})
    for r in reps:
        if r['kind'] in ('hoja', 'cota', 'punto_topografico', 'sombreado', 'institucion', 'hidrografia', 'plano_ubicacion'):
            entities.append({'kind': r['kind'], 'members': [r['key']], 'clave': r['key'], 'criterio': 'registro_original'})
    for route in routes:
        entities.append({'kind': 'ruta', 'members': [route['key']], 'clave': route['key'], 'criterio': 'ruta_documental'})
    blocks = collections.defaultdict(list)
    for r in reps:
        if r['kind'] == 'ruta_candidata':
            blocks[r['attrs']['bloque_origen']].append(r['key'])
    for bloque in sorted(blocks):
        entities.append({'kind': 'ruta_candidata', 'members': sorted(blocks[bloque]), 'clave': f'bloque|{bloque}',
                         'criterio': 'bloque_no_insertado_candidato', 'nombre_normalizado': bloque})
    for e in entities:
        e['id'] = entity_key(e['kind'], e['clave'])
        e['members'] = sorted(e['members'])
    entities.sort(key=lambda e: e['id'])
    ids = [e['id'] for e in entities]
    if len(set(ids)) != len(ids):
        raise SystemExit('Identificadores de entidad duplicados: revisar las claves de agrupación.')
    return entities, by_key


def entity_geometry(entity, by_key):
    """Geometría de referencia (marco adoptado) y su versión en EPSG:4326 para visualización."""
    members = [by_key[k] for k in entity['members']]
    kind = entity['kind']
    if kind == 'ruta_candidata':
        lines = [m['frame'] for m in members if m['geomType'] == 'LineString']
        frame = MultiLineString([list(g.coords) for g in lines]) if lines else MultiPoint([m['frame'] for m in members])
    elif kind == 'sector':
        # La unión solo sirve como referencia de visualización: los contornos de origen se
        # conservan sin reparar; make_valid se aplica únicamente aquí y queda documentado.
        polys = [make_valid(m['frame']) if not m['frame'].is_valid else m['frame']
                 for m in members if m['geomType'] == 'Polygon']
        lines = [m['frame'] for m in members if m['geomType'] == 'LineString']
        points = [m['frame'] for m in members if m['geomType'] == 'Point']
        if polys:
            frame = unary_union(polys)
        elif lines:
            frame = MultiLineString([list(g.coords) for g in lines])
        else:
            frame = MultiPoint(points)
    elif kind == 'calle':
        frame = MultiPoint([m['frame'] for m in members])
    else:
        frame = members[0]['frame']
    return frame, to_wgs(frame)


def deviation(member, reference):
    if member is reference:
        return 0.0
    return round(member['frame'].hausdorff_distance(reference['frame']), 4)


# ----------------------------------------------------------------------------- atributos

def add_attribute(attrs, seen, entity_id, clave, valor, tipo, fuente, justificacion):
    if valor in (None, '', [], {}):
        return
    fingerprint = digest([entity_id, clave, valor])
    if fingerprint in seen:
        return
    seen.add(fingerprint)
    attrs.append({'id': str(uuid.uuid5(NAMESPACE, f'attr|{fingerprint}|{digest(fuente)}')), 'entidad': entity_id,
                  'clave': clave, 'valor': valor, 'tipo': tipo, 'fuente': fuente, 'justificacion': justificacion})


def publish_text(text, stats, source=None):
    """Texto publicable. Los rótulos de COFOPRI (declarados privados en cad_review) solo pasan si son técnicos o de vía."""
    if text is None:
        return None
    allowed = R.is_publishable_text(text)
    if source and source.startswith('COFOPRI'):
        allowed = allowed and R.is_technical_or_street_text(text)
    if allowed:
        return text
    stats['retenido_privacidad'] += 1
    return '[retenido por privacidad]'


def build_attributes(entities, by_key, src, label_texts, stats, manzana_index, rpu_index, labels_second):
    attrs, seen = [], set()
    entity_of_rep = {}
    for e in entities:
        for m in e['members']:
            entity_of_rep.setdefault(m, e['id'])
    # Clase y capas de origen de cada grupo.
    for e in entities:
        if e['kind'] in ('manzana', 'lote', 'vivienda'):
            capas = sorted({by_key[m]['layer'] for m in e['members']})
            add_attribute(attrs, seen, e['id'], 'capas_de_origen', capas, 'complementario',
                          {'tipo': 'representaciones', 'ids': e['members'][:5]}, 'Capas CAD donde aparece el mismo elemento')
            add_attribute(attrs, seen, e['id'], 'fuentes', sorted({by_key[m]['source'] for m in e['members']}),
                          'complementario', {'tipo': 'representaciones'}, 'Archivos que contienen la representación')
            if len(e['members']) > 1:
                add_attribute(attrs, seen, e['id'], 'copias_en_fuentes', len(e['members']), 'complementario',
                              {'tipo': 'identidad'}, 'Número de representaciones fusionadas por identidad geométrica')
            situacion = {by_key[m]['detail'] for m in e['members'] if by_key[m].get('detail')}
            if e['kind'] == 'lote' and situacion:
                add_attribute(attrs, seen, e['id'], 'situacion', sorted(situacion), 'principal',
                              {'tipo': 'capa'}, 'Capa de lote con situación declarada (invadido o levantamiento)')
        if e['kind'] == 'sector':
            add_attribute(attrs, seen, e['id'], 'nombre_en_fuentes', sorted({by_key[m]['layer'] for m in e['members']}),
                          'complementario', {'tipo': 'capa'}, 'Capas que llevan este nombre de sector')
        if e['kind'] == 'calle':
            variants = sorted({by_key[m]['text'] for m in e['members'] if by_key[m]['text']})
            cuadras = sorted({R.cuadra(v) for v in variants if R.cuadra(v)})
            add_attribute(attrs, seen, e['id'], 'variantes_de_nombre',
                          [publish_text(v, stats) for v in variants], 'complementario',
                          {'tipo': 'rotulos'}, 'Formas distintas con que aparece el nombre en los planos')
            add_attribute(attrs, seen, e['id'], 'cuadras', cuadras, 'complementario',
                          {'tipo': 'rotulos'}, 'Cuadra o cuadrante mencionado junto al nombre')
            add_attribute(attrs, seen, e['id'], 'rotulos', len(e['members']), 'complementario',
                          {'tipo': 'rotulos'}, 'Número de rótulos del nombre en las fuentes')
        if e['kind'] == 'ruta_candidata':
            add_attribute(attrs, seen, e['id'], 'bloque_no_insertado', e['nombre_normalizado'], 'principal',
                          {'tipo': 'segunda-pasada', 'capa': 'rutas-bloques'},
                          'Bloque definido y no insertado que contiene el croquis')
            capas = sorted({by_key[m]['attrs'].get('capa') for m in e['members'] if by_key[m]['attrs'].get('capa')})
            add_attribute(attrs, seen, e['id'], 'capa_cad', capas, 'complementario',
                          {'tipo': 'segunda-pasada', 'capa': 'rutas-bloques'}, 'Capa CAD del croquis')
            add_attribute(attrs, seen, e['id'], 'comparacion_con_modelo',
                          sorted({by_key[m]['attrs'].get('comparacion_modelo') for m in e['members']
                                  if by_key[m]['attrs'].get('comparacion_modelo')}), 'complementario',
                          {'tipo': 'segunda-pasada', 'capa': 'rutas-bloques'},
                          'Relación de cada trazo con el modelo (ya presente, próximo o no presente)')
            add_attribute(attrs, seen, e['id'], 'nota_de_uso', 'Candidato: servicio y vigencia por confirmar; no fusionado con las rutas municipales.',
                          'principal', {'tipo': 'regla', 'id': 'candidatos-bloques'}, 'Clasificación vigente de candidato')
        if e['kind'] == 'punto_topografico' or e['kind'] in ('cota', 'hoja', 'sombreado', 'institucion', 'hidrografia'):
            rep = by_key[e['members'][0]]
            for k, v in rep['attrs'].items():
                if k in ('fuente', 'utm', 'origen', 'z_rotulo', 'z_coincide_rotulo', 'nota', 'crs', 'bloque',
                         'capa', 'handle', 'dato', 'interpretacion', 'validador', 'solid', 'anillos_totales',
                         'anillos_anidados_sin_asignar', 'alcance', 'ventana_utm', 'giro_grados', 'capas_congeladas',
                         'escala_aprox', 'ventana', 'hoja'):
                    continue
                if k in ('texto', 'texto_sustituido', 'descripcion', 'punto'):
                    v = publish_text(v, stats) if isinstance(v, str) else v
                if k == 'z' and not rep['attrs'].get('cota_utilizable', False):
                    add_attribute(attrs, seen, e['id'], 'z_no_verificado', v, 'complementario',
                                  {'tipo': 'representacion', 'id': rep['key']},
                                  'Cota no utilizable: no se usa como altura definitiva')
                    continue
                add_attribute(attrs, seen, e['id'], k, v, 'complementario', {'tipo': 'representacion', 'id': rep['key']},
                              'Atributo de la representación original')
            if e['kind'] == 'punto_topografico' and rep['attrs'].get('cota_utilizable'):
                add_attribute(attrs, seen, e['id'], 'cota_m', rep['attrs'].get('z'), 'principal',
                              {'tipo': 'representacion', 'id': rep['key']},
                              'Cota que coincide con su rótulo Z y el rango urbano (sin datum vertical declarado)')
    # Manzanas: rótulos y calles colindantes por identificador original y contención.
    for e in entities:
        if e['kind'] != 'manzana':
            continue
        for m in e['members']:
            rep = by_key[m]
            link = manzana_index.get((rep['source'], rep['ref']))
            if link:
                for txt in link.get('rotulos_manzana', []):
                    add_attribute(attrs, seen, e['id'], 'rotulo', publish_text(txt, stats), 'principal',
                                  {'tipo': 'segunda-pasada', 'capa': 'manzanas', 'handle': rep['ref'], 'source': rep['source']},
                                  'Rótulo de manzana en el mismo contorno (identificador original)')
                for calle in link.get('calles_colindantes', []):
                    add_attribute(attrs, seen, e['id'], 'calles_colindantes', publish_text(calle, stats), 'complementario',
                                  {'tipo': 'rpu', 'handle': rep['ref'], 'source': rep['source']},
                                  'Calles por lado del xdata RPU_GRAFICOS')
            rpu = rpu_index.get((rep['source'], rep['ref'], rep['layer']))
            if rpu:
                add_attribute(attrs, seen, e['id'], 'calles_por_lado', rpu['calles_por_lado'], 'complementario',
                              {'tipo': 'rpu', 'handle': rep['ref'], 'source': rep['source']},
                              'Calles por lado del xdata RPU_GRAFICOS (tercera pasada)')
    manzana_polys = [(e, by_key[e['members'][0]]['frame']) for e in entities if e['kind'] == 'manzana'
                     and by_key[e['members'][0]]['geomType'] == 'Polygon']
    tree_m = STRtree([g for _, g in manzana_polys]) if manzana_polys else None
    for lbl in label_texts:
        if not tree_m or not lbl['text'] or not R.is_publishable_text(lbl['text']):
            stats['rotulo_manzana_no_asignado' if lbl['text'] else 'rotulo_vacio'] += 1
            continue
        hits = [manzana_polys[j][0] for j in tree_m.query(lbl['point']) if manzana_polys[j][1].contains(lbl['point'])]
        if not hits:
            stats['rotulo_manzana_no_asignado'] += 1
        for e in hits:
            add_attribute(attrs, seen, e['id'], 'rotulo', lbl['text'], 'principal',
                          {'tipo': 'texto-cad', 'source': lbl['source'], 'ref': lbl['ref']},
                          'Rótulo de manzana dentro del contorno')
    # Lotes: rótulos y medidas de segunda pasada, por contención en el contorno del lote.
    lote_polys = [(e, by_key[e['members'][0]]['frame']) for e in entities if e['kind'] == 'lote'
                  and by_key[e['members'][0]]['geomType'] == 'Polygon']
    tree_l = STRtree([g for _, g in lote_polys]) if lote_polys else None
    LABEL_KEY = {'numero_lote': 'numero', 'medida': 'medida', 'uso': 'uso', 'letra': 'letra',
                 'calle': 'calle_rotulo', 'otro': 'rotulo_otro'}
    for lbl in labels_second:
        point = Point(lbl['frame'].x, lbl['frame'].y)
        clave = LABEL_KEY.get(lbl['tipo'])
        if clave is None:
            stats['rotulo_tipo_desconocido'] += 1
            continue
        hits = []
        if tree_l:
            hits = [lote_polys[j][0] for j in tree_l.query(point) if lote_polys[j][1].contains(point)]
        if not hits:
            stats['rotulo_lote_no_asignado'] += 1
            continue
        if len(hits) > 1:
            stats['rotulo_en_varios_lotes'] += 1
        for e in hits:
            add_attribute(attrs, seen, e['id'], clave, publish_text(lbl['texto'], stats), 'complementario',
                          {'tipo': 'segunda-pasada', 'capa': 'etiquetas-lote', 'id': lbl['id']},
                          'Rótulo del plano dentro del contorno del lote')
            if lbl.get('codigo_epod'):
                add_attribute(attrs, seen, e['id'], 'codigo_epod', lbl['codigo_epod'], 'complementario',
                              {'tipo': 'segunda-pasada', 'capa': 'etiquetas-lote', 'id': lbl['id']},
                              'Código EGPT_EPOD asociado al rótulo; significado no conocido')
    return attrs


# ----------------------------------------------------------------------------- relaciones

def build_relations(entities, by_key):
    rels = []
    seen = set()

    def add(tipo, a, b, evidencia):
        key = (tipo, a, b)
        if key in seen:
            return
        seen.add(key)
        rels.append({'id': str(uuid.uuid5(NAMESPACE, f'rel|{tipo}|{a}|{b}')), 'tipo': tipo, 'desde': a, 'hacia': b,
                     'evidencia': evidencia, 'regla': f'relacion-v{R.RULES_VERSION}'})

    by_kind = collections.defaultdict(list)
    for e in entities:
        by_kind[e['kind']].append(e)
    refs = {e['id']: entity_geometry(e, by_key)[0] for e in entities if e['kind'] in ('manzana', 'lote', 'vivienda', 'sector', 'ruta')}

    # Vivienda y lote con la misma forma: relación, no identidad.
    lotes = [e for e in by_kind['lote'] if refs[e['id']].geom_type == 'Polygon']
    viviendas = [e for e in by_kind['vivienda'] if refs[e['id']].geom_type == 'Polygon']
    tree = STRtree([refs[e['id']] for e in lotes]) if lotes else None
    for v in viviendas:
        if not tree:
            break
        gv = refs[v['id']]
        for j in tree.query(gv.buffer(MATCH_MARGIN)):
            l = lotes[j]
            if gv.hausdorff_distance(refs[l['id']]) <= R.tolerance('polygon'):
                add('forma_coincidente_otra_clase', v['id'], l['id'],
                    {'criterio': 'Hausdorff ≤ 0,05 m; clases distintas: no se funden'})

    # Contención: manzana ⊃ lote; sector ⊃ manzana (por punto representativo y área).
    manzanas = [e for e in by_kind['manzana'] if refs[e['id']].geom_type == 'Polygon']
    tree_m = STRtree([refs[e['id']] for e in manzanas]) if manzanas else None
    for l in lotes:
        if not tree_m:
            break
        gl = refs[l['id']]
        p = gl.representative_point()
        for j in tree_m.query(p):
            m = manzanas[j]
            gm = refs[m['id']]
            if gm.contains(p) and gl.area > 0 and gm.intersection(gl).area / gl.area >= CONTAIN_RATIO:
                add('contenido_en', l['id'], m['id'], {'criterio': 'punto representativo dentro y ≥95 % del área'})
    sectores = [e for e in by_kind['sector'] if refs[e['id']].geom_type in ('Polygon', 'MultiPolygon')]
    for m in manzanas:
        p = refs[m['id']].representative_point()
        for s in sectores:
            if refs[s['id']].contains(p):
                add('contenido_en', m['id'], s['id'], {'criterio': 'punto representativo dentro del sector'})

    # Rutas: tramo compartido (no fusiona).
    routes = by_kind['ruta']
    for i, a in enumerate(routes):
        ga = refs[a['id']]
        for b in routes[i + 1:]:
            gb = refs[b['id']]
            shared = ga.buffer(0.5).intersection(gb).length
            if shared >= ROUTE_OVERLAP_M:
                add('comparte_tramo', a['id'], b['id'],
                    {'longitud_m': round(shared, 1), 'criterio': 'línea de una ruta dentro de 0,5 m de la otra',
                     'nota': 'Compartir un tramo no convierte dos rutas en una'})
    return rels


# ----------------------------------------------------------------------------- conflictos y excepciones

def build_conflicts_and_exceptions(src, by_key, entities, stats):
    conflicts, exceptions = [], []
    for m in src['marcos']:
        if m['marco'] == 'indeterminado':
            exceptions.append({'id': str(uuid.uuid5(NAMESPACE, f"exc|marco|{m['handle']}")),
                               'entidad': None, 'representacion': None, 'causa': 'marco_indeterminado',
                               'datos': {'handle': m['handle'], 'capa': m['layer'], 'utm_bruto': m['utm_bruto'],
                                         'texto': publish_text(m.get('texto'), stats),
                                         'evidencias': m['evidencias']},
                               'nota': 'Pertenece a Tomaque o a COFOPRI; no hay evidencia suficiente para asignar el marco.'})
        else:
            conflicts.append({'id': str(uuid.uuid5(NAMESPACE, f"conf|marco|{m['handle']}")),
                              'entidad': None, 'propiedad': 'marco_coordenadas', 'estado': 'resuelto_por_evidencia',
                              'valores': [{'marco': m['marco'], 'fuente': 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg'},
                                          {'marco': 'COFOPRI', 'fuente': 'COFOPRI BAGUA.dwg'}],
                              'evidencia': {'handle': m['handle'], 'utm_bruto': m['utm_bruto'],
                                            'evidencias': m['evidencias'], 'regla': 'marco por evidencia por entidad'}})
    for c in src['contradictions']:
        if c['tipo'] != 'texto distinto en la misma posición':
            continue
        ta = publish_text(c.get('a_texto'), stats, c['a'])
        tb = publish_text(c.get('b_texto'), stats, c['b'])
        conflicts.append({'id': str(uuid.uuid5(NAMESPACE, f"conf|texto|{c['a']}|{c['a_ref']}|{c['b']}|{c['b_ref']}")),
                          'entidad': None, 'propiedad': 'texto_en_la_misma_posicion', 'estado': 'pendiente',
                          'valores': [{'texto': ta, 'fuente': c['a'], 'capa': c['a_capa'], 'ref': c['a_ref']},
                                      {'texto': tb, 'fuente': c['b'], 'capa': c['b_capa'], 'ref': c['b_ref']}],
                          'evidencia': {'utm': c['utm'], 'regla': 'mismo punto, texto distinto: no se elige texto'}})
    ordinal = collections.Counter()
    for f in src['shading']['features']:
        p = f['properties']
        base = f"sombreado|{p['source']}|{p['handle']}|{p['layer']}"
        ordinal[base] += 1
        if p['valido']:
            continue
        rep_key = f"{base}|{ordinal[base]}"  # misma clave que la representación (orden del archivo)
        exceptions.append({'id': str(uuid.uuid5(NAMESPACE, f"exc|{rep_key}")),
                           'entidad': entity_key('sombreado', rep_key), 'representacion': rep_key,
                           'causa': 'geometria_no_valida_sin_reparar',
                           'datos': {'motivo': p.get('motivo_invalidez'), 'handle': p['handle'], 'fuente': p['source'],
                                     'capa': p['layer']},
                           'nota': 'Se conserva la geometría de origen; no se repara para uso espacial.'})
    if stats['rotulo_lote_no_asignado']:
        exceptions.append({'id': str(uuid.uuid5(NAMESPACE, 'exc|rotulos-sin-lote')), 'entidad': None,
                           'representacion': None, 'causa': 'rotulo_sin_contorno_de_lote',
                           'datos': {'numero': stats['rotulo_lote_no_asignado']},
                           'nota': 'Rótulos del plano fuera de cualquier contorno de lote consolidado.'})
    if stats['rotulo_manzana_no_asignado']:
        exceptions.append({'id': str(uuid.uuid5(NAMESPACE, 'exc|rotulos-manzana-sin-manzana')), 'entidad': None,
                           'representacion': None, 'causa': 'rotulo_sin_contorno_de_manzana',
                           'datos': {'numero': stats['rotulo_manzana_no_asignado']},
                           'nota': 'Rótulos de manzana sin contorno consolidado que los contenga.'})
    return conflicts, exceptions


# ----------------------------------------------------------------------------- orquestación

def routes_from_sources(src, by_key):
    """Rutas documentales (MUN-*, CAD-*): se conservan independientes, con su geometría alineada."""
    rows = []
    for r in src['manifest']['routes']:
        rows.append((r, r['originalGeometry'], r['geometry']))
    for r in src['cad'].get('routes', []):
        rows.append((r, r['originalGeometry'], r['geometry']))
    symbols = collections.Counter()
    for f in src['cartography']['features']:
        p = f['properties']
        if p.get('routeCode') and p.get('kind') in ('sentido', 'inicio', 'fin', 'parada'):
            symbols[(p['routeCode'], p['kind'])] += 1
    routes, out = [], []
    for r, raw, g4326 in rows:
        frame = shape({'type': 'MultiLineString', 'coordinates': raw['coordinates']}) if raw['type'] == 'MultiLineString' else shape(raw)
        meta = r.get('metadata', {})
        attrs = {'servicio_id': r.get('servicioId'), 'estado_documental': meta.get('status'),
                 'nota': meta.get('note'), 'fuente': meta.get('source'), 'segmentos': meta.get('segments'),
                 'longitud_km': meta.get('lengthKm'), 'crs': meta.get('sourceCrs'),
                 'simbolos_sentido': symbols.get((r['codigo'], 'sentido'), 0),
                 'simbolos_inicio': symbols.get((r['codigo'], 'inicio'), 0),
                 'simbolos_fin': symbols.get((r['codigo'], 'fin'), 0),
                 'horario': None, 'frecuencia': None}
        rep = representation(key=f"ruta|{r['codigo']}", source=meta.get('source', ''), ref=r['codigo'], layer='rutas',
                             entity_type='MULTILINE', kind='ruta', frame=frame, geom_type='MultiLineString',
                             geometry4326=g4326, crs_status='declarado', text=r['nombre'],
                             origen='manifest.json / cad-reconciliation.json.gz', attrs={**attrs, 'codigo': r['codigo'],
                                                                                          'nombre': r['nombre'],
                                                                                          'color': r.get('color')})
        routes.append(rep)
        out.append(rep)
    return routes


def build(src):
    stats = collections.Counter()
    cad_reps, excluded, label_texts = build_cad_representations(src)
    derived = build_derived_representations(src)
    paper = build_paper_space_representations(src, stats)
    reps = cad_reps + derived + paper
    routes = routes_from_sources(src, {})
    reps += routes
    reps.sort(key=lambda r: r['key'])
    by_key = {r['key']: r for r in reps}
    cluster_result = cluster_by_identity(reps)
    entities, by_key = build_entities(reps, cluster_result, routes)
    # Atributos de segunda pasada enlazados por (fuente, identificador original).
    manzana_index = {(f['properties']['source'], f['properties']['attributes']['handle']): f['properties']['attributes']
                     for f in src['second']['features'] if f['properties'].get('kind') == 'manzanas'}
    rpu_index = {(f['properties']['source'], f['properties']['handle'], f['properties']['layer']): f['properties']
                 for f in src['rpu']['features']}
    labels_second = []
    for f in src['second']['features']:
        p = f['properties']
        if p.get('kind') == 'etiquetas-lote':
            a = p.get('attributes', {})
            frame = to_utm(shape(f['geometry']))
            labels_second.append({'id': p['id'], 'tipo': a.get('tipo'), 'texto': a.get('texto'),
                                  'codigo_epod': a.get('codigo_epod'), 'frame': frame})
    # Representaciones y entidades. La geometría de referencia se fija antes de medir desviaciones.
    refs = {}
    for e in entities:
        frame, g = entity_geometry(e, by_key)
        refs[e['id']] = (frame, g)
    attrs = build_attributes(entities, by_key, src, label_texts, stats, manzana_index, rpu_index, labels_second)
    relations = build_relations(entities, by_key)
    conflicts, exceptions = build_conflicts_and_exceptions(src, by_key, entities, stats)
    return dict(reps=reps, by_key=by_key, entities=entities, refs=refs, attrs=attrs, relations=relations,
                conflicts=conflicts, exceptions=exceptions, excluded=excluded, stats=stats,
                cluster=cluster_result, routes=routes)


def assemble(res):
    by_key, entities, refs = res['by_key'], res['entities'], res['refs']
    rep_entity = {}
    for e in entities:
        for m in e['members']:
            rep_entity[m] = e['id']
    conflicts_by_entity = collections.defaultdict(list)
    for c in res['conflicts']:
        if c.get('entidad'):
            conflicts_by_entity[c['entidad']].append(c['id'])
    attrs_by_entity = collections.defaultdict(int)
    for a in res['attrs']:
        attrs_by_entity[a['entidad']] += 1
    first_rotulo = {}
    for a in res['attrs']:
        if a['clave'] in ('rotulo', 'numero') and a['entidad'] not in first_rotulo:
            first_rotulo[a['entidad']] = a['valor']
    out_entities = []
    for e in entities:
        frame, g4326 = refs[e['id']]
        ref_member = by_key[e['members'][0]]
        provisional = any(by_key[m]['crsStatus'] == 'provisional' for m in e['members']) or \
            any(by_key[m].get('attrs', {}).get('valido') is False for m in e['members'])
        geor = {by_key[m]['crsStatus'] for m in e['members']}
        if geor <= {'declarado'}:
            georreferencia = 'declarado_geodata'
        elif 'adoptado' in geor and geor <= {'adoptado', 'declarado'}:
            georreferencia = 'marco_adoptado'
        else:
            georreferencia = 'provisional'
        out_entities.append({
            'id': e['id'], 'kind': e['kind'],
            'nombre': entity_name(e, by_key, first_rotulo),
            'nombreNormalizado': e.get('nombre_normalizado'),
            'criterio': e['criterio'],
            'representaciones': e['members'],
            'geometry4326': public_geojson(g4326, 8),
            'marco': public_geojson(frame, 3),
            'estado': {'interpretacion': INTERPRETACION[e['kind']], 'georreferencia': georreferencia,
                       'validacion': 'pendiente_validacion_municipal'},
            'provisional': bool(provisional or conflicts_by_entity.get(e['id'])),
            'conflictos': conflicts_by_entity.get(e['id'], []),
            'atributos': attrs_by_entity.get(e['id'], 0),
            'referencia': ref_member['key'],
        })
    entity_by_id = {e['id']: e for e in entities}
    out_reps = []
    for r in res['reps']:
        entity = rep_entity.get(r['key'])
        if entity is None:
            continue
        ent_ref = refs[entity][0]
        out_reps.append({'key': r['key'], 'entidad': entity, 'source': r['source'], 'ref': r['ref'], 'layer': r['layer'],
                         'entityType': r['entityType'], 'kind': r['kind'], 'geomType': r['geomType'],
                         'crsStatus': r['crsStatus'], 'offset': r['offset'],
                         'desviacionM': deviation(r, by_key[entity_by_id[entity]['members'][0]]),
                         'origen': r['origen'], 'geometry4326': public_geojson(to_wgs(r['frame']), 8),
                         'marco': public_geojson(r['frame'], 3),
                         'coordenadasBrutas': r['raw'], 'atributos': r.get('attrs', {}) if r['kind'] in ('sombreado', 'hoja', 'cota', 'punto_topografico', 'institucion', 'hidrografia', 'ruta') else {},
                         'texto': publish_text(r.get('text'), res['stats'], r['source'])})
    return out_entities, out_reps


INTERPRETACION = {
    'manzana': 'identidad_geometrica_comprobada', 'lote': 'contorno_documental_no_predio',
    'vivienda': 'edificacion_documental', 'calle': 'nombre_normalizado_sin_geometria_de_via',
    'sector': 'nombre_de_capa_por_validar', 'ruta': 'documental_no_operativa',
    'punto_topografico': 'levantamiento_documental', 'sombreado': 'superficie_sin_significado_validado',
    'hoja': 'ventana_de_presentacion', 'cota': 'medida_documental', 'institucion': 'toponimo_documental',
    'hidrografia': 'toponimo_documental', 'plano_ubicacion': 'copia_plano_precision_limitada',
    'ruta_candidata': 'candidato_bloque_no_insertado_sin_asignar',
}


def entity_name(e, by_key, first_rotulo):
    kind = e['kind']
    if kind == 'calle':
        return e['nombre_normalizado'].title() if e.get('nombre_normalizado') else 'Calle'
    if kind == 'sector':
        return 'Sector ' + (e.get('nombre_normalizado') or '').title()
    if kind == 'ruta':
        return by_key[e['members'][0]]['attrs'].get('nombre') or 'Ruta'
    if kind == 'ruta_candidata':
        return f"Trazo candidato · bloque {e['nombre_normalizado']}"
    if kind in ('institucion', 'hidrografia'):
        return by_key[e['members'][0]]['text'] or kind.title()
    if kind in ('manzana', 'lote'):
        rotulo = first_rotulo.get(e['id'])
        base = 'Manzana' if kind == 'manzana' else 'Lote'
        return f'{base} {rotulo}' if rotulo else f'{base} sin rótulo'
    if kind == 'vivienda':
        return 'Vivienda documental'
    if kind == 'punto_topografico':
        return f"Punto {by_key[e['members'][0]]['attrs'].get('punto') or ''}".strip()
    return {'hoja': 'Ventana de hoja', 'cota': 'Cota del dibujo', 'sombreado': 'Sombreado'}.get(kind, kind)


def verify_identity(entities, reps, by_key):
    """Cada representación agrupada queda dentro de la tolerancia de su tipo frente a la referencia."""
    checked, violations, worst = 0, 0, collections.defaultdict(float)
    rep_by_key = {r['key']: r for r in reps}
    for e in entities:
        if e['kind'] not in ('manzana', 'lote', 'vivienda') or len(e['representaciones']) < 2:
            continue
        ref = rep_by_key[e['referencia']]
        for m in e['representaciones']:
            member = rep_by_key[m]
            checked += 1
            cls = R.geometry_class(by_key[m]['geomType'])
            tol = R.tolerance(cls)
            worst[cls] = max(worst[cls], member['desviacionM'])
            if member['desviacionM'] > tol:
                violations += 1
    if violations:
        raise SystemExit(f'Identidad fuera de tolerancia en {violations} representaciones: revisar la agrupación.')
    return {'representaciones_verificadas': checked, 'violaciones': violations,
            'desviacion_maxima_m': {k: round(v, 4) for k, v in worst.items()},
            'tolerancia_m': R.TOLERANCE_M}


PRIVATE_MARKERS = R.PERSONAL_NAME_MARKERS


def scan_privacy(payload):
    """Ningún texto publicado contiene marcadores de trámite personal; los retenidos llevan marcador."""
    hits, retained = [], 0

    def visit(value, path):
        nonlocal retained
        if isinstance(value, str):
            if value == '[retenido por privacidad]':
                retained += 1
            elif PRIVATE_MARKERS.search(value):
                hits.append((path, value[:60]))
        elif isinstance(value, dict):
            for k, v in value.items():
                visit(v, f'{path}.{k}')
        elif isinstance(value, list):
            for i, v in enumerate(value):
                visit(v, f'{path}[{i}]')

    visit(payload, '$')
    if hits:
        raise SystemExit(f'Texto con marcador de trámite personal publicado: {hits[:5]}')
    return {'marcadores_personales_publicados': 0, 'textos_retenidos': retained}


def package(res):
    entities, reps = assemble(res)
    by_key_reps = res['by_key']
    identity = verify_identity(entities, reps, by_key_reps)
    privacy_pre = None
    reglas = [{'id': 'identidad-geometrica', 'version': R.RULES_VERSION,
               'descripcion': 'Dos representaciones de la misma clase son el mismo elemento si su distancia de Hausdorff '
                              'está dentro de la tolerancia del tipo (polígono 0,05 m; línea 0,20 m).',
               'parametros': R.TOLERANCE_M},
              {'id': 'nombre-normalizado', 'version': R.RULES_VERSION,
               'descripcion': 'Calles y sectores se agrupan por nombre normalizado (sin tildes, abreviaturas unificadas, '
                              'cuadra separada). Sin geometría de vía: no se fusiona por geometría.'},
              {'id': 'forma-no-es-identidad', 'version': R.RULES_VERSION,
               'descripcion': 'Misma forma y clases distintas (VIVIENDA frente a Limite Lote) se relacionan; no se funden.'},
              {'id': 'contencion', 'version': R.RULES_VERSION,
               'descripcion': 'Un lote está contenido en una manzana si su punto representativo está dentro y ≥95 % de su área.'},
              {'id': 'rutas-independientes', 'version': R.RULES_VERSION,
               'descripcion': 'Las rutas no se fusionan; compartir un tramo ≥10 m genera la relación comparte_tramo.'},
              {'id': 'privacidad', 'version': R.RULES_VERSION,
               'descripcion': 'Textos administrativos o de trámite de predios individuales se retienen y se sustituyen.'}]
    counts = collections.Counter(e['kind'] for e in entities)
    repcount = collections.Counter(r['kind'] for r in reps)
    audit = {
        'dataset': DATASET, 'version': R.RULES_VERSION,
        'entidades_por_clase': dict(sorted(counts.items())),
        'representaciones_por_clase': dict(sorted(repcount.items())),
        'entidades_con_varias_representaciones': sum(1 for e in entities if len(e['representaciones']) > 1),
        'entidades_exclusivas': sum(1 for e in entities if len(e['representaciones']) == 1),
        'atributos': len(res['attrs']),
        'relaciones': dict(collections.Counter(r['tipo'] for r in res['relations'])),
        'conflictos': len(res['conflicts']),
        'excepciones': dict(collections.Counter(x['causa'] for x in res['exceptions'])),
        'excluidas_por_capa': dict(res['excluded'].most_common(40)),
        'privacidad_retenidos': res['stats']['retenido_privacidad'],
        'identidad': identity,
        'rotulos_sin_asignar': {'lote': res['stats']['rotulo_lote_no_asignado'],
                                'manzana': res['stats']['rotulo_manzana_no_asignado']},
        'identidad_pares_comparados': {k: v['compared'] for k, v in res['cluster'].items()},
        'simbolos_presentacion_excluidos': res['stats']['simbolo_presentacion_excluido'],
        'no_consolidado': 'Capas CAD sin clase territorial (p. ej. ACOTAMIENTO, DETALLES, PERIMETRO-SECTOR I, '
                          'SECCIONES-VIAS, ZANORA, COTAS): permanecen en cad_review y en la tercera pasada.',
    }
    payload = {'version': 1, 'dataset': DATASET, 'reglas': reglas, 'entidades': entities,
               'representaciones': reps,
               'atributos': sorted(res['attrs'], key=lambda a: a['id']),
               'relaciones': sorted(res['relations'], key=lambda r: r['id']),
               'conflictos': sorted(res['conflicts'], key=lambda c: c['id']),
               'excepciones': sorted(res['exceptions'], key=lambda x: x['id']),
               'auditoria': audit}
    audit['privacidad'] = scan_privacy(payload)
    return payload


def main():
    src = load_sources()
    res = build(src)
    payload = package(res)
    text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as stream:
        stream.write(text.encode('utf8'))
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps(payload['auditoria'], ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(payload['auditoria'], ensure_ascii=False, indent=2))
    print('sha256', hashlib.sha256(OUT.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
