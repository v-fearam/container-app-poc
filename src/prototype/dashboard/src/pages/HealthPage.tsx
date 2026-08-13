import { useState } from 'react'
import { workers, changeFeedStatus } from '../data/mockData'
import { StatusDot } from '../components/CounterCard'
import { Activity } from 'lucide-react'

export function HealthPage() {
  const [fecha, setFecha] = useState('2026-08-11')
  const totalWorkers = workers.length
  const activeWorkers = workers.filter(w => w.replicas > 0).length
  const totalErrores = changeFeedStatus.reduce((sum, cf) => sum + cf.erroresHoy, 0)

  return (
    <div className="space-y-6">
      <h3>Estado de Infraestructura</h3>

      {/* Infrastructure Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-xs mb-1" style={{ color: 'var(--color-neutral-muted)' }}>Workers Activos</p>
          <p className="text-2xl font-bold">{activeWorkers}/{totalWorkers}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-xs mb-1" style={{ color: 'var(--color-neutral-muted)' }}>Change Feed Errores</p>
          <p className="text-2xl font-bold" style={{ color: totalErrores > 0 ? 'var(--color-semantic-error)' : 'var(--color-semantic-success)' }}>{totalErrores}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-xs mb-1" style={{ color: 'var(--color-neutral-muted)' }}>Cosmos DB</p>
          <div className="flex items-center gap-2">
            <StatusDot count={0} />
            <p className="text-sm font-medium">Accesible</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-xs mb-1" style={{ color: 'var(--color-neutral-muted)' }}>SQL Server</p>
          <div className="flex items-center gap-2">
            <StatusDot count={0} />
            <p className="text-sm font-medium">Accesible</p>
          </div>
        </div>
      </div>

      {/* Change Feed by Vertical */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={20} style={{ color: 'var(--color-brand-primary)' }} />
            <h4 className="font-semibold">Change Feed Processors</h4>
          </div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
            style={{ borderColor: 'var(--color-neutral-border)' }} />
        </div>
        <div className="space-y-2">
          {changeFeedStatus.map(cf => (
            <div key={cf.vertical} className="border rounded-lg px-4 py-2 flex items-center justify-between"
              style={{ borderColor: 'var(--color-neutral-border)' }}>
              <h5 className="font-medium text-sm w-28">{cf.vertical}</h5>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>Procesados</p>
                  <p className="font-bold">{cf.procesadosHoy.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>Errores</p>
                  <p className="font-bold" style={{ color: cf.erroresHoy > 0 ? 'var(--color-semantic-error)' : 'var(--color-semantic-success)' }}>
                    {cf.erroresHoy}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>Último</p>
                  <p className="font-bold text-sm">{cf.ultimoProcesado}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px]" style={{ color: 'var(--color-neutral-muted)' }}>Lag</p>
                  <p className="font-bold text-sm" style={{ color: 'var(--color-semantic-success)' }}>{cf.lagEstimado}</p>
                </div>
              </div>
              <StatusDot count={cf.erroresHoy} />
            </div>
          ))}
        </div>
      </div>

      {/* Workers table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <h4 className="font-semibold px-5 pt-5 pb-3">Workers</h4>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-neutral-background)' }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-center px-4 py-3 font-medium">Estado</th>
              <th className="text-right px-4 py-3 font-medium">Réplicas</th>
              <th className="text-right px-4 py-3 font-medium">Max</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w, i) => (
              <tr key={w.nombre} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className="px-4 py-3">{w.nombre}</td>
                <td className="px-4 py-3 text-center"><StatusDot count={w.status === 'Running' ? 0 : 99} /></td>
                <td className="px-4 py-3 text-right font-medium">{w.replicas}</td>
                <td className="px-4 py-3 text-right" style={{ color: 'var(--color-neutral-muted)' }}>{w.maxReplicas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>Auto-refresh cada 30s</p>
    </div>
  )
}
