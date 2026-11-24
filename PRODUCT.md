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
- **Técnico del área:** mantiene rutas, horarios, padrón y actores.
- **Promotor o reciclador de campo:** empadrona y registra visitas desde el celular.
- **Atención al vecino:** responde en segundos qué día y a qué hora pasa el camión.

## Cuatro pilares unidos por el mapa

1. **Servicio:** rutas por tipo (convencional, comercial, orgánicos, reciclables), días, horarios y
   sectores; infraestructura (contenedores, puntos limpios, centro de acopio, planta); «¿cuándo
   pasa?» en cualquier punto.
2. **Padrón:** predios y participantes georreferenciados, domiciliarios y no domiciliarios, con
   representante y roles (contribuyente, propietario, arrendatario); exportable en los formatos
   03-A a 03-D del MINAM.
3. **Campo:** empadronar y registrar visitas (entregó, no entregó, ausente; materiales y kilos si se
   pesan) en segundos.
4. **Resultados:** participación, cobertura y toneladas por mes, material y actor; cada cifra abre
   los registros que la producen.

Un registro, muchas vistas: la visita anotada en campo aparece en el expediente, en la
participación y en los resultados.

## Recorridos clave

1. Vecino al teléfono: dirección → ruta, día y hora.
2. Gerente: DNI o código → el mapa va al predio → ficha con personas, servicios, horario y visitas.
3. Tocar una edificación en el mapa → su ficha y su horario.
4. Campo: predios de la ruta del día → registrar la visita.
5. Fin de mes: toneladas por actor → reporte y padrón listos.

## Fuera del alcance por ahora

Incidencias y reportes vecinales (otro practicante), arbitrios y Rentas, GPS de vehículos y
catastro completo. El 3D es un complemento, no el eje.

## Datos

Mientras no llegue la información oficial, el producto funciona con una simulación realista anclada
en el Bagua real ([operación del servicio](docs/operacion-servicio.md)). Se reemplaza por partes
sin cambiar la interfaz.
