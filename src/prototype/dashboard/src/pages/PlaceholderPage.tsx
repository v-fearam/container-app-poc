import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: 'var(--color-neutral-textStrong)' }}>
        {title} — Próximamente
      </h2>
      <p className="text-sm" style={{ color: 'var(--color-neutral-muted)' }}>
        Esta sección estará disponible en la próxima iteración del prototipo.
      </p>
      <Link to="/" className="flex items-center gap-2 text-sm cursor-pointer"
        style={{ color: 'var(--color-brand-primary)' }}>
        <ArrowLeft size={16} /> Volver a Home
      </Link>
    </div>
  )
}
