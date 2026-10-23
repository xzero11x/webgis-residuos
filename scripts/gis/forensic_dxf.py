"""Third pass, part 2: DXF structures no earlier script exported.

Per source (6 DWG + 4 BAK), from the existing ODA exports (read-only):

- tables: named VIEWs, UCS, VPORT, text styles and their font files, linetypes,
  dimension styles and registered applications (APPID: which add-ons wrote data);
- layer states, layer filters, viewport layer overrides;
- dynamic blocks: anonymous representations traced to their source block, and
  the parameters/visibility states stored in ACAD_ENHANCEDBLOCK;
- REGION entities decoded from their ACIS SAB data into vertex loops;
- HATCH detail: pattern, solid/gradient, associativity, every loop with its
  flags (external, outermost, derived) and signed area;
- MTEXT with field codes or formatting kept verbatim;
- operational annotations (times, days, frequencies, shifts) from model space,
  layouts and block definitions, extracted as text without interpretation;
- hidden content: entities on off/frozen layers, invisible flags, invisible attributes.

Outputs: data/cad/extracted/tercera/dxf/<source>.json plus .jsonl.gz detail files.
"""
from pathlib import Path
from collections import Counter, defaultdict
import gzip
import hashlib
import json
import math
import re
import sys
import ezdxf
from ezdxf.path import from_hatch
from sources import ROOT

EXT = ROOT / 'data/cad/extracted'
OUT = EXT / 'tercera' / 'dxf'
CONVERTED = ROOT / 'data/cad/converted'
VERSION = 2
OPERATIVE = re.compile(
    r'\b\d{1,2}:\d{2}\b|\b\d{1,2}\.\d{2}\s*(a\.?\s?m\b|p\.?\s?m\b|hrs?\b)|\b(LUNES|MARTES|MI[EÉ]RCOLES|JUEVES|VIERNES|S[AÁ]BADO|DOMINGO|'
    r'INTERDIARIO|DIARIO|SEMANAL|FRECUENCIA|TURNO|MA[NÑ]ANA|TARDE|NOCHE|HORARIO|HORA|INICIO|FIN DE RUTA|PARADA|RECOLECCI[OÓ]N|'
    r'CAMI[OÓ]N|COMPACTADORA|VOLQUETE|TRIMOTO|RESIDUOS?|RECICLAJE|ORG[AÁ]NICOS?)\b', re.I)


def attr(entity, key, default=None):
    """dxf.get that tolerates attributes the entity type does not define."""
    try:
        return entity.dxf.get(key, default)
    except Exception:
        return default


def dumps(v):
    return json.dumps(v, ensure_ascii=False, default=lambda o: list(o) if hasattr(o, '__iter__') else str(o),
                      separators=(',', ':'))


def tags_of(obj):
    try:
        return [[t.code, t.value if not isinstance(t.value, bytes) else t.value.hex()] for t in obj.tags]
    except AttributeError:
        pass
    try:
        return [[t.code, t.value] for t in obj.xtags.subclasses[-1]] if obj.xtags else []
    except Exception:
        return []


def raw_tags(entity):
    """All group codes of an object, including ones ezdxf keeps as unprocessed tags."""
    out = []
    try:
        for sub in entity.xtags.subclasses:
            for t in sub:
                v = t.value
                out.append([t.code, v.hex() if isinstance(v, bytes) else v])
    except Exception:
        pass
    return out


def strings_in(tags):
    return [v for c, v in tags if isinstance(v, str) and c in (1, 2, 3, 300, 301, 302, 303, 304, 305, 1000, 1001) and v.strip()]


def tables(doc):
    def rows(table, fields):
        out = []
        for e in table:
            out.append({f: e.dxf.get(f) for f in fields if e.dxf.hasattr(f)} | {'name': e.dxf.name})
        return out
    return {
        'views': rows(doc.views, ('center', 'height', 'width', 'direction', 'target', 'view_twist', 'ucs')),
        'ucs': rows(doc.ucs, ('origin', 'xaxis', 'yaxis')),
        'vports': rows(doc.viewports, ('center', 'height', 'aspect_ratio', 'target', 'direction')),
        'styles': rows(doc.styles, ('font', 'bigfont', 'height', 'width')),
        'linetypes': [lt.dxf.name for lt in doc.linetypes],
        'dimstyles': [d.dxf.name for d in doc.dimstyles],
        'appids': [a.dxf.name for a in doc.appids],
    }


def named_dict(doc, *path):
    node = doc.rootdict
    for key in path:
        if node is None or key not in node:
            return None
        node = node[key]
    return node


def layer_states(doc):
    states = []
    ls = None
    try:
        xdict = doc.layers.head.get_extension_dict() if doc.layers.head.has_extension_dict else None
        ls = xdict['ACAD_LAYERSTATES'] if xdict and 'ACAD_LAYERSTATES' in xdict else None
    except Exception:
        ls = None
    if ls is None:
        return states
    for name, xrec in ls.items():
        tags = tags_of(xrec)
        layers = [v for c, v in tags if c == 8]
        flags = [v for c, v in tags if c == 90]
        states.append({'name': name, 'description': next((v for c, v in tags if c == 301), None),
                       'layers': len(layers), 'layer_names': layers[:400], 'flags': flags[:400]})
    return states


def layer_filters(doc):
    out = []
    try:
        if not doc.layers.head.has_extension_dict:
            return out
        xdict = doc.layers.head.get_extension_dict()
        for key in ('ACAD_LAYERFILTERS', 'AcLyDictionary'):
            if key in xdict:
                for name, obj in xdict[key].items():
                    out.append({'container': key, 'name': name, 'type': obj.dxftype(), 'strings': strings_in(tags_of(obj))[:40]})
    except Exception as ex:
        out.append({'error': str(ex)[:200]})
    return out


def dynamic_blocks(doc):
    """Anonymous *U blocks -> their dynamic source via AcDbBlockRepBTag; parameters per source."""
    by_handle = {b.block_record.dxf.handle: b.name for b in doc.blocks}
    reps = defaultdict(list)
    for b in doc.blocks:
        br = b.block_record
        if br.xdata and 'AcDbBlockRepBTag' in br.xdata.data:
            ref = next((v for c, v in br.xdata.get('AcDbBlockRepBTag') if c == 1005), None)
            reps[by_handle.get(ref, ref)].append(b.name)
    params = {}
    for b in doc.blocks:
        br = b.block_record
        if not br.has_extension_dict:
            continue
        xdict = br.get_extension_dict()
        if 'ACAD_ENHANCEDBLOCK' not in xdict:
            continue
        graph = xdict['ACAD_ENHANCEDBLOCK']
        items = []
        for h in [v for c, v in raw_tags(graph) if c in (360, 330, 340, 350)]:
            obj = doc.entitydb.get(h)
            if obj is None or obj.dxftype() in ('BLOCK_RECORD', 'DICTIONARY'):
                continue
            items.append({'type': obj.dxftype(), 'strings': strings_in(raw_tags(obj))[:30]})
        params[b.name] = {'graph_type': graph.dxftype(), 'objects': items[:200]}
    return {'anonymous_representations': {k: v for k, v in reps.items()}, 'enhanced_blocks': params}


def regions(doc):
    """REGION/3DSOLID/BODY/SURFACE: decode SAB with ezdxf.acis into vertex loops."""
    from ezdxf.acis import api as acis
    out = []
    for e in doc.entitydb.values():
        if not e.is_alive or e.dxftype() not in ('REGION', '3DSOLID', 'BODY', 'SURFACE'):
            continue
        rec = {'handle': e.dxf.handle, 'type': e.dxftype(), 'layer': e.dxf.get('layer'),
               'owner': attr(e, 'owner'), 'sab_bytes': len(e.sab or b''), 'sat_lines': len(e.sat or [])}
        try:
            bodies = acis.load_dxf(e)
            loops = []
            for body in bodies:
                for lump in body.lumps():
                    for shell in lump.shells():
                        for face in shell.faces():
                            for loop in face.loops():
                                pts = []
                                for coedge in loop.coedges():
                                    v = coedge.edge.start_vertex.point.location
                                    pts.append([round(v.x, 4), round(v.y, 4), round(v.z, 4)])
                                    curve = type(coedge.edge.curve).__name__
                                    rec.setdefault('curve_types', Counter())[curve] += 1
                                loops.append(pts)
            rec['loops'] = loops
        except Exception as ex:
            rec['decode_error'] = str(ex)[:200]
        if 'curve_types' in rec:
            rec['curve_types'] = dict(rec['curve_types'])
        out.append(rec)
    return out


def ring_area(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def hatches(doc):
    out = []
    for e in doc.entitydb.values():
        if not e.is_alive or e.dxftype() != 'HATCH':
            continue
        d = e.dxf
        loops = []
        try:
            for path, raw in zip(from_hatch(e), e.paths):
                pts = [[v.x, v.y] for v in path.flattening(0.2)]
                loops.append({'flags': raw.path_type_flags,
                              'external': bool(raw.path_type_flags & 1), 'outermost': bool(raw.path_type_flags & 16),
                              'derived': bool(raw.path_type_flags & 4), 'textbox': bool(raw.path_type_flags & 8),
                              'polyline': bool(raw.path_type_flags & 2), 'vertices': len(pts),
                              'signed_area': round(ring_area(pts), 3) if len(pts) > 2 else 0.0,
                              'source_boundary_handles': list(getattr(raw, 'source_boundary_objects', []) or [])})
        except Exception as ex:
            loops.append({'error': str(ex)[:160]})
        grad = e.gradient if e.has_gradient_data else None
        out.append({'handle': d.handle, 'layer': d.get('layer'), 'owner': d.get('owner'),
                    'pattern': d.get('pattern_name'), 'solid': bool(d.get('solid_fill')),
                    'associative': bool(d.get('associative')), 'style': d.get('hatch_style'),
                    'pattern_scale': d.get('pattern_scale'), 'pattern_angle': d.get('pattern_angle'),
                    'gradient': {'name': grad.name, 'color1': grad.color1, 'color2': grad.color2} if grad else None,
                    'true_color': d.get('true_color'), 'transparency': d.get('transparency'),
                    'seed_points': [list(p) for p in (e.seeds or [])], 'loops': loops,
                    'net_area': round(sum(abs(l.get('signed_area', 0)) * (1 if l.get('external') or l.get('outermost') else -1)
                                          for l in loops if 'signed_area' in l), 3)})
    return out


def owner_space(doc):
    """Map owner handle -> 'model' | 'layout:<name>' | 'block:<name>'."""
    spaces = {}
    for layout in doc.layouts:
        spaces[layout.block_record_handle] = 'model' if layout.name == 'Model' else f'layout:{layout.name}'
    for b in doc.blocks:
        spaces.setdefault(b.block_record.dxf.handle, f'block:{b.name}')
    return spaces


def texts(doc, spaces, layers):
    """Field codes, operational annotations and hidden text, with their space."""
    fields, operative, hidden = [], [], Counter()
    for e in doc.entitydb.values():
        if not e.is_alive or e.dxftype() not in ('TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF', 'MULTILEADER'):
            continue
        typ = e.dxftype()
        try:
            if typ == 'MTEXT':
                raw, plain = e.text, e.plain_text()
            elif typ == 'MULTILEADER':
                raw = e.context.mtext.default_content if e.context.mtext else ''
                plain = re.sub(r'\{\\[^;]*;|\}', '', raw or '')
            else:
                raw = plain = attr(e, 'text', '')
        except Exception:
            continue
        space = spaces.get(attr(e, 'owner'), 'otro')
        layer = attr(e, 'layer', '0')
        lay = layers.get(layer)
        insert = attr(e, 'insert') if typ != 'MULTILEADER' else None
        rec = {'handle': e.dxf.handle, 'type': typ, 'space': space, 'layer': layer,
               'text': ' '.join((plain or '').split()), 'insert': [round(c, 3) for c in insert] if insert else None}
        if raw and ('%<' in raw or '\\AcVar' in raw or '\\AcObjProp' in raw):
            fields.append(rec | {'raw': raw})
        if OPERATIVE.search(rec['text']):
            operative.append(rec)
        if (lay is not None and (lay.is_off() or lay.is_frozen())) or attr(e, 'invisible') or (typ in ('ATTRIB', 'ATTDEF') and attr(e, 'flags', 0) & 1):
            hidden[(space.split(':')[0], typ)] += 1
    return fields, operative, hidden


def hidden_geometry(doc, spaces, layers):
    out = Counter()
    for e in doc.entitydb.values():
        if not e.is_alive or attr(e, 'layer') is None or e.dxftype() in ('TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'):
            continue
        owner = attr(e, 'owner')
        if owner not in spaces:
            continue
        lay = layers.get(attr(e, 'layer', '0'))
        state = 'apagada' if lay is not None and lay.is_off() else 'congelada' if lay is not None and lay.is_frozen() else None
        if attr(e, 'invisible'):
            state = 'invisible'
        if state:
            out[(spaces[owner].split(':')[0], state, attr(e, 'layer', '0'))] += 1
    return [{'space': s, 'state': st, 'layer': l, 'count': n} for (s, st, l), n in out.most_common()]


def audit(dxf):
    name = dxf.name.removesuffix('.dxf')
    stem = re.sub(r'[^\w.-]+', '_', name)
    target = OUT / f'{stem}.json'
    digest = hashlib.sha256(dxf.read_bytes()).hexdigest()
    if target.exists():
        cached = json.loads(target.read_text(encoding='utf8'))
        if cached.get('dxf_sha256') == digest and cached.get('version') == VERSION:
            return cached
    doc = ezdxf.readfile(dxf)
    layers = {l.dxf.name: l for l in doc.layers}
    spaces = owner_space(doc)
    rec = {'source': name, 'version': VERSION, 'dxf_sha256': digest, 'tables': tables(doc),
           'layer_states': layer_states(doc), 'layer_filters': layer_filters(doc),
           'layer_flags': {'off': sum(l.is_off() for l in layers.values()), 'frozen': sum(l.is_frozen() for l in layers.values()),
                           'locked': sum(l.is_locked() for l in layers.values()), 'no_plot': sum(not l.dxf.get('plot', 1) for l in layers.values()),
                           'names_off_or_frozen': sorted(n for n, l in layers.items() if l.is_off() or l.is_frozen())},
           'dynamic_blocks': dynamic_blocks(doc)}
    reg = regions(doc)
    rec['regions'] = {'count': len(reg), 'decoded': sum('loops' in r for r in reg),
                      'curve_types': dict(sum((Counter(r.get('curve_types', {})) for r in reg), Counter()))}
    hat = hatches(doc)
    rec['hatches'] = {'count': len(hat), 'solid': sum(h['solid'] for h in hat), 'gradient': sum(bool(h['gradient']) for h in hat),
                      'associative': sum(h['associative'] for h in hat),
                      'with_holes': sum(1 for h in hat if sum(1 for l in h['loops'] if not (l.get('external') or l.get('outermost'))) and len(h['loops']) > 1),
                      'patterns': dict(Counter(h['pattern'] for h in hat).most_common(30)),
                      'spaces': dict(Counter(spaces.get(h['owner'], 'otro').split(':')[0] for h in hat))}
    fields, operative, hidden_text = texts(doc, spaces, layers)
    rec['fields'] = len(fields)
    rec['operative_annotations'] = {'count': len(operative),
                                    'by_space': dict(Counter(o['space'].split(':')[0] for o in operative)),
                                    'by_layer': dict(Counter(o['layer'] for o in operative).most_common(30))}
    rec['hidden'] = {'texts': [{'space': s, 'type': t, 'count': n} for (s, t), n in hidden_text.most_common()],
                     'geometry': hidden_geometry(doc, spaces, layers)[:200]}
    for suffix, rows in (('regions', reg), ('hatches', hat), ('fields', fields), ('operativas', operative)):
        with gzip.open(OUT / f'{stem}.{suffix}.jsonl.gz', 'wt', encoding='utf8') as s:
            for r in rows:
                s.write(dumps(r) + '\n')
    target.write_text(dumps(rec), encoding='utf8')
    return rec


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for dxf in sorted(CONVERTED.glob('*.dxf')):
        if dxf.name.startswith('trial-') or (only and dxf.name.removesuffix('.dxf') not in only):
            continue
        print('DXF', dxf.name, flush=True)
        r = audit(dxf)
        print(json.dumps({'source': r['source'], 'views': len(r['tables']['views']), 'ucs': len(r['tables']['ucs']),
                          'appids': len(r['tables']['appids']), 'layer_states': len(r['layer_states']),
                          'layer_filters': len(r['layer_filters']), 'dyn_sources': len(r['dynamic_blocks']['anonymous_representations']),
                          'enhanced': len(r['dynamic_blocks']['enhanced_blocks']), 'regions': r['regions'],
                          'hatches': r['hatches']['count'], 'fields': r['fields'],
                          'operativas': r['operative_annotations']['count']}, ensure_ascii=False), flush=True)
