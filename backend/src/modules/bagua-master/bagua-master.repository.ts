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
  const complementSummary = async () => {
    const result = await pool.query(
      `SELECT fuente,confianza_geo,licencia,count(*)::int AS total,
              count(*) FILTER (WHERE origen_altura='estimada_default')::int AS altura_por_defecto,
              max(version_fusion) AS version_fusion
       FROM bagua_master.edificio_complemento GROUP BY fuente,confianza_geo,licencia ORDER BY fuente`,
    );
    return {
      total: result.rows.reduce((sum, r) => sum + (r.total as number), 0),
      versionFusion: (result.rows[0]?.version_fusion as string | undefined) ?? null,
      fuentes: result.rows.map((r) => ({
        fuente: r.fuente as string,
        confianza: r.confianza_geo as 'alta' | 'media' | 'baja',
        licencia: r.licencia as string,
        total: r.total as number,
        alturaPorDefecto: r.altura_por_defecto as number,
      })),
    };
  };

  return {
    async summary() {
      const [version, sets, counts, heights, complemento] = await Promise.all([
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
        complementSummary(),
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
        complemento,
      };
    },
    async heightMap() {
      const result = await pool.query(
        `SELECT e.id,coalesce(e.altura_m,a.altura_m,s.altura_m) AS altura_m,
                CASE WHEN e.altura_m IS NOT NULL THEN 'publicada'
                     WHEN a.edificio_id IS NOT NULL THEN 'estimada' ELSE 'simulada' END AS tipo,
                -- Forma cartográfica recortada contra la calzada si existe (igual que las teselas 2D).
                ST_AsGeoJSON(coalesce(m.geom,e.geom),7)::json AS geometry
         FROM bagua_master.edificio e
         LEFT JOIN bagua_master.edificio_geom_mapa m ON m.edificio_id=e.id
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
    /**
     * Capa complementaria de edificaciones (OSM, Microsoft, Google, presencia satelital): huellas
     * que Overture no tiene. Aditiva, solo lectura; nunca sustituye a `edificio` ni se vincula a
     * predios (los vínculos espaciales referencian únicamente edificios de Overture).
     */
    async complementMap() {
      const result = await pool.query(
        `SELECT id,fuente,confianza_geo,altura_m,origen_altura,round(area_m2)::int AS area_m2,
                ST_AsGeoJSON(geom,7)::json AS geometry
         FROM bagua_master.edificio_complemento ORDER BY id`,
      );
      return {
        type: 'FeatureCollection',
        features: result.rows.map((r) => ({
          type: 'Feature',
          id: r.id,
          geometry: r.geometry,
          properties: {
            id: r.id,
            fuente: r.fuente,
            confianza: r.confianza_geo,
            altura_m: r.altura_m,
            origen_altura: r.origen_altura,
            area_m2: r.area_m2,
          },
        })),
      };
    },
    complementSummary,
    /** Programación de las rutas: servicio, días, ventana horaria, turno, sectores y operador. */
    async servicePrograms() {
      const result = await pool.query(
        `SELECT g.id,g.ruta_codigo AS ruta,r.nombre AS "rutaNombre",r.color,g.servicio,g.nombre,g.dias,
                to_char(g.hora_inicio,'HH24:MI') AS "horaInicio",to_char(g.hora_fin,'HH24:MI') AS "horaFin",
                g.turno,g.sectores,g.vehiculo,g.operador,g.nota,g.sintetico,
                (SELECT count(*)::int FROM bagua_master.ruta_hora_paso h WHERE h.ruta_codigo=g.ruta_codigo) AS "tiemposPlano"
         FROM bagua_master.ruta_programacion g JOIN bagua_master.ruta r ON r.codigo=g.ruta_codigo
         WHERE g.vigente ORDER BY r.orden,g.servicio`,
      );
      return { programaciones: result.rows };
    },
    /** Avisos del servicio vigentes o que empiezan en las próximas dos semanas. */
    async serviceNotices() {
      const result = await pool.query(
        `SELECT id,tipo,titulo,mensaje,programaciones,desde::text,hasta::text FROM bagua_master.aviso_servicio
         WHERE NOT retirado AND hasta >= (now() AT TIME ZONE 'America/Lima')::date
           AND desde <= (now() AT TIME ZONE 'America/Lima')::date + 14
         ORDER BY desde,creado_en`,
      );
      return { avisos: result.rows };
    },
    /** Servicios que pasan por un punto y hora estimada de paso (función bagua_master.recoleccion_en_punto). */
    async serviceAt(lon: number, lat: number) {
      // La hora habitual suma a la hora estimada el atraso mediano observado en el punto de control
      // más cercano durante las últimas semanas (solo con al menos 3 recorridos registrados).
      const result = await pool.query(
        `WITH pt AS (SELECT ST_SetSRID(ST_MakePoint($1,$2),4326) AS g)
         SELECT x.programacion_id AS id,x.ruta_codigo AS ruta,x.ruta_nombre AS "rutaNombre",x.color,x.servicio,x.nombre,x.dias,
                to_char(x.hora_inicio,'HH24:MI') AS "horaInicio",to_char(x.hora_fin,'HH24:MI') AS "horaFin",x.turno,
                x.operador,x.vehiculo,x.distancia_m::float8 AS "distanciaM",
                to_char(x.hora_estimada,'HH24:MI') AS "horaEstimada",x.base,
                CASE WHEN a.recorridos >= 3 THEN to_char(('2000-01-01'::timestamp + make_interval(secs =>
                  round(extract(epoch FROM x.hora_estimada + make_interval(mins => a.minutos)) / 300) * 300))::time,'HH24:MI') END AS "horaHabitual",
                coalesce(a.recorridos,0) AS recorridos,
                (SELECT coalesce(json_agg(json_build_object('id',v.id,'tipo',v.tipo,'titulo',v.titulo,'mensaje',v.mensaje,
                    'desde',v.desde,'hasta',v.hasta) ORDER BY v.desde),'[]')
                   FROM bagua_master.aviso_servicio v
                  WHERE NOT v.retirado AND v.hasta >= (now() AT TIME ZONE 'America/Lima')::date
                    AND v.desde <= (now() AT TIME ZONE 'America/Lima')::date + 14
                    AND (cardinality(v.programaciones)=0 OR x.programacion_id=ANY(v.programaciones))) AS avisos
         FROM pt CROSS JOIN LATERAL bagua_master.recoleccion_en_punto(pt.g) x
         LEFT JOIN LATERAL bagua_master.atraso_habitual(x.programacion_id, pt.g) a ON true
         ORDER BY x.servicio,x.hora_estimada`,
        [lon, lat],
      );
      return { servicios: result.rows };
    },
    /** Sticker QR escaneado sin sesión: solo el horario de recolección de ese punto, sin datos personales. */
    async qrSchedule(codigo: string) {
      const row = (
        await pool.query(
          `SELECT q.codigo,q.estado,p.sector,p.ubicacion FROM gestion.codigo_qr q
           JOIN gestion.predio p ON p.id=q.predio_id WHERE q.codigo=$1`,
          [codigo],
        )
      ).rows[0];
      if (!row) return null;
      const point = row.ubicacion as { coordinates: [number, number] } | null;
      const servicios =
        row.estado === 'activo' && point
          ? (await this.serviceAt(point.coordinates[0], point.coordinates[1])).servicios
          : [];
      return {
        codigo: row.codigo as string,
        activo: row.estado === 'activo',
        sector: row.sector as string | null,
        servicios,
      };
    },
    /** Infraestructura del servicio (contenedores, puntos limpios, centro de acopio, planta). */
    async infrastructure() {
      const result = await pool.query(
        `SELECT id,tipo,nombre,horario,materiales,ST_AsGeoJSON(geom,7)::json AS geometry
         FROM bagua_master.infraestructura ORDER BY id`,
      );
      return {
        type: 'FeatureCollection',
        features: result.rows.map((r) => ({
          type: 'Feature',
          id: r.id,
          geometry: r.geometry,
          properties: { id: r.id, tipo: r.tipo, nombre: r.nombre },
        })),
      };
    },
    async infrastructureElement(id: string) {
      const row = (
        await pool.query(
          `SELECT id,tipo,nombre,descripcion,horario,materiales,sintetico,ST_AsGeoJSON(geom,8)::json AS geometria
           FROM bagua_master.infraestructura WHERE id=$1`,
          [id],
        )
      ).rows[0];
      if (!row) return null;
      return {
        tabla: 'infraestructura' as const,
        id: row.id as string,
        tipo: row.tipo as string,
        subtipo: null,
        subclase: null,
        categoria: null,
        nombre: row.nombre as string,
        nombres: {},
        alturaM: null,
        numPisos: null,
        alturaSimulada: null,
        alturaEstimada: null,
        longitudM: null,
        areaM2: null,
        geometriaValida: true,
        geometria: row.geometria,
        atributos: {},
        fuentes: [],
        archivoOverture: null,
        nombreComplementario: null,
        infraestructura: {
          descripcion: row.descripcion as string,
          horario: row.horario as string,
          materiales: row.materiales as string[],
          sintetico: row.sintetico as boolean,
        },
      };
    },
    /**
     * Correcciones cartográficas locales vigentes (bagua_master.correccion), listas para dibujar:
     * qué ocultar, dónde quedan los lugares movidos y qué edificaciones se agregaron. Sin autor
     * ni motivo: esos datos solo se ven con sesión en /api/gestion/correcciones-mapa.
     */
    async corrections() {
      const result = await pool.query(
        `SELECT c.id,c.tabla,c.elemento_id,c.accion,c.nombre,l.nombre AS lugar_nombre,l.categoria,
                round(ST_Area(ST_Transform(c.geom,32717)))::int AS area_m2,
                ST_AsGeoJSON(c.geom,7)::json AS geometry
         FROM bagua_master.correccion c
         LEFT JOIN bagua_master.lugar l ON c.tabla='lugar' AND l.id=c.elemento_id
         WHERE c.anulada_en IS NULL ORDER BY c.creado_en`,
      );
      const ocultos: Record<'lugar' | 'edificio' | 'edificio_complemento', string[]> = {
        lugar: [],
        edificio: [],
        edificio_complemento: [],
      };
      const moved: unknown[] = [];
      const added: unknown[] = [];
      for (const r of result.rows) {
        if (r.accion === 'ocultar') ocultos[r.tabla as keyof typeof ocultos].push(r.elemento_id);
        else if (r.accion === 'mover')
          moved.push({
            type: 'Feature',
            id: r.elemento_id,
            geometry: r.geometry,
            properties: { id: r.elemento_id, nombre: r.lugar_nombre, categoria: r.categoria },
          });
        else
          added.push({
            type: 'Feature',
            id: r.id,
            geometry: r.geometry,
            properties: { id: r.id, nombre: r.nombre, area_m2: r.area_m2, altura_m: 3 },
          });
      }
      return {
        ocultos,
        lugaresMovidos: { type: 'FeatureCollection', features: moved },
        edificiosAgregados: { type: 'FeatureCollection', features: added },
      };
    },
    async complementElement(id: string) {
      const result = await pool.query(
        `SELECT id,fuente,confianza_geo,confianza_valor,registro_fuente,round(area_m2)::int AS area_m2,regularizacion,
                atributos,altura_m,origen_altura,altura_cobertura,altura_muestras,licencia,version_fusion,
                ST_AsGeoJSON(geom,8)::json AS geometria
         FROM bagua_master.edificio_complemento WHERE id=$1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        tabla: 'edificio_complemento' as const,
        id: row.id as string,
        tipo:
          ((row.atributos as Record<string, string>).osm_building as string | undefined) ??
          'building',
        subtipo: null,
        subclase: null,
        categoria: null,
        nombre: ((row.atributos as Record<string, string>).nombre as string | undefined) ?? null,
        nombres: {},
        alturaM: null,
        numPisos: null,
        alturaSimulada: null,
        alturaEstimada: null,
        longitudM: null,
        areaM2: row.area_m2 as number,
        geometriaValida: true,
        geometria: row.geometria,
        atributos: {},
        fuentes: [],
        archivoOverture: null,
        nombreComplementario: null,
        complemento: {
          fuente: row.fuente as string,
          confianzaGeo: row.confianza_geo as 'alta' | 'media' | 'baja',
          confianzaValor: (row.confianza_valor as number | null) ?? null,
          registroFuente: (row.registro_fuente as string | null) ?? null,
          regularizacion: row.regularizacion as string,
          alturaM: row.altura_m as number,
          origenAltura: row.origen_altura as 'google_temporal' | 'estimada_default' | 'dron_dsm',
          alturaCobertura: (row.altura_cobertura as number | null) ?? null,
          alturaMuestras: (row.altura_muestras as number | null) ?? null,
          licencia: row.licencia as string,
          versionFusion: row.version_fusion as string,
        },
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
           -- Los lugares respetan las correcciones locales: los inexistentes no salen y los movidos
           -- se ubican donde se corrigieron.
           SELECT 'lugar' AS tabla,l.id,l.categoria AS tipo,l.nombre,
                  ST_AsGeoJSON(coalesce(m.geom,l.geom),6)::json AS geometria
             FROM bagua_master.lugar l
             LEFT JOIN bagua_master.correccion m ON m.tabla='lugar' AND m.elemento_id=l.id
                  AND m.accion='mover' AND m.anulada_en IS NULL
             WHERE lower(l.nombre) LIKE $1 AND l.nombre IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM bagua_master.correccion o WHERE o.tabla='lugar'
                  AND o.elemento_id=l.id AND o.accion='ocultar' AND o.anulada_en IS NULL)
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
