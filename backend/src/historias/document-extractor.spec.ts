import { derivarCamposDesdeTexto } from './document-extractor';

describe('derivarCamposDesdeTexto', () => {
  it('detecta Módulo, Historia y Criterios de aceptación cuando el documento usa esas etiquetas', () => {
    const texto = `
      Especificación del módulo
      Módulo: Autenticación

      HU-01
      Historia: Como usuario registrado quiero iniciar sesión con mi correo y contraseña.
      Criterios de aceptación:
      1) El sistema valida correo y contraseña contra la base de datos.
      2) Si las credenciales son correctas, se genera un token de sesión.
      Prioridad: Alta
    `;
    const resultado = derivarCamposDesdeTexto(texto);
    expect(resultado.modulo).toBe('Autenticación');
    expect(resultado.descripcion).toContain('iniciar sesión');
    expect(resultado.criteriosAceptacion).toContain('El sistema valida correo y contraseña');
    expect(resultado.criteriosAceptacion).not.toContain('Prioridad');
  });

  it('concatena los criterios de varias Historias cuando el documento describe un módulo completo', () => {
    const texto = `
      Módulo: Registro Financiero
      HU-01
      Historia: Como analista quiero registrar un ingreso.
      Criterios de aceptación:
      El sistema registra el ingreso con fecha y monto.
      HU-02
      Historia: Como analista quiero registrar un egreso.
      Criterios de aceptación:
      El sistema registra el egreso con fecha y monto.
    `;
    const resultado = derivarCamposDesdeTexto(texto);
    expect(resultado.criteriosAceptacion).toContain('registra el ingreso');
    expect(resultado.criteriosAceptacion).toContain('registra el egreso');
  });

  it('devuelve null en todos los campos cuando no hay texto ni etiquetas reconocibles', () => {
    expect(derivarCamposDesdeTexto('')).toEqual({
      modulo: null,
      descripcion: null,
      criteriosAceptacion: null,
      prioridad: null,
      contexto: null,
      fueraDeAlcance: [],
    });
    const libre = derivarCamposDesdeTexto('Un párrafo cualquiera sin etiquetas conocidas.');
    expect(libre.modulo).toBeNull();
    expect(libre.criteriosAceptacion).toBeNull();
  });

  // Caso real que llegó con el reporte del usuario: un documento de
  // especificación con encabezados NUMERADOS ("1. Control del documento",
  // "3. Historia de usuario"...) y una tabla de metadatos "aplanada" por el
  // extractor de texto (la etiqueta sola en una línea, su valor en la
  // siguiente). Antes de este arreglo, nada de esto se reconocía y
  // terminaba generando casos de prueba sobre metadatos como fechas,
  // identificadores o el propio texto "Fuera de alcance".
  it('reconoce encabezados numerados, tablas aplanadas, reglas de negocio y excluye lo marcado como fuera de alcance', () => {
    const texto = `
      ESPECIFICACIÓN FUNCIONAL Gestión de citas médicas

      1. Control del documento
      Proyecto
      Portal web de atención al paciente
      Módulo
      Agendamiento y administración de citas
      Identificador
      HU-AG-024
      Prioridad
      Alta
      Fecha
      23/11/2026

      2. Contexto y objetivo
      Actualmente los pacientes solicitan citas por teléfono.

      3. Historia de usuario
      HU-AG-024 – Como paciente registrado, quiero consultar la disponibilidad de los médicos.

      4. Alcance
      Incluido en esta entrega:
      Reserva de una cita disponible.
      Fuera de alcance:
      Teleconsulta o videollamada.

      5. Actores y permisos
      Actor
      Permisos
      Restricciones
      Paciente
      Consultar disponibilidad; reservar sus propias citas.
      No puede consultar ni modificar citas de otros pacientes.

      6. Reglas de negocio
      La duración estándar de una cita es de 30 minutos.
      No se permiten reservas para fechas anteriores a la fecha actual.
    `;
    const resultado = derivarCamposDesdeTexto(texto);

    expect(resultado.modulo).toBe('Agendamiento y administración de citas');
    expect(resultado.prioridad).toBe('Alta');
    expect(resultado.contexto).toBe('Actualmente los pacientes solicitan citas por teléfono.');
    expect(resultado.fueraDeAlcance).toEqual(['Teleconsulta o videollamada.']);
    expect(resultado.descripcion).toContain('consultar la disponibilidad de los médicos');

    // Metadatos de control del documento: nunca deben aparecer como criterios.
    expect(resultado.criteriosAceptacion).not.toContain('Portal web de atención al paciente');
    expect(resultado.criteriosAceptacion).not.toContain('HU-AG-024');
    expect(resultado.criteriosAceptacion).not.toContain('23/11/2026');
    expect(resultado.criteriosAceptacion).not.toContain('Alta');

    // Explícitamente fuera de alcance: no debe colarse como criterio a probar.
    expect(resultado.criteriosAceptacion).not.toContain('Teleconsulta');

    // Encabezados de sección y de tabla: tampoco deben aparecer como criterios sueltos.
    expect(resultado.criteriosAceptacion).not.toMatch(/^Actor$/m);
    expect(resultado.criteriosAceptacion).not.toMatch(/^Permisos$/m);

    // Contenido real y evaluable: sí debe estar presente.
    expect(resultado.criteriosAceptacion).toContain('Reserva de una cita disponible.');
    expect(resultado.criteriosAceptacion).toContain('No puede consultar ni modificar citas de otros pacientes.');
    expect(resultado.criteriosAceptacion).toContain('La duración estándar de una cita es de 30 minutos.');
    expect(resultado.criteriosAceptacion).toContain('No se permiten reservas para fechas anteriores a la fecha actual.');
  });
});
