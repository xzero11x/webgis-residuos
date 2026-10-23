# BAGUA MASTER — Nueva cartografía urbana

Módulo cartográfico **paralelo e independiente** del mapa municipal. Fase 1: mapa urbano de
Bagua Capital construido **solo** con Overture Maps (release `2026-09-23.1`, esquema `v2.0.0`)
y MapLibre GL JS, con teselas propias servidas desde nuestra infraestructura.

No contiene rutas municipales, horarios, puntos de recolección, predios, lotes, catastro de
COFOPRI, rótulos catastrales ni geometrías de los DWG. No concilia fuentes municipales. El mapa
municipal (`/`) no se modificó: ni su estilo, ni sus capas, ni sus datos.

## Arquitectura

| Capa              | Ubicación                                                 | Notas                                                                                                                 |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Frontend          | `frontend/src/features/bagua-master/`                     | Ruta `/bagua-master`, carga diferida (chunk propio), carcasa propia, instancia MapLibre propia, CSS con prefijo `bm-` |
| Backend           | `backend/src/modules/bagua-master/`                       | `/api/bagua-master/*`, solo lectura (GET)                                                                             |
| Base de datos     | esquema `bagua_master` (migración `009-bagua-master.sql`) | No referencia ninguna tabla de otros esquemas                                                                         |
| Datos             | `data/bagua-master/` (ignorado por git)                   | Descarga, paquete, capas intermedias, PMTiles, glifos, línea base de protección                                       |
| Procesos          | `scripts/bagua-master/`                                   | Descarga DuckDB, paquete, teselas, glifos, protección, independencia                                                  |
| Imagen de teselas | `infrastructure/docker/tiles.Dockerfile`                  | tippecanoe 2.79.0 + go-pmtiles 1.31.2 (solo desarrollo)                                                               |

Elementos compartidos con el resto de la app: solo la barra lateral (`SidebarContent`), el
cliente HTTP (`apiGet`) y los componentes de UI base. Ningún componente, estado, consulta o
caché del mapa municipal se usa en BAGUA MASTER (claves de TanStack Query `['bagua-master', …]`).

API (`/api/bagua-master`):

| Método y ruta                       | Uso                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /resumen`                      | Versión, conjuntos, conteos por tabla, alturas publicadas                                                                      |
| `GET /elementos/:tabla/:id`         | Atributos reales de un elemento (id Overture, tipo, altura solo si existe, fuentes, geometría, longitud/superficie calculadas) |
| `GET /buscar?q=`                    | Lugares y calles por nombre (máx. 25; una entrada por calle)                                                                   |
| `GET /teselas/bagua-master.pmtiles` | PMTiles con `Range` (206/416), único archivo publicable                                                                        |
| `GET /fuentes/:fuente/:rango.pbf`   | Glifos Noto Sans (lista cerrada de fuentes y rangos)                                                                           |

## Fuente y versión

- Overture Maps Foundation, release **2026-09-23.1**, esquema **v2.0.0**, en
  `s3://overturemaps-us-west-2/release/2026-09-23.1/` (GeoParquet). La versión está fijada en
  `scripts/bagua-master/ambito.json`; si deja de estar disponible, el proceso se detiene y lo
  informa: no sustituye el snapshot por otro.
- Extracción: 18/10/2026 02:59 UTC con DuckDB 1.5.6 (extensiones `spatial` y `httpfs`).

## Ámbito

No existe un polígono urbano oficial inequívoco en las fuentes disponibles, así que se usa:

- **Ventana urbana** (vista inicial y botón «extensión urbana»): `[-78.575, -5.69, -78.49, -5.60]`,
  la misma ventana ya verificada en el WebGIS.
- **Área de descarga** (y límite de navegación): ventana + 0,01° → `[-78.585, -5.70, -78.48, -5.59]`.
- **Referencia administrativa**: localidad «Bagua» de Overture (`divisions`, id
  `2458e1c5-a844-4fb5-961c-475af6dcafca`, procede de OpenStreetMap, ODbL). No es un límite oficial
  del gobierno local y no se usa para recortar.

Filtro: intersección del `bbox` de cada elemento de Overture con el área de descarga.

## Inventario descargado (exacto)

| Conjunto Overture          |  Filas | Ids únicos | Geom. nula/vacía/inválida | Tipos de geometría                                  | Fuentes primarias                                                               |
| -------------------------- | -----: | ---------: | ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| transportation / segment   |  1 679 |      1 679 | 0 / 0 / 0                 | LineString 1 679                                    | OpenStreetMap 1 667 · TomTom 12                                                 |
| transportation / connector |  1 152 |      1 152 | 0 / 0 / 0                 | Point 1 152                                         | OpenStreetMap                                                                   |
| buildings / building       | 14 357 |     14 357 | 0 / 0 / 0                 | Polygon 14 356 · MultiPolygon 1                     | Google Open Buildings 11 980 · Microsoft ML Buildings 2 047 · OpenStreetMap 330 |
| buildings / building_part  |  **0** |          0 | —                         | —                                                   | —                                                                               |
| base / land_use            |     33 |         33 | 0 / 0 / 0                 | Polygon 33                                          | OpenStreetMap                                                                   |
| base / water               |      4 |          4 | 0 / 0 / 0                 | LineString 2 (ríos Marañón y Utcubamba) · Polygon 2 | OpenStreetMap                                                                   |
| base / land                |      2 |          2 | 0 / 0 / 0                 | LineString 1 · Polygon 1                            | OpenStreetMap                                                                   |
| places / place             |    198 |        198 | 0 / 0 / 0                 | Point 198                                           | Meta 188 · Foursquare 10                                                        |

Ausencias documentadas (no se rellenan ni se inventan):

- **Alturas**: 0 de 14 357 edificios tienen `height` o `num_floors` en Overture para Bagua.
  Por eso el botón 2.5D aparece **desactivado** con la explicación; la ficha indica
  «No publicada por Overture». Si una versión futura publica alturas, el modo 2.5D extruye
  solo esos edificios (las huellas 2D del resto se mantienen).
- **Partes de edificio**: 0 elementos; la tabla existe vacía y la capa no se tesela.
- **Clases de edificio**: Overture no publica `class`/`subtype` para estos edificios; se
  diferencian solo por superficie calculada (≥ 300 m²), indicada como «calculada».
- **Anchura de vías**: el campo `width_rules` existe en los 1 679 segmentos, pero es nulo en
  todos. No hay anchuras reales: el mapa usa anchuras cartográficas (ver «Estilo»).

## Modelo PostGIS (`bagua_master`)

Tablas `red_vial` (LineString), `conector` (Point), `edificio` (con `altura_m`, `num_pisos`
nulos si Overture no los publica), `parte_edificio`, `uso_suelo`, `agua`, `terreno`, `lugar`
(Point), más `conjunto` (inventario por archivo con SHA-256) y `version` (snapshot, manifiesto,
huella del paquete). Cada elemento conserva: id de Overture (clave primaria), atributos
originales (`atributos` jsonb), fuentes (`fuentes` jsonb), archivo de origen, `geom` (EPSG:4326),
`geom_utm` (EPSG:32718, para longitudes y superficies), validez y huella del paquete.
Índices GIST en ambas geometrías.

La importación es una única transacción con bloqueo consultivo; un paquete idéntico no hace
nada; un paquete nuevo reemplaza solo las filas de `bagua_master` que ya no están.

## Teselas

- Capas intermedias GeoJSONL (`data/bagua-master/intermedio/`) → tippecanoe 2.79.0 (zoom 12–16,
  sin límites de tamaño ni de elementos) → MBTiles en `/tmp` del contenedor → go-pmtiles 1.31.2 →
  `data/bagua-master/teselas/bagua-master.pmtiles` (7 178 037 bytes, SHA-256 `302af4f7…091409`; incluye la capa auxiliar `calles_rotulo`, antes 7 080 501 bytes).
- Capas: `red_vial`, `calles_rotulo` (solo rótulos, ver «Rótulos de calles»), `conectores`, `edificios`,
  `usos_suelo`, `agua`, `terreno`, `lugares`.
  El id de Overture viaja como propiedad `id`.
- MapLibre sobreamplía hasta zoom 20. El cliente `pmtiles` 4.5.0 pide solo los bytes necesarios
  (`Range`); el backend responde `206 Partial Content`. Nginx reenvía la cabecera sin cambios.
- Glifos Noto Sans Regular/Medium/Italic (OFL) servidos por el backend: el mapa no hace
  ninguna solicitud a terceros (verificado en la prueba BM-02).

## Estilo

Estilo propio en `frontend/src/features/bagua-master/map/style.ts`, sin mapa base externo
(no se carga OpenFreeMap ni ningún otro proveedor debajo). Fondo claro cálido; usos del suelo y
agua suaves; edificaciones en gris cálido (más oscuras si ≥ 300 m²); vías con borde y ancho por
clase (principal en ámbar); senderos; conectores desde zoom 17,5; nombres de calles
en Noto Sans Medium, 12→17 px con halo blanco; lugares como puntos con nombre. Selección
resaltada en el propio mapa (edificios y vías). 2D por defecto, rotación desactivada.

**Anchura de las calles (18/10/2026).** Antes, las anchuras se interpolaban solo hasta zoom 18
y el visor llega a 20, así que entre 18 y 20 las calles se quedaban fijas mientras los edificios
se cuadruplicaban. Ahora:

| Jerarquía (clase Overture)         | Zoom 12 | Zoom 14 | Desde zoom 16: anchura visual sobre el terreno |
| ---------------------------------- | ------- | ------- | ---------------------------------------------- |
| motorway, trunk, primary           | 1,8 px  | 4,5 px  | 9 m                                            |
| secondary, tertiary                | 1,3 px  | 3,4 px  | 7,5 m                                          |
| residential, unclassified, unknown | 0,6 px  | 2,2 px  | 6,5 m                                          |
| service, living_street             | 0,4 px  | 1,3 px  | 4,5 m                                          |
| senderos (footway, path, track…)   | 0,4 px  | 0,8 px  | 2 m                                            |

- Desde zoom 16 la anchura en pantalla se duplica en cada nivel hasta zoom 20, igual que
  edificios y manzanas (píxeles = metros × 2^z / 77 892 a 5,64° S).
- Son **anchuras cartográficas, no medidas reales** (Overture no publica `width_rules` para
  Bagua). La ficha no las muestra.
- Las avenidas de doble calzada (Héroes del Cenepa, Agropecuaria, Circunvalación, Vía de
  Evitamiento) son dos ejes paralelos a 9,2–12,4 m en Overture. Cada calzada se dibuja más
  estrecha que esa separación, así que el separador central se ve.
- En los cruces, la vía de mayor jerarquía se dibuja encima (`line-sort-key`). El borde de las
  vías, el resaltado de la selección y los conectores crecen con la vía.
- Senderos: discontinuos hasta zoom 17; desde ahí, caminos continuos de color claro.
- Geometrías y teselas sin cambios; solo cambió el estilo. Prueba unitaria:
  `frontend/src/features/bagua-master/map/style.test.ts` evalúa las expresiones de MapLibre en
  cada zoom. Serie de capturas: `artifacts/screenshots/bagua-master/zoom/` (zoom 14,5 → 20,
  escritorio y celular).

## Rótulos de calles (20/10/2026)

**Síntoma.** En Bagua Capital se leen los nombres de las calles; en Tomaque y otras zonas las
calles se dibujan sin nombre.

**Causa: dato ausente en Overture, no un fallo de visualización.** Se comprobó la cadena
completa para los 1 679 segmentos de `transportation/segment`:

| Etapa                                                                 | Segmentos con `names.primary` | Diferencias de nombre con el origen |
| --------------------------------------------------------------------- | ----------------------------: | ----------------------------------- |
| Snapshot Overture `2026-09-23.1` en S3 (consulta directa, mismo bbox) |                           938 | —                                   |
| Parquet descargado                                                    |                           938 | 0                                   |
| Paquete (`elementos.json.gz`) y capa intermedia `red_vial.geojsonl`   |                           938 | 0                                   |
| PostGIS `bagua_master.red_vial`                                       |                           938 | 0                                   |
| PMTiles (`red_vial`, 10 156 elementos de teselas, zoom 12–16)         |                           938 | 0                                   |

- Las demás variantes no aportan nada: `names.common` está vacío en los 1 679 segmentos y
  `names.rules` solo existe en los mismos 938 (repite el nombre primario). No hay ningún segmento
  con variantes y sin nombre primario. La tabla `addresses` de Overture no tiene filas en el área.
- Ningún nombre se perdió al extraer, importar o teselar (`scripts/bagua-master/leer_teselas.mjs`
  decodifica todas las teselas y contrasta ids y nombres). **741 segmentos no tienen nombre en
  Overture** y no se les inventó ninguno ni se usó otra fuente.

**Calles con y sin nombre por zona** (`npm run bagua-master:zonas-nombres`; las zonas son los
núcleos urbanos que forman las propias vías de Overture: calles locales a menos de 150 m; el
núcleo que corta la ventana de Tomaque se llama Tomaque; los demás no tienen nombre propio en
los datos y llevan el centro):

| Zona                                       |    Tramos | Con nombre | Sin nombre | % con nombre |     km |
| ------------------------------------------ | --------: | ---------: | ---------: | -----------: | -----: |
| Bagua Capital                              |       987 |        925 |         62 |         93,7 |  77,20 |
| Tomaque                                    |        99 |          0 |         99 |            0 |   8,22 |
| Núcleo 1 (−78,5633; −5,6371)               |       159 |          0 |        159 |            0 |  13,29 |
| Núcleo 2 (−78,5457; −5,6271)               |       112 |          0 |        112 |            0 |   9,13 |
| Núcleo 4 (−78,5743; −5,5961)               |        58 |          0 |         58 |            0 |   5,21 |
| Núcleo 5 (−78,4881; −5,6692)               |        36 |          0 |         36 |            0 |   3,29 |
| Núcleo 6 (−78,5204; −5,6760)               |        28 |          0 |         28 |            0 |   2,96 |
| Núcleo 7 (−78,5388; −5,6231)               |        18 |          0 |         18 |            0 |   2,11 |
| Núcleo 8 (−78,5517; −5,5908)               |        19 |          0 |         19 |            0 |   1,50 |
| Núcleo 9 (−78,5258; −5,6710)               |        15 |          0 |         15 |            0 |   1,72 |
| Núcleo 10 (−78,4804; −5,6872)              |        13 |          6 |          7 |         46,2 |   1,04 |
| Núcleo 11 (−78,4811; −5,6010)              |         9 |          0 |          9 |            0 |   0,79 |
| Red interurbana y rural (fuera de núcleos) |       126 |          7 |        119 |          5,6 | 143,74 |
| **Total**                                  | **1 679** |    **938** |    **741** |         55,9 |        |

Las 62 sin nombre de Bagua Capital son 38 residenciales, 14 senderos, 5 de clase desconocida,
3 de servicio y 2 secundarias (5,9 km; mediana de 66 m). Son del mismo estilo que el resto del
dato ausente: tampoco se completan por vecindad con el nombre de un tramo contiguo.

**Qué sí se corrigió.** Con los datos de Overture había dos cosas que resolver:

1. **Rótulos que no se colocaban aunque el nombre existía.** Overture parte cada calle en
   tramos de unos 50–100 m y MapLibre solo coloca un rótulo de línea si el texto cabe en un
   elemento de la tesela, así que a zoom 17 muchas calles con nombre quedaban sin rótulo.
   Se añadió la capa auxiliar `calles_rotulo` (`scripts/bagua-master/build_rotulos.py`): las
   MISMAS líneas, unidas por nombre solo para colocar el texto. `red_vial` no cambia (las
   10 156 entidades de teselas son idénticas); el script comprueba que la longitud total
   (160 061 m) y los 4 782 vértices únicos coinciden con los tramos de origen. Las vías
   mayores se colocan primero (`symbol-sort-key`) y ganan las colisiones.
   En la práctica la mejora es moderada: a zoom 17 en la capital aparecen más calles (p. ej.
   Av. Mariano Melgar y Jr. Tumbes, que antes quedaban sin rótulo), pero el límite sigue siendo
   el espacio: en una pantalla con ~30 calles no caben todos los rótulos hasta zoom 18.
2. **Designación de ruta donde no hay nombre de calle.** 98 tramos sin nombre llevan una ruta en
   Overture (`routes`). Se rotulan con una capa distinta (`bm-rutas-texto`: cursiva, color
   ocre), sin mezclarlos con los nombres de calle:
   - 24 tramos: `routes[].name` tal cual («Ruta PE-5NC»);
   - 74 tramos: sin nombre de ruta, solo `network` + `ref`; el rótulo es la regla de formato
     «XX-ref» de `PE:departmental:XX` o `PE:rural:XX` (`AM-101`, `AM-540`…). Es un formato de dos
     campos de Overture, no una fuente nueva. Esto es lo que se ve en la carretera de Tomaque
     («AM-101»). Si se prefiere no mostrarlo, basta retirar la capa `bm-rutas-texto`.
     Las calles residenciales de Tomaque siguen sin nombre porque Overture no lo tiene.

La ficha de una vía sin nombre ahora lo dice («Vía sin nombre en Overture», «Nombre: No
publicado por Overture 2026-09-23.1»), en lugar de mostrar el código de clase.

El archivo de teselas se versiona en el URL (`?v=`, `TILES_REVISION`) para que el navegador no
reutilice una copia anterior (el backend sirve las teselas con `max-age=3600`).

Reproducción: `npm run bagua-master:rotulos`, luego `npm run bagua-master:teselas` (falla si
falta la capa auxiliar). Medidas en el navegador: `npm run bagua-master:medir-rotulos` y
`npm run bagua-master:capturar-nombres -- <carpeta> 15,16,17`.

Interacción: acercar/alejar, centrar en Bagua, extensión urbana, 2D/2.5D (solo con alturas
reales), búsqueda de calles y lugares, ficha del elemento (panel lateral en escritorio, panel
inferior plegable en celular). La ficha muestra el id de Overture, tipo, altura solo si existe,
longitud/superficie calculadas, atributos originales, fuente y versión del conjunto. No muestra
teléfonos, correos ni redes sociales de los lugares (pueden ser datos personales).

## Licencias y atribución

Visible en el mapa: «© Overture Maps Foundation (2026-09-23.1) · © OpenStreetMap (ODbL) ·
Noto Sans (OFL)».

| Datos                                                | Licencia                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Transporte, base, la mayoría de edificios (Overture) | ODbL 1.0 (derivados de OpenStreetMap)                                                              |
| Edificios de Google Open Buildings                   | Overture no informa licencia por registro; el tema `buildings` de Overture se distribuye bajo ODbL |
| Edificios de Microsoft ML Buildings                  | ODbL 1.0                                                                                           |
| Lugares (Meta)                                       | CDLA-Permissive 2.0                                                                                |
| Lugares (Foursquare)                                 | Apache 2.0                                                                                         |
| Fuente Noto Sans                                     | SIL Open Font License 1.1 (copia en `data/bagua-master/estilo/fuentes/OFL.txt`)                    |

## Comandos

Requisitos: `.venv-gis` con `scripts/bagua-master/requirements.txt` (duckdb 1.5.6), Docker.

```bash
npm run bagua-master:proteccion-escribir   # línea base de datos protegidos (una vez)
npm run bagua-master:descargar             # descarga Overture 2026-09-23.1 + manifest.json
npm run bagua-master:verificar             # comprueba hashes y conteos de la descarga
npm run bagua-master:paquete               # paquete para PostGIS + capas intermedias
npm run bagua-master:rotulos               # capa auxiliar de rótulos de calles (antes de las teselas)
npm run bagua-master:zonas-nombres         # calles con y sin nombre por zona
npm run bagua-master:glifos                # glifos Noto Sans
npm run bagua-master:imagen-teselas        # imagen tippecanoe/pmtiles (una vez)
npm run bagua-master:teselas               # genera bagua-master.pmtiles
docker compose up -d --build backend frontend
npm run bagua-master:importar              # importa a bagua_master (idempotente)
npm run bagua-master:proteccion-verificar  # confirma que nada protegido cambió
npm run bagua-master:independencia         # compila con cada módulo desactivado y prueba
```

## Desactivar o retirar el módulo

- **Ocultar BAGUA MASTER**: `BAGUA_MASTER_ENABLED=false` en `.env` y
  `docker compose up -d --build backend frontend`. La API deja de existir (404), la entrada
  lateral y la ruta desaparecen; el mapa municipal sigue igual.
- **Ocultar el mapa municipal**: `MUNICIPAL_MAP_ENABLED=false` (solo frontend). `/` redirige a
  `/bagua-master`.
- **Retirar por completo**: borrar `frontend/src/features/bagua-master/`,
  `backend/src/modules/bagua-master/`, `backend/src/db/import-bagua-master.ts`,
  `scripts/bagua-master/`, `infrastructure/docker/tiles.Dockerfile`, los specs
  `tests/e2e/bagua-master*.spec.ts`, la ruta en `frontend/src/app/router.tsx`, la entrada en
  `app-sidebar.tsx`, el montaje en `backend/src/app.ts`/`server.ts`, las variables en
  `compose.yaml`/Dockerfile/`env.ts`, los scripts `bagua-master:*` de `package.json` y
  `data/bagua-master/`. El esquema se elimina con una migración nueva
  (`DROP SCHEMA bagua_master CASCADE`), nunca editando la 009 (las migraciones están protegidas
  por suma de comprobación).

## Verificación (18/10/2026)

Contra la pila Docker (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080`):

| Prueba                                                                                                                         | Resultado                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (tipos, lint, formato, 38 pruebas unitarias, compilación)                                                      | Correcto                                                                                                                     |
| Pruebas de API de BAGUA MASTER (rangos 206/416, lista cerrada de archivos, validación, módulo desactivado → 404, solo lectura) | 5/5                                                                                                                          |
| `tests/e2e/bagua-master.spec.ts`: BM-01…BM-15 y MAP-01…MAP-07 en escritorio, tableta y celular                                 | 61 correctas, 5 omitidas a propósito (pruebas de datos solo en escritorio; búsqueda de cabecera oculta en celular), 0 fallos |
| `npm run bagua-master:independencia` (compilación sin BAGUA MASTER y sin mapa municipal)                                       | 2/2 escenarios correctos                                                                                                     |
| Importación repetida                                                                                                           | La segunda ejecución no cambia nada («idéntico»)                                                                             |
| `npm run bagua-master:proteccion-verificar`                                                                                    | 72 archivos protegidos sin cambios; solo se añadieron la migración 009 y su registro en `schema_migrations`                  |

Las 15 comprobaciones del módulo: entrada lateral y ruta; ninguna solicitud a terceros ni a la
API municipal; PMTiles por rangos; versión y atribución; calles, edificaciones y rótulos
dibujados; acercar, alejar, desplazar y centrar; ficha de edificación y de vía con datos reales y
fuente declarada; 2.5D desactivado sin alturas inventadas; búsqueda; resultados sin duplicados
ni contactos personales; sin desbordes y ficha inferior en celular; alcance limitado a las 8
tablas de Overture; las rutas son un conjunto aparte (fase 2) y no hay predios.

Capturas en `artifacts/screenshots/bagua-master/` (`CAPTURAS=1 npx playwright test
tests/e2e/bagua-master-capturas.spec.ts`): inicio, vista urbana, zoom alto con ficha, estado
2.5D y mapa anterior, en escritorio y en celular.

Fuera de este módulo, la suite completa muestra 3 fallos en el mapa municipal
(`cartography.spec.ts` en tableta/celular: flechas de sentido no visibles; `integrity.spec.ts`
en escritorio: el clic sobre una ruta abre la ficha de un sector). Los causa la capa
«Territorio unificado», activa por defecto en Operativo, y no BAGUA MASTER: no se corrigieron
aquí porque esta tarea prohíbe modificar el módulo cartográfico anterior.

## Nombres de calles recuperados del DWG de Tomaque (20/10/2026)

**Qué es.** Overture 2026-09-23.1 publica 1,679 tramos viales; 741 no traen `names.primary`. El DWG
`RUTA TOMAQUE - BRUJO PATA - CASUARINAS` contiene rótulos de calles (planos de 2014–2018). Se usan
**solo como nombre documental**: no se importa ninguna geometría del DWG, no se mueve ni modifica
ningún tramo de Overture y no se sobrescribe ningún nombre de Overture.

**Método** (`scripts/bagua-master/nombres_dwg.py`, `npm run bagua-master:nombres-dwg`):

1. Cada texto de calle del DWG (TEXT/MTEXT) se normaliza («JR. LOS JASMINES» → «Jirón Los Jasmines») y
   se estima su eje (posición, rotación, altura, ancho) con la traslación medida de Tomaque.
2. Se compara con los tramos de Overture sin nombre: distancia ≤ 15 m y diferencia de ángulo ≤ 12°.
   Con varios textos, deben coincidir; si hay dos nombres compatibles el tramo queda **ambiguo**.
3. Respaldo documentado: lotes y manzanas del DWG (xdata RPU_GRAFICOS) citan calles colindantes. Si citan
   otras calles y no esta, el nombre se **retiene** sin asignar.
4. Continuidad: un tramo sin texto entre dos tramos con el mismo nombre (giro ≤ 20°) lo hereda.
5. **Calibración**: el mismo procedimiento se aplica a tramos que ya tienen nombre en Overture:
   330 coinciden, 70 difieren de nombre (planos históricos) y 8 son errores espaciales. Por eso los
   nombres se presentan como documentales, no oficiales ni vigentes (p. ej. «Mezones Muro» se
   conserva como figura en el DWG).

**Resultado.** 224 nombres candidatos distintos en el DWG → 52 nombres distintos asignados a **113 tramos**
(61 líneas de rótulo); 2 ambiguos, 9 retenidos y 617 tramos sin correspondencia (siguen sin nombre).
Por zona (tramos recuperados): Tomaque 53, Núcleo 5 22, Núcleo 1 16, Bagua Capital 15, Red interurbana 7,
resto sin textos del DWG.

**Dónde vive.** Conjunto independiente `bagua_master.nombre_complementario` (migración
`010-bagua-master-nombres.sql`, sin claves foráneas; `npm run bagua-master:importar-nombres`, idempotente por
sha256). `red_vial.nombre`/`nombres` no se tocan. Los rótulos usan la misma capa `calles_rotulo` y el mismo
estilo (`bm-calles-texto`); la propiedad `origen` (`names.primary` | `dwg-tomaque`) viaja en la tesela.
Prioridad: nombre de Overture > nombre recuperado > designación de ruta > sin rótulo. La ficha muestra
«Nombre recuperado», «Origen del nombre» (archivo DWG, texto original, tipo de asociación) y el aviso.
La búsqueda también encuentra estos nombres.

**Comprobaciones realizadas.** Huellas PostGIS de `red_vial` (con nombres), `edificio` y `conector`
idénticas antes y después; la capa `red_vial` decodificada de las teselas (10,156 entradas) es idéntica y
todas las capas de entrada salvo `calles_rotulo` conservan su sha256. `TILES_REVISION` = `2026-10-20-nombres-dwg`.
Capturas en `artifacts/screenshots/bagua-master/nombres/{recuperados,fichas}` (script
`capturar_recuperados.mjs` y `capturar_ficha_recuperada.mjs`).

## Fase 2: rutas municipales de recolección (22/10/2026)

**Fuente única: DWG.** Decisión permanente (22/10/2026): los PDF ya no son fuente de rutas. El catálogo,
las flechas, los marcadores y los atributos proceden exclusivamente de DWG municipales. Los PDF y sus datos
históricos siguen archivados (paquete municipal, `public.rutas` y `public.municipal_cartography` no se
tocan) pero no se usan como fuente activa.

**Alcance.** Se muestran sobre BAGUA MASTER los recorridos municipales ya documentados, sin reconstruirlos
ni reprocesar DWG ni fusionar rutas. Las calles, edificios, nombres y teselas de Overture no cambian; el
mapa municipal anterior solo se lee para la instantánea. Sin predios ni catastro.

**Datos** (`npm run bagua-master:exportar-rutas`, `bagua-master:importar-rutas`; migraciones
`011-bagua-master-rutas.sql` y `012-bagua-master-rutas-solo-dwg.sql`; tablas `bagua_master.ruta`,
`ruta_flecha`, `ruta_marcador`, sin claves foráneas, importación idempotente por sha256 de
`data/bagua-master/rutas/rutas.json`):

| Ruta                                         | Estado           | Longitud de trazos | Flechas dibujadas |
| -------------------------------------------- | ---------------- | ------------------ | ----------------- |
| Ruta 1001                                    | georreferenciada | 21,7 km            | 311               |
| Ruta 2001                                    | georreferenciada | 17,8 km            | 46                |
| Ruta 2002                                    | georreferenciada | 16,5 km            | 235               |
| Ruta 2026 · Tomaque, Brujo Pata y Casuarinas | georreferenciada | 16,5 km            | 234               |
| La Primavera · trazo CAD                     | en revisión      | 7,4 km             | 116               |
| Capa RUTAS · identificación pendiente        | en revisión      | 7,4 km             | 0                 |
| Ruta orgánica · por confirmar                | en revisión      | 7,9 km             | 0                 |

**Qué se retiró por proceder de PDF.**

- Rutas excluidas del catálogo y del mapa: «Ruta comercial» y «Ruta Tomaque – Brujo Pata – Casuarinas»
  (institucional), cuya geometría procedía exclusivamente de PDF. «Ruta 2026 · Tomaque, Brujo Pata y
  Casuarinas» se conserva: viene del DWG.
- Flechas extraídas de PDF: 145 de la ruta 2001 (que pasó de 190 a 46, las del DWG), más las 84 y 45 de
  las rutas excluidas. No se sustituyen por otras: donde faltan, no se indica sentido.
- Atributos: en las notas de 1001, 2001 y 2002 se retiró la cláusula «contrastada con el PDF de reciclaje»
  (la identificación por leyenda y color del DWG se mantiene). No se añadió ningún sustituto.
- Sectores, marcadores y advertencias se recalcularon solo con símbolos DWG (no cambiaron).
- El snapshot anterior (con PDF) queda archivado en `data/bagua-master/rutas/historico/`, sin importarse.

**Garantías contra futuras importaciones.** El exportador omite rutas y símbolos cuyo archivo no sea DWG y
falla si queda alguna mención a un PDF; el importador rechaza cualquier elemento no DWG; y la base lo impide
con restricciones CHECK (`ruta_fuente_dwg`, `ruta_sin_pdf`, `ruta_flecha_fuente_dwg`,
`ruta_marcador_fuente_dwg`). Cada ruta guarda su procedencia (archivo de trazos, de flechas y de marcadores)
y la ficha la muestra.

- Los trazos se copian tal cual: **no se ajustan a las calles de Overture**. La longitud es la suma de
  trazos (puede repetir calles), no la distancia de recorrido. «Georreferenciada» no acredita vigencia
  operativa ni precisión topográfica; no hay horarios ni frecuencias validados. Las rutas en revisión
  necesitan además confirmar su identificación.
- **Flechas:** solo las asociadas a una ruta de forma inequívoca por el paquete municipal. Se verifica que
  el eje del triángulo siga la dirección local del trazo (≤ 25°; resultado: máximo 15,6°, a ≤ 7 m):
  946 verificadas, 4 duplicadas (mismo símbolo dibujado dos veces) → 942 dibujadas.
- **Marcadores:** 31 (inicio, fin, parada) asociados a una ruta; todos de DWG.

**API:** `GET /api/bagua-master/rutas` (fichas) y `/rutas/mapa` (trazos, flechas verificadas y marcadores
en GeoJSON). Solo se piden al activar las rutas.

**Interfaz:** botón «Rutas» en los controles. El panel lista las 7 rutas con su estado (línea continua =
georreferenciada, discontinua = en revisión); elegir una (en la lista o tocando su trazo) la destaca,
atenúa las demás y encuadra el mapa, y muestra la ficha: estado, longitud, sectores, sentido, horario,
procedencia DWG, nota y advertencias. En celular es un panel inferior. Con un trazo de ruta bajo el dedo,
el toque elige la ruta; para consultar la calle de abajo se ocultan las rutas.

**Comprobado:** 7 rutas, 946 flechas y 31 marcadores sin huérfanos ni elementos no DWG; huellas PostGIS de
`red_vial`, `edificio` y `conector` idénticas; teselas sin cambios; `bagua-master:proteccion-verificar`
sin archivos modificados (solo las migraciones nuevas); `bagua-master:independencia` pasa. Capturas en
`artifacts/screenshots/bagua-master/rutas/` (`scripts/bagua-master/capturar_rutas.mjs`).
