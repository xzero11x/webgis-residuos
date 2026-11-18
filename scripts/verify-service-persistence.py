"""Comprueba lecturas administrativas antes/después de reiniciar el backend local."""
import http.cookiejar
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.request


def run(args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


guard = "import {pool} from './backend/dist/db/pool.js';import {env} from './backend/dist/config/env.js';import {assertFixtureTarget} from './backend/dist/db/fixture-target.js';try{await assertFixtureTarget(pool,env)}finally{await pool.end()}"
run(['docker', 'compose', 'exec', '-T', 'backend', 'node', '--input-type=module', '-e', guard])
sql = "SELECT json_build_object('predio_id',predio_id,'unidad_id',NULL::uuid) FROM gestion.vinculo_espacial UNION ALL SELECT json_build_object('predio_id',u.predio_id,'unidad_id',u.id) FROM gestion.relacion_unidad r JOIN gestion.unidad u ON u.id=r.unidad_id"
# Only IDs are read; never copy credentials or PII to artifacts.
raw = run(['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c', 'psql -X -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"', 'verify', sql])
rows = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
if not rows:
    raise RuntimeError('No hay escenarios de revisión espacial/unidades para verificar.')
text = Path('artifacts/accesos-locales/admin-bagua.txt').read_text(encoding='utf-8')
credentials = {'usuario': re.search(r'^Usuario: (.+)$', text, re.M)[1], 'password': re.search(r'^Contraseña: (.+)$', text, re.M)[1]}
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
base = 'http://127.0.0.1:8080/api/gestion'
request = urllib.request.Request(base + '/sesion', data=json.dumps(credentials).encode(), headers={'Content-Type': 'application/json', 'X-Bagua-Request': '1'})
with opener.open(request) as response:
    json.load(response)
paths = set()
for row in rows:
    parent = '/predios/' + row['predio_id']
    paths.update([parent, parent + '/espacial', parent + '/unidades'])
    if row['unidad_id']:
        paths.add(parent + '/unidades/' + row['unidad_id'] + '/relaciones')


def snapshot():
    result = {}
    for path in sorted(paths):
        with opener.open(base + path) as response:
            result[path] = json.load(response)
    return result


before = snapshot()
run(['docker', 'compose', 'restart', 'backend'])
for attempt in range(60):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8080/api/ready', timeout=2) as response:
            if response.status == 200:
                break
    except (OSError, ValueError):
        pass
    time.sleep(1)
else:
    raise RuntimeError('Backend no disponible después del reinicio.')
after = snapshot()
if before != after:
    raise RuntimeError('Las lecturas difieren después del reinicio.')
print(json.dumps({'reinicio_backend': 'aprobado', 'consultas_iguales': len(paths), 'sesion_persistente': True, 'escrituras_de_dominio': 0}))
