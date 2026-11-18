# Instrucciones para agentes — WEBGIS BAGUA

## Prioridades y límites

- Atender la tarea actual e inspeccionar el estado real antes de editar. Revisar
  `git status --short`, conservar cambios ajenos y reutilizar lo existente.
- BAGUA MASTER (`/bagua-master`) es el producto central: entorno geográfico
  integrado, búsqueda, inspector y acciones contextuales; sin sidebar permanente
  de módulos. El visor histórico (`/`) conserva su independencia y su historia;
  su DEMO no define el modelo ni se migra como padrón real.
- Preservar geometrías, identificadores, fuentes Overture, PMTiles propias y API
  local. OpenFreeMap solo puede orientar la estética de BAGUA MASTER; no sustituir
  la base con otro proveedor o estilo remoto. Rutas activas solo de DWG, nunca PDF.
- No inferir predios, personas, servicios prestados, horarios ni vigencia desde
  geometrías. No incorporar arbitrios ni funciones tributarias financieras.
- Proteger datos personales en API, búsqueda, exportaciones, caché y logs; nunca
  incluirlos en cartografía pública. No publicar secretos.
- Fixtures solo en destinos local/test explícitos, nunca producción; seguir
  [segregación](docs/segregacion-fixtures.md). No mezclar muestras con datos oficiales.
- No modificar migraciones aplicadas. No hacer push, despliegue productivo ni
  operaciones destructivas sin aprobación explícita.

## Consultar según la tarea

| Necesidad                                         | Fuente principal                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Identidad, usuarios y principios de producto      | [PRODUCT.md](PRODUCT.md)                                                   |
| Interfaz e interacción                            | [Entorno geográfico integrado](VISION_ENTORNO_GEOGRAFICO_INTEGRADO.md)     |
| Modelos, reglas de negocio, datos y restricciones | [Visión maestra de dominio](VISION_MAESTRA_PRODUCTO_FINAL_WEBGIS_BAGUA.md) |
| Aceptación de una funcionalidad                   | [Criterios](CRITERIOS_ACEPTACION_CODEX.md)                                 |
| Estado, evidencia y pendientes                    | [Avance único](docs/avance-verificado.md)                                  |
| Instalación y ejecución                           | [README.md](README.md)                                                     |

Leer las secciones pertinentes, sin cargar todos los documentos para una tarea
pequeña. Las decisiones expresas posteriores del usuario prevalecen; los archivos
de `docs/archive/` son historia, no instrucciones activas. La visión define
objetivos; el código y las pruebas acreditan implementación dentro de su alcance.

## Calidad y entrega

Las únicas skills de diseño del proyecto son las oficiales de Vercel, en
`.claude/skills/` (versiones fijadas en `skills-lock.json`):
[Web Design Guidelines](.claude/skills/web-design-guidelines/SKILL.md) para revisar
interfaz, accesibilidad y usabilidad, y
[React Best Practices](.claude/skills/vercel-react-best-practices/SKILL.md) para el
código React. Cargar solo lo necesario; infraestructura y documentación no requieren
procedimientos de diseño. La cartografía de BAGUA MASTER sigue las reglas de arriba.

Definir la tarea municipal que facilita cada interacción y preferir la solución
más simple que conserve capacidad y descubribilidad. Verificar el recorrido
afectado desde el frontend real, permisos en backend y persistencia si corresponde.
En cambios visuales comparar antes/después en escritorio y móvil; al tocar el
estilo comprobar fuentes Overture. Ejecutar comprobaciones acordes al cambio;
para documentación bastan coherencia, enlaces y `git diff --check`.

Registrar evidencia y pendientes en el avance único. Distinguir probado,
implementado sin verificar, propuesto y pendiente institucional. Una prueba
técnica no acredita usabilidad con usuarios ni aceptación municipal. No continuar
planes archivados ni implementar funciones fuera de la tarea actual.
