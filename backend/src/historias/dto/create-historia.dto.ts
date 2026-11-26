import { IsOptional, IsString, MinLength } from 'class-validator';

// Desde la simplificación del flujo de creación, el usuario solo tiene que
// escribir el Título y, opcionalmente, subir un documento de soporte: la
// aplicación deriva Módulo, Descripción y Criterios de aceptación del propio
// documento (ver historias.service.ts / document-extractor.ts). Estos tres
// campos quedan como opcionales para permitir ese flujo, pero siguen
// pudiendo completarse a mano si el usuario prefiere no subir un documento o
// quiere sobrescribir lo que la aplicación detectó automáticamente.
export class CreateHistoriaDto {
  @IsString()
  @MinLength(3)
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  modulo?: string;

  @IsOptional()
  @IsString()
  criteriosAceptacion?: string;

  @IsOptional() @IsString() reglasDeNegocio?: string;
  @IsOptional() @IsString() prioridadNegocio?: string;
  @IsOptional() @IsString() dependencias?: string;
  @IsOptional() @IsString() infoAdicional?: string;
}
