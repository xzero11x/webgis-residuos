-- 16 Oct 2026: the measured Tomaque translation is adopted as its CRS
-- (docs/dwg-segunda-pasada.md). Recovered block routes stay provisional.
ALTER TABLE cad_second_pass DROP CONSTRAINT cad_second_pass_crs_status_check;
ALTER TABLE cad_second_pass ADD CONSTRAINT cad_second_pass_crs_status_check
  CHECK (crs_status IN ('declarado', 'adoptado', 'provisional'));
COMMENT ON COLUMN cad_second_pass.crs_status IS
  'declarado: GEODATA EPSG:32717 del DWG. adoptado: traslación de Tomaque aprobada el 16/10/2026. provisional: traslación de un bloque no insertado, pendiente de decisión.';
