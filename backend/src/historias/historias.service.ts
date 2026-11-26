import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { DatabaseService } from '../database/database.service';
import { CreateHistoriaDto } from './dto/create-historia.dto';
import { UpdateHistoriaDto } from './dto/update-historia.dto';
import { derivarCamposDesdeTexto, extraerTextoDocumento } from './document-extractor';

// RF-04: tipos y tamaño máximo permitido para el documento de soporte (10 MB).
export const TIPOS_PERMITIDOS = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

@Injectable()
export class HistoriasService {
  constructor(private readonly db: DatabaseService) {}

  // Flujo simplificado: el usuario solo tiene que indicar el Título y, si
  // quiere, subir un documento de soporte. Si no escribió a mano Módulo /
  // Descripción / Criterios de aceptación, se derivan automáticamente del
  // texto del documento (ver document-extractor.ts). Si no hay documento NI
  // campos manuales, se pide al menos uno de los dos.
  async create(dto: CreateHistoriaDto, createdById: string, archivo?: Express.Multer.File) {
    if (archivo) this.validarArchivo(archivo);

    const tieneCamposManuales = Boolean(dto.modulo || dto.descripcion || dto.criteriosAceptacion);
    if (!archivo && !tieneCamposManuales) {
      throw new BadRequestException(
        'Sube un documento de soporte o completa manualmente Módulo, Descripción y Criterios de aceptación.',
      );
    }

    let contenidoExtraido = '';
    if (archivo) {
      contenidoExtraido = await extraerTextoDocumento(archivo.path, archivo.mimetype);
    }
    const derivado = derivarCamposDesdeTexto(contenidoExtraido);

    // Para cada campo: lo que el usuario escribió a mano tiene prioridad;
    // si lo dejó en blanco, se usa lo detectado automáticamente en el
    // documento; si tampoco se detectó nada reconocible, se usa un valor de
    // respaldo razonable (y, para los criterios, el documento completo, para
    // que la generación de casos de prueba pueda extraer de ahí todo lo que
    // sea posible en vez de quedarse sin información).
    const modulo = dto.modulo?.trim() || derivado.modulo || 'General';
    const descripcion =
      dto.descripcion?.trim() ||
      derivado.descripcion ||
      (contenidoExtraido ? this.resumirParaDescripcion(contenidoExtraido) : null) ||
      `Historia de Usuario "${dto.titulo}" (sin descripción detallada).`;
    const criteriosAceptacion =
      dto.criteriosAceptacion?.trim() ||
      derivado.criteriosAceptacion ||
      contenidoExtraido ||
      'No se especificaron criterios de aceptación.';

    const res = await this.db.query(
      `INSERT INTO historias_usuario
        (titulo, descripcion, modulo, criterios_aceptacion, reglas_de_negocio, prioridad_negocio,
         dependencias, info_adicional, contenido_extraido, archivo_nombre, archivo_tipo, archivo_tamano,
         archivo_ruta, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        dto.titulo,
        descripcion,
        modulo,
        criteriosAceptacion,
        dto.reglasDeNegocio ?? null,
        dto.prioridadNegocio?.trim() || derivado.prioridad || null,
        dto.dependencias ?? null,
        dto.infoAdicional ?? null,
        contenidoExtraido || null,
        archivo?.originalname ?? null,
        archivo?.mimetype ?? null,
        archivo?.size ?? null,
        archivo?.path ?? null,
        createdById,
      ],
    );
    return res.rows[0];
  }

  /** Usa el inicio del documento como descripción de respaldo cuando no se detectó una sección reconocible. */
  private resumirParaDescripcion(texto: string): string {
    const limpio = texto.replace(/\s+/g, ' ').trim();
    return limpio.length > 400 ? `${limpio.slice(0, 400)}…` : limpio;
  }

  validarArchivo(archivo: Express.Multer.File) {
    if (!TIPOS_PERMITIDOS.includes(archivo.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido (${archivo.mimetype}). Solo se aceptan PDF, DOCX o TXT.`,
      );
    }
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      throw new BadRequestException('El archivo supera el tamaño máximo permitido (10 MB).');
    }
  }

  async findAll() {
    // Se excluye contenido_extraido (puede ser un documento completo) para
    // no inflar el listado; se usa solo en el detalle de cada Historia.
    const res = await this.db.query(
      `SELECT h.id, h.titulo, h.descripcion, h.modulo, h.criterios_aceptacion, h.reglas_de_negocio,
              h.prioridad_negocio, h.dependencias, h.info_adicional, h.archivo_nombre, h.archivo_tipo,
              h.archivo_tamano, h.created_by_id, h.created_at, h.updated_at, u.nombre AS creado_por_nombre
       FROM historias_usuario h
       JOIN users u ON u.id = h.created_by_id
       ORDER BY h.created_at DESC`,
    );
    return res.rows;
  }

  async findOne(id: string) {
    const res = await this.db.query(`SELECT * FROM historias_usuario WHERE id = $1`, [id]);
    if (res.rows.length === 0) throw new NotFoundException('Historia de Usuario no encontrada.');
    return res.rows[0];
  }

  async update(id: string, dto: UpdateHistoriaDto) {
    await this.findOne(id);
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    const map: Record<string, any> = {
      titulo: dto.titulo,
      descripcion: dto.descripcion,
      modulo: dto.modulo,
      criterios_aceptacion: dto.criteriosAceptacion,
      reglas_de_negocio: dto.reglasDeNegocio,
      prioridad_negocio: dto.prioridadNegocio,
      dependencias: dto.dependencias,
      info_adicional: dto.infoAdicional,
    };
    for (const [col, val] of Object.entries(map)) {
      if (val !== undefined) {
        fields.push(`${col} = $${i++}`);
        values.push(val);
      }
    }
    if (fields.length === 0) return this.findOne(id);
    fields.push(`updated_at = now()`);
    values.push(id);
    const res = await this.db.query(
      `UPDATE historias_usuario SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    return res.rows[0];
  }

  async remove(id: string) {
    const historia = await this.findOne(id);
    // El borrado en cascada (ver sql/schema.sql) ya elimina análisis, escenarios,
    // casos de prueba y matriz de trazabilidad asociados a esta Historia de Usuario.
    await this.db.query(`DELETE FROM historias_usuario WHERE id = $1`, [id]);

    // Además, se borra del disco el documento de soporte que se hubiera subido,
    // para no dejar archivos huérfanos. Si falla (archivo ya no existe, etc.),
    // no debe impedir que la Historia de Usuario quede eliminada.
    if (historia.archivo_ruta) {
      try {
        await unlink(historia.archivo_ruta);
      } catch {
        // Ignorado intencionalmente: el archivo pudo haber sido movido o
        // borrado manualmente; la eliminación de la Historia ya se completó.
      }
    }

    return { ok: true };
  }
}
