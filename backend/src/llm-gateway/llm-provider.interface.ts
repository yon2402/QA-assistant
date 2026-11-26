// Contrato que debe implementar cualquier proveedor de IA (real o simulado).
// Esto es lo que permite, según la arquitectura documentada, cambiar de
// proveedor sin afectar el resto del sistema (RF: LLM Gateway desacoplado).
export interface GeneratedScenario {
  tipo:
    | 'positivo'
    | 'negativo'
    | 'limite'
    | 'validacion'
    | 'error'
    | 'seguridad'
    | 'permisos'
    | 'integracion'
    | 'regresion';
  descripcion: string;
}

export interface GeneratedCase {
  codigo: string;
  nombre: string;
  objetivo: string;
  precondiciones: string;
  datosPrueba: string;
  pasos: string;
  resultadoEsperado: string;
  riesgo: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  riesgoJustificacion: string;
  prioridad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  prioridadJustificacion: string;
  automatizable: 'si' | 'parcialmente' | 'no';
  herramientaSugerida: string;
  criterioAceptacionRelacionado: string;
  escenarioTipo: GeneratedScenario['tipo'];
  tiempoEstimadoMinutos: number;
}

export interface LlmAnalysisResult {
  resumen: string;
  escenarios: GeneratedScenario[];
  casos: GeneratedCase[];
  trazabilidad: {
    criterioAceptacion: string;
    escenario: string;
    casoPruebaCodigo: string;
    prioridad: GeneratedCase['prioridad'];
  }[];
  tiempoEstimadoTotalMinutos: number;
}

export interface LlmProvider {
  analyzeHistoriaUsuario(input: {
    titulo: string;
    descripcion: string;
    modulo: string;
    criteriosAceptacion: string;
    /** Prioridad de negocio de la Historia (p. ej. "Alta"), si se conoce. Ajusta la prioridad de los casos. */
    prioridadNegocio?: string | null;
    /** Contexto y objetivo del proyecto según el documento (para el resumen). */
    contexto?: string | null;
    /** Elementos declarados fuera de alcance (se informan, no se prueban). */
    fueraDeAlcance?: string[];
  }): Promise<LlmAnalysisResult>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
