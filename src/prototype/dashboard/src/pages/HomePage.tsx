import { useState } from 'react'
import { CounterCard } from '../components/CounterCard'
import { genericosTipos, lotesNegocio, campanas } from '../data/mockData'
import type { CounterData } from '../data/mockData'

type Tab = 'genericos' | 'negocio' | 'campanas'

function sumCounters(items: { counters: CounterData }[]): CounterData {
  return items.reduce((acc, i) => ({
    creadas: acc.creadas + i.counters.creadas,
    enviadas: acc.enviadas + i.counters.enviadas,
    entregadas: acc.entregadas + i.counters.entregadas,
    rebotadas: acc.rebotadas + i.counters.rebotadas,
    abiertas: acc.abiertas + i.counters.abiertas,
    clickeadas: acc.clickeadas + i.counters.clickeadas,
    descartadas: acc.descartadas + i.counters.descartadas,
  }), { creadas: 0, enviadas: 0, entregadas: 0, rebotadas: 0, abiertas: 0, clickeadas: 0, descartadas: 0 })
}

export function HomePage() {
  const [tab, setTab] = useState<Tab>('genericos')
  const [fecha, setFecha] = useState('2026-08-11')
  const totals = sumCounters([...genericosTipos, ...lotesNegocio, ...campanas])

  return (
    <div className="space-y-6">
      {/* Cross-vertical summary */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3>Comunicaciones — Envío</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--color-neutral-muted)' }}>
              Resumen de comunicaciones procesadas por los workers de envío (no incluye generación ni recolección de eventos)
            </p>
          </div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
            style={{ borderColor: 'var(--color-neutral-border)' }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <CounterCard label="Creadas" value={totals.creadas} />
          <CounterCard label="Enviadas" value={totals.enviadas} color="var(--color-semantic-info)" />
          <CounterCard label="Descartadas" value={totals.descartadas} color="var(--color-semantic-warning)" />
          <CounterCard label="Entregadas" value={totals.entregadas} color="var(--color-semantic-success)" />
          <CounterCard label="Rebotadas" value={totals.rebotadas} color="var(--color-semantic-error)" />
          <CounterCard label="Abiertas" value={totals.abiertas} />
          <CounterCard label="Clickeadas" value={totals.clickeadas} />
        </div>
      </section>

      {/* Tabs */}
      <div className="border-b" style={{ borderColor: 'var(--color-neutral-border)' }}>
        <div role="tablist" className="flex gap-6">
          {(['genericos', 'negocio', 'campanas'] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} aria-controls={`panel-${t}`}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium cursor-pointer transition-colors border-b-2 ${
                tab === t ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]' : 'border-transparent text-[var(--color-neutral-muted)] hover:text-[var(--color-neutral-text)]'
              }`}>
              {t === 'genericos' ? 'Genéricos' : t === 'negocio' ? 'Negocio' : 'Campañas'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'genericos' && <div id="panel-genericos" role="tabpanel"><GenericosTab /></div>}
      {tab === 'negocio' && <div id="panel-negocio" role="tabpanel"><NegocioTab /></div>}
      {tab === 'campanas' && <div id="panel-campanas" role="tabpanel"><CampanasTab /></div>}
    </div>
  )
}

function GenericosTab() {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Tipo</th>
            <th className="text-left px-4 py-3 font-medium">Canal</th>
            <th className="text-right px-4 py-3 font-medium">Creadas</th>
            <th className="text-right px-4 py-3 font-medium">Enviadas</th>
            <th className="text-right px-4 py-3 font-medium">Descartadas</th>
            <th className="text-right px-4 py-3 font-medium">Entregadas</th>
            <th className="text-right px-4 py-3 font-medium">Rebotadas</th>
            <th className="text-right px-4 py-3 font-medium">Abiertas</th>
          </tr>
        </thead>
        <tbody>
          {genericosTipos.map((t, i) => (
            <tr key={t.nombre} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="px-4 py-3 font-medium">{t.nombre}</td>
              <td className="px-4 py-3">{t.canal}</td>
              <td className="px-4 py-3 text-right">{t.counters.creadas.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{t.counters.enviadas.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-amber-500">{t.counters.descartadas.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-green-600">{t.counters.entregadas.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-red-500">{t.counters.rebotadas.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">{t.counters.abiertas.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 text-xs border-t" style={{ borderColor: 'var(--color-neutral-border)', color: 'var(--color-neutral-muted)' }}>
        DLQ general nd-genericos: <span className="font-medium text-red-500">3 mensajes</span>
      </div>
    </div>
  )
}

function NegocioTab() {
  return (
    <div className="space-y-4">
      {lotesNegocio.map(lote => {
        const convergencia = lote.counters.enviadas > 0
          ? Math.round(((lote.counters.entregadas + lote.counters.rebotadas) / lote.counters.enviadas) * 100)
          : 0
        const barColor = convergencia >= 80 ? 'var(--color-semantic-success)' : convergencia >= 50 ? 'var(--color-semantic-warning)' : 'var(--color-semantic-error)'
        return (
          <div key={lote.id} className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h4 className="font-semibold">{lote.proceso}</h4>
                <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>
                  Generadores: {lote.generadoresTerminados}/{lote.generadoresDespertados} terminados
                </p>
              </div>
              <span className="text-lg font-bold" style={{ color: barColor }}>{convergencia}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div className="h-full rounded-full" style={{ width: `${convergencia}%`, background: barColor }} />
            </div>
            <div className="grid grid-cols-4 lg:grid-cols-7 gap-3 text-center text-xs">
              <div><p className="font-bold text-lg">{lote.counters.creadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Creadas</p></div>
              <div><p className="font-bold text-lg">{lote.counters.enviadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Enviadas</p></div>
              <div><p className="font-bold text-lg text-amber-500">{lote.counters.descartadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Descartadas</p></div>
              <div><p className="font-bold text-lg text-green-600">{lote.counters.entregadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Entregadas</p></div>
              <div><p className="font-bold text-lg text-red-500">{lote.counters.rebotadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Rebotadas</p></div>
              <div><p className="font-bold text-lg">{lote.counters.abiertas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Abiertas</p></div>
              <div><p className="font-bold text-lg">{lote.counters.clickeadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Clickeadas</p></div>
            </div>
          </div>
        )
      })}
      <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>
        DLQ general nd-negocio: <span className="font-medium text-red-500">12 mensajes</span>
      </p>
    </div>
  )
}

function CampanasTab() {
  return (
    <div className="space-y-4">
      {campanas.map(c => {
        const convergencia = c.counters.enviadas > 0
          ? Math.round(((c.counters.entregadas + c.counters.rebotadas) / c.counters.enviadas) * 100)
          : 0
        const barColor = convergencia >= 80 ? 'var(--color-semantic-success)' : convergencia >= 50 ? 'var(--color-semantic-warning)' : 'var(--color-semantic-error)'
        const porProcesar = c.volumenTotal - c.volumenProcesado
        return (
          <div key={c.id} className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h4 className="font-semibold">{c.nombre}</h4>
                <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>
                  Procesados: {c.volumenProcesado.toLocaleString()}/{c.volumenTotal.toLocaleString()} • Por procesar: {porProcesar.toLocaleString()}
                </p>
              </div>
              <span className="text-lg font-bold" style={{ color: barColor }}>{convergencia}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div className="h-full rounded-full" style={{ width: `${convergencia}%`, background: barColor }} />
            </div>
            <div className="grid grid-cols-4 lg:grid-cols-7 gap-3 text-center text-xs">
              <div><p className="font-bold">{c.counters.creadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Creadas</p></div>
              <div><p className="font-bold">{c.counters.enviadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Enviadas</p></div>
              <div><p className="font-bold text-amber-500">{c.counters.descartadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Descartadas</p></div>
              <div><p className="font-bold text-green-600">{c.counters.entregadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Entregadas</p></div>
              <div><p className="font-bold text-red-500">{c.counters.rebotadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Rebotadas</p></div>
              <div><p className="font-bold">{c.counters.abiertas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Abiertas</p></div>
              <div><p className="font-bold">{c.counters.clickeadas.toLocaleString()}</p><p style={{ color: 'var(--color-neutral-muted)' }}>Clickeadas</p></div>
            </div>
          </div>
        )
      })}
      <p className="text-xs" style={{ color: 'var(--color-neutral-muted)' }}>
        DLQ general nd-campanas: <span className="font-medium text-red-500">8 mensajes</span>
      </p>
    </div>
  )
}
