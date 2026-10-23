import type { Pool } from 'pg';
import { createTerritorioRepository } from './territorio.repository.js';

export const SECOND_PASS_LAYERS = [
  'rutas-bloques',
  'puntos-topograficos',
  'manzanas',
  'etiquetas-lote',
  'toponimia',
  'hojas-planos',
  'cotas',
] as const;
export type SecondPassLayer = (typeof SECOND_PASS_LAYERS)[number];
export type Bbox = [number, number, number, number];
const SECOND_PASS_LIMIT = 8000;

export function createMunicipalRepository(pool: Pool) {
  return {
    territorio: createTerritorioRepository(pool),
    async cadInventory() {
      const result = await pool.query(`SELECT source,layer,count(*)::int AS total,
        count(geom)::int AS mapped FROM cad_review GROUP BY source,layer ORDER BY source,layer`);
      const audit = await pool.query(
        "SELECT manifest FROM municipal_imports WHERE dataset='cad-reconciliation-v1'",
      );
      return { layers: result.rows, audit: audit.rows[0]?.manifest };
    },
    async cadReview(source: string, layer: string, bbox: Bbox) {
      const result = await pool.query(
        `SELECT properties,ST_AsGeoJSON(geom,8)::json AS geometry
        FROM cad_review WHERE source=$1 AND layer=$2
        AND geom && ST_MakeEnvelope($3,$4,$5,$6,4326) ORDER BY id LIMIT 8001`,
        [source, layer, ...bbox],
      );
      return {
        type: 'FeatureCollection',
        truncated: result.rows.length > 8000,
        features: result.rows.slice(0, 8000).map((r) => ({
          type: 'Feature',
          geometry: r.geometry,
          properties: {
            ...r.properties,
            nombre: r.properties.text || `${r.properties.entityType} · ${r.properties.layer}`,
          },
        })),
      };
    },
    async cartography() {
      const result = await pool.query(`SELECT properties, ST_AsGeoJSON(geom,8)::json AS geometry
        FROM municipal_cartography WHERE geom IS NOT NULL ORDER BY id`);
      const audit = await pool.query(
        "SELECT manifest FROM municipal_imports WHERE dataset='cartography-v1'",
      );
      return {
        type: 'FeatureCollection',
        features: result.rows.map((r) => ({
          type: 'Feature',
          geometry: r.geometry,
          properties: r.properties,
        })),
        audit: audit.rows[0]?.manifest,
      };
    },
    async summary() {
      const [imports, counts] = await Promise.all([
        pool.query(`SELECT dataset,checksum,imported_at AS "importedAt",
          manifest->'sources' AS sources,manifest->'statistics' AS statistics
          FROM municipal_imports ORDER BY imported_at DESC`),
        pool.query(`SELECT category,count(*)::int AS total,
          count(geom)::int AS georeferenced,
          count(*) FILTER(WHERE is_valid=false)::int AS invalid,
          count(*) FILTER(WHERE source_srid IS NULL)::int AS "crsPending"
          FROM cad_features GROUP BY category ORDER BY category`),
      ]);
      return { imports: imports.rows, counts: counts.rows };
    },
    async secondPassSummary() {
      const [audit, counts] = await Promise.all([
        pool.query(`SELECT checksum,imported_at AS "importedAt",manifest
          FROM municipal_imports WHERE dataset='cad-second-pass-v1'`),
        pool.query(`SELECT kind,status,crs_status AS "crsStatus",count(*)::int AS total,
          count(*) FILTER(WHERE NOT is_valid)::int AS invalid
          FROM cad_second_pass GROUP BY kind,status,crs_status ORDER BY kind,status,crs_status`),
      ]);
      const row = audit.rows[0];
      return {
        checksum: row?.checksum ?? null,
        importedAt: row?.importedAt ?? null,
        audit: row?.manifest ?? null,
        counts: counts.rows,
      };
    },
    async secondPass(kind: SecondPassLayer, bbox?: Bbox) {
      const result = await pool.query(
        `SELECT id,kind,status,review_note,source,crs,crs_status,offset_e,offset_n,properties,
          is_valid,validity_reason,ST_AsGeoJSON(geom,8)::json AS geometry,
          round(ST_X(ST_Centroid(geom_original))::numeric,2)::float8 AS utm_e,
          round(ST_Y(ST_Centroid(geom_original))::numeric,2)::float8 AS utm_n
          FROM cad_second_pass WHERE kind=$1
          AND ($2::float8 IS NULL OR geom && ST_MakeEnvelope($2,$3,$4,$5,4326))
          ORDER BY id LIMIT ${SECOND_PASS_LIMIT + 1}`,
        [kind, ...(bbox ?? [null, null, null, null])],
      );
      return {
        type: 'FeatureCollection',
        truncated: result.rows.length > SECOND_PASS_LIMIT,
        features: result.rows.slice(0, SECOND_PASS_LIMIT).map((r) => ({
          type: 'Feature',
          id: r.id,
          geometry: r.geometry,
          properties: {
            ...r.properties,
            id: r.id,
            kind: r.kind,
            status: r.status,
            reviewNote: r.review_note,
            source: r.source,
            crs: r.crs,
            crsStatus: r.crs_status,
            offsetE: r.offset_e,
            offsetN: r.offset_n,
            utm: [r.utm_e, r.utm_n],
            isValid: r.is_valid,
            validityReason: r.validity_reason,
          },
        })),
      };
    },
    async references(category: 'lote_cad' | 'anotacion_ruta') {
      const result = await pool.query(
        `SELECT key,category,layer,text_value AS text,source_refs AS sources,
          ST_AsGeoJSON(geom,8)::json AS geometry FROM cad_features
          WHERE category=$1 AND NOT hidden AND geom IS NOT NULL
          AND source_refs @> '[{"source":"RUTAS CON TIEMPO.dwg"}]'::jsonb
          AND ST_Intersects(geom,ST_MakeEnvelope(-78.56,-5.665,-78.51,-5.615,4326))
          ORDER BY key LIMIT 15001`,
        [category],
      );
      const rows = result.rows.slice(0, 15000);
      return {
        type: 'FeatureCollection',
        truncated: result.rows.length > 15000,
        features: rows.map(({ geometry, ...p }) => ({
          type: 'Feature',
          id: p.key,
          geometry,
          properties: {
            id: p.key,
            nombre: p.text || `Referencia CAD · ${p.layer}`,
            category: p.category,
            layer: p.layer,
            source: 'RUTAS CON TIEMPO.dwg',
            references: p.sources,
            note:
              category === 'lote_cad'
                ? 'Contorno del plano base. No es un predio registrado ni acredita propiedad.'
                : 'Posición del rótulo en el dibujo. No es una parada ni un horario operativo confirmado.',
            isDemo: false,
          },
        })),
      };
    },
  };
}
export type MunicipalRepository = ReturnType<typeof createMunicipalRepository>;
