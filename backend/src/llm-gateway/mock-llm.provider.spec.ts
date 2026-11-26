import { MockLlmProvider } from './mock-llm.provider';

describe('MockLlmProvider', () => {
  const provider = new MockLlmProvider();
  const input = {
    titulo: 'Registrar Historia de Usuario',
    descripcion: 'Como analista QA quiero registrar una HU con sus criterios de aceptación',
    modulo: 'Gestión de HU',
    criteriosAceptacion: 'El sistema debe guardar la HU y mostrarla en el listado',
  };

  const inputMultiCriterio = {
    titulo: 'Inicio de sesión de usuario',
    descripcion: 'Como usuario registrado quiero iniciar sesión con mi correo y contraseña.',
    modulo: 'Autenticación',
    criteriosAceptacion:
      '1) El sistema valida correo y contraseña contra la base de datos.\n' +
      '2) Si las credenciales son correctas, se genera un token de sesión.\n' +
      '3) Si las credenciales son incorrectas, se muestra un mensaje de error.\n' +
      '4) Tras 5 intentos fallidos, la cuenta se bloquea temporalmente.',
  };

  it('genera un resumen del proyecto con su módulo, historia y alcance', async () => {
    const resultado = await provider.analyzeHistoriaUsuario(input);
    expect(resultado.resumen).toContain(`Proyecto: ${input.modulo}`);
    expect(resultado.resumen).toContain('Historia de usuario: Como analista QA');
    expect(resultado.resumen).toContain('Alcance de la entrega: El sistema debe guardar la HU');
  });

  it('incluye en el resumen el contexto, lo que queda fuera de alcance, actores y reglas clave', async () => {
    const resultado = await provider.analyzeHistoriaUsuario({
      titulo: 'Citas',
      descripcion: 'Como paciente, quiero reservar citas, para ser atendido a tiempo.',
      modulo: 'Agenda',
      criteriosAceptacion: ['Paciente', 'Reservar sus propias citas.', 'RN-05', 'La reserva debe realizarse con mínimo 2 horas de anticipación.'].join('\n'),
      contexto: 'Hoy las citas se piden por teléfono.',
      fueraDeAlcance: ['Teleconsulta.'],
    });
    const lineas = resultado.resumen.split('\n');
    expect(lineas[0]).toBe('Proyecto: Agenda. Hoy las citas se piden por teléfono.');
    expect(resultado.resumen).toContain('Fuera de alcance (no se prueba): Teleconsulta.');
    expect(resultado.resumen).toContain('Actores: Paciente (reservar sus propias citas).');
    expect(resultado.resumen).toContain('Reglas de negocio clave: La reserva debe realizarse con mínimo 2 horas de anticipación.');
  });

  it('genera al menos un escenario de cada tipo esperado', async () => {
    const resultado = await provider.analyzeHistoriaUsuario(input);
    const tipos = resultado.escenarios.map((e) => e.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['positivo', 'negativo', 'seguridad']));
  });

  it('genera casos de prueba con código único, incluyendo cobertura general', async () => {
    const resultado = await provider.analyzeHistoriaUsuario(input);
    // 6 casos de cobertura general + al menos 1 derivado del criterio de aceptación.
    expect(resultado.casos.length).toBeGreaterThanOrEqual(7);
    const codigos = resultado.casos.map((c) => c.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('genera un caso específico por cada criterio de aceptación identificado en el documento', async () => {
    const resultado = await provider.analyzeHistoriaUsuario(inputMultiCriterio);
    // 6 casos de cobertura general + 1 por cada uno de los 4 criterios numerados.
    expect(resultado.casos.length).toBe(10);
  });

  it('la matriz de trazabilidad tiene una fila por cada caso de prueba', async () => {
    const resultado = await provider.analyzeHistoriaUsuario(input);
    expect(resultado.trazabilidad.length).toBe(resultado.casos.length);
  });

  it('calcula un tiempo estimado por caso y un total consistente con la suma de los casos', async () => {
    const resultado = await provider.analyzeHistoriaUsuario(inputMultiCriterio);
    for (const c of resultado.casos) {
      expect(c.tiempoEstimadoMinutos).toBeGreaterThan(0);
    }
    const sumaCasos = resultado.casos.reduce((sum, c) => sum + c.tiempoEstimadoMinutos, 0);
    expect(resultado.tiempoEstimadoTotalMinutos).toBe(sumaCasos);
  });
  it('redacta casos técnicos y no repetitivos a partir de reglas, permisos y criterios Given/When/Then', async () => {
    const resultado = await provider.analyzeHistoriaUsuario({
      titulo: 'Gestión de citas',
      descripcion: 'Como paciente registrado, quiero reservar citas, para ser atendido a tiempo.',
      modulo: 'Agendamiento',
      criteriosAceptacion: [
        'Paciente',
        'Consultar disponibilidad; reservar sus propias citas.',
        'No puede consultar ni modificar citas de otros pacientes.',
        'RN-05',
        'La reserva debe realizarse con mínimo 2 horas de anticipación.',
        'CA-03 – Doble reserva',
        'Dado que dos pacientes intentan reservar el mismo cupo, cuando ambos confirman, entonces solo una operación se completa.',
      ].join('\n'),
    });
    const especificos = resultado.casos.slice(6);
    expect(especificos).toHaveLength(4);

    // Cada objetivo es distinto: nada de "Validar el criterio N.º X" repetido.
    const objetivos = resultado.casos.map((c) => c.objetivo);
    expect(new Set(objetivos).size).toBe(objetivos.length);
    expect(resultado.casos.some((c) => /^Criterio \d+:/.test(c.nombre))).toBe(false);

    const limite = especificos.find((c) => c.nombre.startsWith('RN-05'));
    expect(limite?.escenarioTipo).toBe('limite');
    expect(limite?.pasos).toContain('2 horas − 1 minuto');

    const restriccion = especificos.find((c) => c.nombre.startsWith('Restricción del rol Paciente'));
    expect(restriccion?.escenarioTipo).toBe('seguridad');
    expect(restriccion?.resultadoEsperado).toContain('HTTP 403');

    const gherkin = especificos.find((c) => c.nombre.startsWith('CA-03'));
    expect(gherkin?.resultadoEsperado).toBe('Solo una operación se completa.');
  });
  describe('matriz de riesgo Impacto × Probabilidad', () => {
    const criterios = [
      'Visualización de próximas citas.',
      'Paciente',
      'No puede consultar ni modificar citas de otros pacientes.',
      'RN-05',
      'La reserva debe realizarse con mínimo 2 horas de anticipación.',
    ].join('\n');
    const base = { titulo: 'Citas', descripcion: 'Como paciente, quiero reservar citas.', modulo: 'Agenda', criteriosAceptacion: criterios };
    const buscar = (casos: { nombre: string }[], prefijo: string) => casos.find((c) => c.nombre.startsWith(prefijo)) as any;

    it('clasifica crítico, alto y bajo según impacto y probabilidad, y lo justifica', async () => {
      const { casos } = await provider.analyzeHistoriaUsuario(base);
      const restriccion = buscar(casos, 'Restricción del rol Paciente');
      expect(restriccion.riesgo).toBe('CRITICO'); // impacto 3 (acceso ajeno) × probabilidad 3 (OWASP A01)
      expect(restriccion.riesgoJustificacion).toContain('= 9');

      expect(buscar(casos, 'RN-05').riesgo).toBe('ALTO'); // impacto 2 × probabilidad 3 (plazos)
      expect(buscar(casos, 'Funcionalidad: Visualización').riesgo).toBe('BAJO'); // solo lectura

      // Sin prioridad de negocio, la prioridad sigue directamente al riesgo.
      expect(restriccion.prioridad).toBe('CRITICA');
      expect(buscar(casos, 'RN-05').prioridad).toBe('ALTA');
      expect(buscar(casos, 'Funcionalidad: Visualización').prioridad).toBe('BAJA');
    });

    it('ajusta la prioridad con la prioridad de negocio sin inflar a CRÍTICA los riesgos altos', async () => {
      const alta = await provider.analyzeHistoriaUsuario({ ...base, prioridadNegocio: 'Alta' });
      expect(buscar(alta.casos, 'Funcionalidad: Visualización').prioridad).toBe('MEDIA');
      expect(buscar(alta.casos, 'RN-05').prioridad).toBe('ALTA');
      const critica = buscar(alta.casos, 'Restricción del rol Paciente');
      expect(critica.prioridad).toBe('CRITICA');
      expect(critica.prioridadJustificacion).toContain('nivel máximo');
      expect(buscar(alta.casos, 'RN-05').prioridadJustificacion).toContain('se reserva para riesgo CRÍTICO');

      const baja = await provider.analyzeHistoriaUsuario({ ...base, prioridadNegocio: 'Baja' });
      expect(buscar(baja.casos, 'Restricción del rol Paciente').prioridad).toBe('ALTA');
      expect(buscar(baja.casos, 'RN-05').prioridad).toBe('MEDIA');
    });
  });
});
