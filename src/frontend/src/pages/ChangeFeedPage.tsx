import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, RefreshCw, Plus, Pencil, Trash2, CheckCircle, AlertCircle, BarChart3, Timer, ChevronDown, ChevronRight } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Evento {
  tipo: string;
  fecha: string;
}

interface Comunicacion {
  id: string;
  tipoProceso: string;
  canal: string;
  contacto: string;
  parametros?: Record<string, unknown> | null;
  template?: string | null;
  estado: string;
  fechaCreacion: string;
  fechaUltimaModif: string;
  eventos: Evento[];
  ttl?: number | null;
}

interface ComunicacionesResponse {
  items: Comunicacion[];
  continuationToken: string | null;
  count: number;
}

interface ComunicacionSync {
  id: number;
  cosmosId: string;
  fechaCreacion: string;
  fechaUltimaModif: string;
  parametros: string | null;
  diaCreacion: number;
  tipoProceso: string;
  canal: string;
  contacto: string;
  tipoContacto: string;
  estado: string;
  fechaDate: string;
  cantEventos: number;
}

interface ComunicacionSyncResponse {
  items: ComunicacionSync[];
  continuationToken: string | null;
  count: number;
}

interface ChangeFeedCounter {
  collection: string;
  date: string;
  successCount: number;
  errorCount: number;
}

const ESTADO_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  accepted: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  opened: 'bg-emerald-100 text-emerald-700',
  bounced: 'bg-red-100 text-red-700',
  complained: 'bg-orange-100 text-orange-700',
  unsubscribed: 'bg-yellow-100 text-yellow-700',
};

const TIPO_PROCESO_OPTIONS = ['recupero-clave', 'validacion-email', 'aviso-generico', 'tramite'];
const CANAL_OPTIONS = ['email', 'sms'];
const EVENTO_TIPOS = ['accepted', 'delivered', 'opened', 'bounced', 'complained', 'unsubscribed'];

// ============================================================================
// Main Component
// ============================================================================

export function ChangeFeedPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Change Feed POC</h1>
        <p className="text-muted-foreground">
          CosmosDB → Change Feed → SQL Server (Modelo Estrella) con telemetría en tiempo real
        </p>
      </div>

      <Tabs defaultValue="cosmos" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
          <TabsTrigger value="cosmos" className="gap-2">
            <Database className="h-4 w-4" />
            Cosmos Editor
          </TabsTrigger>
          <TabsTrigger value="sql" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            SQL Estrella
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cosmos" className="space-y-6">
          <CosmosEditorTab />
        </TabsContent>

        <TabsContent value="sql" className="space-y-6">
          <SqlStarTab />
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          <DashboardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Tab 1: Cosmos Editor (CRUD Comunicaciones + Agregar Eventos)
// ============================================================================

function CosmosEditorTab() {
  const { get, post, put, del } = useApi();
  const [comunicaciones, setComunicaciones] = useState<Comunicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingEventoId, setAddingEventoId] = useState<string | null>(null);
  const [eventoForm, setEventoForm] = useState({ tipo: 'accepted', fecha: '' });

  // Form state
  const [formData, setFormData] = useState({
    tipoProceso: 'recupero-clave',
    canal: 'email',
    contacto: '',
    template: '',
    parametros: '{}',
    ttl: null as number | null,
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchComunicaciones = async () => {
    try {
      setLoading(true);
      const result = await get<ComunicacionesResponse>('/api/cosmos/comunicaciones');
      setComunicaciones(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComunicaciones();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);

      let parsedParams: Record<string, unknown> | undefined;
      try {
        parsedParams = formData.parametros ? JSON.parse(formData.parametros) : undefined;
      } catch {
        setError('Parámetros debe ser JSON válido');
        setSubmitting(false);
        return;
      }

      const body = {
        tipoProceso: formData.tipoProceso,
        canal: formData.canal,
        contacto: formData.contacto,
        template: formData.template || null,
        parametros: parsedParams,
        ttl: formData.ttl,
      };

      if (editingId) {
        await put(`/api/cosmos/comunicaciones/${editingId}`, body);
      } else {
        await post('/api/cosmos/comunicaciones', body);
      }

      resetForm();
      await fetchComunicaciones();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta comunicación?')) return;
    try {
      await del(`/api/cosmos/comunicaciones/${id}`);
      await fetchComunicaciones();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleEdit = (c: Comunicacion) => {
    setFormData({
      tipoProceso: c.tipoProceso,
      canal: c.canal,
      contacto: c.contacto,
      template: c.template ?? '',
      parametros: c.parametros ? JSON.stringify(c.parametros, null, 2) : '{}',
      ttl: c.ttl ?? null,
    });
    setEditingId(c.id);
  };

  const handleAddEvento = async (comunicacionId: string) => {
    try {
      setSubmitting(true);
      setError(null);
      await post(`/api/cosmos/comunicaciones/${comunicacionId}/eventos`, {
        tipo: eventoForm.tipo,
        fecha: eventoForm.fecha || undefined,
      });
      setAddingEventoId(null);
      setEventoForm({ tipo: 'accepted', fecha: '' });
      await fetchComunicaciones();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar evento');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ tipoProceso: 'recupero-clave', canal: 'email', contacto: '', template: '', parametros: '{}', ttl: null });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {editingId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {editingId ? 'Editar Comunicación' : 'Nueva Comunicación'}
          </CardTitle>
          <CardDescription>
            Los cambios se sincronizan automáticamente al modelo estrella vía Change Feed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipoProceso">Tipo de Proceso *</Label>
                <select
                  id="tipoProceso"
                  required
                  value={formData.tipoProceso}
                  onChange={(e) => setFormData({ ...formData, tipoProceso: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {TIPO_PROCESO_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="canal">Canal *</Label>
                <select
                  id="canal"
                  required
                  value={formData.canal}
                  onChange={(e) => setFormData({ ...formData, canal: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {CANAL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contacto">Contacto *</Label>
                <Input
                  id="contacto"
                  required
                  value={formData.contacto}
                  onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                  placeholder="usuario@mail.com o +5411..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template">Template</Label>
                <Input
                  id="template"
                  value={formData.template}
                  onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                  placeholder="recupero-clave-v2"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="parametros">Parámetros (JSON)</Label>
                <textarea
                  id="parametros"
                  value={formData.parametros}
                  onChange={(e) => setFormData({ ...formData, parametros: e.target.value })}
                  placeholder='{"nombre": "Juan", "token": "abc123"}'
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  rows={3}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ttl">TTL (segundos)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="ttl"
                    type="number"
                    min="1"
                    value={formData.ttl ?? ''}
                    onChange={(e) => setFormData({ ...formData, ttl: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Sin expiración (default 45 días)"
                    className="max-w-[300px]"
                  />
                  {formData.ttl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setFormData({ ...formData, ttl: null })} className="cursor-pointer text-muted-foreground">
                      Quitar TTL
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formData.ttl ? `Expira en ${formatTtl(formData.ttl)}` : 'El documento no expira'}
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting} className="cursor-pointer">
                {submitting ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Comunicación'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm} className="cursor-pointer">
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Comunicaciones en CosmosDB</CardTitle>
              <CardDescription>Container "comunicaciones" — click en eventos para expandir</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchComunicaciones} disabled={loading} className="cursor-pointer">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && comunicaciones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : comunicaciones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay comunicaciones. Creá la primera arriba.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Eventos</TableHead>
                    <TableHead>TTL</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comunicaciones.map((c) => (
                    <>
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs max-w-[120px] truncate" title={c.id}>
                          {c.id.substring(0, 12)}...
                        </TableCell>
                        <TableCell>{c.tipoProceso}</TableCell>
                        <TableCell><Badge variant="outline">{c.canal}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">{c.contacto}</TableCell>
                        <TableCell>
                          <Badge className={ESTADO_COLORS[c.estado] || 'bg-gray-100 text-gray-700'}>
                            {c.estado}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                            className="cursor-pointer gap-1"
                          >
                            {expandedId === c.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {c.eventos.length}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {c.ttl ? (
                            <Badge variant="outline" className="gap-1 text-orange-600 border-orange-300">
                              <Timer className="h-3 w-3" />
                              {formatTtl(c.ttl)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">∞</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(c)} className="cursor-pointer" title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setAddingEventoId(addingEventoId === c.id ? null : c.id); setEventoForm({ tipo: 'accepted', fecha: '' }); }}
                            className="cursor-pointer"
                            title="Agregar Evento"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="cursor-pointer text-destructive hover:text-destructive" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Add Event Form (inline) */}
                      {addingEventoId === c.id && (
                        <TableRow key={`${c.id}-add-event`}>
                          <TableCell colSpan={8} className="bg-muted/30">
                            <div className="flex items-center gap-3 py-2">
                              <span className="text-sm font-medium">Agregar Evento:</span>
                              <select
                                value={eventoForm.tipo}
                                onChange={(e) => setEventoForm({ ...eventoForm, tipo: e.target.value })}
                                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                              >
                                {EVENTO_TIPOS.map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                              <Input
                                type="datetime-local"
                                value={eventoForm.fecha}
                                onChange={(e) => setEventoForm({ ...eventoForm, fecha: e.target.value })}
                                className="h-8 w-[220px]"
                                placeholder="Ahora"
                              />
                              <Button size="sm" onClick={() => handleAddEvento(c.id)} disabled={submitting} className="cursor-pointer">
                                Agregar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setAddingEventoId(null)} className="cursor-pointer">
                                Cancelar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Expanded Events */}
                      {expandedId === c.id && c.eventos.length > 0 && (
                        <TableRow key={`${c.id}-events`}>
                          <TableCell colSpan={8} className="bg-muted/20">
                            <div className="py-2 px-4">
                              <div className="text-xs font-medium text-muted-foreground mb-2">Eventos de {c.id.substring(0, 12)}...</div>
                              <div className="space-y-1">
                                {c.eventos.map((ev, i) => (
                                  <div key={i} className="flex items-center gap-3 text-sm">
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                    <Badge className={ESTADO_COLORS[ev.tipo] || 'bg-gray-100 text-gray-700'} variant="secondary">
                                      {ev.tipo}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                      {new Date(ev.fecha).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Tab 2: SQL Star Model Viewer
// ============================================================================

function SqlStarTab() {
  const { get } = useApi();
  const [comunicaciones, setComunicaciones] = useState<ComunicacionSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchSynced = async () => {
    try {
      setLoading(true);
      const result = await get<ComunicacionSyncResponse>('/api/sync/comunicaciones');
      setComunicaciones(result.items);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSynced();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Modelo Estrella (SQL Server)
            </CardTitle>
            <CardDescription>
              FactComunicaciones + Dimensiones resueltas — particionado por día
              {lastRefresh && (
                <span className="ml-2 text-xs">
                  • Última actualización: {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSynced} disabled={loading} className="cursor-pointer">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 p-4 mb-4 text-sm text-destructive border border-destructive/20 rounded-md bg-destructive/5">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {loading && comunicaciones.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : comunicaciones.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay datos en el modelo estrella. Creá una comunicación en "Cosmos Editor" y esperá al Change Feed.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha Creación</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Día</TableHead>
                  <TableHead>Últ. Modif</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comunicaciones.map((c) => (
                  <TableRow key={`${c.id}-${c.diaCreacion}`}>
                    <TableCell className="font-medium">{c.tipoProceso}</TableCell>
                    <TableCell><Badge variant="outline">{c.canal}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate">{c.contacto}</TableCell>
                    <TableCell>
                      <Badge className={ESTADO_COLORS[c.estado] || 'bg-gray-100 text-gray-700'}>
                        {c.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(c.fechaDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.cantEventos}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{c.diaCreacion}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.fechaUltimaModif).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab 3: Dashboard (Counters) — sin cambios
// ============================================================================

function DashboardTab() {
  const { get } = useApi();
  const [counters, setCounters] = useState<ChangeFeedCounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const fetchCounters = async () => {
    try {
      setLoading(true);
      const result = await get<ChangeFeedCounter[]>(`/api/dashboard/changefeed?days=${days}`);
      setCounters(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCounters();
  }, [days]);

  const today = new Date().toISOString().split('T')[0];
  const todayCounters = counters.filter(c => c.date.split('T')[0] === today);
  const totalSuccess = todayCounters.reduce((sum, c) => sum + c.successCount, 0);
  const totalErrors = todayCounters.reduce((sum, c) => sum + c.errorCount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Change Feed — Procesados Hoy
          </CardTitle>
          <CardDescription>
            Documentos sincronizados desde CosmosDB al modelo estrella
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Sincronizados
              </div>
              <div className="text-4xl font-bold text-green-600">
                {totalSuccess.toLocaleString()}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Errores
              </div>
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold text-destructive">
                  {totalErrors.toLocaleString()}
                </div>
                {totalErrors > 0 ? (
                  <Badge variant="destructive">Requiere atención</Badge>
                ) : (
                  <Badge variant="secondary" className="text-green-600 bg-green-50">✓ Cero errores</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Histórico de Sincronización</CardTitle>
              <CardDescription>Contadores diarios por collection</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="days" className="text-sm text-muted-foreground">Días:</Label>
              <Input
                id="days"
                type="number"
                min="1"
                max="30"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 7)}
                className="w-20"
              />
              <Button variant="outline" size="sm" onClick={fetchCounters} disabled={loading} className="cursor-pointer">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 p-4 mb-4 text-sm text-destructive border border-destructive/20 rounded-md bg-destructive/5">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {loading && counters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : counters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay datos. El Change Feed Worker aún no procesó documentos.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead className="text-right">
                      <CheckCircle className="h-4 w-4 inline mr-1 text-green-600" />
                      Success
                    </TableHead>
                    <TableHead className="text-right">
                      <AlertCircle className="h-4 w-4 inline mr-1 text-destructive" />
                      Errors
                    </TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counters.map((counter, idx) => (
                    <TableRow key={`${counter.collection}-${counter.date}-${idx}`}>
                      <TableCell className="font-medium">
                        {new Date(counter.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{counter.collection}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {counter.successCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {counter.errorCount > 0 ? (
                          <Badge variant="destructive">{counter.errorCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {(counter.successCount + counter.errorCount).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatTtl(seconds: number): string {
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}
