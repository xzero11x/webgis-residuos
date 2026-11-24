-- BAGUA MASTER: la forma cartográfica de las huellas de Overture también puede ser solo suavizada
-- (sin dientes ni espigas y con esquinas levemente redondeadas), no únicamente recortada contra la
-- calzada. La huella original de bagua_master.edificio sigue sin cambios.
ALTER TABLE bagua_master.edificio_geom_mapa
  DROP CONSTRAINT edificio_geom_mapa_motivo_check,
  ADD CONSTRAINT edificio_geom_mapa_motivo_check CHECK (motivo IN ('recorte_calzada', 'suavizado'));
