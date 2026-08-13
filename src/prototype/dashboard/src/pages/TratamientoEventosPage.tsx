import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, Search, X, Filter } from 'lucide-react'
import { useToast } from '../components/Toast'

interface ReglaSmtp {
  id: string
  razon: string
  codigoSmtp: number
  subCodigoSmtp: string
  severidad: 'Permanente' | 'Temporal'
  resultado: 'Rebotado' | 'Rechazado Canal' | 'No Entregado' | 'Spam'
  observacion: string
  activa: boolean
}

const mockReglas: ReglaSmtp[] = [
  { id: '1', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '-', severidad: 'Permanente', resultado: 'Rebotado', observacion: 'Buzón no disponible — cuenta desactivada o usuario desconocido', activa: true },
  { id: '2', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '4.4.1', severidad: 'Temporal', resultado: 'No Entregado', observacion: 'El servidor del destinatario no aceptó solicitudes de conexión', activa: true },
  { id: '3', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '4.4.7', severidad: 'Temporal', resultado: 'No Entregado', observacion: 'Servidor de destino desconectado o inaccesible, timeout de red', activa: true },
  { id: '4', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '5.1.1', severidad: 'Permanente', resultado: 'Rebotado', observacion: 'La cuenta de correo no existe', activa: true },
  { id: '5', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '5.0.0', severidad: 'Permanente', resultado: 'Rebotado', observacion: 'No such user', activa: true },
  { id: '6', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '5.2.0', severidad: 'Permanente', resultado: 'Rebotado', observacion: 'Error en entrega del mensaje', activa: true },
  { id: '7', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '5.2.2', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Mailbox full — quota exceeded', activa: true },
  { id: '8', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '5.3.2', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Sistema no acepta mensajes de red — problema de conectividad', activa: true },
  { id: '9', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '5.4.14', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Bucles de enrutamiento de correo (mail loop)', activa: true },
  { id: '10', razon: 'Bounce', codigoSmtp: 550, subCodigoSmtp: '5.4.310', severidad: 'Permanente', resultado: 'Rebotado', observacion: 'Dominio inexistente', activa: true },
  { id: '11', razon: 'Bounce', codigoSmtp: 552, subCodigoSmtp: '5.2.2', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Tamaño excedido — cuenta o mail', activa: true },
  { id: '12', razon: 'Bounce', codigoSmtp: 554, subCodigoSmtp: '-', severidad: 'Permanente', resultado: 'Rebotado', observacion: 'Error genérico de entrega permanente', activa: true },
  { id: '13', razon: 'Generic', codigoSmtp: 550, subCodigoSmtp: '5.7.105', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Sender denied — email en SenderFilterConfig list', activa: true },
  { id: '14', razon: 'Generic', codigoSmtp: 550, subCodigoSmtp: '4.7.26', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Mail no autenticado (SPF/DKIM fail) — bloqueado por Gmail', activa: true },
  { id: '15', razon: 'Generic', codigoSmtp: 541, subCodigoSmtp: '5.4.1', severidad: 'Permanente', resultado: 'Spam', observacion: 'Rechazado por filtro anti-spam del destinatario', activa: true },
  { id: '16', razon: 'Generic', codigoSmtp: 541, subCodigoSmtp: '5.7.1', severidad: 'Permanente', resultado: 'Spam', observacion: 'Mail rejected due to antispam policy', activa: true },
  { id: '17', razon: 'Generic', codigoSmtp: 452, subCodigoSmtp: '4.2.2', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Cuenta over quota (Google, etc.)', activa: true },
  { id: '18', razon: 'Generic', codigoSmtp: 452, subCodigoSmtp: '4.3.1', severidad: 'Temporal', resultado: 'No Entregado', observacion: 'Insufficient system resources', activa: true },
  { id: '19', razon: 'Generic', codigoSmtp: 421, subCodigoSmtp: '4.7.28', severidad: 'Temporal', resultado: 'Rechazado Canal', observacion: 'Gmail rate limit por mail no solicitado', activa: true },
  { id: '20', razon: 'Overquota', codigoSmtp: 550, subCodigoSmtp: '-', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Mailbox full / Blocks limit exceeded', activa: true },
  { id: '21', razon: 'Espblock', codigoSmtp: 550, subCodigoSmtp: '5.7.515', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Dominio no pasa autenticación requerida (SPF fail)', activa: true },
  { id: '22', razon: 'Blacklisted', codigoSmtp: 550, subCodigoSmtp: '2.0.0', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'IP bloqueada en Spamhaus u otra blacklist', activa: true },
  { id: '23', razon: 'Ratelimit', codigoSmtp: 421, subCodigoSmtp: '4.7.0', severidad: 'Temporal', resultado: 'No Entregado', observacion: 'IP rate limited por volumen o quejas de usuarios', activa: true },
  { id: '24', razon: 'Greylisted', codigoSmtp: 451, subCodigoSmtp: '-', severidad: 'Temporal', resultado: 'No Entregado', observacion: 'Greylisting — reintentar más tarde', activa: true },
  { id: '25', razon: 'Suppress-bounce', codigoSmtp: 605, subCodigoSmtp: '-', severidad: 'Permanente', resultado: 'Rebotado', observacion: 'Not delivering to previously bounced address', activa: true },
  { id: '26', razon: 'Suppress-complaint', codigoSmtp: 607, subCodigoSmtp: '-', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Usuario se quejó — Mailgun no envía más por este dominio', activa: true },
  { id: '27', razon: 'Suppress-unsubscribe', codigoSmtp: 606, subCodigoSmtp: '-', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Not delivering to unsubscribed address', activa: true },
  { id: '28', razon: 'Old', codigoSmtp: 602, subCodigoSmtp: '-', severidad: 'Permanente', resultado: 'Rechazado Canal', observacion: 'Mensaje expirado por antigüedad (too old)', activa: true },
]

const emptyRegla: ReglaSmtp = { id: '', razon: '', codigoSmtp: 550, subCodigoSmtp: '', severidad: 'Permanente', resultado: 'Rebotado', observacion: '', activa: true }

const resultadoColors: Record<string, string> = {
  'Rebotado': 'bg-red-50 text-red-700',
  'Rechazado Canal': 'bg-orange-50 text-orange-700',
  'No Entregado': 'bg-amber-50 text-amber-700',
  'Spam': 'bg-purple-50 text-purple-700',
}

const severidadColors: Record<string, string> = {
  'Permanente': 'bg-red-50 text-red-700',
  'Temporal': 'bg-blue-50 text-blue-700',
}

export function TratamientoEventosPage() {
  const [reglas, setReglas] = useState(mockReglas)
  const [search, setSearch] = useState('')
  const [filterResultado, setFilterResultado] = useState('')
  const [filterSeveridad, setFilterSeveridad] = useState('')
  const [filterRazon, setFilterRazon] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ReglaSmtp>(emptyRegla)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const { showToast } = useToast()

  const razones = [...new Set(reglas.map(r => r.razon))].sort()

  const filtered = useMemo(() => {
    return reglas.filter(r => {
      if (filterResultado && r.resultado !== filterResultado) return false
      if (filterSeveridad && r.severidad !== filterSeveridad) return false
      if (filterRazon && r.razon !== filterRazon) return false
      if (search) {
        const q = search.toLowerCase()
        return r.razon.toLowerCase().includes(q) ||
          r.codigoSmtp.toString().includes(q) ||
          r.subCodigoSmtp.toLowerCase().includes(q) ||
          r.observacion.toLowerCase().includes(q)
      }
      return true
    })
  }, [reglas, search, filterResultado, filterSeveridad, filterRazon])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = (id: string) => {
    setReglas(reglas.filter(r => r.id !== id))
    showToast('Regla eliminada')
  }

  const openCreate = () => {
    setEditing({ ...emptyRegla, id: crypto.randomUUID() })
    setModalOpen(true)
  }

  const openEdit = (r: ReglaSmtp) => {
    setEditing({ ...r })
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!editing.razon.trim()) return
    const exists = reglas.find(r => r.id === editing.id)
    if (exists) {
      setReglas(reglas.map(r => r.id === editing.id ? editing : r))
      showToast('Regla actualizada')
    } else {
      setReglas([...reglas, editing])
      showToast('Regla creada')
    }
    setModalOpen(false)
  }

  const isNew = !reglas.find(r => r.id === editing.id)

  const stats = useMemo(() => ({
    total: reglas.length,
    rebotado: reglas.filter(r => r.resultado === 'Rebotado').length,
    rechazado: reglas.filter(r => r.resultado === 'Rechazado Canal').length,
    noEntregado: reglas.filter(r => r.resultado === 'No Entregado').length,
    spam: reglas.filter(r => r.resultado === 'Spam').length,
  }), [reglas])

  return (
    <div className="space-y-6">
      <div>
        <h3>Tratamiento de Eventos SMTP</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-neutral-muted)' }}>
          Reglas de tratamiento según código y subcódigo SMTP. Define qué acción tomar para cada tipo de respuesta de los proveedores de email.
          Almacenado en Azure Table Storage.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>Total reglas</p>
          <p className="text-xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => { setFilterResultado('Rebotado'); setPage(1) }}>
          <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>Rebotado</p>
          <p className="text-xl font-bold text-red-600">{stats.rebotado}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => { setFilterResultado('Rechazado Canal'); setPage(1) }}>
          <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>Rechazado Canal</p>
          <p className="text-xl font-bold text-orange-600">{stats.rechazado}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => { setFilterResultado('No Entregado'); setPage(1) }}>
          <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>No Entregado</p>
          <p className="text-xl font-bold text-amber-600">{stats.noEntregado}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => { setFilterResultado('Spam'); setPage(1) }}>
          <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>Spam</p>
          <p className="text-xl font-bold text-purple-600">{stats.spam}</p>
        </div>
      </div>

      {/* Actions + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-neutral-muted)' }} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por código, razón, observación..."
            className="pl-10 pr-4 py-2 rounded-lg border text-sm w-full"
            style={{ borderColor: 'var(--color-neutral-border)' }} />
        </div>
        <select value={filterRazon} onChange={e => { setFilterRazon(e.target.value); setPage(1) }}
          aria-label="Filtrar por razón"
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-neutral-border)' }}>
          <option value="">Todas las razones</option>
          {razones.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterResultado} onChange={e => { setFilterResultado(e.target.value); setPage(1) }}
          aria-label="Filtrar por resultado"
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-neutral-border)' }}>
          <option value="">Todos los resultados</option>
          <option value="Rebotado">Rebotado</option>
          <option value="Rechazado Canal">Rechazado Canal</option>
          <option value="No Entregado">No Entregado</option>
          <option value="Spam">Spam</option>
        </select>
        <select value={filterSeveridad} onChange={e => { setFilterSeveridad(e.target.value); setPage(1) }}
          aria-label="Filtrar por severidad"
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-neutral-border)' }}>
          <option value="">Todas las severidades</option>
          <option value="Permanente">Permanente</option>
          <option value="Temporal">Temporal</option>
        </select>
        {(search || filterResultado || filterSeveridad || filterRazon) && (
          <button onClick={() => { setSearch(''); setFilterResultado(''); setFilterSeveridad(''); setFilterRazon(''); setPage(1) }}
            className="text-xs cursor-pointer hover:underline"
            style={{ color: 'var(--color-brand-primary)' }}>Limpiar filtros</button>
        )}
        <div className="ml-auto">
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer min-h-[44px]"
            style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
            <Plus size={16} /> Nueva regla
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-neutral-background)' }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium">Razón</th>
              <th className="text-center px-4 py-3 font-medium">Código</th>
              <th className="text-center px-4 py-3 font-medium">SubCódigo</th>
              <th className="text-center px-4 py-3 font-medium">Severidad</th>
              <th className="text-center px-4 py-3 font-medium">Resultado</th>
              <th className="text-left px-4 py-3 font-medium">Observación</th>
              <th className="text-center px-4 py-3 font-medium">Activa</th>
              <th className="text-center px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className="px-4 py-3 font-medium text-xs">{r.razon}</td>
                <td className="px-4 py-3 text-center font-mono">{r.codigoSmtp}</td>
                <td className="px-4 py-3 text-center font-mono text-xs">{r.subCodigoSmtp}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-[11px] px-2 py-0.5 rounded ${severidadColors[r.severidad] || ''}`}>
                    {r.severidad}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-[11px] px-2 py-0.5 rounded ${resultadoColors[r.resultado] || ''}`}>
                    {r.resultado}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs max-w-xs truncate" title={r.observacion}>{r.observacion}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-medium ${r.activa ? 'text-green-600' : 'text-gray-400'}`}>
                    {r.activa ? 'Sí' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => openEdit(r)}
                      className="p-2 hover:bg-blue-50 rounded cursor-pointer" title="Editar">
                      <Edit2 size={14} style={{ color: 'var(--color-brand-primary)' }} />
                    </button>
                    <button onClick={() => handleDelete(r.id)}
                      className="p-2 hover:bg-red-50 rounded cursor-pointer" title="Eliminar">
                      <Trash2 size={14} style={{ color: 'var(--color-semantic-error)' }} />
                    </button>
                  </div>
                </td>
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

      {/* Edit/Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h4 className="font-semibold text-lg">{isNew ? 'Nueva Regla SMTP' : 'Editar Regla SMTP'}</h4>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-gray-100 cursor-pointer" aria-label="Cerrar">
                <X size={20} style={{ color: 'var(--color-neutral-muted)' }} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Razón</label>
                  <input value={editing.razon} onChange={e => setEditing({ ...editing, razon: e.target.value })}
                    placeholder="Bounce, Generic, Espblock..."
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Código SMTP</label>
                  <input type="number" value={editing.codigoSmtp} onChange={e => setEditing({ ...editing, codigoSmtp: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">SubCódigo SMTP</label>
                  <input value={editing.subCodigoSmtp} onChange={e => setEditing({ ...editing, subCodigoSmtp: e.target.value })}
                    placeholder="5.1.1, 4.4.7..."
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Severidad</label>
                  <select value={editing.severidad} onChange={e => setEditing({ ...editing, severidad: e.target.value as ReglaSmtp['severidad'] })}
                    className="w-full px-3 py-2 rounded-lg border text-sm cursor-pointer" style={{ borderColor: 'var(--color-neutral-border)' }}>
                    <option value="Permanente">Permanente</option>
                    <option value="Temporal">Temporal</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Resultado</label>
                  <select value={editing.resultado} onChange={e => setEditing({ ...editing, resultado: e.target.value as ReglaSmtp['resultado'] })}
                    className="w-full px-3 py-2 rounded-lg border text-sm cursor-pointer" style={{ borderColor: 'var(--color-neutral-border)' }}>
                    <option value="Rebotado">Rebotado</option>
                    <option value="Rechazado Canal">Rechazado Canal</option>
                    <option value="No Entregado">No Entregado</option>
                    <option value="Spam">Spam</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Observación</label>
                <textarea value={editing.observacion} onChange={e => setEditing({ ...editing, observacion: e.target.value })}
                  rows={3} placeholder="Descripción de la casuística y acción a tomar..."
                  className="w-full px-3 py-2 rounded-lg border text-sm resize-none" style={{ borderColor: 'var(--color-neutral-border)' }} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.activa} onChange={e => setEditing({ ...editing, activa: e.target.checked })}
                  className="cursor-pointer" />
                <span className="text-sm">Activa</span>
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px] border"
                style={{ borderColor: 'var(--color-neutral-border)' }}>Cancelar</button>
              <button onClick={handleSave}
                className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px]"
                style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
                {isNew ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
