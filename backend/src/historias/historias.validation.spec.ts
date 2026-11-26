import { BadRequestException } from '@nestjs/common';
import { HistoriasService, TAMANO_MAXIMO_BYTES, TIPOS_PERMITIDOS } from './historias.service';

// RF-04: validar tipo y tamaño de los archivos cargados antes de procesarlos.
describe('HistoriasService.validarArchivo', () => {
  const service = new HistoriasService({} as any);

  const archivo = (overrides: Partial<Express.Multer.File>): Express.Multer.File =>
    ({
      mimetype: TIPOS_PERMITIDOS[0],
      size: 1024,
      originalname: 'documento.pdf',
      ...overrides,
    }) as Express.Multer.File;

  it('acepta un archivo PDF dentro del límite de tamaño', () => {
    expect(() => service.validarArchivo(archivo({}))).not.toThrow();
  });

  it('rechaza un tipo de archivo no permitido', () => {
    expect(() => service.validarArchivo(archivo({ mimetype: 'application/x-msdownload' }))).toThrow(
      BadRequestException,
    );
  });

  it('rechaza un archivo que excede el tamaño máximo (10 MB)', () => {
    expect(() => service.validarArchivo(archivo({ size: TAMANO_MAXIMO_BYTES + 1 }))).toThrow(BadRequestException);
  });

  it('acepta un archivo justo en el límite de tamaño', () => {
    expect(() => service.validarArchivo(archivo({ size: TAMANO_MAXIMO_BYTES }))).not.toThrow();
  });
});
