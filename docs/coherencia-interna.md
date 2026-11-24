# Coherencia interna del mapa

Objetivo: que edificios, calles y rutas encajen entre sí. No es una corrección topográfica: sin
puntos de control de campo nadie sabe cuál capa está en su posición real. La referencia elegida
es la **red vial de Overture**. Los DWG y CAD municipales no sirven de referencia porque, según
la propia gerencia de gestión ambiental, son deficientes.

Los originales se conservan siempre: `data/bagua-master/intermedio/original/`,
`data/bagua-master/complemento/original/`, `data/bagua-master/rutas/original/` y
`data/bagua-master/teselas/original/`. La base `bagua_master.edificio` (Overture), sus
identificadores, alturas y vínculos con predios y expedientes **no cambian**.

## Diagnóstico (22/11/2026)

`scripts/bagua-master/diagnostico_coherencia.py` → `data/bagua-master/coherencia/diagnostico.json`

- **Invasión de calzada:** se mide con el eje de cada vía y un semiancho mínimo por clase (4,5 m en
  vías principales, 3,75 m en secundarias, 3 m en residenciales y 2 m en vías de servicio; los
  senderos no cuentan). De 20.902 huellas, 3.665 tocaban la calzada y 662 la ocupaban en ≥ 40 %
  (486 de ellas de Google crudo; de Overture, 72).
- **Desfase sistemático:** la traslación de las vías que minimiza la invasión es **0,0 m E, −2,5 m N**
  frente a las huellas de Overture (−48 % de invasión), con una dispersión de solo ±0,8 m entre
  sectores de 600 m. Es el desfase típico entre la imagen con que se trazaron las calles (OSM) y la
  usada por Google y Microsoft para los edificios. Al ser casi uniforme, basta **una traslación**;
  no hace falta deformación local.
- **Rutas DWG:** mediana de 2,4 a 7,8 m respecto del eje vial y desfases propios de cada ruta (hasta
  12 m): cada ruta se trazó con una georreferencia distinta.

## Ajuste

`scripts/bagua-master/ajustar_coherencia.py` → `data/bagua-master/coherencia/ajuste.json`

1. **Red vial y capas trazadas con la misma imagen** (`red_vial`, `calles_rotulo`, `conectores`,
   `usos_suelo`, `agua`): trasladadas −2,5 m al norte. No cambian identificadores ni atributos.
2. **Huellas complementarias:** con las calles ya trasladadas, se retiraron 385 que seguían en plena
   calzada (252 de Google crudo, 117 de presencia, 16 de Microsoft) y se recortaron 1.170. Quedan
   **6.160** (con Overture, **20.517** huellas). El recorte queda en `atributos.recorte`.
3. **Overture:** sin invasión pasan de 12.463 a 13.105; con invasión media (10–40 %), de 919 a 412.
   Las 1.168 que aún rozaban la calzada se recortan **solo en las teselas**; las 84 que la ocupan en
   ≥ 40 % se dejan como están (no se pueden retirar y recortarlas las desfiguraría).
4. **Rutas DWG:** traslación propia de cada ruta y ajuste a la red vial (_map matching_: preferencia
   por la misma vía y su dirección; entre tramos, camino más corto por la red). Las siete rutas
   quedan sobre el eje de la calle (mediana 0,0 m). Sin calle de Overture a menos de 25 m quedan
   1,2 km de CAD-2026 y 2,5 km de CAD-RUTAS: conservan su trazo trasladado. Flechas y marcadores se
   reubican sobre el trazo ajustado conservando su sentido. Cada ruta guarda `geometria_dwg` (trazo
   original) y `ajuste_coherencia` (traslación y distancias antes/después).
5. **Plazas, parques y canchas:** las huellas que están ≥ 60 % dentro de uno se ocultan (14 de
   Overture, entre ellas la glorieta y el estrado de la Plaza de Armas, y 1 complementaria). Las de
   Overture no se borran: se publican en `coherencia/ocultos_automaticos.json` y el mapa las filtra
   en 2D y en 2.5D/3D igual que una corrección local.
6. **Mapa:** el ancho dibujado de las calles residenciales (6 m) y de servicio (4 m) coincide con el
   corredor usado en el ajuste.

Cobertura de lotes CAD con alguna huella: 96,4 % (antes del ajuste, 96,9 %). Como los lotes CAD son
deficientes, esta cifra solo mide concordancia con el CAD, no precisión.

## Vistas 2.5D/3D y avenidas de doble calzada

- **3D:** los volúmenes usan la misma forma recortada que las teselas 2D
  (`bagua_master.edificio_geom_mapa`, migración 032; 1.168 huellas), así que tampoco pisan la calle.
  La huella original de `bagua_master.edificio` no cambia.
- **Doble calzada:** Héroes del Cenepa, Circunvalación, Agropecuaria y Vía de Evitamiento son dos
  ejes paralelos (uno por sentido) separados 8–15 m: así las publica Overture/OSM y es correcto.
  Antes cada calzada se dibujaba con 9 m más su borde y, donde la separación era menor, se juntaban.
  El ajuste marca 86 tramos (`doble_calzada`, `separacion_m`) y el mapa dibuja cada calzada con la
  separación menos 3,5 m de berma (mínimo 3 m): desde el zoom de calle se ven siempre las dos
  calzadas; a escala de ciudad la pareja se lee como una sola avenida.

## Forma de los edificios y ancho de las calles

- **Formas más amables:** todas las huellas que dibuja el mapa (Overture en teselas y en 2.5D/3D,
  y las complementarias) pierden dientes, espigas y muescas de menos de ~1 m (típicos de la
  detección automática) y tienen las esquinas exteriores levemente redondeadas (0,5 m). Si la
  forma cambiara más de −15 %/+10 % de superficie se deja la original. La huella original de
  `bagua_master.edificio` no cambia (`edificio_geom_mapa.motivo = 'suavizado'`, migración 033).
- **Ancho de las calles:** entre fachadas hay una mediana de 12 m en calles residenciales, pero la
  calle se dibujaba con 6 m. Ahora cada tramo con edificios a ambos lados recibe `ancho_m`: dos
  veces la distancia mediana del eje a la fachada más cercana, menos 0,4 m, entre 6 y 9 m en
  residenciales (7,5 a 11 m en secundarias, 9 a 12 m en principales). 792 tramos, mediana 7,5 m.
  Las calles se dibujan **debajo** de los edificios: donde el tramo se estrecha, la fachada tapa
  el borde de la calle en vez de quedar pisada.

## Correcciones locales

Lo que ninguna fuente abierta resuelve lo corrige quien conoce Bagua, desde el propio mapa (botón
**Corregir**, solo con sesión de registro o administración):

- **No existe:** en la ficha de un lugar o una edificación; queda oculto para todos.
- **Mover ubicación:** en la ficha de un lugar; se toca el mapa donde está realmente.
- **Dibujar una edificación que falta:** se tocan sus esquinas (6–5.000 m², sin cruces).

Cada corrección exige un motivo, guarda el autor y la fecha, y se **anula** (no se borra) desde el
panel de correcciones. Viven en `bagua_master.correccion` (migración 031), encima de Overture y de
la capa complementaria: no modifican esas tablas y sobreviven a una nueva importación. La lectura
pública (`/api/bagua-master/correcciones`) no incluye autor ni motivo; el detalle está en
`/api/gestion/correcciones-mapa`. La búsqueda respeta los lugares ocultos y reubicados. Se pueden
tomar referencias visuales de cualquier servicio, pero no copiar sus datos: Google Maps, por
ejemplo, no permite extraer sus polígonos ni sus ubicaciones.

## Qué no resuelve

- La posición absoluta de todo el conjunto. Para fijarla bastan 20–30 puntos medidos con GPS en
  esquinas: una sola traslación movería todas las capas a la vez.
- Superposiciones entre huellas de Overture y complementarias (la fusión admite hasta 25 % de solape).
- Las 84 huellas de Overture que ocupan ≥ 40 % de calzada: puede estar mal la vía o el edificio.

## Comandos

```sh
npm run bagua-master:diagnostico-coherencia   # mide sobre los originales
npm run bagua-master:ajustar-coherencia       # idempotente: siempre parte de los originales
npm run bagua-master:teselas                  # requiere la imagen bagua-master-tiles (imagen-teselas)
npm run bagua-master:importar-geometria-mapa  # forma recortada para 2.5D/3D
npm run bagua-master:importar-complemento
npm run bagua-master:importar-rutas
.venv-gis/Scripts/python -m unittest discover -s scripts/bagua-master -p "test_ajustar_coherencia.py"
```

Si se vuelve a correr la fusión o la exportación de rutas, el ajuste lo detecta por hash y parte del
archivo nuevo; nunca aplica la traslación dos veces.
