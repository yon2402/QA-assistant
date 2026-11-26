import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // La plataforma tiene un único rol (QA): cualquier usuario autenticado
  // puede consultar el registro de auditoría.
  @Get()
  list() {
    return this.audit.list();
  }
}
