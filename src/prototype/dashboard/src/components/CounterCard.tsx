interface CounterCardProps {
  label: string
  value: number
  color?: string
}

export function CounterCard({ label, value, color }: CounterCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <p className="text-sm mb-1" style={{ color: 'var(--color-neutral-muted)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: color || 'var(--color-neutral-textStrong)' }}>
        {value.toLocaleString('es-AR')}
      </p>
    </div>
  )
}

interface StatusDotProps {
  count: number
}

export function StatusDot({ count }: StatusDotProps) {
  const color = count === 0
    ? 'var(--color-semantic-success)'
    : count <= 10
      ? 'var(--color-semantic-warning)'
      : 'var(--color-semantic-error)'
  const label = count === 0 ? 'OK' : count <= 10 ? 'Alerta' : 'Crítico'
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="text-xs" style={{ color }}>{label}</span>
    </span>
  )
}
