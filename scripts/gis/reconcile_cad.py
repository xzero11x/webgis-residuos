"""Reconcile every current DWG with cached extraction; publish additive review data.

No conversion, snapping, route bridging or destructive staging refresh. The scoped
2026 handles were visually checked against the complete model on 2026-10-16.
"""
from pathlib import Path
from collections import Counter
import gzip, json, hashlib, math, uuid, re
from pyproj import Transformer
from sources import SOURCE_DIR
from ezdxf.colors import aci2rgb

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / 'data/cad/extracted'
OUT = ROOT / 'database/municipal'
SOURCE = 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg'
COFOPRI = 'COFOPRI BAGUA.dwg'
# Measured by align_cofopri.py and adopted as its CRS on 16/10/2026. Without the
# measurement COFOPRI keeps original coordinates only.
COFOPRI_ALIGNMENT = EXT / 'cofopri-alineacion.json'
COFOPRI_ADOPTED = '16/10/2026'
ROUTE_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, 'bagua:cad:2026:tomaque'))
REFS = '''989930ED 989930EF 989930F0 989930F1 989930F2 989930F3 989930F4 989930F5 989930F6 989930FD 989930FE 989930FF 98993100 98993103 98993104 98993105 98993109 9899310C 989936BA 989936BB 989937DA 989937DB 989937DC 989937DD 98993802 98993805 98993806 98993807 98993808 9899380B 9899380D 9899380F 98993B04 98993C23 98993C5C 98993C5D 98993C5E 98993DDF 98993E0F 98993E8B 98993EDC 98993EDD 98993EDE 98993EDF 98993EF8 989945E1 989946A3 989946A5 989A04C0 989A0B0A 989A0B67 989A0B6F 989A0B9F 989A0BD8 989A0BF7 989A0BF8 989A0D48 989A0D49 989A0EF1 989A0EF2 989A0F15 989A0F17 989ACB22 989ACB48'''.split()
TO_WGS = Transformer.from_crs(32717, 4326, always_xy=True)
PUBLIC = re.compile(r'^(RUTA\b|JR\.?\s|AV\.?\s|CALLE\b|SECTOR\b|SECT\.\s|PASAJE\b|PSJE\.\s|LAS CASUARINAS$|EL TOMAQUE$)', re.I)

def read(path):
    with gzip.open(path, 'rt', encoding='utf8') as f:
        return [json.loads(line) for line in f]

def points(g):
    c = g['coordinates']
    return [c] if g['type']=='Point' else c[0] if g['type']=='Polygon' else c

def project(g, offset):
    def walk(c):
        if isinstance(c[0], (int,float)):
            return list(TO_WGS.transform(c[0]+offset[0], c[1]+offset[1]))
        return [walk(p) for p in c]
    return {'type':g['type'], 'coordinates':walk(g['coordinates'])}

def color(r, lookup):
    attrs = r.get('attributes', {})
    # HATCH boundaries inherit the parent's true color, lost by the first exporter.
    parent = lookup.get(r['ref'].split('/boundary-')[0], {})
    true = attrs.get('true_color', parent.get('attributes', {}).get('true_color'))
    if true is not None: return '#%06x' % true
    aci = r.get('color') or 7
    return '#66717b' if aci in (0,7,256) else '#%02x%02x%02x' % tuple(aci2rgb(abs(aci)))

cofopri = json.loads(COFOPRI_ALIGNMENT.read_text(encoding='utf8')) if COFOPRI_ALIGNMENT.exists() else None

def placement(name):
    """Offset to EPSG:32717 and CRS status: declared (GEODATA) or adopted translation (Tomaque, COFOPRI)."""
    if name == SOURCE:
        return [3.589,2.352], 'adoptado'
    if name == COFOPRI:
        if not cofopri:
            return [0,0], 'pendiente'
        t = cofopri['translation_m']
        return [t['dE'],t['dN']], 'adoptado'
    return [0,0], 'declarado'

audits, review, routes, symbols = [], [], [], []
for source in sorted(SOURCE_DIR.glob('*.dwg')):
    rows = read(EXT/(source.name+'.dxf.entities.jsonl.gz'))
    lookup = {r['ref']:r for r in rows}
    offset, crs_status = placement(source.name)
    registered = crs_status != 'pendiente'
    layers = Counter(r['layer'] for r in rows)
    counts = Counter(r['type'] for r in rows)
    audit = {'source':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
             'entities':len(rows),'types':dict(counts),'layers':dict(layers),
             'geometries':sum(bool(r.get('geometry')) for r in rows),
             'crsStatus':crs_status,
             'offset':offset,'renderable':0,'outside':0,'textSuppressed':0,
             'withoutGeometry':dict(Counter(r['type'] for r in rows if not r.get('geometry')))}
    if source.name == COFOPRI and cofopri:
        audit['alignment'] = {k: cofopri[k] for k in ('translation_m','vertices_within_5cm','rms_within_5cm_m',
                                                      'psad56_expected_shift_m','psad56_difference_m','reference')}
        audit['alignment']['adopted'] = COFOPRI_ADOPTED
    for r in rows:
        g = r.get('geometry')
        if not g: continue
        ps = points(g)
        in_region = all(760000<p[0]<800000 and 9360000<p[1]<9395000 for p in ps)
        if not in_region: audit['outside']+=1
        geographic = project(g,offset) if registered and in_region else None
        safe_text = r.get('text') if PUBLIC.search(r.get('text') or '') else None
        if r.get('text') and not safe_text: audit['textSuppressed']+=1
        p = {'id':source.name+':'+r['ref'],'source':source.name,'ref':r['ref'],
             'layer':r['layer'],'entityType':r['type'],'color':color(r,lookup),
             'hidden':r['hidden'],'text':safe_text,'crsStatus':audit['crsStatus'],
             'offset':offset,'linetype':r.get('attributes',{}).get('linetype'),
             'note':'Geometría documental sin clasificación operativa. Textos privados omitidos.',
             'outsideVerifiedArea':bool(offset[0] and any(not(771000<p[0]+offset[0]<777000 and 9374000<p[1]+offset[1]<9379000) for p in ps))}
        review.append({'properties':p,'geometry':geographic,'originalGeometry':g})
        if geographic: audit['renderable']+=1
    audits.append(audit)
    if source.name != SOURCE: continue
    selected=[lookup[ref] for ref in REFS]
    assert all(r['layer']=='COTAS' and r['geometry']['type']=='LineString' and r['color']==40 for r in selected)
    original={'type':'MultiLineString','coordinates':[r['geometry']['coordinates'] for r in selected]}
    manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf8'))
    service=next(r['servicioId'] for r in manifest['routes'] if r['codigo']=='CAD-PRIMAVERA')
    note='Trazado naranja del plano rotulado RUTA 2026: Tomaque, Brujo Pata y Las Casuarinas. Un conjunto documental; no se inventan tres rutas operativas independientes.'
    routes.append({'id':ROUTE_ID,'codigo':'CAD-2026','nombre':'Ruta 2026 · Tomaque, Brujo Pata y Casuarinas',
                   'servicioId':service,'color':'#d96a16','geometry':project(original,offset),'originalGeometry':original,
                   'metadata':{'source':SOURCE,'status':'georreferenciada','note':note,'segments':len(selected),
                   'references':REFS,'labelReferences':[r['ref'] for r in rows if r.get('text')=='RUTA 2026'],
                   'sourceCrs':'EPSG:32717 adoptado, traslación +3.589 m E / +2.352 m N',
                   'coverage':'64 entidades originales. Se conservan discontinuidades y tipos de línea; no se conectan extremos.',
                   'scheduleStatus':'Sin horario operativo confirmado','directionStatus':'Únicamente triángulos originales del CAD',
                   'warnings':['2026 es el rótulo literal del plano; la Gerencia debe confirmar si es código o referencia al año.',
                               'El extremo occidental queda fuera del área de ajuste comprobada: posición por validar.',
                               'Georreferenciación documental; no acredita vigencia operativa ni precisión topográfica.'],
                   'sha256':audit['sha256'],'offset':offset,'lengthMeaning':'Suma de trazos, no distancia de recorrido'}})
    routes[-1]['metadata']['views'] = [
        {'name':name,'bounds':[list(TO_WGS.transform(w+offset[0],s+offset[1])),list(TO_WGS.transform(e+offset[0],n+offset[1]))]}
        for name,(w,s,e,n) in [('Tomaque',(775727,9374304,776934,9375733)),
                             ('Brujo Pata',(774422,9376099,775392,9376659)),
                             ('Casuarinas',(774085,9375281,774635,9376142))]]
    segments=[(a,b) for r in selected for a,b in zip(r['geometry']['coordinates'],r['geometry']['coordinates'][1:])]
    def distance(p,a,b):
        dx,dy=b[0]-a[0],b[1]-a[1]; t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
        return math.dist(p,[a[0]+t*dx,a[1]+t*dy])
    for r in rows:
        if '/98993125/boundary-' not in r['ref'] or not r.get('geometry'): continue
        ring=points(r['geometry'])[:-1]
        if len(ring)!=3: continue
        p=[sum(q[i] for q in ring)/3 for i in (0,1)]
        if min(distance(p,a,b) for a,b in segments)>12: continue
        sides=sorted((math.dist(ring[i],ring[(i+1)%3]),i) for i in range(3))
        if sides[1][0]<sides[0][0]*1.25: continue
        i=sides[0][1]; base=[(ring[i][j]+ring[(i+1)%3][j])/2 for j in (0,1)];tip=ring[(i+2)%3]
        a=TO_WGS.transform(base[0]+offset[0],base[1]+offset[1]); b=TO_WGS.transform(tip[0]+offset[0],tip[1]+offset[1])
        bearing=math.degrees(math.atan2((b[0]-a[0])*math.cos(math.radians(a[1])),b[1]-a[1]))%360
        props={'id':'cad-2026:'+r['ref'],'kind':'sentido','nombre':'Sentido dibujado · plano 2026',
               'source':SOURCE,'ref':r['ref'],'layer':r['layer'],'routeCode':'CAD-2026','status':'documental',
               'note':'Triángulo original 98993125 sobre el trazado naranja; orientación de base corta a punta, no de vértices de ruta.',
               'association':'Proximidad geométrica ≤12 m al trazado 2026, pendiente de validación operativa.',
               'approval':'Vigencia operativa pendiente de validación municipal','bearing':bearing,
               'symbolRef':'98993125','baseUtm':base,'tipUtm':tip,
               'originalGeometry':r['geometry'],'offset':offset}
        symbols.append({'type':'Feature','properties':props,'geometry':project({'type':'Point','coordinates':p},offset)})

audit={'sources':audits,'statistics':{'routesAdded':len(routes),'reviewGeometries':len(review),'directions':len(symbols)},
       'limitations':[(f'COFOPRI está en PSAD56 / UTM 17S; su CRS adoptado el {COFOPRI_ADOPTED} es EPSG:32717 tras la '
                       'traslación medida contra el CAD de rutas, no la transformación PSAD56 genérica.') if cofopri else
                      'COFOPRI conserva coordenadas originales; CRS sin confirmar, no se superpone al mapa.',
       'La revisión geométrica no sustituye un visor DWG: REGION, proxies, estilos, grosores, patrones HATCH y dimensiones no se reproducen completamente.',
       'Se revisan los seis DWG presentes; los PDF originales ya no están en rutas/. Se conservan sus extracciones anteriores.',
       'No se convierten círculos verdes en paradas confirmadas sin evidencia de leyenda.']}
with gzip.open(OUT/'cad-reconciliation.json.gz','wt',encoding='utf8') as f:
    json.dump({'audit':audit,'routes':routes,'symbols':symbols,'features':review},f,ensure_ascii=False,separators=(',',':'))
(EXT/'cad-reconciliation-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'sources':len(audits),'features':len(review),'routes':len(routes),'arrows':len(symbols)}))
