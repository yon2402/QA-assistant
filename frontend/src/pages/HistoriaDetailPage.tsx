import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Analisis, CasoPrueba, HistoriaUsuario } from '../types';
import { CasoCard } from '../components/CasoCard';
import { Icon } from '../components/Icons';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PRIORIDAD_LABEL, RIESGO_COLOR, RIESGO_LABEL } from '../components/Badges';

type Tab = 'casos' | 'trazabilidad' | 'documento';

/**
 * Resumen del proyecto. El análisis lo entrega como líneas "Apartado: texto";
 * los análisis generados con versiones anteriores (un solo párrafo) se
 * muestran tal cual.
 */
function ResumenProyecto({ resumen }: { resumen: string }) {
  const lineas = (resumen ?? '').split(/\r?\n/).filter((l) => l.trim());
  const apartados = lineas.map((l) => l.match(/^([^:]{3,45}):\s+([\s\S]+)$/));
  const estructurado = lineas.length > 1 && apartados.every(Boolean);

  return (
    <section className="ai-summary">
      <header className="ai-summary-head">
        <div className="ai-summary-icon">
          <Icon name="sparkles" size={18} />
        </div>
        <div>
          <h3>Resumen del proyecto</h3>
          <p className="card-sub">Generado a partir del documento de soporte</p>
        </div>
      </header>
      {estructurado ? (
        <dl className="summary-list">
          {apartados.map((m, i) => (
            <div key={i} className="summary-row">
              <dt>{m![1]}</dt>
              <dd>{m![2]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="summary-text">{resumen}</p>
      )}
    </section>
  );
}
const ORDEN_RIESGO = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO'] as const;

export function HistoriaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [historia, setHistoria] = useState<HistoriaUsuario | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [tab, setTab] = useState<Tab>('casos');
  const [busqueda, setBusqueda] = useState('');
  const [filtroRiesgo, setFiltroRiesgo] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const { data: h } = await api.get<HistoriaUsuario>(`/historias/${id}`);
    setHistoria(h);
    const { data: lista } = await api.get<Analisis[]>(`/historias/${id}/analisis`);
    if (lista.length > 0) {
      const { data: full } = await api.get<Analisis>(`/analisis/${lista[0].id}`);
      setAnalisis(full);
    } else {
      setAnalisis(null);
      setTab('documento');
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAnalyze() {
    setError(null);
    setAnalyzing(true);
    try {
      const { data } = await api.post<Analisis>(`/historias/${id}/analizar`);
      setAnalisis(data);
      setAbiertos(new Set());
      setTab('casos');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No fue posible generar el análisis.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDelete() {
    if (!historia) return;
    setDeleting(true);
    try {
      await api.delete(`/historias/${historia.id}`);
      navigate('/historias');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No fue posible eliminar la Historia de Usuario.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function handleCasoUpdated(updated: CasoPrueba) {
    if (!analisis) return;
    setAnalisis({ ...analisis, casos: analisis.casos.map((c) => (c.id === updated.id ? updated : c)) });
  }

  async function handleExport(tipo: 'csv' | 'pdf') {
    if (!analisis) return;
    const res = await api.get(`/analisis/${analisis.id}/export/${tipo}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `casos-${historia?.titulo ?? analisis.id}.${tipo}`.replace(/[\\/:*?"<>|]+/g, '-');
    a.click();
    window.URL.revokeObjectURL(url);
  }

  const casos = analisis?.casos ?? [];
  const conteoRiesgo = useMemo(() => {
    const c: Record<string, number> = {};
    casos.forEach((x) => (c[x.riesgo] = (c[x.riesgo] ?? 0) + 1));
    return c;
  }, [casos]);

  const casosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return casos.filter(
      (c) =>
        (!filtroRiesgo || c.riesgo === filtroRiesgo) &&
        (!filtroEstado || c.resultado_ejecucion === filtroEstado) &&
        (!q || `${c.codigo} ${c.nombre} ${c.objetivo}`.toLowerCase().includes(q)),
    );
  }, [casos, busqueda, filtroRiesgo, filtroEstado]);

  const toggle = (casoId: string) =>
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(casoId)) n.delete(casoId);
      else n.add(casoId);
      return n;
    });
  const todosAbiertos = casosFiltrados.length > 0 && casosFiltrados.every((c) => abiertos.has(c.id));

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-block" />
      </div>
    );
  }
  if (!historia) return <div className="page">No se encontró la Historia de Usuario.</div>;

  const ejecutados = casos.filter((c) => c.resultado_ejecucion !== 'PENDIENTE').length;
  const aprobados = casos.filter((c) => c.resultado_ejecucion === 'APROBADO').length;
  const fallidos = casos.filter((c) => c.resultado_ejecucion === 'FALLIDO').length;
  const altoCritico = (conteoRiesgo.CRITICO ?? 0) + (conteoRiesgo.ALTO ?? 0);
  const automatizables = casos.filter((c) => c.automatizable === 'si').length;

  return (
    <div className="page">
      <Link to="/historias" className="back-link">
        <Icon name="arrowLeft" size={16} /> Historias de Usuario
      </Link>

      <header className="detail-head">
        <div className="detail-title">
          <h1>{historia.titulo}</h1>
          <div className="meta-row">
            <span className="meta">
              <Icon name="layers" size={14} /> {historia.modulo}
            </span>
            {historia.prioridad_negocio && (
              <span className="meta">
                <Icon name="zap" size={14} /> Prioridad de negocio: {historia.prioridad_negocio}
              </span>
            )}
            {historia.archivo_nombre && (
              <span className="meta">
                <Icon name="file" size={14} /> {historia.archivo_nombre}
              </span>
            )}
            {analisis && (
              <span className="meta">
                <Icon name="clock" size={14} /> Analizado el{' '}
                {new Date(analisis.created_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
          </div>
        </div>
        <div className="detail-actions">
          <button className="icon-btn icon-btn-danger icon-btn-bordered" onClick={() => setConfirmDelete(true)} title="Eliminar Historia">
            <Icon name="trash" size={17} />
          </button>
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <span className="spinner" /> : <Icon name="sparkles" size={16} />}
            {analyzing ? 'Analizando documento…' : analisis ? 'Volver a analizar' : 'Analizar con IA'}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error">
          <Icon name="alert" size={16} />
          {error}
        </div>
      )}

      {analisis ? (
        <>
          <div className="kpi-grid kpi-grid-compact">
            <div className="kpi">
              <div className="kpi-icon">
                <Icon name="list" size={20} />
              </div>
              <div className="kpi-body">
                <span className="kpi-label">Casos de prueba</span>
                <span className="kpi-value">{casos.length}</span>
                <span className="kpi-hint">{automatizables} automatizables</span>
              </div>
            </div>
            <div className="kpi kpi-danger">
              <div className="kpi-icon">
                <Icon name="alert" size={20} />
              </div>
              <div className="kpi-body">
                <span className="kpi-label">Riesgo alto o crítico</span>
                <span className="kpi-value">{altoCritico}</span>
                <span className="kpi-hint">{conteoRiesgo.CRITICO ?? 0} críticos</span>
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-icon">
                <Icon name="clock" size={20} />
              </div>
              <div className="kpi-body">
                <span className="kpi-label">Esfuerzo estimado</span>
                <span className="kpi-value">{(analisis.tiempo_estimado_total_minutos / 60).toFixed(1)} h</span>
                <span className="kpi-hint">{analisis.tiempo_estimado_total_minutos} minutos</span>
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-icon">
                <Icon name="checkCircle" size={20} />
              </div>
              <div className="kpi-body">
                <span className="kpi-label">Ejecución</span>
                <span className="kpi-value">
                  {ejecutados}/{casos.length}
                </span>
                <span className="kpi-hint">
                  {aprobados} aprobados · {fallidos} fallidos
                </span>
              </div>
            </div>
          </div>

          <ResumenProyecto resumen={analisis.resumen} />
        </>
      ) : (
        <div className="card empty-state">
          <div className="empty-icon">
            <Icon name="sparkles" size={28} />
          </div>
          <h3>Listo para analizar</h3>
          <p>Genera los casos de prueba, el análisis de riesgo y la matriz de trazabilidad a partir del documento.</p>
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <span className="spinner" /> : <Icon name="sparkles" size={16} />}
            {analyzing ? 'Analizando documento…' : 'Analizar con IA'}
          </button>
        </div>
      )}

      <div className="tabs" role="tablist">
        {analisis && (
          <>
            <button role="tab" aria-selected={tab === 'casos'} className={tab === 'casos' ? 'tab tab-on' : 'tab'} onClick={() => setTab('casos')}>
              <Icon name="list" size={16} /> Casos de prueba <span className="tab-count">{casos.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === 'trazabilidad'}
              className={tab === 'trazabilidad' ? 'tab tab-on' : 'tab'}
              onClick={() => setTab('trazabilidad')}
            >
              <Icon name="table" size={16} /> Matriz de trazabilidad
            </button>
          </>
        )}
        <button
          role="tab"
          aria-selected={tab === 'documento'}
          className={tab === 'documento' ? 'tab tab-on' : 'tab'}
          onClick={() => setTab('documento')}
        >
          <Icon name="file" size={16} /> Información del documento
        </button>
        {analisis && tab !== 'documento' && (
          <div className="tabs-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => handleExport('csv')}>
              <Icon name="download" size={15} /> CSV
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleExport('pdf')}>
              <Icon name="download" size={15} /> PDF
            </button>
          </div>
        )}
      </div>

      {analisis && tab === 'casos' && (
        <section>
          <div className="case-toolbar">
            <div className="search">
              <Icon name="search" size={16} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar caso por código, nombre u objetivo…"
                aria-label="Buscar casos"
              />
            </div>
            <div className="chips" role="group" aria-label="Filtrar por riesgo">
              <button className={`chip ${filtroRiesgo === '' ? 'chip-on' : ''}`} onClick={() => setFiltroRiesgo('')}>
                Todos <span>{casos.length}</span>
              </button>
              {ORDEN_RIESGO.map((r) => (
                <button
                  key={r}
                  className={`chip ${filtroRiesgo === r ? 'chip-on' : ''}`}
                  onClick={() => setFiltroRiesgo(filtroRiesgo === r ? '' : r)}
                  disabled={!conteoRiesgo[r]}
                >
                  <span className="pill-dot" style={{ background: RIESGO_COLOR[r] }} />
                  {RIESGO_LABEL[r]} <span>{conteoRiesgo[r] ?? 0}</span>
                </button>
              ))}
            </div>
            <select className="select-sm" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="APROBADO">Aprobados</option>
              <option value="FALLIDO">Fallidos</option>
            </select>
            <button
              className="link-btn"
              onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(casosFiltrados.map((c) => c.id)))}
            >
              {todosAbiertos ? 'Contraer todos' : 'Expandir todos'}
            </button>
          </div>

          {casosFiltrados.length === 0 ? (
            <div className="empty-state empty-state-sm card">
              <p>No hay casos que coincidan con los filtros.</p>
            </div>
          ) : (
            <div className="case-list">
              {casosFiltrados.map((c) => (
                <CasoCard key={c.id} caso={c} onUpdated={handleCasoUpdated} expanded={abiertos.has(c.id)} onToggle={() => toggle(c.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {analisis && tab === 'trazabilidad' && (
        <section className="card card-flush">
          <table className="data-table data-table-wrap">
            <thead>
              <tr>
                <th style={{ width: '48%' }}>Criterio de aceptación / requisito</th>
                <th>Escenario</th>
                <th>Caso</th>
                <th>Prioridad</th>
              </tr>
            </thead>
            <tbody>
              {analisis.trazabilidad.map((t) => (
                <tr key={t.id}>
                  <td className="small">{t.criterio_aceptacion}</td>
                  <td>
                    <span className="tag">{t.escenario}</span>
                  </td>
                  <td className="nowrap">
                    <strong>{t.caso_prueba_codigo}</strong>
                  </td>
                  <td>{PRIORIDAD_LABEL[t.prioridad] ?? t.prioridad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'documento' && (
        <section className="card doc-info">
          <dl>
            <div>
              <dt>Módulo</dt>
              <dd>{historia.modulo}</dd>
            </div>
            <div>
              <dt>Historia de Usuario</dt>
              <dd>{historia.descripcion}</dd>
            </div>
            <div>
              <dt>Criterios de aceptación detectados</dt>
              <dd className="pre">{historia.criterios_aceptacion}</dd>
            </div>
            {historia.archivo_nombre && (
              <div>
                <dt>Documento de soporte</dt>
                <dd>
                  <span className="file-chip">
                    <Icon name="file" size={14} /> {historia.archivo_nombre}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar Historia de Usuario"
        message={`Se eliminará "${historia.titulo}" junto con sus análisis y casos de prueba. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
