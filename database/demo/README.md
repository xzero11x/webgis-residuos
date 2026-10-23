# Datos DEMO reemplazables

24 predios ficticios, 3 servicios, 3 rutas, 6 puntos y 2 sectores provisionales.
Nombres, numeraciones, horarios, vínculos y límites parcelarios son de prueba.
No representan catastro, personas reales ni cobertura validada por la Municipalidad.

Las líneas de rutas siguen fragmentos de calles obtenidos de OpenStreetMap el
13 de octubre de 2026 mediante su API pública. Fuente: vías
[107521929](https://www.openstreetmap.org/way/107521929),
[107521939](https://www.openstreetmap.org/way/107521939) y
[107521947](https://www.openstreetmap.org/way/107521947).
© OpenStreetMap contributors, datos bajo ODbL:
https://www.openstreetmap.org/copyright.
El archivo `streets.geojson` conserva los identificadores y trazados fuente;
`generate.mjs` produce `seed.json` de forma determinista, sin descargas al sembrar.

- `npm run db:migrate`: migraciones incrementales con checksum y bloqueo.
- `npm run seed:demo`: carga explícita, repetible; conserva las ediciones existentes.
- `npm run seed:demo:clear`: elimina **todos los registros DEMO**, incluidos los
  creados o editados desde esta versión, y deja intactos datos no DEMO. No borra
  catálogos DEMO que aún estén referenciados por datos no DEMO.

El formulario crea registros DEMO. La etiqueta no se puede quitar desde la API
en este incremento. Los catálogos/semillas se administran por estos scripts;
la interfaz permite crear, consultar, editar y eliminar predios.
