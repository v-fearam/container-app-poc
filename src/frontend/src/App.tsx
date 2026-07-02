import { useState } from 'react';
import { appInsights } from './appInsights';
import './App.css';

interface WeatherForecast {
  date: string;
  temperatureC: number;
  temperatureF: number;
  summary: string;
}

function App() {
  const [weather, setWeather] = useState<WeatherForecast[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const fetchWeather = async () => {
    setLoading(true);
    setError(null);
    
    // Track custom event
    appInsights.trackEvent({ name: 'FetchWeatherButtonClicked' });

    try {
      const startTime = Date.now();
      const response = await fetch(`${apiUrl}/weatherforecast`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setWeather(data);

      // Track successful API call duration
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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);

      // Track exception
      appInsights.trackException({
        exception: err instanceof Error ? err : new Error(errorMessage),
        severityLevel: 3, // Error
      });

      appInsights.trackEvent({
        name: 'WeatherFetchFailed',
        properties: { error: errorMessage },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🌤️ Skill Camuzzi - Weather App</h1>
        <p>Bienvenido a la aplicación de clima con telemetría end-to-end</p>
        
        <button 
          onClick={fetchWeather}
          disabled={loading}
          className="weather-button"
        >
          {loading ? 'Cargando...' : 'Obtener Clima'}
        </button>

        {error && (
          <div className="error">
            <h3>❌ Error</h3>
            <p>{error}</p>
          </div>
        )}

        {weather && (
          <div className="weather-container">
            <h2>📊 Pronóstico del Tiempo</h2>
            <div className="weather-grid">
              {weather.map((forecast, index) => (
                <div key={index} className="weather-card">
                  <h3>{new Date(forecast.date).toLocaleDateString('es-AR')}</h3>
                  <p className="temperature">{forecast.temperatureC}°C</p>
                  <p className="temperature-f">({forecast.temperatureF}°F)</p>
                  <p className="summary">{forecast.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="info-section">
          <h3>📡 Telemetría Configurada</h3>
          <ul>
            <li>✅ Application Insights habilitado</li>
            <li>✅ Correlación CORS activada</li>
            <li>✅ Tracking de requests y responses</li>
            <li>✅ Distributed tracing end-to-end</li>
          </ul>
        </div>
      </header>
    </div>
  );
}

export default App;
