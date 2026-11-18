# Mapa de trabajo: búsqueda e inspector

**Actualización posterior:** la navegación por módulos permanentes queda
sustituida por el [entorno geográfico integrado](entorno-geografico-integrado.md).
Las fichas completas ya se amplían dentro del mapa; este documento conserva
la descripción y los resultados del incremento previo.

Incremento del 15/11/2026 sobre BAGUA MASTER. Resuelve la tarea de localizar un
registro administrativo y entender su información sin abandonar el mapa. No
requiere datos de Rentas ni convierte el DEMO histórico en padrón nuevo.

## Referencias y antecedente

- [Visión maestra](../VISION_MAESTRA_PRODUCTO_FINAL_WEBGIS_BAGUA.md): dominio y restricciones.
- [Experiencia anterior archivada](archive/VISION_EXPERIENCIA_WEBGIS_BAGUA.md):
  antecedente del incremento; no guía la navegación actual ni acredita datos.
- [Interacción vigente](../VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md) y
  [producto](../PRODUCT.md) definen la experiencia objetivo.

Las visiones describen el producto objetivo. Este documento registra únicamente
el incremento implementado; no acredita aceptación institucional.

## Recorrido disponible

1. Abrir `/bagua-master`. El buscador encuentra calles y lugares de Overture.
2. Para buscar predios, ingresar desde el enlace del buscador con una cuenta local
   de prueba. Al ingresar se recupera la búsqueda en el mapa.
3. Buscar código, dirección o sector. Los resultados distinguen padrón sintético
   y cartografía. No se selecciona automáticamente la primera coincidencia.
4. Elegir un predio. Aparece un inspector derecho en escritorio y un panel inferior
   en móvil, con General, Servicios y Actividad. No se abre simultáneamente otra
   ficha cartográfica o de ruta encima de él.
5. Abrir la ficha administrativa completa para edición, personas e historial según
   perfil. Volver al mapa conserva la selección y el término de búsqueda.
6. Cerrar el inspector devuelve el foco al buscador y libera el espacio del mapa.

La búsqueda se puede recorrer con Tab o flechas, seleccionar con Enter y cerrar
con Escape. Las pestañas admiten flechas, Inicio y Fin. Carga, falta de sesión,
fallo recuperable y ausencia de coincidencias se muestran por separado.

## Ubicación y procedencia

| Estado                              | Comportamiento                                                             |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Sin coordenadas                     | Ficha consultable, sin punto ni desplazamiento inventado                   |
| Verificada en el registro sintético | Centra la referencia de prueba; no implica validación municipal            |
| Aproximada                          | No centra automáticamente; botón explícito muestra un marcador discontinuo |
| Conflictiva                         | Informa revisión pendiente y no coloca un punto                            |
| Fuera del recorte disponible        | Informa el límite; no coloca el punto en otra ubicación                    |

El edificio Overture seleccionado muestra su carácter cartográfico y la ausencia
de una vinculación administrativa confirmada. No se crea ninguna asociación por
proximidad. El 3D sigue disponible con las alturas derivadas existentes; las
simuladas quedan desactivadas por defecto y requieren elección explícita.

## Contratos y límites técnicos

Reutiliza `/api/gestion/sesion`, `/predios?q=…` y `/predios/:id`, con autorización
del backend. La ficha completa conserva la minimización por perfil: consulta no
recibe personas ni historial. El inspector utiliza el mismo contrato protegido;
no agrega datos administrativos a las teselas ni a endpoints cartográficos públicos.
La consulta privada del inspector se descarta de caché al cerrarlo.

No hay migraciones, cambios de geometrías, fuentes, identificadores o PMTiles.
Las rutas DWG siguen siendo documentales; el visor histórico conserva su acceso.
Se utiliza el mismo sistema visual y componentes de botones existentes, sin
añadir dependencias. Selección, búsqueda y pestaña contextual viven en la URL.

## Verificación reproducible

Con las cuentas locales descritas en [gestión](gestion-bagua-master.md):

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:8080'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npx playwright test tests/e2e/bagua-master-workspace.spec.ts --workers=1
```

Las pruebas usan registros claramente sintéticos `E2E-MAPA-*`, conservados para
trazabilidad. Cubren escritorio, tableta y móvil, navegación de teclado, retorno
desde ficha e ingreso, ubicaciones, privacidad de consulta y errores recuperables.
Capturas antes/después y del inspector en `artifacts/screenshots/map-*.png`.

Resultado verificado en Docker: **43 pruebas funcionales aprobadas** (9 del
recorrido nuevo, 22 de cartografía/visor histórico y 12 de gestión/controles).
Se omiten 9 repeticiones de casos ya cubiertos en otros tamaños. El recorrido
principal, las ubicaciones y los controles se comprobaron en los tres tamaños.
`npm run check` completo aprobado: tipos, lint, formato, 60 pruebas unitarias y
compilación. Permanece la advertencia previa de tamaño de los paquetes de mapa.
Los cuatro servicios de Docker quedaron saludables. No se realizaron migraciones.

La revisión visual comparó mapa y ficha en escritorio y móvil, incluyendo el
punto visible por encima del panel inferior, foco de teclado, ausencia de
desbordamiento y estados de información. El detector de Impeccable no reportó
hallazgos en los componentes nuevos; esto no sustituye validación con usuarios
municipales. Logs en `artifacts/map-workspace-*.log`.

## Lo que sigue pendiente

La propuesta anterior de navegación principal por módulos quedó reemplazada por
el entorno integrado. Las capacidades pendientes se incorporarán como acciones
contextuales y herramientas bajo demanda. La unificación visual de los inspectores
documentales sigue pendiente.

También faltan administración de cuentas desde interfaz, catálogos configurables,
unidades prediales, vínculos espaciales revisados, versiones de rutas operativas,
importadores de archivos reales con conciliación, exportaciones y transferencia
institucional. Ninguno se declara validado por el área usuaria. Continúa vigente
el avance con datos sintéticos separados mientras se recibe información autorizada.
