# Gestión territorial y operativa de BAGUA MASTER

> Registro de incrementos con cortes históricos. Para el estado actual consultar
> el [avance único](avance-verificado.md); los límites y conteos de cada corte no
> acreditan que sigan pendientes o hayan sido reprobados hoy. La interacción objetivo
> se define en [entorno integrado](../VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md).

La continuación vigente incorpora conciliación selectiva de importaciones, archivo
reversible y unidades administrativas. Ver el último corte de
[avance-verificado.md](avance-verificado.md) para alcance probado y límites.
Los conflictos ya pueden resolverse por campo sin sobrescritura automática; una
revisión obsoleta requiere revalidar. Archivar/restaurar exige administración y motivo.
Unidades se consultan desde la ficha y no derivan geometría ni identidad de Overture.

## Actualización de misión del 16/11/2026

El [tablero único](avance-verificado.md) registra aceptación, evidencia y pendientes.
Desde **Herramientas**, administración abre importaciones, catálogos y cuentas;
todos los perfiles pueden cambiar su propia contraseña. La operación es real
contra API/PostgreSQL y el contenido administrativo sigue siendo de prueba.

- Importaciones: elegir CSV UTF-8 (coma, punto y coma o tabulación), cargar archivo,
  asignar columnas, confirmar contenido sintético, validar y revisar resultados.
  Hasta 500 filas y 700 KB; código y dirección obligatorios. No se infieren
  geometrías. Se conserva hash del archivo, nombre y mapeo (018). Los conflictos
  bloquean aplicar; corregir y revalidar. JSON sigue disponible.
- Reportes: periodo, texto exacto de sector/material y servicio. Registro y
  administración descargan el mismo agregado en CSV; consulta recibe 403 al
  exportar. Sin identidades ni coberturas inferidas; fórmulas neutralizadas.
- Personas: búsqueda autorizada desde mapa y vínculos N:M con tipo, periodo y
  evidencia, enlazados al predio. Consulta no recibe esos datos por API.
- Catálogos: alta de servicio/material sugerido, estado y auditoría (019), sin
  borrar relaciones ni renombrar historia. Servicios inactivos bloquean nuevas
  asignaciones/participaciones en servidor. Material descrito libre sigue permitido.
- Cuentas: alta por interfaz, nombre, perfil provisional, estado y versión (020).
  Cambiar otra cuenta revoca sus sesiones; no permite auto-retirar el acceso admin.
  Cambiar contraseña propia cierra todas las sesiones y exige ingresar nuevamente.

Recuperación QA: `python scripts/verify-recovery.py` crea una copia y compara
conteos/huellas GIS. Instalación vacía: `python scripts/verify-clean-test.py` crea
otra BD QA, aplica 20 migraciones, repite seed y verifica auth/persistencia API
tras recrear servidor. Ambos verifican destino local/test, conservan copias y no
ejecutan DROP. Resultados y respaldos privados en artifacts; no imprimen contraseñas.

## Alcance del incremento del 15/11/2026

Entrada actual: BAGUA MASTER → espacios **Expedientes**, **Servicios**, **Resultados** y
**Administración** (menú de la cuenta). `/bagua-master/gestion` conserva enlaces antiguos y
se redirige al espacio equivalente.
El producto administrativo nuevo vive en el esquema `gestion` y API
`/api/gestion`. No usa las tablas, registros ni contratos del DEMO del primer
mapa. BAGUA MASTER continúa usando Overture y sus PMTiles originales.

Se dispone de:

- Sesiones de ocho horas almacenadas en PostgreSQL con tokens aleatorios
  guardados como huellas y cookie HttpOnly/SameSite Strict. Contraseñas con sal
  aleatoria y scrypt; limitación de intentos por dirección de conexión.
- Perfiles técnicos provisionales: administración, registro y consulta. Consulta
  no puede escribir ni acceder a personas o historial de vínculos. No representan
  una política municipal aprobada.
- Padrón buscable y paginado, filtro de localización, creación y edición con
  control de versión. Geometría opcional: una ficha sin coordenadas permanece
  buscable y no genera marcadores.
- Referencia espacial puntual con estado y evidencia. Ficha → mapa → ficha,
  mediante un marcador separado; no hay asociación automática con un edificio.
- Personas compartidas por varios predios; vínculos tipificados con evidencia y
  fechas. Crear persona y vínculo desde la ficha es una única transacción.
- Asignaciones de servicio separadas de participación y entregas. Periodos y
  evidencia explícitos; cierre conserva las relaciones y su historial.
- Eventos de entrega con responsable, fecha, material, cantidad/unidad opcionales
  y clave de idempotencia. No se aceptan entregas futuras o fuera del periodo.
  La anulación requiere motivo y conserva el registro.
- Historial de altas, cambios, vínculos, cierres y anulaciones con responsable.
- Reportes por periodo sobre eventos no anulados, separados por servicio,
  material y unidad. Cantidad ausente permanece NULL, sin convertirla en cero.
- Importación JSON con staging validado, revisión explícita y aplicación atómica.
  Repetir un lote aplicado no duplica datos. Un conflicto no sobrescribe cambios
  locales y revierte las altas del lote completo.

## Datos disponibles y restricciones

Esta versión del dominio admite **solo fuentes sintéticas**, tanto en la API
como en las restricciones de base de datos. Los servicios iniciales son un
catálogo de ensayo identificado. Los registros no representan predios,
contribuyentes, modalidades o prestaciones oficiales. Nunca cargar datos
personales reales en este entorno con el contrato sintético.

Los datos reales no son un requisito para desarrollar y comprobar los flujos.
Su integración posterior requiere autorización, diccionario, claves y revisión
del formato, un origen separado y una migración explícita para habilitarlo.
No se garantiza compatibilidad automática con un formato todavía desconocido.

## Preparar y utilizar

Antes de preparar cuentas o muestras, designar una copia local/test con
`BAGUA_DEPLOYMENT=local` y `BAGUA_FIXTURE_DATABASE` igual al nombre de la base
de desarrollo. Ver [protección y configuración de fixtures](segregacion-fixtures.md).
Las plantillas y Compose bloquean estas escrituras por defecto. No habilitar
fixtures en una instancia institucional. El entorno local de este equipo quedó
designado explícitamente en sus archivos `.env` ignorados por Git.

```sh
npm run infra:up
npm run gestion:usuario
npm run gestion:usuario -- --usuario=registro-bagua --rol=registro
npm run gestion:usuario -- --usuario=consulta-bagua --rol=consulta
npm run gestion:seed
```

Los accesos se crean por consola; no hay inscripción pública. Cada contraseña
se genera aleatoriamente y se guarda en `artifacts/accesos-locales/<usuario>.txt`,
excluido de Git. Un usuario existente se conserva sin cambiar su clave ni rol.
`admin-bagua` es el acceso predeterminado del primer comando.

La muestra contiene ocho predios ficticios **sin ubicación** y dos personas
sintéticas, conservando registros existentes. El seed es explícito y repetible;
no se ejecuta automáticamente al arrancar.

Para desarrollo nativo con Node 24 y la base accesible localmente:

```sh
npm run build -w backend
node backend/dist/db/manage.js migrate
npm run gestion:usuario -- --local
node backend/dist/db/gestion-seed.js
npm run dev
```

## Contrato de importación de prueba, versión 1

```json
{
  "version": 1,
  "sintetico": true,
  "predios": [
    {
      "codigo": "SYN-IMPORT-001",
      "direccion": "Dirección sintética de ensayo",
      "sector": "Sector de prueba",
      "ubicacion": null,
      "estadoUbicacion": "pendiente"
    }
  ]
}
```

POST `/api/gestion/importaciones/validar` guarda un lote válido y devuelve su ID
y huella; errores indican la fila sin modificar el padrón. POST
`/api/gestion/importaciones/<id>/aplicar` lo aplica. Ambas requieren perfil de
administración, sesión y cabecera `X-Bagua-Request: 1`; todas las escrituras de
gestión requieren JSON y esa cabecera. Los campos desconocidos se rechazan.

La clave de origen actual es `(fuente_id, codigo)`. La API normaliza códigos de
predios a mayúsculas. Código repetido con distinto contenido exige conciliación.
El contrato actual importa predios; las personas y relaciones se registran por
sus endpoints. Su adaptación masiva a Rentas deberá definirse con el diccionario
recibido. Consultar Swagger para esquemas de solicitudes y permisos.

## Verificación

Resultado del 15/11/2026: `npm run check` completo aprobado (tipos, lint,
formato, 60 pruebas unitarias y compilación). Contra Docker: seis recorridos
de gestión aprobados; seis repeticiones de casos de escritorio se omiten en
tableta/móvil. El recorrido de registro sí se ejecutó en los tres tamaños.
Ocho comprobaciones adicionales de BAGUA MASTER y del visor histórico aprobadas.
Los cuatro servicios quedaron saludables. Se verificaron 14.357 edificios
Overture y siete rutas activas DWG, sin otras fuentes de geometría de rutas.

```sh
npm run check
```

En PowerShell, con los tres accesos anteriores preparados:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:8080'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npx playwright test tests/e2e/gestion.spec.ts --workers=1
```

Las pruebas conservan registros sintéticos identificados con códigos `E2E-*`
para revisar historial. No modifican fuentes Overture ni datos del primer visor.
Capturas en `artifacts/screenshots/gestion-*.png`. El respaldo previo al incremento
y el parche de cambios preexistentes están en `artifacts/baseline-2026-11-15/`.

## Pendientes para siguientes incrementos

La búsqueda de predios y el inspector contextual ya están conectados al mapa.
Ver [mapa de trabajo](experiencia-mapa-trabajo.md) para el recorrido, los estados
de ubicación, los permisos y sus comprobaciones.

- Recuperación de contraseñas, ámbitos institucionales y auditoría global UI;
  cuentas y cambio de contraseña propios ya tienen interfaz y permiso backend.
- Adaptadores de fuentes reales, conciliación de cambios e importaciones masivas
  de personas/vínculos, tras recibir datos y autorización.
- Validación institucional de catálogos/permisos y evolución versionada;
  servicios y materiales sugeridos ya son configurables como datos de ensayo.
- Unidades/secciones prediales, revisión cartográfica asistida y geometrías
  administrativas adicionales al punto de referencia.
- Versiones operativas de rutas y programación con validación institucional.
  Las rutas documentales DWG existentes conservan su carácter documental.
- Exportaciones adicionales, manual operativo con usuarios y aceptación de la
  Gerencia. No se declara terminado ni aprobado institucionalmente el producto.

## Revisión espacial y relaciones de unidades

Migraciones 024–025 separan vínculos espaciales y relaciones específicas de unidad.
Desde la ficha del predio, «Revisar vínculos espaciales» permite proponer edificios
Overture seleccionados directamente o mediante intersección con el área visible.
El criterio solo genera candidatos: administración confirma/rechaza/reabre/desvincula
con motivo y versión; registro propone. Los conflictos compartidos requieren decisión
explícita. No se modifica geometría Overture ni se crea un punto administrativo.
La ficha normal puede centrar las geometrías confirmadas; las rutas DWG no cambian.

En Unidades se consultan personas/roles y servicios/estados propios, con periodos,
evidencia y cierre trazable. No se copian vínculos del predio. Los intervalos inclusivos
solapados del mismo destino/rol se rechazan en PostgreSQL. Unidades inactivas y predios
archivados no admiten nuevas relaciones; restaurar no elimina historia. Consulta no
recibe identidades personales. Las fichas persona/unidad permiten navegación inversa.
La búsqueda del mapa incluye unidades activas sin información personal.

Herramientas → Auditoría de operaciones ofrece a administración metadatos paginados
por cursor y filtros por acción/predio. Los snapshots anteriores/nuevos no se exportan
por ese endpoint. Los perfiles siguen siendo configuraciones de ensayo, pendientes
de designación institucional.

La evidencia y los pendientes vigentes se mantienen en `avance-verificado.md`;
las listas históricas anteriores no acreditan carencias ni funciones actuales.

## Consulta operativa y recuperación de acceso

Herramientas → Servicios y operación permite revisar registros de cada servicio,
separando asignaciones a predios/unidades, participaciones y entregas. Página de
25 registros con navegación y retorno a la ficha correspondiente, conservando el
mapa. Un evento sin cantidad permanece sin medición; no se interpreta como cero.

Para recuperar una cuenta de ensayo, administración abre Cuentas → Editar cuenta →
Restablecer contraseña. Requiere su propia contraseña actual, un motivo y una nueva
contraseña de al menos 16 caracteres para otra cuenta activa. Al guardar, las sesiones
de esa cuenta dejan de ser válidas. Entregar la contraseña al titular por el canal
institucional que se defina; nunca incluirla en Git, capturas, auditoría ni tickets.
No hay recuperación pública por correo ni autorización institucional inferida.

## Reversión controlada de importaciones

En Herramientas → Importaciones → Consultar lotes y revertir cambios se consulta el
historial paginado, las operaciones exactas del lote y sus reversiones. Desde la
migración 026 cada alta/actualización aplicada guarda un manifest transaccional de
valores anteriores/posteriores, campos y versión. Los lotes antiguos sin manifest
no se revierten automáticamente: no se reconstruye su procedencia por suposición.
Un lote aplicado sin cambios tampoco crea operaciones reversibles ficticias.

Seleccionar campos, previsualizar efectos y registrar motivo antes de aplicar. Una
reversión parcial restaura solo los campos elegidos; nuevas altas se archivan, nunca
se borran. Relaciones posteriores o cualquier edición posterior del registro bloquean
la reversión automática, incluso si se pretende cambiar otro campo: política
conservadora para proteger trabajo legítimo. Las versiones vuelven a comprobarse
bajo bloqueo; todo el conjunto seleccionado se revierte o ninguno. Reintentar con la
misma clave y solicitud devuelve el resultado previo sin modificarlo; cambiar la
solicitud con esa clave se rechaza. Las reversiones autorizadas actualizan el manifest
para permitir deshacer posteriormente los demás campos aún seguros del mismo lote.

## Corrección de entregas existentes

Ficha del predio → Entregas → Corregir entrega conserva la misma identidad del evento.
Se permite corregir fecha, material, medición/unidad y observaciones, con motivo y
versión vigente. No cambia participación, predio, responsable original ni clave de
idempotencia; tampoco convierte un vínculo de unidad/persona en otro por inferencia.
La medición nullable sigue siendo distinta de cero. Se rechazan fechas futuras o
fuera de la participación y cantidades/unidades inconsistentes. Las revisiones
conservan snapshots y responsable; reportes/exportaciones leen el valor vigente.

No se corrigen entregas anuladas ni predios archivados. La restauración conserva
revisiones. La anulación lógica registra una nueva versión sin borrar evidencia.
La UI siempre envía versión; por compatibilidad, solicitudes antiguas sin versión
solo se aceptan en una entrega todavía intacta (versión 1). Una entrega ya corregida
exige versión explícita para anular, evitando que una solicitud antigua la invalide.

## Abrir y utilizar el producto local

Abrir **http://localhost:8080/bagua-master**. Pulsar **Ingresar** en la cabecera.
En este entorno, la cuenta de ensayo es `admin-bagua`; obtener su contraseña del
archivo privado local `artifacts/accesos-locales/admin-bagua.txt`. No copiarla a
reportes/capturas/Git. Los perfiles registro/consulta tienen sus propios accesos.

Tras entrar, elegir **SYN-BAGUA-MULTI** en el inicio o escribir ese código en la
búsqueda superior y pulsar el resultado de Predios administrativos. La ficha ofrece
Personas, Unidades, Servicios y Actividad. **Abrir ficha administrativa** amplía
edición, historial y operaciones; **Registrar entrega** abre el registro desde el
predio. Seleccionar una participación, completar material/medición si existe y guardar.
En **Herramientas → Reportes**, filtrar por el material/periodo para ver el evento.

Buscar `SYN-BAGUA-PER-ALBA` permite abrir una persona ficticia y entrar a sus unidades.
`SYN-BAGUA-REVISION` permite revisar candidatos mediante **Revisar vínculos espaciales**;
ninguna coincidencia se confirma por sí sola. `SYN-BAGUA-VIVIENDA` tiene un vínculo
confirmado de ensayo cuya geometría se puede centrar desde su ficha. El archivado se
consulta en **Registros → Estado del padrón → Archivados**. Son ejemplos, no registros oficiales.

En **Herramientas** aparecen servicios/operación, importaciones, catálogos, cuentas y
auditoría según permisos. El perfil consulta no ve acciones administrativas ni recibe
identidades personales. **Volver al mapa** cierra la ampliación conservando la instancia
cartográfica. Las capturas reales del recorrido están en el avance único y en la galería
local `artifacts/producto-recorridos.html`.
