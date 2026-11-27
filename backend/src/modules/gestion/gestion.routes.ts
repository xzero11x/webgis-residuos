import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { csvInput, mapCsv, parseCsv, csvCell } from './gestion.csv.js';
import { reportRows } from './gestion.reports.js';
import { activeService, createCatalogRouter } from './gestion.catalogs.js';
import { createUsersRouter } from './gestion.users.js';
import { resolutionsInput } from './gestion.reconciliation.js';
import { createUnitsRouter } from './gestion.units.js';
import { createSearchRouter } from './gestion.search.js';
import { createSpatialRouter } from './gestion.spatial.js';
import { createDeliveryCorrectionsRouter } from './gestion.delivery-corrections.js';
import { createServiceOperationRouter } from './gestion.service-operation.js';
import { createAuditRouter } from './gestion.audit.js';
import { createImportReversalRouter } from './gestion.import-reversal.js';
import { createMapCorrectionsRouter } from './gestion.map-corrections.js';
import { createOperationRouter } from './gestion.operacion.js';
import { createQrRouter } from './gestion.qr.js';
import { createExecutionRouter } from './gestion.ejecucion.js';
import { createNoticesRouter } from './gestion.avisos.js';
import { createClosingRouter } from './gestion.cierre.js';
import { createPadronRouter } from './gestion.padron.js';
import { createRecyclersRouter } from './gestion.recicladores.js';
import { AppError } from '../../shared/app-error.js';
import { env } from '../../config/env.js';
import { assertFixtureTarget, fixtureTargetConfigured } from '../../db/fixture-target.js';
import { createAuth, sessionCookie, setSessionCookie, tokenHash } from './gestion.auth.js';
import { audit, createGestionRepository, SOURCE, transaction } from './gestion.repository.js';
import {
  deliveryInput,
  filterInput,
  linkInput,
  participationInput,
  personInput,
  predioInput,
  predioUpdate,
  reportInput,
  serviceInput,
  type User,
} from './gestion.schema.js';

export function createGestionRouter(pool: Pool) {
  const router = Router(),
    open = env.BAGUA_ACCESO_LIBRE === 'true',
    auth = createAuth(pool, { open }),
    repo = createGestionRepository(pool);
  if (open && !fixtureTargetConfigured(env))
    throw new Error(
      'BAGUA_ACCESO_LIBRE solo se admite en un destino local o de pruebas con fixtures habilitados.',
    );
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Un formulario de otro origen no puede incluir esta cabecera; no se habilita CORS.
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.get('X-Bagua-Request') !== '1' || !req.is('application/json'))
    )
      throw new AppError(403, 'INVALID_ORIGIN', 'Solicitud no permitida.');
    next();
  });
  router.post('/sesion', async (req, res) => {
    const data = z
      .object({ usuario: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) })
      .strict()
      .parse(req.body);
    res.json(await auth.login(req, res, data.usuario, data.password));
  });
  router.use(auth.authorize);
  router.get('/sesion', (_req, res) => res.json(res.locals.user));
  router.post('/salir', async (req, res) => {
    await pool.query('DELETE FROM gestion.sesion WHERE token_hash=$1', [
      tokenHash(sessionCookie(req)),
    ]);
    setSessionCookie(req, res, '', 0);
    res.status(204).end();
  });
  router.get('/entorno', async (_req, res) => {
    if (!fixtureTargetConfigured(env))
      return res.json({ fixturesPermitidos: false, accesoLibre: false });
    await assertFixtureTarget(pool, env);
    return res.json({ fixturesPermitidos: true, accesoLibre: open });
  });
  // Correcciones cartográficas del mapa: no son datos del padrón, así que van antes del control
  // de fixtures (solo exigen sesión con permiso de escritura).
  router.use(createMapCorrectionsRouter(pool, auth.write));
  router.use(async (req, _res, next) => {
    // Todas las escrituras de este contrato aún son exclusivamente sintéticas.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) await assertFixtureTarget(pool, env);
    next();
  });
  router.get('/catalogos', async (_req, res) =>
    res.json({
      servicios: (await pool.query('SELECT * FROM gestion.servicio ORDER BY codigo')).rows,
      fuentes: (
        await pool.query('SELECT id,codigo,nombre,sintetica FROM gestion.fuente ORDER BY codigo')
      ).rows,
      aviso:
        'Entorno de pruebas sintéticas. Catálogos y permisos pendientes de validación institucional.',
    }),
  );
  router.get('/predios', async (req, res) => {
    const f = filterInput.parse(req.query);
    res.json(await repo.list(f.q, f.ubicacion, f.page, f.archivo));
  });
  router.use('/catalogos', createCatalogRouter(pool));
  router.use(createUsersRouter(pool));
  router.use(createUnitsRouter(pool));
  router.use(createSearchRouter(pool));
  router.use(createSpatialRouter(pool));
  router.use(createDeliveryCorrectionsRouter(pool));
  router.use(createServiceOperationRouter(pool));
  router.use(createAuditRouter(pool));
  router.use(createImportReversalRouter(pool));
  router.use(createOperationRouter(pool, auth));
  router.use(createQrRouter(pool, auth));
  router.use(createExecutionRouter(pool, auth));
  router.use(createNoticesRouter(pool, auth));
  router.use(createClosingRouter(pool, auth));
  router.use(createPadronRouter(pool, auth));
  router.use(createRecyclersRouter(pool, auth));
  router.get('/predios/:id', async (req, res) =>
    res.json(await repo.detail(z.uuid().parse(req.params.id), res.locals.user)),
  );
  router.get('/predios/:id/referencia', async (req, res) => {
    const row = (
      await pool.query(
        'SELECT id,codigo,ubicacion,estado_ubicacion,evidencia_ubicacion FROM gestion.predio WHERE id=$1',
        [z.uuid().parse(req.params.id)],
      )
    ).rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Predio no encontrado.');
    res.json(row);
  });
  router.post('/predios/:id/archivo', auth.write, async (req, res) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración archiva o restaura.');
    const id = z.uuid().parse(req.params.id),
      input = z
        .object({
          archivado: z.boolean(),
          motivo: z.string().trim().min(5).max(1000),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        const before = (await c.query('SELECT * FROM gestion.predio WHERE id=$1 FOR UPDATE', [id]))
          .rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Predio no encontrado.');
        if (before.version !== input.version || before.archivado === input.archivado)
          throw new AppError(409, 'VERSION_CONFLICT', 'El estado cambió. Recarga la ficha.');
        const after = (
          await c.query(
            'UPDATE gestion.predio SET archivado=$2,motivo_archivo=$3,archivo_usuario=$4,archivo_fecha=now(),version=version+1,actualizado_en=now() WHERE id=$1 RETURNING *',
            [id, input.archivado, input.motivo, (res.locals.user as User).id],
          )
        ).rows[0];
        await audit(
          c,
          res.locals.user,
          id,
          input.archivado ? 'predio.archivado' : 'predio.restaurado',
          before,
          after,
        );
        return after;
      }),
    );
  });
  router.post('/predios', auth.write, async (req, res) =>
    res.status(201).json(await repo.save(res.locals.user, predioInput.parse(req.body))),
  );
  router.put('/predios/:id', auth.write, async (req, res) => {
    const data = predioUpdate.parse(req.body);
    res.json(
      await repo.save(res.locals.user, data.datos, z.uuid().parse(req.params.id), data.version),
    );
  });
  router.get('/personas', auth.privateData, async (req, res) => {
    const q = z
      .string()
      .trim()
      .max(120)
      .parse(req.query.q ?? '');
    res.json({
      items: (
        await pool.query(
          `SELECT p.id,p.codigo,p.nombre,p.tipo,f.nombre AS fuente,f.sintetica FROM gestion.persona p
      JOIN gestion.fuente f ON f.id=p.fuente_id WHERE p.codigo ILIKE $1 OR p.nombre ILIKE $1 ORDER BY p.nombre LIMIT 50`,
          [`%${q.replace(/[\\%_]/g, '\\$&')}%`],
        )
      ).rows,
    });
  });
  router.get('/personas/:id/predios', auth.privateData, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const person = (
      await pool.query(
        "SELECT p.id,p.codigo,p.nombre,p.tipo,f.nombre AS fuente,f.sintetica,CASE WHEN p.documento IS NULL THEN NULL ELSE repeat('•',greatest(length(p.documento)-3,0)) || right(p.documento,3) END AS documento FROM gestion.persona p JOIN gestion.fuente f ON f.id=p.fuente_id WHERE p.id=$1",
        [id],
      )
    ).rows[0];
    if (!person) throw new AppError(404, 'NOT_FOUND', 'Persona no encontrada.');
    const links = (
      await pool.query(
        `SELECT v.id,v.tipo,v.desde,v.hasta,v.evidencia,p.id AS predio_id,p.codigo,p.direccion,p.sector,p.estado_ubicacion,p.archivado
      FROM gestion.vinculo v JOIN gestion.predio p ON p.id=v.predio_id WHERE v.persona_id=$1 ORDER BY v.desde DESC,v.id LIMIT 100`,
        [id],
      )
    ).rows;
    const units = (
      await pool.query(
        `SELECT r.id,r.tipo,r.desde,r.hasta,r.evidencia,u.id AS unidad_id,u.codigo AS unidad_codigo,
        u.nombre AS unidad_nombre,u.tipo AS unidad_tipo,u.activa AS unidad_activa,
        p.id AS predio_id,p.codigo,p.direccion,p.archivado
        FROM gestion.relacion_unidad r JOIN gestion.unidad u ON u.id=r.unidad_id
        JOIN gestion.predio p ON p.id=u.predio_id
        WHERE r.persona_id=$1 ORDER BY r.desde DESC,r.id LIMIT 101`,
        [id],
      )
    ).rows;
    res.json({
      persona: person,
      vinculos: links,
      unidades: units.slice(0, 100),
      masUnidades: units.length > 100,
      limite: 100,
    });
  });
  router.post('/personas', auth.write, async (req, res) => {
    const data = personInput.parse(req.body);
    res.status(201).json(
      await transaction(pool, async (c) => {
        const person = (
          await c.query(
            `INSERT INTO gestion.persona(codigo,nombre,tipo,fuente_id)
        SELECT $1,$2,$3,id FROM gestion.fuente WHERE codigo=$4 RETURNING id,codigo,nombre,tipo`,
            [data.codigo, data.nombre, data.tipo, SOURCE],
          )
        ).rows[0];
        await audit(c, res.locals.user, null, 'persona.creada', null, person);
        return person;
      }),
    );
  });
  router.post('/predios/:id/vinculos', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      d = linkInput.parse(req.body);
    res.status(201).json(
      await transaction(pool, async (c) => {
        let personId = d.personaId;
        if (d.persona) {
          const person = (
            await c.query(
              `INSERT INTO gestion.persona(codigo,nombre,tipo,fuente_id)
            SELECT $1,$2,$3,id FROM gestion.fuente WHERE codigo=$4 RETURNING *`,
              [d.persona.codigo, d.persona.nombre, d.persona.tipo, SOURCE],
            )
          ).rows[0];
          personId = person.id;
          await audit(c, res.locals.user, id, 'persona.creada', null, person);
        }
        const row = (
          await c.query(
            `INSERT INTO gestion.vinculo(predio_id,persona_id,tipo,desde,hasta,evidencia) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
            [id, personId, d.tipo, d.periodo.desde, d.periodo.hasta, d.periodo.evidencia],
          )
        ).rows[0];
        await audit(c, res.locals.user, id, 'vinculo.creado', null, row);
        return row;
      }),
    );
  });
  router.post('/predios/:id/asignaciones', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      d = serviceInput.parse(req.body);
    res.status(201).json(
      await transaction(pool, async (c) => {
        await activeService(c, d.servicioId);
        const row = (
          await c.query(
            'INSERT INTO gestion.asignacion(predio_id,servicio_id,desde,hasta,estado,evidencia) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
            [id, d.servicioId, d.periodo.desde, d.periodo.hasta, d.estado, d.periodo.evidencia],
          )
        ).rows[0];
        await audit(c, res.locals.user, id, 'servicio.asignado', null, row);
        return row;
      }),
    );
  });
  router.post('/predios/:id/participaciones', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      d = participationInput.parse(req.body);
    res.status(201).json(
      await transaction(pool, async (c) => {
        await activeService(c, d.servicioId);
        const row = (
          await c.query(
            'INSERT INTO gestion.participacion(predio_id,servicio_id,desde,hasta,evidencia) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [id, d.servicioId, d.periodo.desde, d.periodo.hasta, d.periodo.evidencia],
          )
        ).rows[0];
        await audit(c, res.locals.user, id, 'participacion.creada', null, row);
        return row;
      }),
    );
  });
  router.post('/predios/:id/:relacion/:registro/cerrar', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      record = z.uuid().parse(req.params.registro);
    const kind = z.enum(['vinculos', 'asignaciones', 'participaciones']).parse(req.params.relacion);
    const table = {
      vinculos: 'vinculo',
      asignaciones: 'asignacion',
      participaciones: 'participacion',
    }[kind];
    const data = z.object({ hasta: z.iso.date() }).strict().parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        const before = (
          await c.query(
            `SELECT *,desde::text AS inicio FROM gestion.${table} WHERE id=$1 AND predio_id=$2 FOR UPDATE`,
            [record, id],
          )
        ).rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Relación no encontrada.');
        if (before.hasta)
          throw new AppError(409, 'ALREADY_CLOSED', 'La relación ya tiene fecha de cierre.');
        if (data.hasta < before.inicio)
          throw new AppError(400, 'INVALID_PERIOD', 'El cierre no puede ser anterior al inicio.');
        if (kind === 'participaciones') {
          const future = await c.query(
            'SELECT 1 FROM gestion.entrega WHERE participacion_id=$1 AND fecha>$2 AND NOT anulada LIMIT 1',
            [record, data.hasta],
          );
          if (future.rowCount)
            throw new AppError(
              409,
              'RECORDED_DELIVERIES',
              'Existen entregas posteriores a esa fecha. Revisa el historial.',
            );
        }
        const after = (
          await c.query(`UPDATE gestion.${table} SET hasta=$2 WHERE id=$1 RETURNING *`, [
            record,
            data.hasta,
          ])
        ).rows[0];
        await audit(c, res.locals.user, id, `${kind}.cerrada`, before, after);
        return after;
      }),
    );
  });
  router.post('/entregas', auth.write, async (req, res) => {
    const d = deliveryInput.parse(req.body),
      user = res.locals.user as User;
    res.status(201).json(
      await transaction(pool, async (c) => {
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [d.clave]);
        const previous = (
          await c.query('SELECT *,fecha::text AS fecha_texto FROM gestion.entrega WHERE clave=$1', [
            d.clave,
          ])
        ).rows[0];
        if (previous) {
          const same =
            previous.responsable_id === user.id &&
            previous.participacion_id === d.participacionId &&
            previous.fecha_texto === d.fecha &&
            previous.material === d.material &&
            (previous.cantidad === null ? null : Number(previous.cantidad)) === d.cantidad &&
            previous.unidad === d.unidad &&
            previous.observaciones === d.observaciones;
          if (!same)
            throw new AppError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'La clave de envío ya pertenece a otra entrega.',
            );
          return previous;
        }
        const participation = (
          await c.query(
            'SELECT *,desde::text AS inicio,hasta::text AS fin FROM gestion.participacion WHERE id=$1 FOR SHARE',
            [d.participacionId],
          )
        ).rows[0];
        if (
          !participation ||
          d.fecha < participation.inicio ||
          (participation.fin && d.fecha > participation.fin)
        )
          throw new AppError(
            400,
            'INVALID_PERIOD',
            'La entrega debe estar dentro del periodo de participación.',
          );
        const today = (
          await c.query("SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS hoy")
        ).rows[0].hoy;
        if (d.fecha > today)
          throw new AppError(
            400,
            'FUTURE_DELIVERY',
            'Una entrega registrada no puede tener fecha futura.',
          );
        const row = (
          await c.query(
            `INSERT INTO gestion.entrega(participacion_id,fecha,material,cantidad,unidad,observaciones,responsable_id,clave)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
              d.participacionId,
              d.fecha,
              d.material,
              d.cantidad,
              d.unidad,
              d.observaciones,
              user.id,
              d.clave,
            ],
          )
        ).rows[0];
        await audit(c, user, participation.predio_id, 'entrega.registrada', null, row);
        return row;
      }),
    );
  });
  router.post('/entregas/:id/anular', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      d = z
        .object({
          motivo: z.string().trim().min(5).max(1000),
          version: z.number().int().positive().optional(),
        })
        .strict()
        .parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        const before = (
          await c.query(
            'SELECT e.*,p.predio_id FROM gestion.entrega e JOIN gestion.participacion p ON p.id=e.participacion_id WHERE e.id=$1 FOR UPDATE OF e',
            [id],
          )
        ).rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Entrega no encontrada.');
        if (before.anulada) throw new AppError(409, 'ALREADY_VOID', 'La entrega ya está anulada.');
        if (
          (d.version === undefined && before.version !== 1) ||
          (d.version !== undefined && d.version !== before.version)
        )
          throw new AppError(409, 'VERSION_CONFLICT', 'La entrega cambió. Recarga la ficha.');
        const after = (
          await c.query(
            'UPDATE gestion.entrega SET anulada=true,motivo_anulacion=$2,motivo_cambio=$2,usuario_cambio=$3,version=version+1 WHERE id=$1 RETURNING *',
            [id, d.motivo, (res.locals.user as User).id],
          )
        ).rows[0];
        await audit(c, res.locals.user, before.predio_id, 'entrega.anulada', before, after);
        return after;
      }),
    );
  });
  router.get('/reportes', async (req, res) => {
    const d = reportInput.parse(req.query);
    const rows = await reportRows(pool, d);
    res.json({
      periodo: d,
      items: rows,
      fuente: SOURCE,
      aviso:
        'Solo eventos sintéticos registrados y no anulados. Cantidades separadas por material y unidad; no representa cobertura municipal.',
    });
  });
  router.get('/reportes/exportar', auth.privateData, async (req, res) => {
    const filter = reportInput.parse(req.query);
    const rows = await reportRows(pool, filter);
    const columns = [
      'fuente',
      'desde',
      'hasta',
      'sector',
      'filtro_material',
      'filtro_servicio',
      'servicio',
      'material',
      'unidad',
      'entregas',
      'cantidad_medida',
      'sin_medicion',
    ];
    const lines = [
      columns.map(csvCell).join(';'),
      ...rows.map((row) =>
        [
          SOURCE,
          filter.desde,
          filter.hasta,
          filter.sector,
          filter.material,
          filter.servicio,
          row.servicio,
          row.material,
          row.unidad,
          row.entregas,
          row.cantidad,
          row.sin_medicion,
        ]
          .map(csvCell)
          .join(';'),
      ),
    ];
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="bagua-entregas-prueba.csv"');
    res.send('\uFEFF' + lines.join('\r\n') + '\r\n');
  });
  router.post('/importaciones/columnas', auth.write, async (req, res) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración puede importar.');
    const data = z
      .object({ contenido: z.string().min(1).max(700000), separador: z.enum([',', ';', '\t']) })
      .strict()
      .parse(req.body);
    const parsed = parseCsv(data.contenido, data.separador);
    res.json({ columnas: parsed.headers, filas: parsed.rows.length });
  });
  router.post('/importaciones/validar', auth.write, async (req, res) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración puede importar.');
    const csv = req.body?.formato === 'csv';
    const parsedFile = csv
      ? csvInput.parse(
          Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'formato')),
        )
      : null;
    const raw =
      csv && parsedFile
        ? { predios: mapCsv(parsedFile) }
        : z
            .object({
              version: z.literal(1),
              sintetico: z.literal(true),
              predios: z.array(z.unknown()).min(1).max(500),
            })
            .strict()
            .parse(req.body);
    const errors: { fila: number; mensaje: string }[] = [],
      rows: ReturnType<typeof predioInput.parse>[] = [];
    const codes = new Set<string>();
    raw.predios.forEach((row, i) => {
      const parsed = predioInput.safeParse(row);
      if (!parsed.success) {
        errors.push({
          fila: i + 1,
          mensaje: parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        });
        return;
      }
      if (codes.has(parsed.data.codigo))
        errors.push({ fila: i + 1, mensaje: 'Código duplicado dentro del lote.' });
      codes.add(parsed.data.codigo);
      rows.push(parsed.data);
    });
    if (errors.length) {
      res.status(400).json({ errores: errors, aplicado: false });
      return;
    }
    res.json(
      await repo.importPreview(
        res.locals.user,
        rows,
        parsedFile
          ? {
              formato: 'csv',
              archivo: parsedFile.nombre,
              separador: parsedFile.separador,
              mapeo: parsedFile.mapeo,
              sha256: createHash('sha256').update(parsedFile.contenido).digest('hex'),
            }
          : { formato: 'json', version: 1 },
      ),
    );
  });
  router.post('/importaciones/:id/aplicar', auth.write, async (req, res) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración puede importar.');
    res.json(
      await repo.applyImport(
        res.locals.user,
        z.uuid().parse(req.params.id),
        resolutionsInput.parse(req.body).resoluciones,
      ),
    );
  });
  return router;
}
