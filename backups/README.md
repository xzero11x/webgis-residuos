# Recuperar la copia local

El código fuente está en Git. Los archivos `bagua-respaldo-2026-10-22.7z.*` son
volúmenes cifrados con AES-256. La contraseña **no está en este repositorio**; se
entregó al propietario en la conversación de Codex del 22 de octubre de 2026.

```powershell
git clone https://github.com/xzero11x/webgis-residuos.git
cd webgis-residuos
git lfs pull
& 'C:\Program Files\7-Zip\7z.exe' x 'backups\bagua-respaldo-2026-10-22.7z.001' '-o.'
```

Introduzca la contraseña cuando 7-Zip la solicite. Todos los volúmenes deben
estar juntos. El archivo incluye `rutas/`, `data/`, `artifacts/`, `.env` y
`.claude/`. Los originales DWG y las extracciones se recuperan sin convertirlos
de nuevo. `node_modules`, `.venv-gis`, imágenes y volúmenes de Docker se
reinstalan o reconstruyen; consulte `README.md`.

La base PostGIS local puede contener cambios posteriores a los paquetes GIS.
Un respaldo de archivos no sustituye un volcado de esa base.
