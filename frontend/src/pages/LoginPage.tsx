import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import type { IconName } from '../components/Icons';

const BENEFICIOS: { icon: IconName; titulo: string; texto: string }[] = [
  { icon: 'upload', titulo: 'Sube el documento', texto: 'PDF, Word o texto: la aplicación extrae módulo, historia y criterios.' },
  { icon: 'sparkles', titulo: 'Casos de prueba técnicos', texto: 'Valores límite, autorización, concurrencia y flujos alternos.' },
  { icon: 'alert', titulo: 'Riesgo justificado', texto: 'Matriz impacto × probabilidad y prioridad por cada caso.' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('qa@thomasinstruments.test');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No fue posible iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="login-hero-brand">
          <div className="brand-mark brand-mark-lg">
            <Icon name="shield" size={22} />
          </div>
          <span>QA Assistant</span>
        </div>
        <div className="login-hero-body">
          <h1>Diseño de pruebas asistido por inteligencia artificial</h1>
          <p>Convierte tus Historias de Usuario en casos de prueba trazables, priorizados y listos para ejecutar.</p>
          <ul className="login-benefits">
            {BENEFICIOS.map((b) => (
              <li key={b.titulo}>
                <span className="login-benefit-icon">
                  <Icon name={b.icon} size={18} />
                </span>
                <div>
                  <strong>{b.titulo}</strong>
                  <span>{b.texto}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <span className="login-hero-foot">Aseguramiento de calidad de software</span>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Iniciar sesión</h2>
          <p className="muted">Ingresa con tu cuenta corporativa para continuar.</p>
          <label className="field">
            <span>Correo electrónico</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error && (
            <div className="alert alert-error">
              <Icon name="alert" size={16} />
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
          <div className="login-hint">
            <Icon name="info" size={15} />
            <span>
              Cuenta de ejemplo: qa@thomasinstruments.test — contraseña <code>Password123!</code>
            </span>
          </div>
        </form>
      </section>
    </div>
  );
}
