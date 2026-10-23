"""Recover documentary symbols from cached, expanded CAD; never reconvert DWG.

Rules are scoped to this inspected delivery. Symbol identity and operational
approval are separate. No route vertex order is used to infer direction.
"""
from pathlib import Path
import gzip, json, math, hashlib, re
from collections import Counter
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'RUTAS CON TIEMPO.dwg'
path = ROOT / 'data/cad/extracted' / (SOURCE + '.dxf.entities.jsonl.gz')
entities = [json.loads(line) for line in gzip.open(path, 'rt', encoding='utf8')]
byref = {e['ref']: e for e in entities}
transform = Transformer.from_crs(32717, 4326, always_xy=True)
manifest = json.loads((ROOT / 'database/municipal/manifest.json').read_text(encoding='utf8'))
routes = [r for r in manifest['routes'] if r['codigo'] in ['MUN-1001','MUN-2001','MUN-2002','CAD-PRIMAVERA']]
features, excluded = [], []

def center(e):
    g=e['geometry']
    if g['type']=='Point': return g['coordinates']
    p=g['coordinates'][0][:-1] if g['type']=='Polygon' else g['coordinates']
    return [sum(q[i] for q in p)/len(p) for i in (0,1)]

def territory(p): return 771300 < p[0] < 775000 and 9374300 < p[1] < 9379000

def distance(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
    return math.dist(p,[a[0]+t*dx,a[1]+t*dy])

def association(p):
    distances=sorted((min(distance(p,a,b) for s in r['originalGeometry']['coordinates'] for a,b in zip(s,s[1:])),r['codigo']) for r in routes)
    # Conservative, explicitly spatial association, never an operational assignment.
    best,other=distances[:2]
    return (best[1] if best[0]<=12 and other[0]-best[0]>=5 else ''), [{'codigo':c,'distanceM':round(d,2)} for d,c in distances]

def add(e,kind,p,note,status='documental',extra=None):
    if not territory(p):
        excluded.append({'ref':e['ref'],'kind':kind,'reason':'Leyenda o fuera del territorio revisado','position':p})
        return
    code,distances=association(p) if kind in ['sentido','inicio','fin','parada'] else ('',[])
    props={'id':'cad-symbol:'+e['ref'],'kind':kind,'nombre':{'sentido':'Sentido indicado en el plano','inicio':'Inicio de ruta','fin':'Fin de ruta','parada':'Parada del plano','calle':e.get('text'),'revision':e.get('text') or 'Símbolo por interpretar','horario':e.get('text') or 'Anotación de tiempo'}[kind],
           'status':status,'routeCode':code,'source':SOURCE,'ref':e['ref'],'layer':e['layer'],
           'note':note,'approval':'Vigencia operativa pendiente de validación municipal',
           'association':'Proximidad exclusiva al trazo (≤12 m; margen ≥5 m). No asignación operativa.' if code else 'Sin asociación inequívoca a una ruta',
           'candidates':distances,'sourceCrs':'EPSG:32717','originalGeometry':e['geometry'], **(extra or {})}
    features.append({'type':'Feature','geometry':{'type':'Point','coordinates':list(transform.transform(*p))},'properties':props})

for e in entities:
    if e['hidden'] or not e.get('geometry'): continue
    if '/15C9C/boundary-' in e['ref']:
        ring=e['geometry']['coordinates'][0][:-1]
        if len(ring)!=3: continue
        sides=sorted((math.dist(ring[i],ring[(i+1)%3]),i) for i in range(3))
        if sides[1][0]<sides[0][0]*1.25: continue
        i=sides[0][1];base=[(ring[i][j]+ring[(i+1)%3][j])/2 for j in (0,1)];tip=ring[(i+2)%3]
        a,b=transform.transform(*base),transform.transform(*tip)
        angle=math.degrees(math.atan2((b[0]-a[0])*math.cos(math.radians(a[1])),b[1]-a[1]))%360
        add(e,'sentido',center(e),'Mismo bloque triangular 15C9C que SENTIDO DE RUTA en la leyenda. Orientación de la base corta hacia la punta; no del orden de vértices.',extra={'bearing':angle,'legendRef':'23323/15C9C/boundary-0','tipUtm':tip,'baseUtm':base})
    elif e['type']=='CIRCLE' and e['layer']=='SECT. LA PRIMAVERA' and e['color']==1 and abs(e['attributes']['radius']-2.200545380264521)<1e-6:
        p=e['attributes']['center'][:2]
        add(e,'parada',p,'Círculo de igual capa, color y radio que PARADA en la leyenda 2A157. Posición del centro original; servicio y vigencia por validar.',extra={'legendRef':'2A157'})
    elif e['layer']=='CALLES' and e.get('text'):
        add(e,'calle',center(e),'Nombre de calle del plano municipal. No sustituye nomenclatura aprobada.')
    elif e['layer']=='FLECHA':
        add(e,'revision',center(e),'Línea sin punta: el nombre FLECHA no permite determinar orientación.',status='revision')
    elif e['layer']=='HORARIO 2002':
        add(e,'revision',center(e),'Geometría en HORARIO 2002; no contiene por sí sola una hora ni acredita una parada.',status='revision')
    elif e.get('text') and re.search(r'\b\d{1,2}:\d{2}\b',e['text']):
        add(e,'horario',center(e),'Texto original, sin horario operativo validado ni vinculación automática a una ruta.',status='revision')

# Explicitly inspected symbol/text pairs; retain each anchor and its distance.
pairs=[('2331C/boundary-0','23294','inicio'),('55C682/boundary-0','2668F','inicio'),('272BA/boundary-0','6300C','inicio'),('4896B6/boundary-0','4896C6','inicio'),('1FBC4/boundary-0','63014','fin'),('4048C6/boundary-0','4048CE','fin'),('4BEF77/boundary-0','4BEF7F','fin')]
for symbol,label,kind in pairs:
    e=byref[symbol];p=center(e)
    add(e,kind,p,'Centro del marcador circular junto al rótulo explícito de inicio/fin. Colores variables entre versiones; asociación documental revisada, no aprobación del servicio.',extra={'labelRef':label,'labelDistanceM':round(math.dist(p,center(byref[label])),2)})

# Direction arrows printed in the route PDFs. Each is a filled polygon placed with the
# validated PDF->CAD similarity of refine_pdf.py (holdout RMS 0.06-0.11 m) and oriented
# from its base to its apex, like the CAD arrows above. An arrow is kept only when it
# lies on the trace of the route it belongs to; route direction is never taken from
# vertex order.
PDF_TERRITORY = (771000, 9374000, 777000, 9379000)  # where the Tomaque shift was verified
TOMAQUE_SHIFT = json.loads((ROOT/'data/cad/gis/segunda-pasada/tomaque-alineacion.json').read_text(encoding='utf8'))['translation_m']
route_geometry = {r['codigo']: r['originalGeometry']['coordinates'] for r in manifest['routes']}

def pdf_vectors(stem):
    for line in gzip.open(ROOT/'data/cad/extracted'/(stem+'-vectors.jsonl.gz'), 'rt', encoding='utf8'):
        yield json.loads(line)

def polygon_points(d):
    pts = []
    for item in d['items']:
        if item[0] != 'l': return None
        for q in item[1:]:
            if not any(math.dist(q, r) < 1e-3 for r in pts): pts.append(q)
    return pts

def rgb(values): return tuple(round(c*255) for c in values) if values else None

def pdf_arrows(stem, source, fill_rule, route, apex, shift=(0, 0), note='', approval_ref='', GAP_LIMIT=3, report_unreadable=False):
    """apex(points) -> (base_point, tip_point, center) in PDF coordinates, or None."""
    georef = json.loads((ROOT/'data/cad/extracted'/(stem+'-georeference.json')).read_text(encoding='utf8'))
    views = [(v['box'], v['matrix']) for v in georef['viewports'] if v['status'] == 'registered-to-cad']
    found = 0
    for d in pdf_vectors(stem):
        if not fill_rule(d): continue
        pts = polygon_points(d)
        shape = apex(pts) if pts else None
        if not shape:
            if report_unreadable and pts:
                excluded.append({'ref': f'pdf-vector:{stem}:{d["index"]}', 'kind': 'sentido', 'reason': 'Forma de flecha sin punta inequívoca; no se orienta', 'position': pts[0]})
            continue
        base, tip, center = shape
        view = next((m for (x0, y0, x1, y1), m in views if x0 <= center[0] < x1 and y0 <= center[1] < y1), None)
        if view is None: continue
        to_utm = lambda q: [q[0]*view[0][0]+q[1]*view[1][0]+view[2][0]+shift[0], q[0]*view[0][1]+q[1]*view[1][1]+view[2][1]+shift[1]]
        p, b, t = to_utm(center), to_utm(base), to_utm(tip)
        gap = min(distance(p, a, c) for s in route_geometry[route] for a, c in zip(s, s[1:]))
        inside = PDF_TERRITORY[0] < p[0] < PDF_TERRITORY[2] and PDF_TERRITORY[1] < p[1] < PDF_TERRITORY[3]
        if not inside or gap > GAP_LIMIT:
            excluded.append({'ref': f'pdf-vector:{stem}:{d["index"]}', 'kind': 'sentido', 'reason': f'A {gap:.1f} m del trazo de su ruta o fuera del territorio', 'position': p})
            continue
        # A symbol already recovered from the CAD blocks is not published twice.
        if any(f['properties']['kind'] == 'sentido' and f['properties']['source'].endswith('.dwg') and f['properties']['routeCode'] == route and
               math.dist([(f['properties']['baseUtm'][0]+f['properties']['tipUtm'][0])/2, (f['properties']['baseUtm'][1]+f['properties']['tipUtm'][1])/2], p) < 3 for f in features):
            continue
        a, c = transform.transform(*b), transform.transform(*t)
        angle = math.degrees(math.atan2((c[0]-a[0])*math.cos(math.radians(a[1])), c[1]-a[1])) % 360
        features.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': list(transform.transform(*p))}, 'properties': {
            'id': f'pdf-symbol:{stem}:{d["index"]}', 'kind': 'sentido', 'nombre': 'Sentido indicado en el plano', 'status': 'documental',
            'routeCode': route, 'source': source, 'ref': f'pdf-vector:{d["index"]}', 'layer': 'PDF · símbolo de sentido',
            'note': note, 'approval': 'Vigencia operativa pendiente de validación municipal',
            'association': f'Símbolo del plano de la ruta, a {gap:.1f} m de su trazo. No asignación operativa.',
            'candidates': [{'codigo': route, 'distanceM': round(gap, 2)}], 'sourceCrs': 'EPSG:32717',
            'originalGeometry': {'type': 'Point', 'coordinates': p}, 'bearing': angle, 'legendRef': approval_ref,
            'tipUtm': t, 'baseUtm': b}})
        found += 1
    return found

def triangle_apex(pts):
    # Same rule as the CAD arrows: short side -> opposite vertex, with a clearly shorter base.
    if len(pts) != 3: return None
    sides = sorted((math.dist(pts[i], pts[(i+1)%3]), i) for i in range(3))
    if sides[1][0] < sides[0][0]*1.25: return None
    i = sides[0][1]
    return [(pts[i][j]+pts[(i+1)%3][j])/2 for j in (0, 1)], pts[(i+2)%3], [sum(q[j] for q in pts)/3 for j in (0, 1)]

def dart_apex(pts):
    # Four-vertex arrowhead: one isolated apex and three vertices clustered at the other end.
    if len(pts) != 4: return None
    center = [sum(q[j] for q in pts)/4 for j in (0, 1)]
    best = None
    for k in range(4):
        rest = [pts[i] for i in range(4) if i != k]
        mid = [sum(q[j] for q in rest)/3 for j in (0, 1)]
        far = math.dist(pts[k], mid)
        if best is None or far > best[0]: best = (far, k, mid)
    far, k, mid = best
    spread = max(math.dist(q, mid) for i, q in enumerate(pts) if i != k)
    if far < 1.5*spread: return None
    return mid, pts[k], center

COMMERCIAL = 'RUTA DE RECICLAJE  COMERCIAL-A0'
n_commercial = pdf_arrows(COMMERCIAL, COMMERCIAL+'.pdf', lambda d: d.get('fill') and [round(c, 3) for c in d['fill']] == [0.075, 0.404, 0.204],
    'MUN-COMERCIAL', triangle_apex,
    note='Triángulo relleno del plano comercial, situado con el registro PDF→CAD (comprobación RMS 0,059 m). Orientación de la base corta hacia la punta.',
    approval_ref='PDF comercial (sin leyenda de flecha)')
A0 = 'RUTA DE RECICLAJE-A0'
n_a0 = pdf_arrows(A0, A0+'.pdf', lambda d: d.get('fill') and rgb(d['fill']) == (100, 33, 101),
    'MUN-2001', triangle_apex,
    note='Triángulo morado oscuro del plano A0 de reciclaje sobre el trazo de la ruta 2001, situado con el registro PDF→CAD (RMS 0,063 m). No figura como bloque en el modelo del DWG. Orientación de la base corta hacia la punta.',
    approval_ref='PDF A0 (sin leyenda de flecha)')
INSTITUTIONAL = 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS-RUTA INSTITUCIONAL'
n_institutional = pdf_arrows(INSTITUTIONAL, INSTITUTIONAL+'.pdf', lambda d: d['type'] == 'fs' and rgb(d.get('color')) == (19, 103, 52),
    'MUN-INSTITUCIONAL', dart_apex, shift=(TOMAQUE_SHIFT['dE'], TOMAQUE_SHIFT['dN']), GAP_LIMIT=6, report_unreadable=True,
    note='Punta de flecha verde oscuro del plano institucional, registrada contra el CAD de Tomaque y trasladada con el CRS adoptado (+3,589 m E, +2,352 m N). Sentido hacia el vértice aislado.',
    approval_ref='PDF institucional (47 de 47 apuntan en el sentido de dibujo de su trazo)')
print('PDF arrows', {'comercial': n_commercial, 'A0 → 2001': n_a0, 'institucional': n_institutional})

# Coverage swatches are not coverage polygons. Inventory ALL cached DWGs without
# assigning other hatch colors to an area by guesswork.
coverage=[]
for cache in (ROOT/'data/cad/extracted').glob('*.dwg.dxf.entities.jsonl.gz'):
    for line in gzip.open(cache,'rt',encoding='utf8'):
        e=json.loads(line)
        if e['type']=='HATCH_BOUNDARY' and e['layer']=='textura 1' and e['color'] in [241,61,9]:
            p=center(e)
            coverage.append({'source':cache.name.split('.dxf')[0],'ref':e['ref'],'color':e['color'],'position':p,'territorialCandidate':territory(p),'routeLegend':{241:'2001',61:'1001',9:'2002'}[e['color']]})
            if territory(p):
                features.append({'type':'Feature','geometry':{'type':'Polygon','coordinates':[[list(transform.transform(*v)) for v in ring] for ring in e['geometry']['coordinates']]},'properties':{'id':cache.name+':'+e['ref'],'kind':'zona','nombre':'Relleno CAD · cobertura sin confirmar','source':cache.name.split('.dxf')[0],'ref':e['ref'],'layer':e['layer'],'status':'revision','routeCode':'','legendCandidate':{241:'2001',61:'1001',9:'2002'}[e['color']],'note':'Coincidencia de color con muestra de área en leyenda. No confirma cobertura: límites HATCH separados, huecos y semántica pendientes. No se unen ni rellenan.','originalGeometry':e['geometry'],'approval':'Pendiente de validación municipal'}})
out={'type':'FeatureCollection','features':features,'audit':{'source':SOURCE,'cacheSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'counts':dict(Counter(f['properties']['kind'] for f in features)),'excluded':excluded,'coverageSamples':coverage,'coverageStatus':'No se publican límites: muestras de leyenda no acreditan cobertura territorial. No se generan buffers ni envolventes.','route1007':'Solo referencia de leyenda; sin recorrido asignado','approval':'Interpretación documental; vigencia operativa no aprobada'}}
(ROOT/'database/municipal/cartography.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(ROOT/'data/cad/extracted/cartography-audit.json').write_text(json.dumps(out['audit'],ensure_ascii=False,indent=2),encoding='utf8')
print(out['audit']['counts']); print('excluded',len(excluded),'coverage candidates',sum(c['territorialCandidate'] for c in coverage))
