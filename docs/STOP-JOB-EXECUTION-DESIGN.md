# Detener Container Job Execution desde la UI

## Resumen

**Problema:** Un Container App Job se disparó (manual o CRON) y me doy cuenta de que está mal configurado. Quiero pararlo desde la UI sin ir al Portal.

**Respuesta: Sí, se puede.** Azure tiene la API `Jobs_StopExecution` que termina una ejecución running.

---

## API de Azure

### REST API

```
POST /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.App/jobs/{jobName}/executions/{jobExecutionName}/stop?api-version=2024-03-01
```

- **Operation Id:** `Jobs_StopExecution`
- **Respuesta:** 200 (stopped) o 202 (accepted, long-running)
- **Prerequisito:** La ejecución debe estar en estado `Running`

### .NET SDK (`Azure.ResourceManager.AppContainers` v1.5.0+)

```csharp
// Obtener la ejecución
ContainerAppJobExecutionResource execution = await job.GetContainerAppJobExecutionAsync(executionName, ct);

// Parar (async, fire-and-forget style)
await execution.StopExecutionJobAsync(WaitUntil.Started, ct);

// Parar (esperar a que complete)
await execution.StopExecutionJobAsync(WaitUntil.Completed, ct);
```

### Listar ejecuciones (para encontrar cuál parar)

```csharp
var executions = job.GetContainerAppJobExecutions().GetAllAsync(filter: "status eq 'Running'", cancellationToken: ct);

await foreach (var exec in executions)
{
    // exec.Data.Name → executionName
    // exec.Data.Status → Running | Succeeded | Failed
    // exec.Data.StartOn → cuándo arrancó
}
```

### CLI equivalente

```bash
# Listar ejecuciones
az containerapp job execution list --name ca-weather-enqueuer-dev --resource-group $RG -o table

# Parar una ejecución específica
az containerapp job stop --name ca-weather-enqueuer-dev --resource-group $RG --job-execution-name <execution-name>
```

---

## Referencias

| Recurso | URL |
|---------|-----|
| `az containerapp job stop` | https://learn.microsoft.com/cli/azure/containerapp/job?view=azure-cli-latest |
| .NET SDK `StopExecutionJobAsync` | https://learn.microsoft.com/dotnet/api/azure.resourcemanager.appcontainers.containerappjobexecutionresource.stopexecutionjobasync |
| .NET SDK `GetContainerAppJobExecutions` | https://learn.microsoft.com/dotnet/api/azure.resourcemanager.appcontainers.containerappjobresource.getcontainerappjobexecutions |
| PowerShell `Stop-AzContainerAppJobExecution` | https://learn.microsoft.com/powershell/module/az.app/stop-azcontainerappjobexecution |
| Container Apps Jobs overview | https://learn.microsoft.com/azure/container-apps/jobs |
| NuGet package | `Azure.ResourceManager.AppContainers` v1.5.0 (estable) |

---

## Contexto actual del proyecto

### Backend (lo que ya tenemos)
- `JobsController.cs` usa `ArmClient` + `Azure.ResourceManager.AppContainers`
- Endpoints existentes:
  - `GET /api/jobs` — lista todos los jobs
  - `GET /api/jobs/{jobName}` — detalle de un job + última ejecución
  - `PATCH /api/jobs/{jobName}/schedule` — actualizar CRON
  - `POST /api/jobs/{jobName}/trigger` — disparar ejecución manual

### Frontend (lo que ya tenemos)
- `SchedulerPage.tsx` — tabla de jobs con edición de CRON y botón "Ejecutar Ahora"
- `useJobsApi.ts` — hook con `listJobs`, `triggerJob`, `getJobExecutions`

### Identity/RBAC
- Backend identity (`uami-ca-weather-be-dev`) ya tiene **Contributor** en el RG
- Contributor permite `Microsoft.App/jobs/executions/*/stop` → no necesita rol adicional

---

## Plan de implementación

### 1. Backend — Nuevo endpoint (JobsController.cs)

Agregar dos endpoints:

```csharp
/// Lista ejecuciones de un job (opcionalmente filtradas por status)
[HttpGet("{jobName}/executions")]
public async Task<IActionResult> ListExecutions(string jobName, [FromQuery] string? status, CancellationToken ct)

/// Detiene una ejecución running
[HttpPost("{jobName}/executions/{executionName}/stop")]
public async Task<IActionResult> StopExecution(string jobName, string executionName, CancellationToken ct)
```

**ListExecutions:**
- `GET /api/jobs/{jobName}/executions?status=Running`
- Usa `job.GetContainerAppJobExecutions().GetAllAsync()`
- Si `status` param presente, filtra client-side (o usa `filter` si la API lo soporta)
- Retorna: `[{ name, status, startTime, endTime }]`

**StopExecution:**
- `POST /api/jobs/{jobName}/executions/{executionName}/stop`
- Usa `execution.StopExecutionJobAsync(WaitUntil.Started)` (fire-and-forget, no bloquear)
- Retorna: `{ name, executionName, status: "Stopping" }`
- Si la ejecución no está Running: retorna 400 "Execution is not running"

### 2. Frontend — Modelo/DTO nuevo

```typescript
interface JobExecution {
  name: string;
  status: 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
  startTime: string;   // ISO
  endTime?: string;    // ISO (null si running)
}
```

### 3. Frontend — Hook (useJobsApi.ts)

Agregar:
```typescript
const listExecutions = async (jobName: string, status?: string): Promise<JobExecution[]>
const stopExecution = async (jobName: string, executionName: string): Promise<void>
```

### 4. Frontend — UI (SchedulerPage.tsx)

**Opción UX:** Cuando el job tiene una ejecución `Running`, mostrar un botón 🛑 **"Detener"** al lado del ▶️ "Ejecutar Ahora". Comportamiento:

1. Al tocar "Detener": confirm dialog "¿Detener ejecución {name}?"
2. Si confirma → `POST /api/jobs/{jobName}/executions/{executionName}/stop`
3. Refrescar estado → badge cambia de "Running" a "Stopped/Failed"
4. Si no hay ejecución running → botón disabled

**Alternativa avanzada (si hay muchas ejecuciones):** Expandir row para ver lista de ejecuciones con botón stop individual. Para la POC con 1-2 jobs, el approach simple (parar la última running) es suficiente.

---

## Orden de implementación

| # | Tarea | Archivos |
|---|-------|----------|
| 1 | Agregar DTOs `JobExecutionDto`, `StopExecutionResponse` | `Models/ContainerJobDto.cs` |
| 2 | Agregar endpoints `ListExecutions` y `StopExecution` | `Controllers/JobsController.cs` |
| 3 | Agregar `listExecutions` y `stopExecution` al hook | `hooks/useJobsApi.ts` |
| 4 | Mostrar status badge + botón Detener en UI | `pages/SchedulerPage.tsx` |
| 5 | Build + deploy backend y frontend | ACR + Container Apps |

**Estimación:** ~1 hora de implementación (la infraestructura ya está, es puro CRUD sobre ARM SDK existente).

---

## Cambios en el Job (WeatherEnqueuer) — Graceful Stop + Simulación de negocio

### Problema actual

`Program.cs` pasa `CancellationToken.None` al servicio. Cuando Azure envía STOP (SIGTERM), el host se quiere apagar pero `EnqueuerService` no se entera → sigue mandando mensajes hasta el timeout (300s) → SIGKILL.

### Cambios necesarios

#### Program.cs — Wiring del CancellationToken

```csharp
// HOY (mal):
await enqueuerService.ExecuteAsync(CancellationToken.None);

// CORRECTO — usar el token del host que se cancela con SIGTERM:
var lifetime = scope.ServiceProvider.GetRequiredService<IHostApplicationLifetime>();
await enqueuerService.ExecuteAsync(lifetime.ApplicationStopping);
```

#### Program.cs — Distinguir cancelación de error

```csharp
try
{
    await enqueuerService.ExecuteAsync(lifetime.ApplicationStopping);
    // ... exit 0
}
catch (OperationCanceledException)
{
    logger.LogWarning("Job stopped externally (SIGTERM). Partial execution.");
    Environment.Exit(0);  // Graceful stop, NO es un error
}
catch (Exception ex)
{
    // ... exit 1 (error real)
}
```

#### EnqueuerService.cs — Cambios funcionales

1. **MESSAGE_COUNT default: 1000** (en lugar de 50) — para que tarde y se pueda probar el stop
2. **Sleep random 1-10s cada 10 mensajes** — simula procesamiento lento de negocio
3. **Vertical: "Negocio"** (en lugar de "Vertical1")
4. **ProcessTypes: "Aviso de Deuda" / "Aviso de Corte"** (en lugar de "weather1" / "weather2")
5. **JobExecuted event en `finally`** con count parcial — si se para a mitad, el dashboard no pierde tracking

```csharp
// Defaults de negocio
var messageCount = int.Parse(configuration["MESSAGE_COUNT"] ?? "1000");
var vertical = configuration["VERTICAL"] ?? "Negocio";

// Process types de negocio
var processType = Random.Shared.Next(0, 2) == 0 ? "Aviso de Deuda" : "Aviso de Corte";

// Cada 10 mensajes: dormir entre 1 y 10 segundos (simula batch lento)
if (i % 10 == 0)
{
    var delay = Random.Shared.Next(1000, 10001); // 1-10s
    logger.LogInformation("Batch pause: sleeping {Delay}ms...", delay);
    await Task.Delay(delay, cancellationToken);
}
```

#### Bicep (main.bicep) — Actualizar default

```bicep
param jobMessageCount string = '1000'  // era '50'
```

### Flujo después de los cambios

```
Azure Stop API → SIGTERM → Host.ApplicationStopping se cancela
                              ↓
                     Task.Delay o ThrowIfCancellationRequested
                              ↓
                     OperationCanceledException
                              ↓
                     finally: publica JobExecuted (parcial: sent=N de 1000)
                              ↓
                     Program.cs catch: exit 0 (graceful)
                              ↓
                     Container termina limpiamente en <1 segundo
```

### Resumen de archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `src/jobs/WeatherEnqueuer/Program.cs` | `lifetime.ApplicationStopping` + catch `OperationCanceledException` |
| `src/jobs/WeatherEnqueuer/Services/EnqueuerService.cs` | 1000 msgs, sleep cada 10, vertical "Negocio", processTypes de negocio, JobExecuted en finally |
| `biceps/main.bicep` | `jobMessageCount` default: `'1000'` |

---

## Consideraciones

1. **Latencia:** `StopExecutionJob` es un long-running operation. Con `WaitUntil.Started` retorna inmediato (202) pero el pod puede tardar ~5-10s en terminar.
2. **Graceful shutdown:** Azure envía SIGTERM al container. Si el job tiene `CancellationToken` wired, puede hacer cleanup. Nuestro `EnqueuerService` usa `stoppingToken` → debería hacer graceful stop.
3. **Status después de stop:** La ejecución queda como `Failed` (no hay status "Stopped" explícito en la API). El `DetailedStatus` puede decir "Terminated".
4. **Concurrencia:** Si el job termina naturalmente mientras mandamos el stop, la API retorna 409 Conflict o simplemente succeeds. Manejar ambos como éxito.
5. **RBAC:** El backend ya tiene Contributor → no se necesita nada adicional.

---

## Migrar InfrastructureHealthService de REST API a SDK

### Situación actual

`InfrastructureHealthService.cs` usa **REST API directo** (`HttpClient` + bearer token manual + `JsonDocument.Parse`) para consultar Container Apps y Jobs. Mientras tanto, `JobsController.cs` ya usa el **SDK** (`ArmClient` + `Azure.ResourceManager.AppContainers`) para las mismas operaciones.

**Duplicación de approach:** Dos formas de hablar con ARM en el mismo backend.

### Qué usa REST API hoy (y NO debería)

| Método | Qué hace | REST URL | Equivalente SDK |
|--------|----------|----------|-----------------|
| `GetContainerAppsStatusAsync` | Lista apps + status | `GET .../Microsoft.App/containerApps` | `rg.GetContainerApps().GetAllAsync()` |
| `GetReplicaCountAsync` | Cuenta réplicas de una revisión | `GET .../revisions/{rev}/replicas` | `revision.GetContainerAppReplicas().GetAllAsync()` |
| `GetContainerAppJobsStatusAsync` | Lista jobs + config | `GET .../Microsoft.App/jobs` | `rg.GetContainerAppJobs().GetAllAsync()` |
| `GetRunningExecutionsCountAsync` | Cuenta ejecuciones running | `GET .../jobs/{name}/executions` | `job.GetContainerAppJobExecutions().GetAllAsync()` |
| `GetLastExecutionInfoAsync` | Info última ejecución | `GET .../jobs/{name}/executions` | (mismo que arriba, tomar primera) |

### Qué NO se migra (ya está bien)

| Método | Qué usa | Por qué está bien |
|--------|---------|-------------------|
| `GetServiceBusStatusAsync` | `ServiceBusAdministrationClient` | SDK propio de Service Bus (no ARM) ✅ |

### Diseño de la migración

**Cambios en constructor:**

```csharp
// ANTES:
public class InfrastructureHealthService(
    IHttpClientFactory httpClientFactory,   // ← ELIMINAR
    TokenCredential credential,             // ← ELIMINAR
    IMemoryCache cache,
    IConfiguration configuration,
    ServiceBusAdministrationClient? sbAdminClient,
    ILogger<InfrastructureHealthService> logger)

// DESPUÉS:
public class InfrastructureHealthService(
    ArmClient armClient,                    // ← REEMPLAZA HttpClient + TokenCredential
    IMemoryCache cache,
    IConfiguration configuration,
    ServiceBusAdministrationClient? sbAdminClient,
    ILogger<InfrastructureHealthService> logger)
```

**Cambios en Program.cs (DI):**

```csharp
// ANTES:
builder.Services.AddHttpClient("arm");  // ← ELIMINAR
builder.Services.AddSingleton<IInfrastructureHealthService>(sp =>
    new InfrastructureHealthService(
        sp.GetRequiredService<IHttpClientFactory>(),  // ← ELIMINAR
        sp.GetRequiredService<TokenCredential>(),     // ← ELIMINAR
        ...));

// DESPUÉS:
builder.Services.AddSingleton<IInfrastructureHealthService>(sp =>
    new InfrastructureHealthService(
        sp.GetRequiredService<ArmClient>(),  // ← Ya registrado arriba
        ...));
```

**Ejemplo de refactor de un método:**

```csharp
// ANTES (REST API manual):
private async Task<List<ContainerAppStatusDto>> GetContainerAppsStatusAsync(CancellationToken ct)
{
    var token = await credential.GetTokenAsync(...);
    var client = httpClientFactory.CreateClient("arm");
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
    var listUrl = $"https://management.azure.com/subscriptions/{subscriptionId}/.../containerApps?api-version=...";
    var listResponse = await client.GetAsync(listUrl, ct);
    var json = await listResponse.Content.ReadAsStringAsync(ct);
    var doc = JsonDocument.Parse(json);
    // ... parseo manual de JSON
}

// DESPUÉS (SDK):
private async Task<List<ContainerAppStatusDto>> GetContainerAppsStatusAsync(CancellationToken ct)
{
    var subscription = armClient.GetSubscriptionResource(new ResourceIdentifier($"/subscriptions/{subscriptionId}"));
    var rg = await subscription.GetResourceGroupAsync(resourceGroup, ct);

    var apps = new List<ContainerAppStatusDto>();
    await foreach (var app in rg.Value.GetContainerApps().GetAllAsync(cancellationToken: ct))
    {
        var data = app.Data;
        var replicas = 0;

        // Réplicas via SDK
        if (data.LatestRevisionName is not null)
        {
            var revision = await app.GetContainerAppRevisionAsync(data.LatestRevisionName, ct);
            replicas = await revision.Value.GetContainerAppReplicas().GetAllAsync(ct).CountAsync(ct);
        }

        apps.Add(new ContainerAppStatusDto
        {
            Name = data.Name,
            Status = replicas > 0 ? "Running" : "Scaled to zero",
            ActiveReplicas = replicas,
            MaxReplicas = data.Template?.Scale?.MaxReplicas ?? 1,
            LatestRevision = data.LatestRevisionName
        });
    }
    return apps;
}
```

### Beneficios de migrar

1. **Consistencia:** todo ARM usa SDK, un solo patrón
2. **Menos código:** SDK maneja auth, retries, paginación, deserialización
3. **Type safety:** propiedades tipadas vs. `JsonDocument.Parse` + `GetProperty` manual
4. **Menos DI:** eliminar `IHttpClientFactory` + `TokenCredential` del constructor (ya no se necesitan para ARM)
5. **Mantenimiento:** si la API version cambia, solo actualizar el NuGet package

### Archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `Services/InfrastructureHealthService.cs` | Reescribir 5 métodos ARM de REST a SDK |
| `Program.cs` | Eliminar `AddHttpClient("arm")`, simplificar DI del servicio |

### Orden en el esfuerzo total

Hacer **después** de implementar Stop Job (tareas 1-5), como tarea 6:

| # | Tarea | Archivos |
|---|-------|----------|
| 1 | DTOs `JobExecutionDto`, `StopExecutionResponse` | `Models/ContainerJobDto.cs` |
| 2 | Endpoints `ListExecutions` y `StopExecution` | `Controllers/JobsController.cs` |
| 3 | `listExecutions` y `stopExecution` en hook | `hooks/useJobsApi.ts` |
| 4 | Botón 🛑 "Detener" en UI | `pages/SchedulerPage.tsx` |
| 5 | Graceful stop en Job + simulación negocio | `WeatherEnqueuer/Program.cs` + `EnqueuerService.cs` + `main.bicep` |
| 6 | Migrar InfrastructureHealthService a SDK | `Services/InfrastructureHealthService.cs` + `Program.cs` |
| 7 | Build + deploy backend + frontend + job | ACR → Container Apps |

