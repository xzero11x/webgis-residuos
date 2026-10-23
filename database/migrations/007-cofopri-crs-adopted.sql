-- 16 Oct 2026: the measured COFOPRI translation (PSAD 56 drawing moved -250.301 m E,
-- -376.509 m N onto the EPSG:32717 route CAD) is adopted as its CRS
-- (docs/municipal-gis.md, data/cad/extracted/cofopri-alineacion.json).
COMMENT ON TABLE cad_review IS
  'Geometrías de los DWG para el explorador CAD. properties.crsStatus: declarado (GEODATA EPSG:32717), adoptado (traslación medida aprobada: Tomaque y COFOPRI, 16/10/2026) o pendiente.';
