interface WeatherForecast {
  date: string;
  temperatureC: number;
  temperatureF: number;
  summary: string;
  userRole: string;
}

interface WeatherCardProps {
  forecast: WeatherForecast;
}

export type { WeatherForecast };

export function WeatherCard({ forecast }: WeatherCardProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
      <div className="text-center">
        <p className="text-sm font-medium text-slate-600 mb-2">
          {new Date(forecast.date).toLocaleDateString('es-AR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
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
  );
}
