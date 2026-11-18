"""Ensayo completo en un proyecto Docker nuevo; conserva y detiene su volumen QA."""
import datetime
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request
import uuid

project = 'bagua_transfer_' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S') + '_' + uuid.uuid4().hex[:6]
assert re.fullmatch(r'bagua_transfer_\d{14}_[a-f0-9]{6}', project)
directory = Path('artifacts/transferencia') / project
directory.mkdir(parents=True)


def run(args, *, env=None, data=None):
    result = subprocess.run(args, env=env, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Falló una operación del ensayo aislado; se conserva para diagnóstico.')
    return result.stdout.decode().strip()


# Las imágenes ya construidas son el artefacto del producto; no se descargan otras.
images = {name: run(['docker', 'compose', 'images', '-q', name]) for name in ['backend', 'frontend']}
if not all(re.fullmatch(r'(sha256:)?[a-f0-9]{12,64}', value) for value in images.values()):
    raise RuntimeError('Construye primero las imágenes del producto.')
override = directory / 'compose.qa.json'
override.write_text(json.dumps({'services': {name: {'image': value} for name, value in images.items()}}))
environment = dict(os.environ, COMPOSE_PROJECT_NAME=project, POSTGRES_DB='bagua_transfer', HTTP_PORT='0', BAGUA_DEPLOYMENT='test', BAGUA_FIXTURE_DATABASE='bagua_transfer')
compose = ['docker', 'compose', '-p', project, '-f', 'compose.yaml', '-f', str(override)]
run(compose + ['up', '-d', '--no-build', '--wait'], env=environment)
try:
    port = run(compose + ['port', 'nginx', '80'], env=environment).split(':')[-1]
    base = 'http://127.0.0.1:' + port
    with urllib.request.urlopen(base + '/api/ready') as response:
        assert response.status == 200
    # Copia autorizada de ensayo, validada por el restaurador y sin sustituir tablas.
    backup = json.loads(Path('artifacts/operational-backup-test.log').read_text(encoding='utf-8-sig'))['respaldo']
    restored = json.loads(run(['node', 'scripts/operational-backup.mjs', 'restore', backup], env=environment))['restaurada_en']
    assert re.fullmatch(r'bagua_restore_\d{14}_[a-f0-9]{8}', restored)
    # Solo este contenedor QA cambia de conexión; la aplicación principal conserva la suya.
    config = json.loads(override.read_text())
    config['services']['backend']['environment'] = {'PGDATABASE': restored, 'BAGUA_FIXTURE_DATABASE': restored}
    override.write_text(json.dumps(config))
    run(compose + ['up', '-d', '--no-build', '--wait'], env=environment)
    sql = "SELECT json_build_object('migraciones',(SELECT count(*) FROM schema_migrations),'edificios',(SELECT count(*) FROM bagua_master.edificio),'rutas',(SELECT count(*) FROM bagua_master.ruta),'predios',(SELECT count(*) FROM gestion.predio));"
    counts = json.loads(run(compose + ['exec', '-T', 'database', 'sh', '-c', 'psql -X -tA -U "$POSTGRES_USER" -d "$1" -c "$2"', 'verify', restored, sql], env=environment))
    assert counts['migraciones'] == 27 and counts['edificios'] == 14357 and counts['rutas'] == 7
    secret = Path('artifacts/accesos-locales/admin-bagua.txt').read_text(encoding='utf-8')
    credentials = {'usuario': re.search(r'^Usuario: (.+)$', secret, re.M)[1], 'password': re.search(r'^Contraseña: (.+)$', secret, re.M)[1]}
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    login = urllib.request.Request(base + '/api/gestion/sesion', data=json.dumps(credentials).encode(), headers={'Content-Type': 'application/json', 'X-Bagua-Request': '1'})
    with opener.open(login) as response:
        assert response.status == 200
    with opener.open(base + '/api/gestion/predios') as response:
        assert json.load(response)['total'] > 0
    browser_environment = dict(environment, PLAYWRIGHT_BASE_URL=base, PLAYWRIGHT_CHANNEL='chrome')
    browser = subprocess.run(['cmd', '/c', 'npx', 'playwright', 'test', 'tests/e2e/bagua-master.spec.ts', '--project=desktop', '--workers=1', '--output=' + str(directory / 'browser')], env=browser_environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (directory / 'browser.log').write_bytes(browser.stdout)
    assert browser.returncode == 0, 'Falló la comprobación del frontend transferido.'
    print(json.dumps({'proyecto_aislado': project, 'conteos': counts, 'login_y_padron': True, 'frontend_gis_e2e': 'aprobado', 'principal_modificada': False, 'evidencia': str(directory / 'browser.log')}))
finally:
    run(compose + ['stop'], env=environment)
