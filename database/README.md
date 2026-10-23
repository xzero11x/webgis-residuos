# Base espacial

PostgreSQL 17 + PostGIS 3.5 en volumen persistente. `init/001-postgis.sql` habilita
la extensión al crear el volumen. Las migraciones de `migrations/` crean y
actualizan el modelo; el backend las aplica antes de arrancar en Docker.

```sh
npm run db:check
npm run db:migrate
npm run seed:demo
```

`schema_migrations` registra nombre, checksum y fecha. Los archivos ya aplicados
no se editan. Un bloqueo advisory serializa migraciones y operaciones de seed.
Las modificaciones funcionales usan nuevas migraciones, sin borrar volúmenes.

El seed utiliza geometrías válidas EPSG:4326 y claves estables; ejecutarlo de nuevo
no duplica registros ni sobrescribe cambios. `npm run seed:demo:clear` elimina
los datos marcados DEMO, incluidos los creados desde la interfaz, preservando los
no DEMO y catálogos todavía referenciados. Véase [fuentes y alcance](demo/README.md).

El Compose principal no publica PostgreSQL. `npm run db:dev` permite al backend
nativo acceder por loopback mediante un override exclusivamente de desarrollo.
Cambiar la contraseña del `.env` no modifica una base ya inicializada.
