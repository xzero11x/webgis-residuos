"""Third pass, part 5: coincidence and complementarity matrix between DWG sources.

Unit of comparison: the entity (and, for linework, the segment), never the file.
Coordinates are compared in EPSG:32717 using each source's declared or adopted
placement. Spatial coincidence is NOT treated as duplication: two routes can share
a street and two polygons can be a block and a sector. Relations are evidence for
a later reconciliation; nothing is merged, removed or ranked.

Relation classes, from the point of view of one entity against another source:
- mismo_objeto_linaje: same handle, same geometry and attributes in a source of the
  same drawing lineage (route DWGs). Strongest identity evidence available.
- geometria_y_atributos_coinciden: same geometry (<= 5 cm per vertex), type, layer
  and text. Identity still pending: it may be a legitimate repeated element.
- misma_geometria_atributos_distintos: same geometry, different layer/type/colour/
  text. Complementary or contradictory; recorded with the differences.
- superposicion_parcial: shares at least one segment (approx., 0.2 m) but not the whole.
- texto_equivalente / texto_distinto_misma_posicion: same or different text within
  1 m (different text at the same anchor may be numbering, a correction or a conflict).
- exclusiva: nothing comparable in that source.
"""
from collections import Counter, defaultdict
import gzip
import json
import math
import re
from sources import ROOT

EXT = ROOT / 'data/cad/extracted'
OUT = EXT / 'tercera' / 'matriz'
SOURCES = {
    'RUTAS CON TIEMPO.dwg': (0.0, 0.0), 'RUTAS bagua.dwg': (0.0, 0.0), 'RUTA ORGANICO.dwg': (0.0, 0.0),
    'RUTA LIMPIO.dwg': (0.0, 0.0), 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg': (3.589, 2.352),
    'COFOPRI BAGUA.dwg': (-250.301, -376.509),
}
LINEAGE = {'RUTAS CON TIEMPO.dwg', 'RUTAS bagua.dwg', 'RUTA ORGANICO.dwg', 'RUTA LIMPIO.dwg'}
REGION = (760000, 9360000, 800000, 9395000)
TOL = 0.05
TILE = 250


def norm_text(t):
    return re.sub(r'\s+', ' ', (t or '').replace('\\P', ' ')).strip().upper()


def load():
    entities = []
    for src, (dx, dy) in SOURCES.items():
        with gzip.open(EXT / f'{src}.dxf.entities.jsonl.gz', 'rt', encoding='utf8') as s:
            for line in s:
                r = json.loads(line)
                g = r.get('geometry')
                if not g:
                    continue
                c = g['coordinates']
                pts = [c] if g['type'] == 'Point' else c[0] if g['type'] == 'Polygon' else c
                pts = [(p[0] + dx, p[1] + dy) for p in pts]
                if not all(REGION[0] < x < REGION[2] and REGION[1] < y < REGION[3] for x, y in pts):
                    continue
                if g['type'] == 'Polygon' and len(pts) > 1 and pts[0] == pts[-1]:
                    pts = pts[:-1]
                entities.append({'source': src, 'ref': r['ref'], 'handle': r.get('handle'), 'type': r['type'],
                                 'layer': r['layer'], 'color': r.get('color'), 'hidden': r.get('hidden'),
                                 'text': norm_text(r.get('text')) or None, 'gtype': g['type'], 'pts': pts})
    return entities


def canonical(e):
    """Orientation-free vertex list: polylines either direction, rings from their lowest vertex."""
    pts = e['pts']
    if e['gtype'] == 'LineString':
        return min(pts, pts[::-1])
    if e['gtype'] == 'Polygon':
        i = min(range(len(pts)), key=lambda k: pts[k])
        ring = pts[i:] + pts[:i]
        alt = [ring[0]] + ring[1:][::-1]
        return min(ring, alt)
    return pts


def same_shape(a, b):
    return len(a) == len(b) and all(abs(p[0] - q[0]) <= TOL and abs(p[1] - q[1]) <= TOL for p, q in zip(a, b))


def segments(pts, closed):
    out = set()
    seq = pts + [pts[0]] if closed else pts
    for p, q in zip(seq, seq[1:]):
        if math.dist(p, q) < 0.2:
            continue
        a = (round(p[0] / 0.2), round(p[1] / 0.2))
        b = (round(q[0] / 0.2), round(q[1] / 0.2))
        out.add((a, b) if a <= b else (b, a))
    return out


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    ents = load()
    print('entidades', len(ents), flush=True)
    shape_index = defaultdict(list)   # first canonical vertex cell -> entity ids
    seg_index = defaultdict(set)      # segment key -> {source}
    text_index = defaultdict(list)    # 1 m cell -> text entity ids
    for i, e in enumerate(ents):
        e['canon'] = canonical(e)
        x, y = e['canon'][0]
        shape_index[(round(x), round(y))].append(i)
        if e['gtype'] != 'Point':
            e['segs'] = segments(e['pts'], e['gtype'] == 'Polygon')
            for k in e['segs']:
                seg_index[k].add(e['source'])
        elif e['text']:
            text_index[(round(x), round(y))].append(i)
    names = list(SOURCES)
    pair = Counter()
    by_layer = defaultdict(Counter)
    tiles = defaultdict(Counter)
    contradictions = []
    with gzip.open(OUT / 'relaciones.jsonl.gz', 'wt', encoding='utf8') as rel:
        for i, e in enumerate(ents):
            x, y = e['canon'][0]
            rels = {}
            sample = {}
            # whole-geometry matches
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for j in shape_index.get((round(x) + dx, round(y) + dy), ()):
                        f = ents[j]
                        if f['source'] == e['source'] or f['gtype'] != e['gtype'] or not same_shape(e['canon'], f['canon']):
                            continue
                        diffs = [k for k in ('type', 'layer', 'color', 'text') if e[k] != f[k]]
                        if not diffs and e['source'] in LINEAGE and f['source'] in LINEAGE and e['handle'] == f['handle']:
                            cls = 'mismo_objeto_linaje'
                        elif not diffs:
                            cls = 'geometria_y_atributos_coinciden'
                        else:
                            cls = 'misma_geometria_atributos_distintos'
                        rank = ('mismo_objeto_linaje', 'geometria_y_atributos_coinciden', 'misma_geometria_atributos_distintos')
                        if f['source'] not in rels or rank.index(cls) < rank.index(rels[f['source']]):
                            rels[f['source']] = cls
                            sample[f['source']] = {'ref': f['ref'], 'layer': f['layer'], 'type': f['type'],
                                                   'diferencias': {k: [e[k], f[k]] for k in diffs}}
            # partial linework overlap
            if e['gtype'] != 'Point':
                shared = Counter()
                for k in e['segs']:
                    for s in seg_index[k]:
                        if s != e['source']:
                            shared[s] += 1
                for s, n in shared.items():
                    if s not in rels:
                        rels[s] = 'superposicion_parcial'
                        sample[s] = {'segmentos_compartidos': n, 'segmentos': len(e['segs'])}
            # texts at the same anchor
            if e['gtype'] == 'Point' and e['text']:
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        for j in text_index.get((round(x) + dx, round(y) + dy), ()):
                            f = ents[j]
                            if f['source'] == e['source'] or math.dist(e['pts'][0], f['pts'][0]) > 1.0:
                                continue
                            if f['text'] == e['text']:
                                if rels.get(f['source']) not in ('mismo_objeto_linaje', 'geometria_y_atributos_coinciden'):
                                    rels[f['source']] = 'texto_equivalente'
                            elif f['source'] not in rels:
                                rels[f['source']] = 'texto_distinto_misma_posicion'
                                sample[f['source']] = {'ref': f['ref'], 'layer': f['layer'], 'texto': f['text']}
                                if len(contradictions) < 20000 and math.dist(e['pts'][0], f['pts'][0]) <= 0.5 and e['source'] < f['source']:
                                    contradictions.append({'tipo': 'texto distinto en la misma posición', 'a': e['source'], 'a_ref': e['ref'],
                                                           'a_capa': e['layer'], 'a_texto': e['text'], 'b': f['source'], 'b_ref': f['ref'],
                                                           'b_capa': f['layer'], 'b_texto': f['text'],
                                                           'utm': [round(v, 2) for v in e['pts'][0]]})
            for s, cls in rels.items():
                if cls == 'misma_geometria_atributos_distintos' and 'layer' in sample[s]['diferencias'] and e['source'] < s and len(contradictions) < 20000:
                    contradictions.append({'tipo': 'misma geometría con capa distinta', 'a': e['source'], 'a_ref': e['ref'],
                                           'a_capa': e['layer'], 'b': s, 'b_ref': sample[s]['ref'], 'b_capa': sample[s]['layer'],
                                           'diferencias': sample[s]['diferencias'], 'utm': [round(v, 2) for v in e['pts'][0]]})
            for s in names:
                if s != e['source']:
                    pair[(e['source'], s, rels.get(s, 'exclusiva'))] += 1
            overall = 'exclusiva_en_todas' if not rels else (
                'con_relacion_de_identidad' if any(v in ('mismo_objeto_linaje', 'geometria_y_atributos_coinciden') for v in rels.values())
                else 'solo_relaciones_parciales_o_distintas')
            by_layer[(e['source'], e['layer'])][overall] += 1
            by_layer[(e['source'], e['layer'])]['total'] += 1
            tiles[(int(e['pts'][0][0] // TILE) * TILE, int(e['pts'][0][1] // TILE) * TILE, e['source'])][overall] += 1
            rel.write(json.dumps({'source': e['source'], 'ref': e['ref'], 'handle': e['handle'], 'type': e['type'],
                                  'layer': e['layer'], 'relaciones': rels, 'contrapartes': sample, 'resumen': overall,
                                  'interpretacion': 'pendiente'}, ensure_ascii=False) + '\n')
    matrix = defaultdict(dict)
    for (a, b, cls), n in pair.items():
        matrix[f'{a} -> {b}'][cls] = n
    (OUT / 'matriz-fuentes.json').write_text(json.dumps(matrix, ensure_ascii=False, indent=1), encoding='utf8')
    (OUT / 'por-capa.json').write_text(json.dumps([{'source': s, 'layer': l, **dict(c)} for (s, l), c in sorted(by_layer.items())],
                                                  ensure_ascii=False, indent=1), encoding='utf8')
    (OUT / 'regiones.json').write_text(json.dumps([{'E': x, 'N': y, 'source': s, **dict(c)} for (x, y, s), c in sorted(tiles.items())],
                                                  ensure_ascii=False), encoding='utf8')
    with gzip.open(OUT / 'contradicciones.jsonl.gz', 'wt', encoding='utf8') as s:
        for c in contradictions:
            s.write(json.dumps(c, ensure_ascii=False) + '\n')
    summary = {'entidades': len(ents), 'por_fuente': dict(Counter(e['source'] for e in ents)),
               'resumen_global': dict(Counter(json.loads(l)['resumen'] for l in gzip.open(OUT / 'relaciones.jsonl.gz', 'rt', encoding='utf8'))),
               'contradicciones': dict(Counter(c['tipo'] for c in contradictions)),
               'tolerancias': {'vertice_m': TOL, 'segmento_m': 0.2, 'texto_m': 1.0, 'tesela_m': TILE},
               'regla': 'La coincidencia espacial no implica duplicidad; ninguna entidad se fusiona ni elimina.'}
    (OUT / 'resumen.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    run()
