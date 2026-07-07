# Worker con KEDA y Service Bus — Diseño e Implementación

## Objetivo

Probar un **worker** en Azure Container Apps que escale automáticamente con KEDA según la profundidad de una cola de Service Bus. El worker procesará mensajes con PeekLock y DLQ (Dead Letter Queue), simulando trabajo con tiempos aleatorios.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO DE PROCESAMIENTO                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Local: Enqueuer App]                                                      │
│       │                                                                     │
│       ├── Encola mensajes 1..1000 ──► Azure Service Bus Queue               │
│       │   (delay random 1-5s cada 10)     "weather-jobs"                    │
│       │                                                                     │
│                                           │                                 │
│  ┌────────────────────────────────────────┼─────────────────────────────┐   │
│  │  Container Apps Environment            │                             │   │
│  │                                        ▼                             │   │
│  │  KEDA scaler (azure-servicebus)                                      │   │
│  │    • messageCount: 5                                                 │   │
│  │    • Escala 1 replica por cada 5 msgs                                │   │
│  │    • Min: 0 → Max: 10                                                │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────┐                    │   │
│  │  │  Worker Container App (ca-weather-worker-dev)│                    │   │
│  │  │  .NET 10 Worker Service                      │                    │   │
│  │  │                                              │                    │   │
│  │  │  • ServiceBusProcessor (PeekLock)            │                    │   │
│  │  │  • AutoCompleteMessages = false              │                    │   │
│  │  │  • MaxConcurrentCalls = 5                    │                    │   │
│  │  │  • Simula trabajo: sleep 1-30s               │                    │   │
│  │  │  • Complete on success                       │                    │   │
│  │  │  • DeadLetter on failure (max 3 retries)     │                    │   │
│  │  │                                              │                    │   │
│  │  │  Auth: User Managed Identity                 │                    │   │
│  │  └──────────────────────────────────────────────┘                    │   │
│  │                                                                      │   │
│  │  App Insights ◄── OpenTelemetry traces/logs                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Dead Letter Queue ◄── Mensajes que fallan 3 veces                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Componentes

### 1. Worker (.NET 10 Worker Service)

| Aspecto | Detalle |
|---------|---------|
| Template | `dotnet new worker` |
| SDK | `Azure.Messaging.ServiceBus` |
| Auth | `Azure.Identity` → `DefaultAzureCredential` (usa Managed Identity en Azure, login local en dev) |
| Patron | `ServiceBusProcessor` con `PeekLock` |
| Concurrencia | `MaxConcurrentCalls = 5` |
| AutoComplete | `false` (control explícito de Complete/DeadLetter) |
| Simulación | `Task.Delay(Random.Shared.Next(1000, 30001))` |
| DLQ | Si el mensaje falla, se envía a Dead Letter con razón |
| Telemetría | `UseAzureMonitor()` (mismo patrón que WeatherApi) |
| Graceful shutdown | Respeta `CancellationToken` del host |

**Lógica del procesamiento:**
1. Recibe mensaje (PeekLock — el mensaje queda invisible para otros)
2. Log: "Procesando mensaje #{number}"
3. Simula trabajo: `await Task.Delay(random 1-30s)`
4. Si `DeliveryCount >= 3` → `DeadLetterMessageAsync` con razón "Max retries exceeded"
5. Si éxito → `CompleteMessageAsync`
6. Si excepción → No hacer nada (el lock expira y Service Bus re-entrega automáticamente)

### 2. Enqueuer (App .NET local)

| Aspecto | Detalle |
|---------|---------|
| Template | `dotnet new console` |
| SDK | `Azure.Messaging.ServiceBus` + `Azure.Identity` |
| Auth | `DefaultAzureCredential` (usa `az login` del desarrollador) |
| Lógica | Encola números 1 a 1000 en batches de 10, con delay random 1-5s entre batches |
| Mensajes | Body: `{ "number": N, "timestamp": "ISO8601" }` |

**Lógica de encolado:**
```
for i = 1 to 1000:
    enviar mensaje { number: i }
    if i % 10 == 0:
        await Task.Delay(random 1000-5000 ms)
        log "Enviados {i}/1000 — pausa {delay}ms"
```

### 3. Service Bus (Namespace + Queue)

| Aspecto | Detalle |
|---------|---------|
| SKU | Standard (soporta sessions, topics, DLQ) |
| Queue name | `weather-jobs` |
| Max delivery count | 3 (después va a DLQ) |
| Lock duration | 5 minutes (para cubrir el sleep máximo de 30s) |
| Dead lettering | Habilitado on message expiration |
| Message TTL | 24 horas |

### 4. KEDA Scale Rule

| Aspecto | Detalle |
|---------|---------|
| Scaler | `azure-servicebus` |
| `messageCount` | `5` (1 replica por cada 5 mensajes en la cola) |
| `queueName` | `weather-jobs` |
| `namespace` | `{service-bus-namespace}` |
| Min replicas | `0` (scale to zero cuando no hay mensajes) |
| Max replicas | `10` |
| Auth | User Managed Identity (sin secrets) |

### 5. User Managed Identity

| Aspecto | Detalle |
|---------|---------|
| Nombre | `id-weather-worker-dev` |
| Roles asignados | `Azure Service Bus Data Receiver` (en el namespace) |
| | `Azure Service Bus Data Sender` (en el namespace, para el enqueuer local no se usa MI) |
| Usado por | Worker Container App + KEDA scaler |

> **Ref docs:**
> - [Container Apps scale rules](https://learn.microsoft.com/azure/container-apps/scale-app)
> - [KEDA Azure Service Bus scaler](https://keda.sh/docs/latest/scalers/azure-service-bus/)
> - [Managed Identity en scale rules](https://learn.microsoft.com/azure/container-apps/managed-identity#scale-rules)
> - [Service Bus .NET SDK](https://learn.microsoft.com/dotnet/api/overview/azure/messaging.servicebus-readme)
> - [Prevent message loss (PeekLock best practices)](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-performance-improvements)

---

## Infraestructura Bicep

Se agrega al `main.bicep` existente con nuevos módulos:

### Nuevos módulos en `biceps/modules/`

| Módulo | Recursos |
|--------|----------|
| `service-bus.bicep` | Namespace (Standard) + Queue `weather-jobs` (DLQ, maxDeliveryCount:3, lockDuration:PT5M) |
| `managed-identity.bicep` | User Assigned Identity + role assignments (Service Bus Data Receiver/Sender) |
| `worker-container-app.bicep` | Container App (worker mode, no ingress) + KEDA rule + MI |

### Parámetros nuevos en `main.bicep`

```bicep
param deployWorker bool = true
param workerImageName string = 'weather-worker'
```

### Estructura Bicep del Worker Container App

```bicep
resource workerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-weather-worker-dev'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${managedIdentity.id}': {} }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      // Sin ingress — es un worker, no recibe HTTP
      registries: [{ server: acr.loginServer, identity: managedIdentity.id }]
    }
    template: {
      containers: [{
        name: 'worker'
        image: '${acr.loginServer}/weather-worker:latest'
        resources: { cpu: '0.5', memory: '1.0Gi' }
        env: [
          { name: 'ServiceBus__Namespace', value: '${serviceBusNamespace}.servicebus.windows.net' }
          { name: 'ServiceBus__QueueName', value: 'weather-jobs' }
          { name: 'AZURE_CLIENT_ID', value: managedIdentity.properties.clientId }
          { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        ]
      }]
      scale: {
        minReplicas: 0
        maxReplicas: 10
        rules: [{
          name: 'servicebus-queue-length'
          custom: {
            type: 'azure-servicebus'
            metadata: {
              queueName: 'weather-jobs'
              namespace: '${serviceBusNamespace}.servicebus.windows.net'
              messageCount: '5'
            }
            identity: managedIdentity.id
          }
        }]
      }
    }
  }
}
```

---

## Estructura de Archivos (nuevo)

```
src/
├── worker/
│   └── WeatherWorker/
│       ├── WeatherWorker.csproj
│       ├── Program.cs
│       ├── Worker.cs              ← ServiceBusProcessor
│       ├── Dockerfile
│       └── appsettings.json
├── tools/
│   └── ServiceBusEnqueuer/
│       ├── ServiceBusEnqueuer.csproj
│       └── Program.cs            ← Console app encolador
biceps/
├── modules/
│   ├── service-bus.bicep          ← NEW
│   ├── managed-identity.bicep     ← NEW
│   └── worker-container-app.bicep ← NEW
└── main.bicep                     ← Updated (agrega worker, SB, MI)
```

---

## Plan de Implementación

### Fase 1: Infraestructura (Bicep)

| # | Tarea | Dependencia |
|---|-------|-------------|
| 1.1 | Crear `biceps/modules/service-bus.bicep` — Namespace Standard + Queue con DLQ | — |
| 1.2 | Crear `biceps/modules/managed-identity.bicep` — User MI + role assignments | 1.1 |
| 1.3 | Crear `biceps/modules/worker-container-app.bicep` — Container App sin ingress + KEDA rule | 1.1, 1.2 |
| 1.4 | Actualizar `main.bicep` — integrar nuevos módulos | 1.1-1.3 |
| 1.5 | Validar deployment (`az deployment group what-if`) | 1.4 |

### Fase 2: Worker App (.NET 10)

| # | Tarea | Dependencia |
|---|-------|-------------|
| 2.1 | Scaffold proyecto (`dotnet new worker`) | — |
| 2.2 | Agregar paquetes: `Azure.Messaging.ServiceBus`, `Azure.Identity`, `Azure.Monitor.OpenTelemetry.AspNetCore` | 2.1 |
| 2.3 | Implementar `Worker.cs` con `ServiceBusProcessor` (PeekLock, DLQ, sleep random) | 2.2 |
| 2.4 | Configurar OpenTelemetry/App Insights | 2.3 |
| 2.5 | Crear `Dockerfile` | 2.1 |
| 2.6 | Test local con Service Bus real (`az login` + `DefaultAzureCredential`) | 2.3 |

### Fase 3: Enqueuer App (Console .NET)

| # | Tarea | Dependencia |
|---|-------|-------------|
| 3.1 | Scaffold proyecto (`dotnet new console`) | — |
| 3.2 | Implementar lógica de encolado (1-1000, batches de 10, delay random) | 3.1 |
| 3.3 | Test local enviando mensajes al Service Bus | Fase 1 deployada |

### Fase 4: Deploy y Validación E2E

| # | Tarea | Dependencia |
|---|-------|-------------|
| 4.1 | Deploy infraestructura con `main.bicep` | Fase 1 |
| 4.2 | Build y push imagen worker al ACR | Fase 2 |
| 4.3 | Update Container App con imagen | 4.1, 4.2 |
| 4.4 | Ejecutar enqueuer local → verificar que worker escala | 4.3 |
| 4.5 | Verificar en App Insights: traces, logs del worker | 4.4 |
| 4.6 | Verificar DLQ (forzar errores) | 4.4 |
| 4.7 | Verificar scale-to-zero después de vaciar la cola | 4.4 |

---

## Configuración Local (Development)

Para el worker en local:
```json
// appsettings.Development.json
{
  "ServiceBus": {
    "Namespace": "<nombre>.servicebus.windows.net",
    "QueueName": "weather-jobs"
  }
}
```

Auth: `DefaultAzureCredential` usa `az login` automáticamente.

Para el enqueuer:
```bash
cd src/tools/ServiceBusEnqueuer
dotnet run -- --namespace <nombre>.servicebus.windows.net --queue weather-jobs
```

---

## Notas de Best Practices (de docs Microsoft)

1. **PeekLock > ReceiveAndDelete**: Siempre usar PeekLock para procesamiento at-least-once
2. **AutoCompleteMessages = false**: Control explícito de Complete/Abandon/DeadLetter
3. **Lock duration > processing time**: Lock 5min > max sleep 30s
4. **MaxConcurrentCalls**: Ajustar según CPU. Con 0.5 vCPU → 5 concurrent es razonable
5. **Managed Identity > connection strings**: Sin secretos que roten
6. **KEDA identity auth**: El scaler usa la misma MI para consultar la profundidad de la cola
7. **Scale to zero**: El worker no consume recursos cuando no hay trabajo
8. **DLQ monitoring**: Crear alerta en App Insights si DLQ tiene mensajes
