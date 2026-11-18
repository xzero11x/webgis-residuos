> **ARCHIVO HISTÓRICO — sin autoridad operativa desde el 17/11/2026.**
> Se conserva como antecedente; sus órdenes de continuación, lecturas, prioridades
> y propuestas superadas no se ejecutan. Consultar [AGENTS](../../AGENTS.md) y sus
> fuentes activas. El contenido siguiente es el original, salvo ajustes de enlaces.
> Las referencias v2/REFERENCIAS citadas y no recibidas no se fabrican.

# WEBGIS BAGUA — PLAN DE EJECUCIÓN SIN BLOQUEO POR RENTAS

> **Versión:** 1.0 — 16/11/2026  
> **Tipo:** directiva operacional para Claude Code, Codex y agentes de programación.  
> **Estado:** decisión de alcance comunicada por la dirección del proyecto + plan técnico propuesto; **NO** refleja código verificado en el repositorio.  
> **Prioridad:** este documento, la visión maestra v2 y el diseño maestro v2 sustituyen las propuestas antiguas contradictorias de sidebar y primer mapa/demo.

## 0. ORDEN ESENCIAL PARA CUALQUIER AGENTE

**Nuestra base es BAGUA MASTER, no el primer mapa/demo.** El primer mapa se construyó antes de conocer el alcance definitivo. No debe dictar la arquitectura, el UI, el catálogo de funciones ni el plan de pruebas; tampoco se autoriza destruir archivos o datos históricos sin revisión. Debemos convertir BAGUA MASTER en un **WebGIS municipal integrado con el mapa como interfaz principal**, búsqueda universal, inspección contextual, fichas completas, registros y operaciones, sin sidebar permanente de numerosos módulos.

**Falta información real de Rentas** sobre predios y contribuyentes. Eso **no bloquea** la implementación del producto: construir capacidades reales sobre contratos de dominio, fixtures sintéticos aislados y pruebas representativas; al recibir datos autorizados, se hará un proceso de mapeo, validación y conciliación. No se garantiza compatibilidad perfecta con datos aún desconocidos: los adaptadores deben absorber diferencias y los contratos deben ser versionables.

**Hito A:** producto técnicamente funcional y probado con datos sintéticos. **Hito B:** información institucional validada/importada y aceptación operativa. **Nunca confundir A con B.**

## 1. INVARIANTES QUE NO SE NEGOCIAN

1. BAGUA MASTER es la superficie principal y base funcional. El mapa es persistente, no una página secundaria.
2. No construir una sidebar de navegación principal con muchos módulos. Permitir operaciones complejas en vistas ampliadas, sin perder el contexto del mapa.
3. Preservar geometrías Overture y la selección/visualización de las rutas DWG de BAGUA MASTER. No importar rutas exclusivamente PDF al catálogo activo, no inventar horarios/vigencia.
4. Edificio Overture ≠ predio administrativo. Persona ≠ contribuyente ≠ propietario ≠ ocupante ≠ generador. Relaciones explícitas y con procedencia.
5. Predios sin georreferencia deben existir, buscarse, consultarse y editarse; **no crear puntos falsos**.
6. El servicio asignado no prueba que se prestó; participación no prueba entrega; vacío no significa cero; documental no significa vigente.
7. No implementar arbitrios, cobros, deudas, tasas, pagos ni ninguna función tributaria financiera.
8. No introducir nombres/DNI/contactos en PMTiles, GeoJSON público, logs, exportaciones sin autorización, ni endpoints sin control de acceso.
9. No añadir tecnologías nuevas, rehacer cartografía ni refactorizar masivamente sin evaluación y necesidad técnica.
10. Sin respuesta de la Gerencia: decisiones de negocio no confirmadas quedan **por validar**. No fabricar autorizaciones, catálogos, universos, roles oficiales, métricas ni procedimientos.
11. Cada incremento debe ser funcional, probado, reversible y con explicación de lo que realmente quedó hecho.

## 2. ARQUITECTURA DE EXPERIENCIA

**Entrada:** usuario autenticado → BAGUA MASTER casi a pantalla completa → barra superior delgada, búsqueda universal, capas/filtros, menú de herramientas/perfil.

**Interacción universal:** buscar o seleccionar en mapa → resultado inequívoco → inspector contextual con tipo, estado, fuente, relaciones y acciones permitidas → ficha ampliable si necesita detalle → regreso al mismo mapa, viewport, filtro y selección cuando aplique.

**No perder funcionalidades:** cuando editar un padrón, conciliar importaciones, trabajar en una tabla o generar reportes requiera más espacio, abrir workspace amplio integrado, no encajarlo en un inspector de 350 px. Controles globales y acciones en contexto, sin saturación.

**En móvil:** mapa + búsqueda visible + hoja inferior para inspección; formularios y tablas complejas tienen vistas específicas con navegación de regreso. No depender de hover. La interfaz nunca promete offline/GPS sin validación.

**Estados de datos:** (a) datos cartográficos Overture/DWG existentes; (b) registros sintéticos dev/test explícitos; (c) registros institucionales importados/validados; (d) sin dato/pending. Nunca mezclar ni ocultar procedencia.

## 3. PRIMER PASO: AUDITORÍA REAL DEL REPOSITORIO (OBLIGATORIA)

No se ha inspeccionado el código fuente en esta conversación. Antes de cambiarlo, el agente DEBE producir un inventario breve:

- Estado Git/branch, archivos modificados, scripts/package managers, dependencias y versiones **reales**.
- Puntos de entrada de BAGUA MASTER, mapa MapLibre, selección, capas, estilos, rutas, fuentes y tiles.
- API, PostGIS, esquemas/migraciones, modelos, mecanismos existentes de autenticación, permisos y auditoría.
- UI/componentes existentes reutilizables, búsqueda, formularios, tablas, estado de URL/mapa.
- Pruebas y build que pasan/fallan ANTES del cambio; distinguir defectos preexistentes.
- Riesgos de migración y puntos que requieren confirmación humana.

La auditoría produce `docs/estado-real-bagua-master.md` (o ubicación documental equivalente ya existente), con referencias a rutas de archivos comprobadas. **No reestructurar todavía.** Si no hay código disponible, devolver únicamente plan y contratos hasta recibirlo.

## 4. BACKLOG PRIORITARIO SIN DATOS DE RENTAS

La secuencia es propuesta, no prueba de funcionalidades pendientes: verificar y saltar lo que ya esté bien implementado.

| ID | Incremento | Entregable observable | Dependencia | Estado |
|---|---|---|---|---|
| B0 | Línea base técnica | Inventario + pruebas + riesgos + mapa de dependencias reales | Repositorio | Sin verificar |
| B1 | Shell map-first de BAGUA MASTER | Mapa entrada, búsqueda accesible, controles sobrios, inspector colapsable, estado en URL si existe | B0 | Por evaluar |
| B2 | Contratos del dominio administrativo | Tipos, modelo, migraciones versionadas, validaciones, procedencia y fixture test | B0 | Por evaluar |
| B3 | Búsqueda + fichas de predios | Búsqueda por código/dirección, detalle, vacío sin coordenadas, retorno al mapa | B1, B2 | Por evaluar |
| B4 | Personas y vínculos | Relaciones muchos-a-muchos, vigencia/fuente, edición controlada, autorización backend | B2, B3 | Por evaluar |
| B5 | Vinculación espacial revisable | Ubicación opcional, candidata vs verificada, reconciliación humana con edificio/geometría sin alterarlos | B2, B3 | Por evaluar |
| B6 | Servicios/participación | Catálogos parametrizables, asignaciones y estados distintos de prestaciones registradas | B2, B3 | Por evaluar |
| B7 | Actividades y entregas | Registrar, editar según permiso, consultar historial, cantidad opcional y procedencia | B4, B6 | Por evaluar |
| B8 | Rutas/sectores contextualizados | Fichas DWG, filtros, relaciones autorizadas y programación solo cuando validada | B1 + ruta actual | Por evaluar |
| B9 | Importación desacoplada de Rentas | Staging, mapeo configurable, previsualización, conflictos, idempotencia, auditoría y rollback diseñado | B2 | Por evaluar |
| B10 | Reportes fiables | Consultas y exportaciones por fecha/sector/material, sin coberturas falsas | B3–B8 | Por evaluar |
| B11 | Seguridad/operación/entrega | E2E, permisos, backups, restauración, despliegue, manuales y mantenimiento | Iterativo | Por evaluar |

**Trabajo en paralelo seguro:** B1 con B2; B9 puede progresar mientras se construye B3; B8 aprovecha BAGUA MASTER; pruebas de seguridad y calidad atraviesan TODAS las fases.

## 5. DATOS SINTÉTICOS: CÓMO HACERLO SIN CONFUNDIRLOS CON EL DEMO LEGADO

- Crear fixtures **exclusivamente para desarrollo y pruebas automatizadas**: `TEST-PRED-001`, `TEST-PERS-001`, códigos inventados no colisionables con producción; nombres obviamente ficticios, sin DNI/teléfonos/emails de personas reales.
- Casos deliberados: un predio sin ubicación, uno con ubicación verificada de fixture, una persona vinculada a dos predios, un predio con varias relaciones, dos servicios, entregas con y sin medición, ruta documental sin horario, códigos duplicados en importación.
- Preferir esquema/BD de test aislado y *seed scripts* explícitos; marcar `origin=synthetic` o equivalente solo si encaja con modelo existente. No usar `NODE_ENV` como único mecanismo de seguridad si scripts pueden apuntar a producción; exigir comprobación del destino de DB e inhibir seeds en producción.
- No cargar datos sintéticos sobre la instancia productiva ni sobre archivos de cartografía base. Las cuentas de prueba no deben dar acceso real a datos personales.
- Si se activa un entorno de prueba visual, mostrar **«Datos de prueba — no oficiales»**. Es un mecanismo QA, **no** restauración del primer mapa demo ni una funcionalidad pública obligatoria.
- Pruebas deben ser deterministas, independientes y repetibles; limpieza de fixtures no toca registros municipales.

## 6. CONTRATOS QUE SE PUEDEN DEFINIR ANTES DE RENTAS

El diseño definitivo de tablas/API se ajusta al repositorio; este es un **modelo conceptual orientativo**, no nombres SQL obligatorios.

**Entidades:** `FuenteDato`, `LoteImportacion`, `FilaImportacion`, `Predio`, `Persona`, `RelacionPredioPersona`, `ReferenciaEspacialPredio`, `TipoServicio`, `AsignacionServicio`, `RutaDocumental` (reutilizar BAGUA MASTER), `Programacion` (opcional y validable), `Participacion`, `EntregaActividad`, `Auditoria`.

**Reglas técnicas:** IDs internos estables; identificadores externos almacenados con su `source_system` y vigencia; campos administrativos opcionales para fuentes parciales; unicidad según `(fuente, clave_externa, version)` si la clave es fiable; *nullable* ≠ valor asumido; no usar geometría como identidad administrativa.

**Flujo de importación propuesto:** recepción autorizada → almacenamiento controlado → mapeo origen/campo → validación de tipos y duplicados → staging → vista previa de altas/cambios/conflictos → aprobación por usuario autorizado → aplicación transaccional e idempotente → reporte y bitácora de procedencia. **No escribir adaptador específico «Rentas CSV final» sin conocer columnas reales.**

**Contratos UI/API sugeridos:** búsqueda paginada por tipo y permisos; detalle por ID opaco; relaciones filtradas por autorización; geometría opcional con estado de verificación; mutaciones auditadas; errores de validación estructurados; listas de capas no exponen atributos personales. Ajustar rutas/nombres solo después de inspeccionar API existente.

## 7. PRUEBAS DE ACEPTACIÓN QUE PUEDEN QUEDAR LISTAS YA

| Prueba E2E/API | Resultado esperado |
|---|---|
| Inicio | Login autorizado abre BAGUA MASTER; sin sidebar de módulos; mapa operativo |
| Búsqueda predio con ubicación | Resultado abre ficha, conserva tipo, fuente y vista espacial |
| Búsqueda predio sin ubicación | Ficha accesible, etiqueta «ubicación pendiente» y ningún pin inventado |
| Clic edificio Overture sin vínculo | No inventa predio tributario ni titular |
| Relación compleja | Una persona puede vincularse a varios predios; se conserva vigencia |
| Privacidad | Rol sin permiso no accede a datos personales ni con llamada directa API |
| Ruta DWG | Ficha documental correcta; no se muestra «vigente» sin aprobación |
| Participación/entrega | Asignación ≠ entrega; registro incluye fecha y responsable; cantidad ausente sigue ausente |
| Importar mismo fixture dos veces | Sin duplicados ni pérdida de cambios no relacionados; conflictos visibles |
| Selección y retorno | Se vuelve al mapa con viewport, filtros y selección adecuados |
| Capas/tiles | Sin mutaciones inesperadas de Overture ni fuentes de rutas |
| Producción | Fixtures prohibidos y datos personales fuera de tiles/logs/extractos no autorizados |
| Móvil | Búsqueda, hoja inferior, formulario y navegación operables |

El agente debe ejecutar TypeScript, lint, build, pruebas unitarias/integración/E2E **solo donde existan y sean configurables**; documentar herramientas faltantes y fallos previos. No inventar aprobaciones de pruebas ni capturas.

## 8. CÓMO TRABAJAR POR INCREMENTO

Para cada PR/tarea:

1. **Inspeccionar** archivos relevantes, pruebas y estilo actual; conservar trabajo no confirmado.
2. **Definir escenario** municipal y resultado verificable; marcar supuestos.
3. **Planificar cambio mínimo** para BAGUA MASTER, con arquitectura de datos reutilizable.
4. **Implementar verticalmente** UI/API/DB solo donde lo requiera el incremento, con migración y tests.
5. **Validar** estados `loading`, `empty`, `error`, `forbidden`, datos incompletos, uso móvil y permisos.
6. **Ejecutar** pruebas posibles, registrar comandos/resultados y revisar no regresión cartográfica.
7. **Entregar** resumen de archivos cambiados, decisiones, evidencia, pendientes y siguiente tarea.

**No aceptar**: simulaciones que funcionan solo en frontend; botones sin acción; mock permanente disfrazado de datos de producción; métricas inventadas; documentación que diga «implementado» sin prueba; refactor de todo el repositorio en un único paso.

## 9. QUÉ DEJAR PREPARADO PARA EL DÍA QUE LLEGUEN LOS PADRONES

- Plantilla de diccionario/mapeo de campos esperados vs entregados, con significado, obligatoriedad real y sensibilidad.
- Preguntas sobre claves estables, direcciones, unidad predial, multi-titularidad, vigencias, duplicados, cambios históricos y permisos.
- Adapters configurables y reportes de validación por fila; tabla de equivalencias de identificadores externos.
- Workflow de vinculación espacial manual y revisable; nada de emparejamiento determinista por proximidad.
- Plan de importación acotada en entorno no productivo, medición de calidad y confirmación de la Gerencia.
- Política de segregación de datos de prueba y reales, y plan de rollback/backup.

## 10. DOS HITOS, UNA SOLA VISIÓN

**Hito A — funcionalidad construida con datos sintéticos:** se completaron e integraron los flujos, pruebas, validaciones, seguridad, importación genérica y UI map-first; ningún resultado pretende demostrar cobertura municipal.

**Hito B — puesta en marcha institucional:** Rentas/otras áreas entregan información autorizada; se mapean columnas, corrigen diferencias, validan relaciones y reglas, cargan datos, revisan permisos y la Gerencia acepta su operación.

**Advertencia honesta:** no podemos asegurar que «llegarán y se integrarán perfectamente»; pueden surgir cambios de modelo e interfaz. El objetivo es **reducir** esos cambios mediante fronteras de adaptación y validación temprana, no prometer que no existirán.

## 11. PROMPT DE ARRANQUE PARA AGENTES

> Lee `PLAN_EJECUCION_BAGUA_MASTER_SIN_RENTAS.md`, `VISION_MAESTRA_PRODUCTO_FINAL_WEBGIS_BAGUA.md` v2 y `DISENO_MAESTRO_WEBGIS_BAGUA.md` v2. La prioridad de producto es BAGUA MASTER y una interfaz map-first integrada; ignora el primer mapa/demo como referencia y no construyas sidebar de módulos. No tenemos padrón real de Rentas: avanza con contratos robustos y fixtures sintéticos solo de desarrollo. Primero inspecciona el repositorio y documenta el estado real; luego selecciona el siguiente incremento pequeño del backlog, implementa verticalmente, prueba y demuestra lo entregado. Preserva Overture/rutas DWG, no infieras predios ni personas, no expongas datos sensibles. Reporta lo implementado y lo pendiente sin asumir autorizaciones. No intentes implementar todo en un solo cambio.

**FIN — Este documento prevalece frente a instrucciones históricas contradictorias de diseño y demo.**
