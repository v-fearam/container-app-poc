import { useState } from 'react'
import { Plus, Edit2, Trash2, Search, X } from 'lucide-react'
import { useToast } from '../components/Toast'

interface Campania {
  id: string
  nombre: string
  template: string
  asunto: string
  tipoBase: 'csv' | 'segmentacion'
  parametrosSegmentacion: string
  variablesHtml: string[]
  activa: boolean
}

const mockCampanias: Campania[] = [
  { id: '1', nombre: 'Factura Digital 2026', template: 'campana-factura-digital-v2', asunto: 'Pasate a la factura digital', tipoBase: 'segmentacion', parametrosSegmentacion: 'categoría=R, estado=activo', variablesHtml: ['nombre', 'numero_cuenta', 'url_activacion'], activa: true },
  { id: '2', nombre: 'Cobrabilidad Julio', template: 'campana-cobrabilidad-v1', asunto: 'Regularizá tu deuda', tipoBase: 'csv', parametrosSegmentacion: '-', variablesHtml: ['nombre', 'monto_deuda', 'fecha_vencimiento'], activa: false },
  { id: '3', nombre: 'Encuesta Satisfacción', template: 'campana-encuesta-v1', asunto: 'Contanos tu experiencia', tipoBase: 'segmentacion', parametrosSegmentacion: 'ultima_interaccion < 30 días', variablesHtml: ['nombre', 'url_encuesta'], activa: true },
]

const emptyCampania: Campania = { id: '', nombre: '', template: '', asunto: '', tipoBase: 'csv', parametrosSegmentacion: '', variablesHtml: [], activa: true }

export function CampanasPage() {
  const [campanias, setCampanias] = useState(mockCampanias)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Campania>(emptyCampania)
  const [variablesInput, setVariablesInput] = useState('')
  const { showToast } = useToast()

  const filtered = campanias.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = (id: string) => {
    setCampanias(campanias.filter(c => c.id !== id))
    showToast('Campaña eliminada')
  }

  const openCreate = () => {
    setEditing({ ...emptyCampania, id: crypto.randomUUID() })
    setVariablesInput('')
    setModalOpen(true)
  }

  const openEdit = (c: Campania) => {
    setEditing({ ...c })
    setVariablesInput(c.variablesHtml.join(', '))
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!editing.nombre.trim()) return
    const saved = { ...editing, variablesHtml: variablesInput.split(',').map(v => v.trim()).filter(Boolean) }
    const exists = campanias.find(c => c.id === saved.id)
    if (exists) {
      setCampanias(campanias.map(c => c.id === saved.id ? saved : c))
      showToast('Campaña actualizada')
    } else {
      setCampanias([...campanias, saved])
      showToast('Campaña creada')
    }
    setModalOpen(false)
  }

  const isNew = !campanias.find(c => c.id === editing.id)

  return (
    <div className="space-y-6">
      <div>
        <h3>Campañas — Configuración</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-neutral-muted)' }}>
          Configuración de Campania: template, base de contactos (CSV o segmentación), variables HTML
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-neutral-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar campaña..."
            className="pl-10 pr-4 py-2 rounded-lg border text-sm w-full"
            style={{ borderColor: 'var(--color-neutral-border)' }} />
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer min-h-[44px]"
          style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
          <Plus size={16} /> Nueva campaña
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-neutral-background)' }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Template</th>
              <th className="text-left px-4 py-3 font-medium">Asunto</th>
              <th className="text-left px-4 py-3 font-medium">Tipo base</th>
              <th className="text-left px-4 py-3 font-medium">Variables HTML</th>
              <th className="text-center px-4 py-3 font-medium">Activa</th>
              <th className="text-center px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className="px-4 py-3 font-medium">{c.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.template}</td>
                <td className="px-4 py-3 text-xs">{c.asunto}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${c.tipoBase === 'csv' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                    {c.tipoBase}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex gap-1 flex-wrap">
                    {c.variablesHtml.map(v => (
                      <span key={v} className="px-1.5 py-0.5 rounded text-[11px]"
                        style={{ background: 'rgba(0,102,179,0.08)', color: 'var(--color-brand-primary)' }}>
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-medium ${c.activa ? 'text-green-600' : 'text-gray-400'}`}>
                    {c.activa ? 'Sí' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => openEdit(c)}
                      className="p-2 hover:bg-blue-50 rounded cursor-pointer" title="Editar">
                      <Edit2 size={14} style={{ color: 'var(--color-brand-primary)' }} />
                    </button>
                    <button onClick={() => handleDelete(c.id)}
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
          <span>Mostrando {filtered.length} de {campanias.length}</span>
          <span>25 por página</span>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h4 className="font-semibold text-lg">{isNew ? 'Nueva Campaña' : 'Editar Campaña'}</h4>
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
                  <label className="text-xs font-medium block mb-1">Template</label>
                  <input value={editing.template} onChange={e => setEditing({ ...editing, template: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Asunto</label>
                <input value={editing.asunto} onChange={e => setEditing({ ...editing, asunto: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Tipo de base</label>
                  <select value={editing.tipoBase} onChange={e => setEditing({ ...editing, tipoBase: e.target.value as 'csv' | 'segmentacion' })}
                    className="w-full px-3 py-2 rounded-lg border text-sm cursor-pointer" style={{ borderColor: 'var(--color-neutral-border)' }}>
                    <option value="csv">CSV</option>
                    <option value="segmentacion">Segmentación</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Parámetros segmentación</label>
                  <input value={editing.parametrosSegmentacion} onChange={e => setEditing({ ...editing, parametrosSegmentacion: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }}
                    disabled={editing.tipoBase === 'csv'} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Variables HTML (separadas por coma)</label>
                <input value={variablesInput} onChange={e => setVariablesInput(e.target.value)}
                  placeholder="nombre, monto, url_activacion"
                  className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--color-neutral-border)' }} />
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
