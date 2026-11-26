import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { api } from '../api/client';
import type { DashboardStats, HistoriaUsuario } from '../types';
import { Icon } from '../components/Icons';
import type { IconName } from '../components/Icons';
import {
  ESTADO_COLOR,
  ESTADO_LABEL,
  PRIORIDAD_COLOR,
  PRIORIDAD_LABEL,
  RIESGO_COLOR,
  RIESGO_LABEL,
} from '../components/Badges';

const ORDEN_RIESGO = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO'];
const ORDEN_PRIORIDAD = ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'];
const ORDEN_ESTADO = ['APROBADO', 'FALLIDO', 'PENDIENTE'];

function Kpi({ icon, label, value, hint, tone }: { icon: IconName; label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value}</span>
        {hint && <span className="kpi-hint">{hint}</span>}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip-swatch" style={{ background: d.color }} />
      <strong>{d.nombre}</strong>
      <span>
        {d.cantidad} caso{d.cantidad === 1 ? '' : 's'} · {d.porcentaje}%
      </span>
    </div>
  );
}

function DistribucionChart({ data }: { data: { nombre: string; cantidad: number; color: string; porcentaje: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 48 + 16}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke="#eef1f6" />
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis type="category" dataKey="nombre" width={70} tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 13 }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {data.map((d) => (
            <Cell key={d.nombre} fill={d.color} />
          ))}
          <LabelList dataKey="cantidad" position="right" style={{ fill: '#0f172a', fontSize: 13, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [historias, setHistorias] = useState<HistoriaUsuario[]>([]);
  const [historiaId, setHistoriaId] = useState<string>('');

  useEffect(() => {
    api.get<HistoriaUsuario[]>('/historias').then((res) => setHistorias(res.data));
  }, []);

  useEffect(() => {
    setStats(null);
    const url = historiaId ? `/dashboard/stats?historiaId=${historiaId}` : '/dashboard/stats';
    api.get<DashboardStats>(url).then((res) => setStats(res.data));
  }, [historiaId]);

  const total = stats?.totalCasos ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const serie = <K extends string>(
    filas: { count: number }[] | undefined,
    clave: K,
    orden: string[],
    etiquetas: Record<string, string>,
    colores: Record<string, string>,
  ) =>
    orden.map((k) => {
      const cantidad = (filas as any[])?.find((f) => f[clave] === k)?.count ?? 0;
      return { nombre: etiquetas[k], cantidad, color: colores[k], porcentaje: pct(cantidad) };
    });

  const riesgoData = serie(stats?.porRiesgo, 'riesgo', ORDEN_RIESGO, RIESGO_LABEL, RIESGO_COLOR);
  const prioridadData = serie(stats?.porPrioridad, 'prioridad', ORDEN_PRIORIDAD, PRIORIDAD_LABEL, PRIORIDAD_COLOR);
  const estadoData = serie(stats?.porEstadoEjecucion, 'resultado_ejecucion', ORDEN_ESTADO, ESTADO_LABEL, ESTADO_COLOR);
  const ejecutados = estadoData.filter((e) => e.nombre !== 'Pendiente').reduce((s, e) => s + e.cantidad, 0);

  const historiaSel = historias.find((h) => h.id === historiaId);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">
            {historiaSel ? `Métricas de "${historiaSel.titulo}"` : 'Resumen global de todas las Historias de Usuario'}
          </p>
        </div>
        <div className="select-wrap">
          <Icon name="file" size={16} />
          <select value={historiaId} onChange={(e) => setHistoriaId(e.target.value)} aria-label="Filtrar por Historia de Usuario">
            <option value="">Todas las Historias</option>
            {historias.map((h) => (
              <option key={h.id} value={h.id}>
                {h.titulo}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!stats ? (
        <div className="kpi-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi skeleton" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">
            <Icon name="sparkles" size={28} />
          </div>
          <h3>Aún no hay casos de prueba</h3>
          <p>Crea una Historia de Usuario y ejecuta el análisis con IA para ver aquí las métricas.</p>
          <Link to="/historias" className="btn btn-primary">
            <Icon name="plus" size={16} /> Ir a Historias de Usuario
          </Link>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi
              icon="stories"
              label="Historias de Usuario"
              value={stats.totalHistorias}
              hint={`${stats.historiasAnalizadas} con análisis`}
            />
            <Kpi icon="list" label="Casos de prueba" value={stats.totalCasos} hint={`${stats.totalAnalisis} análisis generados`} />
            <Kpi
              icon="alert"
              label="Riesgo alto o crítico"
              value={stats.casosRiesgoAltoOCritico}
              hint={`${pct(stats.casosRiesgoAltoOCritico)}% del total`}
              tone="danger"
            />
            <Kpi
              icon="clock"
              label="Esfuerzo estimado"
              value={`${(stats.tiempoEstimadoTotalMinutos / 60).toFixed(1)} h`}
              hint={`${pct(stats.casosAutomatizables)}% automatizable`}
            />
          </div>

          <div className="dash-grid">
            <section className="card">
              <div className="card-head">
                <div>
                  <h3>Distribución por riesgo</h3>
                  <p className="card-sub">Impacto × probabilidad de falla</p>
                </div>
              </div>
              <DistribucionChart data={riesgoData} />
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h3>Distribución por prioridad</h3>
                  <p className="card-sub">Orden sugerido de ejecución</p>
                </div>
              </div>
              <DistribucionChart data={prioridadData} />
            </section>
          </div>

          <section className="card">
            <div className="card-head">
              <div>
                <h3>Avance de ejecución</h3>
                <p className="card-sub">
                  {ejecutados} de {total} casos ejecutados ({pct(ejecutados)}%)
                </p>
              </div>
            </div>
            <div className="progress-stack" role="img" aria-label="Avance de ejecución de los casos de prueba">
              {estadoData
                .filter((e) => e.cantidad > 0)
                .map((e) => (
                  <div
                    key={e.nombre}
                    className="progress-seg"
                    style={{ width: `${(e.cantidad / total) * 100}%`, background: e.color }}
                    title={`${e.nombre}: ${e.cantidad} (${e.porcentaje}%)`}
                  />
                ))}
            </div>
            <ul className="legend">
              {estadoData.map((e) => (
                <li key={e.nombre}>
                  <span className="legend-swatch" style={{ background: e.color }} />
                  {e.nombre}
                  <strong>{e.cantidad}</strong>
                  <span className="muted">({e.porcentaje}%)</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
