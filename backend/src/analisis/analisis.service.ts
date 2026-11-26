import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LLM_PROVIDER, LlmProvider } from '../llm-gateway/llm-provider.interface';
import { HistoriasService } from '../historias/historias.service';
import { UpdateCasoDto } from './dto/update-caso.dto';
import { derivarCamposDesdeTexto } from '../historias/document-extractor';

@Injectable()
export class AnalisisService {
  constructor(
    private readonly db: DatabaseService,
    private readonly historias: HistoriasService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  // RF-05 a RF-12: dispara la generación asistida por IA para una HU y persiste el resultado.
  async analyze(historiaId: string) {
    const historia = await this.historias.findOne(historiaId);
    // El contexto del proyecto y lo que queda fuera de alcance se leen del
    // texto original del documento, para redactar el resumen del proyecto.
    const delDocumento = derivarCamposDesdeTexto(historia.contenido_extraido ?? '');

    const resultado = await this.llm.analyzeHistoriaUsuario({
      titulo: historia.titulo,
      descripcion: historia.descripcion,
      modulo: historia.modulo,
      criteriosAceptacion: historia.criterios_aceptacion,
      prioridadNegocio: historia.prioridad_negocio,
      contexto: delDocumento.contexto,
      fueraDeAlcance: delDocumento.fueraDeAlcance,
    });

    const analisisRes = await this.db.query(
      `INSERT INTO analisis (historia_id, resumen, tiempo_estimado_total_minutos) VALUES ($1, $2, $3) RETURNING *`,
      [historiaId, resultado.resumen, resultado.tiempoEstimadoTotalMinutos],
    );
    const analisis = analisisRes.rows[0];

    const escenarioIdByTipo: Record<string, string> = {};
    for (const esc of resultado.escenarios) {
      const r = await this.db.query(
        `INSERT INTO escenarios (analisis_id, tipo, descripcion) VALUES ($1, $2, $3) RETURNING *`,
        [analisis.id, esc.tipo, esc.descripcion],
      );
      escenarioIdByTipo[esc.tipo] = r.rows[0].id;
    }

    for (const caso of resultado.casos) {
      await this.db.query(
        `INSERT INTO casos_prueba
          (analisis_id, escenario_id, codigo, nombre, objetivo, precondiciones, datos_prueba, pasos,
           resultado_esperado, riesgo, riesgo_justificacion, prioridad, prioridad_justificacion,
           automatizable, herramienta_sugerida, criterio_aceptacion_relacionado, tiempo_estimado_minutos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          analisis.id,
          escenarioIdByTipo[caso.escenarioTipo] ?? null,
          caso.codigo,
          caso.nombre,
          caso.objetivo,
          caso.precondiciones,
          caso.datosPrueba,
          caso.pasos,
          caso.resultadoEsperado,
          caso.riesgo,
          caso.riesgoJustificacion,
          caso.prioridad,
          caso.prioridadJustificacion,
          caso.automatizable,
          caso.herramientaSugerida,
          caso.criterioAceptacionRelacionado,
          caso.tiempoEstimadoMinutos,
        ],
      );
    }

    for (const t of resultado.trazabilidad) {
      await this.db.query(
        `INSERT INTO matriz_trazabilidad (analisis_id, criterio_aceptacion, escenario, caso_prueba_codigo, prioridad)
         VALUES ($1,$2,$3,$4,$5)`,
        [analisis.id, t.criterioAceptacion, t.escenario, t.casoPruebaCodigo, t.prioridad],
      );
    }

    return this.findOne(analisis.id);
  }

  async findByHistoria(historiaId: string) {
    const res = await this.db.query(
      `SELECT * FROM analisis WHERE historia_id = $1 ORDER BY created_at DESC`,
      [historiaId],
    );
    return res.rows;
  }

  async findOne(analisisId: string) {
    const analisisRes = await this.db.query(`SELECT * FROM analisis WHERE id = $1`, [analisisId]);
    if (analisisRes.rows.length === 0) throw new NotFoundException('Análisis no encontrado.');
    const analisis = analisisRes.rows[0];

    const escenarios = (await this.db.query(`SELECT * FROM escenarios WHERE analisis_id = $1`, [analisisId])).rows;
    const casos = (
      await this.db.query(`SELECT * FROM casos_prueba WHERE analisis_id = $1 ORDER BY codigo ASC`, [analisisId])
    ).rows;
    const trazabilidad = (
      await this.db.query(`SELECT * FROM matriz_trazabilidad WHERE analisis_id = $1`, [analisisId])
    ).rows;

    return { ...analisis, escenarios, casos, trazabilidad };
  }

  // RF-17: edición manual de cualquier artefacto generado por la IA. RF-15: registro manual del resultado.
  async updateCaso(casoId: string, dto: UpdateCasoDto) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    const map: Record<string, any> = {
      nombre: dto.nombre,
      objetivo: dto.objetivo,
      precondiciones: dto.precondiciones,
      datos_prueba: dto.datosPrueba,
      pasos: dto.pasos,
      resultado_esperado: dto.resultadoEsperado,
      riesgo: dto.riesgo,
      prioridad: dto.prioridad,
      resultado_ejecucion: dto.resultadoEjecucion,
    };
    for (const [col, val] of Object.entries(map)) {
      if (val !== undefined) {
        fields.push(`${col} = $${i++}`);
        values.push(val);
      }
    }
    if (fields.length === 0) {
      const r = await this.db.query('SELECT * FROM casos_prueba WHERE id = $1', [casoId]);
      if (r.rows.length === 0) throw new NotFoundException('Caso de prueba no encontrado.');
      return r.rows[0];
    }
    // Registrar solo el resultado de ejecución (RF-15) no es "editar" el caso:
    // la marca de edición manual se reserva para cambios al contenido generado.
    const editaContenido = Object.entries(map).some(([col, val]) => col !== 'resultado_ejecucion' && val !== undefined);
    if (editaContenido) fields.push('editado_manualmente = true');
    fields.push('updated_at = now()');
    values.push(casoId);
    const res = await this.db.query(
      `UPDATE casos_prueba SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (res.rows.length === 0) throw new NotFoundException('Caso de prueba no encontrado.');
    return res.rows[0];
  }

  // RF-13: métricas para el dashboard. Si se pasa historiaId, todas las
  // métricas se filtran a esa única Historia de Usuario (documento).
  //
  // Los conteos de casos usan solo el ANÁLISIS MÁS RECIENTE de cada Historia:
  // "Volver a analizar" crea un análisis nuevo y conserva los anteriores como
  // historial, así que sumarlos todos duplicaría los casos en el dashboard.
  async dashboardStats(historiaId?: string) {
    const params = historiaId ? [historiaId] : [];
    const ultimos = `(SELECT DISTINCT ON (historia_id) id, historia_id FROM analisis
                      ORDER BY historia_id, created_at DESC)`;
    const filtro = historiaId ? 'WHERE a.historia_id = $1' : '';
    const casosDe = `FROM casos_prueba c JOIN ${ultimos} a ON a.id = c.analisis_id ${filtro}`;

    const [historias, analisisCount, historiasAnalizadas, resumen, porPrioridad, porRiesgo, porEstado] =
      await Promise.all([
        historiaId
          ? this.db.query('SELECT COUNT(*)::int AS count FROM historias_usuario WHERE id = $1', params)
          : this.db.query('SELECT COUNT(*)::int AS count FROM historias_usuario'),
        this.db.query(`SELECT COUNT(*)::int AS count FROM analisis a ${filtro}`, params),
        this.db.query(`SELECT COUNT(*)::int AS count FROM ${ultimos} a ${filtro}`, params),
        this.db.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE c.riesgo IN ('ALTO','CRITICO'))::int AS riesgo_alto,
                  COUNT(*) FILTER (WHERE c.automatizable = 'si')::int AS automatizables,
                  COALESCE(SUM(c.tiempo_estimado_minutos),0)::int AS minutos
           ${casosDe}`,
          params,
        ),
        this.db.query(`SELECT c.prioridad AS prioridad, COUNT(*)::int AS count ${casosDe} GROUP BY c.prioridad`, params),
        this.db.query(`SELECT c.riesgo AS riesgo, COUNT(*)::int AS count ${casosDe} GROUP BY c.riesgo`, params),
        this.db.query(
          `SELECT c.resultado_ejecucion AS resultado_ejecucion, COUNT(*)::int AS count ${casosDe}
           GROUP BY c.resultado_ejecucion`,
          params,
        ),
      ]);

    const r = resumen.rows[0];
    return {
      totalHistorias: historias.rows[0].count,
      totalAnalisis: analisisCount.rows[0].count,
      historiasAnalizadas: historiasAnalizadas.rows[0].count,
      totalCasos: r.total,
      casosRiesgoAltoOCritico: r.riesgo_alto,
      casosAutomatizables: r.automatizables,
      tiempoEstimadoTotalMinutos: r.minutos,
      porPrioridad: porPrioridad.rows,
      porRiesgo: porRiesgo.rows,
      porEstadoEjecucion: porEstado.rows,
    };
  }
}
