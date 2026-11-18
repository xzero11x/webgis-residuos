# WEBGIS BAGUA — aceptación funcional, técnica y de usabilidad

Fuente principal de aceptación para cualquier agente. **Hito A:** terminación
técnica con registros administrativos sintéticos aislados. **Hito B:** integración
autorizada y aceptación institucional. La matriz define requisitos, no su estado;
consultar [avance único](docs/avance-verificado.md) y sus cortes fechados.

## Reglas del tablero

- Estado por defecto: `POR VERIFICAR`. No marcar completo sin comando, salida y evidencia reproducible.
- `IMPLEMENTADO NO PROBADO` es distinto de `COMPLETO`.
- Un requisito institucional desconocido se marca `POR VALIDAR`; jamás se inventa una aprobación.
- Registrar fallos previos por separado de regresiones del trabajo nuevo.
- Permisos probados en API; no basta esconder el botón en UI.
- Una función requiere un recorrido desde el frontend real: entrada descubrible,
  consulta/acción, resultado comprensible y retorno al contexto. Endpoints, capturas
  o mocks aislados no acreditan terminación.
- Para cada escenario anotar entorno/fecha, rol, datos y procedencia, pasos, resultado
  observado y evidencia reproducible. No arrastrar un estado probado a requisitos
  nuevos sin revisar su alcance; no reetiquetar cortes históricos como pruebas actuales.
- Distinguir revisión técnica de usabilidad de validación con personal municipal.
  Sin prueba de tarea con esos usuarios, la validación institucional sigue pendiente.

| ID | Escenario | Criterio de aceptación y evidencia mínima |
|---|---|---|
| UX-01 | Inicio e ingreso | Usuario autorizado abre BAGUA MASTER; mapa utilizable; no sidebar principal saturada; gestión sin sesión bloqueada; no exigir login para cartografía compartida si su contrato es público |
| UX-02 | Búsqueda universal | Predios ficticios por código/dirección, rutas/sectores existentes con fuente; resultados discriminados; teclado; vacíos y errores |
| UX-03 | Selección | Edificio Overture sin relación administrativa no muestra predio/titular inventado; inspector contextual correcto |
| UX-04 | Navegación integrada | De mapa a ficha ampliada, servicios, actividad y vuelta: viewport y filtros preservados cuando corresponde |
| UX-05 | Móvil | Bottom sheet, búsqueda, registro, foco y controles táctiles operables en tamaños de móvil comprobados |
| GEO-01 | BAGUA MASTER | Fuentes Overture, tiles, capas y rutas DWG existentes no alteradas inadvertidamente; consola sin errores críticos |
| GEO-02 | Predio sin punto | Registro ficticio sin coordenadas se consulta/edita; no marcador de relleno ni falsa geocodificación |
| GEO-03 | Ubicación | Estados desconocida/candidata/verificada distinguibles; vínculo con edificio nunca se infiere como certeza |
| DAT-01 | Predios | CRUD persistente con validación y auditoría; sigue tras recarga de cliente y reinicio de servidor |
| DAT-02 | Personas | Relación N:M con rol, vigencia y fuente; consultas autorizadas, tests de múltiples roles |
| DAT-03 | Estados | Servicio asignado, participación y entrega se guardan/consultan como conceptos separados |
| DAT-04 | Actividad | Entrega de orgánicos/aprovechables: fecha, material, responsable, cantidad nullable; actualiza historial y reportes |
| RUT-01 | Rutas | Rutas DWG originales disponibles sin atribuir vigencia o horarios no respaldados; rutas en revisión identificadas |
| IMP-01 | Importar padrón | Archivo de fixture, mapeo, validación, previsualización, staging, aprobación de dev, aplicación y auditoría |
| IMP-02 | Errores | Reimportación idempotente, duplicados/columnas ausentes/formatos incorrectos identificados sin daño parcial |
| SEG-01 | Autorización | 401/403 apropiados por endpoint, roles/recursos; acceso a PII y exportaciones negado cuando corresponda |
| SEG-02 | Aislamiento | Fixtures no entran en producción, logs/tiles públicos no exponen PII, secrets fuera de Git |
| REP-01 | Reportes | Filtros por periodo/sector/material válidos, cifras coinciden con consultas DB y exportaciones autorizadas |
| OPE-01 | Instalación | Entorno de prueba se levanta con instrucciones; migraciones, seeds, API/UI, health checks documentados |
| OPE-02 | Recuperación | Respaldo/restauración ensayados en DB desechable o pendiente justificado si entorno impide prueba |
| QLT-01 | Verificación | Typecheck/build/lint/test/integración/E2E existentes pasan o los fallos quedan inventariados con evidencia |
| QLT-02 | Accesibilidad | Navegación teclado, foco visible, contraste, etiquetas, errores de formulario, estados asíncronos básicos |
| QLT-03 | Documentación | Fuentes activas coherentes y enlazadas; avance distingue objetivo, código, prueba y pendiente; archivos históricos no dan órdenes |

## Recorridos visibles obligatorios

Aplicar el principio de sencillez externa de [PRODUCT.md](PRODUCT.md) y las reglas
de [interacción](VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md). Comprobar escritorio y
móvil en los recorridos afectados, con teclado y controles táctiles según proceda.

| ID | Tarea desde la aplicación | Resultado observable |
|---|---|---|
| USO-01 | Primera visita → ingreso → buscar predio → ficha → servicios | Una persona reconoce qué buscar y cómo empezar; distingue identidad, fuente, ubicación y acciones sin aprender arquitectura. No requiere URL oculta ni consola |
| USO-02 | Abrir registro sin coordenadas desde búsqueda/padrón | Ficha consultable y editable según permiso; ubicación pendiente y ningún pin inventado; resultados ambiguos permiten elegir |
| USO-03 | Ficha → personas/unidades/servicios → volver | Relaciones N:M y vigencias correctas, navegación bidireccional y acciones habituales localizables; sin identidades no autorizadas |
| USO-04 | Registrar entrega desde predio y desde entrada global | Hereda contexto conocido o permite elegir participante sin ubicación; guarda en BD, confirma, aparece una vez en historial y reporte; cantidad no medida sigue NULL |
| USO-05 | Ficha ampliada/tabla/reporte → mapa | Conserva cámara, selección y filtros pertinentes; cerrar devuelve foco útil; cambios sin guardar piden decisión y cancelar conserva texto |
| USO-06 | Consultar ruta DWG con datos incompletos | Fuente, estado documental y ausencia de horario/vigencia claros; no promete atención por cercanía ni conecta fragmentos por conjetura |
| USO-07 | Importar extracción sintética → revisar → aplicar → repetir | Previsualiza altas/cambios/conflictos; selección autorizada, idempotencia y trazabilidad; conflictos/versión obsoleta no causan pérdida de ediciones locales |
| USO-08 | Filtrar sector/periodo/material y exportar | Cifras coinciden con registros; unidades compatibles y universo explícito; sin denominador muestra conteo parcial, no cobertura municipal |
| USO-09 | Carga, vacío, fallo de red/guardado, falta de sesión o permiso | Estados distintos con texto humano y salida recuperable; sin pérdida silenciosa ni reemplazo por DEMO; doble pulsación no duplica eventos |
| USO-10 | Consulta sin permiso intenta acceso por UI/API/exportación/búsqueda | No obtiene información sensible ni inferencias por sugerencias; cartografía pública, caché y logs no filtran PII |

Las comprobaciones técnicas incluyen persistencia tras recarga/reinicio, concurrencia,
validación de nulos y relaciones, migraciones/importaciones reproducibles, recuperación
ensayada y no regresión Overture/DWG. Seleccionar pruebas acordes al cambio; una tarea
solo documental requiere coherencia, enlaces locales y `git diff --check`, no baterías
completas de la aplicación.

## Condiciones institucionales del Hito B

Además del Hito A: entrega autorizada de fuentes, diccionario/mapeo conciliado,
catálogos y unidad de atención validados, permisos y responsables designados,
rutas/programación confirmadas cuando se presenten como vigentes, privacidad y
custodia acordadas, instalación/recuperación reproducibles, manuales, capacitación,
acceso institucional al código e infraestructura y validación de tareas con la Gerencia.
Las limitaciones históricas de datos no exigen inventar coordenadas, medidas o cobertura;
deben quedar visibles y aceptadas. No prometer GPS, offline o SLA sin definición.

## Gate final del Hito A

Solo declarar **«Hito A terminado técnicamente»** si (a) los escenarios aplicables están probados de extremo a extremo, (b) las excepciones están documentadas sin falsearlas, (c) las integraciones completas persisten en backend/DB, (d) los datos sintéticos son seguros y removibles, (e) existe procedimiento reproducible de instalación/operación y (f) BAGUA MASTER permanece correcto. Si falta una capacidad esencial, declarar `PARCIAL` y seguir trabajando en ella.

**Hito B:** no puede aprobarse hasta recibir datos oficiales autorizados, verificar mapeos/relaciones y validar con los responsables municipales. No afirmar que Hito A equivale a puesta en marcha institucional.
