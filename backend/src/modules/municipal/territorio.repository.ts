import type { Pool } from 'pg';

// Consultas de solo lectura sobre territorio_*. Ninguna respuesta incluye coordenadas
// brutas del DWG, identificadores de archivo privados ni textos retenidos por privacidad.
export const TERRITORIO_KINDS = [
  'manzana',
  'lote',
  'vivienda',
  'calle',
  'sector',
  'ruta',
  'ruta_candidata',
  'punto_topografico',
  'sombreado',
  'hoja',
  'cota',
  'institucion',
  'hidrografia',
  'plano_ubicacion',
] as const;
export type TerritorioKind = (typeof TERRITORIO_KINDS)[number];
export type Bbox = [number, number, number, number];
export const TERRITORIO_LIMIT = 4000;

export function createTerritorioRepository(pool: Pool) {
  return {
    async summary() {
      const [meta, counts, reps, exceptions, conflicts, relations] = await Promise.all([
        pool.query(
          'SELECT checksum,imported_at AS "importedAt",manifest FROM municipal_imports WHERE dataset=\'territorio-unificado-v1\'',
        ),
        pool.query(
          `SELECT kind,count(*)::int AS entidades,
            count(*) FILTER (WHERE provisional)::int AS provisionales,
            sum(num_representaciones)::int AS representaciones
          FROM territorio_entidad GROUP BY kind ORDER BY kind`,
        ),
        pool.query('SELECT count(*)::int AS total FROM territorio_representacion'),
        pool.query(
          `SELECT causa,count(*)::int AS total FROM territorio_excepcion GROUP BY causa ORDER BY causa`,
        ),
        pool.query(
          `SELECT propiedad,estado,count(*)::int AS total FROM territorio_conflicto GROUP BY propiedad,estado ORDER BY 1,2`,
        ),
        pool.query(
          `SELECT tipo,count(*)::int AS total FROM territorio_relacion GROUP BY tipo ORDER BY tipo`,
        ),
      ]);
      const row = meta.rows[0];
      const manifest = (row?.manifest ?? {}) as Record<string, unknown>;
      return {
        checksum: row?.checksum ?? null,
        importedAt: row?.importedAt ?? null,
        counts: counts.rows,
        representaciones: reps.rows[0]?.total ?? 0,
        excepciones: exceptions.rows,
        conflictos: conflicts.rows,
        relaciones: relations.rows,
        identidad: manifest.identidad ?? null,
        privacidad: manifest.privacidad ?? null,
        reglas: (
          await pool.query(
            'SELECT id,version,descripcion,parametros FROM territorio_regla ORDER BY id,version',
          )
        ).rows,
      };
    },
    async entitiesInBbox(kinds: TerritorioKind[], bbox: Bbox) {
      const result = await pool.query(
        `SELECT id,kind,nombre,nombre_normalizado,criterio,estado,provisional,
          num_representaciones,num_atributos,num_conflictos,ST_AsGeoJSON(geom,8)::json AS geometry
        FROM territorio_entidad
        WHERE kind = ANY($1::text[]) AND geom && ST_MakeEnvelope($2,$3,$4,$5,4326)
        ORDER BY kind,id LIMIT ${TERRITORIO_LIMIT + 1}`,
        [kinds, ...bbox],
      );
      const rows = result.rows.slice(0, TERRITORIO_LIMIT);
      return {
        type: 'FeatureCollection',
        truncated: result.rows.length > TERRITORIO_LIMIT,
        features: rows.map(({ geometry, ...p }) => ({
          type: 'Feature',
          id: p.id,
          geometry,
          properties: {
            id: p.id,
            kind: p.kind,
            nombre: p.nombre,
            nombreNormalizado: p.nombre_normalizado,
            criterio: p.criterio,
            estado: p.estado,
            provisional: p.provisional,
            representaciones: p.num_representaciones,
            atributos: p.num_atributos,
            conflictos: p.num_conflictos,
          },
        })),
      };
    },
    async entity(id: string) {
      const base = await pool.query(
        `SELECT id,kind,nombre,nombre_normalizado,criterio,estado,provisional,referencia,
          num_representaciones,num_atributos,num_conflictos,ST_AsGeoJSON(geom,8)::json AS geometry
        FROM territorio_entidad WHERE id=$1`,
        [id],
      );
      const entity = base.rows[0];
      if (!entity) return null;
      const [reps, attrs, relations, conflicts, exceptions] = await Promise.all([
        pool.query(
          `SELECT key,source,ref,layer,entity_type,kind,geom_type,crs_status,offset_e,offset_n,desviacion_m,origen,texto
          FROM territorio_representacion WHERE entidad_id=$1 ORDER BY key`,
          [id],
        ),
        pool.query(
          `SELECT clave,valor,tipo,fuente,justificacion FROM territorio_atributo WHERE entidad_id=$1 ORDER BY clave,id`,
          [id],
        ),
        pool.query(
          `SELECT id,tipo,desde,hacia,evidencia,regla FROM territorio_relacion WHERE desde=$1 OR hacia=$1 ORDER BY tipo,id`,
          [id],
        ),
        pool.query(
          `SELECT id,propiedad,estado,valores,evidencia FROM territorio_conflicto WHERE entidad_id=$1 ORDER BY id`,
          [id],
        ),
        pool.query(
          `SELECT id,causa,datos,nota FROM territorio_excepcion WHERE entidad_id=$1 ORDER BY id`,
          [id],
        ),
      ]);
      const relatedIds = [
        ...new Set(relations.rows.map((r) => (r.desde === id ? r.hacia : r.desde)) as string[]),
      ];
      const names = relatedIds.length
        ? await pool.query(
            'SELECT id,nombre,kind FROM territorio_entidad WHERE id = ANY($1::text[])',
            [relatedIds],
          )
        : { rows: [] as { id: string; nombre: string; kind: string }[] };
      const byId = new Map(names.rows.map((n) => [n.id, n]));
      const reglas = await pool.query(
        'SELECT id,version,descripcion FROM territorio_regla ORDER BY id,version',
      );
      return {
        id: entity.id,
        kind: entity.kind,
        nombre: entity.nombre,
        nombreNormalizado: entity.nombre_normalizado,
        criterio: entity.criterio,
        estado: entity.estado,
        provisional: entity.provisional,
        referencia: entity.referencia,
        geometry: entity.geometry,
        representaciones: reps.rows.map((r) => ({
          key: r.key,
          fuente: r.source,
          referencia: r.ref,
          capa: r.layer,
          entidadDxf: r.entity_type,
          clase: r.kind,
          tipoGeometria: r.geom_type,
          crs: r.crs_status,
          traslacion: [r.offset_e, r.offset_n],
          desviacionM: r.desviacion_m,
          origen: r.origen,
          texto: r.texto,
        })),
        atributos: attrs.rows.map((a) => ({
          clave: a.clave,
          valor: a.valor,
          tipo: a.tipo,
          fuente: a.fuente,
          justificacion: a.justificacion,
        })),
        relaciones: relations.rows.map((r) => {
          const other = byId.get(r.desde === id ? r.hacia : r.desde);
          return {
            id: r.id,
            tipo: r.tipo,
            sentido: r.desde === id ? 'saliente' : 'entrante',
            entidad: other ? { id: other.id, nombre: other.nombre, kind: other.kind } : null,
            evidencia: r.evidencia,
            regla: r.regla,
          };
        }),
        conflictos: conflicts.rows.map((c) => ({
          id: c.id,
          propiedad: c.propiedad,
          estado: c.estado,
          valores: c.valores,
          evidencia: c.evidencia,
        })),
        excepciones: exceptions.rows.map((x) => ({
          id: x.id,
          causa: x.causa,
          datos: x.datos,
          nota: x.nota,
        })),
        reglas: reglas.rows,
        totales: {
          representaciones: entity.num_representaciones,
          atributos: entity.num_atributos,
          conflictos: entity.num_conflictos,
        },
      };
    },
    async representationsOf(id: string) {
      const result = await pool.query(
        `SELECT key,kind,crs_status,desviacion_m,ST_AsGeoJSON(geom,8)::json AS geometry
        FROM territorio_representacion WHERE entidad_id=$1 ORDER BY key LIMIT 500`,
        [id],
      );
      return {
        type: 'FeatureCollection',
        features: result.rows.map((r) => ({
          type: 'Feature',
          id: r.key,
          geometry: r.geometry,
          properties: { key: r.key, clase: r.kind, crs: r.crs_status, desviacionM: r.desviacion_m },
        })),
      };
    },
  };
}
export type TerritorioRepository = ReturnType<typeof createTerritorioRepository>;
