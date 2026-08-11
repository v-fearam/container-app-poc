import { useState } from 'react'
import { Plus, Edit2, Trash2, Search, X } from 'lucide-react'
import { useToast } from '../components/Toast'

interface TipoComunicacion {
  id: string
  nombre: string
  canal: 'email' | 'sms'
  template: string
  asunto: string
  dominio: string
  storedProcedure: string
  tag: string
  activo: boolean
}

const mockTipos: TipoComunicacion[] = [
  { id: '1', nombre: 'Recupero de clave', canal: 'email', template: 'recupero-clave-v2', asunto: 'Recuperá tu clave', dominio: 'notificaciones.camuzzi.com', storedProcedure: 'sp_GetRecuperoClave', tag: 'seguridad', activo: true },
  { id: '2', nombre: 'Validación de email', canal: 'email', template: 'validacion-email-v1', asunto: 'Confirmá tu email', dominio: 'notificaciones.camuzzi.com', storedProcedure: 'sp_GetValidacionEmail', tag: 'onboarding', activo: true },
  { id: '3', nombre: 'Trámite', canal: 'email', template: 'tramite-generico-v1', asunto: 'Actualización de trámite', dominio: 'tramites.camuzzi.com', storedProcedure: 'sp_GetTramite', tag: 'tramites', activo: true },
  { id: '4', nombre: 'Aviso genérico', canal: 'sms', template: 'sms-aviso-v1', asunto: '-', dominio: '-', storedProcedure: 'sp_GetAvisoGenerico', tag: 'general', activo: true },
  { id: '5', nombre: 'Bienvenida', canal: 'email', template: 'bienvenida-v2', asunto: 'Te damos la bienvenida', dominio: 'notificaciones.camuzzi.com', storedProcedure: 'sp_GetBienvenida', tag: 'onboarding', activo: false },
]

const emptyTipo: TipoComunicacion = { id: '', nombre: '', canal: 'email', template: '', asunto: '', dominio: 'notificaciones.camuzzi.com', storedProcedure: '', tag: '', activo: true }

export function GenericosPage() {
  const [tipos, setTipos] = useState(mockTipos)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TipoComunicacion>(emptyTipo)
  const { showToast } = useToast()

  const filtered = tipos.filter(t =>
    t.nombre.toLowerCase().includes(search.toLowerCase()) ||
    t.tag.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = (id: string) => {
    setTipos(tipos.filter(t => t.id !== id))
    showToast('Tipo eliminado')
  }

  const openCreate = () => {
    setEditing({ ...emptyTipo, id: crypto.randomUUID() })
    setModalOpen(true)
  }

  const openEdit = (t: TipoComunicacion) => {
    setEditing({ ...t })
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!editing.nombre.trim()) return
    const exists = tipos.find(t => t.id === editing.id)
    if (exists) {
      setTipos(tipos.map(t => t.id === editing.id ? editing : t))
      showToast('Tipo actualizado')
    } else {
      setTipos([...tipos, editing])
      showToast('Tipo creado')
    }
    setModalOpen(false)
  }

  const isNew = !tipos.find(t => t.id === editing.id)

  return (
    <div className="space-y-6">
      <div>
        <h3>Genéricos — Tipos de Comunicación</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-neutral-muted)' }}>
          Configuración de TipoComunicacion: template, canal, dominio, stored procedure
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-neutral-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o tag..."
            className="pl-10 pr-4 py-2 rounded-lg border text-sm w-full"
            style={{ borderColor: 'var(--color-neutral-border)' }} />
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer min-h-[44px]"
          style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
          <Plus size={16} /> Nuevo tipo
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-neutral-background)' }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Canal</th>
              <th className="text-left px-4 py-3 font-medium">Template</th>
              <th className="text-left px-4 py-3 font-medium">Dominio</th>
              <th className="text-left px-4 py-3 font-medium">SP</th>
              <th className="text-left px-4 py-3 font-medium">Tag</th>
              <th className="text-center px-4 py-3 font-medium">Activo</th>
              <th className="text-center px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.id} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className="px-4 py-3 font-medium">{t.nombre}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${t.canal === 'email' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                    {t.canal}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{t.template}</td>
                <td className="px-4 py-3 text-xs">{t.dominio}</td>
                <td className="px-4 py-3 font-mono text-xs">{t.storedProcedure}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(0,102,179,0.08)', color: 'var(--color-brand-primary)' }}>
                    {t.tag}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-medium ${t.activo ? 'text-green-600' : 'text-gray-400'}`}>
                    {t.activo ? 'Sí' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => openEdit(t)}
                      className="p-2 hover:bg-blue-50 rounded cursor-pointer" title="Editar">
                      <Edit2 size={14} style={{ color: 'var(--color-brand-primary)' }} />
                    </button>
                    <button onClick={() => handleDelete(t.id)}
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
          <span>Mostrando {filtered.length} de {tipos.length}</span>
          <span>25 por página</span>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h4 className="font-semibold text-lg">{isNew ? 'Nuevo Tipo de Comunicación' : 'Editar Tipo de Comunicación'}</h4>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-gray-100 cursor-pointer" aria-label="Cerrar">
                <X size={20} style={{ color: 'var(--color-neutral-muted)' }} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Nombre</label>
                  <input value={editing.nombre} onChange={e => setEditing({ ...editing, nombre: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Canal</label>
                  <select value={editing.canal} onChange={e => setEditing({ ...editing, canal: e.target.value as 'email' | 'sms' })}
                    className="w-full px-3 py-2 rounded-lg border text-sm cursor-pointer" style={{ borderColor: 'var(--color-neutral-border)' }}>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Template</label>
                  <input value={editing.template} onChange={e => setEditing({ ...editing, template: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Asunto</label>
                  <input value={editing.asunto} onChange={e => setEditing({ ...editing, asunto: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Dominio</label>
                  <input value={editing.dominio} onChange={e => setEditing({ ...editing, dominio: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Stored Procedure</label>
                  <input value={editing.storedProcedure} onChange={e => setEditing({ ...editing, storedProcedure: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Tag</label>
                  <input value={editing.tag} onChange={e => setEditing({ ...editing, tag: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editing.activo} onChange={e => setEditing({ ...editing, activo: e.target.checked })}
                      className="cursor-pointer" />
                    <span className="text-sm">Activo</span>
                  </label>
                </div>
              </div>
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
