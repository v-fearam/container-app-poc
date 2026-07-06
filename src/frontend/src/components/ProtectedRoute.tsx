import { type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500 text-lg">Verificando autenticación...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
          <svg className="w-12 h-12 text-amber-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-xl font-bold text-amber-900 mb-2">Acceso Restringido</h2>
          <p className="text-amber-700">Debes iniciar sesión para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  if (requiredRole && !user?.roles.includes(requiredRole)) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <h2 className="text-xl font-bold text-red-900 mb-2">Acceso Denegado</h2>
          <p className="text-red-700">
            No tienes el rol necesario (<span className="font-mono font-semibold">{requiredRole}</span>) para acceder a esta página.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
