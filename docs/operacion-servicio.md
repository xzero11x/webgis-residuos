# Operación del servicio de residuos

Producto: el sistema con el que la Gerencia de Gestión Ambiental demuestra, con evidencia y sin
trabajo extra, qué servicio de residuos presta, a quién, cuándo y con qué resultado. El mapa es una
herramienta dentro de ese sistema.

Mientras la Gerencia no entregue información oficial, el producto funciona con una **simulación
realista**, por indicación expresa del gerente. Todo lo simulado está bajo la fuente sintética
`SINTETICO-LOCAL-V1`, lleva el distintivo «Demostración · datos sintéticos» y se reemplaza sin
tocar nada más.

## El ciclo que cubre

| Paso           | Qué hace la aplicación                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Planificar     | Programación de rutas (días, horario, vehículo), puntos de control con hora del plano, padrón con QR              |
| Ejecutar       | El chofer marca salida, paso por los puntos y llegada; el promotor registra la visita; la oficina, el ticket      |
| Verificar      | Tablero diario con alertas, cumplimiento por ruta, hora real frente a la programada, toneladas pesadas            |
| Rendir cuentas | Cierre del mes, reporte para SIGERSOL, padrón MINAM (anexos 03-A a 03-D), resumen para el concejo, hora al vecino |
| Ajustar        | Cambio de programación con motivo y aviso al vecino, al chofer y al promotor                                      |

## Qué es real y qué es simulado

| Dato                                                                              | Origen                                                                                                                  |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Edificios, calles y sus nombres, parques, plazas                                  | Overture/OSM, ya alineados (ver [coherencia interna](coherencia-interna.md))                                            |
| Trazos de las 7 rutas                                                             | DWG municipales, ajustados a las calles                                                                                 |
| **406 tiempos de paso** («07:42», «14:05»…)                                       | **Reales**: plano «RUTAS CON TIEMPO.dwg», asociados a su ruta y llevados sobre el trazo (`bagua_master.ruta_hora_paso`) |
| Sectores (César Vallejo, Inca Kola, La Primavera…)                                | **Reales**: rótulos de los planos municipales                                                                           |
| Ventana horaria de las rutas convencionales y hora de los puntos de control       | Derivadas de los tiempos de paso reales                                                                                 |
| Días de recolección, rutas selectivas y comercial, vehículos y sus taras          | Simulados                                                                                                               |
| 1.129 predios, 1.370 personas (DNI ficticios 9xxxxxxx, RUC 20999…)                | Simulados, cada predio sobre una edificación real con dirección de su calle real                                        |
| Padrón de orgánicos (380) y reciclables (520), domiciliarios y no domiciliarios   | Simulado, con los campos de los anexos 03-A a 03-D del MINAM                                                            |
| ~26 000 visitas (may–nov 2026) y ~27 000 entregas (~50 t)                         | Simulados con perfiles de participación, feriados, días sin servicio, julio más bajo y pesaje incompleto al inicio      |
| Recorridos del chofer desde el piloto (septiembre en dos rutas, octubre en todas) | Simulados: atrasos realistas (lunes, lluvia, vehículos antiguos), averías, puntos sin marcar y envíos tardíos sin señal |
| Tickets de balanza del relleno desde mayo                                         | Simulados, de 2,6 a 6,4 t por ruta y viaje; antes del piloto sin ejecución asociada                                     |
| Avisos (feriados, mantenimiento, campaña) y un cambio de vehículo                 | Simulados                                                                                                               |
| Valorización mensual: asociación de recicladores, EO-RS, planta de compostaje     | Simulada, coherente con las entregas, con comprobantes                                                                  |
| Asociación de recicladores: RUC, registro municipal y 15 socios                   | Simulados                                                                                                               |
| Contenedores, puntos limpios, centro de acopio, planta y relleno sanitario        | Simulados en su posición (el relleno de Bagua existe y tiene balanza; su ubicación aquí es aproximada)                  |

## Modelo de datos

- **034** `ruta_programacion`, `infraestructura`, `gestion.actor`, `gestion.valorizacion`, campos del
  padrón en `gestion.participacion` y `gestion.visita` (entregó / no entregó / ausente).
- **035** `ruta_hora_paso`: tiempos de paso documentados en el plano.
- **036** `recoleccion_en_punto(punto)`: qué servicios pasan por un punto y a qué hora aproximada.
- **037** `gestion.codigo_qr` y `gestion.visita.origen` (`lista`, `qr` o `codigo`).
- **038** `gestion.vehiculo` (tara), `bagua_master.ruta_punto_control` (orden y hora programada),
  `gestion.ruta_ejecucion` (una vigente por programación y día), `gestion.ruta_evento` (salida, paso,
  llegada; hora del celular y del servidor, posición y clave única para enviar sin señal),
  `gestion.pesaje` (bruto, tara y neto por ticket) y `atraso_habitual(programación, punto)`.
- **039** `bagua_master.aviso_servicio` (suspensión, cambio de horario, informativo) y
  `ruta_programacion_cambio` (antes, después, motivo, fecha desde la que rige).
- **040** `gestion.periodo_cierre`: foto de las cifras del mes; un mes cerrado no admite registros
  ni correcciones (visitas, rutas, tickets, comprobantes) hasta que se reabra con motivo.
- **041** `gestion.importacion_padron` (lotes con huella y reversión), consentimiento en
  `participacion` (Ley 29733), formalización en `actor` y `gestion.reciclador` (Ley 29419).
- **042** nombres de ruta sin avisos de duda.

## Dónde se ve en la aplicación

- **Operación** (`/bagua-master/operacion`): tablero del día (rutas en ruta, terminadas, con
  problema; alertas de salida, atraso, interrupción, ruta que no salió y ticket pendiente; mapa con
  cada ruta por estado y la última posición del vehículo; últimos 7 días), cumplimiento por ruta con
  el recorrido punto por punto, pesaje (llegadas sin ticket, registro con tara del vehículo y
  anulación), avisos y programación con historial.
- **Ruta del vehículo** (`/bagua-master/campo/ruta`, celular): Salí, Pasé por aquí (siguiente punto
  y hora programada), Llegué al relleno o a la planta, Reportar un problema. Funciona sin señal.
- **Campo** (`/bagua-master/campo`): recorrido del día, visita en uno o dos toques, sticker QR,
  «Inscribir vecino» (mapa, representante, programa, consentimiento, código y sticker al instante).
  El recorrido y las visitas funcionan sin señal.
- **Mapa, expediente y sticker QR**: «Recolección aquí» con la hora habitual (la real, si hay al
  menos tres recorridos) y los avisos vigentes o próximos.
- **Resultados**: programas selectivos y **Cierre del mes y reportes** (pendientes antes de cerrar,
  cifras, cierre y reapertura, reporte SIGERSOL por mes o año, resumen para el concejo).
- **Servicios**: recicladores y valorización (vigencia del registro, socios con carnet,
  capacitación, vacunas y EPP, comprobantes).
- **Administración › Cargar padrón**: Excel o CSV de la Gerencia, validación fila por fila,
  corrección en la tabla, confirmación y reversión.
- **Ayuda** (`/bagua-master/ayuda`): manual corto por rol y preguntas frecuentes.

## Hora habitual de paso

`atraso_habitual` toma el punto de control más cercano (≤ 800 m) de la programación y la mediana,
en las últimas ocho semanas, de la diferencia entre la hora en que el chofer marcó ese punto y su
hora programada. La hora habitual es la estimada más ese atraso, redondeada a 5 minutos. Con menos
de tres recorridos se muestra la estimada.

## Sin señal

`frontend/src/lib/cola-envios.ts` guarda en el teléfono los registros que no pudieron enviarse y
los reintenta al volver la conexión y cada 30 s. Cada registro lleva su clave: el servidor no lo
duplica. Un rechazo (por ejemplo, una ruta ya registrada) se aparta y se muestra a la persona; una
sesión vencida (401) espera a que vuelva a ingresar. La ruta se puede identificar por la clave con
que el celular registró la salida, así los pasos no esperan la respuesta del servidor.

## Carga del padrón

El Excel se lee en el navegador (`frontend/src/lib/hoja-calculo.ts`, sin dependencias). Se detectan
la fila de títulos, el anexo y las columnas. El servidor reconoce lo que ya existe (código de
padrón, dirección normalizada —«JR. AMAZONAS N° 345» = «Jirón Amazonas 345»—, DNI), completa el cero
que Excel borra en los DNI, rechaza duplicados dentro del archivo y ubica cada dirección nueva entre
los predios conocidos de la misma calle (mismo lado si se puede). Lo que no se ubica queda para
ubicar en el mapa. Un lote se revierte mientras sus inscripciones no tengan visitas.
`scripts/bagua-master/ejemplo_padron.py` genera un Excel sintético con los problemas típicos.

## API

Públicos: `GET /api/bagua-master/servicio/programacion`, `servicio/consulta?lon&lat` (con hora
habitual y avisos), `servicio/avisos`, `infraestructura`, `qr/{codigo}`.

Con sesión (`/api/gestion`): `predios/{id}/operacion`, `campo`, `visitas`, `resultados/*`,
`padron.csv`, `valorizacion`, `actores`, `qr/*`; `ruta/dia`, `ruta/salida`,
`ruta/ejecuciones/{id|clave}/eventos|interrumpir|reanudar|anular`, `operacion/dia`,
`operacion/ejecuciones[/{id}]`, `operacion/cumplimiento`, `vehiculos`, `pesajes[/{id}/anular]`;
`avisos[/{id}/retirar]`, `programaciones[/{id}]`; `periodos[/{mes}]`, `periodos/{mes}/cerrar|reabrir`,
`periodos/{mes}/concejo`, `reportes/sigersol.csv?desde&hasta`; `padron/importar/validar|aplicar`,
`padron/importaciones[/{id}/revertir]`, `empadronamiento`; `recicladores/actores[/{id}]`,
`recicladores/actores/{id}/socios`, `recicladores/socios/{id}[/baja]`.

## Comandos

```sh
npm run bagua-master:simular-operacion   # solo destino local/test; reemplaza lo que ella misma generó
.venv-gis/Scripts/python scripts/bagua-master/ejemplo_padron.py   # Excel de ejemplo del padrón
```

«Hoy» es el día en que corre la simulación (se puede fijar con `SIM_HOY` y `SIM_AHORA`): las rutas
que ya debían terminar quedan terminadas y las del momento, en curso. La simulación no pisa una ruta
registrada de verdad (pruebas o uso real) el mismo día.

## Cuando llegue la información oficial

Se reemplaza por partes, sin cambiar la interfaz: la programación real de rutas y sus vehículos, el
padrón (con el importador), los actores y comprobantes, la infraestructura y la ubicación del
relleno. Los recorridos empiezan a registrarse desde el celular del chofer y los tickets desde la
oficina. Los tiempos de paso del plano y los sectores ya son reales.
