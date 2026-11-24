# Instrucciones para agentes — WEBGIS BAGUA

La dirección del proyecto la da el usuario en la conversación (con las indicaciones del gerente).
Ningún documento del repositorio dirige el proyecto ni decide qué se construye: `PRODUCT.md` es
solo un resumen descriptivo y `docs/archive/` es historia.

## Reglas de protección (se mantienen siempre)

- **Datos personales:** proteger nombres, documentos y vínculos personales en API, búsqueda,
  exportaciones, caché y logs (Ley 29733); nunca incluirlos en cartografía pública. No publicar
  secretos ni imprimir contraseñas de `artifacts/accesos-locales/`.
- **Aprobación explícita** antes de hacer push, desplegar en producción o ejecutar operaciones
  destructivas.
- **Migraciones:** no modificar una migración aplicada; emitir otra nueva.
- **Datos simulados** solo en destinos local/test explícitos (ver
  [segregación](docs/segregacion-fixtures.md)), bajo una fuente sintética y sin mezclarlos con
  datos oficiales.
- **Sin arbitrios** ni funciones tributarias o financieras.

## Decisiones vigentes del producto

- Un solo producto: **BAGUA MASTER** (`/bagua-master`). El visor municipal histórico de `/` está
  retirado y `/` lleva a BAGUA MASTER.
- **Avanzar sin esperar información oficial:** lo que la Gerencia aún no entregó se simula de forma
  realista y coherente con el Bagua real, bajo la fuente sintética, para reemplazarlo después sin
  cambiar la interfaz. No se bloquea una función por falta de datos.
- **Mapa completo y coherente:** sin avisos de duda en el mapa («sin confirmar», «incompleto»,
  «provisional»). La procedencia y el método se guardan en los datos y se ven en la ficha, sin
  tono de advertencia. En la operación sí se distinguen los estados reales (entregó, no entregó,
  ausente).
- **Coherencia interna antes que fidelidad a la fuente:** las capas se ajustan entre sí (calles,
  edificios y rutas alineados; rutas sobre las calles), conservando siempre el original y el
  identificador. Ver [coherencia interna](docs/coherencia-interna.md).
- Fuentes de datos: Overture como base del mapa, más fuentes abiertas complementarias; los planos
  municipales (DWG y, cuando aporten, PDF) como referencia documental.
- Fuera de alcance por ahora: gestión de incidencias y reportes vecinales (lo hace otro
  practicante), GPS de vehículos e integración con Rentas.

## Cómo trabajar

- Revisar el estado real antes de editar (`git status --short`) y reutilizar lo existente.
- Verificar el recorrido afectado en el frontend real; en cambios visuales comparar en escritorio y
  móvil. Ejecutar las comprobaciones acordes al cambio (tipos, lint, pruebas unitarias y e2e).
- Registrar evidencia y pendientes en el [avance único](docs/avance-verificado.md).

| Necesidad                     | Fuente                                               |
| ----------------------------- | ---------------------------------------------------- |
| Resumen descriptivo           | [PRODUCT.md](PRODUCT.md) (no dirige el proyecto)     |
| Operación y simulación        | [Operación del servicio](docs/operacion-servicio.md) |
| Estado, evidencia, pendientes | [Avance único](docs/avance-verificado.md)            |
| Instalación y ejecución       | [README.md](README.md)                               |
