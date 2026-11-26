import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

// RF-18: registro en un log de auditoría de las acciones relevantes.
// RNF-09: cada registro guarda usuario, fecha/hora y entidad afectada.
@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async log(userId: string, accion: string, entidad: string, entidadId: string | null, detalle?: string) {
    await this.db.query(
      `INSERT INTO audit_log (user_id, accion, entidad, entidad_id, detalle) VALUES ($1, $2, $3, $4, $5)`,
      [userId, accion, entidad, entidadId, detalle ?? null],
    );
  }

  async list(limit = 100) {
    const res = await this.db.query(
      `SELECT a.*, u.email AS user_email FROM audit_log a
       JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows;
  }
}
