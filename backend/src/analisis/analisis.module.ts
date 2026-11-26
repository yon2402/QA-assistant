import { Module } from '@nestjs/common';
import { AnalisisService } from './analisis.service';
import { AnalisisController } from './analisis.controller';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { HistoriasModule } from '../historias/historias.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [LlmGatewayModule, HistoriasModule, AuditModule],
  providers: [AnalisisService],
  controllers: [AnalisisController],
  exports: [AnalisisService],
})
export class AnalisisModule {}
