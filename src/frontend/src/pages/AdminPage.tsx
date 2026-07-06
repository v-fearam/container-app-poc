import { useState } from 'react';
import { appInsights } from '../appInsights';
import { useAuth } from '../context/AuthContext';
import { useApi, ApiError } from '../hooks/useApi';
import { WeatherCard, type WeatherForecast } from '../components/WeatherCard';

export function AdminPage() {
  const { user } = useAuth();
  const { get } = useApi();
  const [weather, setWeather] = useState<WeatherForecast[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAdminWeather = async () => {
    setLoading(true);
    setError(null);

    appInsights.trackEvent({ name: 'FetchAdminWeatherClicked' });

    try {
      const data = await get<WeatherForecast[]>('/weatherforecast/admin');
      setWeather(data);
      appInsights.trackEvent({ name: 'AdminWeatherDataFetched', properties: { recordCount: data.length } });
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? `HTTP ${err.status}: ${err.body}`
        : err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error al obtener datos admin: ${errorMessage}`);

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
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-slate-900 mb-4">
          Panel de Administración
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Datos meteorológicos extendidos — solo para administradores
        </p>
      </div>

      {/* Action Button */}
      <div className="flex justify-center mb-12">
        <button
          onClick={fetchAdminWeather}
          disabled={loading}
          className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Obtener Clima (Admin)
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
            Datos Admin
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {weather.map((forecast, index) => (
              <WeatherCard key={index} forecast={forecast} />
            ))}
          </div>
        </div>
      )}

      {/* Raw Claims */}
      {user && (
        <div className="mt-12 max-w-2xl mx-auto">
          <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Claims del Usuario</h3>
            <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm text-slate-700 overflow-auto">
              <pre>{JSON.stringify(user, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
