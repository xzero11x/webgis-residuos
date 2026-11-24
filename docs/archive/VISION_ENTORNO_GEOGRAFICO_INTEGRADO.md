# BAGUA MASTER — reglas de interacción

Especificación objetivo de UX. Reemplaza la navegación permanente por módulos de
las propuestas anteriores. [PRODUCT.md](PRODUCT.md) define identidad y principios;
la [visión maestra](VISION_MAESTRA_PRODUCTO_FINAL_WEBGIS_BAGUA.md) define dominio.
El [avance único](docs/avance-verificado.md) distingue lo probado de lo pendiente.

## Distribución y descubribilidad

- Mapa como superficie principal; búsqueda visible, controles cartográficos
  agrupados y acceso reconocible a ingreso/cuenta y tareas autorizadas.
- Sin sidebar permanente de módulos. No añadir una entrada fija por funcionalidad.
  Capas, filtros y herramientas aparecen bajo demanda; no abrir paneles sin necesidad.
- El estado inicial permite reconocer cómo buscar, consultar registros e iniciar
  acciones habituales. Controles con nombres comprensibles, sin depender de iconos,
  hover, atajos ocultos ni conocimientos GIS. No convertir el mapa en pantalla vacía.
- Revelar complejidad progresivamente sin eliminar funciones ni ocultar entradas
  esenciales. La ubicación de acciones equivalentes debe ser consistente.

## Búsqueda universal

- Buscar entidades disponibles y autorizadas: predios por código/dirección, vías,
  lugares, rutas, sectores y personas/unidades cuando existan contratos y permisos.
  No presentar como disponible una entidad aún no implementada.
- Distinguir tipo, identificador legible, dirección/sector si constan y procedencia;
  mostrar coincidencias ambiguas para elegir, sin seleccionar la primera por defecto.
- Aplicar permisos también en consulta, sugerencias y API. No revelar identidades
  mediante resultados parciales, conteos o mensajes no autorizados.
- Al elegir, abrir el inspector correcto. Centrar solo una ubicación confiable;
  para aproximadas ofrecer acción explícita y aviso; sin ubicación abrir ficha sin pin.
- Ofrecer navegación por teclado, foco visible, carga, vacío, error recuperable y
  opciones para refinar la búsqueda. No sustituir fallos por datos DEMO.

## Selección e inspector

Seleccionar desde mapa, búsqueda o tabla conduce al mismo patrón: **inspeccionar →
actuar → volver**. Resolver superposiciones permitiendo elegir el objeto correcto.

| Entidad | Contenido y acciones esperados según permiso y evidencia |
|---|---|
| Edificio Overture | Datos cartográficos y vínculos explícitos; sin vínculo no atribuir predio ni titular |
| Predio | Código, dirección, ubicación, uso, fuente; personas, unidades, servicios, actividad e historial |
| Persona o unidad | Tipo y relaciones autorizadas; navegación al predio y retorno al origen |
| Ruta | Trazado DWG, fuente, revisión y sectores respaldados; horario/vigencia solo si confirmados |
| Sector | Ámbito documentado y registros relacionados; análisis con filtros heredados |
| Actividad/entrega | Fecha, material, medición si existe, responsable y participante documentado |

Mostrar primero identidad, estado y datos esenciales; permitir consultar fuente y
fecha sin llenar la ficha de diagnósticos. Expresar lo ausente como «Sin información
registrada» o «Pendiente de verificar». No confundir asignación, participación y entrega.
Compartir estructura visual entre fichas y evitar inspectores competidores.

## Acciones y espacios ampliables

- Toda acción territorial puede iniciarse desde su entidad cuando hay permiso.
  «Registrar entrega» desde un predio hereda ese predio sin pedir buscarlo otra vez.
- También existe entrada global a registro, padrón y consulta cuando se desconoce
  ubicación o participante. Buscar la entidad dentro del mismo recorrido.
- «Abrir ficha completa», tablas, formularios extensos, reportes, importaciones y
  administración se amplían en el entorno; no forzar tareas complejas en un lateral.
- Conservar la instancia del mapa y, al regresar, cámara, selección, búsqueda,
  filtros y contexto de origen pertinentes. No confundir este requisito con prometer
  persistencia de cámara tras recargar el navegador si aún no existe.
- Navegar entre predio, persona, unidad, servicio y actividad conserva una forma
  comprensible de volver. Cambiar de tarea no debe obligar a recomenzar.
- Proteger cambios sin guardar al cerrar, navegar o salir; cancelar conserva lo
  escrito. Guardado con validación clara, prevención de doble envío, confirmación,
  historial y recuperación ante fallos. Confirmar cambios importantes antes de aplicarlos.
- Herramientas avanzadas según perfil; no sustituir controles de backend por ocultar
  botones. Nunca sacrificar integridad, permisos o capacidad por mantener el mapa visible.

## Escritorio, móvil y accesibilidad

- Escritorio: mapa, buscador e inspector contextual lateral; vistas ampliadas para
  edición/análisis. Cerrar libera espacio y devuelve el foco a un origen útil.
- Móvil: panel inferior ampliable, búsqueda accesible, acciones táctiles y formularios
  adaptados al teclado virtual. Tablas con una alternativa utilizable; no sidebar reducida.
- Evitar que paneles o controles tapen selección y acciones. Verificar pantalla
  estrecha, desplazamiento, apertura/cierre y regreso al mapa.
- Etiquetas claras, contraste suficiente, estados distinguibles sin color, foco y
  navegación por teclado; animaciones prescindibles y sin depender de hover.
- Distinguir carga, vacío, error, falta de sesión/permiso, desconexión y guardado.
  Explicar qué ocurrió y cómo continuar con lenguaje municipal, sin tablas SQL ni jerga.

## Apariencia y datos

Aplicar el principio de sencillez externa de PRODUCT.md. Reutilizar componentes y
tokens existentes. Priorizar jerarquía, espacio útil y consistencia; gráficos solo
para responder una pregunta concreta. Procedencia e incertidumbre siguen visibles.
Las alturas simuladas solo por elección explícita, desactivadas al inicio y
separadas de alturas observadas/derivadas.

Los ejemplos visuales no son fuentes geográficas ni datos municipales. Se mantienen
Overture, recursos locales, rutas DWG e independencia del visor histórico según la
visión de dominio. Para verificar recorridos y usabilidad aplicar
[criterios de aceptación](CRITERIOS_ACEPTACION_CODEX.md), con evidencia de escritorio
y móvil; una revisión técnica no sustituye la validación con personal municipal.
