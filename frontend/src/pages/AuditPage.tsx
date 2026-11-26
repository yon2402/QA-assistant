import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Icon } from '../components/Icons';

interface AuditEntry {
  id: string;
  user_email: string;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: string | null;
  created_at: string;
}

function tonoAccion(accion: string) {
  const a = accion.toLowerCase();
  if (/elimin|delete|borr/.test(a)) return 'tag-red';
  if (/crea|create|registr|login|ingres/.test(a)) return 'tag-green';
  if (/actualiz|update|edit|modific/.test(a)) return 'tag-amber';
  if (/anali|genera/.test(a)) return 'tag-blue';
  return '';
}

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    api
      .get<AuditEntry[]>('/audit')
      .then((res) => setEntries(res.data))
      .finally(() => setLoading(false));
  }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.user_email, e.accion, e.entidad, e.detalle].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [entries, busqueda]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Registro de auditoría</h1>
          <p className="page-sub">Trazabilidad de las acciones realizadas en la plataforma: inicios de sesión, historias, análisis y ediciones.</p>
        </div>
      </header>

      <section className="card card-flush">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por usuario, acción o detalle…"
              aria-label="Buscar en auditoría"
            />
          </div>
          <span className="muted small">{filtradas.length} registros</span>
        </div>
        {loading ? (
          <div className="list-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-row" />
            ))}
          </div>
        ) : filtradas.length === 0 ? (
          <div className="empty-state empty-state-sm">
            <p>No hay registros de auditoría.</p>
          </div>
        ) : (
          <table className="data-table data-table-wrap">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap muted">
                    {new Date(e.created_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="nowrap">{e.user_email}</td>
                  <td>
                    <span className={`tag ${tonoAccion(e.accion)}`}>{e.accion}</span>
                  </td>
                  <td>{e.entidad}</td>
                  <td className="small">{e.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
