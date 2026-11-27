-- BAGUA MASTER: nombres de ruta sin avisos de duda en el mapa (la procedencia de cada trazo sigue en
-- su ficha). Los mismos nombres quedan en data/bagua-master/rutas/rutas.json para futuras cargas.
UPDATE bagua_master.ruta SET nombre = 'Ruta comercial · mercado y paradero' WHERE codigo = 'CAD-RUTAS';
UPDATE bagua_master.ruta SET nombre = 'Ruta La Primavera' WHERE codigo = 'CAD-PRIMAVERA';
UPDATE bagua_master.ruta SET nombre = 'Ruta de orgánicos' WHERE codigo = 'MUN-ORGANICA';
