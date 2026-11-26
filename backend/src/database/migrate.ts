// Aplica sql/schema.sql contra la base de datos indicada en DATABASE_URL.
// Uso: npm run db:migrate
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

async function main() {
  const schemaPath = join(__dirname, '..', '..', 'sql', 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql);
    console.log('Migración aplicada correctamente.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error aplicando la migración:', err);
  process.exit(1);
});
