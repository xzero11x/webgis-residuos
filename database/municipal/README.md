# Paquete municipal derivado

Generado localmente con `npm run gis:build`. Los datos municipales y sus textos
no se incorporan a Git. Las imágenes Docker locales sí incluyen este paquete para
importarlo de forma reproducible.

- `manifest.json`: fuentes, SHA-256, reglas aplicadas, servicios provisionales,
  rutas, geometrías originales UTM y geometrías para visualización.
- `cad-entities.jsonl.gz`: entidades únicas del espacio modelo, atributos,
  coordenadas originales y referencias a cada ocurrencia en DWG/BAK.
- `osm-reference.json`: calles OSM usadas exclusivamente en la comparación de QA.
- `segunda-pasada.json.gz`: capas de revisión de la segunda pasada DWG
  (`npm run gis:deep:package`), importadas con `npm run import:segunda-pasada` en
  `cad_second_pass`. Ver [segunda pasada](../../docs/dwg-segunda-pasada.md).
- `cad-reconciliation.json.gz`: Ruta 2026, sus flechas y las geometrías de los seis
  DWG para el explorador CAD (`npm run gis:reconcile`), importados con
  `npm run import:reconciliation` en `rutas`, `municipal_cartography` y `cad_review`.
  COFOPRI usa la traslación de `align_cofopri.py`, adoptada como su CRS el 16/10/2026.

`npm run import:municipal` exige la migración 002. Repetir el mismo paquete no
duplica ni modifica datos. Un paquete nuevo actualiza trazados documentales y
reconstruye sólo `cad_features`, dentro de una transacción. No modifica predios,
personas, vínculos ni registros DEMO. Los horarios y frecuencias quedan nulos.

Los códigos `MUN-*` y `CAD-*` son identificadores técnicos de importación. Sólo
1001, 2001 y 2002 se verificaron como códigos de ruta del plano; los demás nombres
describen la fuente o la interpretación pendiente.

La institucional (Ruta Tomaque – Brujo Pata – Casuarinas) usa el CRS adoptado para
Tomaque el 16/10/2026: EPSG:32717 tras trasladar +3,589 m E y +2,352 m N
(`metadata.tomaqueTranslation`, `metadata.crsEvidence`). `gis:build` lee esa
traslación de `data/cad/gis/segunda-pasada/tomaque-alineacion.json`, por lo que
`gis:deep` debe ejecutarse antes. Las entidades CAD de Tomaque en `cad_features`
conservan sus coordenadas de dibujo sin SRID.

Ver [procesamiento y resultados](../../docs/municipal-gis.md).
