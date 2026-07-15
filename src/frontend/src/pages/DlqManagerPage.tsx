import { useEffect, useState, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, X, Pencil, RotateCcw, Trash2 } from 'lucide-react';

interface DlqMessage {
  messageId: string;
  enqueuedTimeUtc: string;
  deliveryCount: number;
  deadLetterReason?: string;
  deadLetterErrorDescription?: string;
  bodyJson: string;
  queueName: string;
}

const PAGE_SIZE = 20;

const todayStr = () => new Date().toISOString().split('T')[0];

export function DlqManagerPage() {
  const params = useParams();
  const queueName = params['*'];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { get, post } = useApi();

  const [messages, setMessages] = useState<DlqMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<DlqMessage | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(searchParams.get('fecha') || todayStr());

  const fetchMessages = useCallback(async () => {
    if (!queueName) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterDate) {
        params.set('fromDate', filterDate);
        params.set('toDate', filterDate);
      }
      const qs = params.toString();
      const result = await get<DlqMessage[]>(`/api/dlq/${queueName}${qs ? `?${qs}` : ''}`);
      setMessages(result);
      setPage(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [queueName, filterDate, get]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const totalPages = Math.ceil(messages.length / PAGE_SIZE);
  const paged = messages.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const closeModal = () => {
    setSelected(null);
    setEditMode(false);
    setEditBody('');
  };

  const openDetail = (msg: DlqMessage) => {
    setSelected(msg);
    setEditMode(false);
    setEditBody(formatBody(msg.bodyJson));
    setSuccessMsg(null);
  };

  const formatBody = (body: string) => {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body || '(vacío)';
    }
  };

  const handleRequeue = async (messageId: string, editedBody?: string) => {
    if (!queueName) return;
    setActionLoading(true);
    try {
      await post('/api/dlq/requeue', {
        queueName,
        messageId,
        editedBodyJson: editedBody,
      });
      setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
      closeModal();
      setSuccessMsg('Mensaje reencolado exitosamente');
      setTimeout(() => setSuccessMsg(null), 3000);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reencolar mensaje');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscard = async (messageId: string) => {
    if (!queueName) return;
    setActionLoading(true);
    try {
      await post('/api/dlq/discard', {
        queueName,
        messageId,
      });
      setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
      closeModal();
      setConfirmDiscard(null);
      setSuccessMsg('Mensaje descartado');
      setTimeout(() => setSuccessMsg(null), 3000);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descartar mensaje');
    } finally {
      setActionLoading(false);
    }
  };

  if (!queueName) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Card className="border-destructive bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-900">Nombre de cola no especificado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard')}
          className="mb-4 text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver al Dashboard
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Gestión de DLQ</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cola: <span className="font-mono font-semibold text-foreground">{queueName}</span>
              <span className="ml-4 text-slate-400">·</span>
              <span className="ml-4 font-semibold text-foreground">{messages.length} mensaje{messages.length !== 1 ? 's' : ''}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
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
              <Button variant="ghost" size="sm" onClick={() => setFilterDate('')}>
                Todas
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMessages}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refrescar
            </Button>
          </div>
        </div>
      </div>

      {/* Success toast */}
      {successMsg && (
        <Card className="bg-green-50 border-green-200 mb-4">
          <CardContent className="p-3 flex items-center gap-2 text-green-800 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {successMsg}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive bg-red-50 mb-4">
          <CardContent className="p-4">
            <p className="text-red-900 font-medium">Error</p>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-slate-200 rounded" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <Card className="p-12 text-center bg-slate-50">
          <CheckCircle2 className="mx-auto h-12 w-12 text-slate-400" />
          <p className="text-slate-600 mt-4">No hay mensajes en la DLQ</p>
          <p className="text-sm text-muted-foreground mt-2">Los mensajes fallidos aparecerán aquí</p>
        </Card>
      ) : (
        <>
          {/* Table */}
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="px-4 py-3 uppercase tracking-wide text-xs">ID</TableHead>
                  <TableHead className="px-4 py-3 uppercase tracking-wide text-xs">Fecha</TableHead>
                  <TableHead className="px-4 py-3 text-center uppercase tracking-wide text-xs">Intentos</TableHead>
                  <TableHead className="px-4 py-3 uppercase tracking-wide text-xs">Razón</TableHead>
                  <TableHead className="px-4 py-3 text-center uppercase tracking-wide text-xs">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((msg, idx) => (
                  <TableRow
                    key={msg.messageId}
                    className={`cursor-pointer hover:bg-blue-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    onClick={() => openDetail(msg)}
                  >
                    <TableCell className="px-4 py-3 font-mono text-xs text-slate-700" title={msg.messageId}>
                      {msg.messageId.length > 20 ? msg.messageId.substring(0, 20) + '…' : msg.messageId}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(msg.enqueuedTimeUtc).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-center">
                      <Badge variant={msg.deliveryCount >= 3 ? 'destructive' : 'secondary'} className="rounded-full w-7 h-7 justify-center">
                        {msg.deliveryCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100 border-0">
                        {msg.deadLetterReason || 'Unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-center">
                      <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800">
                        Ver →
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Página {page + 1} de {totalPages} · Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, messages.length)} de {messages.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  ← Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Siguiente →
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Detalle del mensaje</DialogTitle>
            <DialogDescription className="font-mono text-xs truncate">
              ID: {selected?.messageId}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="overflow-y-auto flex-1 space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Encolado</p>
                  <p className="text-sm mt-0.5">{new Date(selected.enqueuedTimeUtc).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Intentos de entrega</p>
                  <p className="text-sm mt-0.5">{selected.deliveryCount}</p>
                </div>
              </div>

              {/* Dead letter reason */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Razón</p>
                <div className="mt-1">
                  <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100 border-0">
                    {selected.deadLetterReason || 'Unknown'}
                  </Badge>
                  {selected.deadLetterErrorDescription && (
                    <p className="text-sm text-red-700 mt-1">{selected.deadLetterErrorDescription}</p>
                  )}
                </div>
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase">
                    {editMode ? 'Editar contenido' : 'Contenido del mensaje'}
                  </p>
                  {!editMode && (
                    <Button variant="ghost" size="sm" onClick={() => setEditMode(true)} className="text-blue-600">
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                  )}
                </div>
                {editMode ? (
                  <textarea
                    className="w-full h-48 px-3 py-2 border border-blue-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-blue-50/30"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                ) : (
                  <pre className="bg-muted border rounded-lg p-4 overflow-x-auto text-sm font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                    {formatBody(selected.bodyJson)}
                  </pre>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="destructive" onClick={() => selected && setConfirmDiscard(selected.messageId)} disabled={actionLoading}>
              <Trash2 className="h-4 w-4 mr-1" />
              Descartar
            </Button>
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <Button variant="secondary" onClick={() => setEditMode(false)}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                  <Button onClick={() => selected && handleRequeue(selected.messageId, editBody)} disabled={actionLoading}>
                    <RotateCcw className="h-4 w-4 mr-1" />
                    {actionLoading ? 'Procesando...' : 'Reencolar editado'}
                  </Button>
                </>
              ) : (
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => selected && handleRequeue(selected.messageId)} disabled={actionLoading}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  {actionLoading ? 'Procesando...' : 'Reencolar'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Discard Dialog */}
      <Dialog open={!!confirmDiscard} onOpenChange={(open) => { if (!open) setConfirmDiscard(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <DialogTitle>Descartar mensaje</DialogTitle>
                <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que querés descartar este mensaje de la DLQ? El mensaje se eliminará permanentemente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDiscard && handleDiscard(confirmDiscard)}
              disabled={actionLoading}
            >
              {actionLoading ? 'Descartando...' : 'Sí, descartar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}