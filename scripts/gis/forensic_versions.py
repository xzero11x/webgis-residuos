"""Third pass, part 3: version and lineage comparison by CAD handle.

A BAK is the drawing as it was before its last save. The route DWGs (RUTAS CON
TIEMPO, RUTAS bagua, RUTA ORGANICO, RUTA LIMPIO and their BAKs) also share one
handle lineage: the same handle in two of them is the same database object, so
comparing fingerprints shows exactly what each version added, removed or edited.

Handles are only compared within a lineage: Tomaque and COFOPRI were drawn
independently and their handles say nothing about identity with the routes.

Each object is fingerprinted from the first-pass raw export (type, DXF
attributes, vertices, spline data and xdata). Output: tercera/versiones/.
"""
from collections import Counter
from itertools import combinations
import gzip
import hashlib
import json
from sources import ROOT

EXT = ROOT / 'data/cad/extracted'
OUT = EXT / 'tercera' / 'versiones'
ROUTE_LINEAGE = ['RUTAS CON TIEMPO.dwg', 'RUTAS CON TIEMPO.bak', 'RUTAS bagua.dwg', 'RUTA ORGANICO.dwg',
                 'RUTA ORGANICO.bak', 'RUTA LIMPIO.dwg', 'RUTA LIMPIO.bak']
BAK_PAIRS = [('RUTAS CON TIEMPO.dwg', 'RUTAS CON TIEMPO.bak'), ('RUTA ORGANICO.dwg', 'RUTA ORGANICO.bak'),
             ('RUTA LIMPIO.dwg', 'RUTA LIMPIO.bak'),
             ('RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS (1).bak')]
# Bookkeeping that changes on every save without changing drawing content.
VOLATILE = {'owner', 'handle'}
SKIP_TYPES = {'SORTENTSTABLE', 'DICTIONARYVAR', 'LAYOUT', 'VPORT', 'VIEWPORT'}
GRAPHIC = {'LINE', 'LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE', 'HATCH', 'TEXT', 'MTEXT',
           'INSERT', 'ATTRIB', 'ATTDEF', 'POINT', 'SOLID', 'DIMENSION', 'LEADER', 'MULTILEADER', 'REGION'}


def load(source):
    objects = {}
    with gzip.open(EXT / f'{source}.dxf.raw.jsonl.gz', 'rt', encoding='utf8') as s:
        for line in s:
            r = json.loads(line)
            a = r['attributes']
            h = a.get('handle')
            if not h:
                continue
            core = {k: v for k, v in a.items() if k not in VOLATILE}
            geom = {k: r[k] for k in ('vertices_xyseb', 'vertices', 'control_points', 'fit_points', 'knots', 'weights') if k in r}
            objects[h] = {'type': r['type'], 'layer': a.get('layer'), 'attrs': core, 'geom': geom,
                          'xdata': r.get('xdata'),
                          'fp_attrs': hashlib.sha1(json.dumps(core, sort_keys=True, default=str).encode()).hexdigest(),
                          'fp_geom': hashlib.sha1(json.dumps(geom, sort_keys=True, default=str).encode()).hexdigest(),
                          'fp_xdata': hashlib.sha1(json.dumps(r.get('xdata'), sort_keys=True, default=str).encode()).hexdigest()}
    return objects


def compare(a_name, b_name, a, b, detail):
    """b is the older/alternative version; records what a has relative to b."""
    shared = set(a) & set(b)
    stats = Counter()
    by_type = Counter()
    changes = []
    for h in sorted(shared):
        x, y = a[h], b[h]
        if x['type'] != y['type']:
            kind = 'tipo distinto (handle reutilizado)'
        elif (x['fp_attrs'], x['fp_geom'], x['fp_xdata']) == (y['fp_attrs'], y['fp_geom'], y['fp_xdata']):
            stats['identico'] += 1
            continue
        else:
            parts = [n for n, k in (('geometria', 'fp_geom'), ('atributos', 'fp_attrs'), ('xdata', 'fp_xdata')) if x[k] != y[k]]
            kind = 'modificado: ' + '+'.join(parts)
        stats[kind] += 1
        if x['type'] in SKIP_TYPES:
            continue
        by_type[(x['type'], kind)] += 1
        if detail:
            keys = sorted(k for k in set(x['attrs']) | set(y['attrs']) if x['attrs'].get(k) != y['attrs'].get(k))
            changes.append({'handle': h, 'type': x['type'], 'layer': x['layer'], 'layer_before': y['layer'], 'change': kind,
                            'changed_attributes': keys,
                            'before': {k: y['attrs'].get(k) for k in keys}, 'after': {k: x['attrs'].get(k) for k in keys},
                            'geometry_changed': x['fp_geom'] != y['fp_geom']})
    only_a = sorted(set(a) - set(b))
    only_b = sorted(set(b) - set(a))
    for side, handles, objs in (('solo_en_' + a_name, only_a, a), ('solo_en_' + b_name, only_b, b)):
        for h in handles:
            o = objs[h]
            by_type[(o['type'], side)] += 1
            if detail and o['type'] in GRAPHIC:
                changes.append({'handle': h, 'type': o['type'], 'layer': o['layer'], 'change': side,
                                'text': o['attrs'].get('text'), 'name': o['attrs'].get('name')})
    graphic = lambda hs, objs: Counter(objs[h]['layer'] for h in hs if objs[h]['type'] in GRAPHIC)
    return {'a': a_name, 'b': b_name, 'objects_a': len(a), 'objects_b': len(b), 'shared_handles': len(shared),
            'identical': stats['identico'], 'changes': {k: v for k, v in stats.items() if k != 'identico'},
            'only_a': len(only_a), 'only_b': len(only_b),
            'only_a_graphic_by_layer': dict(graphic(only_a, a).most_common(40)),
            'only_b_graphic_by_layer': dict(graphic(only_b, b).most_common(40)),
            'by_type': [{'type': t, 'kind': k, 'count': n} for (t, k), n in by_type.most_common(80)]}, changes


def cross_lineage(a_name, b_name):
    """Tomaque and COFOPRI share a seed drawing (same native creation instant). Objects
    with the same handle AND identical raw coordinates were copied without moving, so
    they carry the other file's frame (COFOPRI is PSAD 56; Tomaque was adopted with a
    +3.589/+2.352 m translation): a placement anomaly of about 454 m."""
    a, b = load(a_name), load(b_name)
    owners = {}
    with gzip.open(EXT / f'{a_name}.dxf.raw.jsonl.gz', 'rt', encoding='utf8') as s:
        for line in s:
            r = json.loads(line)
            owners[r['attributes'].get('handle')] = (r['attributes'].get('owner'), r['type'], r['attributes'].get('name'))
    shared = [h for h in set(a) & set(b) if a[h]['type'] == b[h]['type']]
    same = [h for h in shared if a[h]['fp_geom'] == b[h]['fp_geom'] and a[h]['type'] in GRAPHIC]
    anomalies = []
    for h in same:
        at = a[h]['attrs']
        p = at.get('start') or at.get('insert') or at.get('center') or (a[h]['geom'].get('vertices_xyseb') or [None])[0]
        owner = owners.get(h, (None,))[0]
        if p and p[0] > 700000 and owners.get(owner, (None, None, None))[2] == '*Model_Space':
            anomalies.append({'handle': h, 'type': a[h]['type'], 'layer': a[h]['layer'], 'utm_bruto': p[:2],
                              'texto_publico': at.get('text') if a[h]['layer'] != 'TEXTOS' else None})
    (OUT / 'tomaque-cofopri-coordenadas-identicas.json').write_text(json.dumps(anomalies, ensure_ascii=False, indent=1), encoding='utf8')
    return {'handles_compartidos': len(shared), 'graficos_identicos': len(same),
            'espacio_modelo_con_coordenadas_identicas': len(anomalies),
            'nota': 'Mismo handle y coordenadas brutas idénticas: copiados sin trasladar; marco de COFOPRI (PSAD 56) dentro de Tomaque.'}


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    cache = {}
    def get(name):
        if name not in cache:
            print('Cargando', name, flush=True)
            cache[name] = load(name)
        return cache[name]
    summary = {'bak_pairs': [], 'lineage': []}
    for dwg, bak in BAK_PAIRS:
        res, changes = compare(dwg, bak, get(dwg), get(bak), detail=True)
        stem = dwg.removesuffix('.dwg').replace(' ', '_')
        with gzip.open(OUT / f'{stem}.dwg-vs-bak.jsonl.gz', 'wt', encoding='utf8') as s:
            for c in changes:
                s.write(json.dumps(c, ensure_ascii=False, default=str) + '\n')
        res['detail_file'] = f'data/cad/extracted/tercera/versiones/{stem}.dwg-vs-bak.jsonl.gz'
        summary['bak_pairs'].append(res)
        print(json.dumps({k: res[k] for k in ('a', 'b', 'shared_handles', 'identical', 'changes', 'only_a', 'only_b')}, ensure_ascii=False), flush=True)
        if dwg not in ROUTE_LINEAGE:
            cache.pop(dwg, None)
            cache.pop(bak, None)
    for a, b in combinations(ROUTE_LINEAGE, 2):
        res, _ = compare(a, b, get(a), get(b), detail=False)
        res.pop('by_type')
        summary['lineage'].append(res)
        print(json.dumps({k: res[k] for k in ('a', 'b', 'shared_handles', 'identical', 'only_a', 'only_b')}, ensure_ascii=False), flush=True)
    summary['tomaque_cofopri'] = cross_lineage('RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', 'COFOPRI BAGUA.dwg')
    (OUT / 'resumen.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf8')
