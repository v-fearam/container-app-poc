import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Heart, Activity } from 'lucide-react';

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

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [get]);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">{status}</Badge>;
      case 'degraded':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">{status}</Badge>;
      case 'unhealthy':
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStatusDot = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-amber-500';
      case 'unhealthy': return 'bg-red-500 animate-pulse';
      default: return 'bg-slate-400';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-40 bg-slate-200 rounded-lg" />)}
          </div>
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
              <AlertCircle className="h-5 w-5" /> Error al cargar estado de componentes
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-red-700">{error}</p></CardContent>
        </Card>
      </div>
    );
  }

  const healthyCount = components.filter(c => c.status.toLowerCase() === 'healthy').length;
  const degradedCount = components.filter(c => c.status.toLowerCase() === 'degraded').length;
  const unhealthyCount = components.filter(c => c.status.toLowerCase() === 'unhealthy').length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Activity className="h-8 w-8 text-blue-600" /> Estado de Componentes
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Actualización automática cada 30s · Última: <span className="font-mono">{lastRefresh.toLocaleTimeString()}</span>
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">Total Componentes</p>
            <p className="text-3xl font-bold">{components.length}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-6">
            <p className="text-sm text-green-700 mb-1">Saludables</p>
            <p className="text-3xl font-bold text-green-600">{healthyCount}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="p-6">
            <p className="text-sm text-amber-700 mb-1">Degradados</p>
            <p className="text-3xl font-bold text-amber-600">{degradedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="p-6">
            <p className="text-sm text-red-700 mb-1">No Saludables</p>
            <p className="text-3xl font-bold text-red-600">{unhealthyCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Components */}
      {components.length === 0 ? (
        <Card className="p-12 text-center bg-slate-50">
          <Heart className="mx-auto h-12 w-12 text-slate-400" />
          <p className="text-slate-600 mt-4">No hay componentes registrados aún</p>
          <p className="text-sm text-muted-foreground mt-2">Los componentes aparecerán aquí cuando reporten su estado</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {components.map((component) => {
            const minutesAgo = Math.floor((new Date().getTime() - new Date(component.lastHeartbeat).getTime()) / 60000);
            const isStale = minutesAgo > 5;

            return (
              <Card key={component.componentName} className={isStale ? 'border-amber-300' : ''}>
                <CardHeader className={`border-b ${isStale ? 'bg-amber-50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{component.componentName}</CardTitle>
                    <span className={`inline-block w-2 h-2 rounded-full ${getStatusDot(component.status)}`} />
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Estado:</p>
                    {getStatusBadge(component.status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Último heartbeat:</p>
                    <p className="text-sm font-mono">{new Date(component.lastHeartbeat).toLocaleString()}</p>
                    {isStale && <p className="text-sm text-amber-600 mt-1">⚠️ Hace {minutesAgo} minutos</p>}
                  </div>
                  {component.metadata && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Metadata:</p>
                      <pre className="bg-muted border rounded p-2 overflow-x-auto text-xs font-mono">{component.metadata}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
