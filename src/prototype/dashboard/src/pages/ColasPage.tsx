import { useNavigate } from 'react-router-dom'
import { colas } from '../data/mockData'
import { StatusDot } from '../components/CounterCard'

export function ColasPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <h3>Estado de Service Bus</h3>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Cola / Suscripción</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-right px-4 py-3 font-medium">Activos</th>
              <th className="text-right px-4 py-3 font-medium">DLQ</th>
              <th className="text-center px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {colas.map((c, i) => (
              <tr key={c.nombre} className={`${i % 2 === 0 ? '' : 'bg-gray-50/50'} hover:bg-blue-50/50 cursor-pointer transition-colors`}>
                <td className="px-4 py-3 font-medium">{c.nombre}</td>
                <td className="px-4 py-3">{c.tipo}</td>
                <td className="px-4 py-3 text-right">{c.activos.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  {c.dlq > 0 ? (
                    <button onClick={() => navigate(`/dlq?cola=${c.nombre}`)}
                      className="text-red-500 font-medium cursor-pointer hover:underline">{c.dlq}</button>
                  ) : '0'}
                </td>
                <td className="px-4 py-3 text-center"><StatusDot count={c.dlq} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>Auto-refresh cada 30s</p>
    </div>
  )
}
