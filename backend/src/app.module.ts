import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HistoriasModule } from './historias/historias.module';
import { LlmGatewayModule } from './llm-gateway/llm-gateway.module';
import { AnalisisModule } from './analisis/analisis.module';
import { ExportModule } from './export/export.module';
import { AuditModule } from './audit/audit.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    HistoriasModule,
    LlmGatewayModule,
    AnalisisModule,
    ExportModule,
    AuditModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
