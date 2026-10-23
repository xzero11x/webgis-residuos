"""Register known map viewports against CAD vertices, retaining QA controls.

This measures correspondence to the supplied drawing, NOT ground survey accuracy.
Viewports are configured for these three supplied plans; new plans need review.
"""
from register_pdf import *
from collections import defaultdict
import math

def xy(g):
    if not g or g['type']=='Point': return []
    return g['coordinates'][0] if g['type']=='Polygon' else g['coordinates']

def similarity(x,y):
    xc=x-x.mean(axis=0);yc=y-y.mean(axis=0)
    # Reflection of PDF's downward Y is part of the page-to-ground transform.
    design=np.zeros((len(x)*2,2)); rhs=yc.reshape(-1)
    design[::2]=xc; design[1::2]=np.c_[-xc[:,1],xc[:,0]]
    a,b=np.linalg.lstsq(design,rhs,rcond=None)[0]
    linear=np.array([[a,b],[b,-a]])
    return np.vstack([linear,y.mean(axis=0)-x.mean(axis=0)@linear])

def refine(pdf_points,cad_points,m):
    grid=defaultdict(list);cell=5
    for p in cad_points:grid[tuple(np.floor(p/cell).astype(int))].append(p)
    grid={k:np.array(v) for k,v in grid.items()}
    # Fixed split: held-out vertices do not participate in parameter fitting.
    sample=pdf_points[::max(1,len(pdf_points)//7000)]
    train=sample[np.arange(len(sample))%5!=0]; hold=sample[np.arange(len(sample))%5==0]
    def match(points,m,radius):
        world=np.c_[points,np.ones(len(points))]@m
        px=[];qx=[];errs=[]
        for p,w in zip(points,world):
            cx,cy=np.floor(w/cell).astype(int)
            near=[grid[(cx+dx,cy+dy)] for dx in [-1,0,1] for dy in [-1,0,1] if (cx+dx,cy+dy) in grid]
            if not near:continue
            values=np.concatenate(near);ds=np.linalg.norm(values-w,axis=1);j=np.argmin(ds)
            if ds[j]<radius:px.append(p);qx.append(values[j]);errs.append(ds[j])
        return np.array(px),np.array(qx),np.array(errs)
    history=[]
    for limit in [5,4,3,2,1,0.7,0.4,0.25]:
        p,q,e=match(train,m,limit)
        if len(p)<20:break
        m=similarity(p,q)
        history.append({'threshold_m':limit,'controls':len(p),'rms_m':float(np.sqrt(np.mean(e**2)))})
    p,q,e=match(hold,m,0.4)
    return m,{'history':history,'holdout_candidates':len(hold),'holdout_matches':len(p),'holdout_rms_m':float(np.sqrt(np.mean(e**2))) if len(e) else None,'holdout_controls':[{'pdf':a.tolist(),'cad':b.tolist(),'residual_m':float(c)} for a,b,c in zip(p,q,e)]}

def run():
    for pdf in sorted(SOURCE_DIR.glob('*.pdf')):
        institutional='INSTITUCIONAL' in pdf.name
        cad_name='RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg' if institutional else 'RUTAS CON TIEMPO.dwg'
        rs=list(records(cad_name)); cad=defaultdict(set)
        for r in rs:
            if r['text'] and r['geometry']:
                key=norm(r['text']);x,y=r['geometry']['coordinates']
                if len(key)>7 and 769000<x<780000 and 9368000<y<9380000:cad[key].add((x,y))
        # Generic repeated labels are not unique controls.
        cad={k:v for k,v in cad.items() if len(v)<=3 and k not in ('OTROS FINES','COMERCIO','VIVIENDA','INICIO DE RUTA','FIN DE RUTA') and not k.startswith('RUTA ')}
        page=pymupdf.open(pdf)[0];pairs=controls(page,cad);draws=page.get_drawings()
        boxes=[(40,70,396,424),(396,70,751,424),(40,424,396,779),(396,424,751,779)] if institutional else [(300,0,2384,2700)]
        cad_pts=np.array(list({tuple(p) for r in rs if not r['hidden'] and (institutional or r['layer']=='VIVIENDA') for p in xy(r['geometry']) if 769000<p[0]<780000 and 9368000<p[1]<9380000}))
        results=[]
        for box in boxes:
            x0,y0,x1,y1=box
            fit_pairs=[p for p in pairs if x0<=p[1][0]<x1 and y0<=p[1][1]<y1]
            guess=fit(fit_pairs,tolerance=6,iterations=22000)
            if 'COMERCIAL' in pdf.name:
                guess=json.loads((OUT/(pdf.stem+'-registration.json')).read_text(encoding='utf8'))['viewports'][0]
            if not guess or guess['text_controls']<5:
                results.append({'box':box,'status':'unresolved','candidate_controls':len(fit_pairs)}); continue
            guess.pop('remaining',None); m=np.array(guess['matrix'])
            points=set()
            for d in draws:
                color=tuple(round(c*255) for c in (d['color'] or []))
                if color!=((0,0,0) if institutional else (147,149,152)):continue
                for item in d['items']:
                    if item[0]!='l':continue
                    for p in item[1:]:
                        if x0<p.x<x1 and y0<p.y<y1:points.add((p.x,p.y))
            m,qa=refine(np.array(sorted(points)),cad_pts,m)
            confirmed=qa['holdout_matches']>=30 and qa['holdout_rms_m']<0.2
            results.append({'box':box,'status':'registered-to-cad' if confirmed else 'needs-review','matrix':m.tolist(),'initial_text_fit':guess,'qa':qa})
            print(pdf.name,box,guess['text_controls'],qa['holdout_matches'],qa['holdout_rms_m'],confirmed,flush=True)
        (OUT/(pdf.stem+'-georeference.json')).write_text(json.dumps({'source':pdf.name,'cad_reference':cad_name,'coordinate_system':'EPSG:32717','crs_evidence':'embedded GEODATA' if not institutional else 'inferred; CAD has no CRS definition; requires municipal verification','viewports':results},ensure_ascii=False,indent=2),encoding='utf8')

if __name__=='__main__':run()
