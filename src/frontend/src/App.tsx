import { useState, useEffect } from 'react';
import { appInsights } from './appInsights';
import { runtimeConfig } from './runtimeConfig';

interface WeatherForecast {
  date: string;
  temperatureC: number;
  temperatureF: number;
  summary: string;
  userRole: string; // Added: rol del usuario
}

interface UserInfo {
  isAuthenticated: boolean;
  email?: string;
  name?: string;
  userId?: string;
  roles?: string[];
  message?: string;
}

function App() {
  const [weather, setWeather] = useState<WeatherForecast[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo>({
    isAuthenticated: false,
    message: 'No autenticado'
  });
  const [loadingUser, setLoadingUser] = useState(false);

  const apiUrl = runtimeConfig.apiUrl || import.meta.env.VITE_API_URL || '';

  // Fetch user info from backend
  const fetchUserInfo = async () => {
    if (!apiUrl) {
      setUserInfo({
        isAuthenticated: false,
        message: 'API URL no configurada'
      });
      return;
    }
    
    setLoadingUser(true);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/userinfo`, {
        credentials: 'include' // Important for Easy Auth cookies
      });
      
      if (response.ok) {
        const data = await response.json();
        setUserInfo(data);
        appInsights.trackEvent({ 
          name: 'UserInfoFetched',
          properties: { isAuthenticated: data.isAuthenticated }
        });
      } else {
        setUserInfo({
          isAuthenticated: false,
          message: `Error HTTP ${response.status}: No se pudo obtener información del usuario`
        });
      }
    } catch (err) {
      console.error('Error fetching user info:', err);
      setUserInfo({
        isAuthenticated: false,
        message: 'Error al conectar con el servidor'
      });
    } finally {
      setLoadingUser(false);
    }
  };

  const fetchWeather = async () => {
    setLoading(true);
    setError(null);

    if (!apiUrl) {
      setError('API URL no configurada. Define API_URL (runtime) o VITE_API_URL (build).');
      setLoading(false);
      return;
    }
    
    appInsights.trackEvent({ name: 'FetchWeatherButtonClicked' });

    try {
      const startTime = Date.now();
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/weatherforecast`, {
        credentials: 'include' // Important for Easy Auth cookies
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setWeather(data);

      const duration = Date.now() - startTime;
      appInsights.trackMetric({
        name: 'WeatherAPICallDuration',
        average: duration,
      });

      appInsights.trackEvent({
        name: 'WeatherDataFetched',
        properties: { recordCount: data.length },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error al obtener el clima: ${errorMessage}`);
      
      appInsights.trackException({
        exception: err instanceof Error ? err : new Error(errorMessage),
        severityLevel: 3,
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch user info on component mount
  useEffect(() => {
    fetchUserInfo();
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header/Navbar */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Camuzzi Weather</h1>
            </div>
            
            {/* User Info Display */}
            <div className="flex items-center gap-4">
              {loadingUser ? (
                <div className="text-sm text-slate-500">Cargando usuario...</div>
              ) : userInfo?.isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-slate-900">
                      {userInfo.name || 'Usuario'}
                    </div>
                    <div className="text-xs text-slate-600">
                      {userInfo.email || 'Email no disponible'}
                    </div>
                    {userInfo.roles && userInfo.roles.length > 0 && (
                      <div className="text-xs text-blue-600 font-semibold">
                        Rol: {userInfo.roles.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600" title={userInfo?.message || 'Usuario no autenticado'}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-right">
                    <div className="font-medium">No autenticado</div>
                    {userInfo?.message && (
                      <div className="text-xs text-slate-500">{userInfo.message}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">
            Pronóstico del Tiempo
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Consulta el clima en tiempo real con telemetría distribuida end-to-end
          </p>
        </div>

        <div className="max-w-2xl mx-auto mb-8">
          <div className={`rounded-xl border p-4 ${loadingUser
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : userInfo.isAuthenticated
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
            <p className="font-semibold">
              Estado de autenticacion: {loadingUser ? 'Verificando...' : userInfo.isAuthenticated ? 'Autenticado' : 'No autenticado'}
            </p>
            {!loadingUser && userInfo.message && (
              <p className="text-sm mt-1">{userInfo.message}</p>
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
                <div
                  key={index}
                  className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer"
                >
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-600 mb-2">
                      {new Date(forecast.date).toLocaleDateString('es-AR', { 
                        weekday: 'short', 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </p>
                    <div className="my-4">
                      <svg className="w-16 h-16 mx-auto text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 mb-1">
                      {forecast.temperatureC}°
                    </p>
                    <p className="text-sm text-slate-500 mb-3">
                      {forecast.temperatureF}°F
                    </p>
                    <p className="text-sm font-medium text-slate-700 bg-slate-100 rounded-lg py-2 px-3 mb-2">
                      {forecast.summary}
                    </p>
                    {/* User Role Badge */}
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-xs text-slate-500 mb-1">Consultado por:</p>
                      <p className={`text-xs font-semibold px-2 py-1 rounded-md inline-block ${
                        forecast.userRole === 'Admin' ? 'bg-purple-100 text-purple-700' :
                        forecast.userRole === 'User' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {forecast.userRole}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-gray-200 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-slate-600">
            <p className="text-sm">
              © 2026 Camuzzi - Aplicación de demostración con Azure Container Apps
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
