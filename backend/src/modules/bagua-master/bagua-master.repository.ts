import type { Pool } from 'pg';

// BAGUA MASTER: consultas de solo lectura sobre el esquema bagua_master. No lee ni escribe
// tablas del WebGIS municipal. Ninguna respuesta incluye rutas locales de la descarga.
export const BAGUA_MASTER_TABLES = [
  'red_vial',
  'conector',
  'edificio',
  'parte_edificio',
  'uso_suelo',
  'agua',
  'terreno',
  'lugar',
] as const;
export type BaguaMasterTable = (typeof BAGUA_MASTER_TABLES)[number];

// Columnas de atributo por tabla: solo las que existen en el esquema (sin inventar campos).
const ELEMENT_COLUMNS: Record<BaguaMasterTable, string[]> = {
  red_vial: ['id', 'clase', 'subclase', 'nombre', 'nombres', 'atributos', 'fuentes'],
  conector: ['id', 'atributos', 'fuentes'],
  edificio: ['id', 'clase', 'subtipo', 'nombre', 'altura_m', 'num_pisos', 'atributos', 'fuentes'],
  parte_edificio: ['id', 'clase', 'atributos', 'fuentes'],
  uso_suelo: ['id', 'clase', 'subtipo', 'nombre', 'atributos', 'fuentes'],
  agua: ['id', 'clase', 'subtipo', 'nombre', 'atributos', 'fuentes'],
  terreno: ['id', 'clase', 'subtipo', 'nombre', 'atributos', 'fuentes'],
  lugar: ['id', 'categoria', 'nombre', 'nombres', 'atributos', 'fuentes'],
};

export function createBaguaMasterRepository(pool: Pool) {
  return {
    async summary() {
      const [version, sets, counts, heights] = await Promise.all([
        pool.query(
          `SELECT version_overture,esquema_overture,atribucion,extraccion_utc,descarga_bbox,ventana_urbana,
            manifiesto_sha256,paquete_sha256,importado_en,resumen FROM bagua_master.version WHERE id='bagua-master'`,
        ),
        pool.query(
          `SELECT nombre,tema,tipo,archivo,sha256,filas,ids_unicos,geometria_nula,geometria_vacia,geometria_invalida,
            tipos_geometria,fuentes_primarias FROM bagua_master.conjunto ORDER BY nombre`,
        ),
        pool.query(
          `SELECT 'red_vial' AS tabla,count(*)::int AS total,count(*) FILTER (WHERE NOT geom_valida)::int AS invalidas FROM bagua_master.red_vial
           UNION ALL SELECT 'conector',count(*)::int,count(*) FILTER (WHERE NOT geom_valida)::int FROM bagua_master.conector
           UNION ALL SELECT 'edificio',count(*)::int,count(*) FILTER (WHERE NOT geom_valida)::int FROM bagua_master.edificio
           UNION ALL SELECT 'parte_edificio',count(*)::int,count(*) FILTER (WHERE NOT geom_valida)::int FROM bagua_master.parte_edificio
           UNION ALL SELECT 'uso_suelo',count(*)::int,count(*) FILTER (WHERE NOT geom_valida)::int FROM bagua_master.uso_suelo
           UNION ALL SELECT 'agua',count(*)::int,count(*) FILTER (WHERE NOT geom_valida)::int FROM bagua_master.agua
           UNION ALL SELECT 'terreno',count(*)::int,count(*) FILTER (WHERE NOT geom_valida)::int FROM bagua_master.terreno
           UNION ALL SELECT 'lugar',count(*)::int,count(*) FILTER (WHERE NOT geom_valida)::int FROM bagua_master.lugar
           ORDER BY 1`,
        ),
        pool.query(
          `SELECT count(*)::int AS edificios,count(altura_m)::int AS con_altura,count(num_pisos)::int AS con_pisos,
             (SELECT count(*)::int FROM bagua_master.altura_estimada) AS con_estimacion,
             (SELECT count(*)::int FROM bagua_master.altura_simulada s
               LEFT JOIN bagua_master.altura_estimada a ON a.edificio_id=s.edificio_id
               WHERE a.edificio_id IS NULL) AS con_simulacion,
             (SELECT coalesce(json_agg(t), '[]'::json) FROM (
                SELECT fuente,extract(year FROM fecha)::int AS anio,count(*)::int AS total
                FROM bagua_master.altura_estimada GROUP BY fuente,extract(year FROM fecha) ORDER BY fuente
             ) t) AS fuentes_estimacion
           FROM bagua_master.edificio`,
        ),
      ]);
      const row = version.rows[0];
      return {
        modulo: 'BAGUA MASTER',
        version: row
          ? {
              overture: row.version_overture,
              esquema: row.esquema_overture,
              atribucion: row.atribucion,
              extraccionUtc: row.extraccion_utc,
              descargaBbox: row.descarga_bbox,
              ventanaUrbana: row.ventana_urbana,
              importadoEn: row.importado_en,
              manifiestoSha256: row.manifiesto_sha256,
              paqueteSha256: row.paquete_sha256,
            }
          : null,
        conjuntos: sets.rows.map((s) => ({
          nombre: s.nombre,
          tema: s.tema,
          tipo: s.tipo,
          archivo: s.archivo,
          sha256: s.sha256,
          filas: s.filas,
          idsUnicos: s.ids_unicos,
          geometriaNula: s.geometria_nula,
          geometriaVacia: s.geometria_vacia,
          geometriaInvalida: s.geometria_invalida,
          tiposGeometria: s.tipos_geometria,
          fuentesPrimarias: s.fuentes_primarias,
        })),
        elementos: counts.rows,
        // Conserva las alturas originales y contabiliza aparte la capa derivada.
        alturas: {
          edificios: heights.rows[0].edificios,
          conAltura: heights.rows[0].con_altura,
          conPisos: heights.rows[0].con_pisos,
          conEstimacion: heights.rows[0].con_estimacion,
          conSimulacion: heights.rows[0].con_simulacion,
          fuentesEstimacion: heights.rows[0].fuentes_estimacion,
        },
      };
    },
    async heightMap() {
      const result = await pool.query(
        `SELECT e.id,coalesce(e.altura_m,a.altura_m,s.altura_m) AS altura_m,
                CASE WHEN e.altura_m IS NOT NULL THEN 'publicada'
                     WHEN a.edificio_id IS NOT NULL THEN 'estimada' ELSE 'simulada' END AS tipo,
                ST_AsGeoJSON(e.geom,7)::json AS geometry
         FROM bagua_master.edificio e
         LEFT JOIN bagua_master.altura_estimada a ON e.id=a.edificio_id
         LEFT JOIN bagua_master.altura_simulada s ON e.id=s.edificio_id
         WHERE e.geom_valida AND coalesce(e.altura_m,a.altura_m,s.altura_m)>0 ORDER BY e.id`,
      );
      return {
        type: 'FeatureCollection',
        features: result.rows.map((r) => ({
          type: 'Feature',
          id: r.id,
          geometry: r.geometry,
          properties: { id: r.id, altura_m: r.altura_m, tipo: r.tipo },
        })),
      };
    },
    async element(table: BaguaMasterTable, id: string) {
      const columns = ELEMENT_COLUMNS[table];
      const result = await pool.query(
        `SELECT ${columns.join(',')},archivo_overture,geom_valida,
            ST_AsGeoJSON(geom,8)::json AS geometria,
            CASE WHEN ST_Dimension(geom_utm)=1 THEN round(ST_Length(geom_utm))::int END AS longitud_m,
            CASE WHEN ST_Dimension(geom_utm)=2 THEN round(ST_Area(geom_utm))::int END AS area_m2
          FROM bagua_master.${table} WHERE id=$1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      // Nombre complementario (conjunto independiente): nunca reemplaza al de Overture.
      const complement =
        table === 'red_vial'
          ? (
              await pool.query(
                `SELECT nombre,nombre_documental,origen,nivel,respaldo_rpu,evidencia,fuente_archivo,fuente_sha256,
                    version_overture,aviso
                 FROM bagua_master.nombre_complementario WHERE segmento_id=$1`,
                [id],
              )
            ).rows[0]
          : undefined;
      const estimate =
        table === 'edificio'
          ? (
              await pool.query(
                `SELECT altura_m,cobertura,muestras,fuente,fecha::text,fecha_precision,licencia,metodo
             FROM bagua_master.altura_estimada WHERE edificio_id=$1`,
                [id],
              )
            ).rows[0]
          : undefined;
      const simulated =
        table === 'edificio' && !estimate && row.altura_m == null
          ? (
              await pool.query(
                `SELECT altura_m,metodo,vecinos,referencia_m,ghsl_m FROM bagua_master.altura_simulada WHERE edificio_id=$1`,
                [id],
              )
            ).rows[0]
          : undefined;
      return {
        alturaSimulada: simulated
          ? {
              alturaM: simulated.altura_m as number,
              metodo: simulated.metodo as string,
              vecinos: simulated.vecinos as number,
              referenciaM: simulated.referencia_m as number,
              ghslM: simulated.ghsl_m as number | null,
            }
          : null,
        alturaEstimada: estimate
          ? {
              alturaM: estimate.altura_m as number,
              cobertura: estimate.cobertura as number,
              muestras: estimate.muestras as number,
              fuente: estimate.fuente as string,
              fecha: estimate.fecha as string,
              fechaPrecision: estimate.fecha_precision as string,
              licencia: estimate.licencia as string,
              metodo: estimate.metodo as string,
            }
          : null,
        tabla: table,
        id: row.id,
        tipo: row.clase ?? null,
        subtipo: row.subtipo ?? null,
        subclase: row.subclase ?? null,
        categoria: row.categoria ?? null,
        nombre: row.nombre ?? null,
        nombres: row.nombres ?? {},
        alturaM: row.altura_m ?? null,
        numPisos: row.num_pisos ?? null,
        longitudM: row.longitud_m ?? null,
        areaM2: row.area_m2 ?? null,
        geometriaValida: row.geom_valida,
        geometria: row.geometria,
        atributos: row.atributos,
        fuentes: row.fuentes,
        archivoOverture: row.archivo_overture,
        nombreComplementario: complement
          ? {
              nombre: complement.nombre as string,
              nombreDocumental: complement.nombre_documental as string,
              origen: complement.origen as string,
              nivel: complement.nivel as 'texto' | 'continuidad',
              respaldoRpu: complement.respaldo_rpu as string,
              evidencia: complement.evidencia,
              fuente: {
                archivo: complement.fuente_archivo as string,
                sha256: complement.fuente_sha256 as string,
              },
              versionOverture: complement.version_overture as string,
              aviso: complement.aviso as string,
            }
          : null,
      };
    },
    async search(query: string) {
      const pattern = `%${query.toLowerCase().replace(/[%_]/g, (c) => `\\${c}`)}%`;
      const result = await pool.query(
        `SELECT * FROM (
           SELECT 'lugar' AS tabla,id,categoria AS tipo,nombre,ST_AsGeoJSON(geom,6)::json AS geometria
             FROM bagua_master.lugar WHERE lower(nombre) LIKE $1 AND nombre IS NOT NULL
           UNION ALL
           -- Una calle aparece una sola vez aunque Overture la divida en varios segmentos:
           -- se devuelve el punto medio de su segmento más largo.
           -- Nombre efectivo: el de Overture; si falta, el complementario documental (DWG de Tomaque).
           (SELECT DISTINCT ON (nombre) 'red_vial',id,clase,nombre,
               ST_AsGeoJSON(ST_LineInterpolatePoint(geom,0.5),6)::json
             FROM (
               SELECT r.id,r.clase,r.nombre,r.geom,r.geom_utm FROM bagua_master.red_vial r
                 WHERE r.nombre IS NOT NULL
               UNION ALL
               SELECT r.id,r.clase,c.nombre,r.geom,r.geom_utm FROM bagua_master.nombre_complementario c
                 JOIN bagua_master.red_vial r ON r.id=c.segmento_id WHERE r.nombre IS NULL
             ) v WHERE lower(nombre) LIKE $1 AND GeometryType(geom)='LINESTRING'
             ORDER BY nombre, ST_Length(geom_utm) DESC)
         ) r ORDER BY nombre LIMIT 25`,
        [pattern],
      );
      return result.rows;
    },
    /** Rutas municipales documentadas (fase 2): fichas sin geometría, con su caja envolvente. */
    async routes() {
      const result = await pool.query(
        `SELECT codigo,nombre,color,estado,fuente_archivo,fuente_sha256,nota,advertencias,sectores,crs,
            segmentos,longitud_trazos_m::float8 AS longitud_trazos_m,significado_longitud,horario_estado,
            sentido_estado,flechas,procedencia,aviso,
            ARRAY[ST_XMin(geom),ST_YMin(geom),ST_XMax(geom),ST_YMax(geom)] AS bbox
         FROM bagua_master.ruta ORDER BY orden`,
      );
      return {
        aviso: result.rows[0]?.aviso ?? null,
        rutas: result.rows.map((row) => ({
          codigo: row.codigo as string,
          nombre: row.nombre as string,
          color: row.color as string,
          estado: row.estado as 'georreferenciada' | 'revision',
          fuenteArchivo: row.fuente_archivo as string,
          fuenteSha256: row.fuente_sha256 as string,
          nota: row.nota as string,
          advertencias: row.advertencias as string[],
          sectores: row.sectores as string[],
          crs: row.crs as string,
          segmentos: row.segmentos as number,
          longitudTrazosM: row.longitud_trazos_m as number,
          significadoLongitud: row.significado_longitud as string,
          horarioEstado: row.horario_estado as string,
          sentidoEstado: row.sentido_estado as string,
          flechas: row.flechas as Record<string, number>,
          procedencia: row.procedencia as {
            trazos: string;
            flechas: string[];
            marcadores: string[];
          },
          bbox: (row.bbox as number[]).map(Number),
        })),
      };
    },
    /** Geometrías de las rutas para dibujarlas: trazos originales, flechas verificadas y marcadores. */
    async routeMap() {
      const [lines, arrows, markers] = await Promise.all([
        pool.query(
          `SELECT codigo,estado,color,ST_AsGeoJSON(geom,8)::json AS geometry FROM bagua_master.ruta ORDER BY orden`,
        ),
        // Solo las flechas verificadas y no duplicadas; donde una ruta no tiene, no se inventan.
        pool.query(
          `SELECT id,ruta_codigo,rumbo::float8 AS rumbo,ST_AsGeoJSON(geom,8)::json AS geometry
             FROM bagua_master.ruta_flecha WHERE verificada AND duplicada_de IS NULL ORDER BY id`,
        ),
        pool.query(
          `SELECT id,ruta_codigo,tipo,nombre,ST_AsGeoJSON(geom,8)::json AS geometry
             FROM bagua_master.ruta_marcador ORDER BY id`,
        ),
      ]);
      const collection = (
        rows: Record<string, unknown>[],
        pick: (row: Record<string, unknown>) => object,
      ) => ({
        type: 'FeatureCollection' as const,
        features: rows.map((row) => ({
          type: 'Feature' as const,
          geometry: row.geometry,
          properties: pick(row),
        })),
      });
      return {
        trazos: collection(lines.rows, (r) => ({
          ruta: r.codigo,
          estado: r.estado,
          color: r.color,
        })),
        flechas: collection(arrows.rows, (r) => ({
          id: r.id,
          ruta: r.ruta_codigo,
          rumbo: r.rumbo,
        })),
        marcadores: collection(markers.rows, (r) => ({
          id: r.id,
          ruta: r.ruta_codigo,
          tipo: r.tipo,
          nombre: r.nombre,
        })),
      };
    },
  };
}
export type BaguaMasterRepository = ReturnType<typeof createBaguaMasterRepository>;
