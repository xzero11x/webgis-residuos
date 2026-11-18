import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { pool } from './pool.js';
import { env } from '../config/env.js';
import { assertFixtureTarget } from './fixture-target.js';
import { SOURCE, audit, transaction } from '../modules/gestion/gestion.repository.js';
import { predioInput, type User } from '../modules/gestion/gestion.schema.js';

// Entrada explícita local/QA. Nunca se ejecuta durante arranque, migraciones o despliegue.
export async function seedScenarios(database: Pool, experience = false) {
  await assertFixtureTarget(database, env);
  return transaction(database, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('bagua:escenarios-curados-v1'))");
    const user = (
      await c.query(
        "SELECT id,nombre,usuario,rol FROM gestion.usuario WHERE rol='administrador' AND activo ORDER BY creado_en LIMIT 1",
      )
    ).rows[0] as User | undefined;
    if (!user) throw Error('Se requiere un administrador local creado mediante gestion:usuario.');
    const source = (await c.query('SELECT id FROM gestion.fuente WHERE codigo=$1', [SOURCE]))
      .rows[0];
    if (!source) throw Error('Falta la fuente sintética de gestión; ejecuta las migraciones.');
    const prefix = experience ? 'SYN-BAGUA-VIDA-' : 'SYN-BAGUA-';
    const evidence = `Escenario sintético curado BAGUA ${experience ? 'VIDA' : 'V1'}. No representa información municipal oficial.`;
    async function record(
      sql: string,
      values: unknown[],
      action: string,
      parent: string | null = null,
    ) {
      const row = (await c.query(sql, values)).rows[0];
      if (row) await audit(c, user!, parent, action, null, row);
      return row;
    }
    const persons = [];
    for (const [code, name] of [
      ['ALBA', 'Persona ficticia Alba · BAGUA'],
      ['BRUNO', 'Persona ficticia Bruno · BAGUA'],
      ['CELIA', 'Persona ficticia Celia · BAGUA'],
    ]) {
      await record(
        "INSERT INTO gestion.persona(codigo,nombre,tipo,fuente_id) VALUES($1,$2,'natural',$3) ON CONFLICT(fuente_id,codigo) DO NOTHING RETURNING *",
        [
          prefix + 'PER-' + code,
          experience
            ? (
                {
                  ALBA: 'Alba Ríos Salazar · persona ficticia',
                  BRUNO: 'Bruno Vásquez Torres · persona ficticia',
                  CELIA: 'Celia Rojas Medina · persona ficticia',
                } as Record<string, string>
              )[code || ''] || name
            : name,
          source.id,
        ],
        'persona.creada',
      );
      persons.push(
        (
          await c.query('SELECT id FROM gestion.persona WHERE fuente_id=$1 AND codigo=$2', [
            source.id,
            prefix + 'PER-' + code,
          ])
        ).rows[0],
      );
      // Documento ficticio (F-########): permite probar la búsqueda por documento sin
      // asociar identificadores reales.
      await c.query(
        'UPDATE gestion.persona SET documento=$3 WHERE fuente_id=$1 AND codigo=$2 AND documento IS NULL',
        [
          source.id,
          prefix + 'PER-' + code,
          `F-${experience ? 9000000 : 9100000}${({ ALBA: 1, BRUNO: 2, CELIA: 3 } as Record<string, number>)[code || ''] ?? 9}`,
        ],
      );
    }
    const services = [];
    for (const [code, name] of [
      ['ORGANICOS', 'Orgánicos · escenario sintético BAGUA'],
      ['APROVECHABLES', 'Aprovechables · escenario sintético BAGUA'],
      ['CONVENCIONAL', 'Convencional · escenario sintético BAGUA'],
    ]) {
      await record(
        'INSERT INTO gestion.servicio(codigo,nombre) VALUES($1,$2) ON CONFLICT(codigo) DO NOTHING RETURNING *',
        ['TEST-BAGUA-' + code, name],
        'catalogo.servicio.creado',
      );
      services.push(
        (
          await c.query('SELECT id,activo FROM gestion.servicio WHERE codigo=$1', [
            'TEST-BAGUA-' + code,
          ])
        ).rows[0],
      );
    }
    const created: string[] = [];
    for (const [code, address, use] of [
      ['VIVIENDA', 'Referencia ficticia vivienda familiar BAGUA', 'Residencial sintético'],
      ['MULTI', 'Referencia ficticia vivienda y local BAGUA', 'Mixto sintético'],
      [
        'SIN-UBICACION',
        'Dirección pendiente de entrega oficial · referencia ficticia BAGUA',
        'Comercial sintético',
      ],
      [
        'REVISION',
        'Referencia ficticia con dos candidatos cartográficos BAGUA',
        'Residencial sintético',
      ],
      ['ARCHIVADO', 'Referencia ficticia histórica archivada BAGUA', 'Residencial sintético'],
    ]) {
      const codeFull = prefix + code;
      // Si alguien ya usó/editó el escenario se conserva íntegramente; tampoco se reponen sus hijos.
      const predio = await record(
        `INSERT INTO gestion.predio(fuente_id,codigo,direccion,sector,uso,observaciones)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(fuente_id,codigo) DO NOTHING RETURNING *`,
        [
          source.id,
          codeFull,
          experience
            ? (
                {
                  VIVIENDA: 'Jr. Amazonas 428 · dirección de demostración',
                  MULTI: 'Jr. Comercio 216 · dirección de demostración',
                  'SIN-UBICACION': 'Pasaje Las Palmeras, lote 08 · dirección de demostración',
                  REVISION: 'Jr. Lambayeque 635 · dirección de demostración',
                  ARCHIVADO: 'Jr. Arequipa 112 · dirección histórica de demostración',
                } as Record<string, string>
              )[code || ''] || address
            : address,
          code === 'MULTI'
            ? 'Comercio · sector de demostración'
            : 'Residencial · sector de demostración',
          use,
          evidence,
        ],
        'predio.creado',
      );
      if (!predio) continue;
      created.push(codeFull);
      for (const [person, type, from, to] of [
        [persons[0]!.id, 'contribuyente', '2026-01-01', null],
        [persons[1]!.id, 'ocupante', '2026-01-01', null],
        [persons[2]!.id, 'responsable', '2025-01-01', '2025-12-31'],
      ]) {
        await record(
          'INSERT INTO gestion.vinculo(predio_id,persona_id,tipo,desde,hasta,evidencia) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [predio.id, person, type, from, to, evidence],
          'vinculo.creado',
          predio.id,
        );
      }
      for (const s of services.filter((s) => s.activo && code !== 'SIN-UBICACION')) {
        await record(
          "INSERT INTO gestion.asignacion(predio_id,servicio_id,desde,estado,evidencia) VALUES($1,$2,'2026-01-01','pendiente',$3) RETURNING *",
          [predio.id, s.id, evidence],
          'servicio.asignado',
          predio.id,
        );
      }
      if (code === 'MULTI' || code === 'VIVIENDA' || code === 'ARCHIVADO') {
        for (const s of services.slice(0, 2).filter((s) => s.activo)) {
          const participation = await record(
            "INSERT INTO gestion.participacion(predio_id,servicio_id,desde,evidencia) VALUES($1,$2,'2026-01-01',$3) RETURNING *",
            [predio.id, s.id, evidence],
            'participacion.creada',
            predio.id,
          );
          for (const [date, quantity] of [
            ['2026-09-15', 6.2],
            ['2026-10-12', null],
          ]) {
            const deliveryKey = createHash('sha256')
              .update(codeFull + s.id + String(date))
              .digest('hex')
              .slice(0, 32)
              .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
            // La clave UUID se obtiene con hash estable; no representa identidad de persona.
            await record(
              `INSERT INTO gestion.entrega(participacion_id,fecha,material,cantidad,unidad,observaciones,responsable_id,clave)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
              [
                participation.id,
                experience ? (date === '2026-09-15' ? '2026-11-03' : '2026-11-10') : date,
                s.id === services[0]!.id
                  ? experience
                    ? 'Restos de frutas y verduras'
                    : 'Material orgánico sintético'
                  : experience
                    ? 'Cartón limpio y botellas PET'
                    : 'Material aprovechable sintético',
                experience && quantity !== null ? (code === 'MULTI' ? 8.4 : 3.2) : quantity,
                quantity === null ? null : 'kg',
                evidence,
                user.id,
                deliveryKey,
              ],
              'entrega.registrada',
              predio.id,
            );
          }
        }
      }
      if (code === 'MULTI') {
        for (const [unitCode, name, person] of [
          ['U-01', 'Vivienda familiar · segundo piso', persons[0]!.id],
          ['U-02', 'Bodega familiar · primer piso', persons[1]!.id],
        ]) {
          const unit = await record(
            "INSERT INTO gestion.unidad(predio_id,codigo,nombre,tipo,evidencia) VALUES($1,$2,$3,'unidad',$4) RETURNING *",
            [predio.id, unitCode, name, evidence],
            'unidad.creada',
            predio.id,
          );
          await record(
            "INSERT INTO gestion.relacion_unidad(unidad_id,persona_id,tipo,desde,evidencia,creado_por) VALUES($1,$2,'ocupante','2026-01-01',$3,$4) RETURNING *",
            [unit.id, person, evidence, user.id],
            'unidad.relacion_creada',
            predio.id,
          );
          if (services[0]!.activo)
            await record(
              "INSERT INTO gestion.relacion_unidad(unidad_id,servicio_id,tipo,estado,desde,evidencia,creado_por) VALUES($1,$2,'servicio','pendiente','2026-01-01',$3,$4) RETURNING *",
              [unit.id, services[0]!.id, evidence, user.id],
              'unidad.relacion_creada',
              predio.id,
            );
        }
      }
      if (!experience && (code === 'VIVIENDA' || code === 'REVISION')) {
        const buildings = (
          await c.query(`SELECT e.id,v.version_overture FROM bagua_master.edificio e CROSS JOIN bagua_master.version v
      WHERE v.id='bagua-master' AND NOT EXISTS(SELECT 1 FROM gestion.vinculo_espacial r WHERE r.edificio_id=e.id AND r.estado='confirmado') ORDER BY e.id LIMIT 2`)
        ).rows;
        for (const b of buildings.slice(0, code === 'VIVIENDA' ? 1 : 2)) {
          const proposal = await record(
            "INSERT INTO gestion.vinculo_espacial(predio_id,edificio_id,criterio,evidencia,version_overture,creado_por) VALUES($1,$2,'seleccion_mapa',$3,$4,$5) RETURNING *",
            [
              predio.id,
              b.id,
              evidence +
                ' Asociación ficticia sobre geometría auténtica, exclusivamente para ensayo.',
              b.version_overture,
              user.id,
            ],
            'espacial.propuesto',
            predio.id,
          );
          if (code === 'VIVIENDA') {
            const after = (
              await c.query(
                "UPDATE gestion.vinculo_espacial SET estado='confirmado',revisado_por=$2,revisado_en=now(),motivo=$3,version=version+1 WHERE id=$1 RETURNING *",
                [
                  proposal.id,
                  user.id,
                  'Decisión ficticia del escenario de prueba; no es correspondencia catastral municipal.',
                ],
              )
            ).rows[0];
            await audit(c, user, predio.id, 'espacial.confirmado', proposal, after);
          }
        }
      }
      if (code === 'SIN-UBICACION') {
        const input = predioInput.parse({
          codigo: codeFull,
          direccion: 'Dirección externa ficticia que requiere conciliación',
          sector: predio.sector,
          uso: predio.uso,
          observaciones: evidence,
        });
        const rows = JSON.stringify([input]);
        const batch = await record(
          'INSERT INTO gestion.importacion(huella,usuario_id,contenido,metadatos,base_revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(huella) DO NOTHING RETURNING *',
          [
            createHash('sha256').update(rows).digest('hex'),
            user.id,
            rows,
            JSON.stringify({ archivo: 'BAGUA-ESCENARIO-CONFLICTO.json', nota: evidence }),
            JSON.stringify({ [codeFull]: { id: predio.id, version: predio.version } }),
          ],
          'importacion.validada',
        );
        if (!batch) throw Error('El lote de ensayo ya existía sin su escenario. No se modificó.');
      }
      if (code === 'ARCHIVADO') {
        const archived = (
          await c.query(
            'UPDATE gestion.predio SET archivado=true,motivo_archivo=$2,archivo_usuario=$3,archivo_fecha=now(),version=version+1,actualizado_en=now() WHERE id=$1 RETURNING *',
            [predio.id, evidence + ' Archivo reversible de ensayo.', user.id],
          )
        ).rows[0];
        await audit(c, user, predio.id, 'predio.archivado', predio, archived);
      }
    }
    if (experience) {
      // Vinculación espacial sintética sobre geometrías auténticas de Overture, para que el
      // recorrido «predio → mapa» y «edificio → predio» se pueda probar. Idempotente: solo
      // actúa sobre predios del escenario que aún no tienen vínculos, y nunca inventa
      // coordenadas administrativas (la ubicación del predio sigue pendiente).
      for (const code of ['VIVIENDA', 'MULTI', 'REVISION']) {
        const predio = (
          await c.query(
            'SELECT id FROM gestion.predio WHERE fuente_id=$1 AND codigo=$2 AND NOT archivado',
            [source.id, prefix + code],
          )
        ).rows[0];
        if (!predio) continue;
        const has = await c.query('SELECT 1 FROM gestion.vinculo_espacial WHERE predio_id=$1', [
          predio.id,
        ]);
        if (has.rowCount) continue;
        const buildings = (
          await c.query(
            `SELECT e.id,v.version_overture FROM bagua_master.edificio e CROSS JOIN bagua_master.version v
             WHERE v.id='bagua-master' AND NOT EXISTS(SELECT 1 FROM gestion.vinculo_espacial r WHERE r.edificio_id=e.id)
             ORDER BY ST_Distance(e.geom,ST_SetSRID(ST_MakePoint(-78.5367,-5.6378),4326)) LIMIT 2`,
          )
        ).rows;
        for (const b of buildings.slice(0, code === 'REVISION' ? 2 : 1)) {
          const proposal = await record(
            "INSERT INTO gestion.vinculo_espacial(predio_id,edificio_id,criterio,evidencia,version_overture,creado_por) VALUES($1,$2,'seleccion_mapa',$3,$4,$5) RETURNING *",
            [
              predio.id,
              b.id,
              evidence +
                ' Asociación ficticia sobre geometría auténtica, exclusivamente para ensayo.',
              b.version_overture,
              user.id,
            ],
            'espacial.propuesto',
            predio.id,
          );
          if (code !== 'REVISION') {
            const after = (
              await c.query(
                "UPDATE gestion.vinculo_espacial SET estado='confirmado',revisado_por=$2,revisado_en=now(),motivo=$3,version=version+1 WHERE id=$1 RETURNING *",
                [
                  proposal.id,
                  user.id,
                  'Decisión ficticia del escenario de demostración; no es correspondencia catastral municipal.',
                ],
              )
            ).rows[0];
            await audit(c, user, predio.id, 'espacial.confirmado', proposal, after);
          }
        }
      }
    }
    return {
      creados: created,
      existentesConservados: 5 - created.length,
      aviso:
        'Escenarios sintéticos persistidos; sin coordenadas administrativas inventadas ni cambios de geometrías Overture.',
    };
  });
}
try {
  console.log(JSON.stringify(await seedScenarios(pool, process.argv.includes('--experiencia'))));
} catch (e) {
  console.error(e instanceof Error ? e.message : 'No se pudieron crear escenarios sintéticos.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
