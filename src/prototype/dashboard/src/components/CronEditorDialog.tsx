import { useState, useEffect } from 'react'
import { Calendar, Check, X, Info } from 'lucide-react'

interface CronEditorDialogProps {
  isOpen: boolean
  onClose: () => void
  jobName: string
  currentCron: string
  onSave: (newCron: string) => void
}

const CRON_PRESETS = [
  { label: 'Cada 5 minutos', value: '*/5 * * * *' },
  { label: 'Cada hora', value: '0 * * * *' },
  { label: 'Diario 8:00', value: '0 8 * * *' },
  { label: 'Diario 9:00', value: '0 9 * * *' },
  { label: 'Lun-Vie 7:00', value: '0 7 * * 1-5' },
  { label: 'Lun-Vie 8:00', value: '0 8 * * 1-5' },
  { label: 'Cada minuto', value: '*/1 * * * *' },
]

function parseCronToHuman(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length !== 5) return 'Expresión inválida'

  const [min, hour, dom, month, dow] = parts

  if (min === '*/5' && hour === '*') return 'Cada 5 minutos'
  if (min === '*/1' && hour === '*') return 'Cada minuto'
  if (min === '0' && hour === '*') return 'Cada hora, en el minuto 0'
  if (min.startsWith('*/')) return `Cada ${min.slice(2)} minutos`

  let desc = ''
  if (hour !== '*' && min !== '*') {
    desc += `A las ${hour}:${min.padStart(2, '0')}`
  }
  if (dow === '1-5') desc += ', Lunes a Viernes'
  else if (dow === '*' && dom === '*' && month === '*') desc += ', todos los días'

  return desc || cron
}

function calculateNextExecutions(cron: string): string[] {
  const parts = cron.split(' ')
  if (parts.length !== 5) return []

  const now = new Date()
  const results: string[] = []
  const [min, hour] = parts

  for (let i = 0; i < 5; i++) {
    const next = new Date(now)
    next.setDate(next.getDate() + i)
    if (hour !== '*') next.setHours(parseInt(hour))
    if (min !== '*' && !min.startsWith('*/')) next.setMinutes(parseInt(min))
    else next.setMinutes(0)
    next.setSeconds(0)
    if (next > now) {
      results.push(next.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }))
    }
    if (results.length >= 3) break
  }
  return results
}

export function CronEditorDialog({ isOpen, onClose, jobName, currentCron, onSave }: CronEditorDialogProps) {
  const [cronValue, setCronValue] = useState(currentCron)
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    setCronValue(currentCron)
  }, [currentCron])

  useEffect(() => {
    const parts = cronValue.trim().split(/\s+/)
    setIsValid(parts.length === 5)
  }, [cronValue])

  if (!isOpen) return null

  const humanReadable = parseCronToHuman(cronValue)
  const nextExecs = calculateNextExecutions(cronValue)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-lg w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full" style={{ background: 'rgba(0,102,179,0.1)' }}>
            <Calendar size={24} style={{ color: 'var(--color-brand-primary)' }} />
          </div>
          <div>
            <h4 className="font-semibold">Editar Schedule</h4>
            <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>{jobName}</p>
          </div>
        </div>

        {/* CRON Input */}
        <div className="mb-4">
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-neutral-muted)' }}>
            Expresión CRON (5 campos: minuto hora día mes día-semana)
          </label>
          <input type="text" value={cronValue} onChange={e => setCronValue(e.target.value)}
            className={`px-4 py-2 rounded-lg border text-sm font-mono w-full ${!isValid ? 'border-red-400' : ''}`}
            style={{ borderColor: isValid ? 'var(--color-neutral-border)' : undefined }}
            placeholder="* * * * *" />
          {!isValid && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-semantic-error)' }}>
              Expresión CRON inválida — debe tener 5 campos separados por espacio
            </p>
          )}
        </div>

        {/* Human readable */}
        {isValid && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--color-neutral-background)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Info size={14} style={{ color: 'var(--color-brand-primary)' }} />
              <span className="text-sm font-medium">{humanReadable}</span>
            </div>
            {nextExecs.length > 0 && (
              <div className="mt-2">
                <p className="text-xs mb-1" style={{ color: 'var(--color-neutral-muted)' }}>Próximas ejecuciones:</p>
                <ul className="text-xs space-y-0.5">
                  {nextExecs.map((d, i) => (
                    <li key={i} style={{ color: 'var(--color-neutral-muted)' }}>• {d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Presets */}
        <div className="mb-6">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-neutral-muted)' }}>Presets</p>
          <div className="flex flex-wrap gap-2">
            {CRON_PRESETS.map(p => (
              <button key={p.value} onClick={() => setCronValue(p.value)}
                className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  cronValue === p.value ? 'border-[var(--color-brand-primary)] bg-blue-50' : ''
                }`}
                style={{ borderColor: cronValue === p.value ? 'var(--color-brand-primary)' : 'var(--color-neutral-border)' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px] border flex items-center gap-2"
            style={{ borderColor: 'var(--color-neutral-border)' }}>
            <X size={14} /> Cancelar
          </button>
          <button onClick={() => { if (isValid) onSave(cronValue) }}
            disabled={!isValid}
            className="px-4 py-2 text-sm rounded-lg cursor-pointer min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--color-brand-primary)', color: 'white' }}>
            <Check size={14} /> Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}
