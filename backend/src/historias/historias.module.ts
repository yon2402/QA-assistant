import { Module } from '@nestjs/common';
import { HistoriasService } from './historias.service';
import { HistoriasController } from './historias.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [HistoriasService],
  controllers: [HistoriasController],
  exports: [HistoriasService],
})
export class HistoriasModule {}
