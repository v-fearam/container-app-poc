# Arquitectura de Verticales — NDv2

## Visión General

NDv2 procesa tres verticales de comunicaciones digitales: **Campaña**, **Genéricos** y **Negocio**. Cada vertical tiene aislamiento completo en almacenamiento y procesamiento, compartiendo solo la infraestructura base de Azure.

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cosmos DB Account (NoSQL)                        │
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│  │  comunicaciones-     │  │  comunicaciones-     │  │  comunicaciones-│ │
│  │  campana             │  │  genericos           │  │  negocio        │ │
│  │  TTL: 45 días        │  │  TTL: 45 días        │  │  TTL: 45 días   │ │
│  └────────┬─────────────┘  └────────┬─────────────┘  └───────┬────────┘ │
└───────────┼─────────────────────────┼────────────────────────┼──────────┘
            │ Change Feed             │ Change Feed             │ Change Feed
            ▼                         ▼                         ▼
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────────┐
│  Container App    │  │  Container App    │  │  Container App            │
│  cfp-campana      │  │  cfp-genericos    │  │  cfp-negocio              │
│  replicas: 1..N   │  │  replicas: 1..N   │  │  replicas: 1..N          │
│  leases-campana   │  │  leases-genericos │  │  leases-negocio          │
└────────┬──────────┘  └────────┬──────────┘  └──────────┬────────────────┘
         │ SP upsert            │ SP upsert               │ SP upsert
         ▼                      ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SQL Server (Azure SQL)                         │
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│  │  db-campana          │  │  db-genericos        │  │  db-negocio     │ │
│  │  ⭐ Modelo Estrella  │  │  ⭐ Modelo Estrella  │  │  ⭐ Modelo      │ │
│  │  Particionado x año  │  │  Particionado x año  │  │  Estrella       │ │
│  │  Retención: 4 años   │  │  Retención: 4 años   │  │  Retención:    │ │
│  │                      │  │                      │  │  4 años         │ │
│  └──────────────────────┘  └──────────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Principio: Mismo Código, Distinta Configuración

Las tres verticales comparten **código idéntico**. La diferenciación es solo por configuración:

| Parámetro | Campaña | Genéricos | Negocio |
|-----------|---------|-----------|---------|
| `COSMOS_COLLECTION` | `comunicaciones-campana` | `comunicaciones-genericos` | `comunicaciones-negocio` |
| `COSMOS_LEASE_CONTAINER` | `leases-campana` | `leases-genericos` | `leases-negocio` |
| `PROCESSOR_NAME` | `cfp-campana` | `cfp-genericos` | `cfp-negocio` |
| `SQL_DATABASE` | `db-campana` | `db-genericos` | `db-negocio` |
| Connection string SQL | `Initial Catalog=db-campana` | `Initial Catalog=db-genericos` | `Initial Catalog=db-negocio` |

## Infraestructura Compartida vs Aislada

### Compartida (1 instancia)
- **Cosmos DB Account** — 1 cuenta, 3 collections (+ 3 lease containers)
- **SQL Server** — 1 servidor, 3 databases
- **Container Apps Environment** — red compartida, observabilidad centralizada
- **Key Vault** — secrets compartidos (connection strings, auth)
- **App Insights + Log Analytics** — telemetría centralizada
- **ACR** — misma imagen Docker para los 3 workers

### Aislada (por vertical)
- **Cosmos Collection** — datos completamente separados
- **SQL Database** — modelo estrella independiente (DDL + SPs idénticos)
- **Change Feed Processor** — worker independiente con sus propios leases
- **Container App** — escalado independiente (`maxReplicas` según volumen)
- **Managed Identity** — (opcional) identidad separada por vertical

## Escalado por Vertical

Cada worker escala independientemente según el volumen de su vertical:

| Vertical | Volumen esperado | maxReplicas | Justificación |
|----------|-----------------|-------------|---------------|
| Campaña | Alto (envíos masivos, picos) | 4-8 | Picos de campaña con miles de envíos simultáneos |
| Genéricos | Medio (constante) | 2-4 | Flujo steady de notificaciones operacionales |
| Negocio | Bajo-medio | 2 | Comunicaciones 1-a-1, volumen predecible |

> **Nota:** `maxReplicas` debería ser ≤ número de particiones físicas de cada collection en Cosmos. Si una collection tiene 4 particiones, más de 4 workers no aporta (quedan idle).

## SQL: Mismo Schema, Distinta Database

Cada database tiene exactamente el mismo schema:

```
db-campana/
├── Partition Function:  pf_Anual (2024-2028)
├── Partition Scheme:    ps_Anual
├── DimTipos, DimCanales, DimContactos, DimEstadio, DimFechas
├── FactComunicacionesGenericas (particionada)
├── FactEventos (particionada)
├── vw_ComunicacionesConDims (View)
├── usp_UpsertComunicacionGenerica (SP)
└── usp_DepurarAniosViejos (SP)
```

### Ventajas de DB separadas
- **Purga independiente** — campaña puede retener 2 años, genéricos 4
- **Backup/restore** — restaurar una vertical sin afectar las otras
- **Permisos SQL** — equipo de campaña solo accede a `db-campana`
- **Sin DimVertical** — la separación es física, no lógica (más simple, más rápido)
- **Tamaño manejable** — cada DB crece según su volumen

## Deploy con Bicep

El módulo `changefeed-worker-container-app.bicep` ya está parametrizado para esto:

```bicep
// main.bicep — invocado 3 veces

module workerCampana 'modules/changefeed-worker-container-app.bicep' = {
  params: {
    cosmosCollection: 'comunicaciones-campana'
    processorName: 'cfp-campana'
    verticalName: 'campana'
    maxReplicas: 4
    // ... resto de params compartidos
  }
}

module workerGenericos 'modules/changefeed-worker-container-app.bicep' = {
  params: {
    cosmosCollection: 'comunicaciones-genericos'
    processorName: 'cfp-genericos'
    verticalName: 'genericos'
    maxReplicas: 2
    // ...
  }
}

module workerNegocio 'modules/changefeed-worker-container-app.bicep' = {
  params: {
    cosmosCollection: 'comunicaciones-negocio'
    processorName: 'cfp-negocio'
    verticalName: 'negocio'
    maxReplicas: 2
    // ...
  }
}
```

## Change Feed Processor y Leases

Cada vertical tiene su **lease container** separado en Cosmos DB. El Change Feed Processor usa este container para coordinar qué particiones procesa cada instancia del worker.

```
Cosmos DB Account
├── comunicaciones-campana      (datos)
├── leases-campana              (coordination)
├── comunicaciones-genericos    (datos)
├── leases-genericos            (coordination)
├── comunicaciones-negocio      (datos)
└── leases-negocio              (coordination)
```

**Lease distribution:** Si `cfp-campana` tiene `maxReplicas=4` y la collection tiene 8 particiones, cada réplica procesa ~2 particiones. Si una réplica cae, las otras absorben sus leases automáticamente (rebalanceo en ~30 segundos).

## Concurrencia y Consistencia

El modelo está diseñado para procesamiento concurrente seguro:

1. **Change Feed por partición** — Cosmos garantiza orden dentro de la misma partition key (`id`). Cambios al mismo documento se procesan en orden.
2. **INSERT TRY/CATCH en dimensiones** — Si dos workers insertan "email" en DimCanales simultáneamente, el segundo ignora la violación de unique constraint. Sin deadlocks.
3. **MERGE idempotente en hechos** — `WHEN MATCHED AND @fechaUltimaModif >= target.fechaUltimaModif` asegura que solo la versión más reciente persiste.
4. **Transacción explícita** — Cada SP ejecuta en una transacción: o todos los cambios se aplican o ninguno.

## Relación POC → Producción

| Aspecto | POC | Producción |
|---------|-----|------------|
| Cosmos collections | 1 (`comunicaciones`) | 3 (una por vertical) |
| SQL databases | 1 (`dashboard-poc`) | 3 (una por vertical) |
| Workers | 1 (`maxReplicas=2`) | 3 (escalado independiente) |
| Particionado SQL | Diario (366 particiones) | Anual (5 particiones: 2024-2028) |
| Retención SQL | 4 días | 4 años |
| TTL Cosmos | 45 días | 45 días |
| SP / DDL | 1 copia | 3 copias idénticas |
| Código worker | 1 imagen Docker | 1 imagen Docker (misma para los 3) |
| Bicep | 1 módulo invocado 1 vez | 1 módulo invocado 3 veces |

> **El POC valida el patrón completo.** Escalar a 3 verticales es solo configuración — no requiere cambios de código.
