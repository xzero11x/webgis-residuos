import { pool } from './pool.js';
import {
  createGestionRepository,
  SOURCE,
  transaction,
  audit,
} from '../modules/gestion/gestion.repository.js';
import { predioInput, type User } from '../modules/gestion/gestion.schema.js';
import { env } from '../config/env.js';
import { assertFixtureTarget } from './fixture-target.js';

try {
  await assertFixtureTarget(pool, env);
  const user = (
    await pool.query(
      "SELECT id,nombre,usuario,rol FROM gestion.usuario WHERE rol='administrador' AND activo ORDER BY creado_en LIMIT 1",
    )
  ).rows[0] as User | undefined;
  if (!user) throw Error('Primero crea un acceso con npm run gestion:usuario.');
  const repo = createGestionRepository(pool);
  for (let i = 1; i <= 8; i++) {
    const codigo = `SYN-BM-${String(i).padStart(3, '0')}`;
    const existing = await pool.query('SELECT id FROM gestion.predio WHERE codigo=$1', [codigo]);
    if (existing.rowCount) continue;
    await repo.save(
      user,
      predioInput.parse({
        codigo,
        direccion: `Dirección sintética de ensayo ${i}`,
        sector: i < 5 ? 'Sector sintético A' : 'Sector sintético B',
        uso: 'Uso de prueba, por validar',
        observaciones:
          'Registro totalmente ficticio. No representa un predio municipal ni un edificio Overture.',
      }),
    );
  }
  await transaction(pool, async (c) => {
    for (const [code, name] of [
      ['SYN-P-001', 'Persona sintética de ensayo A'],
      ['SYN-P-002', 'Entidad sintética de ensayo B'],
    ]) {
      const result = await c.query(
        `INSERT INTO gestion.persona(codigo,nombre,tipo,fuente_id)
        SELECT $1,$2,'natural',id FROM gestion.fuente WHERE codigo=$3 ON CONFLICT(fuente_id,codigo) DO NOTHING RETURNING *`,
        [code, name, SOURCE],
      );
      if (result.rows[0]) await audit(c, user, null, 'persona.creada', null, result.rows[0]);
    }
  });
  console.log(
    '8 predios sin ubicación y 2 personas sintéticas disponibles. Se conservaron los registros existentes.',
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : 'No se pudo preparar la muestra.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
