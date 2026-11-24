# Edificaciones complementarias

Capa **aditiva** de huellas de otras fuentes abiertas que Overture no tiene. Overture
(14.357 edificaciones) sigue siendo la base **inmutable**: sus identificadores GERS están
referenciados por alturas, vínculos espaciales y expedientes, y sus PMTiles no se reconstruyen.
Las huellas nuevas viven en `bagua_master.edificio_complemento` (migración 030), se sirven por
`/api/bagua-master/complemento/mapa` y se dibujan sobre Overture. Ninguna es un predio ni un dato
validado en campo, y ninguna puede vincularse a un expediente: `gestion.vinculo_espacial`
referencia solo `bagua_master.edificio`.

> **Ajuste de coherencia (22/11/2026):** tras alinear las calles, se retiraron 385 huellas que
> quedaban en plena calzada y se recortaron 1.170. Quedan **6.160** complementarias (20.517 con
> Overture) y 96,4 % de lotes CAD con huella. Detalle en [coherencia interna](coherencia-interna.md).

## Resultado (corrida del 22/11/2026)

| Fuente                                      | Leídas en el ámbito |                  Duplicadas |       Otras bajas | **Añadidas** | Confianza  |
| ------------------------------------------- | ------------------: | --------------------------: | ----------------: | -----------: | ---------- |
| OpenStreetMap (Overture + Overpass)         |                 330 |                         330 |                 0 |        **0** | alta       |
| Google Open Buildings v3 crudo (tesela 91b) |              20.733 |                      13.875 | 1.677 (área/agua) |    **5.181** | media/baja |
| Microsoft Global ML Footprints (feb. 2026)  |               8.860 |                       8.705 |     9 (área/agua) |      **146** | media      |
| Presencia Google 2.5D Temporal 2023         |               2.793 | 1.063 (+512 entre recortes) |                 0 |    **1.218** | baja       |
| **Total complementario**                    |                     |                             |                   |    **6.545** |            |

Con Overture, la capa suma **20.902** huellas. Contra los 6.475 lotes CAD municipales (solo
como medición, no se derivan predios), los lotes con alguna huella suben de **86,5 % a 96,9 %**,
y la superficie de las zonas municipales cubierta por huellas de 22,7 % a 33,0 %. El 3,1 % de
lotes sin huella puede ser lote vacío real; no se completa por suposición.

Alturas (Google 2.5D Temporal, mismos umbrales que el resto del módulo): **2.354** huellas con
altura satelital y **4.191** con 3,0 m de referencia (`origen_altura = 'estimada_default'`),
dibujadas en color arena en 2.5D. El DSM del dron las sobrescribirá (`dron_dsm`).

### Google crudo sí aporta en Bagua

Se esperaba un aporte casi nulo porque Overture ya incorpora Google desde 0,6501. La tesela
completa lo desmintió: de 20.733 huellas de Google en el ámbito, 13.875 coinciden con Overture
y **5.181 no están en él** (confianza 0,65–0,95, mediana 0,776). Overture descarta parte de
Google al conflar con otras fuentes; aquí se recuperan con la misma regla de solape (< 25 %).

### Precisión relativa (indicio, no validación)

Dentro de las zonas con lotes CAD, un edificio real debería caer dentro de un lote. Las huellas
de Overture lo hacen el 61,9 % de las veces (línea base: los lotes no cubren calles ni patios).
Las nuevas de Google crudo, el 66,6 % (1.067 de 1.602 en zonas); las de Microsoft, el 42,4 %
(14 de 33); las de presencia, el 36,1 % (70 de 194). La procedencia y la confianza se guardan
en los datos y en la ficha («Origen de la huella»); en el mapa todas se dibujan igual.
Solo 1.829 de las 6.545 caen dentro de zonas medibles; el resto no tiene control.

## Método

1. **Base:** Overture, sin cambios. Todo en UTM 17S (EPSG:32717).
2. **Orden de inserción:** Overture → OSM → Google crudo → Microsoft → presencia temporal. (El
   plan pedía OSM primero; no puede reemplazar a Overture sin romper vínculos y alturas.)
3. **Regla de entrada:** válida; 15–5.000 m² en fuentes inferidas; no sobre agua de Overture
   (≥ 50 %); solape con lo aceptado < 25 % de la candidata y ninguna huella aceptada con ≥ 50 %
   de su superficie dentro de la candidata; entre candidatas de una fuente gana la de mayor
   confianza y luego la mayor.
4. **Regularización:** rectángulo mínimo si la huella es ≥ 90 % rectangular; si no, simplificación
   de 0,25 m (OSM sin tocar). Cada huella guarda su método y su IoU.
5. **Presencia:** celdas de 2 m con presencia ≥ 0,7 y altura > 0, a más de 3 m de cualquier huella
   conocida; polígonos de 25–5.000 m² y compactos (≥ 0,6); suavizado a 1 m.
6. **Trazabilidad:** `fuente`, `confianza_geo` (alta/media/baja), registro de origen, licencia,
   origen de la altura y versión de la fusión (hash). Entradas con SHA-256 en
   `data/bagua-master/complemento/fusion.json`.

```sh
npm run bagua-master:fusionar-edificaciones                      # OSM + Google (si hay) + Microsoft
npm run bagua-master:presencia-google                            # docker (rasterio)
npm run bagua-master:fusionar-edificaciones-presencia
npm run bagua-master:alturas-complemento                         # docker (rasterio)
npm run bagua-master:importar-complemento                        # reemplazo transaccional e idempotente
.venv-gis/Scripts/python -m unittest discover -s scripts/bagua-master -p "test_fusionar_edificaciones.py"
```

## No se hizo (y por qué)

- **Overture 2026-10-21 y 2026-11-18:** el snapshot del módulo sigue fijado en 2026-09-23.1. La
  consulta de la versión nueva para el ámbito no terminó en más de 90 minutos por el ancho de
  banda, así que no se sabe qué aporta; los IDs GERS vinculados no se cambian sin un cotejo.
- **GlobalBuildingAtlas (polígonos):** la tesela de Bagua pesa 2,4 GB en un único GeoJSON sin
  acceso parcial; a la velocidad medida (≈ 20 KB/s) es inviable, y su propiedad `source` indica
  que buena parte son polígonos de Google/Microsoft reetiquetados. Licencia CC BY-NC en la parte
  no ODbL. Las alturas de GBA ya están integradas aparte.
- **Segmentación con IA sobre imagen satelital (SAM/RAMP):** no se ejecutó. El único teselado de
  alta resolución accesible es Esri World Imagery, cuyas condiciones no permiten la descarga
  masiva ni la extracción de entidades; no hay otra imagen abierta de resolución suficiente. La
  detección por presencia de Google (CC BY 4.0) cubre ese hueco con menor calidad. Si el
  municipio dispone de imagen con licencia, el pipeline admite `sat_sam` como fuente.
- **Manzanas INEI:** no están disponibles sin conexión; la medición usa los lotes y zonas CAD
  municipales (solo Tomaque y alrededores), así que la cobertura del resto de Bagua no está
  medida.
- **"Registrar punto sin polígono" en la PWA y migración al dron:** no implementados. Para el
  dron bastará un `ST_Intersects`/mayor área entre el nuevo polígono y esta tabla; vincular
  predios a estas huellas exige antes generalizar la clave foránea de `vinculo_espacial`
  (hoy solo `edificio`).

## Licencias

OSM y Microsoft son **ODbL-1.0**: publicar esta capa fuera de la instalación local exige
atribución y compartir bajo ODbL. Google 2.5D Temporal es CC BY 4.0. Las atribuciones están en
el mapa y en cada ficha.
