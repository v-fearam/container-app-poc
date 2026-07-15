import { useState } from 'react';
import { appInsights } from '../appInsights';
import { useAuth } from '../context/AuthContext';
import { useApi, ApiError } from '../hooks/useApi';
import { WeatherCard, type WeatherForecast } from '../components/WeatherCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Shield, Loader2 } from 'lucide-react';

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
        <h2 className="text-4xl font-bold text-slate-900 mb-4">Panel de Administración</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Datos meteorológicos extendidos — solo para administradores
        </p>
      </div>

      {/* Action Button */}
      <div className="flex justify-center mb-12">
        <Button
          size="lg"
          onClick={fetchAdminWeather}
          disabled={loading}
          className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl"
        >
          {loading ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...</>
          ) : (
            <><Shield className="h-5 w-5 mr-2" /> Obtener Clima (Admin)</>
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
          <h3 className="text-2xl font-bold text-slate-900 text-center">Datos Admin</h3>
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
          <Card>
            <CardHeader>
              <CardTitle>Claims del Usuario</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted rounded-lg p-4 font-mono text-sm overflow-auto">
                {JSON.stringify(user, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
