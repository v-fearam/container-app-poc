import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Activity, Server, MessageSquare, RefreshCw } from 'lucide-react';

interface ContainerAppStatus {
  name: string;
  status: string;
  activeReplicas: number;
  maxReplicas: number;
  latestRevision?: string;
}

interface ContainerAppJobStatus {
  name: string;
  triggerType: string;
  cronExpression?: string;
  lastExecutionStatus?: string;
  lastExecutionTime?: string;
  runningExecutions: number;
}

interface QueueStatus {
  name: string;
  activeMessages: number;
  deadLetterMessages: number;
  scheduledMessages: number;
}

interface SubscriptionStatus {
  topicName: string;
  subscriptionName: string;
  activeMessages: number;
  deadLetterMessages: number;
}

interface InfrastructureHealth {
  containerApps: ContainerAppStatus[];
  containerAppJobs: ContainerAppJobStatus[];
  serviceBus: {
    queues: QueueStatus[];
    subscriptions: SubscriptionStatus[];
  };
  cachedAt: string;
}

export function HealthPage() {
  const { get } = useApi();
  const [infra, setInfra] = useState<InfrastructureHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const result = await get<InfrastructureHealth>('/api/health/infrastructure');
        if (isMounted) {
          setInfra(result);
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
    const interval = setInterval(fetchData, 30000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [get]);

  const getAppStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Running</Badge>;
      case 'scaled to zero':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">Scaled to 0</Badge>;
      case 'provisioning':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">Provisioning</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64 mb-8" />
          <div className="h-64 bg-slate-200 rounded-lg mb-6" />
          <div className="h-48 bg-slate-200 rounded-lg" />
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
              <AlertCircle className="h-5 w-5" /> Error al cargar infraestructura
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-red-700">{error}</p></CardContent>
        </Card>
      </div>
    );
  }

  const runningApps = infra?.containerApps.filter(a => a.status.toLowerCase() === 'running').length ?? 0;
  const totalApps = infra?.containerApps.length ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Activity className="h-8 w-8 text-blue-600" /> Estado de Infraestructura
          </h1>
          <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
            <RefreshCw className="h-3 w-3" /> Actualización cada 30s · Última: <span className="font-mono">{lastRefresh.toLocaleTimeString()}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Container Apps activas</p>
          <p className="text-2xl font-bold text-slate-900">{runningApps}/{totalApps}</p>
        </div>
      </div>

      {/* Container Apps Section */}
      <Card className="mb-8">
        <CardHeader className="bg-slate-50 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5 text-blue-600" /> Container Apps
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {infra?.containerApps.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No se encontraron Container Apps</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-center">Réplicas</TableHead>
                  <TableHead>Última Revisión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {infra?.containerApps.map((app) => (
                  <TableRow key={app.name}>
                    <TableCell className="font-mono text-sm font-medium">{app.name}</TableCell>
                    <TableCell>{getAppStatusBadge(app.status)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono font-bold ${app.activeReplicas === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {app.activeReplicas}
                      </span>
                      <span className="text-muted-foreground">/{app.maxReplicas}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {app.latestRevision ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Container Apps Jobs Section */}
      <Card className="mb-8">
        <CardHeader className="bg-slate-50 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <RefreshCw className="h-5 w-5 text-indigo-600" /> Container Apps Jobs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {infra?.containerAppJobs.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No se encontraron Container Apps Jobs</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Última Ejecución</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-center">En Ejecución</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {infra?.containerAppJobs.map((job) => (
                  <TableRow key={job.name}>
                    <TableCell className="font-mono text-sm font-medium">{job.name}</TableCell>
                    <TableCell>
                      <Badge variant={job.triggerType === 'Schedule' ? 'default' : 'outline'}>
                        {job.triggerType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {job.cronExpression || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.lastExecutionTime
                        ? new Date(job.lastExecutionTime).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                        : 'Nunca'}
                    </TableCell>
                    <TableCell>
                      {job.lastExecutionStatus ? (
                        <Badge variant={job.lastExecutionStatus === 'Succeeded' ? 'secondary' : job.lastExecutionStatus === 'Failed' ? 'destructive' : 'default'}>
                          {job.lastExecutionStatus}
                        </Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono font-bold ${job.runningExecutions > 0 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                        {job.runningExecutions}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Service Bus Section */}
      <Card>
        <CardHeader className="bg-slate-50 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-purple-600" /> Service Bus
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(infra?.serviceBus.queues.length === 0 && infra?.serviceBus.subscriptions.length === 0) ? (
            <p className="p-6 text-center text-muted-foreground">No se encontraron colas ni subscriptions</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recurso</TableHead>
                  <TableHead className="text-center">Mensajes Activos</TableHead>
                  <TableHead className="text-center">DLQ</TableHead>
                  <TableHead className="text-center">Programados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {infra?.serviceBus.queues.map((q) => (
                  <TableRow key={q.name}>
                    <TableCell>
                      <span className="font-mono text-sm">Queue: <span className="font-medium">{q.name}</span></span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono font-bold ${q.activeMessages > 0 ? 'text-blue-600' : 'text-slate-500'}`}>
                        {q.activeMessages}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono font-bold ${q.deadLetterMessages > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {q.deadLetterMessages}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-mono text-slate-500">
                      {q.scheduledMessages}
                    </TableCell>
                  </TableRow>
                ))}
                {infra?.serviceBus.subscriptions.map((s) => (
                  <TableRow key={`${s.topicName}/${s.subscriptionName}`}>
                    <TableCell>
                      <span className="font-mono text-sm">Sub: <span className="font-medium">{s.topicName}/{s.subscriptionName}</span></span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono font-bold ${s.activeMessages > 0 ? 'text-blue-600' : 'text-slate-500'}`}>
                        {s.activeMessages}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono font-bold ${s.deadLetterMessages > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {s.deadLetterMessages}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-mono text-slate-500">—</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
