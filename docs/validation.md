# Validación del WebGIS

Revisión: 13 de octubre de 2026, America/Lima.

- TypeScript, ESLint, Prettier y builds de frontend/backend: correctos.
- Vitest: 17 pruebas aprobadas, incluidos contratos territoriales y validación.
- Playwright sobre Docker/PostGIS: 14 pruebas aprobadas. Cuatro repeticiones de
  pruebas de API/selección cartográfica se omiten en tablet/móvil; se ejecutan en escritorio.
- Recorrido CRUD completo en los tres tamaños: dibujar, crear, asociar persona y
  servicio/ruta, editar dirección, recargar, comprobar persistencia y eliminar.
- Selección con clic real sobre polígono y ruta; búsqueda, filtros y capas.
- Rechazo de código duplicado, edición con versión antigua, ruta incompatible y
  polígono cruzado. Una transacción fallida conserva la ficha anterior.
- Revisión visual de mapa y ficha en escritorio, tablet y móvil. Sin desbordamiento horizontal.
- Cuatro servicios Docker saludables; `/api/health`, `/api/ready` y Swagger responden.
- PostGIS 3.5.2 comprobado mediante SQL directo. Base sin puerto publicado.
- Seed ejecutado dos veces sin duplicar los 24 predios. Geometrías DEMO persistentes.

Durante la integración se corrigió el empaquetado del worker de MapLibre 6, su
MIME JavaScript en Nginx y una colisión CSS que dejaba sin altura al mapa.
Las pruebas comprueban tanto la carga del motor como el tamaño real del lienzo.

Capturas en `artifacts/screenshots`, reporte en `playwright-report`. Las pruebas
usan Chromium con perfiles de escritorio/tablet/móvil; no equivalen a validación
en dispositivos físicos ni en Safari. El proveedor de mapa base requiere Internet.
Vite advierte del tamaño de MapLibre; el motor se carga de forma diferida.

No se afirma validación municipal de linderos, personas, rutas ni horarios: son
DEMO. Autenticación, permisos y despliegue institucional no forman parte de este
incremento. Reproducción de pruebas en [README](../README.md).

## Incremento municipal — 15 de octubre de 2026

- 12 originales verificados por SHA-256 y conservados sin cambios.
- 9 conversiones DWG/BAK completas; 3 PDF extraídos.
- 8 geometrías de rutas válidas, EPSG:4326; coordenadas originales conservadas.
- 82.186 entidades CAD únicas importadas; 72 geometrías inválidas retenidas sólo
  en staging. La capa visible ofrece 6.474 contornos y 417 anotaciones del archivo
  RUTAS CON TIEMPO, dentro del ámbito de consulta y con CRS explícito.
- Registro geométrico comercial e institucional y comparación con calles OSM
  detallados en [informe GIS](municipal-gis.md).
- Importación ejecutada dos veces: la segunda detecta el mismo checksum y no
  duplica registros. El paquete comprueba además la huella del archivo comprimido
  y el conteo final dentro de una transacción.
- `npm run check`: TypeScript, ESLint, Prettier, 17 pruebas Vitest y compilaciones
  de frontend/backend correctos.
- Playwright: 18 aprobadas y 6 repeticiones omitidas por tamaño de pantalla.
  Incluye CRUD persistente, interacción real con mapa, búsqueda de rutas,
  procedencia, separación de trazados por revisar y capas CAD en tres tamaños.
- Cuatro contenedores saludables. API, PostGIS, Swagger y frontend responden.
- Se corrigió una carrera entre búsqueda diferida y selección rápida que podía
  cerrar una ficha recién abierta. No quedaron registros E2E de esta ejecución.

Las rutas son documentos municipales recuperados, con validación operativa
pendiente; no se presentan como DEMO. La ruta institucional usa el CRS adoptado para
Tomaque (16/10/2026) y la clasificación orgánica conserva sus advertencias. Los predios creados desde el formulario
siguen siendo DEMO.
