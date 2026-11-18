# WEBGIS BAGUA

**BAGUA MASTER** es el producto central de gestión territorial y operativa municipal.
Abrir [mapa de trabajo](http://localhost:8080/bagua-master). El visor de `/` es
legado independiente; su DEMO no define el padrón administrativo actual.

[Producto](PRODUCT.md) · [Estado y evidencia](docs/avance-verificado.md) ·
[Interacción](VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md) ·
[Gestión: uso y contratos](docs/gestion-bagua-master.md).
Para agentes: [AGENTS.md](AGENTS.md), con consulta documental según la tarea.

Este README contrasta comandos y rutas con el repositorio al 17/11/2026; no vuelve
a certificar pruebas anteriores. La gestión usa API/PostgreSQL y autenticación con
perfiles de ensayo; los registros administrativos disponibles son sintéticos.
No se acredita entrega oficial de Rentas ni aceptación institucional.

## Abrir y probar BAGUA MASTER

Requisitos: Node.js 24, npm 11 y Docker Desktop con contenedores Linux.

```sh
npm ci
npm run setup:env
npm run infra:up
```

Antes de crear cuentas o muestras, configurar una copia local/test conforme a
[segregación de fixtures](docs/segregacion-fixtures.md): `BAGUA_DEPLOYMENT=local`
o `test` y `BAGUA_FIXTURE_DATABASE` igual a la base realmente conectada. Nunca
etiquetar una instancia institucional como local. Si cambia la configuración con
Compose ya iniciado, recrear el backend como indica esa guía. Las plantillas
bloquean las escrituras sintéticas por defecto. Con la copia habilitada:

```sh
npm run gestion:usuario
npm run gestion:seed
```

Abrir [BAGUA MASTER](http://localhost:8080/bagua-master) y pulsar **Ingresar**.
Tras autenticar, **Registros** abre el padrón; el inicio contextual ofrece tareas y
**Herramientas** reúne opciones según perfil. Buscar un predio de prueba, abrir su
ficha y consultar personas, unidades, servicios y actividad autorizados. La ficha
completa y los formularios se amplían dentro del mismo mapa. Un registro sin
ubicación sigue consultable y no recibe un marcador inventado.
Las contraseñas se guardan en artifacts/accesos-locales, fuera de Git. La muestra
nueva es sintética y separada del primer mapa. La cartografía requiere las PMTiles
y recursos locales existentes, según [puesta en marcha](docs/puesta-en-marcha-2026-11-03.md).
El seed administrativo no descarga ni reconstruye cartografía.

Para recorrer la muestra curada de vivienda, bodega, personas, unidades y entregas,
en la copia local/test habilitada ejecutar:

```sh
docker compose exec -T backend node backend/dist/db/gestion-scenarios.js --experiencia
```

En el mapa, elegir **Predios** y abrir **Jr. Comercio 216** (dirección ficticia de
la demostración). La ficha permite recorrer relaciones y registrar una entrega
sin abandonar el mapa. Ninguna dirección de la muestra atribuye identidad municipal.

<details>
<summary>Referencia histórica del primer visor; no instala ni define BAGUA MASTER</summary>

### Prueba del visor histórico

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

</details>

| Dirección                                      | Contenido                                             |
| ---------------------------------------------- | ----------------------------------------------------- |
| http://localhost:8080                          | Visor municipal histórico (si está habilitado)        |
| http://localhost:8080/sistema                  | Estado de API y PostGIS                               |
| http://localhost:8080/api/health               | Disponibilidad del proceso                            |
| http://localhost:8080/api/ready                | Conexión con PostgreSQL/PostGIS                       |
| http://localhost:8080/api/docs/                | Swagger y endpoints funcionales                       |
| http://localhost:8080/bagua-master             | BAGUA MASTER: mapa de trabajo y gestión               |
| http://localhost:8080/bagua-master/gestion     | Enlace compatible que redirige al espacio equivalente |
| http://localhost:8080/bagua-master/expedientes | Expedientes de predios, personas y unidades           |
| http://localhost:8080/bagua-master/servicios   | Servicios, participaciones y registro de entregas     |
| http://localhost:8080/bagua-master/resultados  | Entregas registradas por periodo, servicio y material |

## BAGUA MASTER

Producto base actual en `/bagua-master`, con cartografía Overture `2026-09-23.1`,
PMTiles propias, rutas documentales DWG y gestión administrativa separada. Búsqueda,
fichas y operaciones se integran en el mapa sin sidebar permanente. El histórico
permanece independiente. Las alturas derivadas conservan su procedencia y las
simuladas requieren elección explícita.
[Cartografía](docs/bagua-master.md) · [Alturas](docs/alturas-estimadas.md) ·
[Avance técnico](docs/avance-verificado.md).

## Rutas municipales del visor histórico — reproducción técnica

Los comandos y conteos de esta sección documentan extracciones/importaciones
históricas, no resultados reejecutados en esta tarea. Sus rutas PDF no se incorporan
al catálogo activo de BAGUA MASTER, que conserva únicamente DWG. No ejecutar estos
procesos para un cambio visual ni sin sus originales y herramientas locales.

### Fuentes y procesamiento

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
pendientes antes de arrancar. `seed:demo` pertenece al legado, requiere destino de fixtures habilitado y es explícito e idempotente: conserva las
ediciones existentes. `infra:down` conserva el volumen y sus datos.

Cuando se desee eliminar **todos los registros DEMO**, incluidos los creados o
editados desde la interfaz, ejecutar `npm run seed:demo:clear`. No elimina registros
no DEMO ni catálogos todavía referenciados por ellos. No es necesario borrar el volumen.

Solo Nginx publica el puerto 8080 en loopback. PostgreSQL permanece en una red
privada accesible por el backend. `setup:env` genera credenciales locales y conserva
los archivos existentes; los `.env` están excluidos de Git.

## Desarrollo

Después de preparar la base migrada de desarrollo y los recursos locales necesarios:

```sh
npm run db:dev
npm run dev
```

Frontend http://localhost:5173; API http://127.0.0.1:3000/api/health.
Vite redirige `/api` al backend. El override `db:dev` publica PostgreSQL solamente en
localhost para el backend nativo. Para restablecer el aislamiento, ejecutar
`docker compose up -d --force-recreate database` sin el override.

`VITE_MAP_STYLE_URL` configura exclusivamente el fondo del **visor histórico**
(OpenFreeMap Positron por defecto). En desarrollo se define en `frontend/.env`;
en Docker, en `.env` raíz. Reiniciar Vite o reconstruir frontend para aplicar cambios.
Las variables Vite son públicas y se fijan al compilar; ese fondo requiere Internet
y conserva atribución. BAGUA MASTER utiliza Overture y recursos locales: esta
variable no autoriza sustituir su base cartográfica.

[Configuración y resolución de fallos](docs/configuration.md).

## Calidad

```sh
npm run check
npx playwright install chromium
```

Contra una copia Compose local/test habilitada, con los fixtures y recursos que
requiera la suite seleccionada, en PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:8080'
npm run test:e2e
```

Playwright contiene recorridos de escritorio, tablet y móvil. Las suites nuevas
comprueban el destino de fixtures antes de escribir; algunas conservan registros
`E2E-*` para auditoría, por lo que no se promete limpieza automática universal.
Sin `PLAYWRIGHT_BASE_URL` inicia Vite/Express y requiere base migrada/configurada.
Las pruebas del legado necesitan DEMO; las municipales, además `import:municipal`, y
`second-pass.spec.ts`, `import:segunda-pasada`. Capturas en `artifacts/screenshots`, trazas en `test-results`.

## Organización y límites

`frontend/`: React, MapLibre, Query, formularios y UI. `backend/`: Express, pg,
validación, transacciones y OpenAPI. `database/`: migraciones y seed independiente.
`infrastructure/`: Docker y Nginx. `docs/`: decisiones y validación breve.

La gestión actual contiene sesiones, roles técnicos provisionales, entregas,
reportes e importación CSV/JSON. Su existencia en código no acredita reglas
institucionales aprobadas ni integración del padrón real. El alcance probado y los
pendientes están en el avance único; los informes antiguos conservan su fecha.
El despliegue institucional requiere datos/autorizaciones, permisos, operación y
aceptación municipal. No se han añadido microservicios ni infraestructura extra.

[Arquitectura](docs/architecture.md) · [Configuración](docs/configuration.md) ·
[BAGUA MASTER](docs/bagua-master.md) ·
[Datos DEMO y fuentes](database/demo/README.md) · [Validación](docs/validation.md).
