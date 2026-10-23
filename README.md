# Bagua WebGIS

Primera versión funcional del Sistema de Información Geográfica para la Gestión
Territorial de Predios y Servicios de Residuos Sólidos de la Municipalidad Provincial de Bagua.

## Abrir y probar

Requisitos: Node.js 24, npm 11 y Docker Desktop con contenedores Linux.

```sh
npm ci
npm run setup:env
npm run infra:up
npm run seed:demo
```

Abre http://localhost:8080. En **Predios DEMO**, busca `DEMO-001`, selecciónalo y pulsa **Editar predio**.
Guarda un cambio de dirección y recarga: queda persistido en PostGIS. **Nuevo predio**
permite dibujar un polígono tocando el mapa y completar su ficha. Las capas y filtros
permiten explorar predios, rutas, puntos y sectores.

- 24 predios ficticios, 3 servicios, 3 rutas DEMO sobre calles de OpenStreetMap,
  6 puntos y 2 sectores provisionales.
- Personas con vínculo explícito: contribuyente no implica propietario.
- Ficha lateral en escritorio y panel inferior expandible en móvil.
- Búsqueda por código, dirección o persona; filtros combinados de servicio, ruta y sector.
- Creación, edición, consulta y eliminación de predios, con validación espacial y transacciones.

Todos los datos operativos son DEMO, incluidos los creados desde esta versión.
Los polígonos no representan linderos catastrales oficiales. El ámbito de navegación
es provisional; el modelo funcional seguirá ajustándose con la Gerencia. Las rutas municipales documentales se mantienen separadas de los datos DEMO.

| Dirección                          | Contenido                               |
| ---------------------------------- | --------------------------------------- |
| http://localhost:8080              | WebGIS                                  |
| http://localhost:8080/sistema      | Estado de API y PostGIS                 |
| http://localhost:8080/api/health   | Disponibilidad del proceso              |
| http://localhost:8080/api/ready    | Conexión con PostgreSQL/PostGIS         |
| http://localhost:8080/api/docs/    | Swagger y endpoints funcionales         |
| http://localhost:8080/bagua-master | BAGUA MASTER (nueva cartografía urbana) |

## BAGUA MASTER

Módulo paralelo e independiente (entrada **BAGUA MASTER** de la barra lateral): mapa urbano de
Bagua Capital hecho solo con Overture Maps `2026-09-23.1` y MapLibre, con teselas PMTiles propias
(sin proveedores externos). Fase 1: calles, conectores, edificaciones, nombres, agua, usos del
suelo y lugares; sin rutas, predios ni catastro. Overture no publica alturas para Bagua, así
que el modo 2.5D queda desactivado. Se oculta con `BAGUA_MASTER_ENABLED=false` (y el mapa
municipal con `MUNICIPAL_MAP_ENABLED=false`). Procedimiento, inventario, licencias y retirada:
[docs/bagua-master.md](docs/bagua-master.md).

## Rutas municipales recuperadas

Los originales están en `rutas/` (excluida de Git): hoy, seis DWG. La primera entrega
(`rustas/`: 5 DWG, 4 BAK y 3 PDF) ya se procesó y sus extracciones se conservan. La vista
inicial **Rutas municipales** muestra 1001, 2001, 2002, comercial, Tomaque – Brujo Pata –
Casuarinas (ruta institucional) y **Ruta 2026 · Tomaque, Brujo Pata y Casuarinas**. En **Capas → Trazados por revisar** aparecen
orgánica, La Primavera y otros trazos CAD.
Hay búsqueda, filtros, selección, procedencia y panel responsive. **Contornos CAD**
y **Anotaciones del plano** permiten revisar información adicional.

Después de generar el paquete GIS y reconstruir el backend:

```sh
npm run import:municipal
```

La importación persiste 8 trazados y 82.186 entidades CAD únicas en PostGIS, conserva
los datos DEMO y es idempotente. Horarios, datum pendiente y clasificación dudosa
se señalan expresamente. No se asume que un contorno CAD sea un predio oficial.

[Informe, precisión, archivos GIS y reproducción](docs/municipal-gis.md).
[Tercera pasada: auditoría forense de los DWG](docs/dwg-tercera-pasada.md): lectura nativa del
DWG, objetos perdidos en la conversión, linaje, matriz de coincidencias e incertidumbres
(`npm run gis:forensic`, pruebas con `npm run gis:forensic:test`). Solo extracción: no
modifica PostGIS ni el WebGIS.
[Segunda pasada sobre los DWG](docs/dwg-segunda-pasada.md): hojas, bloques no insertados,
levantamiento topográfico y alineación de Tomaque (`npm run gis:deep`). Sus capas se
revisan en **Técnico → Capas → Segunda pasada DWG**, apagadas por defecto, con
procedencia, nota `crs` y estado «por revisar» en cada ficha:

```sh
npm run gis:deep:package
docker compose build backend
docker compose up -d --no-deps --wait backend
npm run import:segunda-pasada
```

Se guardan en la tabla `cad_second_pass` (migración 004), aparte de rutas, cartografía
y CAD. Desde el 16/10/2026 la traslación medida es el CRS adoptado de Tomaque
(migración 005). Los trazos de bloques no insertados siguen sin fusionarse con las
rutas municipales: es una decisión pendiente.

**Conciliación DWG (16–17/10/2026).** Recupera la Ruta 2026 y sus 238 flechas, y
publica las 136.636 geometrías de los seis DWG para consultarlas en **Técnico → Capas →
Ver geometrías por archivo y capa** (tabla `cad_review`, migración 006). COFOPRI
BAGUA.dwg está en PSAD 56. Desde el 16/10/2026 su CRS adoptado es la traslación medida
contra el CAD de rutas (migración 007,
[detalle](docs/municipal-gis.md#conciliación-del-1617102026)):

```sh
npm run gis:align:cofopri
npm run gis:reconcile
docker compose build backend
docker compose up -d --no-deps --wait backend
npm run import:reconciliation
```

Los originales y el paquete derivado son locales y están excluidos de Git; consulta
el informe para reconstruirlos en otro equipo antes de importar.

## Datos y Docker

```sh
docker compose ps
npm run db:check
npm run db:migrate
npm run seed:demo
npm run infra:down
```

`infra:up` construye y arranca los cuatro servicios; el backend aplica migraciones
pendientes antes de arrancar. `seed:demo` es explícito e idempotente: conserva las
ediciones existentes. `infra:down` conserva el volumen y sus datos.

Cuando se desee eliminar **todos los registros DEMO**, incluidos los creados o
editados desde la interfaz, ejecutar `npm run seed:demo:clear`. No elimina registros
no DEMO ni catálogos todavía referenciados por ellos. No es necesario borrar el volumen.

Solo Nginx publica el puerto 8080 en loopback. PostgreSQL permanece en una red
privada accesible por el backend. `setup:env` genera credenciales locales y conserva
los archivos existentes; los `.env` están excluidos de Git.

## Desarrollo

Después de migrar y cargar DEMO mediante Compose:

```sh
npm run db:dev
npm run dev
```

Frontend http://localhost:5173; API http://127.0.0.1:3000/api/health.
Vite redirige `/api` al backend. El override `db:dev` publica PostgreSQL solamente en
localhost para el backend nativo. Para restablecer el aislamiento, ejecutar
`docker compose up -d --force-recreate database` sin el override.

`VITE_MAP_STYLE_URL` permite cambiar de proveedor MapLibre. Esta entrega utiliza
OpenFreeMap Positron. En desarrollo se configura en `frontend/.env`; en Docker,
en `.env` raíz. Reiniciar Vite o reconstruir el frontend después de cambiarlo.
Las variables Vite son públicas y se fijan al compilar. El mapa base requiere
conexión a Internet y conserva la atribución del proveedor.

## Calidad

```sh
npm run check
npx playwright install chromium
```

Contra el Compose iniciado y con DEMO cargado, en PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:8080'
npm run test:e2e
```

Playwright verifica el recorrido real en escritorio, tablet y móvil; crea registros
con códigos `E2E-*` y elimina únicamente sus propios registros al terminar. Sin
`PLAYWRIGHT_BASE_URL` inicia Vite/Express y necesita igualmente una base migrada y
con DEMO. Las pruebas municipales necesitan además `import:municipal`, y
`second-pass.spec.ts`, `import:segunda-pasada`. Capturas en `artifacts/screenshots`, trazas en `test-results`.

## Organización y límites

`frontend/`: React, MapLibre, Query, formularios y UI. `backend/`: Express, pg,
validación, transacciones y OpenAPI. `database/`: migraciones y seed independiente.
`infrastructure/`: Docker y Nginx. `docs/`: decisiones y validación breve.

Esta entrega es local y aún no incorpora autenticación ni permisos municipales.
Entregas operativas, reportes y despliegue institucional quedan
para incrementos posteriores. No se han añadido microservicios ni infraestructura extra.

[Arquitectura](docs/architecture.md) · [Configuración](docs/configuration.md) ·
[BAGUA MASTER](docs/bagua-master.md) ·
[Datos DEMO y fuentes](database/demo/README.md) · [Validación](docs/validation.md).
