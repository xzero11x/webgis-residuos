# WEBGIS BAGUA — producto

## Identidad, problema y valor

Sistema municipal de gestión territorial de predios y servicios de residuos sólidos
para la Municipalidad Provincial de Bagua. **BAGUA MASTER es el producto central.**
Relaciona información dispersa de padrones, planos y registros para que el personal
autorizado pueda consultar, registrar, corregir y analizar con contexto territorial
y evidencia. No presupone fallos del servicio municipal ni pérdidas cuantificadas.

## Personas y tareas

- Personal de consulta: encontrar un predio o dirección y comprender sus relaciones
  y servicios autorizados, incluso cuando su ubicación esté pendiente.
- Personal de registro/campo: verificar referencias y registrar participación y
  entregas desde computadora o celular, con confirmación y trazabilidad.
- Responsables de Gestión Ambiental: revisar asignaciones, rutas, programación y
  reportes respaldados, identificando información incompleta o pendiente.
- Administración: mantener cuentas, catálogos, importaciones, auditoría y operación.

Son perfiles funcionales; sus permisos y responsabilidades institucionales necesitan
validación. Rentas y Catastro son posibles fuentes autorizadas, no operadores por defecto.

## Experiencia esperada

WEBGIS BAGUA debe ser potente internamente y sencillo externamente. Una persona que utiliza la aplicación por primera vez debe poder buscar un predio, comprender su ficha, consultar sus servicios y encontrar las acciones habituales sin estudiar su arquitectura. La información debe utilizar lenguaje humano y revelar detalles técnicos solamente cuando sean necesarios.

WEBGIS BAGUA es una aplicación con cuatro espacios de trabajo conectados por la misma
sesión, la misma búsqueda y la misma ficha de cada registro: **Explorar** (el mapa),
**Expedientes** (consultar a fondo un predio, una persona o una unidad), **Servicios**
(asignaciones, participaciones y registro de entregas) y **Resultados** (lo registrado por
periodo, servicio y material). **Administración** (cuentas, catálogos, importaciones,
auditoría y contraseña) queda en el menú de la cuenta.

La búsqueda universal es la entrada común: un nombre, un código, un documento ficticio,
una dirección, una ruta o un lugar. Una persona con varios predios nunca salta sola a uno:
se elige cuál consultar. Desde un predio el mapa se acerca a la edificación Overture con
vínculo espacial confirmado y la resalta; desde una edificación se llega a sus predios o se
dice, sin inventarlos, que no tiene relación predial confirmada. Cada registro tiene dos
niveles: la ficha rápida junto al mapa y el expediente completo (identidad, ubicación,
relaciones, servicios, cadena de información e historial). Se puede ir y volver entre
ambos sin perder la posición del mapa.

La simplicidad visual conserva capacidades y hace descubribles las funciones: el inicio
explica qué se puede buscar y cómo comenzar. La estética sigue el sistema Geist de Vercel
(blanco y negro, tema claro y oscuro, azul para lo verificado, ámbar para lo que requiere
revisión, violeta para lo sintético o ficticio). Sin dashboard obligatorio de entrada.

La claridad de Vercel (Geist) y macOS orienta jerarquía, consistencia y sobriedad, sin
copiar sus marcas. Cada componente facilita una tarea o explica un dato; no hay decoración
que compita con el trabajo. En móvil se adapta la interacción, no se encoge el escritorio.

## Confianza y alcance

La ficha permite entender qué entidad se ve, qué se sabe, qué falta, qué fuente lo
respalda y qué se puede hacer. «Sin información» no significa «sin servicio».
Los detalles de dominio y restricciones se definen en la
[visión maestra](VISION_MAESTRA_PRODUCTO_FINAL_WEBGIS_BAGUA.md); la interacción en
[entorno integrado](VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md).

El primer mapa/demo es legado independiente. El objetivo no incluye gestión
tributaria financiera. Rentas aún no tiene una entrega oficial acreditada: las
muestras administrativas se identifican y aíslan como sintéticas. La cartografía
Overture y las rutas documentales DWG conservan su procedencia.

Este documento define el producto esperado, no certifica su disponibilidad.
Consultar [avance verificado](docs/avance-verificado.md) para capacidades probadas,
límites y decisiones pendientes, y [criterios](CRITERIOS_ACEPTACION_CODEX.md) para aceptación.
