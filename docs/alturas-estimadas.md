# Alturas estimadas y vista 2.5D

BAGUA MASTER conserva las **14.357 huellas originales** de Overture y completa su vista 2.5D:

| Origen de altura                           | Edificios | Significado                                     |
| ------------------------------------------ | --------: | ----------------------------------------------- |
| Google Open Buildings Temporal 2023        |     1.997 | Estimación satelital                            |
| GlobalBuildingAtlas / TUM, referencia 2019 |     6.776 | Estimación satelital añadida donde falta Google |
| Simulación reproducible                    |     5.584 | Modelo visual; no altura individual observada   |
| Total                                      |    14.357 | Cobertura visual completa                       |

Las simulaciones se dibujan en color arena y se pueden ocultar con **Mostrar simuladas**.
Las estimaciones externas se mantienen en verde. La ficha de cada volumen distingue el
origen, la licencia y el año; nunca se presentan valores sintéticos como datos satelitales.
No se han validado alturas ni alineación en campo.

En `/bagua-master`, pulsa **2D** en la barra derecha para activar **2.5D**.
La cámara se inclina; arrastrar con el botón derecho permite girar. En pantallas
táctiles se puede girar con dos dedos. Volver a 2D restablece inclinación y orientación.
Al pulsar un volumen se muestra su altura estimada, fuente, fecha y cobertura válida.
Las rutas municipales se pueden activar simultáneamente.

## Fuente y significado

- [Producto y limitaciones de Google](https://sites.research.google/gr/open-buildings/temporal).
- [Catálogo](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1).
- [Procedimiento de descarga](https://github.com/google-research/google-research/blob/master/building_detection/open_buildings_temporal_download_region_geotiffs.ipynb).
- Licencia seleccionada: CC BY 4.0; atribución visible en el mapa.

Son estimaciones de altura **sobre el terreno**, no cotas absolutas, número de
pisos ni medidas catastrales. Los archivos publicados tienen píxeles de 0,5 m,
pero la resolución efectiva declarada por Google es aproximadamente 4 m.
Puede haber desplazamientos respecto a las huellas y cambios posteriores a 2023.

## Método reproducible

1. Leer las huellas válidas de `bagua_master.edificio` y localizar por su extensión
   los manifiestos públicos de Google de 2023 (S2 nivel 2).
2. Consultar por HTTP Range únicamente las ventanas de altura/presencia necesarias.
   Promediar en cuadrícula de 2 m y guardar recortes con SHA-256 para poder repetir.
3. Tomar los centros de píxel interiores a cada huella. Aceptar altura positiva de
   hasta 100 m con presencia >=0,7. Este umbral no es una probabilidad calibrada.
4. Exigir al menos cuatro muestras y cobertura válida de al menos el 50 % de los
   píxeles interiores. Calcular la mediana y redondear a 0,5 m (no implica esa precisión).
   En solapamientos, preferir mayor cobertura y después más muestras.
5. Publicar el resultado de forma transaccional en `bagua_master.altura_estimada`
   (migración 013), con referencia al identificador Overture. Nunca asignar una
   altura por defecto a las huellas rechazadas.

La importación de Google reemplaza solo su fuente y tiene prioridad frente a GBA; las huellas,
`altura_m`, `num_pisos`, las teselas PMTiles originales y los datos municipales
permanecen sin cambios. La ausencia de estimación no demuestra ausencia de edificio.

```sh
python3 -m venv .venv-gis
.venv-gis/bin/python -m pip install -r scripts/bagua-master/requirements-heights.txt
npm run infra:up
npm run bagua-master:alturas
.venv-gis/bin/python -m unittest discover -s scripts/bagua-master -p 'test_estimate_heights.py'
```

En Windows el ejecutor npm reconoce `.venv-gis/Scripts/python.exe`.
Sin `--importar`, `estimate_heights.py` solo calcula y guarda resultados. En
`data/bagua-master/alturas/` se conservan CSV, manifiestos, recortes y procedencia.
No se necesita una cuenta de Earth Engine.

## Publicación

`GET /api/bagua-master/alturas/mapa` devuelve las geometrías originales con altura
para extrusión. La fuente GeoJSON se descarga solo al activar 2.5D y se conserva
en caché del cliente. Se aprovecha gzip de Nginx y el teselado interno de MapLibre;
no se reconstruyen ni mezclan las PMTiles de Overture. La ficha y el resumen de la
API diferencian alturas originales de las estimadas.

En esta entrega se implementa en BAGUA MASTER; el visor municipal de `/` conserva
su funcionamiento. Las nuevas fuentes deben validarse con una muestra local; los umbrales no se relajan silenciosamente.

## Ampliación: GlobalBuildingAtlas, Microsoft y GHSL

Se revisaron el [repositorio oficial de Microsoft](https://github.com/microsoft/GlobalMLBuildingFootprints),
el [repositorio de GBA](https://github.com/zhu-xlab/GlobalBuildingAtlas) y
[GHSL ANBH](https://registry.opendata.aws/ghs-built-h/).

- Microsoft: la partición `210012000` (actualizada en febrero de 2026) contiene
  8.380 huellas que intersectan el área consultada, **ninguna con altura positiva**.
- GlobalBuildingAtlas: se leyeron por rangos FTP el índice ZIP y únicamente las dos
  teselas de 0,2° que intersectan Bagua. El ZIP de la región mide unos 87 GB, pero
  solo se transfirieron los dos miembros necesarios (unos 483 MB comprimidos).
  Los TIFF se comprobaron contra tamaño y CRC32 del índice y se registró su SHA-256.
  Sus alturas de 3 m se cruzaron con las huellas de Overture que no tenían Google.
  Se aceptan al menos cuatro centros de píxel interiores con altura entre 2 y 100 m
  y cobertura válida >=50 %. Se usa la mediana redondeada a 0,5 m. No hay banda de
  confianza en los TIFF utilizados. Resultado: **6.776 estimaciones adicionales**.
- GBA tiene referencia anual 2019 (imágenes de 2018 donde fue necesario). El día
  `2019-01-01` es solo el almacenamiento del año: `fecha_precision=anio` y la ficha
  muestra únicamente **2019 (referencia anual)**. Licencia: **CC BY-NC 4.0**.
- GHSL ANBH 2018: recorte del COG público por HTTP Range; promedio de alturas por
  celda de unos 100 m. Se utiliza como contexto del modelo, nunca como altura
  observada de un edificio individual. Licencia: CC BY 4.0.

## Modelo de simulación

La tabla independiente `bagua_master.altura_simulada` (migración 014) representa
solo los edificios sin alturas originales ni estimaciones externas. La prioridad
es **Overture → Google → GBA → simulación**.

- Busca hasta 40 donantes en 350 m con superficie comparable (razón 0,35–3).
  Sin cinco donantes cercanos, usa la distribución global de huellas comparables.
- Combina 85 % de la mediana satelital y 15 % del contexto GHSL cuando está disponible.
- Muestrea una distribución lognormal con dispersión acotada; una perturbación
  compartida por celdas de 150 m aporta coherencia espacial.
- Usa semilla SHA-256 de versión del algoritmo e identificador: mismos datos y
  versión producen las mismas alturas, independientemente del orden de ejecución.
- Emplea módulos visuales de 3 m más una pequeña variación de cubierta; limita
  la salida a 1–5 niveles visuales. No guarda ni publica esos niveles como pisos reales.
- Para huellas <25 m² limita a 3,5 m; para huellas >400 m² y proporción >4 limita
  a 9,5 m. Son priors gráficos, no clasificación observada del uso de la edificación.
- Alturas simuladas entre 2,7 y 18 m. La plausibilidad es visual, no precisión local.

Los recuentos por fuente se obtienen de la base. El endpoint de alturas publica
`tipo=estimada|simulada|publicada`; el visor permite ocultar simulaciones sin
ocultar las estimaciones externas. La migración 015 incorpora licencia y precisión
anual/diaria de fecha. Los datos originales y las teselas de Overture permanecen intactos.

```sh
npm run bagua-master:descargar-alturas-gba
npm run bagua-master:importar-alturas-gba
npm run bagua-master:completar-alturas
.venv-gis/bin/python -m unittest discover -s scripts/bagua-master -p 'test_*heights.py'
```

Los comandos deben ejecutarse después de `npm run infra:up` para aplicar las
migraciones 014 y 015. Si se vuelve a importar Google o GBA, repetir después
`bagua-master:completar-alturas`. Las importaciones son transaccionales y las
estimaciones externas siempre prevalecen sobre simulaciones antiguas.

La evidencia de búsqueda, índices, recortes, metadatos, CSV y manifiestos se conserva
en `data/bagua-master/alturas/fuentes-adicionales/` (datos locales excluidos de Git).
