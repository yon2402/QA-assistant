import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icons';

// Barra lateral de navegación (en pantallas angostas se muestra arriba).
export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const inicial = user.email.charAt(0).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <Icon name="shield" size={18} />
        </div>
        <div>
          <div className="brand-name">QA Assistant</div>
          <div className="brand-sub">Diseño de pruebas con IA</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="sidebar-section">General</span>
        <NavLink to="/" end>
          <Icon name="dashboard" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/historias">
          <Icon name="stories" />
          <span>Historias de Usuario</span>
        </NavLink>
        <NavLink to="/auditoria">
          <Icon name="audit" />
          <span>Auditoría</span>
        </NavLink>
      </nav>

      <div className="sidebar-user">
        <div className="avatar">{inicial}</div>
        <div className="sidebar-user-info">
          <span className="sidebar-user-email" title={user.email}>
            {user.email}
          </span>
          <span className="sidebar-user-role">Analista QA</span>
        </div>
        <button className="icon-btn icon-btn-dark" onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}
