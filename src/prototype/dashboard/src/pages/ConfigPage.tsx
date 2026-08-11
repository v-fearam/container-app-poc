export function ConfigPage() {
  return (
    <div className="space-y-6">
      <h3>Configuración de Procesos</h3>
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <p style={{ color: 'var(--color-neutral-muted)' }}>
          Sección de configuración CRUD por vertical — próxima iteración del prototipo.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-4">
          {['Genéricos', 'Negocio', 'Campañas'].map(v => (
            <div key={v} className="border rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
              style={{ borderColor: 'var(--color-neutral-border)' }}>
              <h4 className="font-semibold mb-2">{v}</h4>
              <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>
                {v === 'Genéricos' ? '4 tipos configurados' : v === 'Negocio' ? '3 procesos configurados' : '2 campañas activas'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
