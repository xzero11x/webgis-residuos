import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, SOURCE, transaction } from './gestion.repository.js';
import { SELECTIVE } from './gestion.operacion.js';
import { createCode } from './gestion.qr.js';
import type { User } from './gestion.schema.js';

// Padrón del programa de segregación: carga del Excel de la Gerencia y empadronamiento en campo.
//
// El importador acepta el archivo como venga (las columnas se eligen en pantalla), valida fila por
// fila y deja corregir sin volver a empezar. Reconoce lo que ya existe (mismo código de padrón,
// misma dirección, mismo DNI) para actualizar en vez de duplicar, y ubica cada dirección nueva entre
// los predios conocidos de la misma calle. Un lote se puede revertir mientras nadie lo haya usado.

export const CONSENT_VERSION = 'v1-2026-11';
const PREFIX = { organicos: 'ORG', reciclables: 'REC' } as const;
type Kind = keyof typeof PREFIX;

// ---------------------------------------------------------------- direcciones
export const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STREET_TYPES: [RegExp, string][] = [
  [/^(jr|jiron)\b\.?\s*/, 'jr '],
  [/^(av|avda|avenida)\b\.?\s*/, 'av '],
  [/^(psje|pje|pasaje)\b\.?\s*/, 'psje '],
  [/^(ca|calle|cl)\b\.?\s*/, 'calle '],
  [/^(prol|prolongacion)\b\.?\s*/, 'prol '],
  [/^(carr|carretera)\b\.?\s*/, 'carr '],
];
/**
 * «JR. AMAZONAS N° 345», «Jirón Amazonas 345» y «jr amazonas 345» → { calle: 'jr amazonas', numero: 345 }.
 * El número de puerta es el último número que no forma parte del nombre («Av. 28 de Julio 792»).
 */
export function parseAddress(raw: string) {
  let s = strip(raw)
    .replace(/\bn\s*[°º]/g, ' ')
    .replace(/[.,;:()]/g, ' ')
    .replace(/\b(nro|num|numero)\b/g, ' ')
    .replace(/[#°º]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, t] of STREET_TYPES)
    if (re.test(s)) {
      s = s.replace(re, t);
      break;
    }
  const tokens = s.split(' ');
  let index = -1;
  for (let i = tokens.length - 1; i >= 1; i--)
    if (/^\d{1,5}(-?[a-z])?$/.test(tokens[i]!) && tokens[i + 1] !== 'de') {
      index = i;
      break;
    }
  if (index < 0) return { calle: tokens.join(' '), numero: null as number | null, interior: '' };
  return {
    calle: tokens.slice(0, index).join(' '),
    numero: Number(tokens[index]!.replace(/\D/g, '')),
    // «413-A»: la letra distingue otra puerta o interior del mismo número.
    interior: tokens[index]!.replace(/[^a-z]/g, ''),
  };
}
const keyOf = (a: ReturnType<typeof parseAddress>) => `${a.calle}|${a.numero ?? ''}${a.interior}`;
export const addressKey = (raw: string) => {
  return keyOf(parseAddress(raw));
};
/** DNI de 8 cifras (Excel suele borrar el cero inicial) o RUC de 11. */
export function normalizeDocument(raw: string | undefined | null) {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return { value: null as string | null, fixed: false, valid: true };
  if (digits.length === 7) return { value: `0${digits}`, fixed: true, valid: true };
  return { value: digits, fixed: false, valid: digits.length === 8 || digits.length === 11 };
}
const nameKey = (s: string) =>
  strip(s)
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const isCompany = (name: string, doc: string | null) =>
  /\b(s\.?a\.?c|e\.?i\.?r\.?l|s\.?r\.?l|s\.?a)\.?$/i.test(name.trim()) || doc?.length === 11;

// ---------------------------------------------------------------- entrada
const rowInput = z
  .object({
    fila: z.number().int().min(1).max(100000),
    codigo: z.string().trim().max(30).default(''),
    direccion: z.string().trim().max(200).default(''),
    representante: z.string().trim().max(160).default(''),
    dni: z.string().trim().max(20).default(''),
    habitantes: z.string().trim().max(10).default(''),
    sector: z.string().trim().max(80).default(''),
    establecimiento: z.string().trim().max(160).default(''),
    tipoEstablecimiento: z.string().trim().max(80).default(''),
  })
  .strict();
export const importInput = z
  .object({
    servicio: z.enum(['organicos', 'reciclables']),
    tipoGenerador: z.enum(['domiciliario', 'no_domiciliario']),
    archivo: z.string().trim().min(1).max(200),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    filas: z.array(rowInput).min(1).max(3000),
  })
  .strict();
type ImportInput = z.infer<typeof importInput>;

export interface RowCheck {
  fila: number;
  estado: 'nuevo' | 'actualiza' | 'error';
  errores: string[];
  avisos: string[];
  predio: { id: string; codigo: string; direccion: string } | null;
  participacionId: string | null;
  personaId: string | null;
  ubicacion: { lon: number; lat: number; base: 'predio' | 'calle' } | null;
  documento: string | null;
  habitantes: number | null;
}

interface Context {
  predios: {
    id: string;
    codigo: string;
    direccion: string;
    key: string;
    calle: string;
    numero: number | null;
    punto: [number, number] | null;
  }[];
  byKey: Map<string, Context['predios'][number]>;
  byStreet: Map<string, Context['predios'][number][]>;
  streets: Set<string>;
  participations: Map<string, { id: string; predioId: string; codigo: string | null }>;
  byPredio: Map<string, { id: string; codigo: string | null }>;
  persons: Map<string, { id: string; nombre: string }>;
}

async function loadContext(c: Pool | PoolClient, kind: Kind): Promise<Context> {
  const [predios, streets, parts, persons] = await Promise.all([
    c.query(
      `SELECT p.id,p.codigo,p.direccion,
              coalesce(p.ubicacion->'coordinates',
                (SELECT json_build_array(ST_X(ST_PointOnSurface(e.geom)),ST_Y(ST_PointOnSurface(e.geom)))::jsonb
                   FROM gestion.vinculo_espacial v JOIN bagua_master.edificio e ON e.id=v.edificio_id
                  WHERE v.predio_id=p.id AND v.estado='confirmado' LIMIT 1)) AS punto
       FROM gestion.predio p WHERE NOT p.archivado`,
    ),
    c.query(
      `SELECT DISTINCT nombre FROM bagua_master.red_vial WHERE nombre IS NOT NULL AND nombre<>''`,
    ),
    c.query(
      `SELECT a.id,a.predio_id,a.codigo_padron FROM gestion.participacion a JOIN gestion.servicio s ON s.id=a.servicio_id
       WHERE s.codigo=ANY($1::text[]) AND a.hasta IS NULL`,
      [SELECTIVE[kind].codes],
    ),
    c.query(`SELECT id,nombre,documento FROM gestion.persona WHERE documento IS NOT NULL`),
  ]);
  const ctx: Context = {
    predios: [],
    byKey: new Map(),
    byStreet: new Map(),
    streets: new Set(streets.rows.map((r) => parseAddress(r.nombre).calle)),
    participations: new Map(),
    byPredio: new Map(),
    persons: new Map(persons.rows.map((r) => [r.documento, { id: r.id, nombre: r.nombre }])),
  };
  for (const r of predios.rows) {
    const a = parseAddress(r.direccion);
    const item = {
      id: r.id,
      codigo: r.codigo,
      direccion: r.direccion,
      key: keyOf(a),
      calle: a.calle,
      numero: a.numero,
      punto: Array.isArray(r.punto)
        ? ([Number(r.punto[0]), Number(r.punto[1])] as [number, number])
        : null,
    };
    ctx.predios.push(item);
    if (a.numero !== null && !ctx.byKey.has(item.key)) ctx.byKey.set(item.key, item);
    if (item.punto && a.numero !== null) {
      const list = ctx.byStreet.get(a.calle) ?? [];
      list.push(item);
      ctx.byStreet.set(a.calle, list);
    }
  }
  for (const r of parts.rows) {
    if (r.codigo_padron)
      ctx.participations.set(r.codigo_padron.toUpperCase(), {
        id: r.id,
        predioId: r.predio_id,
        codigo: r.codigo_padron,
      });
    ctx.byPredio.set(r.predio_id, { id: r.id, codigo: r.codigo_padron });
  }
  return ctx;
}

/** Ubica un número de puerta entre los predios conocidos de la misma calle (mismo lado si se puede). */
export function locateOnStreet(
  known: { numero: number | null; punto: [number, number] | null }[],
  numero: number,
): [number, number] | null {
  const pts = known.filter((k) => k.numero !== null && k.punto) as {
    numero: number;
    punto: [number, number];
  }[];
  if (!pts.length) return null;
  const side = pts.filter((k) => k.numero % 2 === numero % 2);
  const pool = side.length >= 2 ? side : pts;
  const below = pool.filter((k) => k.numero <= numero).sort((a, b) => b.numero - a.numero)[0];
  const above = pool.filter((k) => k.numero >= numero).sort((a, b) => a.numero - b.numero)[0];
  if (below && above && below.numero !== above.numero) {
    if (above.numero - below.numero > 400) return null;
    const f = (numero - below.numero) / (above.numero - below.numero);
    return [
      below.punto[0] + (above.punto[0] - below.punto[0]) * f,
      below.punto[1] + (above.punto[1] - below.punto[1]) * f,
    ];
  }
  const near = below ?? above!;
  return Math.abs(near.numero - numero) <= 40 ? near.punto : null;
}

export function checkRows(d: ImportInput, ctx: Context): RowCheck[] {
  const seenCode = new Map<string, number>();
  const seenDoc = new Map<string, { fila: number; nombre: string }>();
  const seenAddress = new Map<string, number>();
  const domestic = d.tipoGenerador === 'domiciliario';
  return d.filas.map((r) => {
    const errores: string[] = [];
    const avisos: string[] = [];
    if (!r.direccion) errores.push('Falta la dirección.');
    if (!r.representante) errores.push('Falta el nombre del representante.');
    else if (r.representante.length < 5) errores.push('El nombre del representante es muy corto.');
    const doc = normalizeDocument(r.dni);
    if (!doc.valid) errores.push(`DNI «${r.dni}» no válido: debe tener 8 cifras (o RUC de 11).`);
    if (doc.fixed) avisos.push(`DNI con 7 cifras: se completó el cero inicial (${doc.value}).`);
    let habitantes: number | null = null;
    if (domestic) {
      if (!r.habitantes) avisos.push('Sin número de habitantes (lo pide el anexo del MINAM).');
      else if (
        !/^\d{1,2}$/.test(r.habitantes) ||
        Number(r.habitantes) < 1 ||
        Number(r.habitantes) > 60
      )
        errores.push(`Habitantes «${r.habitantes}» no válido (de 1 a 60).`);
      else habitantes = Number(r.habitantes);
    } else if (!r.establecimiento)
      errores.push('Falta el nombre del establecimiento o institución.');
    const code = r.codigo.toUpperCase();
    if (code) {
      if (seenCode.has(code))
        errores.push(`Código ${code} repetido (también en la fila ${seenCode.get(code)}).`);
      seenCode.set(code, r.fila);
    }
    if (doc.value && r.representante) {
      const prev = seenDoc.get(doc.value);
      if (prev && nameKey(prev.nombre) !== nameKey(r.representante))
        errores.push(
          `DNI ${doc.value} con otro nombre en la fila ${prev.fila} («${prev.nombre}»).`,
        );
      seenDoc.set(doc.value, { fila: r.fila, nombre: r.representante });
      const known = ctx.persons.get(doc.value);
      if (known && nameKey(known.nombre) !== nameKey(r.representante))
        avisos.push(`El DNI ya está registrado como «${known.nombre}»: se usará ese registro.`);
    }
    let predio: RowCheck['predio'] = null;
    let participacionId: string | null = null;
    let ubicacion: RowCheck['ubicacion'] = null;
    const a = r.direccion ? parseAddress(r.direccion) : null;
    if (a) {
      const key = keyOf(a);
      if (seenAddress.has(key))
        errores.push(
          `Misma dirección que la fila ${seenAddress.get(key)}: un predio se inscribe una vez por programa. Si son dos viviendas, agrega la letra del interior (por ejemplo ${r.direccion.trim()}-A).`,
        );
      seenAddress.set(key, r.fila);
      const byCode = code ? ctx.participations.get(code) : undefined;
      const match = byCode
        ? ctx.predios.find((p) => p.id === byCode.predioId)
        : a.numero !== null
          ? ctx.byKey.get(key)
          : undefined;
      if (match) {
        predio = { id: match.id, codigo: match.codigo, direccion: match.direccion };
        participacionId = byCode?.id ?? ctx.byPredio.get(match.id)?.id ?? null;
        if (match.punto) ubicacion = { lon: match.punto[0], lat: match.punto[1], base: 'predio' };
      } else if (
        code &&
        byCode === undefined &&
        [...ctx.participations.values()].some((p) => p.codigo?.toUpperCase() === code)
      ) {
        errores.push(`El código ${code} ya pertenece a otro predio.`);
      } else if (a.numero === null) {
        avisos.push('La dirección no tiene número de puerta: queda para ubicar en el mapa.');
      } else {
        const point = locateOnStreet(ctx.byStreet.get(a.calle) ?? [], a.numero);
        if (point) ubicacion = { lon: point[0], lat: point[1], base: 'calle' };
        else if (ctx.streets.has(a.calle))
          avisos.push(
            'Calle reconocida, pero sin predios cercanos con número: queda para ubicar en el mapa.',
          );
        else avisos.push('Calle no reconocida en el mapa: queda para ubicar.');
      }
    }
    return {
      fila: r.fila,
      estado: errores.length ? 'error' : participacionId ? 'actualiza' : 'nuevo',
      errores,
      avisos,
      predio,
      participacionId,
      personaId: doc.value ? (ctx.persons.get(doc.value)?.id ?? null) : null,
      ubicacion,
      documento: doc.value,
      habitantes,
    };
  });
}

const summarize = (rows: RowCheck[]) => ({
  filas: rows.length,
  nuevos: rows.filter((r) => r.estado === 'nuevo').length,
  actualizados: rows.filter((r) => r.estado === 'actualiza').length,
  errores: rows.filter((r) => r.estado === 'error').length,
  conAvisos: rows.filter((r) => r.avisos.length).length,
  sinUbicar: rows.filter((r) => r.estado !== 'error' && !r.ubicacion).length,
});

async function nextNumber(c: PoolClient, sql: string, params: unknown[] = []) {
  return Number((await c.query(sql, params)).rows[0].n ?? 0) + 1;
}
const pad = (n: number, w = 5) => String(n).padStart(w, '0');

export function createPadronRouter(pool: Pool, auth: { write: RequestHandler }) {
  const router = Router();
  const admin: RequestHandler = (_req, res, next) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración carga el padrón.');
    next();
  };

  router.post('/padron/importar/validar', auth.write, admin, async (req, res) => {
    const d = importInput.parse(req.body);
    const ctx = await loadContext(pool, d.servicio);
    const rows = checkRows(d, ctx);
    const previous = (
      await pool.query(
        `SELECT creado_en AS "creadoEn",revertido_en AS "revertidoEn" FROM gestion.importacion_padron
         WHERE sha256=$1 ORDER BY creado_en DESC LIMIT 1`,
        [d.sha256],
      )
    ).rows[0];
    res.json({ filas: rows, resumen: summarize(rows), yaImportado: previous ?? null });
  });

  router.post('/padron/importar/aplicar', auth.write, admin, async (req, res) => {
    const d = importInput.parse(req.body);
    const user = res.locals.user as User;
    const result = await transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('bagua:importar-padron'))");
      const ctx = await loadContext(c, d.servicio);
      const rows = checkRows(d, ctx);
      const bad = rows.filter((r) => r.estado === 'error');
      if (bad.length)
        throw new AppError(
          409,
          'ROWS_WITH_ERRORS',
          `Hay ${bad.length} fila(s) con errores (primera: fila ${bad[0]!.fila}). Corrígelas antes de confirmar.`,
        );
      const service = (
        await c.query('SELECT id FROM gestion.servicio WHERE codigo=$1 AND activo', [
          SELECTIVE[d.servicio].codes[0],
        ])
      ).rows[0];
      if (!service)
        throw new AppError(409, 'NO_SERVICE', 'El programa no está activo en el catálogo.');
      const fuente = (await c.query('SELECT id FROM gestion.fuente WHERE codigo=$1', [SOURCE]))
        .rows[0].id;
      const lote = (
        await c.query(
          `INSERT INTO gestion.importacion_padron(archivo,sha256,servicio_codigo,tipo_generador,filas,resumen,usuario_id)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            d.archivo,
            d.sha256,
            SELECTIVE[d.servicio].codes[0],
            d.tipoGenerador,
            rows.length,
            summarize(rows),
            user.id,
          ],
        )
      ).rows[0].id as string;
      const creados = {
        predios: [] as string[],
        personas: [] as string[],
        participaciones: [] as string[],
        vinculos: [] as string[],
      };
      const actualizados: { id: string; antes: Record<string, unknown> }[] = [];
      let nextPredio = await nextNumber(
        c,
        `SELECT max(substring(codigo from '^IMP-(\\d+)$')::int) AS n FROM gestion.predio`,
      );
      let nextPersona = await nextNumber(
        c,
        `SELECT max(substring(codigo from '^IMP-PER-(\\d+)$')::int) AS n FROM gestion.persona`,
      );
      let nextCode = await nextNumber(
        c,
        `SELECT max(substring(codigo_padron from '^${PREFIX[d.servicio]}-(\\d+)$')::int) AS n FROM gestion.participacion`,
      );
      const evidence = (fila: number) => `Padrón importado «${d.archivo}», fila ${fila}.`;
      const people = new Map<string, string>();
      for (const [i, check] of rows.entries()) {
        const r = d.filas[i]!;
        // Persona representante: por DNI si existe; si no, una nueva (una sola por DNI en el lote).
        let personaId =
          check.personaId ?? (check.documento ? people.get(check.documento) : undefined) ?? null;
        if (!personaId) {
          personaId = (
            await c.query(
              `INSERT INTO gestion.persona(fuente_id,codigo,nombre,tipo,documento) VALUES($1,$2,$3,$4,$5) RETURNING id`,
              [
                fuente,
                `IMP-PER-${pad(nextPersona++)}`,
                r.representante,
                isCompany(r.representante, check.documento) ? 'juridica' : 'natural',
                check.documento,
              ],
            )
          ).rows[0].id as string;
          creados.personas.push(personaId);
        }
        if (check.documento) people.set(check.documento, personaId);
        // Predio: el existente o uno nuevo, ubicado entre los vecinos de la calle cuando se puede.
        let predioId = check.predio?.id ?? null;
        if (!predioId) {
          const point = check.ubicacion;
          predioId = (
            await c.query(
              `INSERT INTO gestion.predio(fuente_id,codigo,direccion,sector,uso,observaciones,ubicacion,estado_ubicacion,evidencia_ubicacion)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
              [
                fuente,
                `IMP-${pad(nextPredio++)}`,
                r.direccion,
                r.sector || null,
                d.tipoGenerador === 'domiciliario'
                  ? 'Casa habitación'
                  : r.tipoEstablecimiento || 'Comercio',
                evidence(r.fila),
                point
                  ? JSON.stringify({ type: 'Point', coordinates: [point.lon, point.lat] })
                  : null,
                point ? 'aproximada' : 'pendiente',
                point
                  ? 'Ubicada entre los predios conocidos de la misma calle (importación del padrón).'
                  : '',
              ],
            )
          ).rows[0].id as string;
          creados.predios.push(predioId);
        }
        const linked = (
          await c.query(
            'SELECT 1 FROM gestion.vinculo WHERE predio_id=$1 AND persona_id=$2 AND hasta IS NULL',
            [predioId, personaId],
          )
        ).rowCount;
        if (!linked) {
          creados.vinculos.push(
            (
              await c.query(
                `INSERT INTO gestion.vinculo(predio_id,persona_id,tipo,desde,evidencia)
                 VALUES($1,$2,'responsable_servicio',(now() AT TIME ZONE 'America/Lima')::date,$3) RETURNING id`,
                [predioId, personaId, evidence(r.fila)],
              )
            ).rows[0].id,
          );
        }
        const fields = {
          tipo_generador: d.tipoGenerador,
          representante_id: personaId,
          habitantes: check.habitantes,
          establecimiento: d.tipoGenerador === 'no_domiciliario' ? r.establecimiento : null,
          tipo_establecimiento:
            d.tipoGenerador === 'no_domiciliario' ? r.tipoEstablecimiento || null : null,
          zona: r.sector || null,
        };
        if (check.participacionId) {
          const before = (
            await c.query(
              `SELECT tipo_generador,representante_id,habitantes,establecimiento,tipo_establecimiento,zona
               FROM gestion.participacion WHERE id=$1 FOR UPDATE`,
              [check.participacionId],
            )
          ).rows[0];
          await c.query(
            `UPDATE gestion.participacion SET tipo_generador=$2,representante_id=$3,habitantes=coalesce($4,habitantes),
               establecimiento=coalesce($5,establecimiento),tipo_establecimiento=coalesce($6,tipo_establecimiento),
               zona=coalesce($7,zona) WHERE id=$1`,
            [check.participacionId, ...Object.values(fields)],
          );
          actualizados.push({ id: check.participacionId, antes: before });
        } else {
          const code = r.codigo.toUpperCase() || `${PREFIX[d.servicio]}-${pad(nextCode++, 4)}`;
          creados.participaciones.push(
            (
              await c.query(
                `INSERT INTO gestion.participacion(predio_id,servicio_id,desde,evidencia,tipo_generador,representante_id,
                   habitantes,establecimiento,tipo_establecimiento,zona,codigo_padron,importacion_id)
                 VALUES($1,$2,(now() AT TIME ZONE 'America/Lima')::date,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
                [predioId, service.id, evidence(r.fila), ...Object.values(fields), code, lote],
              )
            ).rows[0].id,
          );
        }
      }
      const resumen = {
        ...summarize(rows),
        creados: Object.fromEntries(Object.entries(creados).map(([k, v]) => [k, v.length])),
      };
      await c.query('UPDATE gestion.importacion_padron SET creados=$2,resumen=$3 WHERE id=$1', [
        lote,
        { ...creados, actualizados },
        resumen,
      ]);
      await audit(c, user, null, 'padron.importado', null, {
        lote,
        archivo: d.archivo,
        ...resumen,
      });
      return { id: lote, resumen };
    });
    res.status(201).json(result);
  });

  router.get('/padron/importaciones', async (_req, res) => {
    res.json({
      items: (
        await pool.query(
          `SELECT i.id,i.archivo,i.servicio_codigo AS servicio,i.tipo_generador AS "tipoGenerador",i.filas,i.resumen,
                  i.creado_en AS "creadoEn",u.nombre AS usuario,i.revertido_en AS "revertidoEn",i.motivo_reversion AS "motivoReversion"
           FROM gestion.importacion_padron i JOIN gestion.usuario u ON u.id=i.usuario_id ORDER BY i.creado_en DESC LIMIT 50`,
        )
      ).rows,
    });
  });

  router.post('/padron/importaciones/:id/revertir', auth.write, admin, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { motivo } = z
      .object({ motivo: z.string().trim().min(5).max(500) })
      .strict()
      .parse(req.body);
    const user = res.locals.user as User;
    await transaction(pool, async (c) => {
      const lote = (
        await c.query('SELECT * FROM gestion.importacion_padron WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!lote || lote.revertido_en)
        throw new AppError(404, 'NOT_FOUND', 'Lote no encontrado o ya revertido.');
      const made = lote.creados as {
        predios: string[];
        personas: string[];
        participaciones: string[];
        vinculos: string[];
        actualizados: { id: string; antes: Record<string, unknown> }[];
      };
      const used = (
        await c.query(
          `SELECT count(*)::int AS n FROM gestion.visita WHERE participacion_id=ANY($1::uuid[]) AND NOT anulada`,
          [made.participaciones],
        )
      ).rows[0].n;
      if (used)
        throw new AppError(
          409,
          'IMPORT_IN_USE',
          `Ya hay ${used} visitas registradas sobre este padrón: no se puede revertir. Corrige los registros uno por uno.`,
        );
      await c.query('DELETE FROM gestion.participacion WHERE id=ANY($1::uuid[])', [
        made.participaciones,
      ]);
      await c.query('DELETE FROM gestion.vinculo WHERE id=ANY($1::uuid[])', [made.vinculos]);
      for (const u of made.actualizados ?? [])
        await c.query(
          `UPDATE gestion.participacion SET tipo_generador=$2,representante_id=$3,habitantes=$4,establecimiento=$5,
             tipo_establecimiento=$6,zona=$7 WHERE id=$1`,
          [
            u.id,
            u.antes.tipo_generador,
            u.antes.representante_id,
            u.antes.habitantes,
            u.antes.establecimiento,
            u.antes.tipo_establecimiento,
            u.antes.zona,
          ],
        );
      // Solo se borran los predios y personas creados por el lote que nadie más usa.
      await c.query(
        `DELETE FROM gestion.predio p WHERE p.id=ANY($1::uuid[])
           AND NOT EXISTS (SELECT 1 FROM gestion.participacion x WHERE x.predio_id=p.id)
           AND NOT EXISTS (SELECT 1 FROM gestion.vinculo x WHERE x.predio_id=p.id)
           AND NOT EXISTS (SELECT 1 FROM gestion.codigo_qr x WHERE x.predio_id=p.id)
           AND NOT EXISTS (SELECT 1 FROM gestion.vinculo_espacial x WHERE x.predio_id=p.id)
           AND NOT EXISTS (SELECT 1 FROM gestion.historial x WHERE x.predio_id=p.id)`,
        [made.predios],
      );
      await c.query(
        `DELETE FROM gestion.persona p WHERE p.id=ANY($1::uuid[])
           AND NOT EXISTS (SELECT 1 FROM gestion.participacion x WHERE x.representante_id=p.id)
           AND NOT EXISTS (SELECT 1 FROM gestion.vinculo x WHERE x.persona_id=p.id)
           AND NOT EXISTS (SELECT 1 FROM gestion.relacion_unidad x WHERE x.persona_id=p.id)`,
        [made.personas],
      );
      await c.query(
        'UPDATE gestion.importacion_padron SET revertido_en=now(),revertido_por=$2,motivo_reversion=$3 WHERE id=$1',
        [id, user.id, motivo],
      );
      await audit(
        c,
        user,
        null,
        'padron.revertido',
        { lote: id, archivo: lote.archivo },
        { motivo },
      );
    });
    res.status(204).end();
  });

  // ---------------------------------------------------------------- empadronamiento en campo
  const enrollInput = z
    .object({
      clave: z.uuid(),
      servicio: z.enum(['organicos', 'reciclables']),
      tipoGenerador: z.enum(['domiciliario', 'no_domiciliario']),
      predioId: z.uuid().nullable().default(null),
      nuevoPredio: z
        .object({
          direccion: z.string().trim().min(4).max(200),
          sector: z.string().trim().max(80).default(''),
          edificioId: z.string().trim().max(80).nullable().default(null),
          lon: z.number().min(-78.62).max(-78.44),
          lat: z.number().min(-5.74).max(-5.55),
        })
        .strict()
        .nullable()
        .default(null),
      representante: z
        .object({
          nombre: z.string().trim().min(5).max(160),
          dni: z.string().trim().max(20).default(''),
        })
        .strict(),
      habitantes: z.number().int().min(1).max(60).nullable().default(null),
      establecimiento: z.string().trim().max(160).default(''),
      tipoEstablecimiento: z.string().trim().max(80).default(''),
      consentimiento: z.literal(true),
      sticker: z.enum(['generar', 'no']).default('generar'),
    })
    .strict()
    .refine((v) => !!v.predioId !== !!v.nuevoPredio, {
      message: 'Indica un predio existente o los datos del nuevo.',
      path: ['predioId'],
    })
    .refine((v) => v.tipoGenerador !== 'no_domiciliario' || v.establecimiento.length >= 3, {
      message: 'Falta el nombre del establecimiento.',
      path: ['establecimiento'],
    });

  router.post('/empadronamiento', auth.write, async (req, res) => {
    const d = enrollInput.parse(req.body);
    const user = res.locals.user as User;
    const doc = normalizeDocument(d.representante.dni);
    if (!doc.valid) throw new AppError(400, 'INVALID_DOCUMENT', 'El DNI debe tener 8 cifras.');
    const result = await transaction(pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [d.clave]);
      const repeated = (
        await c.query(
          "SELECT nuevo FROM gestion.historial WHERE accion='padron.empadronado' AND nuevo->>'clave'=$1",
          [d.clave],
        )
      ).rows[0];
      if (repeated) return { ...repeated.nuevo, repetido: true };
      const fuente = (await c.query('SELECT id FROM gestion.fuente WHERE codigo=$1', [SOURCE]))
        .rows[0].id;
      const service = (
        await c.query('SELECT id FROM gestion.servicio WHERE codigo=$1 AND activo', [
          SELECTIVE[d.servicio].codes[0],
        ])
      ).rows[0];
      if (!service) throw new AppError(409, 'NO_SERVICE', 'El programa no está activo.');
      let predioId = d.predioId;
      let predioCodigo: string;
      if (predioId) {
        const p = (
          await c.query('SELECT codigo,archivado FROM gestion.predio WHERE id=$1', [predioId])
        ).rows[0];
        if (!p || p.archivado) throw new AppError(404, 'NOT_FOUND', 'Predio no encontrado.');
        predioCodigo = p.codigo;
      } else {
        const n = d.nuevoPredio!;
        predioCodigo = `CAM-${pad(await nextNumber(c, `SELECT max(substring(codigo from '^CAM-(\\d+)$')::int) AS n FROM gestion.predio`))}`;
        predioId = (
          await c.query(
            `INSERT INTO gestion.predio(fuente_id,codigo,direccion,sector,uso,observaciones,ubicacion,estado_ubicacion,evidencia_ubicacion)
             VALUES($1,$2,$3,$4,$5,$6,$7,'verificada',$8) RETURNING id`,
            [
              fuente,
              predioCodigo,
              n.direccion,
              n.sector || null,
              d.tipoGenerador === 'domiciliario'
                ? 'Casa habitación'
                : d.tipoEstablecimiento || 'Comercio',
              'Empadronado en campo.',
              JSON.stringify({ type: 'Point', coordinates: [n.lon, n.lat] }),
              n.edificioId
                ? 'Edificación elegida en el mapa durante el empadronamiento'
                : 'Punto marcado en el mapa durante el empadronamiento',
            ],
          )
        ).rows[0].id;
        if (n.edificioId) {
          // Vínculo con la edificación: se propone y el promotor lo confirma en el lugar.
          const link = (
            await c.query(
              `INSERT INTO gestion.vinculo_espacial(predio_id,edificio_id,criterio,evidencia,version_overture,creado_por)
               SELECT $1,e.id,'seleccion_mapa','Empadronamiento en campo',
                      coalesce((SELECT version_overture FROM bagua_master.version LIMIT 1),'desconocida'),$3
               FROM bagua_master.edificio e WHERE e.id=$2 RETURNING id`,
              [predioId, n.edificioId, user.id],
            )
          ).rows[0];
          if (link)
            await c.query(
              `UPDATE gestion.vinculo_espacial SET estado='confirmado',version=2,revisado_por=$2,revisado_en=now(),
                 motivo='Confirmado por el promotor en el lugar' WHERE id=$1`,
              [link.id, user.id],
            );
        }
      }
      const active = (
        await c.query(
          'SELECT codigo_padron FROM gestion.participacion WHERE predio_id=$1 AND servicio_id=$2 AND hasta IS NULL',
          [predioId, service.id],
        )
      ).rows[0];
      if (active)
        throw new AppError(
          409,
          'ALREADY_ENROLLED',
          `Este predio ya está inscrito en el programa (${active.codigo_padron}).`,
        );
      let personaId = doc.value
        ? ((await c.query('SELECT id FROM gestion.persona WHERE documento=$1 LIMIT 1', [doc.value]))
            .rows[0]?.id as string | undefined)
        : undefined;
      if (!personaId)
        personaId = (
          await c.query(
            `INSERT INTO gestion.persona(fuente_id,codigo,nombre,tipo,documento) VALUES($1,$2,$3,$4,$5) RETURNING id`,
            [
              fuente,
              `CAM-PER-${pad(await nextNumber(c, `SELECT max(substring(codigo from '^CAM-PER-(\\d+)$')::int) AS n FROM gestion.persona`))}`,
              d.representante.nombre,
              isCompany(d.representante.nombre, doc.value) ? 'juridica' : 'natural',
              doc.value,
            ],
          )
        ).rows[0].id as string;
      const linked = (
        await c.query(
          'SELECT 1 FROM gestion.vinculo WHERE predio_id=$1 AND persona_id=$2 AND hasta IS NULL',
          [predioId, personaId],
        )
      ).rowCount;
      if (!linked)
        await c.query(
          `INSERT INTO gestion.vinculo(predio_id,persona_id,tipo,desde,evidencia)
           VALUES($1,$2,'responsable_servicio',(now() AT TIME ZONE 'America/Lima')::date,'Empadronamiento en campo')`,
          [predioId, personaId],
        );
      const codigoPadron = `${PREFIX[d.servicio]}-${pad(
        await nextNumber(
          c,
          `SELECT max(substring(codigo_padron from '^${PREFIX[d.servicio]}-(\\d+)$')::int) AS n FROM gestion.participacion`,
        ),
        4,
      )}`;
      const sector =
        d.nuevoPredio?.sector ||
        (await c.query('SELECT sector FROM gestion.predio WHERE id=$1', [predioId])).rows[0].sector;
      const participacion = (
        await c.query(
          `INSERT INTO gestion.participacion(predio_id,servicio_id,desde,evidencia,tipo_generador,representante_id,habitantes,
             establecimiento,tipo_establecimiento,zona,codigo_padron,consentimiento_en,consentimiento_version)
           VALUES($1,$2,(now() AT TIME ZONE 'America/Lima')::date,'Empadronamiento en campo',$3,$4,$5,$6,$7,$8,$9,now(),$10)
           RETURNING id`,
          [
            predioId,
            service.id,
            d.tipoGenerador,
            personaId,
            d.tipoGenerador === 'domiciliario' ? d.habitantes : null,
            d.tipoGenerador === 'no_domiciliario' ? d.establecimiento : null,
            d.tipoGenerador === 'no_domiciliario' ? d.tipoEstablecimiento || null : null,
            sector,
            codigoPadron,
            CONSENT_VERSION,
          ],
        )
      ).rows[0].id;
      let sticker: string | null =
        (
          await c.query(
            "SELECT codigo FROM gestion.codigo_qr WHERE predio_id=$1 AND estado='activo'",
            [predioId],
          )
        ).rows[0]?.codigo ?? null;
      if (!sticker && d.sticker === 'generar')
        sticker = (await createCode(c, predioId!, user)).codigo;
      const out = {
        clave: d.clave,
        predioId,
        predioCodigo,
        participacionId: participacion,
        codigoPadron,
        sticker,
      };
      await audit(c, user, predioId, 'padron.empadronado', null, out);
      return out;
    });
    res.status(201).json(result);
  });

  return router;
}
