import { useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

const routeNames: Record<string, string> = {
  '/': 'Home',
  '/colas': 'Colas',
  '/dlq': 'DLQ Manager',
  '/eventos': 'Eventos',
  '/health': 'Health',
  '/config': 'Configuración',
  '/scheduler': 'Scheduler',
  '/genericos': 'Genéricos',
  '/negocio': 'Negocio',
  '/campanas': 'Campañas',
}

export function Header() {
  const location = useLocation()
  const title = routeNames[location.pathname] || 'Dashboard'
  const params = new URLSearchParams(location.search)
  const colaFilter = params.get('cola')

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-white"
      style={{ borderBottom: '1px solid var(--color-neutral-border)' }}>
      <div>
        <h2 style={{ color: 'var(--color-neutral-textStrong)', fontSize: 'var(--font-size-h2)' }}>
          {title}
        </h2>
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--color-neutral-muted)' }}>
          <span>Dashboard</span>
          <ChevronRight size={12} />
          <span style={{ color: 'var(--color-neutral-text)' }}>{title}</span>
          {colaFilter && (
            <>
              <ChevronRight size={12} />
              <span style={{ color: 'var(--color-neutral-text)' }}>{colaFilter}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-neutral-muted)' }}>
        <span>Usuario Demo</span>
      </div>
    </header>
  )
}
