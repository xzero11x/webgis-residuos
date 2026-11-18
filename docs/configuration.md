# Configuración

BAGUA MASTER utiliza recursos Overture locales; `VITE_MAP_STYLE_URL` configura
exclusivamente el visor histórico. Para escribir registros de prueba se exige
`BAGUA_DEPLOYMENT=local|test` y `BAGUA_FIXTURE_DATABASE` coincidente con la BD
realmente conectada. Ver [segregación](segregacion-fixtures.md).

## Archivos de entorno

`npm run setup:env` crea `.env`, `frontend/.env` y `backend/.env` a partir de sus
ejemplos. Genera una contraseña aleatoria inicial y no sobrescribe archivos.
Si modificas credenciales después, sincroniza raíz/backend manualmente y actualiza
la contraseña del servidor PostgreSQL si el volumen ya existía.

| Variable                                                 | Dónde                  | Uso                                                        |
| -------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`      | `.env` raíz            | Credenciales para Compose                                  |
| `HTTP_PORT`                                              | `.env` raíz            | Puerto local de Nginx, 8080 por defecto                    |
| `HTTP_BIND_ADDRESS`                                      | `.env` raíz, opcional  | Dirección publicada; loopback por defecto                  |
| `VITE_MAP_STYLE_URL`                                     | `.env` raíz o frontend | Estilo HTTP(S) de MapLibre; OpenFreeMap por defecto        |
| `VITE_API_BASE_URL`                                      | frontend               | Ruta del mismo origen, por defecto `/api`                  |
| `API_PROXY_TARGET`                                       | frontend               | Destino del proxy Vite, no se expone al navegador          |
| `HOST`, `PORT`                                           | backend                | Escucha de Express; 127.0.0.1:3000 en desarrollo           |
| `NODE_ENV`, `LOG_LEVEL`                                  | backend                | Modo de ejecución y nivel de Pino                          |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | backend                | Conexión pg                                                |
| `PGPOOL_MAX`                                             | backend                | Conexiones máximas, 10 por defecto                         |
| `PG_DEV_PORT`                                            | Compose dev, opcional  | Puerto local PostgreSQL; actualizar también `backend/.env` |

Docker inyecta la configuración del backend y no copia archivos `.env` a las
imágenes. Vite expone únicamente variables con prefijo `VITE_`; esas variables
son públicas y se resuelven en el build. La URL de estilo puede contener una clave
pública del proveedor, con las restricciones de origen que este permita.

## Comandos

| Comando                       | Resultado                                            |
| ----------------------------- | ---------------------------------------------------- |
| `npm run dev`                 | Frontend y backend con recarga automática            |
| `npm run build`               | Frontend estático + backend compilado                |
| `npm start`                   | Backend compilado; requiere variables y build previo |
| `npm run preview -w frontend` | Vista previa local del frontend compilado con proxy  |
| `npm run infra:up`            | Construye y espera los servicios Docker              |
| `npm run infra:down`          | Detiene el proyecto y conserva sus datos             |
| `npm run db:dev`              | PostgreSQL accesible desde el backend del host       |
| `npm run db:check`            | Consulta directamente la versión completa de PostGIS |
| `npm run check`               | TypeScript, lint, formato, pruebas y builds          |
| `npm run test:e2e`            | Playwright en tres tamaños de pantalla               |

## Fallos habituales

- **Docker no conecta con `dockerDesktopLinuxEngine`:** verifica que Docker
  Desktop esté iniciado y luego ejecuta `docker info` y `docker run --rm hello-world`.
- **Puerto ocupado:** cambia `HTTP_PORT` para Docker. Vite usa puerto estricto
  5173; Playwright falla si sus puertos están ocupados para evitar probar otra app.
- **API conectada / base desconectada:** comprueba `docker compose ps`,
  `docker compose logs --tail=60 database` y credenciales. `health` no valida la BD;
  la comprobación completa es `ready`.
- **BAGUA MASTER vacío:** comprobar `data/bagua-master`, el montaje de solo lectura y
  las solicitudes a `/api/bagua-master`; conserva el paquete Overture. La URL del
  proveedor remoto solo corresponde al visor histórico.
- **Cambios de estilo no aparecen en Docker:** reconstruye el servicio frontend.
- **Fallo de PostGIS en un volumen antiguo:** los scripts de init no se repiten;
  comprueba la extensión con `npm run db:check`. No borres el volumen para ocultar
  un problema de migración.

## Instalación y operación del producto

Requisitos: Docker Compose v2, Node 24/npm 11 para las herramientas del host y el
paquete propio `data/bagua-master` recibido por el canal autorizado. El repositorio
no contiene PMTiles/glifos ni contraseñas. No basta restaurar PostgreSQL para
recuperar esos recursos. Conservar el paquete íntegro y su procedencia; no generar
una base alternativa ni recuperar el DEMO histórico para completar la instalación.

Desde la raíz: `npm ci`, `npm run setup:env`, revisar los ejemplos y ejecutar
`docker compose up -d --build --wait`. PostGIS se inicializa en el volumen nuevo y
el backend aplica migraciones con checksum antes de escuchar. No borrar el volumen
si una migración falla. Abrir `/bagua-master` en el puerto configurado y comprobar
`/api/ready` y `docker compose ps`. El resultado esperado de `ready` es HTTP 200;
`health` por sí solo no acredita conectividad PostgreSQL.

La instalación institucional mantiene `BAGUA_DEPLOYMENT=production` y
`BAGUA_FIXTURE_DATABASE` vacío. Esto **bloquea las escrituras administrativas aún
sintéticas**. La preparación de infraestructura no habilita datos reales ni elimina
la necesidad de autorización de Rentas. Para ensayo técnico usar una base separada
con `BAGUA_DEPLOYMENT=local|test` y nombre de destino explícito coincidente.

### Administrador inicial y recuperación de acceso

En una instalación **sin ninguna cuenta**, el operador de infraestructura puede
ejecutar en PowerShell:

```powershell
.\scripts\bootstrap-admin.ps1 -BaseConfirmada bagua_webgis -Usuario admin_inicial -Nombre 'Responsable designado'
```

Se solicita la contraseña mediante entrada oculta, se envía por stdin al contenedor
y solo se almacena su hash. No se escribe en archivos ni en argumentos, variables
de entorno o respuestas. El CLI confirma la base realmente conectada y crea la
cuenta/auditoría en una transacción. Rechaza cualquier base que ya contenga cuentas:
no sirve para reemplazar administradores, resetear claves o eludir permisos.
Este comando excepcional no crea fixtures ni habilita mutaciones reales.

En otros hosts se puede enviar JSON por stdin a
`docker compose exec -T backend node backend/dist/db/bootstrap-admin.js`; campos
`baseConfirmada`, `usuario`, `nombre`, `password` (mínimo 16 caracteres). Utilizar
entrada protegida del gestor de secretos, nunca un literal guardado en el historial.

Después de la instalación, la recuperación normal se inicia por otra cuenta
administradora en Herramientas → Cuentas → Editar → Restablecer. Exige contraseña
del administrador, motivo y versión; revoca las sesiones de la cuenta destino y
no devuelve ni registra la nueva contraseña. La propia clave se cambia con
Cambiar mi contraseña. La recuperación sin ningún administrador disponible requiere
un procedimiento institucional autorizado; el bootstrap no sobrescribe cuentas.

### Inicio, detención, actualización y diagnóstico

- Inicio normal: `docker compose up -d --wait`.
- Detención conservando contenedores y volumen: `docker compose stop`.
- Reinicio: `docker compose restart backend frontend nginx`; después comprobar
  `/api/ready` y `docker compose ps`.
- Diagnóstico: `docker compose logs --tail=60 backend` y estado de `database`.
  Los logs de aplicación omiten cuerpos, consultas y cabeceras; no adjuntar `.env`,
  cookies, respaldos ni capturas personales a tickets públicos.
- Actualización local autorizada: hacer respaldo, conservar código/configuración
  anterior y paquete GIS; instalar la revisión aprobada, `npm ci` y
  `docker compose up -d --build --wait`. Verificar login, búsqueda, ficha y un
  recorrido operativo de prueba. Si una migración falla, conservar evidencia y
  corregir mediante una migración nueva. Volver a una imagen antigua no revierte
  automáticamente el esquema; no improvisar un downgrade de base.

### Respaldo y restauración sin reemplazar la base

```powershell
node scripts/operational-backup.mjs backup
node scripts/operational-backup.mjs restore artifacts/operacion/ID/postgis.dump
```

El primer comando usa las credenciales internas del contenedor, produce una copia
custom de PostgreSQL y un manifiesto SHA-256 bajo `artifacts/operacion` (ignorado
por Git). No muestra credenciales. Si falla, la copia parcial no tiene manifiesto
válido. Conservar ambos archivos juntos en almacenamiento de acceso restringido y
cifrado, junto con el paquete GIS y la configuración privada. Los respaldos pueden
contener datos personales y hashes de acceso; SHA-256 verifica integridad, no cifra.
En Windows, restringir los permisos NTFS de la carpeta al personal designado; el
modo de archivo Unix no sustituye esas ACL. No publicar la carpeta por HTTP.

La restauración valida el manifiesto antes de escribir y genera exclusivamente una
base nueva `bagua_restore_FECHA_ID`; `createdb` rechaza cualquier colisión. Utiliza
una transacción completa, conserva la copia y nunca ejecuta DROP ni cambia la
conexión de la aplicación. No utiliza `--clean`. Verificar esa base recuperada,
las migraciones, el paquete GIS y los permisos antes de solicitar autorización para
una eventual conmutación. Mantener detenidas las escrituras durante la validación
de un corte cuando se comparen conteos; una copia corresponde a su snapshot, no a
escrituras posteriores. Las sesiones incluidas en el corte deben invalidarse por
el procedimiento autorizado antes de exponer una instancia recuperada.

El ensayo automatizado local existente `scripts/verify-recovery.py` sigue reservado
a QA con destino fixture explícito. No ejecutarlo como limpieza ni como herramienta
de reemplazo productivo. No se ha desplegado ni validado esta transferencia con la
Municipalidad; TLS, dominio, custodia de secretos, responsables, retención de copias,
capacitación y aprobación de operación son decisiones institucionales pendientes.

Verificación local del 17/11/2026: `artifacts/operational-clean-install.log` acredita
27 migraciones en una base QA nueva, bootstrap con configuración de producción
(sin habilitar fixtures), rechazo del segundo bootstrap, login y persistencia tras
recrear la API. El seed se verificó dos veces solo después, cambiando exclusivamente
esa base QA a destino test explícito. No se alteraron cuentas de la base principal.
`artifacts/operational-backup-test.log` acredita una copia real con manifiesto
SHA-256; la recuperación completa ya ensayada consta en el avance único. La nueva
herramienta genérica no se ha sometido todavía a una restauración adicional: sus
controles de destino y rechazo de copia corrupta tienen pruebas focalizadas.

Verificación adicional del nuevo restaurador: `artifacts/cierre-restore.log` acredita
restauración real en una base nueva, sin cambiar la conexión principal. Esa copia
fue migrada posteriormente con 026/028; no se ejecutó DROP ni reemplazo de datos.
El límite anterior sobre el restaurador genérico queda superado por esa evidencia.

### Ensayo de transferencia completo en aislamiento

`artifacts/cierre-transferencia.log` acredita el ensayo adicional del 17/11/2026:
un proyecto Docker nuevo con imágenes construidas, volumen PostgreSQL separado,
restauración real y migración a 27 archivos, login y padrón autorizados y frontend
con paquete GIS local de solo lectura. Se aprobaron 22 comprobaciones E2E de esa
instancia (15 BAGUA MASTER y siete de preservación histórica). Solo se detuvo el
proyecto QA; el entorno principal sigue saludable. El volumen QA se conserva.

El harness `scripts/verify-transfer.py` reproduce ese ensayo usando las imágenes,
respaldo y credenciales de prueba privados ya preparados bajo artifacts/. Es una
verificación local de entrega, no el instalador institucional ni una herramienta
para modificar producción. La instalación institucional sigue los pasos iniciales
de este documento, con su paquete cartográfico y configuración autorizados. El
estado de aceptación y las limitaciones se registran solo en avance-verificado.md.
