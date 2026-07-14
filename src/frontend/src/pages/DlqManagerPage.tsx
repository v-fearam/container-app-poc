import { useEffect, useState, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useParams, useNavigate } from 'react-router-dom';

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
  const [filterDate, setFilterDate] = useState(todayStr());

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
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-900">Nombre de cola no especificado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-4 inline-flex items-center transition-colors"
        >
          ← Volver al Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Gestión de DLQ</h1>
            <p className="text-sm text-slate-600 mt-1">
              Cola: <span className="font-mono font-semibold">{queueName}</span>
              <span className="ml-4 text-slate-400">·</span>
              <span className="ml-4 font-semibold">{messages.length} mensaje{messages.length !== 1 ? 's' : ''}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="filterDate" className="text-sm text-slate-600 font-medium">Fecha:</label>
              <input
                id="filterDate"
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
              <button
                onClick={() => setFilterDate('')}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium"
              >
                Todas
              </button>
            </div>
            <button
              onClick={fetchMessages}
              disabled={loading}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Cargando...' : '↻ Refrescar'}
            </button>
          </div>
        </div>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-green-800 text-sm font-medium">
          ✓ {successMsg}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-900 font-medium">Error</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-slate-200 rounded"></div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-slate-600 mt-4">No hay mensajes en la DLQ</p>
          <p className="text-sm text-slate-500 mt-2">Los mensajes fallidos aparecerán aquí</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Intentos</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Razón</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acción</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((msg, idx) => (
                  <tr
                    key={msg.messageId}
                    className={`border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    onClick={() => openDetail(msg)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-700" title={msg.messageId}>
                      {msg.messageId.length > 20 ? msg.messageId.substring(0, 20) + '…' : msg.messageId}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(msg.enqueuedTimeUtc).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${msg.deliveryCount >= 3 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {msg.deliveryCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        {msg.deadLetterReason || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        Ver →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-500">
                Página {page + 1} de {totalPages} · Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, messages.length)} de {messages.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

          {/* Modal content */}
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-900">Detalle del mensaje</h2>
                <p className="text-xs font-mono text-slate-500 mt-1 truncate" title={selected.messageId}>
                  ID: {selected.messageId}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="ml-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase">Encolado</p>
                  <p className="text-sm text-slate-900 mt-0.5">{new Date(selected.enqueuedTimeUtc).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase">Intentos de entrega</p>
                  <p className="text-sm text-slate-900 mt-0.5">{selected.deliveryCount}</p>
                </div>
              </div>

              {/* Dead letter reason */}
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase">Razón</p>
                <div className="mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {selected.deadLetterReason || 'Unknown'}
                  </span>
                  {selected.deadLetterErrorDescription && (
                    <p className="text-sm text-red-700 mt-1">{selected.deadLetterErrorDescription}</p>
                  )}
                </div>
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-500 font-medium uppercase">
                    {editMode ? 'Editar contenido' : 'Contenido del mensaje'}
                  </p>
                  {!editMode && (
                    <button
                      onClick={() => setEditMode(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      ✎ Editar
                    </button>
                  )}
                </div>
                {editMode ? (
                  <textarea
                    className="w-full h-48 px-3 py-2 border border-blue-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-blue-50/30"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                ) : (
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto text-sm font-mono text-slate-900 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                    {formatBody(selected.bodyJson)}
                  </pre>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-slate-600 text-sm font-medium hover:text-slate-800 transition-colors"
              >
                Cerrar
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDiscard(selected.messageId)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading ? 'Procesando...' : 'Descartar'}
                </button>
                {editMode ? (
                  <>
                    <button
                      onClick={() => setEditMode(false)}
                      className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
                    >
                      Cancelar edición
                    </button>
                    <button
                      onClick={() => handleRequeue(selected.messageId, editBody)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {actionLoading ? 'Procesando...' : 'Reencolar editado'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleRequeue(selected.messageId)}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {actionLoading ? 'Procesando...' : 'Reencolar sin cambios'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Discard Dialog */}
      {confirmDiscard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDiscard(null)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Descartar mensaje</h3>
                <p className="text-sm text-slate-600">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-6">
              ¿Estás seguro de que querés descartar este mensaje de la DLQ? El mensaje se eliminará permanentemente.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDiscard(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDiscard(confirmDiscard)}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Descartando...' : 'Sí, descartar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}