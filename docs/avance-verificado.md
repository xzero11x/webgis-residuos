# Avance verificable de WEBGIS BAGUA

Tablero único. `[ ]` pendiente, `[~]` parcial, `[x]` probado en el alcance descrito,
`[!]` dependencia externa. **Prioridad vigente: producto visible y utilizable**;
ver el último corte «Producto visible y recorridos reales». Los cierres técnicos
anteriores son evidencia histórica, no sustituyen validación de usabilidad ni
aceptación municipal. Los registros administrativos de prueba son sintéticos.

## Producto completo con simulación realista · 27/11/2026

Por indicación del gerente, el producto se termina sin esperar la información oficial; lo real se
carga después sin cambiar la interfaz. Detalle en [operación del servicio](operacion-servicio.md).
Rama `feat/operacion-servicio`.

- [x] Ejecución de rutas (migración 038): puntos de control con la hora del plano real, pantalla del
      chofer con tres botones (Salí, Pasé por aquí, Llegué) y registro sin señal; tickets de balanza
      en la oficina con la tara del vehículo.
- [x] Tablero diario del supervisor: rutas por estado, alertas (sin salida, atraso, interrumpida, no
      salió, ticket pendiente), mapa con cada ruta por estado y la última posición, últimos 7 días;
      cumplimiento por ruta con el recorrido punto por punto.
- [x] Hora habitual al vecino: la consulta del mapa, el expediente y el sticker QR muestran la hora
      real (atraso mediano de las últimas 8 semanas en el punto de control más cercano).
- [x] Avisos y ajustes (039): suspensiones, cambios de horario e informativos que llegan al vecino,
      al chofer y al promotor; cambios de programación con motivo, historial y aviso automático.
- [x] Cierre del mes (040): pendientes antes de cerrar, foto de las cifras, bloqueo de registros del
      mes cerrado y reapertura con motivo; reporte para SIGERSOL (CSV, mes o año) y resumen
      imprimible para el concejo. Octubre de 2026 cerrado en la demostración.
- [x] Carga del padrón (041): Excel o CSV leído en el navegador, columnas reconocidas, validación fila
      por fila, corrección en la tabla, ubicación por vecinos de la misma calle, lote reversible.
      Probado con un Excel sintético de 42 filas: 3 errores sembrados detectados, corregidos,
      cargados y revertidos sin dejar rastro.
- [x] Empadronamiento en campo: vivienda en el mapa, representante, programa, consentimiento (Ley
      29733), código de padrón y sticker en el acto. Visitas del promotor sin señal.
- [x] Recicladores (Ley 29419): registro municipal con vigencia, socios con carnet, capacitación,
      vacunas y EPP; registro de comprobantes de valorización.
- [x] Ayuda dentro de la aplicación: manual corto por rol y preguntas frecuentes.
- [x] Nombres de ruta sin avisos de duda (042).
- [x] Simulación (solo local/test): 224 recorridos con 3 055 registros del chofer desde el piloto,
      642 tickets de balanza (≈ 350 t por mes), 5 avisos, 15 socios recicladores; no pisa rutas
      registradas de verdad.
- [x] Pruebas: 187 unitarias; nueva E2E `bagua-operacion-diaria`. E2E completo contra `:8080` con
      imágenes reconstruidas, en escritorio, tableta y móvil: 137 aprobadas, 0 fallos (181 omitidas
      por diseño). Probado a mano en el navegador: chofer (salida, paso, llegada, corte de señal y
      reenvío), cierre de octubre, resumen para el concejo, carga y reversión del padrón,
      inscripción en campo con sticker.
- [ ] Pendiente con la Gerencia: validar los supuestos críticos (horarios, pesaje, padrón vigente),
      ubicación real del relleno y vehículos con su tara; separar el servidor de demostración del real.

## Stickers QR del predio · 22/11/2026

Detalle en [operación del servicio](operacion-servicio.md#stickers-qr-del-predio).

- [x] Migración 037: un sticker vigente por predio, historial de reemplazos con motivo, escaneos y
      origen de cada visita (`lista`, `qr`, `codigo`).
- [x] Código de 8 caracteres con dígito de control (mismo algoritmo en backend, frontend y
      simulación); el QR solo lleva la URL pública, sin datos personales.
- [x] Escaneo: página pública del vecino con el horario; en Campo, cámara (lector nativo o jsQR) o
      código escrito, y visita en un toque con el programa del día destacado.
- [x] Generación: en el expediente (generar y reemplazar con motivo) y en lote por programa, con
      hoja A4 de stickers para imprimir.
- [x] Simulación: 728 stickers (88 % de los inscritos) desde el 01/09/2026; 7 598 visitas por QR.
- [x] Pruebas: 171 unitarias (nuevas: código y lectura del QR impreso, rutas QR), 5 e2e nuevas
      (página del vecino, visita por escaneo, código escrito, reemplazo, hoja de stickers). E2E completo
      contra `:8080` con imágenes reconstruidas: 127 aprobadas en escritorio, tableta y móvil, 0 fallos.

## Reglas actualizadas y visor histórico retirado · 22/11/2026

- [x] `AGENTS.md` reescrito: solo reglas de protección (datos personales, aprobación para push y
      operaciones destructivas, migraciones, datos simulados en local/test, sin arbitrios) y las
      decisiones vigentes del usuario (un solo producto, avanzar con simulación realista, mapa sin
      avisos de duda, coherencia interna). Nuevo `PRODUCT.md` con la definición actual.
- [x] Documentos de visión anteriores archivados en `docs/archive/` (historia, no instrucciones).
- [x] Visor municipal histórico retirado: `MUNICIPAL_MAP_ENABLED=false` por defecto (código, Docker y
      `.env`); `/` lleva a BAGUA MASTER y el menú ya no lo ofrece. Sus pruebas se omiten.
- [x] E2E contra `:8080`: escritorio 55 aprobadas, tableta y móvil 62 aprobadas, 0 fallos.
- [ ] Pendiente: eliminar el código del visor histórico (pantallas y endpoints que solo él usa); las
      tablas de datos se conservan porque BAGUA MASTER usa sus tiempos de paso y sectores.

## Operación del servicio con simulación realista · 22/11/2026

Por indicación del gerente, el producto avanza con datos simulados realistas mientras no haya
información oficial. Detalle en [operación del servicio](operacion-servicio.md).

- [x] Modelo: programación de rutas, infraestructura, actores y valorización, padrón MINAM y visitas
      con resultado (migraciones 034–036); función de hora estimada de paso por punto.
- [x] Datos reales incorporados: 406 tiempos de paso del plano «RUTAS CON TIEMPO» y 16 sectores
      rotulados en los planos.
- [x] Simulación (fuente sintética): 1.129 predios sobre edificios reales, 1.370 personas, 900
      inscripciones al padrón, ~25 000 visitas, ~26 000 entregas (~48 t), 90 comprobantes de
      valorización, 24 elementos de infraestructura, 10 programaciones.
- [x] Interfaz: «Recolección aquí» en la ficha del mapa, programación en rutas, capa de
      infraestructura, servicio y participación en el expediente, recorrido de campo móvil
      (`/bagua-master/campo`), resultados de la operación con detalle por cifra y padrón descargable.
- [x] Pruebas: 160 unitarias (6 nuevas de visitas y padrón), 69 e2e de escritorio contra `:8080`
      sin fallos (5 nuevas: consulta de horario, ficha y ruta, expediente, registro y corrección en
      campo, resultados y padrón). Tableta y móvil: 83 aprobadas; fallan las 2 del visor municipal
      histórico ya conocidas.
- [ ] Días de recolección, rutas selectivas y comercial, padrón, visitas y toneladas son simulados
      hasta recibir la información de la Gerencia.

## Calles, formas, tema Monocromo y rutas · 22/11/2026

- [x] Calles con el ancho del espacio entre fachadas (792 tramos, mediana 7,5 m) y dibujadas
      debajo de los edificios; avenidas de doble calzada con la berma siempre visible.
- [x] Huellas suavizadas (sin dientes ni espigas, esquinas levemente redondeadas) en 2D y 2.5D/3D
      (migración 033); la huella original de Overture no cambia.
- [x] Tema **Monocromo**: blancos, grises y negro, con huellas y volúmenes translúcidos.
- [x] Rutas rediseñadas: un color claramente distinto por ruta (antes había tres naranjas), sombra
      suave, borde blanco, insignias de sentido del color de cada ruta con chevrón blanco, píldoras
      «Inicio»/«Fin» y paradas blancas con borde del color de la ruta.
- [x] 154 unitarias y 64 e2e de escritorio contra `:8080` sin fallos (una prueba actualizada: ahora
      hay 6 temas).
- [ ] Las rutas conservan sus colores en el tema Monocromo para seguir distinguiéndose.

## Correcciones locales y vista 3D libre · 22/11/2026

- [x] Regla de plazas, parques y canchas: 14 huellas de Overture ocultas en 2D y 2.5D/3D (incluidas
      la glorieta y el estrado de la Plaza de Armas) y 1 complementaria retirada.
- [x] Correcciones cartográficas desde el mapa (botón **Corregir**, con sesión de escritura): marcar
      un lugar o una edificación como inexistente, mover un lugar y dibujar una edificación que
      falta. Motivo obligatorio, autoría y anulación sin borrado (migración 031,
      `bagua_master.correccion`); lectura pública sin autoría; la búsqueda las respeta.
- [x] Vistas: 2.5D (inclinación fija de 58°, con giro) y 3D libre (inclinación 0–85° y giro con
      clic derecho o Ctrl + arrastrar; dos dedos en pantalla táctil).
- [x] Pruebas: 151 unitarias (7 nuevas del router de correcciones y 1 de la ruta pública), 9 del
      ajuste en Python y 64 e2e de escritorio contra `:8080` sin fallos (5 nuevas: plaza, ocultar y
      deshacer, mover, dibujar, vistas). Tableta y móvil: 82 aprobadas; fallan 2 pruebas del visor
      municipal histórico (`/`, flechas de sentido de la Ruta 1001 en pantallas pequeñas), ajenas a
      este cambio, cuyo código no se tocó.
- [x] 3D sin edificios sobre la calle: los volúmenes usan la forma recortada (migración 032,
      1.168 huellas). Avenidas de doble calzada: 86 tramos marcados con su separación; cada calzada
      se dibuja más estrecha que ella y la berma central se ve siempre. 152 unitarias y 64 e2e de
      escritorio contra `:8080`, sin fallos.
- [ ] Las correcciones aún no tienen revisión por un segundo usuario ni exportación.

## Coherencia interna del mapa · 22/11/2026

Calles, edificios y rutas alineados entre sí con la red vial de Overture como referencia (los DWG/CAD
municipales son deficientes según la gerencia). Diagnóstico: desfase sistemático de las calles de
2,5 m (uniforme, ±0,8 m entre sectores). Ajuste: calles y capas asociadas trasladadas; 385 huellas
complementarias en plena calzada retiradas y 1.170 recortadas (quedan 6.160); Overture recortado solo
en teselas (1.168), sin tocar la base; las 7 rutas DWG ajustadas a las calles (mediana 0 m), con el
trazo original guardado. Detalle en [coherencia interna](coherencia-interna.md).

- [x] `diagnostico_coherencia.py`, `ajustar_coherencia.py` (idempotente, originales conservados) y 8
      pruebas; teselas regeneradas; complemento y rutas reimportados.
- [x] Capturas: rutas sobre el eje de las calles y edificios fuera de la calzada.
- [ ] Sin puntos GPS de campo: la posición absoluta del conjunto no está verificada. Quedan 84 huellas
      de Overture sobre ≥ 40 % de calzada y solapes entre huellas de distintas fuentes.

## Rediseño visual del mapa · 22/11/2026

Temas Positron (blanco), Dark y Liberty rehechos para identificar los elementos de un vistazo:
edificios con cuatro tonos según su superficie (igual en Overture y en la capa complementaria),
calles con borde propio y color por jerarquía (avenidas en ámbar o brillante, locales neutras),
parques y canchas con verdes distintos, colegios en lavanda, salud en rosa, agua más definida y
lugares con un color por grupo (comida, hospedaje, educación, salud, comercio, cultura, ocio,
servicios). Solo cambia la apariencia: fuentes Overture, geometrías y PMTiles intactas.

- [x] `themes.ts` y `style.ts`; 26 pruebas del estilo (validación del estilo en los 5 temas).
- [x] Capturas antes/después en escritorio, tres temas, a escala de ciudad y de manzana.
- [x] E2E de escritorio contra `:8080` (stack reconstruido): 59 aprobadas, 0 fallos tras corregir la espera del
      formulario de ingreso en dos pruebas (`isVisible` no espera); 25 omitidas por diseño.
- [x] Imágenes Docker de backend y frontend reconstruidas: el stack en `:8080` sirve la capa
      complementaria y el estilo nuevo.
- [ ] Sin revisar en móvil ni con usuarios; Bright y Fjord solo recibieron los nuevos tonos de edificios.

## Edificaciones complementarias · 21/11/2026

Capa aditiva con 6.545 huellas de fuentes abiertas que Overture no tiene (5.181 de Google
Open Buildings crudo, 146 de Microsoft y 1.218 de presencia satelital de Google; OSM no
aportó nada nuevo). Con Overture suman 20.902. Overture, sus identificadores y sus PMTiles
no cambian. Los lotes CAD con alguna huella pasan de 86,5 % a 96,9 %. Método, cifras, precisión relativa y límites en
[Edificaciones complementarias](edificaciones-complementarias.md).

- [x] Migración 030 (`edificio_complemento`), importador transaccional e idempotente,
      API (`/complemento/mapa`, ficha por `edificio_complemento`) y capa en el visor con
      una sola apariencia visual, sin interruptores ni avisos de duda; el origen va en la ficha.
- [x] Pruebas: 137 unitarias (backend y frontend), 12 de las reglas de fusión en Python y
      75 e2e aprobadas en escritorio, tableta y móvil (Edge) sobre mapa, controles,
      recorrido de aceptación y la capa nueva; 15 omitidas por diseño; 0 fallos.
- [x] Tesela cruda de Google v3 (`91b`, 491 MB, íntegra con `gzip -t`) fusionada: 20.733
      huellas leídas, 13.875 ya estaban en Overture y **5.181 son nuevas** (confianza 0,65–0,95,
      mediana 0,776). El 66,6 % de las nuevas dentro de zonas CAD cae dentro de un lote, frente
      al 61,9 % de Overture. La hipótesis previa de «aporte casi nulo» era incorrecta.
- [ ] Sin hacer: polígonos de GlobalBuildingAtlas (2,4 GB, CC BY-NC), segmentación con IA
      (sin imagen con licencia), manzanas INEI, botón «Registrar punto sin polígono» y
      vínculo de predios con estas huellas (la clave de `vinculo_espacial` solo admite Overture).
- Las huellas de presencia (`baja`) tienen una precisión relativa de ≈ 58 % respecto de
  Overture frente a lotes CAD; no hay verificación en campo. OSM y Microsoft son ODbL.
- Para ejecutar la API desde el host hay que publicar la base con `npm run db:dev`; la
  imagen Docker del backend no se reconstruyó, así que el stack en `:8080` aún no sirve la capa.

## Aplicación de cuatro espacios · estilo Vercel · 18/11/2026

Se rediseñó la interfaz como una aplicación y no como un mapa con tarjetas flotantes. Los
componentes previos se reutilizaron como material (fichas, formularios, reportes), no como
contrato de diseño.

**Espacios y rutas.** Carcasa común `features/product/shell.tsx` en `/bagua-master`:
Explorar (`/bagua-master`), Expedientes (`/expedientes`, `/expedientes/predio/:id`,
`/expedientes/persona/:id`), Servicios (`/servicios`), Resultados (`/resultados`) y
Administración (`/administracion`, desde el menú de la cuenta). Los enlaces antiguos
(`/bagua-master/gestion`, `?trabajo=gestion`) se redirigen al espacio equivalente. Se
eliminó el espacio de trabajo ampliado dentro del mapa.

**Estilo.** Tokens Geist/Vercel en `frontend/src/styles/globals.css` (claro y oscuro,
Geist Sans/Mono), blanco y negro con azul = verificado/información, ámbar = revisar,
rojo = error y violeta = sintético/ficticio. Sin dependencias nuevas de diseño distintas de
las fuentes `@fontsource-variable/geist*`. Solo se usan las skills oficiales de Vercel ya
instaladas.

**Búsqueda universal** (`features/product/search.tsx`, `GET /api/gestion/busqueda`): predios,
unidades, personas (nombre, código o documento ficticio), rutas, calles y lugares. Una
persona con varios predios nunca abre uno sola; se elige. El rol `consulta` no recibe
personas desde el servidor y el documento se devuelve enmascarado.

**Ubicación.** Un predio sin punto administrativo pero con vínculo espacial confirmado a una
edificación Overture se localiza por ese vínculo: el mapa se acerca una vez y resalta la
edificación (azul), y la miniatura del expediente lo rotula «Vínculo espacial confirmado ·
sintético». Con solo vínculos propuestos o sin vínculos, el expediente dice «Ubicación
pendiente»; no se estima por cercanía. Desde una edificación se listan sus predios
relacionados o se indica que no tiene relación predial confirmada.

**Datos de demostración.** Migración `029-gestion-persona-documento.sql` (columna
`gestion.persona.documento`, con documentos ficticios `F-9…` solo en destinos locales/de
ensayo) y vínculos espaciales sintéticos idempotentes en `gestion-scenarios.ts` (VIVIENDA y
MULTI confirmados; REVISION con dos propuestas). Nada se escribe fuera de los destinos con
fixtures permitidos.

**Verificado en navegador real (Edge, datos locales persistentes).** Documento ficticio →
persona (5 predios, sin salto automático) → «Ver en el mapa» de VIVIENDA (vuela y resalta) →
expediente con minimapa por vínculo → «Registrar entrega» (también desde Servicios) → recarga
y la entrega sigue en la actividad del expediente con autor. Clic en la edificación
resaltada devuelve su predio. Revisados escritorio 1440×900 y móvil 390×844 (sin
desbordes horizontales), tema claro y oscuro. Sin errores de consola.

**Pruebas.** `npm run typecheck`, `npm run lint` y `npm test` (126 pruebas) sin errores.
Nuevo recorrido E2E `tests/e2e/bagua-recorrido-aceptacion.spec.ts`. Se adaptaron las
comprobaciones de controles, búsqueda de lugares, recursos propios (ahora por servidor, no
por ruta) y acceso al mapa general. Defectos reales hallados y corregidos al probar: la guía
de inicio tapaba el panel de la vista 2.5D; el escape de comodines en la búsqueda no
escapaba nada.

**Sin inicio de sesión (por ahora).** `BAGUA_ACCESO_LIBRE=true` en `backend/.env` (ignorado por
Git; `backend/.env.example` lo deja en `false`) hace que toda solicitud a `/api/gestion` actúe
como la primera cuenta administradora activa, sin formulario de ingreso ni cierre de sesión;
el menú de la cuenta indica «Acceso libre local · sin inicio de sesión» y oculta «Salir» y
«Cambiar mi contraseña». El servidor **no arranca** con la opción activa si el destino no es
local/de pruebas con fixtures habilitados (probado con una prueba unitaria). Las acciones
quedan auditadas a nombre de esa cuenta administradora, no de una persona. Para volver al
ingreso, poner `BAGUA_ACCESO_LIBRE=false` y reiniciar la API. El permiso por perfil
(`consulta`) deja de aplicarse mientras esté activo; solo usar con datos sintéticos locales.

**Límites declarados.** (1) Suite E2E completa (3 proyectos, 246 casos): 135 aprobados, 106 omitidos, 5 con fallo en la
primera corrida. Tras corregir, BM-14 (móvil) y MAP-01 pasan; MAP-01 es intermitente. Siguen
fallando `cartography.spec.ts:52` y `reconciliation.spec.ts:3` en tablet y móvil: son el mapa
general histórico (`/`), que cuenta flechas de dirección renderizadas, y pasan en escritorio;
no se determinó la causa ni se comparó contra una línea base limpia (el árbol ya tenía
cambios sin confirmar en ese mapa antes de esta entrega). Además, 21 casos que recorren el
espacio de trabajo retirado del mapa (`bagua-integrated-workspace`, `bagua-master-workspace`,
`bagua-natural-workspace`, `bagua-product-journeys` y los `gestion-*`) se marcaron
`test.fixme` con nota: su lógica de negocio (versiones, archivo, anulación, importación,
privacidad) sigue en backend y en los componentes reutilizados, pero su recorrido por la
interfaz antigua no se migró, así que esa cobertura de interfaz está pendiente (2) La imagen Docker del backend no se
reconstruyó: la migración 029 se aplicó con `psql` y los endpoints nuevos requieren
reconstruir la imagen para ejecuciones en contenedor. (3) Las rutas documentales DWG
se muestran como documentales, sin horarios operativos. (4) Sin validación con usuarios
municipales ni aceptación institucional. (5) No se hizo commit ni push.

## Experiencia territorial continua · 17/11/2026

La implementación anterior se trató como material reutilizable, no como contrato de
interfaz. Se reorganizó la consulta alrededor del mapa, las relaciones y la tarea:

- Vistas Territorio/Predios/Servicios/Rutas en el mismo mapa. Predios ofrece una
  muestra curada y filtro por sector administrativo; no inventa delimitaciones.
  Servicios enlaza actividad respaldada por registros, sin colorear cobertura falsa.
- La ficha identifica por dirección comprensible, resume relaciones y última entrega
  vigente, y revela procedencia/localización bajo demanda. Personas y unidades tienen
  navegación contextual propia y retorno al predio; servicios enlazan su actividad.
- Registrar entrega abre un formulario en la misma ficha. Guarda por API en PostgreSQL,
  actualiza la actividad, conserva cantidades ausentes y protege cambios sin guardar.
  Formularios y tablas extensas siguen ampliándose en el entorno. Se retiró el menú
  modular redundante del espacio ampliado, conservando las herramientas autorizadas.
- Móvil: cabecera compacta, hoja inferior ampliable y formulario con espacio propio.
  La indicación «Demostración · datos sintéticos» permanece durante la consulta.
- Escenarios nuevos `SYN-BAGUA-VIDA-*`: vivienda familiar, vivienda con bodega y dos
  unidades, comercio pendiente de ubicación, registro por revisar y archivo histórico;
  nombres ficticios, direcciones verosímiles marcadas como demostración, vínculos,
  servicios, participación y entregas con/sin medición en noviembre. No hay puntos,
  límites ni vínculos espaciales inventados en esta edición. No se sobrescriben los
  escenarios previos ni se presentan direcciones ficticias como domicilios oficiales.

Carga explícita en destino local/test designado:
`docker compose exec -T backend node backend/dist/db/gestion-scenarios.js --experiencia`.
Primera ejecución: cinco predios creados. Repetición: cero creados, cinco conservados.
Se reutiliza la guardia del destino y la transacción; no se cambian migraciones.

Validación: tipos/lint correctos, 126 unitarias/API aprobadas y detector Impeccable
sin hallazgos en los componentes revisados. Regresión amplia: 65 aprobadas y siete
repeticiones omitidas; tres expectativas antiguas del título se actualizaron al
nombre visible WEBGIS BAGUA y se repitieron con éxito. Recomprobación de entrada,
recorrido continuo, A–F y privacidad: diez aprobadas, dos repeticiones omitidas.
Recomprobación final del recorrido con sector heredado en reportes, protección de
cambios sin guardar y fixture de escritura E2E independiente: tres aprobadas
(escritorio/tableta/móvil). Entorno integrado: diez escenarios aprobados y dos
repeticiones omitidas; se adaptó el selector accesible de participación del test
anterior al formulario contextual. Cámara/instancia, cancelación de ediciones,
permisos, entrada global y búsqueda de rutas comprobados.
Las capturas natural-desktop/tablet/mobile.png y bagua-experiencia-desktop/mobile.jpg
están en artifacts/screenshots. La última ficha quedó abierta en el navegador.
El test nuevo separa sus escrituras E2E de la muestra curada; los eventos del ensayo
inicial quedan anulados con motivo e historial, sin borrar información.

Se reconstruyeron frontend/backend locales; Compose saludable en localhost:8080.
Se conservan Overture, PMTiles, rutas DWG, visor histórico, restricciones backend y
capacidades administrativas. Sin push, producción, borrados ni datos oficiales.

Límites: sectores de demostración no son polígonos municipales; ubicación pendiente
no mueve la cámara a una dirección inferida. La edición avanzada y administración
siguen usando espacios amplios. La revisión técnica responsive no constituye
validación con trabajadores municipales ni aceptación institucional del Hito B.

## Consolidación documental · 17/11/2026

**Alcance exclusivo: Markdown.** No se implementaron funciones ni se modificaron
interfaz, código, migraciones, datos o configuración. Cambios previos conservados;
sin push ni despliegue. Los cortes técnicos siguientes conservan sus fechas y
resultados: no se volvieron a ejecutar ni acreditan automáticamente los nuevos
criterios USO-01–10. La validación con usuarios municipales sigue pendiente.

| Fuentes conservadas y modificadas                                                                                                       | Resultado                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md / CLAUDE.md                                                                                                                   | Instrucciones compartidas cortas; consulta por tarea, sin lectura universal ni continuidad automática de planes anteriores             |
| PRODUCT.md                                                                                                                              | Fuente de identidad, usuarios, valor y sencillez externa sin reducir capacidad                                                         |
| VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md                                                                                                  | Reglas de búsqueda, selección, inspector, acciones, ampliación, escritorio/móvil y descubribilidad                                     |
| VISION_MAESTRA_PRODUCTO_FINAL_WEBGIS_BAGUA.md                                                                                           | Dominio, relaciones, seguridad, fuentes y restricciones; se retiran navegación superada, instrucciones y aceptación duplicadas         |
| CRITERIOS_ACEPTACION_CODEX.md                                                                                                           | Aceptación técnica más recorridos reales y visibles; Hito A separado del Hito B                                                        |
| README.md                                                                                                                               | Instalación/uso con comandos y rutas contrastados; autenticación, entregas y reportes no se niegan; fondo remoto limitado al histórico |
| estado-real, experiencia-mapa-trabajo, entorno-geografico-integrado, gestion-bagua-master, segregacion-fixtures y architecture en docs/ | Enlaces y cortes históricos aclarados; documentación técnica conservada                                                                |
| Skills bagua-product-craft y bagua-calm-interface                                                                                       | Consulta pertinente a producto, interacción y dominio; sin nueva cadena de lectura completa                                            |
| Diez archivos en mds/                                                                                                                   | Copias de la exportación inicial idénticas salvo espacio terminal; sustituidas por enlaces a la única fuente activa o histórica        |

**Archivados, sin autoridad operativa:**
[misión](archive/MISION_CODEX_FINALIZAR_WEBGIS_BAGUA.md),
[plan sin Rentas](archive/PLAN_EJECUCION_BAGUA_MASTER_SIN_RENTAS.md) y
[experiencia anterior](archive/VISION_EXPERIENCIA_WEBGIS_BAGUA.md).
Se preserva su cuerpo y se añade advertencia histórica. Antes de retirarlos se
conservaron contratos externos/versionables, conciliación, reversión, aislamiento
de muestras y casos de prueba vigentes en dominio/aceptación. Las v2/REFERENCIAS
no recibidas dejan de ser dependencias activas; no se inventan documentos.

**Contradicciones resueltas:** sidebar modular frente a entorno integrado; demo
como contrato del padrón; ausencia de auth/entregas afirmada en README frente al
código actual; estilo remoto sin distinguir visor; pruebas de endpoints como
terminación visible; instrucciones repetidas en Codex/Claude y copias mds/.
Todos los enlaces a documentos trasladados apuntan al archivo histórico; no se
usan esos documentos para ordenar el siguiente incremento.

**Jerarquía:** AGENTS para operar; PRODUCT para identidad/UX; entorno integrado
para interacción; visión maestra para dominio/restricciones; criterios para
aceptación; este tablero para evidencia/pendientes; README para instalar/ejecutar.
La matriz de auditoría se conserva en [estado-real](estado-real-bagua-master.md).

**Verificación documental:** `git diff --check`, enlaces Markdown locales a
archivos, comandos npm del README frente a package.json y rutas frente a router,
app y Compose. Comparación de huellas de archivos no Markdown respecto al inicio.
No se ejecutan baterías de aplicación, importadores, seeds ni servicios.
Resultados del cierre: **114 enlaces locales en 41 Markdown, cero rotos**;
**22 comandos npm** del README contrastados; **345 archivos no Markdown** con
huellas idénticas al inicio. Los tres cuerpos archivados coinciden con los originales.
`git diff --check` sin incidencias. Son verificaciones documentales, no pruebas
nuevas de la aplicación.

**Medición de archivos reales (UTF-8):** núcleo raíz de 153,791 a
71,048 bytes (**53.8 % menos**): diez
archivos iniciales frente a siete activos, excluyendo docs/archive/. Las diez
copias mds/ pasan de 153,791 a 2,115 bytes como enlaces de compatibilidad.
Núcleo más copias: 307,582 → 73,163 bytes
(**76.2 % menos**).
Este porcentaje no representa todos los Markdown del repositorio ni ahorro exacto
de tokens; los manuales, el avance y el archivo histórico siguen conservados.

**Pendientes humanos:** no cambia la falta de padrón oficial autorizado, catálogos,
permisos/ámbitos, programación validada y aceptación institucional. El recorrido
visible más reciente sigue siendo el corte «Producto visible y recorridos reales»;
esta entrega no acredita una nueva evaluación con personal municipal.

## Entregas ejecutadas en esta sesión

| ID      | Capacidad                                                                  | Estado | Código/API/DB/UI                                                      | Evidencia                                                                                                            | Límite y próximo paso                                                                                                     |
| ------- | -------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| M4-CSV  | Archivo UTF-8 delimitado y mapeo configurable                              | [x]    | gestion.csv.ts, csv-source.tsx, POST importaciones/columnas y validar | gestion-files-reports.spec.ts en PC/tableta/móvil                                                                    | 500 filas, 700 KB; dirección/código obligatorios; CSV y JSON, no XLSX                                                     |
| M4-REV  | Staging y revisión de altas/sin cambios/conflictos, aplicación idempotente | [x]    | gestion.repository.ts y migración 018                                 | Duplicados, columnas ausentes, comillas inválidas, bandera real rechazada y reimportación probadas                   | Conflictos se rechazan; corregir/mapping y revalidar. Conciliación de actualizaciones y rollback selectivo aún pendientes |
| M5-REP  | Filtros de periodo/sector/material/servicio y exportación CSV              | [x]    | gestion.reports.ts, GET reportes/exportar y Reports                   | UI y descarga; consulta devuelve 403 al exportar; SQL de fixtures: cero grupos inconsistentes                        | Textos exactos; estado de anulación excluido, sin cobertura municipal. No exporta identidades                             |
| M2-PER  | Buscar persona autorizada y navegar por vínculos N:M                       | [x]    | GET personas/:id/predios, search-box y person-reference               | Dos predios y tipos de vínculo; consulta 403; sin marcador para predio sin coordenadas                               | Máximo 50 resultados API/8 visibles y 100 vínculos; paginación pendiente                                                  |
| M3-CAT  | Catálogos configurables de servicios y materiales sugeridos                | [x]    | migración 019, gestion.catalogs.ts y Catalogs                         | Alta/persistencia, desactivación, rechazo nuevas asignaciones, historia conservada y permisos                        | Solo códigos TEST-; nombres inmutables y valores por validar. Material descrito libre sigue permitido                     |
| M1-USR  | Cuentas y cambio de contraseña desde interfaz                              | [x]    | migración 020, gestion.users.ts y Users/PasswordChange                | Alta UI, control de versión, revocación, auto-bloqueo rechazado, contraseña propia y 403; PC/móvil                   | Perfiles provisionales; falta recuperación/reset autorizado y ámbitos institucionales                                     |
| M6-REC  | Respaldo y restauración QA                                                 | [x]    | scripts/verify-recovery.py                                            | artifacts/mision-recovery-final.log y artifacts/recovery/*/resultado.json                                            | Copia nueva conservada; compara conteos y huellas GIS, no certifica recuperación productiva                               |
| M6-INI  | Migración desde vacío y API persistente                                    | [x]    | scripts/verify-clean-test.py                                          | artifacts/mision-clean-install.log: 20 migraciones, seed doble idempotente, login y alta recuperada tras recrear API | Base QA nueva; el mapa requiere recursos Overture legítimos existentes, no se fabrican                                    |
| SEG-LOG | Minimización de logs                                                       | [x]    | app.ts y shared/logger.ts                                             | 1.756 solicitudes recientes inspeccionadas sin query/cabeceras/cuerpo en req                                         | Logs antiguos previos no se borraron; no implica política institucional de retención                                      |

## Matriz de aceptación actual

| ID     | Estado | Validación / código                                                             | Pendiente o alcance exacto                                                                           |
| ------ | ------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| UX-01  | [x]    | Login y permisos, entorno integrado; mision-acceptance.log                      | Cartografía compartida consultable; gestión protegida                                                |
| UX-02  | [~]    | Predios/calles/rutas/personas protegidas, teclado y errores                     | Sectores como entidad espacial y paginación universal                                                |
| UX-03  | [x]    | BM-09, info-panel y selección cartográfica                                      | No se deduce predio ni identidad por edificio                                                        |
| UX-04  | [x]    | bagua-integrated-workspace.spec.ts                                              | Cámara conservada al ampliar/cerrar, no al recargar navegador                                        |
| UX-05  | [x]    | Recorridos móviles de mapa/ficha/entregas/CSV/cuentas                           | Revisión técnica, no validación de usuarios municipales                                              |
| GEO-01 | [x]    | bagua-master.spec.ts, bagua-master-rutas.spec.ts y restore QA                   | Overture y DWG, recursos propios; sin geometría PDF activa                                           |
| GEO-02 | [x]    | Alta, edición y ficha sin punto en gestión/mapa                                 | NULL permanece sin pin                                                                               |
| GEO-03 | [~]    | Estado aproximado/verificado/conflictivo y evidencia                            | Revisión formal probada; validación institucional pendiente                                          |
| DAT-01 | [~]    | Altas/edición persistidas, versión e historial; API recreada en QA              | Archivo/restauración y unidades/relaciones probados; ampliar escenarios de integridad                |
| DAT-02 | [x]    | N:M con roles/periodos/evidencia y navegación inversa protegida                 | Catálogo de vínculos institucional por validar                                                       |
| DAT-03 | [x]    | Tablas/flujo de asignación, participación y evento separados                    | No atribuye prestación efectiva a una asignación                                                     |
| DAT-04 | [x]    | Entrega con responsable, fecha, medición nullable, historial y reporte          | Corrección versionada pendiente; anulación conserva historia                                         |
| RUT-01 | [x]    | Cinco RT y quince BM de la batería GIS                                          | Documento DWG no equivale a ruta vigente ni horario confirmado                                       |
| IMP-01 | [~]    | CSV/JSON, mapeo, staging, revisión y aplicación real con metadata de archivo    | Actualización conciliada probada; reversión selectiva pendiente; no adapter Rentas desconocido       |
| IMP-02 | [x]    | E2E variantes/malformed/duplicados/idempotencia y rollback transaccional previo | No hay escrituras parciales ante rechazo                                                             |
| SEG-01 | [~]    | 401/403 API, PII de consulta omitida, exportación restringida, cuentas/sesiones | Ámbitos por recurso/designaciones institucionales y revisión integral final                          |
| SEG-02 | [~]    | Guard fixtures, preflight E2E, logs minimizados, archivos privados ignorados    | Base QA aislada comprobada; falta ciclo de fixtures determinista completo con limpieza por ejecución |
| REP-01 | [x]    | Reporte/CSV filtrado + SQL de eventos sintéticos                                | Cantidades por unidad; sin denominador ni porcentajes inventados                                     |
| OPE-01 | [~]    | Docker saludable, instalación núcleo vacío QA, migración/seed/API               | Ensayo integral de entrega en máquina nueva con paquete GIS y frontend pendiente                     |
| OPE-02 | [x]    | Backup/restore en BD nueva, conteos/huellas y migraciones/seed                  | Copias QA conservadas sin DROP; política institucional pendiente                                     |
| QLT-01 | [x]    | Check actual y baterías de misión/GIS/controles                                 | Advertencia previa de paquetes grandes; sin claim de aceptación global                               |
| QLT-02 | [~]    | Teclado/foco/labels y capturas PC/móvil, detector sin hallazgos                 | Auditoría exhaustiva y evaluación con personal municipal pendientes                                  |
| QLT-03 | [x]    | Matriz de reconciliación en estado-real y fuentes enlazadas                     | REFERENCIAS/ y las v2 citadas siguen ausentes                                                        |

## Evidencia de la sesión

- Línea base `npm run check`: **80 pruebas**, tipos, lint, formato y build aprobados;
  artifacts/mision-baseline.log. Sin fallos previos observados en ese comando.
- Check final: **96 pruebas unitarias/API**; artifacts/mision-check.log. Incluye CSV
  y controles de bloqueo de todas las nuevas mutaciones en producción.
- Integración: **36 E2E aprobadas**, 15 repeticiones omitidas en ciertos tamaños;
  artifacts/mision-acceptance.log. UI posterior de checkbox/tablas y bloqueo durante
  guardado recomprobados en móvil: cuatro aprobadas y una repetición omitida.
- Cartografía: **21 E2E aprobadas**, artifacts/mision-gis.log (15 BM, cinco RT y una
  comprobación adicional del histórico). El histórico no define la aceptación.
- Controles/3D: seis aprobadas en artifacts/mision-controls.log. En total, 63
  ejecuciones E2E aprobadas entre la batería integrada, GIS y controles, además
  de la recomprobación móvil posterior de cuatro recorridos.
- Respaldo previo: artifacts/mision-baseline-postgis.dump. Migraciones nuevas 018,
  019 y 020 son aditivas; no se editan migraciones aplicadas. No push ni producción.
- Los fallos intermedios de pruebas CSV fueron una etiqueta accesible del select,
  la confirmación de datos que debía repetirse al cambiar archivo y una expectativa
  de separador decimal. Se corrigieron y los recorridos se reejecutaron con éxito.
- Fixtures creados TEST-* o E2E-* permanecen identificados para trazabilidad. No
  representan registros ni ubicaciones oficiales; credenciales y dumps fuera de Git.

## Estado de continuación anterior (superado por el corte siguiente)

Corte anterior: el Hito A continuaba **PARCIAL**. Se propuso empezar por
conciliación explícita de cambios de importación (comparación por campo, aprobación
selectiva y reversión que respete cambios posteriores), seguida de archivo reversible
predial y unidades/secciones. Después revisión espacial formal, paginación universal,
consulta de actividades y revisión final por recurso. Incorporar corrección trazable de
entregas, recuperación de cuentas, auditoría global UI y seeds representativos aislados.
No afirmar Hito B hasta datos autorizados y validación de la Gerencia.

Instrucción histórica superada: la continuación se decide según AGENTS, la tarea
actual y el último corte de este tablero, sin ejecutar automáticamente la misión archivada.
El procedimiento anterior indicaba ejecutar `npm run check`;
usar la base local/test explícita existente; continuar IMP-01 con UI/API/DB/tests sin
cambiar Overture ni rutas DWG y sin reiniciar el trabajo ya probado.

## Continuación: conciliación, archivo y unidades · 16/11/2026

| Capacidad                          | Estado observado                   | Código y persistencia                                                         | Evidencia                                                                                                                                                           | Límite pendiente                                                                                        |
| ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Conciliación de actualizaciones    | [x] Flujo selectivo probado        | 021 base_revision; gestion.reconciliation.ts; repository/applyImport; Imports | gestion-reconciliation.spec.ts: aceptar dirección externa conservando sector local, versión obsoleta 409, conservar local, repetición idempotente; PC/tableta/móvil | Reversión selectiva posterior, equivalencias entre claves y más pruebas negativas                       |
| Claves de correspondencia          | [x] Fuente + código estable        | Restricción existente y rechazo de cambio de código por edición ordinaria     | Aplicación y revisión sobre identidad exacta                                                                                                                        | Cambio de código externo exige correspondencia explícita futura; nunca emparejar por dirección/nombre   |
| Archivo/restauración predial       | [x] Recorrido básico probado       | 022 campos archivo y triggers; POST predios/:id/archivo; PredioArchive        | Archivo UI, exclusión del listado activo, consulta archivados, bloqueo de participación, restauración y auditoría en tres tamaños                                   | Ampliar pruebas de permisos/concurrencia y de los demás triggers antes de cerrar aceptación exhaustiva  |
| Unidades/secciones administrativas | [~] Modelo y flujo básico probados | 023 gestion.unidad; gestion.units.ts; pestaña Unidades; versión y auditoría   | Alta UI, recarga, edición/desactivación API y rechazo de versión vieja, tres tamaños                                                                                | Vínculos específicos persona/unidad y unidad/servicio, vigencia adicional y pruebas negativas completas |
| Revisión espacial formal           | [ ] Pendiente                      | Continúan estados/puntos opcionales anteriores                                | No se ha implementado la propuesta/aprobación de candidatos en esta continuación                                                                                    | Siguiente incremento prioritario                                                                        |

La aplicación transaccional solo admite decisiones sobre campos permitidos. Cada
conflicto requiere conservar explícitamente o elegir campos externos. La versión
leída en la vista previa se persiste con el lote; si existe una edición posterior,
se rechaza sin aplicar parcialmente. Se guardan decisiones/responsable en los
metadatos del lote y cambios completos en historial. Una reimportación de un lote
ya aplicado devuelve repetida y no vuelve a escribir ni modifica correcciones posteriores.

El archivo no elimina datos. Administración registra motivo, usuario y fecha tanto
al archivar como al restaurar. Triggers comprueban el padre bajo bloqueo al insertar
vínculos/asignaciones/participaciones/entregas/unidades. Los eventos y relaciones
anteriores permanecen; las ediciones ordinarias de un predio archivado se rechazan.
El padrón permite ver activos, archivados o todos. La búsqueda territorial normal
excluye archivados; la ficha directa conserva consulta y muestra su estado.

Migraciones 021–023 aditivas aplicadas al destino local previamente habilitado.
Se conserva el respaldo previo en artifacts/recovery y mision-baseline-postgis.dump.
No se editaron migraciones ejecutadas ni cartografía.

Verificación: baseline anterior volvió a pasar (96 unitarias/API),
artifacts/continuacion-baseline.log. Check posterior en continuacion-check.log.
Batería integrada de esta continuación en continuacion-final-e2e.log; recomprobación
tras los ajustes finales en continuacion-smoke.log. No se afirma cobertura completa
de los nuevos módulos por la sola compilación.

**Retomar exactamente:** revisión espacial formal mediante candidatos separados del
predio, decisiones autorizadas con evidencia/versiones y conservación de geometría
Overture. Antes de pasar ese gate, completar casos negativos de conciliación/archivo
(un usuario sin permiso, cambios concurrentes y operaciones sobre padre archivado),
y vínculos de unidades con personas/servicios. El Hito A sigue PARCIAL; el Hito B
no se ha aprobado. No hay push, despliegue productivo ni borrados.

Cierre técnico de este corte: `npm run check` aprobado con 96 pruebas unitarias/API,
tipos, lint, formato y build. Batería integrada: 26 aprobadas/10 repeticiones omitidas;
recomprobación posterior: nueve aprobadas. Las huellas SQL de 14.357 edificios y
siete rutas coinciden con el respaldo del corte anterior. 23 migraciones aplicadas,
cuatro servicios saludables. Aviso previo de paquetes JS grandes permanece.

## Continuación: revisión espacial y unidades · 17/11/2026

Las entradas anteriores son cortes históricos. Quedan superadas sus menciones a
revisión espacial y relaciones específicas de unidades «pendientes» por este corte.

- Migración 024: vínculo espacial explícito separado del predio y de la geometría
  original. Propuesta, revisión, confirmación, rechazo y desvinculación con versiones,
  evidencia, responsable y motivo. La asociación compartida exige decisión explícita;
  no se deduce una identidad predial ni se escriben coordenadas administrativas.
- Desde la ficha contextual se examinan edificios en una ventana acotada del mapa,
  se seleccionan y se proponen. Administración decide; registro propone y consulta
  solo lee. Se conserva cámara y el mapa permanece montado. Panel ampliable en
  escritorio/móvil y protección de formularios sin guardar. Las geometrías confirmadas
  también se resaltan desde la ficha normal y permiten centrar el mapa.
- Migración 025: relaciones específicas de unidad con persona/rol o servicio/estado,
  periodos y evidencia; exactamente un destino. Sin trasladar relaciones del predio.
  Restricciones SQL de pertenencia, fuente, duplicidad temporal, padre archivado y
  unidad inactiva; cierre versionado y auditado. Consulta no recibe identidades.
- Personas y unidades se navegan en ambos sentidos dentro del mismo mapa. La búsqueda
  universal incorpora unidades activas por código/nombre o código del predio; limita
  resultados y señala si hay más, sin emparejar por nombres ni exponer personas.
- Auditoría global de metadatos bajo Herramientas, solo administración; cursor y
  filtros con límites. No entrega snapshots personales anterior/nuevo.

Evidencia ya ejecutada: `artifacts/espacial-check.log`, 103 unitarias/API aprobadas
más tipos/lint/formato/build; `espacial-regresion.log`, 22 E2E aprobadas y ocho
repeticiones omitidas; `espacial-gis.log`, 20 GIS aprobadas (15 BM/cinco RT).
`intensivo-e2e.log`: siete aprobadas/dos omitidas en revisión/unidades.
`intensivo-integration.log`: diez aprobadas/dos omitidas en navegación persona/unidad,
auditoría y revisión espacial. Las omisiones son repeticiones de integridad API en
otros tamaños; no constituyen aprobaciones.

`espacial-recovery.log`: copia QA nueva restaurada, 25 migraciones, conteos iguales
incluyendo unidades/vínculos espaciales/relaciones de unidad; migraciones y seed
posteriores aprobados. Huellas conservadas: 14.357 edificios y siete rutas DWG.
`intensivo-persistencia.log`: reinicio real del servicio backend y 114 consultas
idénticas, con sesión persistente; cero escrituras de dominio en esa comprobación.
Se corrigió un error del script de comprobación (UNION sobre JSON sin igualdad),
antes de obtener este resultado. No fue un fallo de persistencia del producto.

Hito A sigue PARCIAL. Continúan pendientes la reversión selectiva de importaciones
que respete cambios posteriores, correspondencias explícitas para cambios de claves,
corrección versionada de entregas, mayor aislamiento determinista por ejecución de
fixtures y ensayo integral de instalación/transferencia con paquete GIS. Los permisos
institucionales finales y el Hito B no están aprobados. No push ni producción.

## Integración operativa adicional · 17/11/2026

- Consulta por servicio conectada a Herramientas: asignaciones de predios y unidades,
  participaciones y entregas en consultas independientes, paginadas de 25 registros,
  conservando archivados/anulaciones como historia. Enlaces al predio/unidad y registro
  contextual de actividad según permiso; no expone personas ni observaciones libres.
- Recuperación administrativa de otra cuenta activa con reautenticación del administrador,
  motivo, versión y contraseña nueva distinta. Revoca sesiones de la cuenta recuperada;
  no guarda contraseñas en auditoría ni logs. El cambio propio mantiene su flujo existente.
- Búsqueda universal de unidades y navegación persona ↔ unidad probadas, incluyendo
  el foco cuando la ficha se abre con datos en caché. Se corrigió la competencia entre
  autofocus de la ficha y el de la unidad concreta; el mapa mantiene la misma instancia.

`intensivo-check.log`: 111 unitarias/API y tipos/lint/formato/build aprobados antes del
último ajuste focalizado de foco. Ese ajuste pasó ESLint/formato y E2E posterior.
`intensivo-verified.log`: nueve E2E aprobadas (persona/unidad/búsqueda, servicio y
recuperación en PC/tableta/móvil). `intensivo-flows.log` y `intensivo-corrected.log`
registran fallos intermedios: login posterior al guard omitido, select ambiguo de prueba
y foco real con caché; no se cuentan como éxitos. Las correcciones están verificadas.
`intensivo-clean.log`: instalación de las 25 migraciones desde BD QA vacía, seed dos
veces idempotente y alta API persistida tras reiniciar su servidor. La BD QA se conserva.
`intensivo-cartografia.log`: cierre con 14.357 edificios/siete rutas y las mismas huellas
que el respaldo; ninguna escritura sobre geometrías fuente.

Continuación exacta: completar reversión selectiva de lotes (manifest de cambios por
registro/campo y versión, vista previa, motivo/autorización, protección de cambios
posteriores, operación transaccional e idempotente y pruebas de rollback). Después,
corrección versionada de entregas y escenarios deterministas aislados por ejecución,
antes del ensayo de transferencia integral. No confundir estos pendientes técnicos
con la recepción/validación externa de Rentas. **Hito A PARCIAL; Hito B pendiente.**

Cierre de la batería integrada de este corte: `intensivo-regression.log`, **44 E2E
aprobadas y diez repeticiones omitidas**, sin fallos. Incluye gestión previa,
conciliación, archivo/unidades, revisión espacial, relaciones de unidades, navegación
persona/unidad/búsqueda, servicios, recuperación de cuentas, auditoría y entorno
integrado. Las omisiones no acreditan escenarios nuevos. Los resultados focalizados
anteriores se conservan como evidencia independiente; no se suman como casos únicos.

## Cierre operativo técnico · 17/11/2026

Implementados y probados los pendientes obligatorios de este corte:

- **Reversión selectiva**: migración 026, manifest DB ligado a lote/predio, valores
  exactos y versión, historial paginado y operaciones; UI bajo demanda en Importaciones,
  selección de campos y vista previa. Actualizaciones restauran solo campos elegidos;
  altas se archivan únicamente sin dependencias. Ediciones posteriores bloquean,
  sin sobrescribir trabajo local. Transacción, clave idempotente, responsable y motivo.
  Lotes anteriores sin manifest no se reconstruyen; quedan sin reversión automática.
- **Corrección de entregas**: migración 028 (027 no se creó ni se necesita), versión,
  snapshots por trigger y motivos/responsables. API/UI contextual corrige el evento
  existente, sin cambiar identidad/participación/clave; valida medición y periodo.
  Anulación mantiene historia y requiere versión si hubo correcciones previas.
  Reportes leen la versión vigente. Consulta no accede a revisiones ni puede corregir.
- **Operación y transferencia**: bootstrap administrativo protegido sin fixtures,
  respaldos con manifiesto SHA-256 y restauración en base nueva; instrucciones de
  instalación, actualización, recuperación y gestión de secretos en configuration.md.

### Verificación del bloque

`cierre-check.log`: **126 unitarias/API**, tipos, lint, formato y build aprobados.
Después de los ajustes finales, `cierre-quality.log` acredita tipos/lint/formato sin
fallos. `cierre-regression.log`: **42 E2E aprobadas y 12 repeticiones omitidas** en
PC/tableta/móvil; incluye reversión, corrección de entregas, conciliación, archivo,
CSV, catálogos, reportes/exportación, cuentas, gestión y entorno integrado.
`cierre-ux.log`: tres aprobadas tras colocar el historial de lotes bajo demanda.
Los fallos intermedios de `cierre-functional.log` fueron el selector de unidad de la
prueba y la región accesible de previsualización; ambos se corrigieron. La revisión
además corrigió la proyección de versión de entrega en la ficha antes del pase final.
No se cuentan los fallos ni las repeticiones omitidas como aprobaciones.

`operational-clean-install.log`: administrador inicial real en QA nueva sin fixtures,
rechazo de segundo bootstrap, login, 27 migraciones, seed idempotente en modo test y
persistencia tras recrear API. `cierre-restore.log`: restaurador nuevo ejercitado sobre
copia real en base nueva; upgrade 026/028 posterior sin reemplazo de la base principal.

`cierre-transferencia.log`: proyecto Docker aislado
`bagua_transfer_20261117131638_dbd02c`, contenedores y volumen nuevos, recuperación,
upgrade a 27 migraciones, login y padrón, 14.357 edificios/siete rutas; conexión
principal intacta. Frontend de esa instancia: **22 E2E aprobadas** en su browser.log,
15 BM y siete comprobaciones de conservación del histórico. El histórico se verificó
por no regresión; no define aceptación ni arquitectura del producto. Se detuvieron
solo los contenedores QA; sus bases/volúmenes se conservaron sin borrado. El paquete
GIS local se montó en solo lectura; no se ejecutó una instalación en hardware de la
Municipalidad ni se desplegó producción. Los cuatro servicios principales saludables.

### Reevaluación completa de los criterios vigentes

`[x]` acredita el alcance técnico local con registros sintéticos; no una política
institucional aprobada ni ausencia absoluta de defectos. La evidencia acumulada
anterior sigue vigente donde este bloque no modificó el componente.

| Criterio | Estado | Evidencia y alcance al cierre                                                                                    |
| -------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| UX-01    | [x]    | Inicio/ingreso y denegación, misión/regresión y transferencia Docker                                             |
| UX-02    | [x]    | Predios/personas autorizadas/unidades/rutas; búsqueda, foco y vacíos en intensivo-regression y cierre-regression |
| UX-03    | [x]    | Overture independiente, candidatos explícitos y sin titular/ubicación inventados; espacial y BM                  |
| UX-04    | [x]    | Mapa montado entre fichas, personas/unidades/servicios; suites integradas                                        |
| UX-05    | [x]    | Recorridos PC/tableta/móvil, capturas y formularios/contexto probados                                            |
| GEO-01   | [x]    | Huellas de intensivo-cartografia y 15 BM en transferencia; fuentes locales conservadas                           |
| GEO-02   | [x]    | Alta/consulta/edición sin punto y confirmación espacial sin crear coordenadas                                    |
| GEO-03   | [x]    | Candidatos/estados, decisión humana, conflictos compartidos y versiones; gestion-spatial                         |
| DAT-01   | [x]    | Predios/unidades, archivo/restauración e historial; reinicio y recuperación reales                               |
| DAT-02   | [x]    | N:M, roles/periodos y vínculos propios de unidad; permisos y navegación bidireccional                            |
| DAT-03   | [x]    | Asignación, participación y entrega separadas; operación por servicio paginada                                   |
| DAT-04   | [x]    | Registro, corrección versionada, concurrencia, anulación e incidencia en reportes                                |
| RUT-01   | [x]    | Siete rutas DWG preservadas como documentales; sin declarar horarios/vigencia                                    |
| IMP-01   | [x]    | CSV/JSON/mapeo/staging/conciliación/manifests/reversión selectiva probados                                       |
| IMP-02   | [x]    | Errores, duplicados, idempotencia, ediciones posteriores y rollback ante dependencias                            |
| SEG-01   | [x]    | Roles de ensayo en backend, 401/403, revisiones privadas y exportaciones restringidas                            |
| SEG-02   | [x]    | Destino fixture explícito, bloqueo producción, bootstrap separado, logs mínimos y archivos privados ignorados    |
| REP-01   | [x]    | Filtros/CSV/SQL de eventos; cantidades por unidad y correcciones vigentes, sin porcentajes inventados            |
| OPE-01   | [x]    | Núcleo vacío y proyecto Docker aislado con frontend/API/PostGIS/paquete GIS y acceso                             |
| OPE-02   | [x]    | Copia, checksum, restauración real a base nueva y upgrade; volumen principal intacto                             |
| QLT-01   | [x]    | 126 pruebas/check, regresión relevante y transferencia; aviso de tamaño JS no bloqueante                         |
| QLT-02   | [x]    | Básicos de teclado/foco/etiquetas/estados y capturas responsive; no estudio con personal municipal               |
| QLT-03   | [x]    | Tablero único, manual de gestión/configuración y decisiones vigentes enlazadas                                   |

**Hito A terminado técnicamente en el alcance local/sintético de los criterios
vigentes.** Se acreditan recorridos DB/API/UI, permisos y persistencia, no solo
compilación. Los fixtures permanecen en entornos/schema identificados; el bootstrap
productivo no instala muestras. Los volúmenes QA son independientes y removibles
mediante una futura limpieza expresamente autorizada; no se eliminaron en esta sesión.

Excepciones/límites conocidos: no revertir automáticamente lotes previos sin manifest
ni registros con cambios posteriores; no inferir claves/identidades cuando Rentas
cambie sus códigos; avisos existentes de tamaño JS; no se promete operación offline,
TLS/dominio institucional, validación con usuarios reales ni rendimiento para un
padrón de tamaño/formato desconocido. No son nuevas funciones obligatorias del Hito A.

**Hito B pendiente**: datos oficiales autorizados, correspondencias/conciliación real,
catálogos/permisos/ámbitos y rutas/horarios confirmados por responsables, infraestructura,
secretos, retención/custodia, capacitación y aceptación institucional. No se simuló su
aprobación. No push, despliegue productivo, borrado ni modificación de datos reales.

## Producto visible y recorridos reales · 17/11/2026

Corrección de prioridad: los cortes técnicos anteriores no sustituían la comprobación
de que una persona pudiera descubrir y utilizar las funciones desde el inicio real.
La inspección en navegador de `http://localhost:8080/bagua-master` confirmó sesión
anónima y gestión escondida dentro de Herramientas; la interfaz inicial parecía solo
un mapa. No faltaba ejecutar otra aplicación administrativa ni cargar otra base.

Cambios comprobados:

- Entrada **Ingresar** visible en la cabecera. Tras autenticar, muestra cuenta/perfil
  y **Registros**; el ingreso vuelve al mismo mapa. Inicio contextual plegable con
  acceso a padrón, entregas, servicios y reportes. Datos y ejemplos vienen de APIs
  autenticadas; no arrays React que simulan registros.
- Ficha contextual con **General, Personas, Unidades, Servicios y Actividad**. Personas
  y unidades navegables desde esa ficha; operaciones extensas siguen ampliándose
  dentro del mapa. Consulta no recibe identidades ni acciones de escritura.
- Cinco escenarios `SYN-BAGUA-*` persistidos en el destino local autorizado, con
  personas ficticias/roles actuales e históricos, unidades/servicios, participaciones,
  doce entregas iniciales, vínculos espaciales de ensayo y lote con conflicto.
  Carga explícita `docker compose exec -T backend node backend/dist/db/gestion-scenarios.js`.
  Guardia de entorno/base, transacción y repetición sin altas ni modificaciones a lo
  existente, incluso si el usuario ya editó un escenario. `scenarios-seed.log` acredita
  comparación de conteos/historial idénticos en segunda ejecución.
- Principal para usar: **SYN-BAGUA-MULTI**. Otros: **SYN-BAGUA-SIN-UBICACION**,
  **SYN-BAGUA-REVISION**, **SYN-BAGUA-VIVIENDA** y **SYN-BAGUA-ARCHIVADO**.
  Las coordenadas administrativas permanecen NULL: las relaciones revisadas de
  ensayo muestran geometría Overture original sin inventar puntos ni límites.

Evidencia visible: `artifacts/producto-recorridos.html` agrupa **24 capturas reales**,
ocho por escritorio/tableta/móvil, de inicio, búsqueda, ficha, relaciones/unidades,
entrega, revisión espacial, reporte y herramientas. Los PNG originales están en
`artifacts/screenshots/producto-*`; no hay mockups ni contraseñas en las capturas.
`producto-frontend-servido.json` registra URL y bundle efectivamente servido por Docker.

Recorridos A–F desde la URL principal, login por formulario real, sin enlaces privados
preparados: edición y recarga; entrega de 2,5 kg y reporte que refleja el evento;
persona → unidad; decisión espacial humana; herramientas de administración. Aprobados
PC/tableta en `product-journeys-final.log`, móvil en `product-journeys-final-mobile.log`.
`producto-permisos.log`: recorrido completo de escritorio con detector de respuestas
HTTP 5xx sin hallazgos y perfil consulta adicional aprobado: menú sin administración,
ficha sin identidades y API 403 en auditoría/personas/escritura de cuentas. Cero errores
de página/diálogos inesperados en los recorridos aprobados. ESLint focalizado aprobado;
las imágenes Docker construidas verifican tipos/build. No se repitió la batería general.

Los intentos intermedios se conservan: el primer worker fue detenido deliberadamente;
se ajustaron selectores al formulario ampliado (no al inspector oculto) y se esperó
el cierre automático del login. No se cuentan esos intentos como aprobaciones.

Funciones operativas de infraestructura (primer administrador, backup/restore) conservan
sus comandos documentados; no se agregaron botones capaces de modificar infraestructura
al visor. Información oficial, políticas/designaciones y operación institucional siguen
requiriendo entrega/autorización real. No hubo push, despliegue productivo ni borrado.

## Pitch institucional para el ingeniero Jhossi · 17/11/2026

Se reconstruyó la presentación como un recorrido de producto de **15 láminas**:
necesidad municipal, mapa integrado, búsqueda autorizada, ficha y relaciones,
modalidades del servicio, rutas, concepto QR de campo, entrega/historial,
planificación propuesta, indicadores sintéticos, evolución cartográfica y
transferencia. Claude aparece únicamente en las dos últimas láminas principales.
Solicitud: US$100 mensuales de base, cuatro meses US$400; quinto opcional hasta
US$500 acumulados, con verificación administrativa y evidencia mensual.

Entrega local en `artifacts/pitch-webgis-bagua-jhossi/entrega/`:

- `WEBGIS_BAGUA_Pitch_Jhossi_Final.pptx`: textos, diagramas, maquetas de interfaz
  y gráfico nativos editables; capturas y escenas generadas como imágenes.
- `WEBGIS_BAGUA_Vista_Previa.pdf`: las quince láminas para lectura, versión raster.
- `Vista_previa.png`: vista general de la secuencia.
- `Guion_Jhossi.md`: explicación breve por lámina, preguntas y fuentes.

Capturas auténticas de BAGUA MASTER y registros sintéticos locales; no se
introdujeron correspondencias oficiales ni puntos prediales inventados. Las
maquetas visuales, QR, planificación y render urbano 3D están identificados como
propuestas/conceptos; la captura 2.5D actual se distingue del render conceptual.
Las rutas conservan su procedencia DWG y no se les atribuyen horarios vigentes.
Los indicadores usan un conjunto ilustrativo independiente: 12 participantes,
28 entregas, 24 con medición, cuatro sin medición y 100 kg; no son resultados
municipales. Las fuentes y precisiones están en las notas del PowerPoint.

Verificado: revisión visual individual de las quince láminas; validadores de
estructura, geometría y tipografía sin hallazgos ni advertencias; gráfico nativo
con libro de datos incrustado y referencias comprobadas. Reimportación del PPTX
final y renderizado de sus quince láminas **idénticos píxel a píxel** a los
renders revisados. PDF de quince páginas renderizado con Poppler; sus imágenes
incrustadas conservan exactamente esos renders. Apertura y edición en PowerPoint
de escritorio no verificadas; no se equipara la comprobación de OOXML con esa
prueba. No acredita validación de uso ni aceptación municipal.

Evidencia privada de construcción en `.build/`: `final-validation-delivery.json`,
`render-comparison.json`, `delivery-checks.json`, `pdf-validation.json`,
`asset-provenance.json` y `dataset-indicadores.csv`. No se modificó código de la
aplicación ni se escribieron registros durante la preparación de este pitch.

## Revisión del pitch · Versión 2

Se revisaron las escenas 3–13 para comunicar experiencias objetivo y conexiones entre servicios, rutas, entregas y resultados. Planificación reemplazada por una jornada geográfica; horarios DEMO diferenciados de evidencia DWG. Entrega separada en artifacts/pitch-webgis-bagua-jhossi/revision-2. Comprobaciones estructurales y gráfico editable en .build/validation-v2-final.json; renders revisados. No se modificó código WebGIS. La revisión no acredita aceptación municipal.

## 2026-11-17 · Primera interfaz UI-02 en Figma

Creada mediante Figma MCP en la conexión «Figma»: [UI-02 editable](https://www.figma.com/design/TmGDHLTDMEd4q8HpUJXnfx?node-id=4-2202).
Alcance de esta entrega: una composición de 1760 × 990 con búsqueda, selección
cartográfica y ficha territorial. El contrato de producto y diseño indicado por
el usuario prevalece sobre la interfaz anterior. No se crearon otras pantallas.

La ficha separa P-01428, U-01 vivienda, U-02 local y la relación de Mariana Salas
Rojas como contribuyente del predio. Servicios y entregas se presentan en U-01;
dos entregas ilustrativas suman 7,7 kg medidos. La cartografía se deriva de los
GeoJSON originales Overture, sin modificarlos. La asociación predial es una
escena conceptual expresamente marcada, no una correspondencia municipal real.

Verificación MCP del marco: 72 textos, 51 instancias, 2086 vectores, 31 variables
locales y ningún nodo con relleno de imagen. Tipografía Source Sans 3 comprobada;
sin textos fuera de los límites del inspector. Revisada la captura inicial y una
captura posterior a las correcciones de alineación y representación de ríos.
Vista previa: `artifacts/figma-ui02/UI-02-preview.png`.

Es diseño editable para evaluación visual, no implementación de interacciones
en el frontend ni validación con usuarios. No se escribieron registros en la
base de datos. Pendiente: evaluación del usuario antes de ampliar el lenguaje
visual a otras pantallas o presentación. Esta entrega no acredita el Hito A.

### Continuación de la interfaz en Figma

Se añadieron UI-01 y UI-03 a UI-10 al mismo archivo, reutilizando los
componentes, tipografía, variables y cartografía de UI-02. El prototipo enlaza
inicio, búsqueda, ficha, servicios, rutas, atención móvil, historial,
supervisión y resultados. La ruta documental MUN-1001 se muestra separada
de la asignación ilustrativa RC-02. El flujo móvil parte del punto de
atención PA-01428-U01 identificado en el escenario y abre el historial de U-01.
Los resultados mantienen el alcance de 2 entregas y 7,7 kg medidos.

Figma devolvió los diez marcos con texto editable y 61 controles con enlaces
de prototipo. La comprobación de límites inferiores no encontró texto
recortado. Se revisaron capturas de UI-03, UI-06 y UI-10. En UI-10, Figma
guardó la perspectiva, pero la captura no la refleja. Se importó una proyección
vectorial alternativa (nodo 7:384) con huellas Overture y datos locales de
alturas estimadas de Google Open Buildings 2.5D (CC BY 4.0). El límite de
llamadas del plan Starter impidió incorporar ese recurso al marco de UI-10 y
revisar visualmente los marcos restantes. Los enlaces se comprobaron en el
archivo, sin prueba de uso integral en el modo Presentar.

Se añadieron dos capturas complementarias en `artifacts/capturas-figma`.
UI-11 muestra la búsqueda y la ficha con dos entregas registradas. UI-12
muestra la lectura ilustrativa del QR de U-01 y el registro del programa,
material y observación opcional. Las dos escenas prescinden del pesaje
por decisión del usuario y usan azul tinta e índigo con acentos por servicio.
Se generaron localmente con la cartografía Overture por el límite de Figma
MCP. Playwright comprobó la apertura de la ficha al seleccionar el resultado,
los dos estados de entrega y el flujo de confirmación y guardado simulado.
