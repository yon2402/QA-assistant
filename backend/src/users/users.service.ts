import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Role, SafeUser, User } from './user.types';

function toSafeUser(u: User): SafeUser {
  const { password_hash, ...safe } = u;
  return safe;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findByEmail(email: string): Promise<User | null> {
    const res = await this.db.query<User>('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0] ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const res = await this.db.query<User>('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] ?? null;
  }

  async create(nombre: string, email: string, passwordHash: string, role: Role): Promise<SafeUser> {
    const res = await this.db.query<User>(
      `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, email, passwordHash, role],
    );
    return toSafeUser(res.rows[0]);
  }

  async list(): Promise<SafeUser[]> {
    const res = await this.db.query<User>('SELECT * FROM users ORDER BY created_at ASC');
    return res.rows.map(toSafeUser);
  }

  toSafeUser = toSafeUser;
}
