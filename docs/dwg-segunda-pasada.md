# Segunda pasada sobre los DWG — 16 de octubre de 2026

Esta revisión amplía la recuperación descrita en [municipal-gis.md](municipal-gis.md)
y [cartography.md](cartography.md). No sustituye nada: los DXF, la extracción de
entidades, el paquete PostGIS y las rutas publicadas siguen igual. La primera
pasada recorría solo el **espacio modelo expandido** en 2D. Esta pasada lee todo
lo demás que contienen los mismos DXF.

## Qué no se había leído antes

| Contenido                               | Rutas (4 DWG, cada uno)                 | Tomaque                                       |
| --------------------------------------- | --------------------------------------- | --------------------------------------------- |
| Presentaciones (hojas)                  | 4 hojas, 109 textos, 12 ventanas        | 5 hojas, 1.220 textos, 35 ventanas            |
| Bloques definidos pero nunca insertados | 23–110 bloques, 10.449–11.204 entidades | 489 bloques, 28.457 entidades                 |
| Objetos OLE incrustados                 | 7 (escudo y logotipo municipal, un EMF) | —                                             |
| Cotas, multidirectrices, directrices    | —                                       | 379 cotas, 2 multidirectrices, 51 directrices |
| Inserciones (punto, giro, Z, atributos) | sí                                      | sí, incluidos 507 puntos topográficos         |
| Xdata de aplicaciones                   | —                                       | RPU_GRAFICOS 138, VERTICES 169, EGPT_EPOD 3   |
| Copias fuera del área (> 20 km)         | 3–385                                   | 31                                            |

Los BAK son equivalentes a sus DWG en hojas, bloques no insertados, grupos y
registros del modelo. Solo RUTAS CON TIEMPO difiere en un XRECORD.

## Hallazgos principales

### 1. Tomaque sí puede georreferenciarse

Sus cajetines rotulan «South America, PSAD 56 Datum, UTM zona 17 Sur». Sin embargo,
la geometría coincide con RUTAS CON TIEMPO (GEODATA EPSG:32717) mediante una
**traslación uniforme de +3,589 m E y +2,352 m N**:

- Hay 23.763 vértices que coinciden a menos de 5 cm, con un RMS de 1,4 cm.
- El valor es idéntico en todas las teselas de 1 km del casco urbano.
- Si el dibujo estuviera en PSAD56, el desplazamiento esperado sería −251 m E,
  −374 m N.

Por tanto, el rótulo de datum no describe las coordenadas actuales del dibujo.
Esto resuelve la hipótesis pendiente de la primera pasada **para el casco
urbano**. Fuera del recuadro verificado (E 771.000–777.000, N 9.374.000–9.379.000),
cada elemento lo indica en su campo `crs`. La incoherencia de la cabecera de
unidades sigue registrada y no se aplicó ningún cambio de escala.

### 2. Rutas guardadas solo en bloques no insertados

Varios bloques sin insertar contienen croquis de rutas de sector con flechas,
desplazados entre 17 y 21 km. Para cada bloque se buscó la traslación que lo
superpone al modelo, y se aceptó solo cuando al menos 100 vértices coincidían a
menos de 5 cm.

| Bloque    | Capa               | Traslación (m)            | Coincidencias | Trazos nuevos | Símbolos |
| --------- | ------------------ | ------------------------- | ------------: | ------------: | -------: |
| ffddcdcdc | PERIMETRO-SECTOR I | −16.631,157 / −7.522,110  |           226 |         1.143 |      359 |
| vfvfbb    | SECT. INCA KOLA    | −20.853,204 / −8.006,495  |           318 |         1.028 |      317 |
| fvfvvd    | SECT. JERUZALEN    | −20.816,717 / −10.337,646 |         1.177 |           263 |        — |

La capa **SECT. JERUZALEN no tiene ninguna entidad en el modelo de ningún DWG**.
Sus 263 trazos solo existen en este bloque. Al trasladarlos discurren por las
calles, sin cruzar viviendas (`artifacts/screenshots/segunda-pasada-jerusalen.png`).
Falta confirmar si son una ruta de recolección o el contorno vial del sector.
Cada trazo indica si ya estaba en el modelo, si queda a ≤3 m de él o si no tiene
equivalente. Las flechas son el bloque F (SENTIDO DE RUTA, relleno 15C9C). En las 739 flechas del modelo, el rumbo medido en su triángulo es exactamente 90° − giro CAD; como los bloques solo se trasladan, el empaquetado aplica ese rumbo y el mapa las dibuja orientadas.

No se aceptaron tres candidatos:

- `bgbgb` y `vfvfdss`, de La Primavera, tienen 0 y 2 coincidencias.
- `GBGNNGF`, con capas R1–R4, INICIO y FIN DE RUTA, es un esquema sin
  correspondencia con el modelo.

### 3. Levantamiento topográfico

Se identificaron 3.670 puntos V-NODE únicos con número (P), descripción (D) y cota
(Z). De ellos, 507 están en el modelo y el resto en seis bloques no insertados.
Las descripciones más frecuentes son CASA, VIVIENDA, ESQ, CERCO, TN, CALLE,
ESTACION, LOTE, POSTE y CAJA-AG.

Solo **1.025 cotas son utilizables**: coinciden con su rótulo «Z:» y caen en el
rango urbano de 380 a 600 m (413,3–488,5 m). El resto procede de copias con un
desfase vertical sistemático (−414,516 m es el Z más repetido del archivo) y se
marca como no utilizable. No se declara datum vertical. Las 94 polilíneas de
CURVAS CERRO no tienen elevación.

### 4. Manzanas, lotes y usos (Tomaque)

- Hay 363 contornos de «Limite Manzana». En 53 de ellos, el xdata RPU_GRAFICOS
  registra las calles colindantes por lado. En 105 hay rótulo de manzana dentro.
- Hay 23.396 rótulos de lote: 6.482 números, 14.900 medidas, 131 usos (comercio,
  educación, parque, servicios comunales…), 171 letras, 453 calles y 1.259 otros.
  Tres rótulos llevan un código EGPT_EPOD de 18 dígitos cuyo significado no se
  conoce.
- Hay 379 cotas con su valor medido. Las angulares se expresan en grados.

Nada de esto convierte contornos en predios oficiales.

### 5. Hojas, fechas y escalas

Las cuatro hojas de rutas (A0, R-1001, R-2001, R-2002) se titulan «Rutas de servicio
de recolección… residuos sólidos municipales». Tienen fecha **marzo de 2026**,
código PSREC-01 o R-xxxx, escala rotulada 1/2500 (R-2002: 1/2000, A1) y escala de
ventana aproximada de 1:2.135 a 1:2.416. Las hojas de Tomaque abarcan de diciembre
de 2014 a octubre de 2018 e incluyen planos de lotización, ubicación y
topografía. Las 55 ventanas se exportan como polígonos de cobertura con sus
rótulos técnicos.

### 6. Toponimia

Se identificaron 1.924 topónimos clasificados: 1.706 calles (422 nombres distintos),
107 instituciones, 52 sectores o lotizaciones y 59 cursos de agua (canales
Huaquilla, Valencia y Brujo Pata, quebrada La Peca, río Utcubamba…). El campo
`ya_en_cartografia` marca los de la capa CALLES ya publicados.

### Otros contenidos

- **OLE:** son el escudo y el logotipo de la Municipalidad, no tablas ni datos.
- **Objetos de Civil 3D, Map 3D y Architectural Desktop:** son estilos y
  configuraciones (2.880 proxies), no superficies ni alineamientos.
- **Entidad proxy de A0:** corresponde al norte y la barra de escala de Map 3D.
- **Grupos:** son anónimos y pequeños.
- **Bloques `NGNGGN` y `GGGDF`:** repiten vértices que ya estaban en el modelo.
- **Imágenes externas:** se confirmaron las cinco de Tomaque. No vienen en la
  entrega.
- **Fechas de cabecera** (TDCREATE/TDUPDATE/LASTSAVEDBY): las reescribió la
  exportación ODA, así que no se usan como fecha del plano.

## Privacidad

Los cajetines y algunos bloques nombran a propietarios y profesionales. Esos
textos no se publican: los rótulos de las hojas pasan por un filtro de patrones
técnicos, y la toponimia solo conserva clases geográficas. Siguen únicamente en
los archivos de extracción locales, excluidos de Git. Tampoco se publican las
rutas de carpetas personales de las imágenes externas.

## Archivos

`data/cad/extracted/deep/` (extracción, por fuente):

- `*.deep.json`: cabecera completa, clases, diccionarios y XRECORD, capas, grupos,
  imágenes, OLE, hojas con ventanas, bloques no insertados y perfiles Z.
- `*.paperspace.jsonl.gz`, `*.unused-blocks.jsonl.gz`, `*.annotations.jsonl.gz`,
  `*.model-extras.jsonl.gz`: registros con geometría 3D.
- `ole/`: contenido de los OLE.

`data/cad/gis/segunda-pasada/` (EPSG:4326, con UTM y procedencia en propiedades):

- `tomaque-alineacion.json` y `resumen.json`.
- `hojas-planos`, `puntos-topograficos`, `manzanas`, `rutas-bloques`, `toponimia`
  y `cotas` (`.geojson`); `etiquetas-lote.geojson.gz`.

Reproducción, tras `gis:extract`:

```powershell
.venv-gis/Scripts/python -m pip install -r scripts/gis/requirements.txt
npm run gis:deep
```

## PostGIS y WebGIS (revisión técnica)

Las capas se importan **solo como evidencia por revisar**. No cambian rutas,
cartografía, entidades CAD, puntos de recolección ni datos DEMO.

```powershell
npm run gis:deep:package          # data/cad/gis/segunda-pasada → database/municipal/segunda-pasada.json.gz
docker compose build backend
docker compose up -d --no-deps --wait backend   # aplica la migración 004
npm run import:segunda-pasada
```

- **Tabla `cad_second_pass`** (migración `004-cad-second-pass.sql`): capa, estado
  (`por revisar` / `documental`), nota de revisión, fuente, nota `crs`, estado del
  CRS (`declarado` / `adoptado` / `provisional`, migración 005), traslación aplicada, atributos JSON, geometría
  UTM 17S, geometría EPSG:4326, validez y huella del paquete. Coordenadas del
  dibujo = `ST_Translate(geom_original, -offset_e, -offset_n)`. Las geometrías
  no se reparan; una manzana se autointersecta y la ficha lo indica.
- **Importación** transaccional e idempotente: un mismo paquete no inserta ni
  modifica filas; uno nuevo actualiza o retira solo filas de esta tabla. Se
  registra en `municipal_imports` como `cad-second-pass-v1`.
- **API de solo lectura:** `/api/municipal/segunda-pasada` (conteos, auditoría,
  decisiones pendientes) y `/api/municipal/segunda-pasada/{capa}`. `etiquetas-lote`
  exige un `bbox` de hasta 0,03°.
- **Técnico → Capas → Segunda pasada DWG:** siete capas apagadas por defecto, que
  se apagan de nuevo al cambiar de modo. La ficha muestra la fuente, la capa CAD,
  la nota `crs`, el estado del CRS, la traslación y las coordenadas UTM. Llevan
  «por revisar» los trazos de bloques no insertados, los puntos topográficos,
  las manzanas con calles RPU_GRAFICOS, la toponimia y las ventanas de hojas.
  Solo las cotas con `cota_estado` «coincide…» se rotulan como utilizables (1.025).
  Los rótulos de lote se piden para la ventana visible a partir del zoom 17.

| Capa                | Publicados | Observación                                                    |
| ------------------- | ---------: | -------------------------------------------------------------- |
| rutas-bloques       |      3.110 | 2.434 trazos y 676 flechas orientadas (rumbo = 90° − giro CAD) |
| puntos-topograficos |      3.669 | Se descartó un duplicado exacto                                |
| manzanas            |        363 | 53 por revisar (con calles RPU)                                |
| etiquetas-lote      |     23.039 | 357 rótulos retenidos por privacidad                           |
| toponimia           |      1.923 | 1 rótulo de trámite retenido                                   |
| hojas-planos        |         55 | 25 con GEODATA declarado; 30 de Tomaque (CRS adoptado)         |
| cotas               |        379 |                                                                |

**Privacidad.** La clase «otro» de los rótulos de lote incluía nombres de
titulares y trámites de predios individuales (certificados, subdivisiones). El
empaquetado solo publica esos rótulos cuando coinciden con patrones técnicos
(códigos, áreas, perímetros, coordenadas, lote/manzana/bloque) o con una lista de
usos públicos, y retira de toda la toponimia los textos de trámites.

**Decisión del 16/10/2026:** la traslación de Tomaque (+3,589 m E, +2,352 m N) se
adopta como su CRS. Sus elementos tienen `crs_status = 'adoptado'`; los de
`RUTAS CON TIEMPO` y demás DWG con GEODATA, `declarado`; los trazos de bloques no
insertados, `provisional`. La ruta institucional, registrada contra el CAD de
Tomaque, se trasladó igual y se muestra en Operativo (véase
[municipal-gis.md](municipal-gis.md)). Fuera del recuadro verificado, la nota `crs`
de cada elemento lo sigue indicando.

Siguen **pendientes de decisión** y no se aplicaron:

1. Si los trazos de bloques no insertados (incluida SECT. JERUZALEN) se incorporan
   a las rutas municipales. Hoy solo existen en esta capa de revisión.
2. Qué rótulos de lote y manzana son útiles para la gestión municipal.

La traslación medida de COFOPRI BAGUA.dwg también se adoptó como su CRS el
16/10/2026 (véase [conciliación](municipal-gis.md#conciliación-del-1617102026)).

Pruebas: `backend/src/modules/municipal/municipal.routes.test.ts` y
`tests/e2e/second-pass.spec.ts` (capturas `*-segunda-pasada*.png`).

La [tercera pasada](dwg-tercera-pasada.md) revisó de nuevo cada DWG y BAK leyendo el
formato nativo y amplía este informe.
