-- BAGUA MASTER: geometría cartográfica de las huellas de Overture recortadas contra la calzada
-- por el ajuste de coherencia (scripts/bagua-master/ajustar_coherencia.py). La usan las vistas
-- 2.5D/3D para que los volúmenes no pisen la calle, igual que las teselas 2D. La geometría
-- original de bagua_master.edificio, sus identificadores y vínculos no cambian.
CREATE TABLE bagua_master.edificio_geom_mapa (
  edificio_id text PRIMARY KEY REFERENCES bagua_master.edificio(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN ('recorte_calzada')),
  geom geometry(Polygon, 4326) NOT NULL CHECK (ST_IsValid(geom))
);
COMMENT ON TABLE bagua_master.edificio_geom_mapa IS
  'Representación cartográfica (no la huella original) de edificios de Overture recortados contra la calzada.';
