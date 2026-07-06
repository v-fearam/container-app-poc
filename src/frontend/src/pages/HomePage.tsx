import { useState } from 'react';
import { appInsights } from '../appInsights';
import { useAuth } from '../context/AuthContext';
import { useApi, ApiError } from '../hooks/useApi';
import { WeatherCard, type WeatherForecast } from '../components/WeatherCard';

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

  // Role diagnostics
  const [roles, setRoles] = useState<string[] | null>(null);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [userEndpoint, setUserEndpoint] = useState<EndpointTestResult>({ status: 'idle' });
  const [adminEndpoint, setAdminEndpoint] = useState<EndpointTestResult>({ status: 'idle' });

  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      const data = await get<{ roles: string[] }>('/roles');
      setRoles(data.roles);
    } catch (err) {
      setRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  const testEndpoint = async (
    path: string,
    setter: (r: EndpointTestResult) => void
  ) => {
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

      appInsights.trackException({
        exception: err instanceof Error ? err : new Error(errorMessage),
        severityLevel: 3,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-slate-900 mb-4">
          Pronóstico del Tiempo
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Consulta el clima en tiempo real con telemetría distribuida end-to-end
        </p>
      </div>

      {/* Auth Status */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className={`rounded-xl border p-4 ${authLoading
          ? 'bg-slate-50 border-slate-200 text-slate-700'
          : isAuthenticated
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
          <p className="font-semibold">
            Estado de autenticación: {authLoading ? 'Verificando...' : isAuthenticated ? 'Autenticado' : 'No autenticado'}
          </p>
          {!authLoading && !isAuthenticated && (
            <p className="text-sm mt-1">Usuario no autenticado (Easy Auth no configurado o en desarrollo local)</p>
          )}
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-center mb-12">
        <button
          onClick={fetchWeather}
          disabled={loading}
          className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Cargando...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              Obtener Clima
            </span>
          )}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="max-w-2xl mx-auto mb-8 bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-red-900 mb-1">Error al obtener datos</h3>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Weather Cards */}
      {weather && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-slate-900 text-center">
            Próximos 5 Días
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {weather.map((forecast, index) => (
              <WeatherCard key={index} forecast={forecast} />
            ))}
          </div>
        </div>
      )}

      {/* Role Diagnostics Panel */}
      <div className="mt-16 mb-8">
          <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Diagnóstico de Roles y Endpoints</h3>
                <p className="text-sm text-slate-500">Verifica qué roles tiene el usuario y qué endpoints puede acceder</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* /roles card */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <code className="text-sm font-mono text-slate-700 bg-slate-200 px-2 py-0.5 rounded">GET /roles</code>
                  <button
                    onClick={fetchRoles}
                    disabled={rolesLoading}
                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {rolesLoading ? '...' : 'Consultar'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-2">Roles del usuario actual</p>
                {roles !== null && (
                  <div className="mt-2">
                    {roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {roles.map((role) => (
                          <span key={role} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-800">
                            {role}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 font-medium">Sin roles asignados</span>
                    )}
                  </div>
                )}
                {roles === null && !rolesLoading && (
                  <p className="text-xs text-slate-400 italic">Click "Consultar" para ver roles</p>
                )}
              </div>

              {/* /weatherforecast/user card */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <code className="text-sm font-mono text-slate-700 bg-slate-200 px-2 py-0.5 rounded">GET /weatherforecast/user</code>
                  <button
                    onClick={() => testEndpoint('/weatherforecast/user', setUserEndpoint)}
                    disabled={userEndpoint.status === 'loading'}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {userEndpoint.status === 'loading' ? '...' : 'Probar'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-2">Requiere rol: <span className="font-semibold text-slate-700">User</span></p>
                {userEndpoint.status !== 'idle' && userEndpoint.status !== 'loading' && (
                  <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    userEndpoint.status === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {userEndpoint.status === 'success' ? (
                      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span>{userEndpoint.statusCode} — {userEndpoint.message}</span>
                  </div>
                )}
              </div>

              {/* /weatherforecast/admin card */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <code className="text-sm font-mono text-slate-700 bg-slate-200 px-2 py-0.5 rounded">GET /weatherforecast/admin</code>
                  <button
                    onClick={() => testEndpoint('/weatherforecast/admin', setAdminEndpoint)}
                    disabled={adminEndpoint.status === 'loading'}
                    className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {adminEndpoint.status === 'loading' ? '...' : 'Probar'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-2">Requiere rol: <span className="font-semibold text-slate-700">Admin</span></p>
                {adminEndpoint.status !== 'idle' && adminEndpoint.status !== 'loading' && (
                  <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    adminEndpoint.status === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {adminEndpoint.status === 'success' ? (
                      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span>{adminEndpoint.statusCode} — {adminEndpoint.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      {/* Info Cards */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Telemetría Activa</h3>
          </div>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-slate-700">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Application Insights habilitado</span>
            </li>
            <li className="flex items-center gap-2 text-slate-700">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Correlación CORS activada</span>
            </li>
            <li className="flex items-center gap-2 text-slate-700">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Distributed tracing end-to-end</span>
            </li>
          </ul>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Tech Stack</h3>
          </div>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-slate-700">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span>Frontend: React 18 + TypeScript + Vite</span>
            </li>
            <li className="flex items-center gap-2 text-slate-700">
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
              <span>Backend: .NET 10 Minimal API</span>
            </li>
            <li className="flex items-center gap-2 text-slate-700">
              <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
              <span>Monitoring: Azure Application Insights</span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
