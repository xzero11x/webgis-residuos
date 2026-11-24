# Operación del servicio de residuos

Producto: un sistema sobre el mapa de Bagua donde la Gerencia ve cómo, cuándo y por dónde presta
cada servicio de recolección, quién participa en la recolección selectiva, y obtiene sin trabajo
extra los datos que debe reportar (padrón, toneladas valorizadas, participación).

Mientras la Gerencia no entregue información oficial, el producto funciona con una **simulación
realista**, por indicación expresa del gerente. Todo lo simulado está bajo la fuente sintética
`SINTETICO-LOCAL-V1`, lleva el distintivo «Demostración · datos sintéticos» y se reemplaza sin
tocar nada más.

## Qué es real y qué es simulado

| Dato                                                                            | Origen                                                                                                                  |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Edificios, calles y sus nombres, parques, plazas                                | Overture/OSM, ya alineados (ver [coherencia interna](coherencia-interna.md))                                            |
| Trazos de las 7 rutas                                                           | DWG municipales, ajustados a las calles                                                                                 |
| **406 tiempos de paso** («07:42», «14:05»…)                                     | **Reales**: plano «RUTAS CON TIEMPO.dwg», asociados a su ruta y llevados sobre el trazo (`bagua_master.ruta_hora_paso`) |
| Sectores (César Vallejo, Inca Kola, La Primavera…)                              | **Reales**: rótulos de los planos municipales                                                                           |
| Ventana horaria de las rutas convencionales                                     | Derivada de los tiempos de paso reales                                                                                  |
| Días de recolección, rutas selectivas y comercial, vehículos                    | Simulados                                                                                                               |
| 1.129 predios, 1.370 personas (DNI ficticios 9xxxxxxx, RUC 20999…)              | Simulados, cada predio sobre una edificación real con dirección de su calle real                                        |
| Padrón de orgánicos (380) y reciclables (520), domiciliarios y no domiciliarios | Simulado, con los campos de los anexos 03-A a 03-D del MINAM                                                            |
| ~25 000 visitas (may–nov 2026) y ~26 000 entregas (~48 t)                       | Simulados con perfiles de participación, feriados, días sin servicio, julio más bajo y pesaje incompleto al inicio      |
| Valorización mensual: asociación de recicladores, EO-RS, planta de compostaje   | Simulada, coherente con las entregas, con comprobantes                                                                  |
| 19 contenedores, 3 puntos limpios, centro de acopio, planta de compostaje       | Simulados, en cruces de calles con nombre                                                                               |

## Modelo de datos

- **034** `ruta_programacion` (servicio, días, horario, turno, sectores, vehículo, operador),
  `infraestructura`, `gestion.actor`, `gestion.valorizacion`, campos del padrón en
  `gestion.participacion` (tipo de generador, representante, habitantes, establecimiento, código de
  padrón, zona) y `gestion.visita` (entregó / no entregó / ausente; una sola visita vigente por
  participante y día). Las entregas cuelgan de su visita.
- **035** `ruta_hora_paso`: tiempos de paso documentados en el plano.
- **036** `recoleccion_en_punto(punto)`: qué servicios pasan por un punto y a qué hora aproximada
  (tiempo del plano más cercano dentro de la ventana de la ruta; si no hay, posición a lo largo del
  recorrido). Redondeada a 5 minutos.
- **037** `gestion.codigo_qr` (un sticker vigente por predio, historial de reemplazos con motivo,
  contador de escaneos) y `gestion.visita.origen` (`lista`, `qr` o `codigo`).

## Dónde se ve en la aplicación

- **Mapa:** al tocar un edificio, un lugar, una calle o un contenedor, la ficha muestra «Recolección
  aquí»: servicio, días, hora aproximada y próxima pasada. Capa de infraestructura con su ficha.
- **Rutas:** cada ruta muestra su programación (servicio, días, horario, vehículo, operador).
- **Expediente del predio:** horario de recolección en el predio y participación por programa
  (código de padrón, representante, tasa de entrega, kilos, última visita y las últimas 16 visitas).
- **Campo** (`/bagua-master/campo`, celular): recorrido del día ordenado por hora estimada; entregó
  (materiales y kilos opcionales), no entregó o ausente con uno o dos toques; corrección sin borrar.
- **Resultados:** participación por programa, kilos por mes, participación por sector, materiales,
  valorización por actor y descarga del padrón en formato MINAM. Cada cifra abre sus visitas.

## Stickers QR del predio

Cada predio inscrito lleva un sticker en la puerta. El QR solo contiene la dirección
`https://<servidor>/bagua-master/q/<CÓDIGO>`: ningún dato personal viaja en el sticker.

- **Código:** 8 caracteres Crockford base32 (sin I, L, O ni U), 7 aleatorios y 1 de control con
  pesos impares. Se imprime como `XXXX-XXXX`; al escribirlo a mano se aceptan minúsculas, guion, O
  por 0 e I/L por 1, y el dígito de control detecta cualquier carácter cambiado antes de consultar.
- **Vecino:** al escanear con la cámara del celular abre la página pública «¿Cuándo pasa el
  camión?» con sector, días y hora estimada de cada servicio. Si el sticker fue reemplazado, lo dice.
- **Promotor:** en Campo, «Escanear sticker QR» abre la cámara trasera (lector nativo del navegador
  y, si no existe, jsQR) o deja escribir el código. Aparece el predio con el programa del día
  destacado y la visita se registra en un toque; queda con origen `qr` o `codigo`. Con sesión, la
  página pública también ofrece «Registrar visita».
- **Generación:** el expediente genera el sticker si el predio no tiene; «Reemplazar» exige motivo,
  invalida el anterior y emite uno nuevo. La hoja `/bagua-master/campo/etiquetas` genera los que
  faltan por programa e imprime hojas A4 de 3 columnas filtradas por sector.
- **Resultados:** porcentaje de visitas registradas con el sticker (señal de que el promotor estuvo
  en la puerta).
- La cámara del celular solo se abre en HTTPS o `localhost`; en la red local sin HTTPS queda la
  entrada manual del código.

## API

Públicos: `GET /api/bagua-master/servicio/programacion`, `GET /api/bagua-master/servicio/consulta?lon&lat`,
`GET /api/bagua-master/infraestructura`, `GET /api/bagua-master/qr/{codigo}`. Con sesión: `GET /api/gestion/predios/{id}/operacion`,
`GET /api/gestion/campo`, `POST /api/gestion/visitas` (idempotente por `clave`),
`POST /api/gestion/visitas/{id}/anular`, `GET /api/gestion/resultados/operacion`,
`GET /api/gestion/resultados/visitas`, `GET /api/gestion/padron.csv`, `GET|POST /api/gestion/valorizacion`,
`GET /api/gestion/actores`, `GET /api/gestion/qr/{codigo}?fecha`, `GET /api/gestion/qr/etiquetas`,
`GET|POST /api/gestion/predios/{id}/qr`, `POST /api/gestion/qr/{codigo}/revocar`,
`POST /api/gestion/qr/lote`. Campo y padrón requieren perfil con acceso a personas (no consulta).

## Comandos

```sh
npm run bagua-master:simular-operacion   # solo destino local/test; reemplaza lo que ella misma generó
```

El último día programado de cada servicio queda como recorrido en curso (parte de los
participantes sin visitar) para demostrar el registro en campo.

## Cuando llegue la información oficial

Se reemplaza por partes, sin cambiar la interfaz: la programación real de rutas
(`ruta_programacion`), el padrón (anexos 03-A a 03-D), los actores y comprobantes de valorización,
y la infraestructura. Las visitas empiezan a registrarse desde campo. Los tiempos de paso del plano
y los sectores ya son reales.
