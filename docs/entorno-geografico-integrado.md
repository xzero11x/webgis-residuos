# BAGUA MASTER: entorno geográfico integrado

> Registro de incrementos con cortes históricos. Para el estado actual consultar
> el [avance único](avance-verificado.md); los límites y conteos de cada corte no
> acreditan que sigan pendientes o hayan sido reprobados hoy. La interacción objetivo
> se define en [entorno integrado](../VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md).

## Decisión vigente

La decisión del usuario se consolida como reglas ejecutables en
[VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md](../VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md).
Prevalece sobre la propuesta anterior de una sidebar con módulos permanentes.
AGENTS.md, CLAUDE.md, PRODUCT.md y ambas skills propias de Bagua incorporan la
decisión: mapa primero, acciones según contexto y complejidad bajo demanda.

## Implementación

- BAGUA MASTER abre con el mapa, búsqueda y herramientas; no tiene sidebar fija
  ni una copia reducida de ella en móvil. El visor histórico conserva su carcasa.
- La búsqueda reúne predios protegidos, calles/lugares Overture y las siete rutas
  documentales DWG disponibles. Código, nombre y sectores documentados permiten
  encontrar rutas sin atribuirles vigencia operativa.
- La ficha contextual puede ampliarse dentro del mismo entorno. La vista ampliada
  de un predio prioriza su ficha y oculta el listado del padrón; el padrón completo
  sigue disponible desde Herramientas.
- Registrar entrega desde el inspector abre la ficha con el predio asociado y la
  sección de entregas activa. Si hay una única participación, se preselecciona;
  si hay varias se elige expresamente. Si no existe participación, primero debe
  registrarse. No se infiere participación a partir del contribuyente.
- La entrada global Registrar actividad permite elegir un predio aunque no tenga
  ubicación. Al seleccionarlo, abre el mismo recorrido contextual.
- Reportes e importaciones se abren como espacios ampliados desde Herramientas,
  según los perfiles de prueba existentes. Los permisos del backend no cambian.
- Cerrar la vista ampliada conserva la instancia del mapa y su cámara. La selección
  administrativa de trabajo se mantiene separada del elemento que quedó en el mapa;
  al volver puede mostrarse el nuevo predio seleccionado, si corresponde.
- Formularios administrativos y lotes de importación advierten de cambios sin
  guardar al cerrar, navegar o salir; cancelar la advertencia conserva lo escrito.

La ampliación usa los componentes existentes y gestión de foco de Radix, con el
mapa montado detrás. En móvil ocupa el espacio necesario para formularios; la ficha
breve sigue siendo un panel inferior. No se recarga la aplicación para alternar.

## Estado y contratos

> **Actualización 2026-11-18.** La ampliación sobre el mapa descrita arriba se sustituyó por
> cuatro espacios con rutas propias (ver «Espacios y rutas» en
> [avance verificado](avance-verificado.md)). Lo que sigue describe el estado anterior.

`/bagua-master?trabajo=gestion` representaba una tarea ampliada. Hoy esos enlaces, y los
antiguos `/bagua-master/gestion`, se redirigen al espacio equivalente (`legacyWorkTarget`).
La cámara del mapa se recuerda al ir y volver entre mapa y expedientes durante la sesión;
no se afirma persistencia de cámara tras recargar el navegador.

Se reutilizan autenticación, formularios, consultas, permisos, importador y
registro de entregas existentes. No hay migraciones ni nuevas dependencias.
No se cambian geometrías, PMTiles, identificadores, fuentes Overture ni rutas DWG.
Todo registro administrativo continúa siendo sintético y separado del legado.

## Comprobación

`tests/e2e/bagua-integrated-workspace.spec.ts` comprueba permanencia de la instancia
del mapa y cámara, ficha ampliada, entrega contextual, cambios sin guardar,
entrada global, permisos de herramientas y búsqueda de rutas en PC/móvil/tableta.
Se complementa con los recorridos previos de búsqueda, gestión y cartografía.
Las pruebas crean registros `E2E-CONTEXTO-*`, conservados para trazabilidad.

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:8080'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npx playwright test tests/e2e/bagua-integrated-workspace.spec.ts --workers=1
```

Capturas comparables con las del incremento anterior en
`artifacts/screenshots/integrated-*.png`; registros de comprobación en
`artifacts/integrated-workspace-*.log`.

Resultado de esta entrega: `npm run check` aprobado (tipos, lint, formato,
60 pruebas unitarias y compilación). Quedaron aprobados **53 escenarios E2E**:
10 de entorno integrado, 9 de búsqueda/inspector, 6 de gestión, 22 de cartografía
y visor histórico, y 6 de controles. Se omiten 11 repeticiones en tamaños donde
el mismo caso ya está cubierto. La prueba de importación se actualizó al acceso
por Herramientas y pasó en la recomprobación; el retorno al visor histórico
también pasó al repetirse aisladamente tras un tiempo de carga excedido.

Se compararon capturas de escritorio, tableta y móvil; se comprobó el encabezado
fijo y el espacio de desplazamiento de la ficha ampliada. El detector de Impeccable
no encontró hallazgos en los componentes revisados. Docker Desktop se recuperó
durante el trabajo y los cuatro servicios quedaron saludables. No se realizaron
migraciones. Permanece la advertencia previa de tamaño de los paquetes de mapa.

## Límites pendientes

No se declara terminado todo lo descrito en la visión. Quedan búsqueda de personas
según permisos y relaciones, sectores como entidades con geometría autorizada,
consulta inversa de actividades, unificación de inspectores documentales,
capas administrativas disponibles bajo demanda, administración visual de cuentas,
catálogos configurables y conciliación de fuentes reales. Las nuevas funciones
deberán integrarse en este patrón, sin añadir automáticamente módulos permanentes.
Las reglas y roles institucionales aún requieren validación con la Gerencia.
