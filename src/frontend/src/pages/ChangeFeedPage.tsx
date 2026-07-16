import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, RefreshCw, Plus, Pencil, Trash2, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Persona {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  edad: number;
  ciudad: string;
  updatedAt?: string;
}

interface PersonaSync {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  edad: number;
  ciudad: string;
  cosmosUpdatedAt: string;
  syncedAt: string;
  syncVersion: number;
}

interface ChangeFeedCounter {
  collection: string;
  date: string;
  successCount: number;
  errorCount: number;
}

// ============================================================================
// Main Component
// ============================================================================

export function ChangeFeedPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Change Feed POC</h1>
        <p className="text-muted-foreground">
          CosmosDB → Change Feed → SQL Server sync con telemetría en tiempo real
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
            SQL Sync
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
          <SqlSyncTab />
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          <DashboardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Tab 1: Cosmos Editor (CRUD)
// ============================================================================

function CosmosEditorTab() {
  const { get, post, del } = useApi();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<Omit<Persona, 'id' | 'updatedAt'>>({
    nombre: '',
    apellido: '',
    email: '',
    edad: 0,
    ciudad: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchPersonas = async () => {
    try {
      setLoading(true);
      const result = await get<Persona[]>('/api/cosmos/personas');
      setPersonas(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersonas();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      await post('/api/cosmos/personas', formData);
      
      // Reset form
      setFormData({ nombre: '', apellido: '', email: '', edad: 0, ciudad: '' });
      setEditingId(null);
      
      // Refresh list
      await fetchPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta persona?')) return;
    
    try {
      await del(`/api/cosmos/personas/${id}`);
      await fetchPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleEdit = (persona: Persona) => {
    setFormData({
      nombre: persona.nombre,
      apellido: persona.apellido,
      email: persona.email,
      edad: persona.edad,
      ciudad: persona.ciudad,
    });
    setEditingId(persona.id);
  };

  const resetForm = () => {
    setFormData({ nombre: '', apellido: '', email: '', edad: 0, ciudad: '' });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {editingId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {editingId ? 'Editar Persona' : 'Nueva Persona'}
          </CardTitle>
          <CardDescription>
            Los cambios se sincronizan automáticamente a SQL Server vía Change Feed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Juan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apellido">Apellido *</Label>
                <Input
                  id="apellido"
                  required
                  value={formData.apellido}
                  onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                  placeholder="Pérez"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="juan@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edad">Edad *</Label>
                <Input
                  id="edad"
                  type="number"
                  required
                  min="0"
                  max="150"
                  value={formData.edad}
                  onChange={(e) => setFormData({ ...formData, edad: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ciudad">Ciudad *</Label>
                <Input
                  id="ciudad"
                  required
                  value={formData.ciudad}
                  onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                  placeholder="Buenos Aires"
                />
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
                {submitting ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Persona'}
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
              <CardTitle>Personas en CosmosDB</CardTitle>
              <CardDescription>
                Documentos en el container "personas"
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPersonas}
              disabled={loading}
              className="cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && personas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : personas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay personas. Creá la primera arriba.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Edad</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personas.map((persona) => (
                    <TableRow key={persona.id}>
                      <TableCell className="font-medium">
                        {persona.nombre} {persona.apellido}
                      </TableCell>
                      <TableCell>{persona.email}</TableCell>
                      <TableCell>{persona.edad}</TableCell>
                      <TableCell>{persona.ciudad}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(persona)}
                          className="cursor-pointer"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(persona.id)}
                          className="cursor-pointer text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
// Tab 2: SQL Sync Viewer (Read-only)
// ============================================================================

function SqlSyncTab() {
  const { get } = useApi();
  const [personas, setPersonas] = useState<PersonaSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchSyncedPersonas = async () => {
    try {
      setLoading(true);
      const result = await get<PersonaSync[]>('/api/sync/personas');
      setPersonas(result);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSyncedPersonas();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Personas Sincronizadas (SQL Server)
            </CardTitle>
            <CardDescription>
              Datos replicados desde CosmosDB vía Change Feed Processor
              {lastRefresh && (
                <span className="ml-2 text-xs">
                  • Última actualización: {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSyncedPersonas}
            disabled={loading}
            className="cursor-pointer"
          >
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
        
        {loading && personas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : personas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay datos sincronizados aún. Creá una persona en la tab "Cosmos Editor".
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Edad</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Synced At</TableHead>
                  <TableHead className="text-right">Versión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personas.map((persona) => (
                  <TableRow key={persona.id}>
                    <TableCell className="font-medium">
                      {persona.nombre} {persona.apellido}
                    </TableCell>
                    <TableCell>{persona.email}</TableCell>
                    <TableCell>{persona.edad}</TableCell>
                    <TableCell>{persona.ciudad}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(persona.syncedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">v{persona.syncVersion}</Badge>
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
// Tab 3: Dashboard (Counters)
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

  // Aggregate today's counters
  const today = new Date().toISOString().split('T')[0];
  const todayCounters = counters.filter(c => c.date === today);
  const totalSuccess = todayCounters.reduce((sum, c) => sum + c.successCount, 0);
  const totalErrors = todayCounters.reduce((sum, c) => sum + c.errorCount, 0);

  return (
    <div className="space-y-6">
      {/* Today's Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Change Feed — Procesados Hoy
          </CardTitle>
          <CardDescription>
            Documentos sincronizados desde CosmosDB a SQL Server
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Success Count */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Sincronizados
              </div>
              <div className="text-4xl font-bold text-green-600">
                {totalSuccess.toLocaleString()}
              </div>
            </div>

            {/* Error Count */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Errores
              </div>
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold text-destructive">
                  {totalErrors.toLocaleString()}
                </div>
                {totalErrors > 0 && (
                  <Badge variant="destructive">Requiere atención</Badge>
                )}
                {totalErrors === 0 && (
                  <Badge variant="secondary" className="text-green-600 bg-green-50">
                    ✓ Cero errores
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historical Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Histórico de Sincronización</CardTitle>
              <CardDescription>
                Contadores diarios por collection
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="days" className="text-sm text-muted-foreground">
                Días:
              </Label>
              <Input
                id="days"
                type="number"
                min="1"
                max="30"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 7)}
                className="w-20"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={fetchCounters}
                disabled={loading}
                className="cursor-pointer"
              >
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
