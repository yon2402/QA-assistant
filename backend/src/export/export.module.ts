import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { AnalisisModule } from '../analisis/analisis.module';

@Module({
  imports: [AnalisisModule],
  providers: [ExportService],
  controllers: [ExportController],
})
export class ExportModule {}
