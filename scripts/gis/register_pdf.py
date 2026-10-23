"""Recover PDF viewport transforms from matching CAD text; report residuals.

Text anchors are only initial control candidates. They are not survey controls.
PDF coordinates are unrotated PyMuPDF page coordinates throughout this pipeline.
"""
from pathlib import Path
from sources import SOURCE_DIR
from collections import defaultdict, Counter
import gzip
import json
import re
import unicodedata
import numpy as np
import pymupdf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/cad/extracted'

def records(name):
    with gzip.open(OUT / (name + '.dxf.entities.jsonl.gz'), 'rt', encoding='utf8') as f:
        yield from map(json.loads, f)

def norm(s):
    return re.sub(r'\s+', ' ', ''.join(c for c in unicodedata.normalize('NFKD', s.upper()) if not unicodedata.combining(c))).replace('"','').strip()

def controls(page, cad):
    pairs = []
    seen = set()
    for block in page.get_text('dict')['blocks']:
        lines = [l for l in block.get('lines', []) if l.get('spans')]
        candidates = [(' '.join(s['text'] for l in lines for s in l['spans']), lines[0]['spans'][0]['origin'])] if lines else []
        candidates += [(' '.join(s['text'] for s in l['spans']), l['spans'][0]['origin']) for l in lines]
        for text, p in candidates:
            key = norm(text)
            if key not in cad: continue
            for q in cad[key]:
                item = (key, tuple(p), tuple(q))
                if item not in seen:
                    seen.add(item)
                    pairs.append(item)
    return pairs

def fit(pairs, tolerance=12, iterations=18000):
    if len(pairs)<4: return None
    a = np.array([[*p,1] for _,p,_ in pairs])
    b = np.array([q for _,_,q in pairs])
    rng = np.random.default_rng(42)
    best = np.zeros(len(pairs), dtype=bool)
    for _ in range(iterations):
        ix = rng.choice(len(pairs), 2, replace=False)
        dx = a[ix[1],:2] - a[ix[0],:2]
        dy = b[ix[1]] - b[ix[0]]
        if np.linalg.norm(dx)<30: continue
        aa,bb = np.linalg.solve([[dx[0],dx[1]],[-dx[1],dx[0]]],dy)
        linear=np.array([[aa,bb],[bb,-aa]])
        scale=np.hypot(aa,bb)
        if scale<0.03 or scale>100:continue
        m=np.vstack([linear,b[ix[0]]-a[ix[0],:2]@linear])
        inside = np.linalg.norm(a@m-b,axis=1)<tolerance
        if inside.sum()>best.sum(): best=inside
    if best.sum()<4:return None
    # Fit a similarity (rotation + uniform scale + translation), not a rubber sheet.
    x=a[best,:2]; y=b[best]; xc=x-x.mean(axis=0); yc=y-y.mean(axis=0)
    u,s,v=np.linalg.svd(xc.T@yc)
    r=u@v
    scale=s.sum()/(xc**2).sum()
    m=np.vstack([scale*r, y.mean(axis=0)-x.mean(axis=0)@ (scale*r)])
    errors=np.linalg.norm(a@m-b,axis=1)
    inside=errors<tolerance
    return {'matrix':m.tolist(),'text_controls':sum(inside).item(),'rms_m':float(np.sqrt(np.mean(errors[inside]**2))), 'matches':[{'text':pairs[i][0],'pdf':pairs[i][1],'utm':pairs[i][2],'residual_m':float(errors[i])} for i in np.flatnonzero(inside)],'remaining':[p for i,p in enumerate(pairs) if not inside[i]]}

def run():
    cad=defaultdict(set)
    for name in ['RUTAS CON TIEMPO.dwg','RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg']:
        for r in records(name):
            if not r['text'] or not r['geometry']:continue
            text=norm(r['text']); x,y=r['geometry']['coordinates']
            if len(text)>7 and 769000<x<780000 and 9368000<y<9380000:
                cad[text].add((round(x,3),round(y,3)))
    for pdf in sorted(SOURCE_DIR.glob('*.pdf')):
        doc=pymupdf.open(pdf); page=doc[0]
        pairs=controls(page,cad); all_count=len(pairs); fits=[]
        for _ in range(5):
            fit_result=fit(pairs)
            if not fit_result or fit_result['text_controls']<5:break
            pairs=fit_result.pop('remaining'); fits.append(fit_result)
        result={'source':pdf.name,'page_rotation':page.rotation,'candidate_matches':all_count,'viewports':fits,'status':'text-anchor-registration-needs-geometry-check'}
        (OUT/(pdf.stem+'-registration.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
        colors=Counter((tuple(round(c*255) for c in (p['color'] or [])),p['type'],round(p['width'] or 0,2)) for p in page.get_drawings())
        print(json.dumps({'pdf':pdf.name,'matches':all_count,'fits':[{k:v for k,v in f.items() if k!='matches'} for f in fits],'colors':colors.most_common(18)},ensure_ascii=False),flush=True)

if __name__=='__main__':run()
