import { useState, Fragment } from 'react'
import { jobs as initialJobs } from '../data/mockData'
import { Play, Square, ChevronDown, ChevronRight, AlertTriangle, Edit2, Power, PowerOff } from 'lucide-react'
import { useToast } from '../components/Toast'
import { CronEditorDialog } from '../components/CronEditorDialog'

export function SchedulerPage() {
  const [jobs, setJobs] = useState(initialJobs)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [cronDialogJob, setCronDialogJob] = useState<{ nombre: string; cron: string } | null>(null)
  const [confirmJob, setConfirmJob] = useState<{ nombre: string; action: 'run' | 'stop' | 'toggle' } | null>(null)
  const { showToast } = useToast()

  const handleSaveCron = (newCron: string) => {
    if (cronDialogJob) {
      setJobs(jobs.map(j => j.nombre === cronDialogJob.nombre ? { ...j, cron: newCron } : j))
      showToast(`Schedule actualizado para "${cronDialogJob.nombre}"`)
      setCronDialogJob(null)
    }
  }

  const handleToggleEnabled = (nombre: string) => {
    setConfirmJob({ nombre, action: 'toggle' })
  }

  const executeAction = () => {
    if (!confirmJob) return
    if (confirmJob.action === 'toggle') {
      setJobs(jobs.map(j => j.nombre === confirmJob.nombre ? { ...j, enabled: !j.enabled } : j))
      const job = jobs.find(j => j.nombre === confirmJob.nombre)
      showToast(`Job "${confirmJob.nombre}" ${job?.enabled ? 'deshabilitado' : 'habilitado'}`)
    } else {
      showToast(confirmJob.action === 'stop' ? `"${confirmJob.nombre}" detenido` : `"${confirmJob.nombre}" ejecutado`)
    }
    setConfirmJob(null)
  }

  return (
    <div className="space-y-6">
      <h3>Scheduler — Gestión de Jobs</h3>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-8 px-4 py-3"></th>
              <th className="text-left px-4 py-3 font-medium">Job</th>
              <th className="text-left px-4 py-3 font-medium">CRON</th>
              <th className="text-left px-4 py-3 font-medium">Próxima</th>
              <th className="text-left px-4 py-3 font-medium">Última</th>
              <th className="text-center px-4 py-3 font-medium">Estado</th>
              <th className="text-center px-4 py-3 font-medium">Habilitado</th>
              <th className="text-center px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, i) => (
              <Fragment key={j.nombre}>
                <tr className={`${i % 2 === 0 ? '' : 'bg-gray-50/50'} hover:bg-blue-50/50 transition-colors`}>
                  <td className="px-4 py-3">
                    <button onClick={() => setExpandedJob(expandedJob === j.nombre ? null : j.nombre)}
                      className="cursor-pointer text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
                      {expandedJob === j.nombre ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium">{j.nombre}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{j.cron}</span>
                      <button onClick={() => setCronDialogJob({ nombre: j.nombre, cron: j.cron })}
                        className="p-1.5 hover:bg-blue-50 rounded cursor-pointer"
                        title="Editar schedule">
                        <Edit2 size={14} style={{ color: 'var(--color-brand-primary)' }} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">{j.proximaEjecucion}</td>
                  <td className="px-4 py-3">{j.ultimaEjecucion}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      j.ultimoEstado === 'success' ? 'bg-green-100 text-green-700' :
                      j.ultimoEstado === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{j.ultimoEstado}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggleEnabled(j.nombre)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer transition-colors"
                      title={j.enabled ? 'Deshabilitar' : 'Habilitar'}>
                      {j.enabled ? (
                        <><Power size={14} style={{ color: 'var(--color-semantic-success)' }} /><span className="text-xs font-medium" style={{ color: 'var(--color-semantic-success)' }}>ON</span></>
                      ) : (
                        <><PowerOff size={14} style={{ color: 'var(--color-neutral-muted)' }} /><span className="text-xs font-medium" style={{ color: 'var(--color-neutral-muted)' }}>OFF</span></>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      {j.ultimoEstado === 'running' ? (
                        <button onClick={() => setConfirmJob({ nombre: j.nombre, action: 'stop' })}
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-red-50 cursor-pointer" title="Detener">
                          <Square size={16} style={{ color: 'var(--color-semantic-error)' }} />
                        </button>
                      ) : (
                        <button onClick={() => setConfirmJob({ nombre: j.nombre, action: 'run' })}
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-blue-50 cursor-pointer" title="Ejecutar">
                          <Play size={16} style={{ color: 'var(--color-brand-primary)' }} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedJob === j.nombre && (
                  <tr key={`${j.nombre}-history`} className="bg-gray-50/80">
                    <td colSpan={8} className="px-8 py-4">
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-neutral-muted)' }}>Últimas ejecuciones</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex gap-6"><span className="w-36">{j.ultimaEjecucion}</span><span style={{ color: 'var(--color-semantic-success)' }}>success</span><span style={{ color: 'var(--color-neutral-muted)' }}>duración: 45s</span></div>
                        <div className="flex gap-6"><span className="w-36">2026-08-10 08:00</span><span style={{ color: 'var(--color-semantic-success)' }}>success</span><span style={{ color: 'var(--color-neutral-muted)' }}>duración: 42s</span></div>
                        <div className="flex gap-6"><span className="w-36">2026-08-09 08:00</span><span style={{ color: 'var(--color-semantic-success)' }}>success</span><span style={{ color: 'var(--color-neutral-muted)' }}>duración: 48s</span></div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation Dialog */}
      {confirmJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full" style={{ background: 
                confirmJob.action === 'stop' ? 'rgba(239,68,68,0.1)' : 
                confirmJob.action === 'toggle' ? 'rgba(251,191,36,0.1)' : 
                'rgba(0,102,179,0.1)' }}>
                <AlertTriangle size={24} style={{ color: 
                  confirmJob.action === 'stop' ? 'var(--color-semantic-error)' : 
                  confirmJob.action === 'toggle' ? 'var(--color-semantic-warning)' : 
                  'var(--color-brand-primary)' }} />
              </div>
              <h4 className="font-semibold">
                {confirmJob.action === 'stop' ? 'Detener ejecución' : 
                 confirmJob.action === 'toggle' ? 'Cambiar estado' : 
                 'Ejecutar job'}
              </h4>
            </div>
            <p className="text-sm mb-6" style={{ color: 'var(--color-neutral-muted)' }}>
              {confirmJob.action === 'stop' 
                ? `¿Detener la ejecución en curso de "${confirmJob.nombre}"?`
                : confirmJob.action === 'toggle'
                  ? `¿${jobs.find(j => j.nombre === confirmJob.nombre)?.enabled ? 'Deshabilitar' : 'Habilitar'} el job "${confirmJob.nombre}"?`
                  : `¿Ejecutar "${confirmJob.nombre}" ahora?`}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmJob(null)}
                className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px] border"
                style={{ borderColor: 'var(--color-neutral-border)' }}>Cancelar</button>
              <button onClick={executeAction}
                className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px]"
                style={{ background: 
                  confirmJob.action === 'stop' ? 'var(--color-semantic-error)' : 
                  confirmJob.action === 'toggle' ? 'var(--color-semantic-warning)' : 
                  'var(--color-brand-primary)', color: 'white' }}>
                {confirmJob.action === 'stop' ? 'Detener' : 
                 confirmJob.action === 'toggle' ? 'Confirmar' : 
                 'Ejecutar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRON Editor Dialog */}
      <CronEditorDialog
        isOpen={cronDialogJob !== null}
        onClose={() => setCronDialogJob(null)}
        jobName={cronDialogJob?.nombre ?? ''}
        currentCron={cronDialogJob?.cron ?? ''}
        onSave={handleSaveCron}
      />
    </div>
  )
}
