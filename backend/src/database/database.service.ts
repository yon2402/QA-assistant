import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';

// Capa de acceso a datos sobre PostgreSQL usando el driver `pg` directamente
// (en lugar de un ORM) para evitar dependencias de red en tiempo de build en
// este entorno. La base de datos y el esquema (sql/schema.sql) son los mismos
// que se documentaron en la propuesta (PostgreSQL); cambiar a un ORM como
// Prisma más adelante es compatible, ya que las tablas y tipos se conservan.
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async query<T extends QueryResultRow = any>(text: string, params: any[] = []) {
    return this.pool.query<T>(text, params);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
