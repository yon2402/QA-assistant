// La plataforma tiene un único rol: analista de QA.
export type Role = 'QA';

export interface AuthUser {
  id: string;
  email: string;
  role: Role | string;
}

export interface HistoriaUsuario {
  id: string;
  titulo: string;
  descripcion: string;
  modulo: string;
  criterios_aceptacion: string;
  reglas_de_negocio?: string | null;
  prioridad_negocio?: string | null;
  dependencias?: string | null;
  info_adicional?: string | null;
  archivo_nombre?: string | null;
  archivo_tipo?: string | null;
  archivo_tamano?: number | null;
  contenido_extraido?: string | null;
  created_by_id: string;
  creado_por_nombre?: string;
  created_at: string;
  updated_at: string;
}

export interface Escenario {
  id: string;
  tipo: string;
  descripcion: string;
}

export interface CasoPrueba {
  id: string;
  escenario_id: string | null;
  codigo: string;
  nombre: string;
  objetivo: string;
  precondiciones: string;
  datos_prueba: string;
  pasos: string;
  resultado_esperado: string;
  riesgo: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  riesgo_justificacion?: string;
  prioridad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  prioridad_justificacion?: string;
  automatizable?: string;
  herramienta_sugerida?: string;
  criterio_aceptacion_relacionado?: string;
  resultado_ejecucion: 'PENDIENTE' | 'APROBADO' | 'FALLIDO';
  tiempo_estimado_minutos: number;
  editado_manualmente: boolean;
}

export interface Trazabilidad {
  id: string;
  criterio_aceptacion: string;
  escenario: string;
  caso_prueba_codigo: string;
  prioridad: string;
}

export interface Analisis {
  id: string;
  historia_id: string;
  resumen: string;
  created_at: string;
  tiempo_estimado_total_minutos: number;
  escenarios: Escenario[];
  casos: CasoPrueba[];
  trazabilidad: Trazabilidad[];
}

export interface DashboardStats {
  totalHistorias: number;
  totalAnalisis: number;
  historiasAnalizadas: number;
  totalCasos: number;
  casosRiesgoAltoOCritico: number;
  casosAutomatizables: number;
  tiempoEstimadoTotalMinutos: number;
  porPrioridad: { prioridad: string; count: number }[];
  porRiesgo: { riesgo: string; count: number }[];
  porEstadoEjecucion: { resultado_ejecucion: string; count: number }[];
}
