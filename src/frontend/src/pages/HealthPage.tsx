import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';

interface ComponentHealth {
  componentName: string;
  status: string;
  lastHeartbeat: string;
  metadata?: string;
}

export function HealthPage() {
  const { get } = useApi();
  const [components, setComponents] = useState<ComponentHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const result = await get<ComponentHealth[]>('/api/health/components');
        if (isMounted) {
          setComponents(result);
          setLastRefresh(new Date());
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error desconocido');
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [get]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'degraded':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'unhealthy':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getStatusIndicator = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>;
      case 'degraded':
        return <span className="inline-block w-2 h-2 bg-amber-500 rounded-full"></span>;
      case 'unhealthy':
        return <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>;
      default:
        return <span className="inline-block w-2 h-2 bg-slate-400 rounded-full"></span>;
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="h-40 bg-slate-200 rounded-lg"></div>
            <div className="h-40 bg-slate-200 rounded-lg"></div>
            <div className="h-40 bg-slate-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error al cargar estado de componentes</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const healthyCount = components.filter(c => c.status.toLowerCase() === 'healthy').length;
  const degradedCount = components.filter(c => c.status.toLowerCase() === 'degraded').length;
  const unhealthyCount = components.filter(c => c.status.toLowerCase() === 'unhealthy').length;
  const totalComponents = components.length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Estado de Componentes</h1>
          <p className="text-sm text-slate-600 mt-2">
            Actualización automática cada 30s · Última actualización:{' '}
            <span className="font-mono">{lastRefresh.toLocaleTimeString()}</span>
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
          <p className="text-sm text-slate-600 mb-1">Total Componentes</p>
          <p className="text-3xl font-bold text-slate-900">{totalComponents}</p>
        </div>
        <div className="bg-white border border-green-200 rounded-lg shadow-sm p-6">
          <p className="text-sm text-green-700 mb-1">Saludables</p>
          <p className="text-3xl font-bold text-green-600">{healthyCount}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-lg shadow-sm p-6">
          <p className="text-sm text-amber-700 mb-1">Degradados</p>
          <p className="text-3xl font-bold text-amber-600">{degradedCount}</p>
        </div>
        <div className="bg-white border border-red-200 rounded-lg shadow-sm p-6">
          <p className="text-sm text-red-700 mb-1">No Saludables</p>
          <p className="text-3xl font-bold text-red-600">{unhealthyCount}</p>
        </div>
      </div>

      {/* Components List */}
      {components.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-slate-600">No hay componentes registrados aún</p>
          <p className="text-sm text-slate-500 mt-2">Los componentes aparecerán aquí cuando reporten su estado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {components.map((component) => {
            const timeSinceHeartbeat = new Date().getTime() - new Date(component.lastHeartbeat).getTime();
            const minutesAgo = Math.floor(timeSinceHeartbeat / 60000);
            const isStale = minutesAgo > 5;

            return (
              <div
                key={component.componentName}
                className={`bg-white border rounded-lg shadow-sm overflow-hidden ${
                  isStale ? 'border-amber-300' : 'border-slate-200'
                }`}
              >
                {/* Component Header */}
                <div className={`px-6 py-4 border-b ${isStale ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">{component.componentName}</h3>
                    {getStatusIndicator(component.status)}
                  </div>
                </div>

                {/* Component Body */}
                <div className="px-6 py-4">
                  <div className="mb-4">
                    <p className="text-sm text-slate-600 mb-2">Estado:</p>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(component.status)}`}>
                      {component.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm text-slate-600 mb-1">Último heartbeat:</p>
                    <p className="text-sm font-mono text-slate-900">{new Date(component.lastHeartbeat).toLocaleString()}</p>
                    {isStale && (
                      <p className="text-sm text-amber-600 mt-1">⚠️ Hace {minutesAgo} minutos</p>
                    )}
                  </div>

                  {component.metadata && (
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Metadata:</p>
                      <pre className="bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-xs font-mono text-slate-900">
                        {component.metadata}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
