import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X, AlertTriangle, Inbox } from 'lucide-react'
import { dlqMessages } from '../data/mockData'
import { useToast } from '../components/Toast'

export function DlqPage() {
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewId, setViewId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editBody, setEditBody] = useState('')
  const [confirmAction, setConfirmAction] = useState<'discard' | 'requeue' | null>(null)
  const [filterCola, setFilterCola] = useState(searchParams.get('cola') || '')
  const [filterReason, setFilterReason] = useState('')

  // Sync URL param
  useEffect(() => {
    const cola = searchParams.get('cola')
    if (cola) setFilterCola(cola)
  }, [searchParams])

  // Escape key closes modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewId(null)
        setConfirmAction(null)
        setEditMode(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const colasUnicas = [...new Set(dlqMessages.map(m => m.cola))]
  const reasonsUnicas = [...new Set(dlqMessages.map(m => m.deadLetterReason))]

  const filtered = useMemo(() => {
    return dlqMessages.filter(m =>
      (!filterCola || m.cola === filterCola) &&
      (!filterReason || m.deadLetterReason === filterReason)
    )
  }, [filterCola, filterReason])

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(m => m.id)))
  }

  const viewing = dlqMessages.find(m => m.id === viewId)

  const openViewer = (id: string) => {
    const msg = dlqMessages.find(m => m.id === id)
    if (msg) {
      setViewId(id)
      setEditBody(JSON.stringify(msg.body, null, 2))
      setEditMode(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3>DLQ Manager</h3>
        <div className="flex gap-2">
          <button disabled={selected.size === 0}
            onClick={() => setConfirmAction('requeue')}
            className="px-4 py-2 text-sm rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
            Re-encolar ({selected.size})
          </button>
          <button disabled={selected.size === 0}
            onClick={() => setConfirmAction('discard')}
            className="px-4 py-2 text-sm rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            style={{ background: 'var(--color-semantic-error)', color: 'white' }}>
            Descartar ({selected.size})
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <select value={filterCola} onChange={e => setFilterCola(e.target.value)}
          aria-label="Filtrar por cola"
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-neutral-border)' }}>
          <option value="">Todas las colas</option>
          {colasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterReason} onChange={e => setFilterReason(e.target.value)}
          aria-label="Filtrar por razón"
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-neutral-border)' }}>
          <option value="">Todas las razones</option>
          {reasonsUnicas.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {(filterCola || filterReason) && (
          <button onClick={() => { setFilterCola(''); setFilterReason('') }}
            className="text-xs cursor-pointer hover:underline"
            style={{ color: 'var(--color-brand-primary)' }}>Limpiar filtros</button>
        )}
      </div>

      {/* Table or Empty state */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 flex flex-col items-center justify-center text-center">
          <Inbox size={48} style={{ color: 'var(--color-neutral-muted)' }} />
          <p className="mt-4 font-medium" style={{ color: 'var(--color-neutral-textStrong)' }}>No hay mensajes en DLQ</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-neutral-muted)' }}>
            {filterCola || filterReason ? 'Probá limpiar los filtros para ver más resultados.' : 'Todas las colas están limpias. ¡Excelente!'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--color-neutral-background)' }}>
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" aria-label="Seleccionar todos" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} className="cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 font-medium">Cola</th>
                <th className="text-left px-4 py-3 font-medium">Razón</th>
                <th className="text-left px-4 py-3 font-medium">Descripción</th>
                <th className="text-right px-4 py-3 font-medium">Intentos</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-center px-4 py-3 font-medium">Body</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <tr key={m.id} className={`${i % 2 === 0 ? '' : 'bg-[var(--color-neutral-background)]'} hover:bg-blue-50/50 transition-colors`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(m.id)}
                      onChange={() => toggle(m.id)} className="cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 font-medium">{m.cola}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs"
                      style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-semantic-error)' }}>
                      {m.deadLetterReason}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{m.deadLetterErrorDescription}</td>
                  <td className="px-4 py-3 text-right">{m.deliveryCount}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(m.enqueuedTime).toLocaleString('es-AR')}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openViewer(m.id)}
                      className="text-xs px-3 py-1 rounded cursor-pointer hover:bg-gray-100 transition-colors min-h-[32px]"
                      style={{ color: 'var(--color-brand-primary)' }}>Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs border-t flex justify-between"
            style={{ borderColor: 'var(--color-neutral-border)', color: 'var(--color-neutral-muted)' }}>
            <span>Mostrando 1-{filtered.length} de {filtered.length}</span>
            <span>25 por página</span>
          </div>
        </div>
      )}

      {/* JSON Viewer/Editor Modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true" onClick={() => setViewId(null)}>
          <div className="bg-white rounded-2xl shadow-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">Mensaje DLQ — {viewing.cola}</h4>
              <button onClick={() => setViewId(null)} className="p-1 rounded hover:bg-gray-100 cursor-pointer" aria-label="Cerrar">
                <X size={20} style={{ color: 'var(--color-neutral-muted)' }} />
              </button>
            </div>
            <div className="text-xs space-y-1 mb-4" style={{ color: 'var(--color-neutral-muted)' }}>
              <p><strong>Razón:</strong> {viewing.deadLetterReason}</p>
              <p><strong>Descripción:</strong> {viewing.deadLetterErrorDescription}</p>
              <p><strong>Intentos:</strong> {viewing.deliveryCount}</p>
              <p><strong>Fecha:</strong> {new Date(viewing.enqueuedTime).toLocaleString('es-AR')}</p>
            </div>
            {editMode ? (
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                className="w-full h-64 font-mono text-xs p-4 rounded-lg border"
                style={{ borderColor: 'var(--color-neutral-border)' }} />
            ) : (
              <pre className="p-4 rounded-lg text-xs overflow-auto max-h-64 font-mono"
                style={{ background: 'var(--color-brand-darker)', color: '#50FFD4' }}>
                {JSON.stringify(viewing.body, null, 2)}
              </pre>
            )}
            <div className="flex gap-2 mt-4 justify-end">
              {editMode ? (
                <button onClick={() => {
                  try { JSON.parse(editBody); setEditMode(false); setViewId(null); showToast('Mensaje re-encolado con body editado') }
                  catch { showToast('JSON inválido — corregir antes de re-encolar', 'error') }
                }}
                  className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px]"
                  style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
                  Re-encolar editado
                </button>
              ) : (
                <>
                  <button onClick={() => setEditMode(true)}
                    className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px] border"
                    style={{ borderColor: 'var(--color-brand-primary)', color: 'var(--color-brand-primary)' }}>
                    Editar
                  </button>
                  <button className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px]"
                    style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
                    Re-encolar
                  </button>
                </>
              )}
              <button className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px]"
                style={{ background: 'var(--color-semantic-error)', color: 'white' }}>
                Descartar
              </button>
              <button onClick={() => { setViewId(null); setEditMode(false) }}
                className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px] border"
                style={{ borderColor: 'var(--color-neutral-border)' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <AlertTriangle size={24} style={{ color: 'var(--color-semantic-error)' }} />
              </div>
              <h4 className="font-semibold">
                {confirmAction === 'discard' ? 'Confirmar descarte' : 'Confirmar re-encolado'}
              </h4>
            </div>
            <p className="text-sm mb-6" style={{ color: 'var(--color-neutral-muted)' }}>
              {confirmAction === 'discard'
                ? `¿Descartar ${selected.size} mensaje${selected.size > 1 ? 's' : ''} definitivamente? Esta acción no se puede deshacer.`
                : `¿Re-encolar ${selected.size} mensaje${selected.size > 1 ? 's' : ''} a sus colas originales?`}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px] border"
                style={{ borderColor: 'var(--color-neutral-border)' }}>
                Cancelar
              </button>
              <button onClick={() => { setConfirmAction(null); setSelected(new Set()); showToast(confirmAction === 'discard' ? `${selected.size} mensaje(s) descartados` : `${selected.size} mensaje(s) re-encolados`) }}
                className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px]"
                style={{ background: confirmAction === 'discard' ? 'var(--color-semantic-error)' : 'var(--color-brand-primary)', color: 'white' }}>
                {confirmAction === 'discard' ? `Descartar ${selected.size}` : `Re-encolar ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
