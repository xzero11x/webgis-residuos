> **ARCHIVO HISTÓRICO — sin autoridad operativa desde el 17/11/2026.**
> Se conserva como antecedente; sus órdenes de continuación, lecturas, prioridades
> y propuestas superadas no se ejecutan. Consultar [AGENTS](../../AGENTS.md) y sus
> fuentes activas. El contenido siguiente es el original, salvo ajustes de enlaces.
> Las referencias v2/REFERENCIAS citadas y no recibidas no se fabrican.

# MISIÓN CODEX: FINALIZAR TÉCNICAMENTE WEBGIS BAGUA SOBRE BAGUA MASTER

> Fecha de emisión: 16/11/2026 · Prioridad: ejecución · Destino: agente trabajando **dentro del repositorio real**.
> **Esta orden autoriza implementar y verificar cambios de código locales dentro del proyecto**. No autoriza despliegue productivo, publicación de datos, envío de información a terceros, alteración destructiva de base de datos, `git push` ni sustitución de trabajo ajeno sin revisión.
> Las afirmaciones sobre código existente deben verificarse en el repositorio. Este documento es la misión, **no un informe de funcionalidades ya completadas**.

## 1. ORDEN DIRECTA

Actúa como ingeniero senior full-stack, arquitecto de producto, responsable GIS y QA. **Tu misión es llevar WEBGIS BAGUA al máximo nivel de terminación técnica verificable** sin depender de los archivos reales de Rentas. No te limites a auditar, proponer, reorganizar documentos o producir maquetas: **ejecuta implementación vertical, prueba, corrige y continúa con el siguiente incremento viable**, usando el tiempo disponible de la sesión y las capacidades reales del entorno. Si la sesión concluye, deja registro reanudable exacto y una instrucción breve de continuación; no afirmes que trabajas en segundo plano.

**Resultado perseguido — Hito A:** aplicación funcional extremo a extremo, con cartografía real BAGUA MASTER y flujos administrativos/operativos reales persistidos en backend/PostgreSQL/PostGIS, usando exclusivamente **registros administrativos sintéticos trazables** cuando todavía no se disponga de datos autorizados. Hito A no es certificación de puesta en producción institucional.

**Hito B — posterior y externo:** importar/conciliar información autorizada de Rentas y otras dependencias, validar procesos y permisos con la Gerencia y obtener aceptación institucional. No inventes ese hito ni lo marques como aprobado.

## 2. DECISIONES FIRMES EN ORDEN DE PRECEDENCIA

1. BAGUA MASTER es el único producto base. El primer visor/mapa demo anterior al alcance definitivo **no guía diseño, arquitectura, navegación, datos ni aceptación**. No migres funciones del demo solo por existir; tampoco borres históricos ajenos sin autorización.
2. **Mapa primero.** Al iniciar sesión, la cartografía de BAGUA MASTER ocupa el espacio de trabajo principal; búsqueda universal sobre el mapa, control de capas y filtros sobrios, selección de elementos, inspector contextual, fichas expandibles y acciones conectadas. Sin sidebar permanente cargada con módulos. Los procesos complejos pueden expandirse a workspaces sin perder contexto cartográfico.
3. El sistema terminado conecta predios, personas y vínculos, referencias espaciales, servicios y asignaciones, participación, entregas de orgánicos/aprovechables, rutas/sectores, importación de padrones, reportes, usuarios/permisos y auditoría.
4. Edificio Overture **NO equivale** a predio municipal. Geometría no identifica a un contribuyente. Persona, contribuyente, propietario, ocupante y generador no son equivalentes. Toda asociación exige vínculo explícito y fuente. Permite predios sin localización.
5. Preservar cartografía base Overture, fuentes y geometrías; conservar la naturaleza **documental** de las rutas DWG de BAGUA MASTER (documentación histórica describe 7: cuatro georreferenciadas y tres en revisión; comprobar estado real). No convertir PDFs ni líneas en rutas operativas confirmadas. No inventar horarios, frecuencias, coberturas o servicios efectivamente prestados.
6. Servicio asignado ≠ servicio efectuado; participar ≠ entregar; ausencia ≠ cero; candidato espacial ≠ ubicación validada; fecha documental ≠ vigencia actual.
7. No implementar funciones de arbitrios, montos, pagos, deudas, cobranza, recaudación ni estados de cuenta. Proteger información personal por rol también en API, consultas, exportaciones, caché y logs.
8. Diseño elegante, sobrio y funcional inspirado en la claridad de Linear y macOS, sin clonar marcas ni agregar paneles, gráficas o botones decorativos. El diseño sirve a los escenarios municipales reales.
9. No imponer un framework nuevo, refactor masivo, borrado de datos ni reemplazo de tecnologías si el stack existente resuelve la tarea. Verificar stack real antes de actuar.
10. Diferenciar **implementado y probado**, **implementado sin verificar**, **propuesto**, **bloqueado**, **por confirmar con Municipalidad**. Nunca comunicar «100 % terminado» por la sola existencia de pantallas.

## 3. PRIMERA ACCIÓN: RECONCILIAR LOS .MD, SIN BLOQUEARSE AQUÍ

En la **primera sesión**, inspecciona los `.md` del repositorio, los `AGENTS.md` aplicables, el código y el estado Git. Lee solo los documentos relevantes en su integridad cuando se requiera, priorizando los maestros actuales y las referencias de este paquete:

- `REFERENCIAS/VISION_MAESTRA_PRODUCTO_FINAL_WEBGIS_BAGUA.md`
- `REFERENCIAS/DISENO_MAESTRO_WEBGIS_BAGUA.md`
- `REFERENCIAS/PLAN_EJECUCION_BAGUA_MASTER_SIN_RENTAS.md`
- `REFERENCIAS/AGENTS_BASELINE.md`

Busca instrucciones antiguas contradictorias: navegación basada en un gran sidebar, primer mapa demo como producto o compatibilidad obligatoria, aplicación con páginas separadas como eje principal, promesas de datos reales aún no recibidos, mock frontend como funcionalidad entregada o fases que solo permiten proponer sin implementar.

**Acción obligatoria sobre documentación REAL del repositorio:**

1. Localiza visión, diseño, plan, README, arquitectura, estado, backlog, instrucciones para agentes y notas de datos/migraciones existentes. No presupongas nombres ni sobreescribas documentos útiles.
2. Haz una matriz breve `Archivo real | Coincide | Contradicción | Acción tomada` en `docs/estado-real-bagua-master.md` o archivo de estado existente. Si no existe una carpeta docs, usa convención del repo.
3. **Actualiza o fusiona los `.md` existentes** para reflejar las decisiones de la sección 2. Conserva información técnica vigente y hallazgos comprobados; evita duplicar la visión en 8 archivos. Si un documento no existe, créalo solo si es necesario; no renombres sin razón.
4. Ajusta `AGENTS.md` **por fusión**: instrucciones concisas, enlace a fuentes maestras, invariantes, pruebas y regla de reportar evidencia. Conserva reglas locales válidas y archivos `AGENTS.md` anidados. No pegues aquí toda esta misión.
5. Crea/actualiza un único tablero verificable de hitos `docs/avance-verificado.md` (o archivo de progreso ya existente) con `[ ] pendiente`, `[~] en progreso`, `[x] probado`, `[!] bloqueado`, referencias al código y evidencia de pruebas; inicia con estados derivados del repo, NO de conversaciones previas.
6. Haz `git diff --check` y revisa los cambios. **No termines la sesión aquí.** Pasa inmediatamente a construir el primer incremento funcional viable salvo que haya un bloqueo real o riesgo destructivo.
7. Mantén estos `.md` sincronizados con cada entrega. Una función solo pasa a `[x]` con evidencia de ejecución/prueba.

Si las referencias faltan en el repo, informa de ello; continúa con las decisiones explícitas incluidas aquí, sin inventar requisitos institucionales.

## 4. AUDITORÍA MÍNIMA REAL (NO UN PROYECTO DE DOCUMENTACIÓN)

En el primer bloque inspecciona rápidamente: rama y `git status`, estructura, package manager, scripts, frontend React/TypeScript/Vite si siguen vigentes, motor de mapa MapLibre si sigue vigente, Node/Express y PostgreSQL/PostGIS si siguen vigentes, Docker, DB/migraciones, API, autentificación, fuentes/tile layers, rutas, tests y flujos existentes. Ejecuta una línea base de typecheck, pruebas y build disponibles; registra fallos previos. **No dejes un plan abstracto sin código después de esta revisión.**

No deshagas cambios no confirmados de otros. Si hay modificaciones previas, trabajar alrededor y aislar cambios propios. Para cambios en esquema/infraestructura, confirmar respaldo y entorno de destino. No usar claves o registros personales de la Municipalidad en prompts, logs o fixtures.

## 5. FORMA DE TRABAJAR: ENTREGA VERTICAL + CONTINUIDAD

En cada incremento:

1. Selecciona la siguiente historia de mayor impacto **que aún falte según el código**, con dependencias reales. Prioriza un recorrido completo frente a diez pantallas desconectadas.
2. Define rápidamente escenario de usuario, archivos que tocarás, cambios en datos/API/UI y comprobaciones. Planea lo necesario, no escribas documentación extensa antes de cada edición.
3. Implementa cambios de producción reales: esquema y migración versionada, validación servidor, endpoint con permisos, frontend conectado, loading/empty/error/forbidden, prueba automatizada y documentación mínima donde aplique.
4. Ejecuta las pruebas pertinentes, corrige regresiones y verifica que el mapa, capas y rutas no hayan cambiado involuntariamente.
5. Marca hito en tablero SOLO si hay evidencia; resume archivos, comandos/resultados, limitaciones y decisión siguiente.
6. **Continúa con el siguiente incremento viable dentro de la sesión**. No pidas confirmación para detalles locales no destructivos y reversibles; utiliza criterios documentados. No ejecutes operaciones externas o destructivas sin permiso.

**Bloqueos:** falta de padrón real no es bloqueo; usa datos sintéticos. Falta de credenciales de servicios externos sí puede bloquear ese paso: aísla la dependencia y avanza en otra parte. Incertidumbre sobre reglas municipales → configurar y marcar por validar, no inventar hechos. Si no puedes correr un servicio, implementa pruebas que puedan ejecutarse localmente, registra exactamente qué faltó y sigue con las funciones independientes.

## 6. ÁREAS A FINALIZAR (PRIORIZACIÓN ADAPTATIVA, NO SECUENCIA CIEGA)

### M0. Base cartográfica y shell map-first
- Mapa BAGUA MASTER inicia sin rutas ficticias ni navegación antigua; la búsqueda está integrada; controles contextuales de capas; selección de elementos; inspector derecho en desktop y bottom sheet en móvil.
- Cierre/expansión del inspector conserva viewport, filtros y selección; controles son realmente interactivos y accesibles; cero botones decorativos.
- No alterar Overture/tiles/rutas DWG originales. Etiquetar fuente y estado de verificación.

### M1. Núcleo del dominio + seguridad de backend
- Modelos/migraciones reales para predios, personas, relaciones con rol y vigencia, identificadores por fuente, referencia espacial nullable y verificable, servicios/asignaciones, participación, entregas, fuentes, importaciones, auditoría, catálogos.
- Unicidades e integridad según evidencia; IDs internos opacos, relaciones many-to-many; sin inferir titularidad/ubicación.
- Authz por operación y por recurso. `GET` también comprueba permisos. Los datos sensibles no salen en GeoJSON/PMTiles públicos, logs ni exportaciones indebidas.

### M2. Búsqueda y fichas conectadas
- Búsqueda universal (por código/dirección/tipo y personas solo con permiso), resultados discriminados y paginados; abrir fichas; filtros y estado vacío.
- Predio con/sin geometría; abrir desde mapa si tiene vínculo verificado y desde búsqueda siempre que exista el registro; no inventar puntos.
- CRUD autorizado con auditoría, estados de UI y validaciones coherentes; ficha ampliable desde inspector.

### M3. Servicios, rutas y actividades
- Estado de servicios asignados vs hechos registrados; participación y entregas de orgánicos/aprovechables con fecha, material, responsable, cantidad opcional y unidad solo cuando existe medición.
- Filtrar por predio, participante, periodo, modalidad, estado y sector cuando corresponda; datos trazables.
- Rutas DWG y sectores consultables sin prometer operatividad no validada; horario solo si está documentado/confirmado.

### M4. Ingestión de Rentas desacoplada
- Importador real para archivos autorizados compatibles (según stack), con **mapeo configurable**, prevalidación de columnas, tipos y duplicados, staging, vista previa de altas/cambios/conflictos, rechazo de datos inválidos, idempotencia, confirmación autorizada y bitácora.
- No inventes formato final de Rentas. Probar contra varias variantes sintéticas y archivos malformados. Evitar escrituras parciales.
- Plan de rollback/reconciliación que no sobrescriba cambios no relacionados; datos externos conservan fuente, fecha y clave de origen.

### M5. Reportes y exportaciones
- Conteos y desgloses verdaderos de los registros almacenados; periodos, materiales, sectores y estados disponibles, con permisos; no gráficos sin función.
- Cero porcentajes de cobertura sin denominador validado. Exportar solo campos autorizados y diferenciar datos de prueba de datos institucionales.

### M6. Operación, despliegue y calidad
- Semillas de desarrollo, migrations, instrucciones de arranque, configuración reproducible, backups/restauración probada en entorno de prueba, errores estructurados, logs sin PII, health checks y validación de endpoints.
- UI accesible, responsive, teclado, navegación y focus, loading/error/empty, rendimiento razonable con mapa y consultas grandes.
- Pruebas unitarias, integración, E2E de recorridos principales, reglas de permisos y regresión cartográfica; revisión de seguridad antes de declarar hito técnico.

El agente debe construir **todas** las áreas técnicamente viables, no simplemente una landing page bonita o endpoints desconectados. Si una funcionalidad ya existe y pasa pruebas, marcarla, no reescribirla.

## 7. DATOS SINTÉTICOS REALISTAS: SOLO EL CONTENIDO ES FICTICIO

**Principio:** simular escenarios plausibles de una municipalidad amazónica, no inventar el padrón de Bagua. La cartografía legítimamente disponible puede seguir siendo real; las referencias administrativas son ficticias y jamás se atribuyen a predios, domicilios, residentes ni personas reales sin fuente autorizada.

- Crear seeds deterministas en **DB de desarrollo/test aislada**: `TEST-PRED-0001`, `TEST-PERS-0001`, `TEST-SRV-...`; nombres como `PERSONA FICTICIA A`, no DNI, celular, correo ni contribuyentes reales.
- Incluir predios sin coordenadas, unidades múltiples, vinculación predio-persona muchos-a-muchos, varios roles (no inferidos), períodos de vigencia, estado espacial candidato/validado como simulación, relaciones inexistentes, servicios asignados y no registrados, participaciones, entregas con y sin peso medido, un evento anulado/corregido, ruta DWG documental y campos nulos.
- Si se simula georreferenciación para pruebas, identificar `synthetic` y **no trazar puntos ficticios que parezcan ubicaciones municipales auténticas**. Usar geometrías de prueba separadas o escenarios parametrizados, no vincular padrones inventados a viviendas reales.
- Demostrar búsqueda y análisis con suficiente variedad: registros sin dirección completa, duplicados externos, cambios de código, errores de importación, varios períodos, zonas sin datos; no fabricar estadísticas de cobertura.
- **Persistencia real**: la UI usa API y PostgreSQL/PostGIS; mocks/fixtures solo para semillas y tests. Prohibido resolver el proyecto con arrays estáticos en frontend, `localStorage` como base de datos o botones que simulen guardar.
- Bloquear ejecución de semillas si apuntan a producción; verificación del destino de DB, confirmación explícita de entorno; datos de prueba aislados o restaurables. Indicador visible «DATOS DE PRUEBA — NO OFICIALES» en entornos que los muestren.
- No sembrar identidades, direcciones personales ni identificadores tributarios reales encontrados en capturas, Git o fuentes externas.

## 8. PRUEBAS DE ACEPTACIÓN MÍNIMAS DEL HITO A

Los escenarios detallados están en `CRITERIOS_ACEPTACION_CODEX.md`. Como mínimo demostrar:

- [ ] Inicio sesión autorizado → BAGUA MASTER operativo → búsqueda universal → predio georreferenciado de prueba → ficha/servicios/actividades → actualización que persiste tras recarga.
- [ ] Predio ficticio sin georreferencia: búsqueda y edición disponibles, sin marcador inventado.
- [ ] Selección de edificio Overture no atribuye propietario, contribuyente o servicio sin relación válida.
- [ ] Una persona con múltiples vínculos y varios roles/periodos consulta de forma correcta; sin equivalencias automáticas.
- [ ] Entrega registrada desde ficha o flujo contextual → backend → DB → historial → reportes, con cantidad opcional y unidad válida.
- [ ] Ruta documental DWG consultable con estado/procedencia; sin horarios o vigencia falsos; no se reescriben geometrías.
- [ ] Archivo sintético de padrón → vista previa → importación autorizada → reconciliación → reimportación idempotente, con duplicados rechazados.
- [ ] Usuario sin permiso no accede a datos personales por UI, API, búsqueda, exportación, tiles, caché ni filtros.
- [ ] Móvil: mapa, búsqueda, ficha bottom sheet, formulario y navegación funcional.
- [ ] Exportación/reporte consistente con SQL y filtros; sin indicadores inventados.
- [ ] Test/build/typecheck/lint disponibles y verificados; problemas preexistentes distinguidos.
- [ ] Operación reproducible: entorno de prueba limpio → migración → seed → arranque → flujo E2E; backup/restore de prueba documentados y verificados si viable.

**«Terminado» NO significa**: capturas bonitas, plan redactado, CRUD sin permisos, endpoints que devuelven fixtures constantes, conexión simulada, tests escritos pero no ejecutados, o documentación marcada done sin evidencia.

## 9. FORMATO DE ESTADO PARA CADA ENTREGA

Mantén el tablero de progreso con las siguientes columnas (o equivalente existente):

`ID | Capacidad | Estado observado | Código/API/DB/UI involucrados | Validación ejecutada | Riesgo/pendiente | Próximo paso`

Al cerrar un incremento informa brevemente:

- **Hecho y verificable:** archivos y comportamiento; pruebas/comandos con su salida relevante.
- **Parcial / bloqueado:** razón concreta y si depende de Rentas u otro factor.
- **Decisiones tomadas:** justificadas y etiquetadas si necesitan validación institucional.
- **Continuación:** tarea siguiente prioritaria, preparada y ejecutada si todavía hay capacidad de trabajo.

Si la sesión termina: anota el estado real y el comando/instrucción mínima para retomar; evita «voy a continuar en segundo plano». Ninguna automatización externa queda programada por este documento.

## 10. CONDICIONES DE SEGURIDAD Y AUTORIZACIÓN

**Puedes** modificar archivos locales de código/documentación, crear tests, migraciones versionadas, scripts de fixtures seguros y ejecutar pruebas en entornos de desarrollo aislados.

**No debes sin confirmación explícita**: destruir o resetear bases con datos no sintéticos, ejecutar migraciones irreversibles en producción, publicar secretos, desplegar/activar producción, compartir datos municipales fuera del entorno, hacer `git push` o merges remotos, cambiar permisos institucionales reales, eliminar trabajo ajeno, habilitar infraestructura facturable, o instalar dependencias de procedencia dudosa.

Si identificas cambios necesarios que estén fuera de esas autorizaciones, prepara una propuesta acotada y sigue con tareas seguras mientras tanto.

## 11. EMPIEZA AHORA — SALIDA MÍNIMA ESPERADA

1. `git status` y lectura del código **ahora**.
2. Reconcilia los `.md` existentes (no crear solo más documentos). Registra matriz de cambios.
3. Ejecuta baseline del proyecto con scripts existentes.
4. Implementa el primer recorrido vertical faltante de mayor impacto que pueda terminar y validar dentro del entorno.
5. Registra evidencia, luego avanza al siguiente incremento viable sin esperar instrucciones repetitivas.

**La tarea no se considera realizada si entregas únicamente un diagnóstico o una lista de recomendaciones.**
