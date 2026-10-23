"""Package the second-pass layers (deep_derive.py) for PostGIS review.

Input:  data/cad/gis/segunda-pasada/*.geojson, etiquetas-lote.geojson.gz, resumen.json
Output: database/municipal/segunda-pasada.json.gz (imported by import-second-pass.ts)

Tomaque's measured translation is the adopted CRS since 16 Oct 2026 (crsStatus
'adoptado'); recovered block routes stay provisional and apart from municipal routes. Every feature carries
its source, CRS note, applied translation and review status. Free-text lot
labels are published only when they match technical patterns, because the
drawing also labels plots with owner names.
"""
from pathlib import Path
from collections import Counter
import gzip
import hashlib
import json
import re
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'data/cad/gis/segunda-pasada'
OUT = ROOT / 'database/municipal/segunda-pasada.json.gz'
TO_UTM = Transformer.from_crs(4326, 32717, always_xy=True)
TOMAQUE = 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg'
REFERENCE = 'RUTAS CON TIEMPO.dwg'

# Lot labels of class "otro" are free text. Only these shapes are published.
TECHNICAL_LABEL = re.compile(
    r'(P-?\d{1,3}|[A-Z]{1,2}\d{0,2}\'?|\d{1,3} ?[A-Z]|\d[a-z]|\d\.A|\d{4}-[A-Z]'
    r'|BLOQUE \d+|MZ[.,]? ?\d+( ?[A-Z])?|Mz-[A-ZÑ0-9]{1,2}|MANZANA "[A-Z]"'
    r'|LOTE \d+[A-Z]?(-\d+)?( \(pasadizo\))?|Lote \d+[A-Z]?|Lt\. \d+|SUB[ -]?LOTE [0-9A-Z-]+|Sub lote [0-9A-Z-]+'
    r'|cuadra -\d+|Cda\. [A-Z]'
    r'|(AREA|A|PER|PERIMETRO|P|Distancia)\s*[=:]?\s*[\d.,]+\s*(m2|ml|m|M2|ML|M)?\.?'
    r'|\d{6}E|\d{7}N|[EN] \d{6,7}|[XY]= ?[\d.]+|ESCALA 1/\d+'
    r'|(CANAL|RIO|SECTOR|LOTIZACI[OÓ]N|Habilitacion Urbana|Prlg\.|PROLG|Prolg|Psj\.|Zona URBANA)\b.*)',
    re.I)
PUBLIC_USE = {s.upper() for s in [
    'AREA DEPORTIVA', 'AREA DE PARQUEO', 'AREA URBANA SIN LOTIZAR', 'AREAS DE SERVICIO MUNICIPAL',
    'APORTE', 'Aporte - Educación', 'Aporte - Recreación', 'Aporte - Servicios', 'ADMINISTRACION',
    'AGENCIA MUNICIPAL', 'BOMBEROS', 'C.E.I.', 'CEMENTERIO', 'CEMENTERIO BUEN PASTOR', 'COMEDOR POPULAR',
    'COMUNALES', 'DEFENZA CIVIL', 'EDUCACIÓN', 'EDUCACION', 'ENTRADA', 'ESALUD', 'ESSALUD', 'EX PRONAA',
    'GOBERNACION', 'HIGIENICOS', 'IGLESIA', 'LOCAL COMUNAL', 'LOZA DEPORTIVA', 'MAESTRANZA', 'MERCADO 01',
    'MERCADO "02"', 'MUNICIPALIDAD DE BAGUA', 'MUNICIPAL', 'OTROS FINES', 'PACILLOS NO PAVIMENTADOS',
    'PASILLOS PAVIMENTADOS', 'PASILLOS SIN PAVIMENTAR', 'PARADA MUNICIPAL "03"', 'PARADA Y MERCADO MUNICIPAL',
    'PATIO', 'POLICIA NACIONAL DEL PERU', 'POSTA MEDICA', 'PROPIEDAD MUNICIPAL', 'RECREACIÓN', 'RECREACION',
    'R E C R E A C I O N', 'RECREO', 'RECIDUOS SOLIDOS', 'REMANENTE', 'SERV. DE SALUD',
    'SERV. ELECTRIFICACIÓN', 'SERV. SALUD', 'SERVICIO', 'SERVICIOS', 'SERVICIOS COMUNALES', 'SERVIDUMBRE',
    'SECCIONES VIALES', 'SS. HH', 'SS.HH.', 'TELEFONICA', 'TERMINAL TERRESTRE', 'TERRENO DE TERCEROS',
    'TERRENOS DE TERCEROS', 'PROPIEDAD DE TERCEROS', 'PROP. DE TERCEROS', 'TERRENOS AGRICOLAS',
    'TERRENOS AGRICOLAS DE TERCEROS', 'TERRENOS DEL ESTADO', 'TIERRA LIBRE DEL ESTADO',
    'TIERRAS LIBRES DEL ESTADO', 'ZONA ARQUEOLOGICA', 'ZONA MILITAR', 'CANALETA', 'SARDINEL', 'BARRANCO',
    'PUNTO DE REFERENCIA', 'LOTE INDEPENDIZADO', 'PRIVADA', 'SOLAR', 'DEL ESTADO', 'ESTADO', 'TERRENOS',
    'PROPIEDAD', 'LOTE', 'AREA', 'PERIMETRICO', 'PERIMETRO:', 'ASOCIACION', 'COORDENADAS',
    'VALLE HUARANGOPAMPA']}
# Plot paperwork (certificates, subdivisions) is tied to individual holders.
ADMIN_TEXT = re.compile(r'RESOLUCI|CERTIF|SUBDIVI|SUB DIVI|SUB-DIVI|POSESI|POSECI|PROPIEDAD DEL? [A-Z]|SUCESI|TITULO', re.I)

REVIEW = {
    'rutas-bloques': 'Trazo recuperado de un bloque no insertado. No se fusiona con las rutas municipales; '
                     'servicio, vigencia y significado (ruta o contorno vial) por confirmar.',
    'puntos-topograficos': 'Punto de levantamiento CAD. Solo las cotas que coinciden con su rótulo Z y el '
                           'rango urbano se muestran como utilizables; sin datum vertical declarado.',
    'manzanas': 'Calles colindantes leídas del xdata RPU_GRAFICOS; contrastar con la nomenclatura vigente.',
    'toponimia': 'Clasificación automática por patrón de texto; no es nomenclatura aprobada.',
    'hojas-planos': 'Ventana de una hoja de presentación; no es un límite administrativo.',
}


def read(name):
    path = SRC / name
    opener = gzip.open if name.endswith('.gz') else open
    with opener(path, 'rt', encoding='utf8') as stream:
        return json.load(stream)


def to_utm(geometry):
    def conv(c):
        if isinstance(c[0], (int, float)):
            x, y = TO_UTM.transform(c[0], c[1])
            return [round(x, 3), round(y, 3)]
        return [conv(v) for v in c]
    return {'type': geometry['type'], 'coordinates': conv(geometry['coordinates'])}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    summary = read('resumen.json')
    alignment = summary['tomaque_alineacion']
    shift = (alignment['translation_m']['dE'], alignment['translation_m']['dN'])
    blocks = {b['bloque']: b for b in summary['rutas_bloques']['bloques'] if b.get('aceptado')}
    features, ids = [], set()
    withheld, duplicates, utm_inverse = Counter(), Counter(), 0

    def add(kind, f, props, source, offset, status, original=None):
        nonlocal utm_inverse
        if original is None:
            original = to_utm(f['geometry'])
            utm_inverse += 1
        body = {k: v for k, v in props.items() if k not in ('crs', 'fuente', 'utm', 'ventana_utm')}
        key = json.dumps([kind, source, f['geometry'], body], ensure_ascii=False, sort_keys=True)
        fid = f'{kind}:' + hashlib.sha1(key.encode('utf8')).hexdigest()[:20]
        if fid in ids:
            duplicates[kind] += 1
            return
        ids.add(fid)
        features.append({'type': 'Feature', 'geometry': f['geometry'], 'properties': {
            'id': fid, 'kind': kind, 'status': status,
            'reviewNote': REVIEW.get(kind) if status == 'por revisar' else None,
            'source': source, 'crs': props['crs'],
            'crsStatus': 'declarado' if offset == (0, 0) else 'adoptado' if source == TOMAQUE else 'provisional',
            'offset': list(offset), 'originalGeometry': original, 'attributes': body}})

    for f in read('rutas-bloques.geojson')['features']:
        p = dict(f['properties'])
        b = blocks[p['bloque_origen']]
        # Block F is SENTIDO DE RUTA (its hatch is 15C9C). On all 739 model arrows
        # measured from their triangle, bearing = 90° - insert rotation, and the
        # blocks are only translated, so the rotation carries over unchanged.
        if p.get('simbolo') == 'F' and p.get('rotacion_cad_grados') is not None:
            p['rumbo_grados'] = round((90 - p['rotacion_cad_grados']) % 360, 2)
            p['nota'] = ('Flecha SENTIDO DE RUTA (bloque F) de la versión no insertada. Rumbo = 90° − giro CAD, '
                         'calibrado con las 739 flechas medidas en el modelo. Servicio y vigencia por confirmar.')
        add('rutas-bloques', f, p, REFERENCE, tuple(b['traslacion_m']), 'por revisar')

    for f in read('puntos-topograficos.geojson')['features']:
        p = dict(f['properties'])
        p['cota_utilizable'] = p['cota_estado'].startswith('coincide')
        offset = shift if p['fuente'] == TOMAQUE else (0, 0)
        add('puntos-topograficos', f, p, p['fuente'], offset, 'por revisar',
            {'type': 'Point', 'coordinates': p['utm']})

    for f in read('manzanas.geojson')['features']:
        p = dict(f['properties'])
        streets = []
        for s in p['calles_colindantes']:
            for part in s.split('#'):
                part = ' '.join(part.split())
                if part and part not in streets:
                    streets.append(part)
        p['calles_colindantes'] = streets
        if not streets:  # deep_derive's note mentions RPU_GRAFICOS for every outline
            p['nota'] = 'Contorno CAD de manzana sin xdata de calles; no es un límite catastral validado.'
        add('manzanas', f, p, p['fuente'], shift, 'por revisar' if streets else 'documental')

    for f in read('etiquetas-lote.geojson.gz')['features']:
        p = f['properties']
        text = p['texto']
        if p['tipo'] == 'otro' and not (text.upper() in PUBLIC_USE or TECHNICAL_LABEL.fullmatch(text)):
            withheld['etiquetas-lote'] += 1
            continue
        if ADMIN_TEXT.search(text):
            withheld['etiquetas-lote'] += 1
            continue
        add('etiquetas-lote', f, p, TOMAQUE, shift, 'documental')

    for f in read('toponimia.geojson')['features']:
        p = f['properties']
        if ADMIN_TEXT.search(p['texto']):
            withheld['toponimia'] += 1
            continue
        add('toponimia', f, p, p['fuente'], shift if p['fuente'] == TOMAQUE else (0, 0), 'por revisar')

    for f in read('hojas-planos.geojson')['features']:
        p = f['properties']
        x0, y0, x1, y1 = p['ventana_utm']
        ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
        add('hojas-planos', f, p, p['fuente'], shift if p['fuente'] == TOMAQUE else (0, 0), 'por revisar',
            {'type': 'Polygon', 'coordinates': [ring]})

    for f in read('cotas.geojson')['features']:
        add('cotas', f, f['properties'], TOMAQUE, shift, 'documental')

    inputs = sorted(p for p in SRC.iterdir() if p.suffix in ('.geojson', '.gz', '.json') and p.name != 'run.log')
    audit = {
        'dataset': 'cad-second-pass-v1',
        'inputs': [{'file': p.name, 'sha256': sha(p)} for p in inputs],
        'counts': dict(Counter(f['properties']['kind'] for f in features)),
        'status': dict(Counter(f"{f['properties']['kind']}|{f['properties']['status']}" for f in features)),
        'crsStatus': dict(Counter(f"{f['properties']['kind']}|{f['properties']['crsStatus']}" for f in features)),
        'withheldForPrivacy': dict(withheld),
        'duplicatesDropped': dict(duplicates),
        'utmFromInverseTransform': utm_inverse,
        'utmNote': 'Puntos y hojas conservan su UTM derivado; el resto se reconstruye desde EPSG:4326 '
                   '(redondeo de 8 decimales, error ≈1 mm).',
        'tomaque': {k: alignment[k] for k in ('translation_m', 'vertices_within_5cm', 'rms_within_5cm_m',
                                              'psad56_expected_shift_m', 'verified_box_utm', 'interpretation')},
        'blocks': summary['rutas_bloques']['bloques'],
        'survey': {k: summary['puntos_topograficos'][k] for k in ('cota_estado', 'z_utilizable_min', 'z_utilizable_max')},
        'decisions': [
            'RUTA TOMAQUE: se adopta como CRS la traslación medida (+3,589 m E, +2,352 m N sobre EPSG:32717) '
            'el 16/10/2026. Sus elementos tienen crsStatus adoptado y la ruta institucional se muestra en Operativo.',
        ],
        'pendingDecisions': [
            'Incorporar los trazos de bloques no insertados a las rutas municipales: no aplicado; '
            'permanecen en esta capa de revisión.',
            'Qué rótulos de lote y manzana son útiles para la gestión municipal.',
        ],
        'privacy': 'No se publican nombres de propietarios ni de profesionales. Los rótulos de lote de clase '
                   '"otro" solo se publican si coinciden con patrones técnicos o de uso público; se omiten los '
                   'trámites de predios individuales.',
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps({'type': 'FeatureCollection', 'features': features, 'audit': audit},
                      ensure_ascii=False, separators=(',', ':'))
    # mtime=0 keeps the archive byte-identical for identical content.
    with open(OUT, 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as stream:
        stream.write(data.encode('utf8'))
    print(json.dumps({k: audit[k] for k in ('counts', 'withheldForPrivacy', 'duplicatesDropped')}, ensure_ascii=False))


if __name__ == '__main__':
    run()
