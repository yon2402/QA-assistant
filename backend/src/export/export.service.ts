import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { AnalisisService } from '../analisis/analisis.service';

@Injectable()
export class ExportService {
  constructor(private readonly analisis: AnalisisService) {}

  // RF-16: exportar resultados a CSV.
  async toCsv(analisisId: string): Promise<string> {
    const data = await this.analisis.findOne(analisisId);
    const headers = [
      'codigo',
      'nombre',
      'objetivo',
      'precondiciones',
      'datos_prueba',
      'pasos',
      'resultado_esperado',
      'riesgo',
      'riesgo_justificacion',
      'prioridad',
      'prioridad_justificacion',
      'automatizable',
      'herramienta_sugerida',
      'tiempo_estimado_minutos',
      'resultado_ejecucion',
    ];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    for (const c of data.casos) {
      lines.push(headers.map((h) => escape((c as any)[h])).join(','));
    }
    return lines.join('\n');
  }

  // RF-16: exportar resultados a PDF (versión básica, legible).
  async toPdf(analisisId: string): Promise<Buffer> {
    const data = await this.analisis.findOne(analisisId);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const tiempoTotal = (data.casos as any[]).reduce((sum, c) => sum + (c.tiempo_estimado_minutos ?? 0), 0);

      doc.fontSize(16).text('Resultado del análisis asistido por IA', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Resumen: ${data.resumen}`);
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .fillColor('#1F3A5F')
        .text(`Tiempo estimado total de ejecución manual: ${tiempoTotal} minutos (≈ ${(tiempoTotal / 60).toFixed(1)} horas)`);
      doc.fillColor('#000000');
      doc.moveDown();

      doc.fontSize(13).text(`Casos de prueba (${(data.casos as any[]).length})`);
      doc.moveDown(0.3);
      for (const c of data.casos as any[]) {
        doc.fontSize(11).fillColor('#1F3A5F').text(`${c.codigo} — ${c.nombre}`);
        doc
          .fontSize(9)
          .fillColor('#000000')
          .text(`Objetivo: ${c.objetivo}`)
          .text(`Precondiciones: ${c.precondiciones}`)
          .text(`Datos de prueba: ${c.datos_prueba}`)
          .text(`Pasos: ${c.pasos}`)
          .text(`Resultado esperado: ${c.resultado_esperado}`)
          .text(`Riesgo: ${c.riesgo}  |  Prioridad: ${c.prioridad}  |  Automatizable: ${c.automatizable}`)
          .text(`Análisis de riesgo: ${c.riesgo_justificacion ?? ''} ${c.prioridad_justificacion ?? ''}`.trim())
          .text(`Tiempo estimado: ${c.tiempo_estimado_minutos} min  |  Resultado de ejecución: ${c.resultado_ejecucion}`);
        doc.moveDown(0.6);
      }
      doc.end();
    });
  }
}
