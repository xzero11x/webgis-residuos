# WEBGIS BAGUA · servicio y participación en residuos sólidos

> Resumen descriptivo de lo construido. No dirige el proyecto: las decisiones las toma el usuario.

**En una frase:** un sistema sobre el mapa de Bagua donde la Gerencia de Gestión Ambiental ve cómo,
cuándo y por dónde presta cada servicio de recolección, quién participa en la recolección
selectiva, y obtiene sin trabajo extra los datos que debe reportar.

## Problema

1. Información dispersa: rutas y horarios en DWG, padrones en Excel, reportes armados a mano.
2. «El camión no pasa»: el vecino no conoce el horario; afecta la percepción del servicio y la
   morosidad.
3. Participación sin seguimiento: no se sabe quién entrega, cada cuánto ni en qué zonas.
4. Reportes poco confiables (SIGERSOL, plan provincial, padrones de recolección selectiva).

## Usuarios

- **Gerente:** ver el estado del servicio, decidir y reportar.
- **Supervisor:** cada mañana, qué rutas salieron, cuáles van atrasadas y qué falta.
- **Técnico del área:** mantiene rutas, horarios, avisos, padrón, pesaje y actores.
- **Chofer:** marca su ruta en el celular con tres botones.
- **Promotor o reciclador de campo:** empadrona y registra visitas desde el celular.
- **Atención al vecino:** responde en segundos qué día y a qué hora pasa el camión.

## El ciclo de valor

Planificar (rutas, horarios, padrón) → ejecutar (el chofer marca salida, pasos y llegada; el
promotor registra la visita; la oficina, el ticket de balanza) → verificar (tablero del día,
cumplimiento, hora real) → rendir cuentas (cierre del mes, SIGERSOL, padrón MINAM, concejo, horario
real al vecino) → ajustar (cambio de programación con aviso al vecino, al chofer y al promotor).

## Pilares unidos por el mapa

1. **Servicio:** rutas por tipo (convencional, comercial, orgánicos, reciclables), días, horarios y
   sectores; infraestructura (contenedores, puntos limpios, centro de acopio, planta); «¿cuándo
   pasa?» en cualquier punto.
2. **Padrón:** predios y participantes georreferenciados, domiciliarios y no domiciliarios, con
   representante y roles (contribuyente, propietario, arrendatario); exportable en los formatos
   03-A a 03-D del MINAM.
3. **Campo:** empadronar y registrar visitas (entregó, no entregó, ausente; materiales y kilos si se
   pesan) en segundos.
4. **Ejecución de ruta:** salida, paso por los puntos de control y llegada desde el celular del
   chofer, sin escribir y sin señal; tickets de balanza en la oficina.
5. **Resultados:** participación, toneladas pesadas, cumplimiento y valorización por mes; cierre
   del mes, reporte para SIGERSOL y resumen para el concejo; cada cifra abre sus registros.

Un registro, muchas vistas: la visita anotada en campo aparece en el expediente, en la
participación y en los resultados.

## Recorridos clave

1. Vecino al teléfono: dirección → ruta, día y hora.
2. Gerente: DNI o código → el mapa va al predio → ficha con personas, servicios, horario y visitas.
3. Tocar una edificación en el mapa → su ficha y su horario.
4. Campo: predios de la ruta del día → registrar la visita; vecino nuevo → inscribirlo con su sticker.
5. Chofer: Salí → Pasé por aquí → Llegué al relleno.
6. Supervisor: Operación › Hoy → alertas → recorrido punto por punto.
7. Fin de mes: pendientes → cierre → reporte SIGERSOL y resumen para el concejo.
8. Llega el Excel del padrón: cargar → corregir lo marcado → confirmar.

## Fuera del alcance por ahora

Incidencias y reportes vecinales (otro practicante), arbitrios y Rentas, GPS de vehículos y
catastro completo. El 3D es un complemento, no el eje.

## Datos

Mientras no llegue la información oficial, el producto funciona con una simulación realista anclada
en el Bagua real ([operación del servicio](docs/operacion-servicio.md)). Se reemplaza por partes
sin cambiar la interfaz.
