import { useState } from 'react';
import { api } from '../api/client';
import type { CasoPrueba } from '../types';
import { Icon } from './Icons';
import { EstadoBadge, PRIORIDAD_LABEL, PrioridadBadge, RIESGO_LABEL, RiesgoBadge, ESTADO_LABEL } from './Badges';

const RIESGOS = ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'] as const;
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
const ESTADOS = ['PENDIENTE', 'APROBADO', 'FALLIDO'] as const;

/** Convierte "1. Paso\n2. Paso" (o el formato anterior "1) Paso 2) Paso") en una lista. */
function pasosComoLista(pasos: string): string[] {
  const t = (pasos ?? '').trim();
  if (!t) return [];
  let partes = t.split(/\r?\n+/);
  if (partes.length <= 1) partes = t.split(/\s(?=\d+[.)]\s)/);
  return partes.map((p) => p.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
}

export function CasoCard({
  caso,
  onUpdated,
  expanded,
  onToggle,
}: {
  caso: CasoPrueba;
  onUpdated: (c: CasoPrueba) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: caso.nombre,
    pasos: caso.pasos,
    resultadoEsperado: caso.resultado_esperado,
    riesgo: caso.riesgo,
    prioridad: caso.prioridad,
    resultadoEjecucion: caso.resultado_ejecucion,
  });

  async function handleSave() {
    setSaving(true);
    try {
      const { data } = await api.patch<CasoPrueba>(`/casos/${caso.id}`, form);
      onUpdated(data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function marcarEstado(estado: CasoPrueba['resultado_ejecucion']) {
    const { data } = await api.patch<CasoPrueba>(`/casos/${caso.id}`, { resultadoEjecucion: estado });
    onUpdated(data);
    setForm((f) => ({ ...f, resultadoEjecucion: estado }));
  }

  const pasos = pasosComoLista(caso.pasos);

  return (
    <article className={`caso ${expanded ? 'caso-open' : ''} caso-riesgo-${caso.riesgo.toLowerCase()}`}>
      <button type="button" className="caso-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="caso-code">{caso.codigo}</span>
        <span className="caso-title">{caso.nombre}</span>
        <span className="caso-badges">
          <RiesgoBadge riesgo={caso.riesgo} />
          <PrioridadBadge prioridad={caso.prioridad} />
          <EstadoBadge estado={caso.resultado_ejecucion} />
          <span className="caso-time" title="Tiempo estimado de ejecución manual">
            <Icon name="clock" size={13} /> {caso.tiempo_estimado_minutos} min
          </span>
          {caso.editado_manualmente && <span className="tag tag-blue">Editado</span>}
        </span>
        <Icon name="chevronDown" size={18} className="caso-chevron" />
      </button>

      {expanded && !editing && (
        <div className="caso-body">
          <div className="caso-main">
            <section>
              <h5>Objetivo</h5>
              <p>{caso.objetivo}</p>
            </section>
            <section>
              <h5>Precondiciones</h5>
              <p>{caso.precondiciones}</p>
            </section>
            <section>
              <h5>Pasos</h5>
              {pasos.length > 1 ? (
                <ol className="steps">
                  {pasos.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              ) : (
                <p>{caso.pasos}</p>
              )}
            </section>
            <section className="expected">
              <h5>
                <Icon name="check" size={14} /> Resultado esperado
              </h5>
              <p>{caso.resultado_esperado}</p>
            </section>
          </div>

          <aside className="caso-side">
            <section>
              <h5>Datos de prueba</h5>
              <p>{caso.datos_prueba}</p>
            </section>
            {(caso.riesgo_justificacion || caso.prioridad_justificacion) && (
              <section className="risk-box">
                <h5>Análisis de riesgo</h5>
                {caso.riesgo_justificacion && <p>{caso.riesgo_justificacion}</p>}
                {caso.prioridad_justificacion && <p>{caso.prioridad_justificacion}</p>}
              </section>
            )}
            <section>
              <h5>Automatización</h5>
              <p>
                <span className={`tag ${caso.automatizable === 'si' ? 'tag-green' : caso.automatizable === 'no' ? '' : 'tag-amber'}`}>
                  {caso.automatizable === 'si' ? 'Automatizable' : caso.automatizable === 'no' ? 'Manual' : 'Parcialmente'}
                </span>{' '}
                {caso.herramienta_sugerida}
              </p>
            </section>
          </aside>

          <footer className="caso-foot">
            <div className="segmented" role="group" aria-label="Resultado de ejecución">
              {ESTADOS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`seg seg-${s.toLowerCase()} ${caso.resultado_ejecucion === s ? 'seg-on' : ''}`}
                  onClick={() => marcarEstado(s)}
                >
                  {ESTADO_LABEL[s]}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              <Icon name="edit" size={15} /> Editar caso
            </button>
          </footer>
        </div>
      )}

      {expanded && editing && (
        <div className="caso-body caso-edit">
          <label className="field">
            <span>Nombre</span>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </label>
          <label className="field">
            <span>Pasos</span>
            <textarea rows={6} value={form.pasos} onChange={(e) => setForm({ ...form, pasos: e.target.value })} />
          </label>
          <label className="field">
            <span>Resultado esperado</span>
            <textarea
              rows={3}
              value={form.resultadoEsperado}
              onChange={(e) => setForm({ ...form, resultadoEsperado: e.target.value })}
            />
          </label>
          <div className="form-grid-3">
            <label className="field">
              <span>Riesgo</span>
              <select value={form.riesgo} onChange={(e) => setForm({ ...form, riesgo: e.target.value as any })}>
                {RIESGOS.map((r) => (
                  <option key={r} value={r}>
                    {RIESGO_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Prioridad</span>
              <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value as any })}>
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORIDAD_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Resultado de ejecución</span>
              <select
                value={form.resultadoEjecucion}
                onChange={(e) => setForm({ ...form, resultadoEjecucion: e.target.value as any })}
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {ESTADO_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
