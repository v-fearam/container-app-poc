import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useJobsApi } from '../hooks/useJobsApi';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Inbox, CheckCircle, Trash2, AlertCircle, BarChart3, CalendarDays, Calendar } from 'lucide-react';
import type { JobExecutionCounter } from '../types/jobs';

interface QueueCounter {
  vertical: string;
  queueName: string;
  processType: string;
  date: string;
  enqueuedCount: number;
  processedCount: number;
  deadLetterCount: number;
  discardedCount: number;
  dlqPath?: string;
}

const todayStr = () => new Date().toISOString().split('T')[0];

export function DashboardPage() {
  const { get } = useApi();
  const { getJobExecutionCounters } = useJobsApi();
  const [data, setData] = useState<QueueCounter[] | null>(null);
  const [jobExecutions, setJobExecutions] = useState<JobExecutionCounter[]>([]);
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
        
        const [queueData, jobData] = await Promise.all([
          get<QueueCounter[]>(`/api/dashboard/kpi${qs ? `?${qs}` : ''}`),
          getJobExecutionCounters()
        ]);
        
        if (isMounted) {
          setData(queueData);
          setJobExecutions(jobData);
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

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [get, filterDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="h-10 bg-white/60 rounded-lg w-96 mb-3 animate-pulse" />
            <div className="h-5 bg-white/40 rounded w-64 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-slate-200 rounded w-24 mb-4" />
                  <div className="h-8 bg-slate-200 rounded w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-6 bg-slate-200 rounded w-48 mb-6" />
              <div className="h-64 bg-slate-100 rounded" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Card className="border-destructive bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Error al cargar datos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const queueGroups = data ? (() => {
    const byQueue: Record<string, {
      vertical: string;
      queueName: string;
      dlqCount: number;
      dlqPath: string;
      processes: { processType: string; enqueuedCount: number; processedCount: number; discardedCount: number; date: string }[];
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
        discardedCount: item.discardedCount,
        date: item.date,
      });
    }
    return Object.values(byQueue);
  })() : [];

  const totalEnqueued = queueGroups.reduce((sum, q) => sum + q.processes.reduce((s, p) => s + p.enqueuedCount, 0), 0);
  const totalProcessed = queueGroups.reduce((sum, q) => sum + q.processes.reduce((s, p) => s + p.processedCount, 0), 0);
  const totalDlq = queueGroups.reduce((sum, q) => sum + q.dlqCount, 0);
  const totalDiscarded = queueGroups.reduce((sum, q) => sum + q.processes.reduce((s, p) => s + p.discardedCount, 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard POC</h1>
              <p className="text-muted-foreground">Monitoreo de mensajería en tiempo real</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Card className="px-4 py-2.5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                    </span>
                    <span className="text-sm font-medium">En vivo</span>
                  </div>
                  <span className="text-slate-300">·</span>
                  <span className="text-sm text-muted-foreground">Actualiza cada 5s</span>
                </div>
              </Card>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-auto"
                />
                {filterDate !== todayStr() && (
                  <Button variant="ghost" size="sm" onClick={() => setFilterDate(todayStr())}>
                    Hoy
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Última actualización: <span className="font-mono font-medium text-slate-700">{lastRefresh.toLocaleTimeString()}</span>
          </p>
        </div>

        {/* Empty State */}
        {queueGroups.length === 0 ? (
          <Card className="p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="mb-6 flex justify-center">
                <div className="rounded-full bg-slate-100 p-6">
                  <BarChart3 className="w-16 h-16 text-slate-400" />
                </div>
              </div>
              <CardTitle className="text-xl mb-3">No hay datos disponibles</CardTitle>
              <CardDescription className="mb-6">
                El dashboard se poblará automáticamente cuando los workers procesen mensajes del Service Bus
              </CardDescription>
              <div className="grid grid-cols-2 gap-4 text-left">
                <Card className="bg-blue-50 border-blue-100 p-4">
                  <p className="text-sm font-medium text-blue-900 mb-1">✓ Backend API</p>
                  <p className="text-xs text-blue-700">Conectado y funcionando</p>
                </Card>
                <Card className="bg-green-50 border-green-100 p-4">
                  <p className="text-sm font-medium text-green-900 mb-1">✓ Auto-refresh</p>
                  <p className="text-xs text-green-700">Actualizando cada 5s</p>
                </Card>
              </div>
              <Card className="mt-8 text-left bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900 mb-2">💡 Para generar datos:</p>
                <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>Ejecuta el Service Bus Enqueuer para enviar mensajes</li>
                  <li>Los workers procesarán los mensajes automáticamente</li>
                  <li>Los contadores aparecerán aquí en tiempo real</li>
                </ol>
              </Card>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-blue-100 text-sm font-medium uppercase tracking-wide">Total Encolados</CardTitle>
                    <Inbox className="h-8 w-8 text-blue-200/50" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">{totalEnqueued.toLocaleString()}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-green-100 text-sm font-medium uppercase tracking-wide">Total Procesados</CardTitle>
                    <CheckCircle className="h-8 w-8 text-green-200/50" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">{totalProcessed.toLocaleString()}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-amber-100 text-sm font-medium uppercase tracking-wide">Descartados</CardTitle>
                    <Trash2 className="h-8 w-8 text-amber-200/50" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">{totalDiscarded.toLocaleString()}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-red-100 text-sm font-medium uppercase tracking-wide">DLQ (Total)</CardTitle>
                    <AlertCircle className="h-8 w-8 text-red-200/50" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">{totalDlq.toLocaleString()}</p>
                  <p className="text-red-200 text-xs mt-2">Total en cola · sin filtro de fecha</p>
                </CardContent>
              </Card>
            </div>

            {/* Job Executions Widget */}
            {jobExecutions.length === 0 && (
              <Card className="bg-slate-50 border-slate-200">
                <CardContent className="p-6 flex items-center gap-3 text-center">
                  <span className="text-lg">📋</span>
                  <p className="text-sm text-muted-foreground">No hay datos de ejecución de Container Jobs aún</p>
                </CardContent>
              </Card>
            )}

            {jobExecutions.length > 0 && (() => {
              // Filter jobs for selected date
              const jobsToday = jobExecutions.filter(j => j.date.split('T')[0] === filterDate);
              const jobsYesterday = jobExecutions.filter(j => {
                const yesterday = new Date(filterDate);
                yesterday.setDate(yesterday.getDate() - 1);
                return j.date.split('T')[0] === yesterday.toISOString().split('T')[0];
              });

              if (jobsToday.length === 0) return null;

              return (
                <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-purple-600" />
                        <div>
                          <CardTitle className="text-slate-900">Container Jobs Ejecutados</CardTitle>
                          <CardDescription>Jobs ejecutados el {new Date(filterDate).toLocaleDateString('es-AR')}</CardDescription>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/scheduler">Ver Scheduler</Link>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {jobsToday.map((job, idx) => {
                        const yesterday = jobsYesterday.find(j => j.jobName === job.jobName);
                        const diff = yesterday ? job.totalExecutions - yesterday.totalExecutions : 0;
                        const percentChange = yesterday && yesterday.totalExecutions > 0
                          ? ((diff / yesterday.totalExecutions) * 100).toFixed(0)
                          : null;

                        return (
                          <div key={`${job.jobName}-${job.date}-${idx}`} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-mono text-sm font-medium text-slate-900">{job.jobName}</span>
                                <Badge variant="outline" className="text-xs">{job.hoursWithExecutions} horas activas</Badge>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-3xl font-bold text-purple-600">{job.totalExecutions}</span>
                                  <span className="text-sm text-muted-foreground">ejecuciones</span>
                                </div>
                                {percentChange !== null && (
                                  <div className={`flex items-center gap-1 text-xs ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                    {diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} {Math.abs(Number(percentChange))}% vs ayer
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground mb-1">Promedio/hora</p>
                                <p className="text-lg font-semibold text-slate-700">
                                  {job.hoursWithExecutions > 0 ? (job.totalExecutions / job.hoursWithExecutions).toFixed(1) : '0'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Queue Groups */}
            {queueGroups.map((queue) => (
              <Card key={`${queue.vertical}-${queue.queueName}`} className="overflow-hidden hover:shadow-md transition-shadow duration-200">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">
                      {queue.vertical} <span className="text-slate-400">·</span> {queue.queueName}
                    </CardTitle>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Encolados</p>
                        <p className="text-3xl font-bold text-slate-900">{queue.processes.reduce((s, p) => s + p.enqueuedCount, 0).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Procesados</p>
                        <p className="text-3xl font-bold text-green-600">{queue.processes.reduce((s, p) => s + p.processedCount, 0).toLocaleString()}</p>
                      </div>
                      {queue.dlqCount > 0 && (
                        <Link to={`/dashboard/dlq/${queue.dlqPath}?fecha=${filterDate}`} className="text-right cursor-pointer hover:opacity-80 transition-opacity" title="Total en cola DLQ (no depende de la fecha)">
                          <p className="text-xs text-red-600 font-medium uppercase tracking-wide mb-1">DLQ 🔴</p>
                          <p className="text-3xl font-bold text-red-600">{queue.dlqCount.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground mt-1">total en cola</p>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="px-6 py-3 uppercase tracking-wider text-xs">Tipo Proceso</TableHead>
                        <TableHead className="px-6 py-3 uppercase tracking-wider text-xs">Fecha</TableHead>
                        <TableHead className="px-6 py-3 text-right uppercase tracking-wider text-xs">Encolados</TableHead>
                        <TableHead className="px-6 py-3 text-right uppercase tracking-wider text-xs">Procesados</TableHead>
                        <TableHead className="px-6 py-3 text-right uppercase tracking-wider text-xs">Descartados</TableHead>
                        <TableHead className="px-6 py-3 text-right uppercase tracking-wider text-xs">Pendientes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queue.processes.map((proc, idx) => {
                        const pending = proc.enqueuedCount - proc.processedCount - proc.discardedCount;
                        const processingRate = proc.enqueuedCount > 0 ? (proc.processedCount / proc.enqueuedCount * 100) : 0;

                        return (
                          <TableRow key={idx}>
                            <TableCell className="px-6 py-4">
                              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-0 rounded-full px-3 py-1">
                                {proc.processType}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              <span className="font-mono text-sm font-medium">{proc.date.split('T')[0]}</span>
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right font-medium">
                              {proc.enqueuedCount.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-medium text-green-600">{proc.processedCount.toLocaleString()}</span>
                                <span className="text-xs text-muted-foreground">({processingRate.toFixed(1)}%)</span>
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right">
                              {proc.discardedCount > 0 ? (
                                <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
                                  {proc.discardedCount}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right">
                              {pending > 0 ? (
                                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                                  {pending}
                                </Badge>
                              ) : (
                                <span className="text-green-500">✓</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
