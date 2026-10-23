# Arquitectura funcional provisional

```text
Navegador → Nginx :8080
              ├─ /      → frontend React estático
              └─ /api/* → Express → pg → PostgreSQL/PostGIS
```

Vite usa el mismo contrato `/api` en desarrollo. Solo Nginx publica un puerto en
el Compose principal; la base usa una red interna y un volumen persistente.

## Frontend

`features/territorio` contiene contratos, consultas con TanStack Query, ficha y
formulario React Hook Form/Zod. `pages/map-page.tsx` coordina búsqueda, filtros,
selección y dibujo. `components/map/map-viewport.tsx` encapsula MapLibre, capas,
interacciones y limpieza al desmontar. Los filtros se reflejan en la URL.

Las geometrías llegan desde la API como GeoJSON EPSG:4326. Predios, rutas, puntos
y sectores usan fuentes independientes y se pueden ocultar. El proveedor de mapa
base se configura con `VITE_MAP_STYLE_URL`; OpenFreeMap es el valor inicial.
La cámara se restringe a un rectángulo urbano provisional de Bagua.

## Backend y modelo

El módulo `health` verifica proceso y disponibilidad espacial. `territorio` separa
rutas HTTP/validación, servicios y repositorio SQL. Consultas parametrizadas,
errores JSON uniformes y logging Pino. Swagger documenta los contratos.

- `predios`: código único, dirección, sector, MultiPolygon, marca DEMO y versión.
- `personas` y `persona_predio`: vínculo explícito, sin equiparar propiedad y contribución.
- `servicios` y `predio_servicio`: varios servicios por predio; ruta opcional por servicio.
- `rutas`: MultiLineString, servicio, horario y frecuencia provisionales.
- `puntos_recoleccion`: Point vinculado a una ruta.
- `sectores`: MultiPolygon de referencia.

Crear/editar guarda geometría y relaciones en una transacción. La FK compuesta
impide asociar rutas de otro servicio. Zod comprueba ámbito y anillos cerrados;
PostGIS comprueba geometría válida y superficie. `version` evita actualizaciones
perdidas entre dos editores. No se deduplican personas por nombre; la identidad
municipal y sus campos se definirán con el área. La interfaz edita un Polygon;
MultiPolygon en la base permite evolucionar mediante migraciones.

La búsqueda devuelve hasta 1000 predios e informa el total. No se implementaron
vector tiles ni paginación avanzada: deberán añadirse si el volumen lo justifica.
No hay datos simulados en memoria: la API consulta PostGIS.

## Evolución

Las migraciones SQL son versionadas y se registran con checksum. No se modifican
migraciones ya aplicadas; los cambios de modelo se añaden en archivos nuevos.
`seed:demo` es independiente del arranque y conserva ediciones; la limpieza DEMO
respeta referencias de futuros registros no DEMO.

La recuperación documental CAD/PDF se implementó mediante scripts reproducibles,
staging `cad_features` y rutas con procedencia y estado. Ver [informe GIS](municipal-gis.md).
Autenticación, roles, identificadores municipales, límite oficial y modelo de
entregas siguen pendientes. La revisión se realiza
con una vertical funcional y datos señalizados como prueba.
