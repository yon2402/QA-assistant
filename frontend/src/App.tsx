import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { HistoriasPage } from './pages/HistoriasPage';
import { HistoriaDetailPage } from './pages/HistoriaDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { AuditPage } from './pages/AuditPage';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <div className={user ? 'app-shell' : undefined}>
      <Navbar />
      <main className={user ? 'app-main' : undefined}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/historias"
          element={
            <ProtectedRoute>
              <HistoriasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/historias/:id"
          element={
            <ProtectedRoute>
              <HistoriaDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditoria"
          element={
            <ProtectedRoute>
              <AuditPage />
            </ProtectedRoute>
          }
        />
      </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
