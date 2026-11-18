import type { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { AppError } from '../../shared/app-error.js';
import { predioInput, type PredioInput, type User } from './gestion.schema.js';
import { administrativeInput, importFields, resolutionsInput } from './gestion.reconciliation.js';
import type { z } from 'zod';

export const SOURCE = 'SINTETICO-LOCAL-V1';
function samePredio(existing: Record<string, unknown>, input: PredioInput) {
  const point = existing.ubicacion as PredioInput['ubicacion'];
  return (
    existing.direccion === input.direccion &&
    existing.sector === input.sector &&
    existing.uso === input.uso &&
    existing.observaciones === input.observaciones &&
    JSON.stringify(point?.coordinates ?? null) ===
      JSON.stringify(input.ubicacion?.coordinates ?? null) &&
    existing.estado_ubicacion === input.estadoUbicacion &&
    existing.evidencia_ubicacion === input.evidenciaUbicacion
  );
}
export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await work(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    const code = (e as { code?: string }).code;
    if (code === '23505')
      throw new AppError(409, 'DUPLICATE', 'Ya existe un registro con esa clave o periodo.');
    if (code === '23503' || code === '23514')
      throw new AppError(
        400,
        'INVALID_RELATION',
        'Revisa los registros relacionados y sus fechas.',
      );
    throw e;
  } finally {
    c.release();
  }
}
export async function audit(
  c: PoolClient,
  user: User,
  predioId: string | null,
  action: string,
  before: unknown,
  after: unknown,
) {
  await c.query(
    'INSERT INTO gestion.historial(predio_id,usuario_id,accion,anterior,nuevo) VALUES($1,$2,$3,$4,$5)',
    [predioId, user.id, action, JSON.stringify(before), JSON.stringify(after)],
  );
}
const columns = `p.*, f.nombre AS fuente, f.codigo AS fuente_codigo, f.sintetica`;
export function createGestionRepository(pool: Pool) {
  async function source(c: PoolClient) {
    return (await c.query('SELECT id FROM gestion.fuente WHERE codigo=$1', [SOURCE])).rows[0]
      .id as string;
  }
  async function save(
    c: PoolClient,
    user: User,
    input: PredioInput,
    id?: string,
    version?: number,
  ) {
    const values = [
      input.codigo,
      input.direccion,
      input.sector,
      input.uso,
      input.observaciones,
      input.ubicacion ? JSON.stringify(input.ubicacion) : null,
      input.estadoUbicacion,
      input.evidenciaUbicacion,
    ];
    if (id) {
      const before = (await c.query('SELECT * FROM gestion.predio WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Predio no encontrado.');
      if (before.codigo !== input.codigo)
        throw new AppError(
          409,
          'ORIGIN_KEY_IMMUTABLE',
          'El código de origen es estable; un cambio de identidad requiere correspondencia explícita revisada.',
        );
      if (before.archivado)
        throw new AppError(409, 'PREDIO_ARCHIVED', 'Restaura el predio antes de editar sus datos.');
      if (before.version !== version)
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'El predio cambió. Recarga la ficha antes de guardar.',
        );
      const after = (
        await c.query(
          `UPDATE gestion.predio SET codigo=$1,direccion=$2,sector=$3,uso=$4,observaciones=$5,
        ubicacion=$6,estado_ubicacion=$7,evidencia_ubicacion=$8,version=version+1,actualizado_en=now() WHERE id=$9 RETURNING *`,
          [...values, id],
        )
      ).rows[0];
      await audit(c, user, id, 'predio.actualizado', before, after);
      return after;
    }
    const result = await c.query(
      `INSERT INTO gestion.predio(codigo,direccion,sector,uso,observaciones,ubicacion,estado_ubicacion,evidencia_ubicacion,fuente_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [...values, await source(c)],
    );
    await audit(c, user, result.rows[0].id, 'predio.creado', null, result.rows[0]);
    return result.rows[0];
  }
  return {
    save: (user: User, input: PredioInput, id?: string, version?: number) =>
      transaction(pool, (c) => save(c, user, input, id, version)),
    async list(q: string, status: string | undefined, page: number, archivo = 'activos') {
      const search = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      const where = `WHERE (p.codigo ILIKE $1 OR p.direccion ILIKE $1 OR coalesce(p.sector,'') ILIKE $1) AND ($2::text IS NULL OR p.estado_ubicacion=$2) AND ${archivo === 'todos' ? 'true' : archivo === 'archivados' ? 'p.archivado' : 'NOT p.archivado'}`;
      const [items, total] = await Promise.all([
        pool.query(
          `SELECT ${columns} FROM gestion.predio p JOIN gestion.fuente f ON f.id=p.fuente_id ${where} ORDER BY p.codigo,p.id LIMIT 30 OFFSET $3`,
          [search, status ?? null, (page - 1) * 30],
        ),
        pool.query(`SELECT count(*)::int AS total FROM gestion.predio p ${where}`, [
          search,
          status ?? null,
        ]),
      ]);
      return { items: items.rows, total: total.rows[0].total, page, pageSize: 30 };
    },
    async detail(id: string, user: User) {
      const found = await pool.query(
        `SELECT ${columns} FROM gestion.predio p JOIN gestion.fuente f ON f.id=p.fuente_id WHERE p.id=$1`,
        [id],
      );
      if (!found.rows[0]) throw new AppError(404, 'NOT_FOUND', 'Predio no encontrado.');
      const privateAllowed = user.rol !== 'consulta';
      const [people, assignments, participations, deliveries, history] = await Promise.all([
        privateAllowed
          ? pool.query(
              `SELECT v.*,p.codigo,p.nombre,p.tipo AS tipo_persona FROM gestion.vinculo v JOIN gestion.persona p ON p.id=v.persona_id WHERE v.predio_id=$1 ORDER BY v.desde DESC`,
              [id],
            )
          : Promise.resolve({ rows: [] }),
        pool.query(
          `SELECT a.*,s.nombre FROM gestion.asignacion a JOIN gestion.servicio s ON s.id=a.servicio_id WHERE a.predio_id=$1 ORDER BY a.desde DESC`,
          [id],
        ),
        pool.query(
          `SELECT a.*,s.nombre FROM gestion.participacion a JOIN gestion.servicio s ON s.id=a.servicio_id WHERE a.predio_id=$1 ORDER BY a.desde DESC`,
          [id],
        ),
        pool.query(
          `SELECT e.id,e.version,e.participacion_id,e.fecha,e.material,e.cantidad,e.unidad,e.observaciones,e.anulada,e.motivo_anulacion,s.nombre AS servicio FROM gestion.entrega e JOIN gestion.participacion a ON a.id=e.participacion_id JOIN gestion.servicio s ON s.id=a.servicio_id WHERE a.predio_id=$1 ORDER BY e.fecha DESC,e.creado_en DESC`,
          [id],
        ),
        privateAllowed
          ? pool.query(
              `SELECT h.id,h.accion,h.creado_en,u.nombre AS responsable FROM gestion.historial h JOIN gestion.usuario u ON u.id=h.usuario_id WHERE h.predio_id=$1 ORDER BY h.id DESC LIMIT 100`,
              [id],
            )
          : Promise.resolve({ rows: [] }),
      ]);
      return {
        predio: found.rows[0],
        personas: people.rows,
        asignaciones: assignments.rows,
        participaciones: participations.rows,
        entregas: deliveries.rows,
        historial: history.rows,
        personasPermitidas: privateAllowed,
      };
    },
    async importPreview(user: User, rows: PredioInput[], metadata: Record<string, unknown> = {}) {
      const hash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      const result = await pool.query(
        `INSERT INTO gestion.importacion(huella,usuario_id,contenido,metadatos) VALUES($1,$2,$3,$4)
        ON CONFLICT(huella) DO UPDATE SET huella=excluded.huella RETURNING id,estado,creado_en`,
        [hash, user.id, JSON.stringify(rows), JSON.stringify(metadata)],
      );
      const existing = (
        await pool.query(
          `SELECT p.* FROM gestion.predio p JOIN gestion.fuente f ON f.id=p.fuente_id WHERE f.codigo=$1 AND p.codigo=ANY($2::text[])`,
          [SOURCE, rows.map((row) => row.codigo)],
        )
      ).rows;
      const review = rows.map((input) => {
        const current = existing.find((row) => row.codigo === input.codigo);
        return {
          codigo: input.codigo,
          estado: !current ? 'alta' : samePredio(current, input) ? 'sin_cambios' : 'conflicto',
          version: current?.version,
          cambios: current
            ? importFields
                .filter(
                  (field) =>
                    JSON.stringify(administrativeInput(current)[field]) !==
                    JSON.stringify(input[field]),
                )
                .map((field) => ({
                  campo: field,
                  local: administrativeInput(current)[field],
                  externo: input[field],
                }))
            : [],
        };
      });
      await pool.query(
        "UPDATE gestion.importacion SET base_revision=$2 WHERE id=$1 AND estado='validada'",
        [
          result.rows[0].id,
          JSON.stringify(
            Object.fromEntries(
              existing.map((row) => [row.codigo, { id: row.id, version: row.version }]),
            ),
          ),
        ],
      );
      return {
        ...result.rows[0],
        registros: rows.length,
        huella: hash,
        revision: review,
        puedeAplicar: !review.some((row) => row.estado === 'conflicto'),
      };
    },
    applyImport(
      user: User,
      id: string,
      resolutions: z.infer<typeof resolutionsInput>['resoluciones'] = [],
    ) {
      return transaction(pool, async (c) => {
        // Serializa importadores y altas del mismo origen; los cambios locales nunca se sobrescriben.
        await c.query("SELECT pg_advisory_xact_lock(hashtext('gestion-import'))");
        const batch = (
          await c.query('SELECT * FROM gestion.importacion WHERE id=$1 FOR UPDATE', [id])
        ).rows[0];
        if (!batch) throw new AppError(404, 'NOT_FOUND', 'Importación no encontrada.');
        if (batch.estado === 'aplicada')
          return { id, estado: 'aplicada', creados: 0, repetida: true };
        const fid = await source(c);
        if (
          new Set(resolutions.map((row) => row.codigo)).size !== resolutions.length ||
          resolutions.some(
            (row) =>
              !(batch.contenido as PredioInput[]).some((input) => input.codigo === row.codigo),
          )
        )
          throw new AppError(
            400,
            'INVALID_RESOLUTION',
            'Resoluciones duplicadas o ajenas al lote.',
          );
        let created = 0,
          updated = 0,
          unchanged = 0;
        for (const input of batch.contenido as PredioInput[]) {
          const existing = (
            await c.query(
              'SELECT * FROM gestion.predio WHERE fuente_id=$1 AND codigo=$2 FOR UPDATE',
              [fid, input.codigo],
            )
          ).rows[0];
          const base = batch.base_revision?.[input.codigo];
          if (base && (!existing || existing.id !== base.id))
            throw new AppError(
              409,
              'IMPORT_IDENTITY_CHANGED',
              'La identidad de origen cambió. Revalida el archivo.',
            );
          if (existing) {
            const same = samePredio(existing, input);
            if (!same) {
              const resolution = resolutions.find((row) => row.codigo === input.codigo);
              if (!resolution)
                throw new AppError(
                  409,
                  'IMPORT_CONFLICT',
                  `El código ${input.codigo} tiene datos diferentes. Requiere conciliación; no se aplicó el lote.`,
                );
              if (!base || resolution.version !== base.version || existing.version !== base.version)
                throw new AppError(
                  409,
                  'IMPORT_STALE',
                  'Hubo cambios locales después de la revisión. Revalida y decide nuevamente.',
                );
              if (resolution.accion === 'actualizar') {
                if (!resolution.campos.length)
                  throw new AppError(
                    400,
                    'EMPTY_RESOLUTION',
                    'Selecciona los campos externos que autorizas.',
                  );
                const merged = administrativeInput(existing);
                for (const field of resolution.campos)
                  Object.assign(merged, { [field]: input[field] });
                const saved = await save(
                  c,
                  user,
                  predioInput.parse(merged),
                  existing.id,
                  existing.version,
                );
                const changed = importFields.filter(
                  (field) =>
                    JSON.stringify(administrativeInput(existing)[field]) !==
                    JSON.stringify(administrativeInput(saved)[field]),
                );
                if (changed.length)
                  await c.query(
                    "INSERT INTO gestion.importacion_cambio(lote_id,predio_id,tipo,anterior,posterior,campos,version_esperada) VALUES($1,$2,'actualizacion',$3,$4,$5,$6)",
                    [
                      id,
                      existing.id,
                      JSON.stringify(administrativeInput(existing)),
                      JSON.stringify(administrativeInput(saved)),
                      changed,
                      saved.version,
                    ],
                  );
                updated++;
                continue;
              }
            }
            unchanged++;
            continue;
          }
          if (resolutions.some((row) => row.codigo === input.codigo))
            throw new AppError(409, 'IMPORT_STALE', 'La correspondencia ya no existe. Revalida.');
          const saved = await save(c, user, input);
          await c.query(
            "INSERT INTO gestion.importacion_cambio(lote_id,predio_id,tipo,anterior,posterior,campos,version_esperada) VALUES($1,$2,'alta',NULL,$3,ARRAY['alta'],$4)",
            [id, saved.id, JSON.stringify(administrativeInput(saved)), saved.version],
          );
          created++;
        }
        await c.query(
          "UPDATE gestion.importacion SET estado='aplicada',aplicado_en=now() WHERE id=$1",
          [id],
        );
        await audit(c, user, null, 'importacion.aplicada', null, { id, created, unchanged });
        await c.query(
          'UPDATE gestion.importacion SET metadatos=metadatos || $2::jsonb WHERE id=$1',
          [
            id,
            JSON.stringify({
              conciliacion: {
                responsable: user.id,
                resoluciones: resolutions,
                actualizados: updated,
              },
            }),
          ],
        );
        return {
          id,
          estado: 'aplicada',
          creados: created,
          actualizados: updated,
          sinCambios: unchanged,
          repetida: false,
        };
      });
    },
  };
}
