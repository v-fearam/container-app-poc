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
  deadLetterCount: number;
  dlqPath?: string;
}

const todayStr = () => new Date().toISOString().split('T')[0];

export function DashboardPage() {
  const { get } = useApi();
  const [data, setData] = useState<QueueCounter[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [filterDate, setFilterDate] = useState(todayStr());

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const params = new URLSearchParams();
        if (filterDate) params.set('fecha', filterDate);
        const qs = params.toString();
        const result = await get<QueueCounter[]>(`/api/dashboard/kpi${qs ? `?${qs}` : ''}`);
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
  }, [get, filterDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header Skeleton */}
          <div className="mb-8">
            <div className="h-10 bg-white/60 rounded-lg w-96 mb-3 animate-pulse"></div>
            <div className="h-5 bg-white/40 rounded w-64 animate-pulse"></div>
          </div>

          {/* Stats Grid Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-24 mb-4"></div>
                <div className="h-8 bg-slate-200 rounded w-32"></div>
              </div>
            ))}
          </div>

          {/* Chart Skeleton */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-48 mb-6"></div>
            <div className="h-64 bg-slate-100 rounded"></div>
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
  // Group by vertical + queue (DLQ is per queue, not per processType)
  const queueGroups = data ? (() => {
    const byQueue: Record<string, {
      vertical: string;
      queueName: string;
      dlqCount: number;
      dlqPath: string;
      processes: { processType: string; enqueuedCount: number; processedCount: number; date: string }[];
    }> = {};

    for (const item of data) {
      const qKey = `${item.vertical}|${item.queueName}`;
      if (!byQueue[qKey]) {
        byQueue[qKey] = {
          vertical: item.vertical,
          queueName: item.queueName,
          dlqCount: item.deadLetterCount,
          dlqPath: item.dlqPath || item.queueName,
          processes: [],
        };
      }
      byQueue[qKey].processes.push({
        processType: item.processType,
        enqueuedCount: item.enqueuedCount,
        processedCount: item.processedCount,
        date: item.date,
      });
    }
    return Object.values(byQueue);
  })() : [];

  const totalEnqueued = queueGroups.reduce((sum, q) => sum + q.processes.reduce((s, p) => s + p.enqueuedCount, 0), 0);
  const totalProcessed = queueGroups.reduce((sum, q) => sum + q.processes.reduce((s, p) => s + p.processedCount, 0), 0);
  const totalDlq = queueGroups.reduce((sum, q) => sum + q.dlqCount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">
                Dashboard POC
              </h1>
              <p className="text-slate-600">
                Monitoreo de mensajería en tiempo real
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="text-sm font-medium text-slate-700">En vivo</span>
                </div>
                <span className="text-slate-300">·</span>
                <span className="text-sm text-slate-600">
                  Actualiza cada 5s
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="dashDate" className="text-sm text-slate-600 font-medium">Fecha:</label>
                <input
                  id="dashDate"
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {filterDate !== todayStr() && (
                  <button
                    onClick={() => setFilterDate(todayStr())}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Hoy
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="text-sm text-slate-500">
            Última actualización: <span className="font-mono font-medium text-slate-700">{lastRefresh.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Empty State with Icon */}
        {queueGroups.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
            <div className="max-w-md mx-auto">
              {/* Icon */}
              <div className="mb-6 flex justify-center">
                <div className="rounded-full bg-slate-100 p-6">
                  <svg className="w-16 h-16 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
              
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                No hay datos disponibles
              </h3>
              <p className="text-slate-600 mb-6">
                El dashboard se poblará automáticamente cuando los workers procesen mensajes del Service Bus
              </p>
              
              {/* Info Cards */}
              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <div className="text-sm font-medium text-blue-900 mb-1">✓ Backend API</div>
                  <div className="text-xs text-blue-700">Conectado y funcionando</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                  <div className="text-sm font-medium text-green-900 mb-1">✓ Auto-refresh</div>
                  <div className="text-xs text-green-700">Actualizando cada 5s</div>
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-8 text-left bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="text-sm font-medium text-slate-900 mb-2">💡 Para generar datos:</div>
                <ol className="text-sm text-slate-600 space-y-1.5 list-decimal list-inside">
                  <li>Ejecuta el Service Bus Enqueuer para enviar mensajes</li>
                  <li>Los workers procesarán los mensajes automáticamente</li>
                  <li>Los contadores aparecerán aquí en tiempo real</li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-blue-100 text-sm font-medium uppercase tracking-wide">Total Encolados</div>
                  <svg className="w-8 h-8 text-blue-200/50" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                  </svg>
                </div>
                <div className="text-4xl font-bold">
                  {totalEnqueued.toLocaleString()}
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-green-100 text-sm font-medium uppercase tracking-wide">Total Procesados</div>
                  <svg className="w-8 h-8 text-green-200/50" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-4xl font-bold">
                  {totalProcessed.toLocaleString()}
                </div>
              </div>

              <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-red-100 text-sm font-medium uppercase tracking-wide">DLQ (Total)</div>
                  <svg className="w-8 h-8 text-red-200/50" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-4xl font-bold">
                  {totalDlq.toLocaleString()}
                </div>
                <p className="text-red-200 text-xs mt-2">Ver detalle por cola abajo ↓</p>
              </div>
            </div>

            {/* Queue Groups */}
            {queueGroups.map((queue) => (
              <div key={`${queue.vertical}-${queue.queueName}`} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                {/* Queue Header */}
                <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-5 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 mb-1">
                        {queue.vertical} <span className="text-slate-400">·</span> {queue.queueName}
                      </h2>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Encolados</p>
                        <p className="text-3xl font-bold text-slate-900">{queue.processes.reduce((s, p) => s + p.enqueuedCount, 0).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Procesados</p>
                        <p className="text-3xl font-bold text-green-600">{queue.processes.reduce((s, p) => s + p.processedCount, 0).toLocaleString()}</p>
                      </div>
                      {queue.dlqCount > 0 && (
                        <Link to={`/dashboard/dlq/${queue.dlqPath}`} className="text-right cursor-pointer hover:opacity-80 transition-opacity">
                          <p className="text-xs text-red-600 font-medium uppercase tracking-wide mb-1">DLQ</p>
                          <p className="text-3xl font-bold text-red-600">{queue.dlqCount.toLocaleString()}</p>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {/* Process Types Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Tipo Proceso</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Fecha</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Encolados</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Procesados</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Pendientes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {queue.processes.map((proc, idx) => {
                        const pending = proc.enqueuedCount - proc.processedCount;
                        const processingRate = proc.enqueuedCount > 0 ? (proc.processedCount / proc.enqueuedCount * 100) : 0;
                        
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors duration-150">
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                                {proc.processType}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono text-sm font-medium text-slate-900">{proc.date.split('T')[0]}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-medium text-slate-900">{proc.enqueuedCount.toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-sm font-medium text-green-600">{proc.processedCount.toLocaleString()}</span>
                                <span className="text-xs text-slate-500">({processingRate.toFixed(1)}%)</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {pending > 0 ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                  {pending}
                                </span>
                              ) : (
                                <span className="text-sm text-green-500">✓</span>
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
    </div>
  );
}
