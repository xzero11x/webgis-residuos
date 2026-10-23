"""Second-pass DWG audit: everything extract_cad.py does not cover.

extract_cad.py walks only the expanded model space and keeps 2D geometry. This pass
reads the same DXF exports and adds, per source:

- full header, registered classes (authoring products), named-object dictionary
  tree and every XRECORD's tags;
- layer metadata (state, description, linetype, transparency);
- paper-space layouts: entities, title-block texts, viewports and the model window
  each viewport shows;
- block definitions that are never inserted (content invisible in the drawing);
- OLE2FRAME payloads, IMAGEDEF/underlay/xref paths;
- annotation semantics: DIMENSION measurements, MULTILEADER/LEADER text,
  proxy-entity graphics, extension dictionaries and hyperlinks;
- Z values (elevations) per layer and type, and outliers beyond the drawing area.

It never modifies the existing extraction, staging or originals. Interpretation
(text classification) lives in text_catalog.py.
"""
from pathlib import Path
from collections import Counter, defaultdict
import gzip
import hashlib
import json
import math
import struct
import sys
import ezdxf
from ezdxf.path import make_path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'data/cad/converted'
OUT = ROOT / 'data/cad/extracted/deep'
OLE_DIR = OUT / 'ole'
VERSION = 2
CURVE_TOLERANCE = 0.2
GEOMETRY_TYPES = ('LINE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'SOLID', 'TRACE', '3DFACE')
TEXT_TYPES = ('TEXT', 'ATTRIB', 'ATTDEF', 'MTEXT')


def serial(value):
    if isinstance(value, bytes):
        return {'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()}
    try:
        return list(value)
    except TypeError:
        return str(value)


def dumps(value):
    return json.dumps(value, ensure_ascii=False, default=serial, separators=(',', ':'))


def julian_to_iso(value):
    try:
        days = float(value)
    except (TypeError, ValueError):
        return None
    if days < 2_000_000 or days > 3_000_000:
        return None
    import datetime
    return (datetime.datetime(1970, 1, 1) + datetime.timedelta(days=days - 2440587.5)).isoformat(timespec='seconds')


def entity_text(entity):
    typ = entity.dxftype()
    if typ == 'MTEXT':
        return entity.plain_text()
    if typ in ('TEXT', 'ATTRIB', 'ATTDEF'):
        return entity.dxf.get('text', '')
    return None


def flatten(entity):
    path = make_path(entity)
    pts = [[float(v.x), float(v.y), float(v.z)] for v in path.flattening(CURVE_TOLERANCE)]
    return [p for i, p in enumerate(pts) if not i or p != pts[i - 1]], path.is_closed


def record_for(entity, ref, layer, space, extras):
    """Uniform record: geometry keeps Z; extras carry semantic attributes."""
    typ = entity.dxftype()
    attr = entity.dxfattribs()
    rec = {'ref': ref, 'handle': attr.get('handle'), 'type': typ, 'layer': layer, 'space': space,
           'color': attr.get('color', 256), 'text': None, 'geometry': None}
    try:
        if typ in TEXT_TYPES:
            rec['text'] = entity_text(entity)
            ins = entity.dxf.get('insert')
            if ins is not None:
                rec['geometry'] = {'type': 'Point', 'coordinates': [float(ins[0]), float(ins[1]), float(ins[2])]}
            if typ in ('ATTRIB', 'ATTDEF'):
                rec['tag'] = entity.dxf.get('tag')
        elif typ == 'POINT':
            loc = entity.dxf.location
            rec['geometry'] = {'type': 'Point', 'coordinates': [float(loc[0]), float(loc[1]), float(loc[2])]}
        elif typ in GEOMETRY_TYPES:
            pts, closed = flatten(entity)
            if len(pts) > 1:
                if closed and len(pts) > 3 and pts[-1] != pts[0]:
                    pts.append(pts[0])
                rec['geometry'] = {'type': 'Polygon' if closed and len(pts) > 3 else 'LineString',
                                   'coordinates': [pts] if closed and len(pts) > 3 else pts}
        elif typ == 'INSERT':
            ins = entity.dxf.insert
            rec['block'] = entity.dxf.name
            rec['rotation'] = entity.dxf.get('rotation', 0.0)
            rec['scale'] = [entity.dxf.get('xscale', 1.0), entity.dxf.get('yscale', 1.0)]
            rec['geometry'] = {'type': 'Point', 'coordinates': [float(ins[0]), float(ins[1]), float(ins[2])]}
            rec['attribs'] = {a.dxf.tag: a.dxf.text for a in entity.attribs}
    except Exception as ex:  # keep the record, report the failure
        rec['error'] = str(ex)[:200]
    if extras:
        rec.update(extras)
    if entity.xdata:
        rec['xdata'] = {app: list(tags) for app, tags in entity.xdata.data.items()}
    if entity.has_extension_dict:
        try:
            rec['extension_dict'] = list(entity.get_extension_dict().keys())
        except Exception:
            rec['extension_dict'] = ['<unreadable>']
    return rec


def semantic_extras(entity):
    typ = entity.dxftype()
    extras = {}
    try:
        if typ == 'DIMENSION':
            extras['dimension'] = {
                'measurement': entity.get_measurement() if hasattr(entity, 'get_measurement') else None,
                'actual_measurement': entity.dxf.get('actual_measurement'),
                'text_override': entity.dxf.get('text'),
                'dimtype': entity.dimtype,
                'defpoints': [list(entity.dxf.get(k))[:3] for k in ('defpoint', 'defpoint2', 'defpoint3', 'defpoint4') if entity.dxf.hasattr(k)],
                'text_midpoint': list(entity.dxf.get('text_midpoint', (0, 0, 0)))[:3],
            }
        elif typ == 'MULTILEADER':
            ctx = entity.context
            extras['mleader'] = {
                'text': ctx.mtext.default_content if ctx.mtext else None,
                'block': entity.dxf.get('block_record_handle') if ctx.block else None,
                'leaders': [[list(v)[:3] for v in line.vertices] for leader in ctx.leaders for line in leader.lines],
                'base_point': list(ctx.base_point)[:3],
            }
        elif typ == 'LEADER':
            extras['leader'] = {'vertices': [list(v)[:3] for v in entity.vertices],
                                'annotation_handle': entity.dxf.get('annotation_handle')}
        elif typ in ('REGION', '3DSOLID', 'BODY', 'SURFACE'):
            extras['acis'] = {'sat_lines': len(entity.sat) if hasattr(entity, 'sat') else None,
                              'has_sab': bool(getattr(entity, 'sab', b''))}
        elif typ == 'VIEWPORT':
            d = entity.dxf
            w, h = d.get('width', 0), d.get('height', 0)
            vh = d.get('view_height', 0)
            scale = (h / vh) if vh else None
            vc = d.get('view_center_point', (0, 0))
            vw = (w / scale) if scale else None
            extras['viewport'] = {
                'id': d.get('id'), 'paper_center': list(d.get('center', (0, 0, 0)))[:2], 'paper_size': [w, h],
                'view_center': list(vc)[:2], 'view_height': vh, 'twist_angle': d.get('view_twist_angle', 0),
                'paper_per_model_unit': scale,
                'model_window': [vc[0] - vw / 2, vc[1] - vh / 2, vc[0] + vw / 2, vc[1] + vh / 2] if vw else None,
                'frozen_layers': [l if isinstance(l, str) else getattr(l.dxf, 'name', str(l)) for l in (entity.frozen_layers or [])],
                'status': d.get('status'), 'flags': d.get('flags'),
            }
        elif typ == 'IMAGE':
            extras['image_def_handle'] = entity.dxf.get('image_def_handle')
            extras['image_size'] = list(entity.dxf.get('image_size', (0, 0)))
        elif typ == 'OLE2FRAME':
            extras['ole'] = {'upper_left': list(entity.dxf.get('upper_left_corner', (0, 0, 0)))[:2],
                             'lower_right': list(entity.dxf.get('lower_right_corner', (0, 0, 0)))[:2]}
    except Exception as ex:
        extras['semantic_error'] = str(ex)[:200]
    return extras


def walk(entities, space, parents=(), inherited_layer='0', depth=0, skipped=None):
    for entity in entities:
        typ = entity.dxftype()
        layer = entity.dxf.get('layer', '0')
        if layer == '0' and parents:
            layer = inherited_layer
        handle = entity.dxf.get('handle') or (entity.origin_of_copy.dxf.handle if entity.origin_of_copy else None)
        ref = '/'.join((*parents, str(handle or typ)))
        yield record_for(entity, ref, layer, space, semantic_extras(entity))
        if depth > 20:
            continue
        children = None
        try:
            if typ == 'INSERT':
                children = []
                instances = entity.multi_insert() if entity.mcount > 1 else [entity]
                for inst in instances:
                    children.extend(inst.virtual_entities())
                    children.extend(inst.attribs)
            elif typ in ('DIMENSION', 'MULTILEADER', 'LEADER', 'ACAD_PROXY_ENTITY', 'ACAD_TABLE', 'MLINE'):
                children = list(entity.virtual_entities())
        except Exception as ex:
            if skipped is not None:
                skipped.append({'ref': ref, 'type': typ, 'reason': str(ex)[:200]})
        if children:
            yield from walk(children, space, (*parents, str(handle or typ)), layer, depth + 1, skipped)


def dict_tree(doc, dictionary, depth=0, seen=None):
    seen = seen if seen is not None else set()
    node = {}
    for key, value in dictionary.items():
        obj = value if hasattr(value, 'dxftype') else doc.entitydb.get(value)
        if obj is None:
            node[key] = None
            continue
        h = obj.dxf.handle
        if h in seen:
            node[key] = {'type': obj.dxftype(), 'handle': h, 'ref': 'seen'}
            continue
        seen.add(h)
        entry = {'type': obj.dxftype(), 'handle': h}
        if obj.dxftype() in ('DICTIONARY', 'ACDBDICTIONARYWDFLT') and depth < 8:
            entry['items'] = dict_tree(doc, obj, depth + 1, seen)
        elif obj.dxftype() == 'XRECORD':
            entry['tags'] = [[t.code, t.value] for t in obj.tags]
        elif obj.dxftype() == 'DICTIONARYVAR':
            entry['value'] = obj.dxf.get('value')
        node[key] = entry
    return node


def xrecords(doc):
    keymap = {}
    for d in doc.objects:
        if d.dxftype() in ('DICTIONARY', 'ACDBDICTIONARYWDFLT'):
            for k, v in d.items():
                keymap[v.dxf.handle if hasattr(v, 'dxf') else v] = (k, d.dxf.owner)
    out = []
    for o in doc.objects.query('XRECORD'):
        key, owner = keymap.get(o.dxf.handle, (None, None))
        owner_ent = doc.entitydb.get(o.dxf.owner)
        out.append({'handle': o.dxf.handle, 'key': key, 'owner_type': owner_ent.dxftype() if owner_ent else None,
                    'dictionary_owner': owner, 'tags': [[t.code, t.value] for t in o.tags]})
    return out


def save_ole(entity, source):
    data = entity.binary_data()
    digest = hashlib.sha256(data).hexdigest()
    info = {'handle': entity.dxf.handle, 'bytes': len(data), 'sha256': digest}
    start = data.find(bytes.fromhex('D0CF11E0A1B11AE1'))
    info['cfb_offset'] = start
    if start < 0:
        return info
    try:
        import io
        import olefile
        ole = olefile.OleFileIO(io.BytesIO(data[start:]))
        info['clsid'] = ole.root.clsid
        info['streams'] = {'/'.join(s): ole.get_size('/'.join(s)) for s in ole.listdir()}
        comp = [s for s in ole.listdir() if s[-1].endswith('CompObj')]
        if comp:
            raw = ole.openstream(comp[0]).read()
            info['user_type'] = [p for p in raw[28:].decode('latin1').split('\x00') if p.strip() and p.isprintable()][:3]
        if ole.exists('CONTENTS'):
            contents = ole.openstream('CONTENTS').read()
            ext = 'bmp' if contents[:2] == b'BM' else ('emf' if contents[:4] == b'\x01\x00\x00\x00' else 'bin')
            target = OLE_DIR / f'{digest[:16]}.{ext}'
            if not target.exists():
                target.write_bytes(contents)
            info['contents_file'] = target.relative_to(ROOT).as_posix()
            if ext == 'bmp':
                info['bitmap'] = dict(zip(('width', 'height', 'bpp'), struct.unpack('<iiH', contents[18:28])[:2] + struct.unpack('<H', contents[28:30])))
            if ext == 'emf':
                info['emf_texts'] = emf_texts(contents)
    except Exception as ex:
        info['ole_error'] = str(ex)[:200]
    return info


def emf_texts(data):
    texts, i = [], 0
    while i + 8 <= len(data):
        typ, size = struct.unpack('<II', data[i:i + 8])
        if size < 8:
            break
        if typ == 84 and size >= 76:  # EMR_EXTTEXTOUTW
            n, offset = struct.unpack('<II', data[i + 44:i + 52])
            texts.append(data[i + offset:i + offset + 2 * n].decode('utf-16le', 'replace'))
        i += size
    return texts


def z_profile(records):
    prof = defaultdict(lambda: {'count': 0, 'min': math.inf, 'max': -math.inf, 'values': Counter()})
    for rec in records:
        g = rec.get('geometry')
        if not g:
            continue
        coords = g['coordinates']
        pts = [coords] if g['type'] == 'Point' else (coords[0] if g['type'] == 'Polygon' else coords)
        zs = {round(p[2], 3) for p in pts if len(p) > 2}
        for z in zs:
            if z == 0:
                continue
            p = prof[(rec['layer'], rec['type'])]
            p['count'] += 1
            p['min'] = min(p['min'], z)
            p['max'] = max(p['max'], z)
            p['values'][z] += 1
    return [{'layer': l, 'type': t, 'nonzero_z': v['count'], 'min': v['min'], 'max': v['max'],
             'distinct': len(v['values']), 'top': v['values'].most_common(5)} for (l, t), v in sorted(prof.items())]


def audit(source):
    name = source.name.removesuffix('.dxf')
    meta_path = OUT / f'{name}.deep.json'
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if meta_path.exists():
        cached = json.loads(meta_path.read_text(encoding='utf8'))
        if cached.get('dxf_sha256') == digest and cached.get('audit_version') == VERSION:
            return cached
    doc = ezdxf.readfile(source)
    header = {k: doc.header.get(k) for k in doc.header.varnames()}
    result = {'source': name, 'dxf_sha256': digest, 'audit_version': VERSION,
              'header': header,
              'dates_note': 'TDCREATE/TDUPDATE/LASTSAVEDBY may be rewritten by the ODA export; compare against BAK and PDF.',
              'dates': {k: julian_to_iso(header.get(k)) for k in ('$TDCREATE', '$TDUPDATE')},
              'classes': [{'name': c.dxf.name, 'cpp': c.dxf.cpp_class_name, 'app': c.dxf.app_name,
                           'instances': c.dxf.get('instance_count')} for c in doc.classes],
              'skipped': []}
    products = Counter()
    for c in result['classes']:
        app = c['app'] or ''
        products[app.split('|Product Desc: ')[-1].split(' |')[0] if 'Product Desc' in app else app] += 1
    result['products'] = dict(products)

    result['layers'] = []
    for layer in doc.layers:
        d = layer.dxf
        desc = None
        if layer.xdata and 'AcAecLayerStandard' in layer.xdata.data:
            tags = [t.value for t in layer.xdata.get('AcAecLayerStandard')]
            desc = ' / '.join(str(v) for v in tags if isinstance(v, str) and v)
        result['layers'].append({'name': d.name, 'color': d.get('color'), 'true_color': d.get('true_color'),
                                 'linetype': d.get('linetype'), 'lineweight': d.get('lineweight'),
                                 'off': layer.is_off(), 'frozen': layer.is_frozen(), 'locked': layer.is_locked(),
                                 'plot': d.get('plot', 1), 'description': desc,
                                 'transparency': layer.transparency if hasattr(layer, 'transparency') else None})

    result['named_objects'] = dict_tree(doc, doc.rootdict)
    result['xrecords'] = xrecords(doc)
    result['groups'] = [{'name': n, 'description': g.dxf.get('description'), 'selectable': g.dxf.get('selectable'),
                         'members': [e.dxf.handle for e in g], 'types': dict(Counter(e.dxftype() for e in g))}
                        for n, g in doc.groups]
    result['images'] = [{'handle': i.dxf.handle, 'filename': i.dxf.get('filename'), 'size_px': list(i.dxf.get('image_size', (0, 0))),
                         'loaded': i.dxf.get('loaded')} for i in doc.objects.query('IMAGEDEF')]
    result['underlays'] = [{'type': u.dxftype(), 'filename': u.dxf.get('filename'), 'name': u.dxf.get('name')}
                           for u in doc.objects if u.dxftype() in ('PDFDEFINITION', 'DWFDEFINITION', 'DGNDEFINITION')]
    result['xrefs'] = [{'name': b.name, 'path': b.block.dxf.get('xref_path'), 'flags': b.block.dxf.get('flags')}
                       for b in doc.blocks if b.block.dxf.get('xref_path')]
    result['ole'] = [dict(save_ole(e, name), owner=e.dxf.owner, layer=e.dxf.get('layer'), paperspace=e.dxf.get('paperspace', 0))
                     for e in doc.entitydb.values() if e.is_alive and e.dxftype() == 'OLE2FRAME']

    # Paper space layouts, walked like model space.
    result['layouts'] = []
    paper_records = []
    for layout in doc.layouts:
        if layout.name == 'Model':
            continue
        recs = list(walk(layout, f'layout:{layout.name}', skipped=result['skipped']))
        paper_records.extend(recs)
        texts = [r['text'] for r in recs if r.get('text')]
        result['layouts'].append({
            'name': layout.name, 'tab_order': layout.dxf_layout.dxf.get('taborder'),
            'plot': {k: layout.dxf_layout.dxf.get(k) for k in ('page_setup_name', 'plot_configuration_file', 'paper_size', 'plot_layout_flags')},
            'viewports': [r['viewport'] for r in recs if 'viewport' in r],
            'texts': texts, 'attribs': [r['attribs'] for r in recs if r.get('attribs')],
            'types': dict(Counter(r['type'] for r in recs)),
        })
    with gzip.open(OUT / f'{name}.paperspace.jsonl.gz', 'wt', encoding='utf8') as s:
        for r in paper_records:
            s.write(dumps(r) + '\n')

    # Block definitions that are never referenced anywhere.
    used = Counter(e.dxf.name for e in doc.entitydb.values() if e.is_alive and e.dxftype() == 'INSERT')
    unused = [b for b in doc.blocks if not b.block.is_xref and not b.name.lower().startswith(('*model_space', '*paper_space'))
              and b.name not in used and len(b) > 0]
    unused_records = []
    result['unused_blocks'] = []
    for block in unused:
        recs = list(walk(block, f'block:{block.name}', skipped=result['skipped']))
        unused_records.extend(recs)
        xs = [p for r in recs if r.get('geometry') for p in iter_xy(r['geometry'])]
        result['unused_blocks'].append({
            'name': block.name, 'entities': len(block), 'expanded': len(recs), 'base_point': list(block.block.dxf.get('base_point', (0, 0, 0))),
            'types': dict(Counter(r['type'] for r in recs)), 'layers': dict(Counter(r['layer'] for r in recs)),
            'texts': [r['text'] for r in recs if r.get('text')][:200],
            'extent': [min(p[0] for p in xs), min(p[1] for p in xs), max(p[0] for p in xs), max(p[1] for p in xs)] if xs else None,
        })
    with gzip.open(OUT / f'{name}.unused-blocks.jsonl.gz', 'wt', encoding='utf8') as s:
        for r in unused_records:
            s.write(dumps(r) + '\n')

    # Model space second pass: semantics, Z, extension dicts, outliers.
    model = list(walk(doc.modelspace(), 'model', skipped=result['skipped']))
    semantic = [r for r in model if any(k in r for k in ('dimension', 'mleader', 'leader', 'acis', 'image_def_handle', 'ole'))
                or r['type'] in ('ACAD_PROXY_ENTITY', 'ACAD_TABLE', 'MLINE', 'WIPEOUT', 'HELIX', 'RAY', 'XLINE')]
    with gzip.open(OUT / f'{name}.annotations.jsonl.gz', 'wt', encoding='utf8') as s:
        for r in semantic:
            s.write(dumps(r) + '\n')
    # INSERTs (expanded and lost by extract_cad.py: insertion point, rotation, Z,
    # attributes) and records with application xdata, e.g. RPU_GRAFICOS street
    # names on block outlines or survey point descriptions.
    generic_xdata = {'ACAD', 'AcDbBlockRepETag', 'GradientColor1ACI', 'GradientColor2ACI', 'AcadAnnotative'}
    with gzip.open(OUT / f'{name}.model-extras.jsonl.gz', 'wt', encoding='utf8') as s:
        for r in model:
            if r['type'] == 'INSERT' or set(r.get('xdata', {})) - generic_xdata:
                s.write(dumps(r) + '\n')
    ext = Counter(k for r in model for k in r.get('extension_dict', []))
    xd = Counter(app for r in model for app in r.get('xdata', {}))
    hyperlinks = [{'ref': r['ref'], 'layer': r['layer'], 'xdata': r['xdata']['PE_URL']} for r in model if 'PE_URL' in r.get('xdata', {})]
    result['model'] = {
        'records': len(model), 'types': dict(Counter(r['type'] for r in model)),
        'extension_dict_keys': dict(ext), 'xdata_apps': dict(xd), 'hyperlinks': hyperlinks,
        'dimensions': sum(1 for r in model if 'dimension' in r), 'mleaders': sum(1 for r in model if 'mleader' in r),
        'leaders': sum(1 for r in model if 'leader' in r), 'acis': sum(1 for r in model if 'acis' in r),
        'proxy_entities': sum(1 for r in model if r['type'] == 'ACAD_PROXY_ENTITY'),
        'z_profile': z_profile(model),
        'outliers': outliers(model),
    }
    result['paper'] = {'z_profile': z_profile(paper_records)}
    meta_path.write_text(dumps(result), encoding='utf8')
    return result


def iter_xy(geometry):
    c = geometry['coordinates']
    if geometry['type'] == 'Point':
        yield c
    elif geometry['type'] == 'Polygon':
        yield from c[0]
    else:
        yield from c


def outliers(records):
    """Records far beyond the main cluster (median ± 20 km), e.g. stray copies."""
    xs = sorted(p[0] for r in records if r.get('geometry') for p in iter_xy(r['geometry']))
    ys = sorted(p[1] for r in records if r.get('geometry') for p in iter_xy(r['geometry']))
    if not xs:
        return []
    mx, my = xs[len(xs) // 2], ys[len(ys) // 2]
    out = []
    for r in records:
        if not r.get('geometry'):
            continue
        far = [p for p in iter_xy(r['geometry']) if abs(p[0] - mx) > 20_000 or abs(p[1] - my) > 20_000]
        if far:
            out.append({'ref': r['ref'], 'type': r['type'], 'layer': r['layer'], 'text': r.get('text'), 'sample': far[0]})
    return out[:500]


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    OLE_DIR.mkdir(parents=True, exist_ok=True)
    log = json.loads((SRC / 'conversion-log.json').read_text(encoding='utf8'))
    only = set(sys.argv[1:])
    summary = []
    for item in log:
        if only and item['source'] not in only:
            continue
        print('Deep audit', item['source'], flush=True)
        r = audit(SRC / item['dxf'])
        summary.append({'source': r['source'], 'layouts': [(l['name'], len(l['texts']), len(l['viewports'])) for l in r['layouts']],
                        'unused_blocks': len(r['unused_blocks']), 'unused_entities': sum(b['expanded'] for b in r['unused_blocks']),
                        'ole': len(r['ole']), 'images': [i['filename'] for i in r['images']],
                        'dimensions': r['model']['dimensions'], 'mleaders': r['model']['mleaders'],
                        'xrecords': len(r['xrecords']), 'groups': len(r['groups']), 'skipped': len(r['skipped']),
                        'products': r['products'], 'outliers': len(r['model']['outliers'])})
        print(json.dumps(summary[-1], ensure_ascii=False), flush=True)
    if not only:
        (OUT / 'deep-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf8')
