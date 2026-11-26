import { Icon } from './Icons';
import type { IconName } from './Icons';

// Etiquetas legibles para los valores que guarda el backend.
export const RIESGO_LABEL: Record<string, string> = {
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Medio',
  BAJO: 'Bajo',
};
export const PRIORIDAD_LABEL: Record<string, string> = {
  CRITICA: 'Crítica',
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};
export const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  FALLIDO: 'Fallido',
};

// Paleta de estado (good / warning / serious / critical) para el riesgo y
// rampa ordinal azul para la prioridad. Se usan también en los gráficos.
export const RIESGO_COLOR: Record<string, string> = {
  CRITICO: '#d03b3b',
  ALTO: '#ec835a',
  MEDIO: '#fab219',
  BAJO: '#0ca30c',
};
export const PRIORIDAD_COLOR: Record<string, string> = {
  CRITICA: '#0d366b',
  ALTA: '#256abf',
  MEDIA: '#3987e5',
  BAJA: '#86b6ef',
};
export const ESTADO_COLOR: Record<string, string> = {
  APROBADO: '#0ca30c',
  FALLIDO: '#d03b3b',
  PENDIENTE: '#a3a9b5',
};

export function RiesgoBadge({ riesgo }: { riesgo: string }) {
  return (
    <span className={`pill pill-riesgo-${riesgo.toLowerCase()}`} title="Riesgo = impacto × probabilidad">
      <span className="pill-dot" style={{ background: RIESGO_COLOR[riesgo] }} />
      Riesgo {RIESGO_LABEL[riesgo]?.toLowerCase() ?? riesgo}
    </span>
  );
}

export function PrioridadBadge({ prioridad }: { prioridad: string }) {
  return (
    <span className={`pill pill-prioridad-${prioridad.toLowerCase()}`} title="Prioridad de ejecución">
      Prioridad {PRIORIDAD_LABEL[prioridad]?.toLowerCase() ?? prioridad}
    </span>
  );
}

const ESTADO_ICON: Record<string, IconName> = {
  PENDIENTE: 'clock',
  APROBADO: 'checkCircle',
  FALLIDO: 'xCircle',
};

export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={`pill pill-estado-${estado.toLowerCase()}`}>
      <Icon name={ESTADO_ICON[estado] ?? 'clock'} size={13} />
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  );
}
