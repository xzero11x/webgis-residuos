-- BAGUA MASTER: operación del servicio de residuos sólidos.
--   * Programación de las rutas (servicio, días, horario, turno, sectores).
--   * Infraestructura del servicio (contenedores, puntos limpios, centro de acopio, planta).
--   * Padrón oficial de participantes de la recolección selectiva (formatos 03-A a 03-D del MINAM):
--     tipo de generador, representante, habitantes, establecimiento, código de padrón y zona.
--   * Visitas de recolección con su resultado (entregó, no entregó, ausente); las entregas de
--     materiales cuelgan de la visita.
--   * Valorización mensual por actor (asociación de recicladores formalizada, EO-RS, planta
--     municipal) con su comprobante, como lo exige el reporte de toneladas valorizadas.
-- Igual que el resto de `gestion`, todo es sintético hasta una habilitación institucional
-- explícita (CHECK sintetico).

CREATE TABLE bagua_master.ruta_programacion (
  id text PRIMARY KEY,
  ruta_codigo text NOT NULL,
  servicio text NOT NULL CHECK (servicio IN ('convencional', 'organicos', 'reciclables', 'comercial')),
  nombre text NOT NULL,
  dias smallint[] NOT NULL
    CHECK (cardinality(dias) BETWEEN 1 AND 7 AND dias <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL CHECK (hora_fin > hora_inicio),
  turno text NOT NULL CHECK (turno IN ('mañana', 'tarde', 'noche')),
  sectores text[] NOT NULL DEFAULT '{}',
  vehiculo text NOT NULL DEFAULT '',
  operador text NOT NULL DEFAULT '',
  nota text NOT NULL DEFAULT '',
  vigente boolean NOT NULL DEFAULT true,
  sintetico boolean NOT NULL DEFAULT true CHECK (sintetico)
);
CREATE INDEX ruta_programacion_ruta ON bagua_master.ruta_programacion (ruta_codigo);

CREATE TABLE bagua_master.infraestructura (
  id text PRIMARY KEY,
  tipo text NOT NULL
    CHECK (tipo IN ('contenedor', 'punto_limpio', 'centro_acopio', 'planta_organicos', 'disposicion_final')),
  nombre text NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  horario text NOT NULL DEFAULT '',
  materiales text[] NOT NULL DEFAULT '{}',
  geom geometry(Point, 4326) NOT NULL,
  sintetico boolean NOT NULL DEFAULT true CHECK (sintetico)
);
CREATE INDEX infraestructura_geom ON bagua_master.infraestructura USING gist (geom);

CREATE TABLE gestion.actor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('asociacion_recicladores', 'eo_rs', 'planta_municipal')),
  registro text NOT NULL DEFAULT '',
  socios integer CHECK (socios IS NULL OR socios > 0),
  vigente boolean NOT NULL DEFAULT true,
  sintetico boolean NOT NULL DEFAULT true CHECK (sintetico)
);

CREATE TABLE gestion.valorizacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES gestion.actor (id),
  periodo date NOT NULL CHECK (extract(day FROM periodo) = 1),
  fecha date NOT NULL,
  material text NOT NULL,
  toneladas numeric(10, 3) NOT NULL CHECK (toneladas > 0),
  comprobante_tipo text NOT NULL
    CHECK (comprobante_tipo IN ('boleta', 'factura', 'liquidacion_compra', 'registro_planta')),
  comprobante_numero text NOT NULL,
  observaciones text NOT NULL DEFAULT '',
  registrado_por uuid NOT NULL REFERENCES gestion.usuario (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  anulada boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  UNIQUE (actor_id, comprobante_numero, material),
  CHECK (date_trunc('month', fecha)::date = periodo),
  CHECK (NOT anulada OR motivo_anulacion IS NOT NULL)
);
CREATE INDEX valorizacion_periodo ON gestion.valorizacion (periodo);

ALTER TABLE gestion.participacion
  ADD COLUMN tipo_generador text CHECK (tipo_generador IN ('domiciliario', 'no_domiciliario')),
  ADD COLUMN representante_id uuid REFERENCES gestion.persona (id),
  ADD COLUMN habitantes integer CHECK (habitantes IS NULL OR habitantes BETWEEN 1 AND 60),
  ADD COLUMN establecimiento text,
  ADD COLUMN tipo_establecimiento text,
  ADD COLUMN codigo_padron text,
  ADD COLUMN zona text;
CREATE UNIQUE INDEX participacion_codigo_padron ON gestion.participacion (servicio_id, codigo_padron)
  WHERE codigo_padron IS NOT NULL;

CREATE TABLE gestion.visita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participacion_id uuid NOT NULL REFERENCES gestion.participacion (id),
  fecha date NOT NULL,
  resultado text NOT NULL CHECK (resultado IN ('entrego', 'no_entrego', 'ausente')),
  observaciones text NOT NULL DEFAULT '',
  responsable_id uuid NOT NULL REFERENCES gestion.usuario (id),
  clave uuid NOT NULL UNIQUE,
  anulada boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT anulada OR motivo_anulacion IS NOT NULL)
);
-- Una sola visita vigente por participante y día: la misma recolección no se cuenta dos veces.
CREATE UNIQUE INDEX visita_unica ON gestion.visita (participacion_id, fecha) WHERE NOT anulada;
CREATE INDEX visita_fecha ON gestion.visita (fecha);

ALTER TABLE gestion.entrega ADD COLUMN visita_id uuid REFERENCES gestion.visita (id);
CREATE INDEX entrega_visita ON gestion.entrega (visita_id);
