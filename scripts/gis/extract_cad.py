"""Inventory CAD and extract model geometry in original drawing coordinates.

Original DXF exports retain unsupported objects. JSONL retains entity attributes,
block provenance, text and visibility. Curves are tessellated at 0.20 drawing units.
No snapping, topology repair, text interpretation or CRS assignment takes place here.
"""
from pathlib import Path
from collections import Counter, defaultdict
import gzip
import hashlib
import json
import math
import ezdxf
from ezdxf.path import make_path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/cad/extracted'
OUT.mkdir(parents=True, exist_ok=True)

def serial(value):
    if isinstance(value, bytes):
        return {'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()}
    try:
        return list(value)
    except TypeError:
        return str(value)

def dumps(value):
    return json.dumps(value, ensure_ascii=False, default=serial, separators=(',', ':'))

def extract(source):
    target = OUT / (source.name + '.entities.jsonl.gz')
    meta_path = OUT / (source.name + '.inventory.json')
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    if target.exists() and meta_path.exists():
        cached = json.loads(meta_path.read_text(encoding='utf8'))
        if cached.get('dxf_sha256') == source_hash and cached.get('extractor_version') == 2:
            return cached
    doc = ezdxf.readfile(source)
    layers = {l.dxf.name: l for l in doc.layers}
    inventory = {
        'source': source.name.removesuffix('.dxf'), 'dxf_version': doc.dxfversion,
        'dxf_sha256':source_hash,'extractor_version':2,
        'headers': {k:doc.header.get(k) for k in ('$INSUNITS','$MEASUREMENT','$EXTMIN','$EXTMAX','$UCSORG','$UCSXDIR','$UCSYDIR')},
        'layers': [l.dxfattribs() for l in doc.layers],
        'blocks': [{'name': b.name, 'count': len(b), 'attributes': b.block.dxfattribs(), 'types': dict(Counter(e.dxftype() for e in b))} for b in doc.blocks],
        'layouts': [{'name':l.name, 'count':len(l), 'types':dict(Counter(e.dxftype() for e in l))} for l in doc.layouts],
        'objects': dict(Counter(e.dxftype() for e in doc.objects)),
        'geodata': [], 'skipped': [], 'curve_tolerance_drawing_units':0.2,
    }
    for geo in doc.objects:
        if geo.dxftype() == 'GEODATA':
            inventory['geodata'].append({'attributes':geo.dxfattribs(),'definition':geo.coordinate_system_definition,'crs':geo.get_crs()})
    counts = Counter()
    raw_path = OUT / (source.name + '.raw.jsonl.gz')
    with gzip.open(raw_path, 'wt', encoding='utf8') as stream:
        for entity in doc.entitydb.values():
            if not entity.is_alive:
                continue
            record={'type':entity.dxftype(),'attributes':entity.dxfattribs()}
            if entity.dxftype() == 'LWPOLYLINE': record['vertices_xyseb'] = list(entity.get_points())
            elif entity.dxftype() == 'POLYLINE': record['vertices'] = [v.dxfattribs() for v in entity.vertices]
            elif entity.dxftype() == 'SPLINE':
                record['control_points'] = list(entity.control_points)
                record['fit_points'] = list(entity.fit_points)
                record['knots'] = list(entity.knots)
                record['weights'] = list(entity.weights)
            if entity.xdata:
                record['xdata'] = {app:list(tags) for app,tags in entity.xdata.data.items()}
            stream.write(dumps(record)+'\n')

    def walk(entities, parents=(), inherited_layer='0', inherited_color=7, inherited_hidden=False):
        for entity in entities:
            typ = entity.dxftype()
            attr = entity.dxfattribs()
            original = entity.origin_of_copy
            handle = attr.get('handle') or (original.dxf.handle if original else None)
            layer = attr.get('layer','0')
            if layer == '0' and parents:
                layer = inherited_layer
            lay = layers.get(layer)
            color = attr.get('color',256)
            if color == 0: color = inherited_color
            elif color == 256: color = abs(lay.dxf.color) if lay else 7
            hidden = inherited_hidden or bool(attr.get('invisible')) or bool(lay and (lay.is_off() or lay.is_frozen()))
            ref = '/'.join((*parents, str(handle or typ)))
            if typ == 'INSERT':
                if len(parents)>20:
                    inventory['skipped'].append({'ref':ref,'reason':'block recursion limit'})
                    continue
                instances = entity.multi_insert() if entity.mcount>1 else [entity]
                for instance in instances:
                    yield from walk(instance.virtual_entities(skipped_entity_callback=lambda e, why: inventory['skipped'].append({'ref':ref,'type':e.dxftype(),'reason':why})),(*parents,str(handle or attr.get('name'))),layer,color,hidden)
                    yield from walk(instance.attribs,(*parents,str(handle or attr.get('name'))),layer,color,hidden)
                continue
            text = None
            geometry = None
            pts=[]
            try:
                if typ in ('TEXT','ATTRIB','ATTDEF','MTEXT'):
                    text = entity.plain_text() if hasattr(entity,'plain_text') else attr.get('text','')
                    geometry={'type':'Point','coordinates':list(entity.dxf.insert)[:2]}
                elif typ == 'POINT':
                    geometry={'type':'Point','coordinates':list(entity.dxf.location)[:2]}
                elif typ in ('LINE','LWPOLYLINE','POLYLINE','SPLINE','CIRCLE','ARC','ELLIPSE','SOLID','TRACE','3DFACE'):
                    path=make_path(entity)
                    pts = [[float(v.x),float(v.y)] for v in path.flattening(0.2)]
                    pts=[p for i,p in enumerate(pts) if not i or p!=pts[i-1]]
                    if len(pts)>1:
                        is_closed = path.is_closed and len(pts)>3
                        if is_closed and pts[-1]!=pts[0]:pts.append(pts[0])
                        geometry={'type':'Polygon' if is_closed else 'LineString','coordinates':[pts] if is_closed else pts}
                elif typ == 'HATCH':
                    # Preserve hatch boundaries as separate paths; holes and topology need review.
                    from ezdxf.path import from_hatch
                    for i,path in enumerate(from_hatch(entity)):
                        pp=[[float(v.x),float(v.y)] for v in path.flattening(0.2)]
                        if len(pp)>2:
                            if pp[-1]!=pp[0]:pp.append(pp[0])
                            yield {'ref':ref+f'/boundary-{i}','handle':handle,'type':'HATCH_BOUNDARY','layer':layer,'color':color,'hidden':hidden,'text':None,'geometry':{'type':'Polygon','coordinates':[pp]},'length':sum(math.dist(a,b) for a,b in zip(pp,pp[1:])),'attributes':{'pattern_name':attr.get('pattern_name'),'boundary_only':True}}
                elif typ == 'DIMENSION':
                    yield from walk(entity.virtual_entities(),(*parents,str(handle)),layer,color,hidden)
            except Exception as ex:
                inventory['skipped'].append({'ref':ref,'type':typ,'reason':str(ex)[:180]})
            yield {'ref':ref,'handle':handle,'type':typ,'layer':layer,'color':color,'hidden':hidden,'text':text,'geometry':geometry,'length':sum(math.dist(a,b) for a,b in zip(pts,pts[1:])),'attributes':attr}

    with gzip.open(target, 'wt', encoding='utf8') as stream:
        for record in walk(doc.modelspace()):
            counts[(record['layer'],record['type'])]+=1
            stream.write(dumps(record)+'\n')
    inventory['expanded_counts']=[{'layer':l,'type':t,'count':n} for (l,t),n in sorted(counts.items())]
    inventory['expanded_total']=sum(counts.values())
    meta_path.write_text(dumps(inventory),encoding='utf8')
    return inventory

if __name__=='__main__':
    log=json.loads((ROOT/'data/cad/converted/conversion-log.json').read_text(encoding='utf8'))
    result=[]
    for item in log:
        print('Extract',item['source'],flush=True)
        inv=extract(ROOT/'data/cad/converted'/item['dxf'])
        result.append({'source':inv['source'],'expanded_total':inv['expanded_total'],'layers':len(inv['layers']),'geodata':[g['crs'] for g in inv['geodata']],'skipped':len(inv['skipped'])})
        print(result[-1],flush=True)
    (OUT/'cad-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
