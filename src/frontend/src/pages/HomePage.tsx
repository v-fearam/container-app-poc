import { useState } from 'react';
import { appInsights } from '../appInsights';
import { useAuth } from '../context/AuthContext';
import { useApi, ApiError } from '../hooks/useApi';
import { WeatherCard, type WeatherForecast } from '../components/WeatherCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Cloud, AlertCircle, CheckCircle2, XCircle, Shield, BarChart3, Code, Loader2 } from 'lucide-react';

interface EndpointTestResult {
  status: 'idle' | 'loading' | 'success' | 'error';
  statusCode?: number;
  message?: string;
}

export function HomePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { get } = useApi();
  const [weather, setWeather] = useState<WeatherForecast[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roles, setRoles] = useState<string[] | null>(null);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [userEndpoint, setUserEndpoint] = useState<EndpointTestResult>({ status: 'idle' });
  const [adminEndpoint, setAdminEndpoint] = useState<EndpointTestResult>({ status: 'idle' });

  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      const data = await get<{ roles: string[] }>('/roles');
      setRoles(data.roles);
    } catch {
      setRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  const testEndpoint = async (path: string, setter: (r: EndpointTestResult) => void) => {
    setter({ status: 'loading' });
    try {
      await get<WeatherForecast[]>(path);
      setter({ status: 'success', statusCode: 200, message: 'Acceso permitido' });
    } catch (err) {
      if (err instanceof ApiError) {
        setter({ status: 'error', statusCode: err.status, message: err.status === 403 ? 'Rol insuficiente' : err.status === 401 ? 'No autenticado' : err.body });
      } else {
        setter({ status: 'error', message: 'Error de red' });
      }
    }
  };

  const fetchWeather = async () => {
    setLoading(true);
    setError(null);
    appInsights.trackEvent({ name: 'FetchWeatherButtonClicked' });

    try {
      const startTime = Date.now();
      const data = await get<WeatherForecast[]>('/weatherforecast');
      setWeather(data);
      const duration = Date.now() - startTime;
      appInsights.trackMetric({ name: 'WeatherAPICallDuration', average: duration });
      appInsights.trackEvent({ name: 'WeatherDataFetched', properties: { recordCount: data.length } });
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? `HTTP ${err.status}: ${err.body}`
        : err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error al obtener el clima: ${errorMessage}`);
      appInsights.trackException({ exception: err instanceof Error ? err : new Error(errorMessage), severityLevel: 3 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Hero */}
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-slate-900 mb-4">Pronóstico del Tiempo</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Consulta el clima en tiempo real con telemetría distribuida end-to-end
        </p>
      </div>

      {/* Auth Status */}
      <div className="max-w-2xl mx-auto mb-8">
        <Card className={
          authLoading ? 'bg-slate-50' :
          isAuthenticated ? 'bg-green-50 border-green-200' :
          'bg-amber-50 border-amber-200'
        }>
          <CardContent className="p-4">
            <p className="font-semibold">
              Estado de autenticación: {authLoading ? 'Verificando...' : isAuthenticated ? 'Autenticado' : 'No autenticado'}
            </p>
            {!authLoading && !isAuthenticated && (
              <p className="text-sm text-muted-foreground mt-1">Usuario no autenticado (Easy Auth no configurado o en desarrollo local)</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Button */}
      <div className="flex justify-center mb-12">
        <Button
          size="lg"
          onClick={fetchWeather}
          disabled={loading}
          className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl"
        >
          {loading ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...</>
          ) : (
            <><Cloud className="h-5 w-5 mr-2" /> Obtener Clima</>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="max-w-2xl mx-auto mb-8 border-destructive bg-red-50">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900 mb-1">Error al obtener datos</h3>
              <p className="text-red-700">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weather Cards */}
      {weather && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-slate-900 text-center">Próximos 5 Días</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {weather.map((forecast, index) => (
              <WeatherCard key={index} forecast={forecast} />
            ))}
          </div>
        </div>
      )}

      {/* Role Diagnostics */}
      <div className="mt-16 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle>Diagnóstico de Roles y Endpoints</CardTitle>
                <p className="text-sm text-muted-foreground">Verifica qué roles tiene el usuario y qué endpoints puede acceder</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* /roles */}
              <Card className="bg-slate-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <code className="text-sm font-mono bg-slate-200 px-2 py-0.5 rounded">GET /roles</code>
                    <Button size="sm" variant="default" className="bg-indigo-600 hover:bg-indigo-700" onClick={fetchRoles} disabled={rolesLoading}>
                      {rolesLoading ? '...' : 'Consultar'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">Roles del usuario actual</p>
                  {roles !== null && (
                    <div className="mt-2">
                      {roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {roles.map((role) => (
                            <Badge key={role} className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-0">{role}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">Sin roles asignados</span>
                      )}
                    </div>
                  )}
                  {roles === null && !rolesLoading && (
                    <p className="text-xs text-muted-foreground italic">Click "Consultar" para ver roles</p>
                  )}
                </CardContent>
              </Card>

              {/* /weatherforecast/user */}
              <Card className="bg-slate-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <code className="text-sm font-mono bg-slate-200 px-2 py-0.5 rounded">GET /weatherforecast/user</code>
                    <Button size="sm" onClick={() => testEndpoint('/weatherforecast/user', setUserEndpoint)} disabled={userEndpoint.status === 'loading'}>
                      {userEndpoint.status === 'loading' ? '...' : 'Probar'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">Requiere rol: <span className="font-semibold">User</span></p>
                  {userEndpoint.status !== 'idle' && userEndpoint.status !== 'loading' && (
                    <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                      userEndpoint.status === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {userEndpoint.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                      <span>{userEndpoint.statusCode} — {userEndpoint.message}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* /weatherforecast/admin */}
              <Card className="bg-slate-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <code className="text-sm font-mono bg-slate-200 px-2 py-0.5 rounded">GET /weatherforecast/admin</code>
                    <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => testEndpoint('/weatherforecast/admin', setAdminEndpoint)} disabled={adminEndpoint.status === 'loading'}>
                      {adminEndpoint.status === 'loading' ? '...' : 'Probar'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">Requiere rol: <span className="font-semibold">Admin</span></p>
                  {adminEndpoint.status !== 'idle' && adminEndpoint.status !== 'loading' && (
                    <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                      adminEndpoint.status === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {adminEndpoint.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                      <span>{adminEndpoint.statusCode} — {adminEndpoint.message}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Cards */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle>Telemetría Activa</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>Application Insights habilitado</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>Correlación CORS activada</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>Distributed tracing end-to-end</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Code className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle>Tech Stack</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Frontend: React 19 + TypeScript + Vite</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full" />
                <span>Backend: .NET 10 Minimal API</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-cyan-500 rounded-full" />
                <span>Monitoring: Azure Application Insights</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
