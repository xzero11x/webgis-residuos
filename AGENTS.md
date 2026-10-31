# Regla permanente de cartografía

Por instrucción explícita del usuario, **la base cartográfica de BAGUA MASTER debe
seguir siendo Overture Maps**. No sustituir sus geometrías, identificadores ni
fuentes de calles, edificios, agua, usos o lugares por OpenFreeMap, OpenStreetMap
u otro proveedor. OpenFreeMap puede utilizarse como referencia de **estética**:
colores, tipografía, jerarquía de líneas y presentación, mediante el estilo local.

Conservar las PMTiles propias de Overture y los recursos servidos por la API local.
No cargar un estilo remoto como reemplazo de la base de BAGUA MASTER ni reconstruir
la cartografía para un cambio meramente visual. Las alturas complementarias y
simuladas son atributos derivados y deben mantener su procedencia, separadas de
los datos originales. Las capas municipales documentales conservan su fuente.

El visor municipal histórico de `/` es independiente; su configuración existente
no autoriza cambiar la base de `/bagua-master`. Mantener las comprobaciones de
fuentes de Overture al modificar el estilo.
