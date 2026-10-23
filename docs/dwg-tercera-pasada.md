# Tercera pasada: auditoría forense de los DWG — 16–17 de octubre de 2026

Esta fase es **solo de extracción y análisis**. No se unificó, fusionó, depuró ni
publicó nada nuevo en el WebGIS; PostGIS, las rutas, los predios y las extracciones
anteriores no se modificaron (verificación al final). Complementa
[municipal-gis.md](municipal-gis.md) (primera pasada) y
[dwg-segunda-pasada.md](dwg-segunda-pasada.md).

## Fuentes analizadas

Diez archivos, cada uno por separado:

| Archivo                                        | Origen                                 | Creado (nativo)  | Último guardado  | Producto        |
| ---------------------------------------------- | -------------------------------------- | ---------------- | ---------------- | --------------- |
| COFOPRI BAGUA.dwg                              | `rutas/`                               | 02/09/2005 13:45 | 27/08/2023 03:47 | AutoCAD R.47.0  |
| RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg     | `rutas/`                               | 02/09/2005 13:45 | 31/08/2026 22:03 | AutoCAD S.51.0  |
| RUTA TOMAQUE - BRUJO PATA - CASUARINAS (1).bak | copia de trabajo de la primera entrega | 02/09/2005 13:45 | 31/08/2026 20:53 | AutoCAD S.51.0  |
| RUTAS CON TIEMPO.dwg                           | `rutas/`                               | 15/10/2010 20:49 | 24/09/2026 17:01 | AutoCAD W.164.0 |
| RUTAS CON TIEMPO.bak                           | copia de trabajo                       | 15/10/2010 20:49 | 10/09/2026 00:05 | AutoCAD S.51.0  |
| RUTAS bagua.dwg                                | `rutas/`                               | 15/10/2010 20:49 | 02/07/2026 23:51 | AutoCAD S.51.0  |
| RUTA ORGANICO.dwg                              | `rutas/`                               | 15/10/2010 20:49 | 10/09/2026 22:54 | AutoCAD S.51.0  |
| RUTA ORGANICO.bak                              | copia de trabajo                       | 15/10/2010 20:49 | 10/09/2026 21:38 | AutoCAD S.51.0  |
| RUTA LIMPIO.dwg                                | `rutas/`                               | 15/10/2010 20:49 | 13/10/2026 23:07 | AutoCAD W.164.0 |
| RUTA LIMPIO.bak                                | copia de trabajo                       | 15/10/2010 20:49 | 13/10/2026 21:41 | AutoCAD W.164.0 |

Los BAK ya no están en `rutas/`; se usaron las copias de trabajo de
`data/cad/converted/input/`, cuyo SHA-256 coincide con el inventario original
(los diez archivos coinciden). Las fechas proceden del DWG nativo (AuxHeader y
SummaryInfo); las del DXF son de la conversión ODA y no se usan.

## Qué no habían cubierto las pasadas anteriores

Revisando los scripts existentes se identificaron estos límites:

- `extract_cad.py` y `deep_audit.py` leen la **exportación DXF de ODA**, nunca el
  DWG. Toda pérdida de la conversión quedaba invisible.
- El DXF reescribe fechas y usuario de cabecera y omite SummaryInfo, AppInfo,
  historial de aplicaciones, vista previa y el almacén AcDs (ACIS).
- Los objetos de Civil 3D, Map 3D y Architectural Desktop aparecen como
  `ACAD_PROXY_*` sin clase.
- No se exportaban vistas, UCS, estilos de texto y fuentes, aplicaciones
  registradas, estados y filtros de capa, linaje de bloques dinámicos, REGION
  (ACIS), el detalle de sombreados (islas, áreas, degradados) ni los campos MTEXT.
- No se comparaba DWG frente a BAK entidad por entidad, ni las fuentes entre sí por entidad.
- La segunda pasada solo leyó RPU_GRAFICOS en `Limite Manzana`.

## Procedimientos nuevos

Todos son de solo lectura y se ejecutan con `npm run gis:forensic` (pruebas:
`npm run gis:forensic:test`).

1. **`dwg_native.py`**: lector propio del contenedor DWG R2004+ (AC1032).
   - Descifra la cabecera, lee el mapa de páginas y de secciones, y descomprime
     cada sección (LZ77 de ODA).
   - Decodifica SummaryInfo, AppInfo, AuxHeader y Preview.
   - Lee el mapa de handles y el tipo de cada objeto (censo nativo).
   - Decodifica bit a bit las entidades LINE, POINT, ARC, CIRCLE, SOLID, TEXT, MTEXT
     y BLOCK con su capa y propietario.
   - Validación: en las 3.680 páginas de tres archivos, cada página descomprime al
     tamaño exacto esperado.
   - El decodificador se contrastó con 600 objetos presentes en el DWG y en el DXF
     de cada archivo: **99–100 % coinciden** en geometría, capa, propietario y texto.
2. **`forensic_native.py`**: censo nativo frente al DXF, handle por handle; clases
   reales de los proxies; metadatos nativos; vista previa (PNG).
3. **`forensic_dxf.py`**: tablas, estados y filtros de capa, bloques dinámicos,
   REGION decodificadas desde ACIS (SAB), detalle completo de 1.250+ sombreados,
   campos, anotaciones operativas y contenido oculto.
4. **`forensic_versions.py`**: DWG frente a BAK, linaje entre los DWG de rutas y
   cruce Tomaque–COFOPRI por handle.
5. **`forensic_lost.py`**: recuperación de los objetos que la conversión ODA perdió.
6. **`forensic_matrix.py`**: matriz de coincidencias por entidad.
7. **`forensic_extras.py`** y **`forensic_report.py`**: capas complementarias,
   inventario e incertidumbres.
8. **`forensic_check.py`**: línea base y verificación de integridad.

## Hallazgos nuevos

### 1. La conversión DWG → DXF perdió contenido

| Archivo          | Objetos nativos | Solo en DWG | Recuperados | Qué era                                                     |
| ---------------- | --------------: | ----------: | ----------: | ----------------------------------------------------------- |
| Tomaque          |         111.369 |         524 |         342 | 41 bloques anónimos: 33 de cota (`*D`), 5 `*X`, 3 `*U`      |
| RUTAS CON TIEMPO |          26.025 |          46 |           4 | 4 textos de cajetín (código de hoja) en A0, R-2001 y R-2002 |
| RUTAS bagua      |          23.763 |          46 |           4 | Ídem                                                        |
| RUTA ORGANICO    |          23.937 |          49 |           4 | Ídem                                                        |
| RUTA LIMPIO      |          23.735 |         117 |           4 | Ídem                                                        |
| COFOPRI          |          21.039 |          23 |           0 | 18 XRECORD y 5 diccionarios                                 |

En Tomaque se recuperaron 107 líneas, 126 puntos de definición, 40 sólidos
(flechas), 27 arcos y 42 MTEXT. Son los gráficos de cota en coordenadas UTM del
dibujo; las 379 entidades DIMENSION siguen en el DXF.

Los XRECORD y diccionarios exclusivos del DWG (hasta 64 por archivo) se
decodificaron después; véase [Resolución de los pendientes](#resolución-de-los-pendientes-17102026).

### 2. Objetos propietarios identificados

Los 2.881–2.893 `ACAD_PROXY_OBJECT` de cada DWG de rutas y los 300–308 de COFOPRI y
Tomaque tienen ahora su clase real (`AEC_DISP_PROPS_*`, `AECC_*_STYLE`, `DMMAP`…). Son
**estilos y configuración** de Architectural Desktop, Civil 3D y Map 3D. No hay
superficies TIN, alineamientos ni puntos COGO de Civil 3D. Su contenido binario se
examinó después y no contiene coordenadas (véase la resolución de los pendientes).

### 3. Linaje de los archivos

- **Los cuatro DWG de rutas** nacieron del mismo dibujo (creación nativa idéntica,
  15/10/2010 20:49:26) y comparten handles:
  - RUTAS CON TIEMPO y RUTA LIMPIO: 23.599 handles comunes, 23.522 idénticos;
  - RUTAS bagua: unos 13.700 handles comunes con cada uno de los otros tres.
- **Tomaque y COFOPRI** tienen el mismo instante de creación (02/09/2005 13:45:48)
  y comparten 2.961 handles.
  - **43 entidades del modelo de Tomaque** (42 rótulos `Nomeclatura Lote` y un
    círculo) tienen el mismo handle y **las mismas coordenadas brutas que
    COFOPRI**. Se analizaron una por una: 36 pertenecen al marco de Tomaque y 7 no
    son determinables (véase la resolución de los pendientes). Las coordenadas
    originales no se modificaron (`versiones/tomaque-cofopri-coordenadas-identicas.json`).
- **DWG frente a BAK**: no hay ninguna entidad de dibujo distinta en los cuatro
  pares. Las diferencias son internas:
  - capa de 65–292 marcadores SEQEND;
  - 108 cotas de Tomaque cuyo bloque de dibujo se renumeró;
  - en el DWG nativo, de 3 a 62 XRECORD y tablas de orden de dibujo.

  Ningún archivo se dio por igual a otro antes de esta comparación.

### 4. Información nueva o ampliada

- **RPU_GRAFICOS en lotes**: 88 contornos `Limite Lote` y 2 `MANZANAS` con calles
  por lado. La segunda pasada solo tenía los 53 de manzana.
- **192 vértices numerados** (xdata VERTICES) de cuadros de construcción.
- **6 REGION** de Tomaque decodificadas desde ACIS. Las 40 aristas son rectas, así
  que dan polígonos exactos.
- **703 anotaciones operativas** extraídas sin interpretar: horas, días,
  frecuencias, inicio y fin de ruta, recolección. 614 tienen posición en el modelo.
- **Contenido oculto**: la capa DESC-USOS está congelada en Tomaque; hay 6 MTEXT
  ocultos y 496 entidades invisibles en bloques. Ninguna capa apagada ni
  bloqueada en las rutas.
- **Bloques dinámicos**: «Arrow 18» (4 representaciones) y las barras de escala de
  Map 3D; «Trees - Metric» en Tomaque. «Arrow 18» es la flecha de norte de Map 3D,
  no una flecha de ruta (parámetros decodificados más abajo).
- **Aplicaciones registradas**:
  - en los DWG de rutas, la plantilla de cantidades de Civil 3D (`AeccUiQTO…FloridaDOT`);
  - en Tomaque y COFOPRI, `RPU_GRAFICOS`, `VERTICES`, `EGPT_EPOD`, `DISTANCIAS`,
    `ANGULOS` y `ALIGNMENT_DB_APP`;
  - en Tomaque, los estados de capa `_LAYISO_STATE` y `LMAN_ACET-LAYISO`.
- **Almacén ACIS de Tomaque**: 8 blobs (ASM 218 y 223, fechas 11/12/2020 y
  25/10/2022). En el DXF solo hay 6 REGION, así que 2 blobs no tienen entidad
  conocida.
- **Vistas previas** embebidas (PNG de 256 px) de los diez archivos.

### 5. Matriz de coincidencias y complementariedad

Se comparan las 136.632 entidades del espacio modelo de los seis DWG, cada una
frente a cada otra fuente. Tolerancias: 5 cm por vértice, segmentos de 0,2 m y
textos a 1 m. **Ninguna relación implica duplicidad**:

| Resumen por entidad                                    | Entidades |
| ------------------------------------------------------ | --------: |
| Exclusiva (sin nada comparable en ninguna otra fuente) |    54.785 |
| Con relación de identidad en al menos una fuente       |    49.209 |
| Solo relaciones parciales o con atributos distintos    |    32.638 |

Relaciones relevantes:

- **Misma geometría, distinta clasificación.** Los contornos `VIVIENDA` de las
  rutas y de COFOPRI son `Limite Lote` en Tomaque (4.432 por archivo de rutas,
  1.962 en COFOPRI). Es la misma forma con dos clasificaciones: se conserva como
  relación pendiente de interpretación, sin fusionar.
- **Textos de COFOPRI en Tomaque**: 10.144 coinciden (rótulos y medidas de lote).
  Hay 29 textos distintos en la misma posición, la mayoría entre COFOPRI y Tomaque.
- **Información exclusiva**:
  - Tomaque: 5.607 contornos de lote, 9.580 rótulos de lote, 1.626 puntos
    topográficos (V-NODE) y 1.172 líneas de cota.
  - COFOPRI: 661 secciones viales.
  - RUTAS CON TIEMPO: 791 entidades de la capa ZANORA (horarios).
  - RUTA ORGANICO: 344 tramos de `PERIMETRO-SECTOR I` que no existen en las otras versiones.
- **Superposiciones parciales**: de 126 a 898 entidades por par de fuentes.

## Tabla de cobertura

| Categoría                                  | Estado                              | Detalle                                                                                    |
| ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Espacio modelo                             | Completo                            | Censo nativo = DXF en entidades de dibujo; 342 objetos perdidos recuperados                |
| Espacios de presentación y cajetines       | Completo                            | Textos, ventanas, escalas y fechas; 4 textos de cajetín recuperados del DWG                |
| Capas (visibles/apagadas/congeladas/bloq.) | Completo                            | 1 congelada (Tomaque); estados y filtros exportados                                        |
| Bloques insertados, anidados y anónimos    | Completo                            | Expandidos; 41 bloques anónimos perdidos por ODA recuperados                               |
| Bloques no insertados                      | Completo                            | Segunda pasada; traslaciones verificadas                                                   |
| Bloques dinámicos                          | Completo                            | Parámetros decodificados: flecha de norte y barras de escala de Map 3D; árboles de muestra |
| Textos, MTEXT, atributos                   | Completo                            | Personales retenidos en `privado/`                                                         |
| Tablas (ACAD_TABLE) y campos               | No existe en la fuente              | 0 en los diez archivos                                                                     |
| Geometría lineal, arcos, splines, círculos | Completo                            | Coordenadas originales y Z                                                                 |
| Sombreados                                 | Completo                            | 363 polígonos (181 con huecos); 48 no válidos registrados con su motivo, sin reparar       |
| REGION / ACIS                              | Completo                            | 8 blobs = 6 REGION; los 2 restantes son versiones anteriores de dos de ellas               |
| Flechas, símbolos, inicio/fin, paradas     | Extraído; interpretación parcial    | Ya publicados en cartografía; versiones en bloques no insertados sin decidir               |
| Cotas                                      | Completo                            | 379 medidas y gráficos de cota recuperados                                                 |
| Elevaciones Z y topografía                 | Completo con advertencias           | 1.025 cotas utilizables; curvas sin Z; desfase sistemático en copias                       |
| Lotes, manzanas, calles, sectores          | Extraído; interpretación pendiente  | RPU de lotes nuevo; contornos sin carácter de predio oficial                               |
| Rutas, horarios, frecuencias               | Extraído; interpretación parcial    | 703 anotaciones operativas sin asignar                                                     |
| XDATA                                      | Completo                            | Todas las aplicaciones inventariadas                                                       |
| XRECORD y diccionarios                     | Completo                            | Exclusivos del DWG decodificados: texturas de material, contabilidad interna, vacíos       |
| Proxies Civil 3D, Map 3D y ADT             | Identificado (no territorial)       | Cadenas y binario examinados: estilos y configuración; 0 coordenadas                       |
| GEODATA, CRS y unidades                    | Completo                            | Declarados, adoptados y contradicciones registradas                                        |
| Referencias externas, imágenes y OLE       | Completo / no recuperable           | OLE extraídos (logotipos); 5 imágenes y fuentes SHX no entregadas; sin xrefs activas       |
| Metadatos nativos                          | Completo (nuevo)                    | SummaryInfo, AppInfo, historial, AuxHeader y vista previa                                  |
| Versiones DWG/BAK                          | Completo                            | Comparación por handle                                                                     |
| Geometría en espacio papel                 | Parcial, con resultado por elemento | 7 copias del plano de ubicación georreferenciadas; el resto identificado no territorial    |
| Objetos borrados                           | No recuperable                      | El DWG no los lista en el mapa de handles; ObjFreeSpace solo guarda contadores             |
| VBA, firma y seguridad                     | No existe en la fuente              | Secciones ausentes en los diez archivos                                                    |

**No se afirma una extracción del 100 %.** Los cuatro grupos que la primera versión
de este informe dejaba sin decodificar (proxies, XRECORD exclusivos, 2 blobs ACIS y
parámetros de bloques dinámicos) se cerraron en la
[resolución de los pendientes](#resolución-de-los-pendientes-17102026). Lo que queda
fuera (imágenes externas, fuentes SHX, objetos borrados) no está en la entrega o no
existe en el formato.

## Resolución de los pendientes (17/10/2026)

Scripts: `forensic_pending.py` (binario nativo) y `forensic_pending_geo.py`
(geometría). Ambos son de solo lectura y forman parte de `npm run gis:forensic`.
Los decodificadores nuevos se validaron antes contra los objetos presentes en el
DWG y en el DXF:

- **Diccionarios:** 232 de 239 coinciden en nombres y destinos. En los otros 7, el
  DWG tiene entradas que el DXF perdió.
- **XRECORD:** 71 de 79 coinciden exactamente. En los otros 8, el DXF escribió el
  handle `0` donde el DWG conserva la referencia real.

| Pendiente                                                  | Resultado                                        | Qué se obtuvo                                                                                         | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contenido binario de los proxies de Civil 3D, Map 3D y ADT | **Identificado: no territorial**                 | 2.881–2.893 objetos por DWG de rutas, 1.950 en COFOPRI y 760 en Tomaque; cadenas y clases de cada uno | 0 pares de coordenadas UTM y 0 geográficas al leer cada double del binario en las 8 alineaciones de bit posibles. Cadenas: estilos de etiquetas y tablas, catálogos de tuberías, formatos de importación de puntos (NEZ/PNZ), gestión de visualización de Map 3D, elementos de impresión (norte, barra de escala «Metros», XML de la retícula)                                                                                                                           |
| Dos blobs ACIS sin entidad                                 | **Identificado**                                 | Los 8 blobs del almacén AcDs se emparejaron por geometría decodificada                                | 6 corresponden a las 6 REGION. Los 2 «sin entidad» (ACIS, 11/12/2020) tienen la misma geometría que las REGION 98990923 y 98990924, cuyos datos vigentes son blobs ASM del 25/10/2022: son versiones anteriores                                                                                                                                                                                                                                                          |
| XRECORD exclusivos del DWG                                 | **Recuperado e identificado**                    | 4–64 por archivo, decodificados                                                                       | Texturas de material (`DIFFUSETILE`, `BUMPTILE`… con 270=1, 271=1) y tripletes de contabilidad interna (referencia a una presentación y cuatro banderas en 0). Ningún valor en rango UTM                                                                                                                                                                                                                                                                                 |
| Diccionarios exclusivos del DWG                            | **Identificado**                                 | 5–52 por archivo                                                                                      | Vacíos o índices de texturas de material                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Parámetros de bloques dinámicos                            | **Recuperado e identificado: no territorial**    | Clase y cadenas de cada parámetro                                                                     | «Arrow 18» es la **flecha de norte de Map 3D**: rotación `Map.View.Rotation` y escala `Map.NorthArrow.Scale`, no una flecha de ruta. `ScaleBar*_Metric`: parámetro lineal y acción de escala. «Trees - Metric» (Tomaque): estados de visibilidad de árboles de muestra (Palm, Shrub…)                                                                                                                                                                                    |
| 43 entidades de Tomaque con coordenadas de COFOPRI         | **Recuperado: marco por entidad**                | 36 pertenecen al **marco de Tomaque** (traslación +3,589 / +2,352 m); 7 no son determinables          | Cuatro pruebas por entidad en ambas posiciones candidatas: geometría propia de Tomaque, parcelas georreferenciadas, mismo texto en otra fuente a ≤1 m y entorno en COFOPRI. Las letras de vértice están a 0,5–2,7 m de las líneas que rotulan, y 13 tienen copia idéntica en Tomaque en esa misma posición; en el marco de COFOPRI no hay geometría a 100 m. En COFOPRI estas entidades también están aisladas: la anomalía está en las copias de COFOPRI, no en Tomaque |
| Las 7 no determinables                                     | **No determinable con los recursos disponibles** | «P-12», «P-13», «P-41», «CAMINO A PARCELA», «ZONA MILITAR» y dos «VALLE HUARANGOPAMPA»                | No tienen gemelo en ninguna fuente, y las pruebas geométricas dan señales opuestas o ninguna. Hace falta un plano de parcelas georreferenciado que las contenga                                                                                                                                                                                                                                                                                                          |
| Sombreados con huecos                                      | **Recuperado**                                   | 151 sombreados con varios anillos dan 363 polígonos, 181 con huecos                                   | Regla par-impar por profundidad de contención. Se descartaron 67 anillos degenerados (menos de 3 vértices distintos). PostGIS (transacción de solo lectura): 315 válidos y 48 con autointersección, registrados con su motivo y sin reparar                                                                                                                                                                                                                              |
| Espacio papel: contenido sobre ventanas                    | **Identificado: no alineado**                    | 34 ventanas comprobadas                                                                               | En todas, de 0 % a 1,2 % de los vértices transformados por la ventana coinciden con el modelo. Son flechas de norte (bloques de 1.395 entidades en la capa `NORTE`), cajetines y membretes                                                                                                                                                                                                                                                                               |
| Espacio papel: planos de ubicación                         | **Recuperado**                                   | 7 copias del plano de ubicación de «PLANO DEL ALVERGUE» georreferenciadas: 13.208 elementos           | Semejanza ajustada con rótulos de calles: escala 1:5.000, rotación −0,027°, 36 de 48 rótulos como inliers, RMS 16,9 m. Validación independiente: el 88,3 % de 7.139 vértices queda a ≤5 m de las líneas del modelo (mediana 1,74 m)                                                                                                                                                                                                                                      |
| Espacio papel: resto                                       | **Identificado: no territorial**                 | Clasificado por hoja y capa                                                                           | Cajetines, membretes, secciones viales (`SECCCION`) y flechas de norte, sin referencia geográfica                                                                                                                                                                                                                                                                                                                                                                        |

Archivos nuevos en `data/cad/extracted/tercera/`:

- `pendientes/<archivo>.json`: proxies, XRECORD, diccionarios y parámetros dinámicos.
- `pendientes/geo-*.json`: ACIS, marcos de las 43 entidades, sombreados y espacio papel.
- `complementos/sombreados-con-huecos.geojson`, `complementos/espacio-papel-georreferenciado.geojson`
  y `complementos/tomaque-43-marco-asignado.geojson`.

Las coordenadas originales se conservan en todos ellos. Cada elemento indica cómo
se obtuvo su posición.

## Registro de incertidumbres

`data/cad/extracted/tercera/incertidumbres.json` recoge 96 entradas con categoría,
fuente, evidencia y estado. Las principales:

1. **CRS**
   - Los cajetines de Tomaque dicen PSAD 56; la traslación adoptada contradice ese rótulo.
   - `$INSUNITS` de Tomaque indica milímetros, pero las coordenadas están en metros.
   - 43 entidades con coordenadas de COFOPRI: 36 asignadas al marco de Tomaque y 7 no determinables.
2. **Conversión**: hay objetos que existen solo en el DWG nativo, en los diez archivos.
3. **Dependencias ausentes**: 5 imágenes externas de Tomaque, fuentes SHX, y los
   PDF y BAK, que ya no están en `rutas/`.
4. **Fechas**: las cabeceras del DXF no son fiables; se usan las del DWG nativo.
5. **Interpretación pendiente**:
   - el código EGPT_EPOD y el orden de lados de RPU;
   - si «2026» es código de ruta o año;
   - los horarios extraídos, sin asignar a rutas;
   - los 19.971 pares con la misma geometría y capa distinta.
6. **Topografía**: curvas de nivel sin elevación y desfase Z de −414,516 m en copias.
7. **Privacidad**: los nombres de propietarios y autores y las rutas locales se
   guardan solo en `tercera/privado/`.

## Archivos

`data/cad/extracted/tercera/` (excluido de Git):

| Ruta                                   | Contenido                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `inventario.json`                      | Inventario por archivo: anteriores, nuevo, sin interpretar, límites          |
| `incertidumbres.json`                  | Registro de incertidumbres                                                   |
| `nativo/`, `preview/`                  | Contenedor, metadatos y censo nativo; vistas previas                         |
| `dxf/`                                 | Tablas, capas, bloques dinámicos, REGION, sombreados, textos                 |
| `versiones/`                           | DWG/BAK, linaje y cruce Tomaque–COFOPRI                                      |
| `perdidos/`                            | Objetos recuperados del DWG nativo                                           |
| `matriz/`                              | Relaciones por entidad, matriz por fuentes, capas, regiones, contradicciones |
| `complementos/`                        | RPU, vértices, REGION, perdidos y anotaciones operativas (GeoJSON)           |
| `privado/`                             | Autores, usuarios, rutas locales y textos retenidos                          |
| `linea-base.json`, `verificacion.json` | Integridad                                                                   |

Cada elemento conserva archivo, handle o referencia CAD, capa, coordenadas
originales y cómo se obtuvo su posición. Los datos se marcan como `extraido`,
`derivado` o `interpretacion` (pendiente).

## Integridad y pruebas

- **`forensic_check.py --verify`**: los 270 archivos protegidos (originales, copias
  de trabajo, extracciones anteriores y paquetes) y los recuentos de PostGIS
  (predios 26, rutas 12, cad_features 82.186, cad_review 136.636…) no cambiaron.
  Tampoco hay campos privados en las salidas publicables. Verificado de nuevo el
  17/10/2026, tras resolver los pendientes: la validación de sombreados con PostGIS
  se hizo en transacciones de solo lectura.
- **`scripts/gis/tests/test_forensic.py`**: 17 pruebas.
  - Unitarias con flujos sintéticos: descompresión, lectura de bits, códigos de handle.
  - De integración con los archivos reales: cabecera, todas las secciones, fechas,
    censo nativo, decodificador de entidades y decodificadores de XRECORD y
    diccionarios frente al DXF.
  - De salida: hashes de originales y ausencia de datos privados.

## Oportunidades para la unificación futura

1. Ubicar las 7 entidades no determinables con un plano de parcelas georreferenciado.
2. Usar la relación `VIVIENDA` ↔ `Limite Lote` para vincular clasificaciones, sin fusionar.
3. Contrastar los 344 tramos exclusivos de RUTA ORGANICO y las versiones en bloques
   no insertados con la Gerencia antes de integrarlos.
4. Asignar, con validación municipal, las 703 anotaciones operativas a rutas.
5. Incorporar los lotes con RPU y los vértices numerados como capa de revisión.
