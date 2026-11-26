import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { HistoriaUsuario } from '../types';
import { Icon } from '../components/Icons';
import { ConfirmDialog } from '../components/ConfirmDialog';

const EXTENSIONES = ['.pdf', '.docx', '.txt'];
const MAX_BYTES = 10 * 1024 * 1024;

function tamanoLegible(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function HistoriasPage() {
  const navigate = useNavigate();
  const [historias, setHistorias] = useState<HistoriaUsuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  // Flujo simplificado: título + documento. Módulo, descripción y criterios
  // se derivan del documento; los campos manuales quedan como opción.
  const [titulo, setTitulo] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [modulo, setModulo] = useState('');
  const [criterios, setCriterios] = useState('');
  const [saving, setSaving] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const [porEliminar, setPorEliminar] = useState<HistoriaUsuario | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await api.get<HistoriaUsuario[]>('/historias');
    setHistorias(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return historias;
    return historias.filter((h) =>
      [h.titulo, h.modulo, h.archivo_nombre, h.creado_por_nombre].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [historias, busqueda]);

  function resetForm() {
    setTitulo('');
    setArchivo(null);
    setMostrarManual(false);
    setDescripcion('');
    setModulo('');
    setCriterios('');
    setError(null);
  }

  function elegirArchivo(f: File | null | undefined) {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!EXTENSIONES.includes(ext)) {
      setError('Formato no permitido. Usa un archivo PDF, DOCX o TXT.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('El archivo supera el tamaño máximo de 10 MB.');
      return;
    }
    setError(null);
    setArchivo(f);
    if (!titulo.trim()) setTitulo(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    elegirArchivo(e.dataTransfer.files?.[0]);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!archivo && !descripcion.trim() && !modulo.trim() && !criterios.trim()) {
      setError('Sube un documento de soporte o completa manualmente Módulo, Descripción y Criterios de aceptación.');
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      form.append('titulo', titulo);
      if (descripcion.trim()) form.append('descripcion', descripcion);
      if (modulo.trim()) form.append('modulo', modulo);
      if (criterios.trim()) form.append('criteriosAceptacion', criterios);
      if (archivo) form.append('archivo', archivo);
      const { data } = await api.post<HistoriaUsuario>('/historias', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      resetForm();
      setShowForm(false);
      navigate(`/historias/${data.id}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(' ') : msg || 'No fue posible crear la Historia de Usuario.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setDeleting(true);
    try {
      await api.delete(`/historias/${porEliminar.id}`);
      setHistorias((prev) => prev.filter((x) => x.id !== porEliminar.id));
      setPorEliminar(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No fue posible eliminar la Historia de Usuario.');
      setPorEliminar(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Historias de Usuario</h1>
          <p className="page-sub">Sube el documento de especificación y genera los casos de prueba automáticamente.</p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={16} /> Nueva Historia
          </button>
        )}
      </header>

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
          <div className="card-head">
            <div>
              <h3>Nueva Historia de Usuario</h3>
              <p className="card-sub">
                La aplicación lee el documento y obtiene el módulo, la historia y los criterios de aceptación.
              </p>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              aria-label="Cerrar"
            >
              <Icon name="x" />
            </button>
          </div>

          <label className="field">
            <span>Título</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
              minLength={3}
              placeholder="Ej.: Gestión de citas médicas"
            />
          </label>

          <div className="field">
            <span>Documento de soporte</span>
            <div
              className={`dropzone ${arrastrando ? 'dropzone-active' : ''} ${archivo ? 'dropzone-filled' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={onDrop}
              onClick={() => inputArchivo.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputArchivo.current?.click()}
            >
              <input
                ref={inputArchivo}
                type="file"
                accept=".pdf,.docx,.txt"
                hidden
                onChange={(e) => elegirArchivo(e.target.files?.[0])}
              />
              {archivo ? (
                <div className="dropzone-file">
                  <div className="file-icon">
                    <Icon name="file" size={20} />
                  </div>
                  <div className="dropzone-file-info">
                    <strong>{archivo.name}</strong>
                    <span>{tamanoLegible(archivo.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchivo(null);
                      if (inputArchivo.current) inputArchivo.current.value = '';
                    }}
                    aria-label="Quitar archivo"
                  >
                    <Icon name="x" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="dropzone-icon">
                    <Icon name="upload" size={22} />
                  </div>
                  <p>
                    <strong>Arrastra el archivo aquí</strong> o haz clic para seleccionarlo
                  </p>
                  <span className="muted small">PDF, DOCX o TXT · máximo 10 MB</span>
                </>
              )}
            </div>
          </div>

          <button type="button" className="link-btn" onClick={() => setMostrarManual((v) => !v)}>
            <Icon name={mostrarManual ? 'chevronDown' : 'chevronRight'} size={16} />
            Completar campos manualmente (opcional)
          </button>

          {mostrarManual && (
            <div className="manual-fields">
              <p className="muted small">
                Úsalo si no tienes documento o si quieres reemplazar lo que la aplicación detecte automáticamente.
              </p>
              <label className="field">
                <span>Módulo</span>
                <input value={modulo} onChange={(e) => setModulo(e.target.value)} />
              </label>
              <label className="field">
                <span>Descripción</span>
                <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
              </label>
              <label className="field">
                <span>Criterios de aceptación</span>
                <textarea rows={5} value={criterios} onChange={(e) => setCriterios(e.target.value)} />
              </label>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <Icon name="alert" size={16} />
              {error}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Procesando documento…' : 'Guardar y continuar'}
            </button>
          </div>
        </form>
      )}

      {!showForm && error && (
        <div className="alert alert-error">
          <Icon name="alert" size={16} />
          {error}
        </div>
      )}

      <section className="card card-flush">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por título, módulo o documento…"
              aria-label="Buscar Historias de Usuario"
            />
          </div>
          <span className="muted small">
            {filtradas.length} de {historias.length} historia{historias.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className="list-skeleton">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-row" />
            ))}
          </div>
        ) : historias.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="stories" size={28} />
            </div>
            <h3>Todavía no hay Historias de Usuario</h3>
            <p>Sube tu primer documento de especificación para generar los casos de prueba.</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Icon name="plus" size={16} /> Nueva Historia
            </button>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="empty-state empty-state-sm">
            <p>No hay resultados para "{busqueda}".</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Historia de Usuario</th>
                <th>Documento</th>
                <th>Prioridad</th>
                <th>Creado por</th>
                <th>Fecha</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((h) => (
                <tr key={h.id} className="row-link" onClick={() => navigate(`/historias/${h.id}`)}>
                  <td>
                    <Link to={`/historias/${h.id}`} className="row-title" onClick={(e) => e.stopPropagation()}>
                      {h.titulo}
                    </Link>
                    <span className="row-sub">{h.modulo}</span>
                  </td>
                  <td>
                    {h.archivo_nombre ? (
                      <span className="file-chip" title={h.archivo_nombre}>
                        <Icon name="file" size={14} />
                        <span>{h.archivo_nombre}</span>
                      </span>
                    ) : (
                      <span className="muted small">Manual</span>
                    )}
                  </td>
                  <td>{h.prioridad_negocio ? <span className="tag">{h.prioridad_negocio}</span> : <span className="muted">—</span>}</td>
                  <td className="nowrap">{h.creado_por_nombre}</td>
                  <td className="nowrap muted">
                    {new Date(h.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPorEliminar(h);
                      }}
                      title="Eliminar"
                      aria-label={`Eliminar ${h.titulo}`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                    <Icon name="chevronRight" size={18} className="row-chevron" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ConfirmDialog
        open={!!porEliminar}
        title="Eliminar Historia de Usuario"
        message={`Se eliminará "${porEliminar?.titulo ?? ''}" junto con sus análisis y casos de prueba. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        busy={deleting}
        onConfirm={confirmarEliminar}
        onCancel={() => setPorEliminar(null)}
      />
    </div>
  );
}
