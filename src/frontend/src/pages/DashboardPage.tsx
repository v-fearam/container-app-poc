import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Link } from 'react-router-dom';

interface QueueCounter {
  vertical: string;
  queueName: string;
  processType: string;
  date: string;
  enqueuedCount: number;
  processedCount: number;
  dlqCount: number;
}

interface DashboardKpi {
  counters: QueueCounter[];
  timestamp: string;
}

export function DashboardPage() {
  const { get } = useApi();
  const [data, setData] = useState<DashboardKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const result = await get<DashboardKpi>('/api/dashboard/kpi');
        if (isMounted) {
          setData(result);
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

    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [get]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64 mb-8"></div>
          <div className="space-y-4">
            <div className="h-24 bg-slate-200 rounded"></div>
            <div className="h-24 bg-slate-200 rounded"></div>
            <div className="h-24 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error al cargar datos</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  // Group by vertical + queue + processType
  const groupedData = data?.counters.reduce((acc, item) => {
    const key = `${item.vertical}|${item.queueName}|${item.processType}`;
    if (!acc[key]) {
      acc[key] = {
        vertical: item.vertical,
        queueName: item.queueName,
        processType: item.processType,
        totalEnqueued: 0,
        totalProcessed: 0,
        totalDlq: 0,
        dates: [] as QueueCounter[],
      };
    }
    acc[key].totalEnqueued += item.enqueuedCount;
    acc[key].totalProcessed += item.processedCount;
    acc[key].totalDlq += item.dlqCount;
    acc[key].dates.push(item);
    return acc;
  }, {} as Record<string, { vertical: string; queueName: string; processType: string; totalEnqueued: number; totalProcessed: number; totalDlq: number; dates: QueueCounter[] }>);

  const groups = groupedData ? Object.values(groupedData) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard - Monitoreo de Colas</h1>
          <p className="text-sm text-slate-600 mt-2">
            Actualización automática cada 5s · Última actualización:{' '}
            <span className="font-mono">{lastRefresh.toLocaleTimeString()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-sm text-slate-600">En vivo</span>
        </div>
      </div>

      {/* KPI Cards */}
      {groups.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-slate-600">No hay datos disponibles aún</p>
          <p className="text-sm text-slate-500 mt-2">Los contadores se mostrarán cuando se procesen mensajes</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={`${group.vertical}-${group.queueName}-${group.processType}`} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              {/* Group Header */}
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {group.vertical} · {group.queueName} · <span className="text-blue-600">{group.processType}</span>
                    </h2>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-slate-600">Encolados</p>
                      <p className="text-2xl font-bold text-slate-900">{group.totalEnqueued}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">Procesados</p>
                      <p className="text-2xl font-bold text-green-600">{group.totalProcessed}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">DLQ</p>
                      <p className="text-2xl font-bold text-red-600">{group.totalDlq}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dates Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Fecha</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Encolados</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Procesados</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">DLQ</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Pendientes</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.dates.map((item, idx) => {
                      const pending = item.enqueuedCount - item.processedCount;
                      return (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm font-mono text-slate-900">{item.date}</td>
                          <td className="px-6 py-4 text-sm text-right text-slate-900">{item.enqueuedCount}</td>
                          <td className="px-6 py-4 text-sm text-right text-green-600">{item.processedCount}</td>
                          <td className="px-6 py-4 text-sm text-right">
                            {item.dlqCount > 0 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                {item.dlqCount}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-right">
                            {pending > 0 ? (
                              <span className="text-amber-600 font-medium">{pending}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {item.dlqCount > 0 && (
                              <Link
                                to={`/dashboard/dlq/${encodeURIComponent(item.queueName)}`}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                              >
                                Gestionar DLQ
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
