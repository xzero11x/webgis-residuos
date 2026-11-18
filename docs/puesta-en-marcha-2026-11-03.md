# Puesta en marcha local — 3 de noviembre de 2026

Sistema disponible en http://localhost:8080 y BAGUA MASTER en
http://localhost:8080/bagua-master. Los cuatro servicios de Compose quedaron
saludables: PostgreSQL/PostGIS, backend, frontend y Nginx.

## Recuperación

Se generaron archivos `.env` locales y se recuperaron los datos de los respaldos
cifrados del 22 de octubre de 2026, conservando los archivos existentes.
El volcado PostGIS se restauró en un volumen nuevo y el backend aplicó las
migraciones 013–015. Se verificaron 14.357 edificios de Overture.
No se sustituyeron fuentes, geometrías ni teselas de BAGUA MASTER.

El respaldo es anterior a las alturas derivadas incorporadas después del 22 de
octubre: esas tablas están disponibles pero sin datos recuperados. La vista 2.5D
queda desactivada mientras no haya alturas. No se regeneró cartografía ni se
atribuyeron alturas inventadas a los edificios originales.

## Correcciones

- Migraciones: aceptar las huellas históricas tanto con LF como con CRLF;
  conservar el rechazo de cambios reales en el SQL.
- Selección del mapa municipal: permitir seleccionar rutas y puntos visibles
  superpuestos a áreas territoriales.
- Dependencias de producción: body-parser 2.4.0 y qs 6.17.1;
  auditoría de producción sin vulnerabilidades notificadas.
- Pruebas: actualizar expectativas de alturas a la interfaz actual y permitir
  elegir navegador con `PLAYWRIGHT_CHANNEL=chrome`. El Chromium descargado
  falló al iniciarse en este Windows; Chrome instalado funcionó.

## Validación

- Tipos, ESLint, formato y compilaciones de ambos módulos: correctos.
- 55 pruebas unitarias correctas.
- Suite de escritorio: 38 correctas inicialmente y las cuatro restantes
  verificadas tras las correcciones/repeticiones; cuatro pruebas optativas omitidas.
- Tres comprobaciones móviles correctas: recursos propios, paneles sin desbordes
  y carga del mapa municipal.
- Verificados creación, edición y eliminación de predios, transacciones,
  búsqueda, rutas, selección de edificios y vías, CAD, territorio, Swagger,
  teselas por rangos HTTP y ausencia de proveedores externos en BAGUA MASTER.

Persisten 13 avisos moderados en herramientas de desarrollo y el aviso de tamaño
de algunos archivos compilados. No impiden el arranque local. La aplicación sigue
sin autenticación municipal; esta puesta en marcha mantiene el acceso en localhost.

## Uso posterior

Con Docker Desktop iniciado: `npm run infra:up`.
Para detener conservando los datos: `npm run infra:down`.
Para pruebas contra Docker, configurar `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080`
y, en este equipo, `PLAYWRIGHT_CHANNEL=chrome` antes de `npm run test:e2e`.
El desarrollo nativo requiere Node 24; el Node 26 instalado difiere de la versión
declarada. Docker utiliza Node 24.
