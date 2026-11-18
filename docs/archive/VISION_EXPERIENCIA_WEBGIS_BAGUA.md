> **ARCHIVO HISTÓRICO — sin autoridad operativa desde el 17/11/2026.**
> Se conserva como antecedente; sus órdenes de continuación, lecturas, prioridades
> y propuestas superadas no se ejecutan. Consultar [AGENTS](../../AGENTS.md) y sus
> fuentes activas. El contenido siguiente es el original, salvo ajustes de enlaces.
> Las referencias v2/REFERENCIAS citadas y no recibidas no se fabrican.

0A8F, yo me imagino **WEBGIS BAGUA como un software municipal de primer nivel: tan pulido como Linear, tan intuitivo como una aplicación de macOS y tan práctico como una herramienta que el personal realmente quiera usar todos los días**.

No me lo imagino como una página llena de estadísticas, botones y mapas. Me lo imagino como un sistema donde una persona puede entrar, encontrar lo que necesita en segundos, realizar su trabajo y salir sin tener que entender conceptos técnicos de GIS.

Te voy a describir el producto como si ya estuviera terminado, funcionando en la Municipalidad, con los datos reales autorizados integrados y todos los módulos validados.

# **1. La experiencia visual que imagino**

Organización estilo Linear

Sidebar discreta, excelente jerarquía y pocos controles visibles.

[Use the Preview pane in the Finder on Mac - Apple 支持 (SG)](https://images.openai.com/static-rsc-4/jJDJWt5WfLl-RWy3iQWvndB2n6r1Ebh-XOeqm7mqFMasZnurfiQxqTEOOlDRgD5pX1YPg7Brg1jK_2ZksS3LJf5JXc-vjJcTmGcTgDOJaPHdKWwJo78pHoX2WBwNe6ZjDftLWwDwgBPJ5CAef-Ibj5B7-EQ6bTS0AmcEwhyrh7Y?purpose=inline)

Claridad de macOS

Paneles consistentes, tipografía legible y acciones contextuales.

Lo primero que definiría es una identidad visual propia:

- Fondos neutros, superficies blancas o gris muy suave, bordes sutiles y un color de acento reservado para acciones importantes.
- Tipografía de sistema, iconos Lucide, tamaños consistentes y transiciones rápidas pero discretas.
- Paneles que aparezcan cuando tengan una utilidad, no ventanas flotantes por todas partes.
- Un diseño que aproveche mucho el espacio, especialmente cuando se trabaja con el mapa.

**Mi regla principal:** el software debe sentirse sencillo aunque internamente administre información compleja.

# **2. Entro al sistema por primera vez**

Imagínate que eres un trabajador de Gestión Ambiental.

Abres la dirección institucional del WebGIS desde tu computadora.

## **Pantalla de inicio de sesión**

Ves una pantalla extremadamente limpia. Un fondo gris muy claro, el nombre WEBGIS BAGUA, un pequeño identificador de la Municipalidad y un formulario centrado.

Solo aparecen el usuario, contraseña, botón de ingreso y opciones de recuperación o soporte que la Municipalidad tenga habilitadas.

Nada de mapas de fondo que dificulten la lectura, animaciones innecesarias ni estadísticas públicas.

Al ingresar, el sistema reconoce tu perfil y habilita únicamente las funciones que corresponden a tu trabajo.

Un trabajador de campo no tiene por qué disponer de las mismas opciones administrativas que un responsable de la Gerencia.

## **La pantalla principal**

Yo haría que la experiencia predeterminada para el personal territorial sea **el mapa de trabajo**, no un dashboard.

**WEBGIS BAGUA**

Gestión territorial y residuos sólidos

Mapa

Predios

Servicios

Rutas

Actividades

Reportes

Administración

Mapa territorial

[Información de tráfico en tiempo real para llegar a Jr. Amazonas, Jr. Amazonas, Bagua - Waze](https://images.openai.com/static-rsc-4/gTOFofTMi1Ejo8qEepKHZ4Lpn9c3mAjMoh5tpZVwK8eY8_SKGgi2eYUgKhqijtae8nFwhnqh9VL2oFDRMLVtCo6eGpI7hAJs4Uichn0U2xQSMu4F2NJqtVD9xBEZ_2iyPkKaLw_XENnJxmSrjLwnceQwDdIkEj77ZWpryMVExYc?purpose=inline)

[waze.com](https://www.waze.com/es/live-map/directions/pe/amazonas/bagua/jr.-amazonas?to=place.EiJKaXLDs24gQW1hem9uYXMsIEJhZ3VhIDAxNzIxLCBQZXJ1Ii4qLAoUChIJF0CE8hdTtJER_AuoLILXV4oSFAoSCafvhqD8UrSREYuK6hMS4zXc\&utm_source=chatgpt.com)

Representación conceptual de la distribución. No es una captura del software actual ni una cartografía validada del proyecto.

En escritorio, la distribución real tendría tres regiones que cambian según la tarea: navegación izquierda, contenido central y un inspector contextual derecho que aparece al seleccionar un elemento. Si no hay selección, el mapa ocupa ese espacio.

Esto importa porque **no quiero que el mapa pierda la mitad de la pantalla por paneles permanentemente abiertos**.

# **3. Dónde estaría cada cosa**

Yo organizaría la aplicación así:

| Sección principal  | Para qué entra el trabajador                                         |
| ------------------ | -------------------------------------------------------------------- |
| **Mapa**           | Explorar el territorio, localizar predios y visualizar capas y rutas |
| **Predios**        | Buscar, consultar, registrar y actualizar fichas                     |
| **Servicios**      | Gestionar modalidades, asignaciones, sectores y frecuencias          |
| **Rutas**          | Consultar recorridos, fuentes, estados y validaciones                |
| **Actividades**    | Registrar y revisar participación y entregas de residuos             |
| **Reportes**       | Consultar indicadores y exportar información autorizada              |
| **Administración** | Usuarios, permisos, catálogos, importaciones y trazabilidad          |

No crearía un elemento principal del menú para cada pequeña función.

Por ejemplo, no tendría «Personas», «Contribuyentes», «Propietarios», «Ocupantes», «Direcciones» y «Lotes» como seis secciones independientes visibles para todo el mundo.

La relación con personas se consultaría principalmente desde los predios, y las funciones especializadas aparecerían según el perfil autorizado.

Eso mantiene una navegación comprensible.

# **4. Estoy en el mapa. ¿Qué veo y qué puedo hacer?**

Aquí es donde BAGUA MASTER se convierte en el entorno de trabajo cotidiano.

Al abrirlo, aparece la cartografía base de Overture, con sus edificios, calles, ríos y demás elementos disponibles en el ámbito.

Las geometrías originales se mantienen intactas. Las rutas documentales y las referencias administrativas se dibujan como capas independientes.

En la parte superior del área de trabajo hay un buscador que permite localizar predios, códigos, direcciones, sectores y otros registros realmente disponibles.

A la derecha del mapa están los controles cartográficos: zoom, capas, encuadre y herramientas contextuales. No colocaría allí un menú de veinte funciones.

## **¿Qué pasa si hago clic en un edificio?**

Aquí hay una decisión crucial.

**No aparecería automáticamente una ficha de predio tributario.**

Si solo es una edificación de Overture, el sistema puede mostrar información cartográfica básica y señalar que no hay una vinculación administrativa confirmada.

Si existe una relación verificada con un predio registrado, entonces permite abrir esa ficha.

Y si existen varias unidades asociadas al edificio, muestra la lista de unidades disponibles para elegir correctamente.

Esta pequeña diferencia evita uno de los errores conceptuales más graves que podría tener el WebGIS.

# **5. Busco un predio real**

Imaginemos un ejemplo ficticio.

Escribo un código de predio o una dirección en la búsqueda.

El sistema devuelve resultados con información suficiente para distinguirlos: código, dirección, sector y estado de ubicación.

Selecciono uno.

El mapa se desplaza hacia su ubicación **si esa ubicación está verificada**. En el lado derecho aparece la ficha del predio.

Ficha del predio

## **Predio P-000128**

Dirección de ejemplo · Sector de ejemplo

Ubicación verificada

Uso declarado

Residencial

Código municipal

P-000128

Sector

Ejemplo A

General

Personas

Servicios

Actividad

**Información administrativa**

Características del predio según los registros institucionales autorizados.

Fuente: padrón municipal de ejemplo

&#x20;Editar ficha

Ejemplo de estructura visual; los códigos y atributos mostrados son ficticios.

Esta ficha no sería simplemente una ventana que aparece sobre el mapa.

Sería un **inspector contextual reutilizable**. Lo mismo ocurre cuando seleccionas una ruta, un servicio o una actividad: cambia su contenido, pero se conserva una estructura familiar.

## **Qué contiene la ficha completa**

La organizaría en vistas internas:

**General:** código, dirección, sector, uso, características, fuente y estado de ubicación.

**Personas vinculadas:** contribuyentes y relaciones administrativas que el usuario esté autorizado a consultar, con tipo de vínculo y vigencia.

**Servicios:** modalidades asignadas o registradas, con su estado y evidencia.

**Actividad:** historial de participación y entregas asociadas.

**Historial:** modificaciones importantes, fuente y responsable.

Los campos ausentes se muestran como «Sin información registrada» o «Pendiente de verificar», nunca se completan arbitrariamente.

Además, el inspector tendría una opción para abrir la ficha completa en una página más amplia. Esto es importante cuando hay muchas relaciones o registros que no caben cómodamente en el lateral.

# **6. Quiero consultar los servicios del predio**

Ahora estoy en la pestaña Servicios.

Podría encontrar, por ejemplo, una asignación de recolección convencional confirmada, una inscripción en un programa de aprovechables y ninguna información registrada sobre orgánicos.

Cada elemento mostraría lo pertinente: servicio, modalidad, estado, sector, frecuencia o programación si está confirmada, fuente y fecha de actualización.

Aquí debe diferenciarse cuidadosamente entre tres situaciones:

**Servicio programado o asignado**

Existe información administrativa o una programación respaldada que vincula el predio con el servicio.

**Participación registrada**

El predio o usuario participa en una modalidad, pero eso no acredita que haya realizado una entrega determinada.

**Actividad efectivamente registrada**

Existe un evento concreto documentado, con fecha, responsable y los demás datos disponibles.

Una buena interfaz municipal debe hacer visible esa diferencia sin obligar a leer un manual.

# **7. Entro a Rutas**

No me imagino que al hacer clic en Rutas aparezca únicamente una enorme tabla.

Me imagino una pantalla donde el mapa sigue siendo protagonista, pero a la izquierda aparece un panel con una lista de rutas.

Seleccionas una ruta y el sistema la resalta, atenúa las demás y muestra su ficha.

Esa ficha incluiría nombre, servicio relacionado cuando esté respaldado, fuente, estado, sectores, fecha de información y detalles documentales. Los horarios solo aparecen cuando existen y están validados.

Las siete rutas DWG documentadas de BAGUA MASTER se preservarían, distinguiendo las cuatro georreferenciadas de las tres en revisión.

Si en el futuro la Gerencia confirma que una representación corresponde a un recorrido operativo vigente, eso se registrará como **una versión operativa validada vinculada a la fuente documental**, no como una modificación silenciosa del DWG.

Quiero evitar que el usuario vea una línea y piense automáticamente: «Este es el recorrido que realiza hoy el camión».

También mantendría el mapa municipal histórico dentro de una zona técnica autorizada, sin confundirlo con la vista cotidiana de BAGUA MASTER.

# **8. Soy trabajador de campo y necesito registrar una entrega**

Aquí está una parte esencial del proyecto final.

Un trabajador abre el WebGIS desde su teléfono. No encuentra el mismo escritorio reducido a una pantalla pequeña; encuentra una experiencia verdaderamente adaptada.

**WEBGIS BAGUA**

Buscar predio o participante

[City map - town streets on the plan. Map of the  scheme of road. Urban environment, architectural background. Vector](https://images.openai.com/static-rsc-4/P4mG_UvRdDgFDhkphEQcPbKSF_sBedMEQ5RPs7S8ER4esM10EvAjQnaDsch7tBWdFVRlC_5iMbUhCMSpUSDpeWqU6c-8ZIsBJVPIDYoFlcEAwx2XPVyarDSxlnhvfYRvEoVMiI8FEiX5o1gZSyB9uTJ7fSjUqnM1npSIMl7OkbARZVHJHETzmZGoxXYrQCpY?purpose=inline)

**Predio P-000128**

Ficha localizada · ejemplo ficticio

&#x20;Registrar entrega

Consultar historial

Mapa

Buscar

Actividad

Más

Propuesta visual móvil: navegación simplificada y panel inferior contextual.

Cuando pulsa «Registrar entrega», aparece un formulario específico.

Por ejemplo, selecciona la modalidad orgánicos o aprovechables, identifica al participante o predio, elige el material y registra la fecha y cantidad si existe medición.

Los valores conocidos pueden completarse automáticamente desde el contexto, pero no se deben inventar. Si no se midió una cantidad, el campo puede permanecer sin dato cuando el procedimiento lo permita.

Al guardar, recibe una confirmación clara. El registro aparece en el historial del participante y queda disponible para las consultas autorizadas.

**No obligaría a utilizar GPS, tomar fotografías o trabajar sin conexión si la Municipalidad no ha solicitado ni validado esas necesidades.** Son capacidades posibles, pero no deben inflar artificialmente el producto.

# **9. Quiero trabajar directamente con el padrón**

No todo debe hacerse desde el mapa.

Si entro a **Predios**, veo una pantalla administrativa con un encabezado claro, búsqueda, filtros y una tabla profesional.

Puedo buscar por código, dirección, uso, sector o estado de ubicación.

La tabla mostraría pocas columnas principales y permitiría personalizar la vista según la tarea. Al seleccionar una fila, se abre la ficha. Si el registro tiene localización válida, puedo elegir «Ver en mapa».

También existirían acciones autorizadas de registrar, editar y revisar datos.

Esto es importante: **el mapa es excelente para entender dónde están las cosas; una tabla es mejor para encontrar, ordenar y trabajar con muchos registros**.

No reemplazaría una herramienta con la otra. Haría que ambas estén conectadas.

Cuando un predio no tenga georreferencia, seguirá apareciendo en la tabla y podrá consultarse su ficha. Su estado será «Ubicación pendiente», no un punto colocado al azar en el mapa.

# **10. Entro a Reportes como responsable de la Gerencia**

Aquí sí tendría un espacio de indicadores, pero no pondría gráficos por todas partes.

Imagino una pantalla donde la primera acción consiste en seleccionar el periodo, sector y modalidad de servicio.

Debajo aparecen únicamente los indicadores que podemos calcular con datos suficientes: predios registrados, ubicaciones verificadas, participaciones, entregas, materiales medidos y registros pendientes de revisión.

Los indicadores se complementan con tablas que permiten profundizar. Los gráficos se utilizan cuando realmente ayudan a comparar periodos, sectores o tipos de material.

Si un porcentaje requiere conocer el universo completo de predios o generadores, el sistema verifica que exista ese denominador. De lo contrario, muestra conteos o explica la limitación.

Por ejemplo, **no mostraría «90 % de cobertura municipal» si solamente tenemos información de una parte de la ciudad**.

Y los reportes exportados respetarían las mismas restricciones de acceso que las pantallas.

# **11. ¿Qué vería un administrador del sistema?**

La sección Administración sería diferente y estaría restringida.

Aquí colocaría gestión de usuarios y roles, catálogos, fuentes, importaciones, auditoría y configuración institucional.

También habría un área para importar padrones de Rentas mediante archivos estructurados, con un proceso de revisión antes de aplicar cambios.

Imagino este flujo:

**Seleccionar archivo autorizado**

CSV, Excel u otro formato admitido

**Validar estructura y relaciones**

Identificadores, formatos, duplicados, campos faltantes

**Previsualizar cambios**

Altas, modificaciones, conflictos y registros pendientes

**Aplicar importación autorizada**

Transacción controlada, procedencia y registro de resultados

Nunca debería bastar con cargar un Excel para modificar silenciosamente miles de registros municipales.

El administrador puede revisar qué se cambiará, rechazar conflictos, confirmar la operación y conservar un historial de importaciones.

# **12. Qué haría que se sintiera realmente profesional**

Para mí, la calidad del sistema se notaría en los detalles cotidianos.

**Interacciones previsibles**

Un clic selecciona. Una acción claramente identificada edita. Un cambio importante solicita confirmación. El usuario no pierde lo que estaba haciendo porque cambió de panel.

**Búsqueda realmente útil**

Busca información disponible, devuelve coincidencias comprensibles y permite corregir o refinar la consulta. Nunca inventa direcciones o predios inexistentes.

**Confianza en la información**

Cada dato relevante puede mostrar su procedencia y estado. No se confunden documentos, padrones, hipótesis ni hechos operativos.

**Adaptación real al dispositivo**

Escritorio para análisis y edición detallada; móvil para búsqueda, consulta y registro rápido. Sin tablas imposibles de manejar ni controles diminutos.

**Estados claros**

Cargando, sin resultados, error, sin permiso, pendiente de revisión y guardado correctamente son situaciones distintas y cada una tiene una respuesta adecuada.

También quiero que funcione bien con teclado, tenga contraste suficiente, mantenga un buen rendimiento y no dependa de animaciones para comunicar información.

El modo oscuro puede formar parte de la experiencia, pero inicialmente priorizaría un modo claro excelente. No sacrificaría calidad funcional por desarrollar dos temas visuales simultáneamente.

# **13. Lo que no pondría en el sistema**

Aquí tomaría decisiones bastante estrictas.

No pondría un gran dashboard obligatorio antes de entrar al mapa. No agregaría un asistente de IA flotante solo porque esté de moda. No llenaría el mapa de marcadores permanentes ni mostraría todas las capas activadas por defecto.

Tampoco convertiría cada tipo de dato en una sección independiente del menú, ni añadiría gráficos sin una pregunta concreta que deban responder.

No intentaría mostrar edificios en 3D utilizando alturas inventadas, ni trazaría rutas con ajustes automáticos que cambien el significado de las fuentes originales.

Y sobre todo, **no mostraría información de contribuyentes a cualquier usuario simplemente porque puede verla asociada a un objeto cartográfico**.

La calidad no depende de cuántas funciones estén a la vista, sino de que las necesarias aparezcan en el lugar y momento adecuados.

# **14. ¿Cuándo consideraría terminado el WebGIS al 100 %?**

Hay una precisión importante: **tener todas las funcionalidades implementadas no equivale a tener todos los datos municipales completos**.

El software puede estar terminado y correctamente entregado aunque existan registros históricos sin coordenadas, calles sin nombre o rutas cuya vigencia todavía no se haya podido verificar. Lo importante es que se conozcan y representen correctamente esas limitaciones.

Consideraría el producto terminado cuando los flujos completos puedan ejecutarse con los datos autorizados disponibles, con pruebas superadas y validación institucional.

Eso significa que un empleado pueda localizar un predio, consultar sus relaciones autorizadas, revisar los servicios correspondientes y registrar una actividad real; que la Gerencia pueda analizar esa información; y que un administrador pueda mantener los padrones y usuarios sin depender del desarrollador.

También deberían existir respaldos, procedimientos de recuperación, documentación, control de permisos, pruebas y capacitación para que la Municipalidad pueda operar y mantener el sistema.

## **Mi visión final en una escena**

Imagínate que el ingeniero Jhossi abre el WEBGIS BAGUA en su computadora.

Entra con su usuario, accede al mapa territorial y busca un sector. Selecciona un predio y consulta su información administrativa, los servicios relacionados y las actividades registradas.

Después entra a Reportes, selecciona el sector y el periodo, y ve cuántos predios están registrados, cuántas ubicaciones requieren verificación y qué entregas de residuos aprovechables se han documentado.

Al mismo tiempo, un trabajador en campo puede registrar una nueva entrega desde su celular. Esa actividad queda asociada al participante y posteriormente está disponible para las consultas institucionales.

Si el personal encuentra una dirección incorrecta, puede proponer o efectuar una corrección conforme a sus permisos, conservando el historial.

Si Rentas entrega un padrón actualizado, el administrador puede importarlo de forma controlada, sin perder las relaciones existentes ni modificar la cartografía base.

Todo ocurre dentro del mismo sistema. Sin consultar diez archivos Excel, sin buscar nombres manualmente en planos CAD y sin confundir información tributaria con servicios realizados.

**Eso es lo que yo construiría: un centro de trabajo territorial para la Gerencia de Gestión Ambiental y Residuos Sólidos, donde el mapa, los predios, las personas y las operaciones forman una única experiencia coherente.**

Y si tuviera que tomar una sola decisión de diseño para orientar a todos tus agentes, sería esta:

**WEBGIS BAGUA debe diseñarse alrededor de las tareas reales del personal municipal, no alrededor de las tablas de la base de datos ni de las funcionalidades que los programadores son capaces de crear.**

Esa es la diferencia entre un sistema que simplemente funciona y un producto institucional verdaderamente bien diseñado.