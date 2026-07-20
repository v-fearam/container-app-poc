import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Cloud, LogOut, LogIn, AlertTriangle } from 'lucide-react';

export function Navbar() {
  const { isAuthenticated, user, loading, login, logout } = useAuth();

  return (
    <nav className="bg-white/80 backdrop-blur-sm border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
                <Cloud className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Camuzzi Weather</h1>
            </Link>

            {isAuthenticated && (
              <div className="hidden sm:flex items-center gap-1 ml-8">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/">Inicio</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/changefeed">Change Feed</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/scheduler">Scheduler</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/health">Health</Link>
                </Button>
                {user?.roles.includes('Admin') && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/admin">Admin</Link>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* User Info */}
          <div className="flex items-center gap-4">
            {loading ? (
              <span className="text-sm text-muted-foreground">Cargando usuario...</span>
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email || 'Email no disponible'}</p>
                  {user.roles.length > 0 && (
                    <div className="flex gap-1 justify-end mt-0.5">
                      {user.roles.map((role) => (
                        <Badge key={role} variant="secondary" className={
                          role === 'Weather.Admin' ? 'bg-purple-100 text-purple-700' :
                          role === 'Weather.User' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }>
                          {role}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-destructive">
                  <LogOut className="h-4 w-4" />
                  <span className="sr-only">Salir</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium">No autenticado</span>
                </div>
                <Button size="sm" onClick={login}>
                  <LogIn className="h-4 w-4 mr-1" />
                  Iniciar sesión
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
