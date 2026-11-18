"""Ensayo no destructivo: crea una BD QA nueva, restaura y conserva la copia."""
import datetime
import json
from pathlib import Path
import subprocess
import uuid


def execute(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def database(command, *args, input_bytes=None):
    return execute(["docker", "compose", "exec", "-T", "database", "sh", "-c", command, "recovery", *args],
                   input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


target = "bagua_qa_restore_" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6]
directory = Path("artifacts/recovery") / target
directory.mkdir(parents=True, exist_ok=False)
# Comprueba el destino original antes de cualquier operación QA.
guard = "import {pool} from './backend/dist/db/pool.js';import {env} from './backend/dist/config/env.js';import {assertFixtureTarget} from './backend/dist/db/fixture-target.js';try{await assertFixtureTarget(pool,env)}finally{await pool.end()}"
execute(["docker", "compose", "exec", "-T", "backend", "node", "--input-type=module", "-e", guard], stdout=subprocess.PIPE)
sql = """SELECT json_build_object(
 'postgis',postgis_version(),
 'edificios',(SELECT count(*) FROM bagua_master.edificio),
 'rutas',(SELECT count(*) FROM bagua_master.ruta),
 'predios',(SELECT count(*) FROM gestion.predio),
 'personas',(SELECT count(*) FROM gestion.persona),
 'vinculos',(SELECT count(*) FROM gestion.vinculo),
 'entregas',(SELECT count(*) FROM gestion.entrega),
 'historial',(SELECT count(*) FROM gestion.historial),
 'lotes',(SELECT count(*) FROM gestion.importacion),
 'cuentas',(SELECT count(*) FROM gestion.usuario),
 'servicios',(SELECT count(*) FROM gestion.servicio),
 'materiales',(SELECT count(*) FROM gestion.material),
 'unidades',(SELECT count(*) FROM gestion.unidad),
 'vinculos_espaciales',(SELECT count(*) FROM gestion.vinculo_espacial),
 'relaciones_unidad',(SELECT count(*) FROM gestion.relacion_unidad),
 'huella_edificios',(SELECT md5(string_agg(id || ':' || md5(ST_AsEWKB(geom)::text),',' ORDER BY id)) FROM bagua_master.edificio),
 'huella_rutas',(SELECT md5(string_agg(codigo || ':' || md5(ST_AsEWKB(geom)::text),',' ORDER BY codigo)) FROM bagua_master.ruta),
 'migraciones',(SELECT count(*) FROM schema_migrations));"""
source = json.loads(database('psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"', sql))
dump = database('pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl')
(directory / "postgis.dump").write_bytes(dump)
# Nombre generado y validado; createdb falla si ya existe. Nunca DROP ni reset.
assert target.startswith("bagua_qa_restore_") and all(c.isalnum() or c == "_" for c in target)
database('createdb -U "$POSTGRES_USER" -T template0 "$1"', target)
database('pg_restore -U "$POSTGRES_USER" -d "$1" --single-transaction --exit-on-error --no-owner --no-acl', target, input_bytes=dump)
restored = json.loads(database('psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -tAc "$2"', target, sql))
if source != restored:
    raise RuntimeError("La restauración difiere del corte; revisar escrituras concurrentes. Se conserva la BD QA.")
for script in ["manage.js", "gestion-seed.js"]:
    execute(["docker", "compose", "exec", "-T", "-e", "PGDATABASE=" + target, "-e", "BAGUA_FIXTURE_DATABASE=" + target,
             "-e", "BAGUA_DEPLOYMENT=test", "backend", "node", "backend/dist/db/" + script], stdout=subprocess.PIPE)
manifest = {"destino_qa": target, "restauracion_coincidente": True, "conteos": restored,
            "migracion_y_seed_qa": "aprobados", "dump_bytes": len(dump),
            "limpieza": "Copia QA conservada; no se ejecutó DROP ni se cambió la aplicación principal."}
(directory / "resultado.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps(manifest, ensure_ascii=False))
