import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useParams, useNavigate } from 'react-router-dom';

interface DlqMessage {
  messageId: string;
  enqueuedTime: string;
  deliveryCount: number;
  deadLetterReason?: string;
  deadLetterErrorDescription?: string;
  body: string;
}

export function DlqManagerPage() {
  const { queueName } = useParams<{ queueName: string }>();
  const navigate = useNavigate();
  const { get, post } = useApi();
  
  const [messages, setMessages] = useState<DlqMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState<{ messageId: string; body: string } | null>(null);

  useEffect(() => {
    if (!queueName) return;

    const fetchMessages = async () => {
      try {
        const result = await get<DlqMessage[]>(`/api/dlq/${encodeURIComponent(queueName)}`);
        setMessages(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [queueName, get]);

  const handleRequeue = async (messageId: string, editedBody?: string) => {
    if (!queueName) return;
    setActionLoading(messageId);
    try {
      await post('/api/dlq/requeue', {
        queueName,
        messageIds: [messageId],
        editedBody,
      });
      setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
      setEditingBody(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reencolar mensaje');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDiscard = async (messageId: string) => {
    if (!queueName) return;
    if (!confirm('¿Estás seguro de descartar este mensaje? No se puede recuperar.')) return;
    
    setActionLoading(messageId);
    try {
      await post('/api/dlq/discard', {
        queueName,
        messageIds: [messageId],
      });
      setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descartar mensaje');
    } finally {
      setActionLoading(null);
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

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-96 mb-8"></div>
          <div className="space-y-4">
            <div className="h-40 bg-slate-200 rounded"></div>
            <div className="h-40 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-4 inline-flex items-center transition-colors"
        >
          ← Volver al Dashboard
        </button>
        <h1 className="text-3xl font-bold text-slate-900">Gestión de DLQ</h1>
        <p className="text-sm text-slate-600 mt-2">
          Cola: <span className="font-mono font-semibold">{decodeURIComponent(queueName)}</span>
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-900 font-medium">Error</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-slate-600 mt-4">No hay mensajes en la DLQ</p>
          <p className="text-sm text-slate-500 mt-2">Los mensajes fallidos aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {messages.length} mensaje{messages.length !== 1 ? 's' : ''} en DLQ
          </p>
          {messages.map((msg) => (
            <div key={msg.messageId} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              {/* Message Header */}
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">ID:</p>
                    <p className="font-mono text-sm text-slate-900">{msg.messageId}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                      <span>Encolado: {new Date(msg.enqueuedTime).toLocaleString()}</span>
                      <span>·</span>
                      <span>Intentos: {msg.deliveryCount}</span>
                    </div>
                    {msg.deadLetterReason && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {msg.deadLetterReason}
                        </span>
                        {msg.deadLetterErrorDescription && (
                          <p className="text-sm text-red-700 mt-1">{msg.deadLetterErrorDescription}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Message Body */}
              <div className="px-6 py-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">Contenido del mensaje:</p>
                {editingBody?.messageId === msg.messageId ? (
                  <div>
                    <textarea
                      className="w-full h-32 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={editingBody.body}
                      onChange={(e) => setEditingBody({ ...editingBody, body: e.target.value })}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleRequeue(msg.messageId, editingBody.body)}
                        disabled={actionLoading === msg.messageId}
                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {actionLoading === msg.messageId ? 'Reencolando...' : 'Reencolar con cambios'}
                      </button>
                      <button
                        onClick={() => setEditingBody(null)}
                        className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto text-sm font-mono text-slate-900">
                    {msg.body}
                  </pre>
                )}
              </div>

              {/* Actions */}
              {!editingBody && (
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex gap-3">
                  <button
                    onClick={() => handleRequeue(msg.messageId)}
                    disabled={actionLoading === msg.messageId}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {actionLoading === msg.messageId ? 'Procesando...' : 'Reencolar sin cambios'}
                  </button>
                  <button
                    onClick={() => setEditingBody({ messageId: msg.messageId, body: msg.body })}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Editar y Reencolar
                  </button>
                  <button
                    onClick={() => handleDiscard(msg.messageId)}
                    disabled={actionLoading === msg.messageId}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
