// Crea un usuario de ejemplo (rol QA, el único de la plataforma) para probar la aplicación
// de inmediato. Todos los datos son ficticios. Uso: npm run db:seed
import 'dotenv/config';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const usuarios = [
    { nombre: 'Jhon Edison Montaño Parra', email: 'qa@thomasinstruments.test', password: 'Password123!', role: 'QA' },
  ];

  for (const u of usuarios) {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
    if (exists.rows.length > 0) {
      console.log(`Ya existe: ${u.email}`);
      continue;
    }
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query('INSERT INTO users (nombre, email, password_hash, role) VALUES ($1,$2,$3,$4)', [
      u.nombre,
      u.email,
      hash,
      u.role,
    ]);
    console.log(`Creado: ${u.email} (${u.role}) — contraseña: ${u.password}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error en el seed:', err);
  process.exit(1);
});
