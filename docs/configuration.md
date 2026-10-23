# Configuración

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
- **Mapa base vacío:** revisa acceso a Internet y la URL del proveedor configurado.
- **Cambios de estilo no aparecen en Docker:** reconstruye el servicio frontend.
- **Fallo de PostGIS en un volumen antiguo:** los scripts de init no se repiten;
  comprueba la extensión con `npm run db:check`. No borres el volumen para ocultar
  un problema de migración.
