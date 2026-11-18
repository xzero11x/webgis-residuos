"""Instala el núcleo desde cero en una BD QA nueva, sin reset ni borrado."""
import datetime
import json
from pathlib import Path
import secrets
import subprocess
import uuid


def run(args, payload=None):
    return subprocess.run(args, input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout


target = "bagua_qa_clean_" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6]
assert target.startswith("bagua_qa_clean_") and all(c.isalnum() or c == "_" for c in target)
guard = "import {pool} from './backend/dist/db/pool.js';import {env} from './backend/dist/config/env.js';import {assertFixtureTarget} from './backend/dist/db/fixture-target.js';try{await assertFixtureTarget(pool,env)}finally{await pool.end()}"
run(["docker", "compose", "exec", "-T", "backend", "node", "--input-type=module", "-e", guard])
run(["docker", "compose", "exec", "-T", "database", "sh", "-c", 'createdb -U "$POSTGRES_USER" -T template0 "$1" && psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "CREATE EXTENSION postgis"', "clean-test", target])
base = ["docker", "compose", "exec", "-T", "-e", "PGDATABASE=" + target, "-e", "BAGUA_FIXTURE_DATABASE=" + target, "-e", "BAGUA_DEPLOYMENT=test", "backend", "node"]
run(base + ["backend/dist/db/manage.js", "migrate"])
credentials = {"usuario": "qa-admin", "nombre": "PERSONA FICTICIA QA", "rol": "administrador", "password": secrets.token_urlsafe(32)}
initial = {key: value for key, value in credentials.items() if key != "rol"}
initial["baseConfirmada"] = target
bootstrap_base = ["docker", "compose", "exec", "-T", "-e", "PGDATABASE=" + target,
                  "-e", "BAGUA_FIXTURE_DATABASE=", "-e", "BAGUA_DEPLOYMENT=production", "backend", "node"]
run(bootstrap_base + ["backend/dist/db/bootstrap-admin.js"], json.dumps(initial).encode())
repeated = subprocess.run(bootstrap_base + ["backend/dist/db/bootstrap-admin.js"],
                          input=json.dumps(initial).encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if repeated.returncode == 0 or b"BOOTSTRAP_ALREADY_INITIALIZED" not in repeated.stderr:
    raise RuntimeError("El bootstrap no protegió las cuentas existentes.")
for _ in range(2):
    run(base + ["backend/dist/db/gestion-seed.js"])
harness = r"""
import express from 'express';
import {pool} from './backend/dist/db/pool.js';
import {createGestionRouter} from './backend/dist/modules/gestion/gestion.routes.js';
import {errorHandler} from './backend/dist/middleware/error-handler.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
const credentials=JSON.parse(input);
const count=(await pool.query('SELECT count(*)::int AS total FROM gestion.predio')).rows[0].total;
if(count!==8)throw Error('El seed repetido no es idempotente.');
function app(){const a=express();a.use(express.json());a.use('/api/gestion',createGestionRouter(pool));a.use(errorHandler);return a;}
async function start(){const server=app().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));return {server,url:`http://127.0.0.1:${server.address().port}/api/gestion`};}
let service=await start();
const response=await fetch(service.url+'/sesion',{method:'POST',headers:{'Content-Type':'application/json','X-Bagua-Request':'1'},body:JSON.stringify({usuario:credentials.usuario,password:credentials.password})});
if(response.status!==200)throw Error('Login QA falló.');
const cookie=response.headers.getSetCookie()[0].split(';')[0];
const saved=await fetch(service.url+'/predios',{method:'POST',headers:{'Content-Type':'application/json','X-Bagua-Request':'1',Cookie:cookie},body:JSON.stringify({codigo:'TEST-CLEAN-API',direccion:'Dirección ficticia de ensayo limpio'})});
if(saved.status!==201)throw Error('Alta API QA falló.');
const record=await saved.json();
await new Promise(resolve=>service.server.close(resolve));
service=await start();
const detail=await fetch(service.url+'/predios/'+record.id,{headers:{Cookie:cookie}});
if(detail.status!==200||(await detail.json()).predio.codigo!=='TEST-CLEAN-API')throw Error('No persistió tras reiniciar API.');
await new Promise(resolve=>service.server.close(resolve));
const migrations=(await pool.query('SELECT count(*)::int AS total FROM schema_migrations')).rows[0].total;
console.log(JSON.stringify({migraciones:migrations,seedRepetido:true,login:true,altaPersistenteTrasReinicioAPI:true}));
await pool.end();
"""
result = json.loads(run(base + ["--input-type=module", "-e", harness], json.dumps(credentials).encode()))
result["destino_qa"] = target
result["conservada_sin_borrar"] = True
result["bootstrap_sin_fixtures_en_qa"] = True
result["bootstrap_repetido_rechazado"] = True
directory = Path("artifacts/clean-install")
directory.mkdir(parents=True, exist_ok=True)
(directory / (target + ".json")).write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result))
