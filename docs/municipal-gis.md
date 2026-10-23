# Recuperación municipal DWG/PDF — 15 de octubre de 2026

La actualización de simbología y modos Operativo/Técnico se describe en [cartography.md](cartography.md). Ese documento actualiza el tratamiento inicial de marcadores y sentidos descrito aquí. La [segunda pasada sobre los DWG](dwg-segunda-pasada.md) añade hojas, bloques no insertados, levantamiento topográfico y la alineación de Tomaque.

## Resultado disponible

En `http://localhost:8080`, la pestaña **Rutas municipales** permite buscar por
ruta o archivo, seleccionar trazados, consultar procedencia y filtrar por
servicio/ruta/sector. **Capas** incorpora contornos CAD, anotaciones del plano,
trazados pendientes y rutas/puntos DEMO. La ficha se adapta a panel inferior
expandible en móvil. Todos los trazados visibles proceden de PostGIS.

No se crearon personas, propietarios, predios oficiales ni puntos de recolección
operativos a partir de textos o polígonos CAD. Los rótulos de inicio, fin y tiempos
se muestran como anotaciones, en la posición del texto, sin asumir que esa posición
es una parada. Tampoco se deduce sentido de circulación del orden de los vértices.

## Inventario y extracción

Originales de la primera entrega en `rustas/`: **5 DWG, 4 BAK y 3 PDF**. La carpeta
actual es `rutas/` y contiene seis DWG: los cinco anteriores, idénticos, y COFOPRI
BAGUA.dwg (véase [Conciliación](#conciliación-del-1617102026)). Todos los DWG/BAK
tienen firma `AC1032`. Se verificaron sus SHA-256 antes y después del procesamiento.

| DWG                                    | Capas | Bloques | Entidades del modelo expandido | CRS explícito |
| -------------------------------------- | ----: | ------: | -----------------------------: | ------------- |
| RUTA LIMPIO                            |    96 |     123 |                         11.814 | No            |
| RUTA ORGANICO                          |    96 |     135 |                         12.184 | EPSG:32717    |
| RUTAS bagua                            |    96 |      49 |                         15.305 | EPSG:32717    |
| RUTAS CON TIEMPO                       |    96 |     122 |                         16.903 | EPSG:32717    |
| RUTA TOMAQUE - BRUJO PATA - CASUARINAS |   102 |   5.138 |                         69.049 | No            |

Los cuatro BAK tienen la misma huella semántica del modelo que su DWG
correspondiente, aunque sus bytes originales difieren. Se conservaron ambos.
Entre los nueve archivos: **235.205 entidades expandidas**, consolidadas en
**82.186 registros únicos** con múltiples referencias de procedencia.

El archivo consolidado contiene 6.584 contornos de la capa VIVIENDA, 33.651 textos,
583 anotaciones de rutas/tiempos, 3.444 límites de rellenos y 37.924 otras entidades.
Esos conteos no representan predios, personas ni paradas municipales registradas.
PostGIS retiene 72 geometrías inválidas en staging, sin repararlas ni publicarlas;
39 geometrías quedan fuera del área de estudio. Hay 16.106 geometrías válidas con
CRS explícito disponibles para uso GIS; 66.006 registros carecen de CRS explícito.

También se inventariaron layouts, definiciones de bloques, atributos, XDATA y
objetos CAD. Los registros originales de polilíneas y splines conservan sus
vértices y parámetros. Los DXF completos conservan los objetos propietarios,
OLE, regiones y demás contenido que no se convirtió a geometría GIS.
Los límites HATCH no equivalen automáticamente a polígonos con huecos correctos.

El DWG de Tomaque referencia cinco imágenes externas no incluidas en la entrega,
entre ellas una página de certificado catastral, `topo.jpg` y otros JPG/PNG. No se
inventó ni descargó ese contenido. Dos bloques tienen `xref_path` nominal, pero
sus flags no los marcan como referencias externas activas.

Los tres PDF aportan **230.753 trazados vectoriales** y 59 referencias a imágenes.
Se extrajeron texto con posiciones, vectores e imágenes embebidas, deduplicadas por
SHA-256. El plano institucional contiene cuatro ventanas cartográficas distintas;
no se trataron como una sola imagen georreferenciada.

## Rutas y trazados

| Identificación en la interfaz | Fuente                             | Componentes | Estado                                                                 |
| ----------------------------- | ---------------------------------- | ----------: | ---------------------------------------------------------------------- |
| Ruta 1001                     | RUTAS CON TIEMPO.dwg               |          64 | CRS explícito; código/color contrastados con leyenda y PDF             |
| Ruta 2001                     | RUTAS CON TIEMPO.dwg               |          71 | CRS explícito; código/color contrastados con leyenda y PDF             |
| Ruta 2002                     | RUTAS CON TIEMPO.dwg               |          36 | CRS explícito; código/color contrastados con leyenda y PDF             |
| Ruta comercial                | RUTA DE RECICLAJE COMERCIAL-A0.pdf |           3 | Vectores registrados contra CAD con CRS explícito                      |
| Ruta orgánica                 | RUTA ORGANICO.dwg                  |          22 | CRS explícito; servicio inferido del nombre del archivo, por confirmar |
| Ruta Tomaque (institucional)  | PDF institucional                  |           6 | Cuatro ventanas recuperadas; CRS de Tomaque adoptado el 16/10/2026     |
| La Primavera                  | Trazo cian del CAD                 |          64 | Geometría recuperada; servicio y vigencia por confirmar                |
| Capa RUTAS                    | RUTAS CON TIEMPO.dwg               |           9 | Identificación pendiente; no se adjudica automáticamente a 1007        |
| Ruta 2026                     | RUTA TOMAQUE (capa COTAS, naranja) |          64 | CRS de Tomaque adoptado; «2026» por confirmar como código o año        |

Se identificaron rótulos **RUTA 1007** y **RUTA 2026**. No bastan para asignar
inequívocamente todos los trazos cercanos. Las versiones alternativas quedan en
staging y archivos GIS; no se superpusieron como rutas vigentes adicionales.

Las longitudes mostradas suman componentes, incluidos posibles recorridos repetidos.
No representan un itinerario ordenado. Se eliminaron duplicados geométricos exactos,
conservando cada referencia; no se disolvieron recorridos parciales solapados.

## Conciliación del 16–17/10/2026

Una nueva revisión de cada DWG frente a la web encontró dos omisiones.

**Ruta 2026.** En Tomaque hay 64 tramos naranjas (color 40) en la capa COTAS, que el
filtrado anterior trató como cotas. Suman 16,46 km de trazos, enlazan Tomaque, Brujo
Pata, Casuarinas y el sector occidental, y los acompañan los seis rótulos «RUTA 2026».
Se publican como un solo conjunto documental (`CAD-2026`), sin conectar extremos ni
crear tres rutas. Las referencias CAD de los 64 tramos se fijaron tras revisar el
plano completo. Se añaden 238 flechas del símbolo original 98993125 a ≤12 m del
trazado, orientadas de la base corta a la punta. Falta confirmar si «2026» es código
o año, y el extremo occidental queda fuera del área donde se verificó la alineación.

**Explorador CAD.** La web muestra capas interpretadas, no todo el dibujo. Las
136.636 geometrías de los seis DWG se guardan en `cad_review` (migración 006) con
archivo, capa, referencia, color original y estado de CRS, incluidas las capas
ocultas. En **Técnico → Capas → Ver geometrías por archivo y capa** se consultan por
ventana de mapa (máximo 8.000 por consulta). Los textos que no son calles, sectores
o rutas se omiten por privacidad.

**COFOPRI BAGUA.dwg** (nuevo; 16.939 entidades: viviendas, manzanas, secciones
viales, usos y acotamientos) no declara CRS. `scripts/gis/align_cofopri.py` lo
compara con RUTAS CON TIEMPO:

- Coincide tras una **traslación uniforme de −250,301 m E y −376,509 m N**.
- 14.611 vértices coinciden a menos de 5 cm, con RMS de 1,3 mm.
- El valor es idéntico en todas las teselas de 500 m.

El cambio PSAD56 → WGS84 genérico predice −251,2 / −374,0 m, a 2,67 m. Por tanto,
COFOPRI está en PSAD 56 / UTM 17S, y la base CAD de rutas es COFOPRI desplazado con
ese valor constante. La traslación medida lo superpone a las rutas mejor que la
transformación genérica (`artifacts/screenshots/cofopri-alineacion.png`).

**Decisión del 16/10/2026:** como con Tomaque, la traslación medida se adopta como
CRS de COFOPRI (EPSG:32717 tras −250,301 m E, −376,509 m N). Sus geometrías en
`cad_review` llevan `crsStatus = 'adoptado'` (migración 007) y el explorador muestra
la traslación y la evidencia. Sus contornos no se convierten en predios oficiales.

Reproducción: `npm run gis:align:cofopri`, `npm run gis:reconcile` y
`npm run import:reconciliation`, que es idempotente y no elimina datos. La
evidencia queda en `data/cad/extracted/cofopri-alineacion.json` y
`cad-reconciliation-audit.json`.

`rutas/` ya no contiene los PDF ni los BAK. Las rutas comercial e institucional
siguen publicadas a partir de las extracciones guardadas, pero `gis:register` y
`gis:build` necesitan esos archivos de vuelta en `rutas/` para regenerarse. Los
scripts leen `rutas/` y, si no existe, `rustas/` (`scripts/gis/sources.py`).

## Coordenadas y precisión

`GEODATA` en Orgánico, RUTAS bagua y RUTAS CON TIEMPO declara **WGS 84 / UTM 17S,
EPSG:32717**, ejes este/norte y metros. Ejemplo de comprobación:
`773100, 9376500` → `-78.53463014, -5.63559529`. Se transforma a EPSG:4326 con orden
longitud/latitud. Los originales UTM se conservan. Las curvas se aproximan con
tolerancia de 0,20 unidades del dibujo; no se realizó ajuste a calles.

Tomaque no declara CRS y su cabecera de unidades es incompatible con la magnitud
de sus coordenadas. No se aplicó una escala arbitraria. EPSG:32717 queda como
hipótesis explícita; las geometrías de ese archivo no pasan automáticamente a la
capa de referencias con CRS confirmado.

**Actualización del 16/10/2026.** La [segunda pasada](dwg-segunda-pasada.md) midió
que Tomaque coincide con el CAD EPSG:32717 tras una traslación de +3,589 m E y
+2,352 m N, y esa traslación se adoptó como su CRS. La ruta institucional, registrada
contra el CAD de Tomaque, se traslada igual, se denomina «Ruta Tomaque – Brujo
Pata – Casuarinas» y se muestra en Operativo como georreferenciada. Las entidades
de Tomaque en `cad_features` no se modificaron: conservan sus coordenadas de dibujo.

El PDF comercial se registró con una transformación de semejanza contra vértices
CAD. En 353 vértices de comprobación no utilizados para ajustar los parámetros,
el RMS es **0,059 m**. En las cuatro ventanas institucionales, los RMS son
**0,109 / 0,102 / 0,087 / 0,097 m**, con 1.619 / 635 / 101 / 106 coincidencias.
Se guardan controles, matrices y residuos. Son errores de correspondencia al CAD,
condicionados a las coincidencias geométricas aceptadas; **no son precisión
topográfica, control independiente en terreno ni confirmación del datum**.

La cuadrícula impresa no se usó como georreferenciación automática: comercial y
reciclaje reutilizan rótulos de cuadrícula con encuadres diferentes. Los textos
sirvieron de aproximación inicial y los vértices verificaron el registro.

Comparación independiente con 345 segmentos viales de OpenStreetMap, mediante
PostGIS y muestreo cada 20 m por componente:

| Ruta          | Mediana al eje OSM | Percentil 95 | Muestras a ≤15 m |
| ------------- | -----------------: | -----------: | ---------------: |
| 1001          |              2,9 m |        8,6 m |           99,8 % |
| 2001          |              3,7 m |        9,1 m |           99,5 % |
| 2002          |              3,6 m |       10,2 m |           98,8 % |
| Comercial     |              1,6 m |        6,8 m |            100 % |
| Orgánica      |              3,0 m |        8,9 m |            100 % |
| Institucional |              5,0 m |       18,2 m |             91 % |

OSM es una referencia y puede tener errores u omisiones. Esto comprueba coherencia
geográfica, sin certificar límites ni precisión absoluta. El trazo CAD-RUTAS sale
parcialmente del recorte OSM; su distancia no permite calificar esos tramos como
erróneos. No se desplazó ninguna geometría para mejorar estos números.
Fuente: [OpenStreetMap, atribución y licencia](https://www.openstreetmap.org/copyright).

## Incertidumbres conservadas

- La tabla institucional imprime **11:08 am–10:58 am** para I.E. Agropecuario TRM;
  el mapa muestra otro final. También hay discrepancias entre tabla y rótulos de
  las primeras instituciones. Los valores originales se conservan y no se
  convierten en horarios operativos.
- El archivo orgánico conserva leyendas heredadas de otras rutas. Su clasificación
  necesita confirmación, aunque su geometría está georreferenciada.
- No se conoce la vigencia operativa de las versiones. El nombre CON TIEMPO y el
  contraste con el PDF justifican su elección para esta vista documental, no una
  afirmación de vigencia oficial.
- No se extrajeron límites jurídicos ni se asociaron nombres a propiedad. Los
  textos de Tomaque requieren interpretación y tratamiento municipal posterior.

## Archivos y reproducción

1. `data/cad/extracted/source-inventory.json`: inventario y SHA-256 originales.
2. `data/cad/converted/conversion-log.json`: conversiones, hashes y auditoría ODA.
3. `data/cad/extracted/*.inventory.json`: capas, bloques, tipos, layouts y CRS.
4. `*.entities.jsonl.gz` y `*.raw.jsonl.gz`: entidades expandidas y registros CAD.
5. `*-georeference.json`: matrices, controles y residuos PDF/CAD.
6. `*-vectors.jsonl.gz`, `*-images.json`, `images/`, `*-p1.txt/json/png`: contenido PDF.
7. `data/cad/gis/rutas-municipales.geojson`: rutas EPSG:4326 con procedencia y estado.
8. `data/cad/gis/cad-crs-confirmado.geojson.gz` y `cad-crs-hipotesis.geojson.gz`:
   geometrías separadas por evidencia de CRS; no implican validación semántica.
9. `database/municipal/`: paquete reproducible para PostGIS.
10. `data/cad/extracted/postgis-qa.json` y `artifacts/screenshots/*-rutas-cad.png`:
    controles de base espacial y evidencia visual.

Herramientas: ODA File Converter oficial, ezdxf, PyMuPDF, pyproj y PostGIS. El GDAL
disponible no incluye controlador DWG/CAD. Siete exportaciones iniciales resultaron
truncadas; ODA las completó con auditoría sobre **copias de trabajo**. Se conservan
exportaciones parciales. No se modificaron los DWG/BAK municipales. Shapely no se
utiliza: el control de aplicaciones de Windows bloqueó su DLL, y la validación
geométrica se realizó en PostGIS sin cambiar esa política.

Preparación en PowerShell:

```powershell
python -m venv .venv-gis
.venv-gis/Scripts/python -m pip install -r scripts/gis/requirements.txt
winget install --id ODA.ODAFileConverter --exact --source winget
npm run gis:inspect
npm run gis:convert
npm run gis:extract
npm run gis:register
npm run gis:build
.venv-gis/Scripts/python scripts/gis/osm_reference.py
npm run infra:up
npm run import:municipal
docker compose exec -T backend node backend/dist/db/verify-municipal.js
```

Las reglas de identificación y ventanas PDF corresponden a esta entrega. Nuevos
DWG se inventarían y extraen con el mismo flujo; nuevos nombres de capas, CRS o
PDF requieren revisar las reglas antes de promoverlos a rutas. Las cachés comparan
hashes para no reutilizar una extracción de un archivo que haya cambiado.

La importación es transaccional e idempotente. Las geometrías y datos municipales
quedan fuera de `seed:demo:clear`. Los originales y archivos derivados no se
añaden a Git; sí están disponibles localmente y en el paquete del contenedor.
