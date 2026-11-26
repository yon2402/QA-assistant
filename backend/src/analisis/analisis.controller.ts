import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AnalisisService } from './analisis.service';
import { UpdateCasoDto } from './dto/update-caso.dto';
import { AuditService } from '../audit/audit.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnalisisController {
  constructor(
    private readonly analisis: AnalisisService,
    private readonly audit: AuditService,
  ) {}

  @Post('historias/:historiaId/analizar')
  async analyze(@Param('historiaId') historiaId: string, @CurrentUser() user: any) {
    const resultado = await this.analisis.analyze(historiaId);
    await this.audit.log(user.userId, 'ANALIZAR_IA', 'HISTORIA_USUARIO', historiaId, 'Generación asistida por IA ejecutada.');
    return resultado;
  }

  @Get('historias/:historiaId/analisis')
  findByHistoria(@Param('historiaId') historiaId: string) {
    return this.analisis.findByHistoria(historiaId);
  }

  @Get('analisis/:id')
  findOne(@Param('id') id: string) {
    return this.analisis.findOne(id);
  }

  @Patch('casos/:id')
  async updateCaso(@Param('id') id: string, @Body() dto: UpdateCasoDto, @CurrentUser() user: any) {
    const caso = await this.analisis.updateCaso(id, dto);
    await this.audit.log(user.userId, 'EDITAR', 'CASO_PRUEBA', id, `Caso ${caso.codigo} editado manualmente.`);
    return caso;
  }

  // RF-13: si se pasa ?historiaId=..., el dashboard se filtra a esa Historia
  // de Usuario (documento) en vez de mostrar siempre todo el sistema junto.
  @Get('dashboard/stats')
  dashboard(@Query('historiaId') historiaId?: string) {
    return this.analisis.dashboardStats(historiaId);
  }
}
