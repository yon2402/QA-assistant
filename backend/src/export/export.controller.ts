import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExportService } from './export.service';

@Controller('analisis/:id/export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('csv')
  async csv(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.exportService.toCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="analisis-${id}.csv"`);
    res.send(csv);
  }

  @Get('pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.exportService.toPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="analisis-${id}.pdf"`);
    res.send(buffer);
  }
}
