"""Build a reproducible municipal GIS package without altering source drawings.

Extraction rules below are specific to the inspected delivery. CAD entities,
legends, alternative versions and uncertain CRS are retained in staging.
No street snapping, invented schedule or ownership inference is performed.
"""
from register_pdf import ROOT, OUT, SOURCE_DIR, records
from collections import Counter
from pathlib import Path
import gzip, hashlib, json, math, re, uuid
import numpy as np
import pymupdf
from pyproj import Transformer

DEST=ROOT/'database/municipal'
DEST.mkdir(parents=True,exist_ok=True)
GIS=ROOT/'data/cad/gis'
GIS.mkdir(parents=True,exist_ok=True)
transform=Transformer.from_crs(32717,4326,always_xy=True)
NAMESPACE=uuid.UUID('720c279a-c06d-4b5b-bffc-1480db2f9349')
# Adopted on 16 Oct 2026: the Tomaque drawing matches the EPSG:32717 CAD after a
# uniform translation measured by deep_derive.py (docs/dwg-segunda-pasada.md).
TOMAQUE_ALIGNMENT=GIS/'segunda-pasada/tomaque-alineacion.json'

def uid(key):return str(uuid.uuid5(NAMESPACE,key))
def encode(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'),allow_nan=False)
def digest(v):return hashlib.sha256(encode(v).encode()).hexdigest()
def coords(g):
    if not g:return []
    if g['type']=='Point':return [g['coordinates']]
    if g['type']=='Polygon':return [p for ring in g['coordinates'] for p in ring]
    return g['coordinates']
def local(g):
    pp=coords(g)
    return bool(pp) and all(769000<=x<=780000 and 9368000<=y<=9380000 for x,y in pp)
def geographic(g):
    def go(v):
        if isinstance(v[0],(int,float)):return [round(a,8) for a in transform.transform(*v[:2])]
        return [go(a) for a in v]
    return {'type':g['type'],'coordinates':go(g['coordinates'])}
def canonical(g):
    def rounded(x):return [rounded(a) for a in x] if isinstance(x,list) else round(x,4)
    c=rounded(g['coordinates'])
    if g['type']=='LineString':c=min(c,list(reversed(c)))
    return {'type':g['type'],'coordinates':c}
def line(r):return r['geometry']['coordinates']
def city_route(r):
    return (not r['hidden'] and r['geometry'] and r['geometry']['type']=='LineString'
            and r['type'] in ('LINE','LWPOLYLINE','SPLINE') and r['length']>1
            and all(771300<x<775000 and 9374300<y<9379000 for x,y in line(r)))

def run():
    inventory=json.loads((OUT/'source-inventory.json').read_text(encoding='utf8'))
    for s in inventory:
        assert hashlib.sha256((SOURCE_DIR/s['name']).read_bytes()).hexdigest()==s['sha256'],f"Source changed: {s['name']}"
    source_map={s['name']:s for s in inventory}
    all_records={s['name']:list(records(s['name'])) for s in inventory if s['name'].lower().endswith(('.dwg','.bak'))}
    services=[{'id':uid('servicio-reciclaje'),'nombre':'Reciclaje · planos municipales','color':'#397c58'},
              {'id':uid('servicio-organico'),'nombre':'Orgánicos · identificación provisional','color':'#bc7934'},
              {'id':uid('servicio-revision'),'nombre':'Servicio por confirmar · CAD','color':'#77848c'}]
    routes=[]
    def add_route(code,name,source,color,segments,refs,status,note,service=0,extra=None):
        # Exact duplicates only. Partial overlap may describe repeated passages and is preserved.
        seen=set(); unique=[]
        for segment in segments:
            key=digest(canonical({'type':'LineString','coordinates':segment}))
            if key not in seen:seen.add(key);unique.append(segment)
        if not unique:return
        meta={'source':source,'sha256':source_map[source]['sha256'],'status':status,'note':note,
              'sourceCrs':'EPSG:32717','scheduleStatus':'Sin horario ni frecuencia operativos validados',
              'directionStatus':'Sentido no inferido del orden de vértices; consultar simbología original',
              'references':refs,'segments':len(unique),'removedExactDuplicates':len(segments)-len(unique),
              'lengthMeaning':'Suma de trazos; puede incluir calles recorridas más de una vez',**(extra or {})}
        g={'type':'MultiLineString','coordinates':unique}
        geom={'type':'MultiLineString','coordinates':[geographic({'type':'LineString','coordinates':s})['coordinates'] for s in unique]}
        routes.append({'id':uid('ruta-'+code),'codigo':code,'nombre':name,'servicioId':services[service]['id'],
                       'color':color,'geometry':geom,'originalGeometry':g,'metadata':meta})
    timed=all_records['RUTAS CON TIEMPO.dwg']
    rules=[('MUN-1001','Ruta 1001','#2457d6',lambda r:r['attributes'].get('true_color')==656564 and r['layer'] in ('PERIMETRO-SECTOR I','ZANORA')),
           ('MUN-2001','Ruta 2001','#b82c9a',lambda r:r['attributes'].get('true_color')==9643919 and r['layer'] in ('SECT. CESAR VALLEJO','SECT. LA PRIMAVERA')),
           ('MUN-2002','Ruta 2002','#e87925',lambda r:r['layer']=='SECT. INCA KOLA' and (r['color']==1 or r['attributes'].get('true_color') in (10033950,14708736)) and r['attributes'].get('const_width')==1.5)]
    for code,name,color,predicate in rules:
        chosen=[r for r in timed if city_route(r) and predicate(r)]
        add_route(code,name,'RUTAS CON TIEMPO.dwg',color,[line(r) for r in chosen],[r['ref'] for r in chosen],'georreferenciada',
                  'Identificación por leyenda y color, contrastada con el PDF de reciclaje. CRS explícito en GEODATA. Trazado documental; operación pendiente de validación.')
    chosen=[r for r in all_records['RUTA ORGANICO.dwg'] if city_route(r) and r['layer']=='SECT. INCA KOLA' and r['color']==5 and r['attributes'].get('const_width')==1.5]
    add_route('MUN-ORGANICA','Ruta orgánica · por confirmar','RUTA ORGANICO.dwg','#bd7934',[line(r) for r in chosen],[r['ref'] for r in chosen],'revision',
              'CRS explícito en GEODATA. Servicio deducido del nombre del archivo; el plano conserva rótulos heredados. Requiere confirmar clasificación.',1)
    chosen=[r for r in timed if city_route(r) and r['attributes'].get('true_color')==502697 and r['layer']=='SECT. LA PRIMAVERA']
    add_route('CAD-PRIMAVERA','La Primavera · trazo CAD','RUTAS CON TIEMPO.dwg','#079d99',[line(r) for r in chosen],[r['ref'] for r in chosen],'revision',
              'Trazo cian y leyenda La Primavera presentes. Servicio y vigencia por confirmar; CRS explícito.',2)
    chosen=[r for r in timed if not r['hidden'] and r['layer']=='RUTAS' and r['type']=='LWPOLYLINE' and r['color']==5 and local(r['geometry'])]
    add_route('CAD-RUTAS','Capa RUTAS · identificación pendiente','RUTAS CON TIEMPO.dwg','#6277a6',
              [r['geometry']['coordinates'][0] if r['geometry']['type']=='Polygon' else line(r) for r in chosen],
              [r['ref'] for r in chosen],'revision','Existen rótulos RUTA 1007, pero no una asociación inequívoca a todos estos trazos. No se asigna ese código automáticamente.',2)
    pdf_routes=[]
    for source in [s['name'] for s in inventory if s['name'].endswith('.pdf')]:
        doc=pymupdf.open(SOURCE_DIR/source); page=doc[0]; drawings=page.get_drawings()
        # Preserve every PDF path in native page coordinates, including non-geographic title blocks.
        with gzip.open(OUT/(Path(source).stem+'-vectors.jsonl.gz'),'wt',encoding='utf8') as f:
            for i,p in enumerate(drawings):
                f.write(json.dumps({'index':i,**p},default=lambda x:list(x),ensure_ascii=False)+'\n')
        images=[]; image_dir=OUT/'images';image_dir.mkdir(exist_ok=True)
        for image in page.get_images(full=True):
            content=doc.extract_image(image[0]); sha=hashlib.sha256(content['image']).hexdigest()
            target=image_dir/(sha+'.'+content['ext'])
            if not target.exists():target.write_bytes(content['image'])
            images.append({'xref':image[0],'sha256':sha,'file':target.name,'width':content['width'],'height':content['height']})
        (OUT/(Path(source).stem+'-images.json')).write_text(encode(images),encoding='utf8')
        if source not in ('RUTA DE RECICLAJE  COMERCIAL-A0.pdf','RUTA TOMAQUE - BRUJO PATA - CASUARINAS-RUTA INSTITUCIONAL.pdf'):continue
        registration=json.loads((OUT/(Path(source).stem+'-georeference.json')).read_text(encoding='utf8'))
        segments=[]; refs=[]; qa=[]
        institutional='INSTITUCIONAL' in source
        shift=[0.0,0.0]
        if institutional:
            alignment=json.loads(TOMAQUE_ALIGNMENT.read_text(encoding='utf8'))
            shift=[alignment['translation_m']['dE'],alignment['translation_m']['dN']]
        for vp in registration['viewports']:
            if vp['status']!='registered-to-cad':continue
            x0,y0,x1,y1=vp['box']; m=np.array(vp['matrix'])
            qa.append({k:v for k,v in vp['qa'].items() if k!='holdout_controls'})
            for i,d in enumerate(drawings):
                if tuple(round(v*255) for v in (d['color'] or []))!=(19,155,72) or d['type']!='s':continue
                pts=[]
                for item in d['items']:
                    if item[0]!='l':raise ValueError('Unexpected curve in reviewed PDF route')
                    p,q=item[1:]; midpoint=(p+q)/2
                    if not (x0<=midpoint.x<=x1 and y0<=midpoint.y<=y1):continue
                    # Registered to Tomaque CAD coordinates, then moved by the adopted translation.
                    start=((np.array([p.x,p.y,1])@m)+shift).tolist(); end=((np.array([q.x,q.y,1])@m)+shift).tolist()
                    if pts and math.dist(pts[-1],start)>0.01:segments.append(pts);pts=[]
                    if not pts:pts=[start]
                    pts.append(end)
                if len(pts)>1:segments.append(pts);refs.append(f'PDF page 1 / path {i} / viewport {vp["box"]}')
        extra={'method':'PDF vectorial registrado contra vértices CAD, transformación de semejanza sin deformación',
               'registration':qa,
               'crsEvidence':(f'EPSG:32717 adoptado el 16/10/2026: el CAD de Tomaque se traslada +{shift[0]} m E, +{shift[1]} m N '
                              f'para coincidir con RUTAS CON TIEMPO.dwg ({alignment["vertices_within_5cm"]} vértices a menos de 5 cm, '
                              f'RMS {alignment["rms_within_5cm_m"]*100:.1f} cm). Los cajetines rotulan PSAD56, incompatible con esa traslación.')
                             if institutional else 'EPSG:32717 explícito en GEODATA del CAD de referencia',
               **({'tomaqueTranslation':{'dE':shift[0],'dN':shift[1],'source':'data/cad/gis/segunda-pasada/tomaque-alineacion.json'}} if institutional else {}),
               'coverage':'Fragmentos de cuatro ventanas; no se inventan conexiones entre ellas' if institutional else 'Tres trazos vectoriales del plano comercial',
               'warnings':['El cuadro institucional muestra 11:08 am–10:58 am para I.E. Agropecuario TRM y otras discrepancias con el mapa. No se usa como horario operativo.'] if institutional else []}
        add_route('MUN-INSTITUCIONAL' if institutional else 'MUN-COMERCIAL','Ruta Tomaque – Brujo Pata – Casuarinas' if institutional else 'Ruta comercial',
                  source,'#137e48' if institutional else '#199b48',segments,refs,'georreferenciada',
                  'Ruta institucional de reciclaje del plano de Tomaque. Registro geométrico comprobado contra su CAD y trasladado con el CRS adoptado para Tomaque. Fragmentos de cuatro ventanas; operación pendiente de validación.' if institutional else
                  'Extraída del PDF vectorial y registrada contra el DWG con CRS explícito. El error de ajuste es relativo al CAD, no precisión topográfica.',0,extra)
        pdf_routes.append({'source':source,'segments':len(segments),'viewports':len(qa)})

    # Staging retains ALL expanded model entities, including no-geometry records.
    unique={}; counts=Counter(); source_hashes={}
    for name,rs in all_records.items():
        meta=json.loads((OUT/(name+'.dxf.inventory.json')).read_text(encoding='utf8'))
        crs=32717 if any(g['crs']==[32717,True] for g in meta['geodata']) else None
        source_hashes[name]=digest([{k:r[k] for k in ('type','layer','color','text','geometry')} for r in rs])
        for r in rs:
            g=r['geometry']; signature={'type':r['type'],'layer':r['layer'],'color':r['color'],'trueColor':r['attributes'].get('true_color'),'text':r['text'],'hidden':r['hidden'],'geometry':canonical(g) if g else None}
            key=digest(signature)
            reference={'source':name,'ref':r['ref'],'handle':r['handle'],'crs':crs}
            if key in unique:
                unique[key]['references'].append(reference)
                if crs:unique[key]['sourceSrid']=crs
                continue
            category='texto' if r['text'] else 'geometria_cad'
            if r['text'] and re.search(r'\d{1,2}:\d{2}|INICIO DE RUTA|FIN DE RUTA',r['text'],re.I):category='anotacion_ruta'
            if g and g['type']=='Polygon' and r['layer']=='VIVIENDA':category='lote_cad'
            if r['type']=='HATCH_BOUNDARY':category='relleno_cad'
            unique[key]={'key':key,'category':category,'layer':r['layer'],'entityType':r['type'],'text':r['text'],'color':r['color'],
                         'hidden':r['hidden'],'sourceSrid':crs,'geometry':g,'inStudyArea':local(g),
                         'references':[reference],'attributes':r['attributes']}
    with gzip.open(DEST/'cad-entities.jsonl.gz','wt',encoding='utf8') as stream:
        for r in unique.values():stream.write(encode(r)+'\n');counts[r['category']]+=1
    # Portable standard GeoJSON exports: confirmed CRS and pending interpretation stay distinct.
    for confirmed in [True,False]:
        features=[]
        for r in unique.values():
            if not r['geometry'] or not r['inStudyArea'] or bool(r['sourceSrid'])!=confirmed:continue
            features.append({'type':'Feature','id':r['key'],'geometry':geographic(r['geometry']),
                             'properties':{k:r[k] for k in ('key','category','layer','entityType','text','hidden','references')}|{'crsStatus':'explicit-in-source' if confirmed else 'EPSG:32717 hypothesis; not confirmed'}})
        with gzip.open(GIS/('cad-crs-confirmado.geojson.gz' if confirmed else 'cad-crs-hipotesis.geojson.gz'),'wt',encoding='utf8') as f:
            f.write(encode({'type':'FeatureCollection','features':features}))
    route_features=[{'type':'Feature','id':r['id'],'geometry':r['geometry'],'properties':{k:v for k,v in r.items() if k not in ('geometry','originalGeometry')}} for r in routes]
    (GIS/'rutas-municipales.geojson').write_text(encode({'type':'FeatureCollection','features':route_features}),encoding='utf8')
    manifest={'version':1,'sources':inventory,'services':services,'routes':routes,
              'cadPackageSha256':hashlib.sha256((DEST/'cad-entities.jsonl.gz').read_bytes()).hexdigest(),
              'statistics':{'expandedEntities':sum(map(len,all_records.values())),'uniqueEntities':len(unique),'categories':dict(counts),
                            'sourceSemanticHashes':source_hashes,'pdfRoutes':pdf_routes},
              'notice':'Entrega documental municipal; no constituye catastro legal ni operación validada. Predios DEMO se conservan separados.'}
    (DEST/'manifest.json').write_text(encode(manifest),encoding='utf8')
    print(json.dumps({'routes':[(r['codigo'],r['metadata']['segments'],r['metadata']['status']) for r in routes],**manifest['statistics']},ensure_ascii=False,indent=2))

if __name__=='__main__':run()
