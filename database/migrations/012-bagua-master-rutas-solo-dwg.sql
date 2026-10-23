-- BAGUA MASTER: las rutas municipales proceden exclusivamente de archivos DWG. Los PDF dejan de ser
-- fuente activa. Solo afecta a la copia de BAGUA MASTER (bagua_master.ruta*); el paquete municipal
-- original, los PDF y sus datos históricos no se tocan ni se borran (el snapshot anterior queda
-- archivado en data/bagua-master/rutas/historico/).

-- 1. Vacía la copia: la importación siguiente (npm run bagua-master:importar-rutas) la reconstruye solo
--    con rutas DWG. Así no quedan rutas, flechas ni marcadores de PDF ni huérfanos, y las notas que
--    citaban un PDF se sustituyen por las saneadas del exportador.
DELETE FROM bagua_master.ruta_flecha;
DELETE FROM bagua_master.ruta_marcador;
DELETE FROM bagua_master.ruta;

-- 2. Procedencia identificable por ruta (archivo de trazos, de flechas y de marcadores).
ALTER TABLE bagua_master.ruta ADD COLUMN procedencia jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Futuras importaciones no pueden publicar datos de PDF: lo impide la propia base.
ALTER TABLE bagua_master.ruta
  ADD CONSTRAINT ruta_fuente_dwg CHECK (fuente_archivo ~* '\.dwg$'),
  ADD CONSTRAINT ruta_sin_pdf CHECK (
    nota !~* 'pdf' AND advertencias::text !~* 'pdf' AND procedencia::text !~* 'pdf'
  );
ALTER TABLE bagua_master.ruta_flecha ADD CONSTRAINT ruta_flecha_fuente_dwg CHECK (fuente ~* '\.dwg$');
ALTER TABLE bagua_master.ruta_marcador ADD CONSTRAINT ruta_marcador_fuente_dwg CHECK (fuente ~* '\.dwg$');

COMMENT ON TABLE bagua_master.ruta IS
  'Rutas municipales documentadas, solo de DWG (trazos originales). No acreditan vigencia operativa ni precisión topográfica.';
