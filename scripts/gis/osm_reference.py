"""Download a bounded OSM street reference for QA, preserving attribution.

Never used to snap or replace municipal geometry. Delete the local reference
file explicitly to request a fresh snapshot; normal runs reuse the saved file.
"""
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import json

ROOT=Path(__file__).resolve().parents[2]
target=ROOT/'data/cad/extracted/bagua-osm-reference.osm'
url='https://api.openstreetmap.org/api/0.6/map?bbox=-78.56,-5.665,-78.51,-5.615'
if not target.exists():
    request=urllib.request.Request(url,headers={'User-Agent':'Bagua-WebGIS-local-validation/0.1'})
    with urllib.request.urlopen(request,timeout=60) as response:target.write_bytes(response.read())
root=ET.parse(target).getroot()
nodes={e.attrib['id']:[float(e.attrib['lon']),float(e.attrib['lat'])] for e in root.findall('node')}
features=[]
for way in root.findall('way'):
    tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
    if tags.get('highway') not in ('residential','tertiary','primary','secondary','unclassified','service','living_street','trunk','road'):continue
    points=[nodes[n.attrib['ref']] for n in way.findall('nd') if n.attrib['ref'] in nodes]
    if len(points)>1:features.append({'type':'Feature','geometry':{'type':'LineString','coordinates':points},'properties':{'osmId':way.attrib['id'],**tags}})
(ROOT/'database/municipal/osm-reference.json').write_text(json.dumps({'source':url,'attribution':'OpenStreetMap contributors; ODbL','timestamp':root.find('meta').attrib if root.find('meta') is not None else {},'features':features}),encoding='utf8')
print(f'{len(features)} segmentos viales de referencia OSM.')
