# Escrituras sintéticas solo en destinos designados

> Registro de incrementos con cortes históricos. Para el estado actual consultar
> el [avance único](avance-verificado.md); los límites y conteos de cada corte no
> acreditan que sigan pendientes o hayan sido reprobados hoy. La interacción objetivo
> se define en [entorno integrado](../VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md).

Incremento B11 del plan sin Rentas, 16/11/2026. Reutiliza la configuración y el
pool; no modifica migraciones, datos existentes, cartografía ni interfaz.

## Configuración explícita

Se distinguen el modo optimizado de Node (`NODE_ENV=production` en Docker) y el
tipo de despliegue (`BAGUA_DEPLOYMENT`). Los valores predeterminados son
`BAGUA_DEPLOYMENT=production` y `BAGUA_FIXTURE_DATABASE` vacío: muestras bloqueadas.

Únicamente en una copia local o de pruebas, configurar en `.env` raíz:

```dotenv
BAGUA_DEPLOYMENT=local
BAGUA_FIXTURE_DATABASE=bagua_webgis
```

El nombre debe coincidir exactamente con POSTGRES_DB. Para una BD de test aislada,
usar `BAGUA_DEPLOYMENT=test` y su nombre propio, con volumen y credenciales propios.
No designar una instancia institucional como local. Para ejecutar nativamente,
establecer las mismas variables en backend/.env y hacer coincidir PGDATABASE.
No se utiliza NODE_ENV como única barrera y no se infiere permiso de escribir por
el nombre de host, un prefijo de BD o una variable omitida.

Después de cambiar configuración de Compose:

```sh
docker compose up -d --no-deps --wait backend
```

La función `backend/src/db/fixture-target.ts` comprueba primero que el despliegue
sea local/test y que la base de fixtures explícita coincida con PGDATABASE. Luego
consulta `current_database()` sobre la conexión real y exige la misma identidad.
La designación es responsabilidad del operador: no detecta una instancia real
etiquetada erróneamente ni sustituye roles/credenciales/volúmenes separados.

## Entradas cubiertas

- `gestion:seed`: comprueba destino antes de consultar actores o insertar muestras.
- `gestion:usuario`: el CLI actual prepara accesos provisionales, también restringido.
- `seed:demo` y `seed:demo:clear`: comprobación previa a insertar/borrar fixtures
  del legado, sin tomar ese modelo como referencia del producto nuevo.
- Mutaciones del contrato `/api/gestion`: se bloquean en destinos no habilitados;
  todavía admiten solo información sintética. Sesión y logout siguen disponibles.
- `GET /api/gestion/entorno`: requiere sesión y responde únicamente
  `{ "fixturesPermitidos": true/false }`, sin nombre de BD ni credenciales.
- Las E2E nuevas de gestión, búsqueda y entorno integrado consultan ese contrato
  antes de escribir datos. Un fallo detiene el test, no salta el control.

El contrato sintético devuelve 403/FIXTURE_TARGET_BLOCKED ante destino inválido.
Los adaptadores institucionales futuros necesitarán un contrato de escritura
propio, fuente autorizada y permisos definidos; no deben sortear esta barrera.

## Evidencia

`npm run check`: 80 pruebas aprobadas, tipos/lint/formato/build correctos.
`fixture-target.test.ts` cubre destinos local/test, producción, configuración
incompleta, conexión distinta e indisponibilidad. `gestion.fixture-target.test.ts`
comprueba rechazo de once entradas de mutación antes de abrir transacciones,
privacidad del endpoint de control y posibilidad de cerrar sesión.

Contra Docker: 25 recorridos funcionales aprobados en PC/tableta/móvil;
11 repeticiones omitidas. Seed rechazado en producción y con destino distinto;
ejecución local explícita correcta. Logs en `artifacts/plan-fixtures-*.log`.
El check previo también pasó, con 60 pruebas; se documenta en el inventario.

## Límites y preparación institucional

Este control no convierte el estado actual en una instalación productiva lista.
Las migraciones históricas incluyen catálogos/fuentes de ensayo y el legado;
no se editan retroactivamente. La instalación institucional requiere diseñar una
base limpia, permisos y migraciones de transición que segreguen esas muestras,
sin borrar registros conservados durante desarrollo ni fuentes cartográficas.
Este incremento no mueve ni restaura una base institucional. Posteriormente se
ensayaron restauración e instalación desde vacío en bases QA nuevas: ver
[avance único](avance-verificado.md) y scripts verify-recovery.py/verify-clean-test.py.

Las pruebas existentes conservan registros E2E para revisar auditoría; su limpieza
aislada y una base de QA reproducible siguen pendientes. No limpiar tablas por
prefijo en una base que mezcle datos municipales. Faltan recuperación institucional,
reglas aprobadas e importación real. Restauración QA y cuentas visuales ya tienen
evidencia actual en el tablero.
En este corte no se declaró completado ninguno de los dos hitos; consultar el avance
único para declaraciones posteriores y su alcance. Hito A no acredita Hito B.
