export interface CounterData {
  creadas: number
  enviadas: number
  entregadas: number
  rebotadas: number
  abiertas: number
  clickeadas: number
  descartadas: number
}

export interface GenericoTipo {
  nombre: string
  canal: 'email' | 'sms'
  counters: CounterData
}

export interface LoteNegocio {
  id: string
  proceso: string
  generadoresDespertados: number
  generadoresTerminados: number
  counters: CounterData
}

export interface Campana {
  id: string
  nombre: string
  volumenTotal: number
  volumenProcesado: number
  counters: CounterData
}

export interface ColaStatus {
  nombre: string
  tipo: 'queue' | 'subscription'
  activos: number
  dlq: number
}

export interface WorkerStatus {
  nombre: string
  status: 'Running' | 'Stopped'
  replicas: number
  maxReplicas: number
}

export interface JobStatus {
  nombre: string
  cron: string
  proximaEjecucion: string
  ultimaEjecucion: string
  ultimoEstado: 'success' | 'error' | 'running'
  enabled: boolean
}

export interface ChangeFeedStatus {
  vertical: 'Genéricos' | 'Negocio' | 'Campañas'
  procesadosHoy: number
  erroresHoy: number
  ultimoProcesado: string
  lagEstimado: string
}

export interface DlqMessage {
  id: string
  cola: string
  deadLetterReason: string
  deadLetterErrorDescription: string
  deliveryCount: number
  enqueuedTime: string
  body: Record<string, unknown>
}

// --- Mock Data ---

export const genericosTipos: GenericoTipo[] = [
  { nombre: 'Recupero de clave', canal: 'email', counters: { creadas: 1240, enviadas: 1200, entregadas: 1150, rebotadas: 30, abiertas: 890, clickeadas: 420, descartadas: 40 } },
  { nombre: 'Validación de email', canal: 'email', counters: { creadas: 850, enviadas: 820, entregadas: 790, rebotadas: 15, abiertas: 600, clickeadas: 310, descartadas: 30 } },
  { nombre: 'Trámite', canal: 'email', counters: { creadas: 320, enviadas: 310, entregadas: 295, rebotadas: 8, abiertas: 180, clickeadas: 90, descartadas: 10 } },
  { nombre: 'Aviso genérico', canal: 'sms', counters: { creadas: 500, enviadas: 480, entregadas: 470, rebotadas: 5, abiertas: 0, clickeadas: 0, descartadas: 20 } },
]

export const lotesNegocio: LoteNegocio[] = [
  { id: 'lote-2026-08-11-aviso-deuda', proceso: 'Aviso de Deuda', generadoresDespertados: 10, generadoresTerminados: 10, counters: { creadas: 45000, enviadas: 44200, entregadas: 42800, rebotadas: 980, abiertas: 28000, clickeadas: 12000, descartadas: 800 } },
  { id: 'lote-2026-08-11-aviso-corte', proceso: 'Aviso de Corte', generadoresDespertados: 10, generadoresTerminados: 7, counters: { creadas: 12000, enviadas: 8500, entregadas: 7200, rebotadas: 150, abiertas: 0, clickeadas: 0, descartadas: 300 } },
  { id: 'lote-2026-08-11-vto-factura', proceso: 'Vto. Factura', generadoresDespertados: 10, generadoresTerminados: 10, counters: { creadas: 30000, enviadas: 29500, entregadas: 28900, rebotadas: 400, abiertas: 19000, clickeadas: 8500, descartadas: 500 } },
]

export const campanas: Campana[] = [
  { id: 'camp-factura-digital', nombre: 'Campaña Factura Digital 2026', volumenTotal: 150000, volumenProcesado: 120000, counters: { creadas: 150000, enviadas: 120000, entregadas: 115000, rebotadas: 3200, abiertas: 72000, clickeadas: 31000, descartadas: 5000 } },
  { id: 'camp-cobrabilidad', nombre: 'Campaña Cobrabilidad Julio', volumenTotal: 85000, volumenProcesado: 85000, counters: { creadas: 85000, enviadas: 84000, entregadas: 82000, rebotadas: 1500, abiertas: 55000, clickeadas: 22000, descartadas: 1000 } },
]

export const colas: ColaStatus[] = [
  { nombre: 'nd-genericos', tipo: 'queue', activos: 23, dlq: 3 },
  { nombre: 'nd-negocio-generadores', tipo: 'queue', activos: 0, dlq: 0 },
  { nombre: 'nd-negocio', tipo: 'queue', activos: 1580, dlq: 12 },
  { nombre: 'nd-campanas-generadores', tipo: 'queue', activos: 0, dlq: 0 },
  { nombre: 'nd-campanas', tipo: 'queue', activos: 4200, dlq: 0 },
  { nombre: 'nd-eventos-recoleccion', tipo: 'queue', activos: 45, dlq: 0 },
  { nombre: 'nd-dashboard-events/counter-updater', tipo: 'subscription', activos: 5, dlq: 1 },
  { nombre: 'nd-bloqueos/bloqueo-handler', tipo: 'subscription', activos: 0, dlq: 0 },
]

export const workers: WorkerStatus[] = [
  { nombre: 'Worker Genérico', status: 'Running', replicas: 3, maxReplicas: 50 },
  { nombre: 'Worker Generadores Negocio', status: 'Running', replicas: 0, maxReplicas: 10 },
  { nombre: 'Worker Negocio', status: 'Running', replicas: 8, maxReplicas: 30 },
  { nombre: 'Worker Generadores Campaña', status: 'Running', replicas: 0, maxReplicas: 10 },
  { nombre: 'Worker Campaña', status: 'Running', replicas: 12, maxReplicas: 30 },
  { nombre: 'Worker Eventos', status: 'Running', replicas: 2, maxReplicas: 6 },
  { nombre: 'Worker Bloqueos', status: 'Running', replicas: 1, maxReplicas: 2 },
  { nombre: 'Change Feed Genéricos', status: 'Running', replicas: 1, maxReplicas: 2 },
  { nombre: 'Change Feed Negocio', status: 'Running', replicas: 1, maxReplicas: 2 },
  { nombre: 'Change Feed Campañas', status: 'Running', replicas: 1, maxReplicas: 2 },
]

export const jobs: JobStatus[] = [
  { nombre: 'Aviso de Deuda', cron: '0 8 * * 1-5', proximaEjecucion: '2026-08-12 08:00', ultimaEjecucion: '2026-08-11 08:00', ultimoEstado: 'success', enabled: true },
  { nombre: 'Aviso de Corte', cron: '0 9 * * 1-5', proximaEjecucion: '2026-08-12 09:00', ultimaEjecucion: '2026-08-11 09:00', ultimoEstado: 'running', enabled: true },
  { nombre: 'Vto. Factura', cron: '0 7 * * *', proximaEjecucion: '2026-08-12 07:00', ultimaEjecucion: '2026-08-11 07:00', ultimoEstado: 'success', enabled: true },
  { nombre: 'Recolección Eventos Mailgun', cron: '*/5 * * * *', proximaEjecucion: '2026-08-11 13:25', ultimaEjecucion: '2026-08-11 13:20', ultimoEstado: 'success', enabled: true },
  { nombre: 'DLQ Monitor', cron: '*/1 * * * *', proximaEjecucion: '2026-08-11 13:21', ultimaEjecucion: '2026-08-11 13:20', ultimoEstado: 'success', enabled: true },
  { nombre: 'Cleanup Expirados', cron: '0 2 * * *', proximaEjecucion: '2026-08-12 02:00', ultimaEjecucion: '2026-08-11 02:00', ultimoEstado: 'error', enabled: false },
]

export const changeFeedStatus: ChangeFeedStatus[] = [
  { vertical: 'Genéricos', procesadosHoy: 12450, erroresHoy: 2, ultimoProcesado: 'hace 3s', lagEstimado: '~2s' },
  { vertical: 'Negocio', procesadosHoy: 87420, erroresHoy: 0, ultimoProcesado: 'hace 1s', lagEstimado: '~1s' },
  { vertical: 'Campañas', procesadosHoy: 203500, erroresHoy: 1, ultimoProcesado: 'hace 5s', lagEstimado: '~4s' },
]

export const dlqMessages: DlqMessage[] = [
  { id: 'dlq-1', cola: 'nd-genericos', deadLetterReason: 'MaxDeliveryCountExceeded', deadLetterErrorDescription: 'Receiver side - delivery count exceeded: 10', deliveryCount: 10, enqueuedTime: '2026-08-11T08:30:15Z', body: { comunicacionId: 'com-8f3a-4b2c-9d1e', tipoProceso: 'recupero-clave', canal: 'email', contacto: 'usuario@ejemplo.com', template: 'recupero-clave-v2', parametros: { nombre: 'Juan Pérez', token: 'abc123' } } },
  { id: 'dlq-2', cola: 'nd-negocio', deadLetterReason: 'ProcessingError', deadLetterErrorDescription: "Campo 'monto' es requerido para template aviso-deuda-v3", deliveryCount: 1, enqueuedTime: '2026-08-11T09:15:42Z', body: { comunicacionId: 'com-1a2b-3c4d-5e6f', tipoProceso: 'aviso-deuda', loteId: 'lote-2026-08-11-aviso-deuda', contacto: 'cliente@empresa.com', parametros: { monto: null, vencimiento: '2026-09-01' } } },
  { id: 'dlq-3', cola: 'nd-negocio', deadLetterReason: 'MaxDeliveryCountExceeded', deadLetterErrorDescription: 'Mailgun API timeout after 30s — HttpRequestException', deliveryCount: 10, enqueuedTime: '2026-08-11T10:02:08Z', body: { comunicacionId: 'com-7g8h-9i0j-1k2l', tipoProceso: 'vto-factura', loteId: 'lote-2026-08-11-vto-factura', canal: 'email', contacto: 'admin@corp.com', template: 'vto-factura-v1' } },
  { id: 'dlq-4', cola: 'nd-dashboard-events/counter-updater', deadLetterReason: 'ProcessingError', deadLetterErrorDescription: 'Unknown EventType: ComunicacionReenviada', deliveryCount: 1, enqueuedTime: '2026-08-11T11:45:00Z', body: { eventType: 'ComunicacionReenviada', loteId: 'lote-2026-08-11-aviso-deuda', timestamp: '2026-08-11T11:44:58Z' } },
  { id: 'dlq-5', cola: 'nd-eventos-recoleccion', deadLetterReason: 'MaxDeliveryCountExceeded', deadLetterErrorDescription: 'Mailgun API timeout — polling failed after 3 retries', deliveryCount: 10, enqueuedTime: '2026-08-11T09:05:22Z', body: { jobId: 'evt-poll-09', proveedor: 'mailgun', vertical: 'Negocio', hora: '09:00', timestamp: '2026-08-11T09:00:00Z' } },
  { id: 'dlq-6', cola: 'nd-eventos-recoleccion', deadLetterReason: 'ProcessingError', deadLetterErrorDescription: 'CosmosDB bulk update conflict — 409 Conflict on partition key', deliveryCount: 3, enqueuedTime: '2026-08-11T10:12:45Z', body: { jobId: 'evt-poll-10', proveedor: 'mailgun', vertical: 'Campañas', hora: '10:00', timestamp: '2026-08-11T10:00:00Z' } },
]
