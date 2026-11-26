import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateCasoDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() objetivo?: string;
  @IsOptional() @IsString() precondiciones?: string;
  @IsOptional() @IsString() datosPrueba?: string;
  @IsOptional() @IsString() pasos?: string;
  @IsOptional() @IsString() resultadoEsperado?: string;
  @IsOptional() @IsEnum(['BAJO', 'MEDIO', 'ALTO', 'CRITICO']) riesgo?: string;
  @IsOptional() @IsEnum(['CRITICA', 'ALTA', 'MEDIA', 'BAJA']) prioridad?: string;
  @IsOptional() @IsEnum(['PENDIENTE', 'APROBADO', 'FALLIDO']) resultadoEjecucion?: string;
}
