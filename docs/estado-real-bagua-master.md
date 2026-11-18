# Estado real de BAGUA MASTER

Las secciones de inventario posteriores conservan el corte anterior. El progreso
actual, incluidos CSV, reportes, catálogos, cuentas y recuperación QA, se mantiene
en [avance-verificado.md](avance-verificado.md) como único tablero de aceptación.

## Reconciliación documental · 17/11/2026

| Fuente                                        | Corrección vigente                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| AGENTS / CLAUDE                               | Instrucciones compartidas breves, consulta por tarea y skills pertinentes                                               |
| PRODUCT                                       | Identidad, usuarios y principios UX; deja de ser un índice de órdenes                                                   |
| Entorno integrado                             | Reglas ejecutables de interacción, descubribilidad y continuidad                                                        |
| Visión maestra                                | Dominio y restricciones preservados; sin navegación modular ni planes automáticos                                       |
| Criterios                                     | Aceptación técnica y recorridos visibles desde frontend; validación municipal separada                                  |
| README                                        | BAGUA MASTER primero; comandos/rutas contrastados con código; autenticación y legado diferenciados                      |
| Misión, plan sin Rentas, experiencia anterior | [Archivados](archive/PLAN_EJECUCION_BAGUA_MASTER_SIN_RENTAS.md); conocimiento vigente extraído; sin autoridad operativa |
| Documentos de incremento y skills Bagua       | Referencias ajustadas a las fuentes activas; evidencia anterior conservada                                              |

Las referencias v2 y `REFERENCIAS/` mencionadas en el material recibido no están
acreditadas como disponibles; no son dependencias activas ni se crean sustitutos.
Esta revisión es documental, sin nueva ejecución de la aplicación. Ver evidencia
y límites en el avance único.

## Inventario histórico · 16/11/2026

El resto conserva el corte anterior, incluido su backlog B0–B11. No es una cola de
trabajo vigente ni debe reiniciarse: contrastar con el último corte del avance único.
El [plan original archivado](archive/PLAN_EJECUCION_BAGUA_MASTER_SIN_RENTAS.md)
explica los identificadores históricos, no impone instrucciones.

## Línea base comprobada

- Git: rama `main`, HEAD `40ae77b`. Numerosos cambios previos y archivos sin
  seguimiento, incluidos gestión y skills. Se conservan; no se resetea ni publica.
- npm workspaces frontend/backend, package-lock. Host Node 26.13.0/npm 11.20.0;
  package.json exige Node 24 y Docker utiliza Node 24. Check pasa en el host,
  pero para entrega se mantiene la versión Docker declarada.
- Frontend: React 19.3.0, TypeScript 5.9.3, Vite 8.3.4, MapLibre 6.14.0,
  PMTiles 4.5.0, Router 7.18.4, TanStack Query 5.104.2, Radix y Lucide.
- Backend: Express 5.3.0, pg 8.23.1, Zod 4.6.7; PostgreSQL/PostGIS por Compose.
- `npm run check` previo: tipos, lint, formato, 60 unitarias y build aprobados.
  Advertencia previa de paquetes JS grandes. Log: artifacts/plan-baseline-check.log.
- E2E previos: cuatro recorridos desktop de entorno integrado aprobados en Docker.
  Log: artifacts/plan-baseline-e2e.log. Esta inspección no reejecuta todo el legado.
- Los cuatro servicios Compose estaban saludables, disponibles en localhost:8080.

## Mapa de dependencias y archivos reales

`frontend/src/app/router.tsx` → `features/product/shell.tsx` (carcasa, búsqueda universal,
tema, menú de cuenta) → espacios: `features/bagua-master/bagua-master-page.tsx` (Explorar),
`features/product/expedientes.tsx` y `expediente-*.tsx` (Expedientes), `spaces.tsx`
(Servicios, Resultados, Administración). El mapa es `map/bagua-master-map.tsx`.
Las rutas antiguas `/bagua-master/gestion` y `?trabajo=gestion` se redirigen al espacio
equivalente.

Estado de búsqueda/selección/pestaña/tarea en URL; cámara en instancia MapLibre,
conservada al ampliar/cerrar, no persistida tras recargar. Estilos locales en
`map/style.ts`, `map/themes.ts`, `bagua-master.css`; alturas derivadas separadas,
simulaciones desactivadas de inicio. PMTiles y glifos propios en data/bagua-master.

`backend/src/server.ts` → `app.ts` → routers independientes de bagua-master y gestion.
API cartográfica `/api/bagua-master`: lectura de Overture y rutas DWG documentales.
API administrativa `/api/gestion`: sesión cookie HttpOnly, scrypt, autorización por
rol provisional, CSRF por cabecera+JSON, sin CORS. Repositorio con transacciones,
versionado optimista, auditoría, importación idempotente, entregas sin duplicación.
OpenAPI en `backend/src/modules/gestion/gestion.openapi.ts`.

Base: migraciones 001–008 legado, 009–015 BAGUA MASTER, 016–017 esquema gestion.
No modificar migraciones aplicadas. gestion separa predios/personas/vínculos,
asignaciones/participaciones/entregas, fuentes/importaciones/historial/usuarios.
Actualmente `gestion.fuente` exige sintética y catálogo de servicios es de ensayo:
no es todavía un contrato capaz de recibir fuente institucional real.

UI reutilizable en `frontend/src/components/ui`; gestión reutiliza formularios,
`detail.tsx`, `predio-form.tsx`, api.ts y `workspace-edits*.tsx`. No hay dependencias
nuevas para el entorno integrado. Pruebas en tests/e2e y *.test.ts; Vitest y Playwright.

## Backlog contrastado con el código

| ID  | Comprobado                                                                | Falta                                                                  |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| B0  | Inventario, check y recorrido base                                        | Restauración verificable actual y matriz completa de riesgos           |
| B1  | Mapa permanente, sin sidebar fija, búsqueda e inspector, ampliación móvil | Consolidar inspectores y estado cartográfico persistente               |
| B2  | Modelo separado, validaciones, fuente y auditoría                         | Contratos para fuentes reales y unidades prediales                     |
| B3  | CRUD, búsqueda y ficha sin geometría, retorno                             | Más filtros y revisión masiva                                          |
| B4  | Vínculos múltiples, vigencia, escritura y restricción API                 | Búsqueda inversa de personas y permisos institucionales                |
| B5  | Punto opcional, evidencia y estados diferenciados                         | Candidatos, revisión formal y correspondencias espaciales              |
| B6  | Asignaciones y participación separadas                                    | Catálogos parametrizables institucionales                              |
| B7  | Entregas, cantidad opcional, idempotencia, anulación                      | Corrección versionada y consultas cruzadas                             |
| B8  | Siete rutas DWG, búsqueda y ficha documental                              | Sectores validados y programación versionada                           |
| B9  | Lote JSON sintético, staging, validación y aplicación transaccional       | Mapeo de columnas, conciliación y rollback operativo                   |
| B10 | Agregado por periodo/material/unidad, sin cobertura ficticia              | Sector, filtros adicionales y exportación autorizada                   |
| B11 | Auth, permisos API, historial, Docker y pruebas                           | Protección destino fixtures, usuarios UI, recuperación y transferencia |

## Brechas y riesgos antes de editar

1. `backend/src/db/gestion-seed.ts` y seed legado de manage.ts no verifican una
   designación explícita de base de desarrollo. NODE_ENV=production en Docker
   es modo de ejecución, no evidencia de despliegue institucional.
2. API nueva admite solo sintéticos, pero no tiene bloqueo de esas escrituras
   por destino de despliegue. Las E2E deben rechazar destinos no habilitados.
3. Las visiones v2 y DISENO_MAESTRO_WEBGIS_BAGUA.md citados por el plan no están
   disponibles en el repositorio. En Downloads la visión disponible sigue siendo
   v1. Se conservan decisiones posteriores de entorno integrado y este plan;
   no se inventa ni certifica una v2.
4. Hay respaldo PostGIS previo en artifacts/baseline-2026-11-15; no se acredita
   aquí una restauración nueva. No se hacen migraciones ni borrados en este incremento.
5. Falta información autorizada y reglas institucionales: Hito A no completado,
   Hito B pendiente. El primer mapa no define el nuevo producto; se conserva como
   histórico y sus pruebas solo protegen compatibilidad dentro del alcance tocado.

## Siguiente incremento elegido

B11: comprobar explícitamente entorno y base conectada antes de escribir fixtures,
bloquear muestras y mutaciones sintéticas en producción y añadir preflight a E2E.
Reutilizar configuración, pool y router; sin migraciones, cambios visuales o GIS.
Probar rechazo por entorno/destino y ausencia de escrituras ante rechazo; mantener
el recorrido funcional local. No declarar esto suficiente para habilitar producción.

## Resultado del incremento elegido

Implementado el control documentado en [segregación de fixtures](segregacion-fixtures.md).
Después del cambio: `npm run check` aprobado con 80 pruebas unitarias/API y build.
En Docker pasaron 25 escenarios E2E de entorno integrado, búsqueda y gestión;
11 repeticiones se omiten según tamaño. Scripts de muestra rechazados con modo
producción y con destino distinto; seed local habilitado ejecutado correctamente.
Se comprobaron 17 migraciones aplicadas, 14.357 edificios Overture y cero fuentes
administrativas no sintéticas. Cuatro servicios saludables. No hay migraciones
nuevas ni modificaciones visuales o de cartografía en este incremento.

B11 continúa parcial. Próxima capacidad funcional sugerida: B6, parametrizar
catálogos de ensayo manteniendo historia y permisos, sin declararlos oficiales.
La preparación de recuperación y de importación real permanece en el backlog.
