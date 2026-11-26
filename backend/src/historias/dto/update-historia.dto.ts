import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateHistoriaDto {
  @IsOptional() @IsString() @MinLength(3) titulo?: string;
  @IsOptional() @IsString() @MinLength(5) descripcion?: string;
  @IsOptional() @IsString() modulo?: string;
  @IsOptional() @IsString() criteriosAceptacion?: string;
  @IsOptional() @IsString() reglasDeNegocio?: string;
  @IsOptional() @IsString() prioridadNegocio?: string;
  @IsOptional() @IsString() dependencias?: string;
  @IsOptional() @IsString() infoAdicional?: string;
}
