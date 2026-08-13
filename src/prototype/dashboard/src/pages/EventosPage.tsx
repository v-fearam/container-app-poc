import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, RefreshCw } from 'lucide-react'

interface EventoHora {
  hora: string
  vertical: 'Genéricos' | 'Negocio' | 'Campañas'
  proveedor: 'mailgun' | 'sms'
  recolectados: number
  delivered: number
  bounced: number
  opened: number
  clicked: number
  errores: number
}

const mockEventos: EventoHora[] = [
  { hora: '08:00', vertical: 'Negocio', proveedor: 'mailgun', recolectados: 12400, delivered: 11800, bounced: 320, opened: 8200, clicked: 3100, errores: 0 },
  { hora: '08:00', vertical: 'Negocio', proveedor: 'sms', recolectados: 1500, delivered: 1480, bounced: 12, opened: 0, clicked: 0, errores: 0 },
  { hora: '08:00', vertical: 'Campañas', proveedor: 'mailgun', recolectados: 45200, delivered: 44100, bounced: 890, opened: 28000, clicked: 12000, errores: 0 },
  { hora: '09:00', vertical: 'Negocio', proveedor: 'mailgun', recolectados: 18300, delivered: 17900, bounced: 210, opened: 12500, clicked: 5400, errores: 0 },
  { hora: '09:00', vertical: 'Genéricos', proveedor: 'mailgun', recolectados: 3200, delivered: 3100, bounced: 45, opened: 2100, clicked: 890, errores: 0 },
  { hora: '09:00', vertical: 'Campañas', proveedor: 'mailgun', recolectados: 52100, delivered: 51200, bounced: 720, opened: 33000, clicked: 15000, errores: 1 },
  { hora: '10:00', vertical: 'Negocio', proveedor: 'mailgun', recolectados: 14200, delivered: 13800, bounced: 180, opened: 9800, clicked: 4200, errores: 0 },
  { hora: '10:00', vertical: 'Genéricos', proveedor: 'mailgun', recolectados: 2800, delivered: 2750, bounced: 28, opened: 1900, clicked: 720, errores: 0 },
  { hora: '11:00', vertical: 'Negocio', proveedor: 'mailgun', recolectados: 8900, delivered: 8700, bounced: 95, opened: 5600, clicked: 2100, errores: 0 },
  { hora: '11:00', vertical: 'Campañas', proveedor: 'mailgun', recolectados: 38000, delivered: 37200, bounced: 580, opened: 21000, clicked: 9500, errores: 0 },
  { hora: '12:00', vertical: 'Negocio', proveedor: 'mailgun', recolectados: 5400, delivered: 5300, bounced: 60, opened: 3200, clicked: 1400, errores: 0 },
  { hora: '13:00', vertical: 'Genéricos', proveedor: 'mailgun', recolectados: 1800, delivered: 1760, bounced: 22, opened: 1200, clicked: 480, errores: 0 },
]

const dlqEventos = [
  { cola: 'nd-eventos-recoleccion', mensajes: 2, razon: 'Mailgun API timeout' },
]

export function EventosPage() {
  const navigate = useNavigate()
  const [fecha, setFecha] = useState('2026-08-11')
  const [filterVertical, setFilterVertical] = useState('')
  const [filterProveedor, setFilterProveedor] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 15

  const filtered = mockEventos
    .filter(e => {
      if (filterVertical && e.vertical !== filterVertical) return false
      if (filterProveedor && e.proveedor !== filterProveedor) return false
      return true
    })
    .sort((a, b) => b.hora.localeCompare(a.hora))

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const totals = filtered.reduce((acc, e) => ({
    recolectados: acc.recolectados + e.recolectados,
    delivered: acc.delivered + e.delivered,
    bounced: acc.bounced + e.bounced,
    opened: acc.opened + e.opened,
    clicked: acc.clicked + e.clicked,
    errores: acc.errores + e.errores,
  }), { recolectados: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, errores: 0 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3>Recolección de Eventos</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--color-neutral-muted)' }}>
            Polling horario a Mailgun/SMS → backup a Blob Storage → actualización de estados en CosmosDB
          </p>
        </div>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-neutral-border)' }} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>Recolectados</p>
          <p className="text-xl font-bold">{totals.recolectados.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>Delivered</p>
          <p className="text-xl font-bold" style={{ color: 'var(--color-semantic-success)' }}>{totals.delivered.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>Bounced</p>
          <p className="text-xl font-bold" style={{ color: 'var(--color-semantic-error)' }}>{totals.bounced.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>Opened</p>
          <p className="text-xl font-bold">{totals.opened.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>Clicked</p>
          <p className="text-xl font-bold">{totals.clicked.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>Errores</p>
          <p className="text-xl font-bold" style={{ color: totals.errores > 0 ? 'var(--color-semantic-error)' : 'var(--color-semantic-success)' }}>{totals.errores}</p>
        </div>
      </div>

      {/* DLQ */}
      {dlqEventos.length > 0 && (
        <div
          className="bg-white rounded-2xl shadow-sm p-5 border-l-4 cursor-pointer hover:shadow-md transition-shadow"
          style={{ borderLeftColor: 'var(--color-semantic-error)' }}
          onClick={() => navigate('/dlq?cola=nd-eventos-recoleccion')}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate('/dlq?cola=nd-eventos-recoleccion')
            }
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">DLQ — Recolección</h4>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-semantic-error)' }}>
              Ver en DLQ Manager →
            </span>
          </div>
          {dlqEventos.map(d => (
            <div key={d.cola} className="flex items-center justify-between text-sm">
              <span>{d.cola}: <strong style={{ color: 'var(--color-semantic-error)' }}>{d.mensajes}</strong> mensajes</span>
              <span className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>{d.razon}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <select value={filterVertical} onChange={e => { setFilterVertical(e.target.value); setPage(1) }}
          aria-label="Filtrar por vertical"
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-neutral-border)' }}>
          <option value="">Todas las verticales</option>
          <option value="Genéricos">Genéricos</option>
          <option value="Negocio">Negocio</option>
          <option value="Campañas">Campañas</option>
        </select>
        <select value={filterProveedor} onChange={e => { setFilterProveedor(e.target.value); setPage(1) }}
          aria-label="Filtrar por proveedor"
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-neutral-border)' }}>
          <option value="">Todos los proveedores</option>
          <option value="mailgun">Mailgun</option>
          <option value="sms">SMS</option>
        </select>
        {(filterVertical || filterProveedor) && (
          <button onClick={() => { setFilterVertical(''); setFilterProveedor('') }}
            className="text-xs cursor-pointer hover:underline"
            style={{ color: 'var(--color-brand-primary)' }}>Limpiar filtros</button>
        )}
      </div>

      {/* Table by hour */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-neutral-background)' }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium">Hora</th>
              <th className="text-left px-4 py-3 font-medium">Vertical</th>
              <th className="text-left px-4 py-3 font-medium">Proveedor</th>
              <th className="text-right px-4 py-3 font-medium">Recolectados</th>
              <th className="text-right px-4 py-3 font-medium">Delivered</th>
              <th className="text-right px-4 py-3 font-medium">Bounced</th>
              <th className="text-right px-4 py-3 font-medium">Opened</th>
              <th className="text-right px-4 py-3 font-medium">Clicked</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((e, i) => (
              <tr key={`${e.hora}-${e.vertical}-${e.proveedor}`} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className="px-4 py-3 font-medium">{e.hora}</td>
                <td className="px-4 py-3">{e.vertical}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${e.proveedor === 'mailgun' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                    {e.proveedor}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium">{e.recolectados.toLocaleString()}</td>
                <td className="px-4 py-3 text-right" style={{ color: 'var(--color-semantic-success)' }}>{e.delivered.toLocaleString()}</td>
                <td className="px-4 py-3 text-right" style={{ color: e.bounced > 0 ? 'var(--color-semantic-error)' : undefined }}>{e.bounced.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{e.opened.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{e.clicked.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 text-xs flex justify-between items-center border-t"
          style={{ borderColor: 'var(--color-neutral-border)', color: 'var(--color-neutral-muted)' }}>
          <span>Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} de {filtered.length}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 rounded border text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--color-neutral-border)' }}>← Anterior</button>
            <span className="px-2 py-1">Pág {page}/{totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1 rounded border text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--color-neutral-border)' }}>Siguiente →</button>
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>
        Eventos crudos respaldados en Blob Storage ({fecha}) — polling cada hora
      </p>
    </div>
  )
}
