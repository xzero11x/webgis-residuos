ALTER TABLE gestion.servicio ADD COLUMN activo boolean NOT NULL DEFAULT true;
CREATE TABLE gestion.material (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 codigo text NOT NULL UNIQUE,
 nombre text NOT NULL,
 activo boolean NOT NULL DEFAULT true,
 sintetico boolean NOT NULL DEFAULT true CHECK(sintetico),
 creado_en timestamptz NOT NULL DEFAULT now()
);
