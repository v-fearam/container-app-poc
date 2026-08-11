import { useState } from 'react'
import { Plus, Edit2, Trash2, Search, X } from 'lucide-react'
import { useToast } from '../components/Toast'

interface ProcesoNegocio {
  id: string
  nombre: string
  template: string
  storedProcedure: string
  topeDiario: number
  tablaRelacion: string
  particiones: number
  activo: boolean
}

const mockProcesos: ProcesoNegocio[] = [
  { id: '1', nombre: 'Aviso de Deuda', template: 'aviso-deuda-v3', storedProcedure: 'sp_CalcAvisoDeuda', topeDiario: 50000, tablaRelacion: 'DeudaVencida', particiones: 10, activo: true },
  { id: '2', nombre: 'Aviso de Corte', template: 'aviso-corte-v2', storedProcedure: 'sp_CalcAvisoCorte', topeDiario: 15000, tablaRelacion: 'CorteInminente', particiones: 10, activo: true },
  { id: '3', nombre: 'Vto. Factura', template: 'vto-factura-v1', storedProcedure: 'sp_CalcVtoFactura', topeDiario: 30000, tablaRelacion: 'FacturasPendientes', particiones: 10, activo: true },
  { id: '4', nombre: 'Consumo Elevado', template: 'consumo-elevado-v1', storedProcedure: 'sp_CalcConsumoElevado', topeDiario: 8000, tablaRelacion: 'ConsumoHistorico', particiones: 10, activo: false },
]

const emptyProceso: ProcesoNegocio = { id: '', nombre: '', template: '', storedProcedure: '', topeDiario: 10000, tablaRelacion: '', particiones: 10, activo: true }

export function NegocioPage() {
  const [procesos, setProcesos] = useState(mockProcesos)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProcesoNegocio>(emptyProceso)
  const { showToast } = useToast()

  const filtered = procesos.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = (id: string) => {
    setProcesos(procesos.filter(p => p.id !== id))
    showToast('Proceso eliminado')
  }

  const openCreate = () => {
    setEditing({ ...emptyProceso, id: crypto.randomUUID() })
    setModalOpen(true)
  }

  const openEdit = (p: ProcesoNegocio) => {
    setEditing({ ...p })
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!editing.nombre.trim()) return
    const exists = procesos.find(p => p.id === editing.id)
    if (exists) {
      setProcesos(procesos.map(p => p.id === editing.id ? editing : p))
      showToast('Proceso actualizado')
    } else {
      setProcesos([...procesos, editing])
      showToast('Proceso creado')
    }
    setModalOpen(false)
  }

  const isNew = !procesos.find(p => p.id === editing.id)

  return (
    <div className="space-y-6">
      <div>
        <h3>Negocio — Procesos</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-neutral-muted)' }}>
          Configuración de ProcesoNegocio: SP de cálculo, template, tope diario, particiones
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-neutral-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proceso..."
            className="pl-10 pr-4 py-2 rounded-lg border text-sm w-full"
            style={{ borderColor: 'var(--color-neutral-border)' }} />
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer min-h-[44px]"
          style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
          <Plus size={16} /> Nuevo proceso
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-neutral-background)' }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Template</th>
              <th className="text-left px-4 py-3 font-medium">Stored Procedure</th>
              <th className="text-right px-4 py-3 font-medium">Tope diario</th>
              <th className="text-left px-4 py-3 font-medium">Tabla relación</th>
              <th className="text-right px-4 py-3 font-medium">Particiones</th>
              <th className="text-center px-4 py-3 font-medium">Activo</th>
              <th className="text-center px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className="px-4 py-3 font-medium">{p.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.template}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.storedProcedure}</td>
                <td className="px-4 py-3 text-right">{p.topeDiario.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs">{p.tablaRelacion}</td>
                <td className="px-4 py-3 text-right">{p.particiones}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-medium ${p.activo ? 'text-green-600' : 'text-gray-400'}`}>
                    {p.activo ? 'Sí' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => openEdit(p)}
                      className="p-2 hover:bg-blue-50 rounded cursor-pointer" title="Editar">
                      <Edit2 size={14} style={{ color: 'var(--color-brand-primary)' }} />
                    </button>
                    <button onClick={() => handleDelete(p.id)}
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
          <span>Mostrando {filtered.length} de {procesos.length}</span>
          <span>25 por página</span>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h4 className="font-semibold text-lg">{isNew ? 'Nuevo Proceso de Negocio' : 'Editar Proceso de Negocio'}</h4>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Stored Procedure</label>
                  <input value={editing.storedProcedure} onChange={e => setEditing({ ...editing, storedProcedure: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Tope diario</label>
                  <input type="number" value={editing.topeDiario} onChange={e => setEditing({ ...editing, topeDiario: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Tabla relación</label>
                  <input value={editing.tablaRelacion} onChange={e => setEditing({ ...editing, tablaRelacion: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Particiones (0-9)</label>
                  <input type="number" min={1} max={10} value={editing.particiones} onChange={e => setEditing({ ...editing, particiones: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-neutral-border)' }} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.activo} onChange={e => setEditing({ ...editing, activo: e.target.checked })}
                  className="cursor-pointer" />
                <span className="text-sm">Activo</span>
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
