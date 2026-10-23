"""Third pass, part 4: recover drawing objects the ODA export dropped.

The native census (forensic_native.py) lists handles present in the DWG but not
in its DXF. This step decodes those objects straight from the DWG bitstream with
dwg_native.decode_entity, after first re-validating the decoder on a sample of
objects that exist in both (geometry, layer, owner and text must match the DXF).

Coordinates are kept as drawn. A 4326 position is derived only for sources whose
CRS is declared or adopted (same offsets as reconcile_cad.py) and only for
entities owned by model space; block-definition content stays in block units.
Texts go to the private file unless they match public patterns (streets,
sectors, routes, numbers).
"""
from collections import Counter
import json
import random
import re
import sys
import ezdxf
from pyproj import Transformer
import dwg_native as dn
from forensic_native import sources
from sources import ROOT

OUT = ROOT / 'data/cad/extracted/tercera/perdidos'
PRIVATE = ROOT / 'data/cad/extracted/tercera/privado'
TO_WGS = Transformer.from_crs(32717, 4326, always_xy=True)
OFFSETS = {'RUTA TOMAQUE - BRUJO PATA - CASUARINAS': (3.589, 2.352), 'COFOPRI BAGUA': (-250.301, -376.509)}
CHECK_TYPES = ('LINE', 'POINT', 'TEXT', 'MTEXT', 'ARC', 'CIRCLE', 'SOLID')
PUBLIC_TEXT = re.compile(
    r'^(RUTA\b|JR\.?\s|AV\.?\s|CALLE\b|SECTOR\b|SECT\.\s|PASAJE\b|PSJE\.\s|MZ|LT|LOTE\b|[A-Z]?\d+[A-Z]?$|\d+(\.\d+)?$|[DPZ]:'
    r'|[A-Z]{1,6}-\d+$'      # sheet codes (PSREC-01, R-1001)
    r'|[A-ZÑ]{2,12}$'        # one technical word (survey descriptions); names have several words
    r'|\\A\d;[\d.,]+)')      # dimension value with an MTEXT alignment code


def offset_for(label):
    stem = label.rsplit('.', 1)[0].replace(' (1)', '')
    return OFFSETS.get(stem, (0.0, 0.0))


def owner_of(d, model, paper):
    """entmode 2 = model space, 1 = (active) paper space, 0 = explicit owner handle."""
    if d.get('entmode') == 2:
        return model
    if d.get('entmode') == 1:
        return paper
    return format(d['owner'], 'X') if isinstance(d.get('owner'), int) else d.get('owner')


def validate(objects, records, doc, n=600):
    model = doc.modelspace().block_record_handle
    paper = doc.layout().block_record_handle if len(doc.layouts) > 1 else None
    """Decode a random sample of objects present in both and compare with the DXF."""
    pool = [r for r in records if r.get('type') in CHECK_TYPES and format(r['handle'], 'X') in doc.entitydb]
    random.seed(7)
    sample = random.sample(pool, min(n, len(pool)))
    ok = Counter()
    close = lambda a, b: all(abs(x - y) < 1e-6 for x, y in zip(a, b))
    for r in sample:
        e = doc.entitydb[format(r['handle'], 'X')]
        try:
            d = dn.decode_entity(objects, r['location'])
            t = r['type']
            geo = (t == 'LINE' and close(d['geometry']['coordinates'][0], e.dxf.start)) or \
                  (t == 'POINT' and close(d['geometry']['coordinates'], e.dxf.location)) or \
                  (t in ('ARC', 'CIRCLE') and close(d['center'], e.dxf.center)) or \
                  (t in ('TEXT', 'MTEXT') and close(d['geometry']['coordinates'][:2], list(e.dxf.insert)[:2])) or \
                  (t == 'SOLID' and close(d['geometry']['coordinates'][0][0][:2], list(e.dxf.vtx0)[:2]))
            layer = doc.entitydb.get(format(d.get('layer_handle', 0), 'X'))
            good = geo and layer is not None and layer.dxf.name == e.dxf.layer and owner_of(d, model, paper) == e.dxf.owner
        except Exception:
            good = False
        ok['coinciden' if good else 'difieren'] += 1
    return {'muestra': len(sample), **ok, 'tasa': round(ok['coinciden'] / max(1, len(sample)), 4)}


def recover(label, path, dxf_path):
    dwg = dn.DwgFile(path)
    doc = ezdxf.readfile(dxf_path)
    census = dn.census(dwg, {500 + i: c.dxf.name for i, c in enumerate(doc.classes)})
    objects = census['objects_section']
    check = validate(objects, census['records'], doc)
    lost = [r for r in census['records'] if format(r['handle'], 'X') not in doc.entitydb]
    layers = {e.dxf.handle: e.dxf.name for e in doc.layers}
    model = doc.modelspace().block_record_handle
    paper = doc.layout().block_record_handle if len(doc.layouts) > 1 else None
    spaces = {}
    for layout in doc.layouts:
        spaces[layout.block_record_handle] = 'model' if layout.name == 'Model' else f'layout:{layout.name}'
    for b in doc.blocks:
        spaces.setdefault(b.block_record.dxf.handle, f'block:{b.name}')
    decoded, undecoded = [], Counter()
    for r in lost:
        if r.get('type') not in CHECK_TYPES + ('BLOCK', 'ENDBLK'):
            undecoded[r.get('type')] += 1
            continue
        try:
            d = dn.decode_entity(objects, r['location'])
        except Exception as ex:
            undecoded[f"{r.get('type')} (error)"] += 1
            continue
        d['handle'] = format(d['handle'], 'X')
        d['owner'] = owner_of(d, model, paper)
        d['layer'] = layers.get(format(d.get('layer_handle', 0), 'X'))
        decoded.append(d)
    # Lost BLOCK begin-markers name their block record (the owner of the block's entities).
    lost_blocks = {d['owner']: d.get('text') for d in decoded if d['type'] == 'BLOCK'}
    dx, dy = offset_for(label)
    public, private = [], []
    for d in decoded:
        if d['type'] in ('BLOCK', 'ENDBLK'):
            continue
        owner = d['owner']
        space = spaces.get(owner) or (f'bloque perdido:{lost_blocks[owner]}' if owner in lost_blocks else f'propietario {owner}')
        g = d.get('geometry')
        if d['type'] in ('ARC', 'CIRCLE'):
            g = {'type': 'Point', 'coordinates': d['center']}
        wgs = None
        if g and space == 'model':
            pts = [g['coordinates']] if g['type'] == 'Point' else g['coordinates'][0] if g['type'] == 'Polygon' else g['coordinates']
            if all(760000 < p[0] + dx < 800000 and 9360000 < p[1] + dy < 9395000 for p in pts):
                wgs = [list(TO_WGS.transform(p[0] + dx, p[1] + dy)) for p in pts]
        text = d.get('text')
        rec = {'source': label, 'handle': d['handle'], 'type': d['type'], 'layer': d['layer'], 'space': space,
               'owner': owner, 'geometry_drawing': g, 'radius': d.get('radius'),
               'start_angle': d.get('start_angle'), 'end_angle': d.get('end_angle'), 'wgs84': wgs,
               'text': text if text and PUBLIC_TEXT.search(text.strip()) else None,
               'text_withheld': bool(text) and not PUBLIC_TEXT.search(text.strip()),
               'origen': 'decodificado del DWG nativo; ausente en la exportación DXF de ODA'}
        public.append(rec)
        if text:
            private.append({'handle': d['handle'], 'text': text})
    summary = {'source': label, 'validacion_decodificador': check, 'objetos_solo_dwg': len(lost),
               'decodificados': len(public), 'bloques_perdidos': sorted(v for v in lost_blocks.values() if v),
               'no_decodificables': dict(undecoded),
               'por_tipo': dict(Counter(p['type'] for p in public)),
               'por_espacio': dict(Counter(p['space'].split(':')[0] for p in public)),
               'por_capa': dict(Counter(p['layer'] for p in public).most_common(30)),
               'con_posicion_wgs84': sum(1 for p in public if p['wgs84'])}
    return summary, public, private


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    report = []
    for label, path, dxf, _, _ in sources():
        if only and label not in only:
            continue
        print('Perdidos', label, flush=True)
        summary, public, private = recover(label, path, dxf)
        stem = re.sub(r'[^\w.-]+', '_', label)
        (OUT / f'{stem}.json').write_text(json.dumps({'resumen': summary, 'entidades': public}, ensure_ascii=False, indent=1), encoding='utf8')
        (PRIVATE / f'{stem}.perdidos-textos.json').write_text(json.dumps(private, ensure_ascii=False, indent=1), encoding='utf8')
        report.append(summary)
        print(json.dumps({k: summary[k] for k in ('validacion_decodificador', 'objetos_solo_dwg', 'decodificados', 'por_tipo', 'por_espacio', 'con_posicion_wgs84')}, ensure_ascii=False), flush=True)
    if not only:
        (OUT / 'resumen.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf8')
