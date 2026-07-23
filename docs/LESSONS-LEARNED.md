# Lecciones Aprendidas — Tecnologías Probadas en Container App POC

**Propósito:** Documentar decisiones técnicas, gotchas, y patterns probados para replicar en implementaciones productivas.

**Fecha última actualización:** 2026-07-23

---

## Índice

- [Cosmos DB](#cosmos-db)
- [Azure SQL Database](#azure-sql-database)
- [Service Bus](#service-bus)
- [Azure Container Apps](#azure-container-apps)
- [Container Jobs](#container-jobs)
- [Easy Auth (Entra ID)](#easy-auth-entra-id)
- [KEDA Scaling](#keda-scaling)
- [Managed Identity y RBAC](#managed-identity-y-rbac)
- [Key Vault](#key-vault)
- [Change Feed Processor](#change-feed-processor)
- [Application Insights & OpenTelemetry](#application-insights--opentelemetry)
- [.NET 10 Patterns](#net-10-patterns)
- [Frontend (React + shadcn/ui)](#frontend-react--shadcnui)
- [Bicep IaC](#bicep-iac)

---

## Cosmos DB

### 1. **Campos custom de timestamp NO se actualizan automáticamente**

**Problema:** Cosmos DB SDK **NO** actualiza automáticamente campos custom como `updatedAt` al hacer `ReplaceItemAsync` o `CreateItemAsync`.

**Solución:**
```csharp
// CRITICAL: Siempre setear UpdatedAt manualmente en create/update
var persona = new PersonaDto
{
    Id = Guid.NewGuid().ToString(),
    Nombre = "Juan",
    UpdatedAt = DateTime.UtcNow,  // ← MANUAL, no automático
};
await container.CreateItemAsync(persona, new PartitionKey(persona.Id));

// En updates también
existing.UpdatedAt = DateTime.UtcNow;  // ← MANUAL
await container.ReplaceItemAsync(existing, id, new PartitionKey(id));
```

**Impacto:** Si no seteás `updatedAt` manualmente, el Change Feed Processor puede ignorar cambios (si usás comparación de timestamps para idempotencia).

**Referencias:**
- Ver `src/backend/WeatherApi/Controllers/CosmosPersonasController.cs` líneas 131 y 183
- Ver `src/worker/ChangeFeedWorker/Services/ChangeFeedHandler.cs` línea 83 (condición `>=` para permitir timestamps iguales)

---

### 2. **JSON serialization: PascalCase vs camelCase**

**Problema:** Cosmos DB espera lowercase (`id`, `nombre`) pero C# usa PascalCase por defecto.

**Solución obligatoria:**
1. Agregar `[JsonPropertyName("id")]` a TODOS los DTOs que se guardan en Cosmos:
   ```csharp
   public class PersonaDto
   {
       [JsonPropertyName("id")]
       public string? Id { get; set; }
       
       [JsonPropertyName("nombre")]
       public string Nombre { get; set; } = string.Empty;
   }
   ```

2. Configurar `CosmosSerializationOptions` en Program.cs:
   ```csharp
   builder.Services.AddSingleton<CosmosClient>(sp =>
   {
       var credential = new DefaultAzureCredential();
       var options = new CosmosClientOptions
       {
           SerializerOptions = new CosmosSerializationOptions
           {
               PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase
           }
       };
       return new CosmosClient(endpoint, credential, options);
   });
   ```

**Sin esto:** Error `"required properties 'id;' are missing"` al guardar documentos.

---

### 3. **TTL (Time-To-Live) para expiración automática**

**Pattern probado:** Documentos en container `personas` expiran automáticamente después de 45 días (TTL default).

```csharp
public class PersonaDto
{
    [JsonPropertyName("ttl")]
    public int? Ttl { get; set; }  // null = usa default (45 días), -1 = never expires
}
```

**Configuración en Bicep:**
```bicep
resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: 'personas'
  properties: {
    resource: {
      id: 'personas'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
      defaultTtl: 3888000  // 45 días en segundos
    }
  }
}
```

**Impacto:** Los documentos se eliminan automáticamente sin necesidad de jobs de limpieza. Útil para datos temporales (auditoría, cache, eventos).

---

### 4. **Change Feed NO captura deletes**

**Limitación:** Cuando usás `ChangeFeedMode.LatestVersion`, el Change Feed **NO** captura borrados (deletes).

**Alternativas:**
- Usar `ChangeFeedMode.AllVersionsAndDeletes` (requiere continuous backup mode)
- Implementar soft-delete (campo `deleted: true` en el documento)
- El TTL expira documentos pero **NO** genera eventos en Change Feed

**Pattern usado en POC:** Soft-delete + `Activo` boolean field.

---

## Azure SQL Database

### 5. **Managed Identity requiere CREATE USER manual**

**Problema:** Bicep asigna roles RBAC en Azure, pero **NO** puede crear usuarios SQL dentro de la database.

**Solución manual (una vez, después del deploy):**
```sql
-- Conectarse a la database (NO al master) como SQL Admin
CREATE USER [uami-ca-weather-be-dev] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [uami-ca-weather-be-dev];
ALTER ROLE db_datawriter ADD MEMBER [uami-ca-weather-be-dev];

CREATE USER [id-weather-worker-dev] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [id-weather-worker-dev];
ALTER ROLE db_datawriter ADD MEMBER [id-weather-worker-dev];
```

**Connection string con MI:**
```
Server=tcp:sql-weather-dash-7446.database.windows.net,1433;
Database=dashboard-poc;
Authentication=Active Directory Default;
Encrypt=True;
```

**Gotcha:** Sin el `CREATE USER`, el backend/worker falla con `"Login failed for user '<token-identified principal>'"`.

---

### 6. **Location mismatch en deploys**

**Problema:** Si el SQL Server ya existe en `centralus` y el RG está en `eastus2`, el deploy de Bicep falla con:
```
"resource already exists in location centralus... cannot be created in location eastus2"
```

**Solución:** Usar parámetro separado `sqlLocation` en Bicep:
```bicep
param location string = 'eastus2'  // RG y Container Apps
param sqlLocation string = 'centralus'  // SQL Server

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: sqlLocation  // ← NO usar location
  // ...
}
```

---

## Service Bus

### 7. **Queue/Topic names con typos en producción**

**Gotcha:** El ambiente actual usa `nd-dashboard-events` (topic) con typo "nd-" en lugar de `dashboard-events`. El código debe matchear exactamente.

**Lección:** Validar nombres en Bicep antes de crear recursos. Cambiar nombres requiere recrear recursos y actualizar todos los consumers.

```bicep
// Bicep actual (con typo)
param dashboardTopicName string = 'nd-dashboard-events'  // ← typo "nd-"
param weatherQueueName string = 'weather-jobs'  // ← NO "weather-queue"
```

---

### 8. **Managed Identity + AddServiceBusClient**

**Problema:** Usar `AddServiceBusClient(connectionString)` con Managed Identity falla aunque agregues `.WithCredential()`.

**Solución:** Usar `AddClient<ServiceBusClient>` con constructor explícito:

```csharp
// ❌ NO funciona con MI
services.AddServiceBusClient(connectionString).WithCredential(new DefaultAzureCredential());

// ✅ Funciona con MI
services.AddSingleton<ServiceBusClient>(sp =>
{
    var credential = new DefaultAzureCredential();
    var sbNamespace = configuration["ServiceBus__Namespace"];
    return new ServiceBusClient(sbNamespace, credential);
});
```

**Referencias:** Ver `src/jobs/WeatherEnqueuer/Program.cs`

---

### 9. **PeekLock + Dead Letter Queue**

**Pattern probado:** Workers usan `PeekLock` mode con Dead Letter Queue para manejo de errores.

```csharp
var processor = client.CreateProcessor(queueName, new ServiceBusProcessorOptions
{
    AutoCompleteMessages = false,  // ← Manual complete
    MaxConcurrentCalls = 5,
    ReceiveMode = ServiceBusReceiveMode.PeekLock
});

processor.ProcessMessageAsync += async args =>
{
    try
    {
        // Procesar mensaje
        await handler.HandleAsync(message);
        await args.CompleteMessageAsync(args.Message);  // ← Explicit complete
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Failed to process message. Moving to DLQ.");
        await args.DeadLetterMessageAsync(args.Message, 
            deadLetterReason: "ProcessingFailed",
            deadLetterErrorDescription: ex.Message);
    }
};
```

**Beneficios:**
- Retry automático (DeliveryCount aumenta hasta MaxDeliveryCount)
- Mensajes fallidos van a DLQ para inspección manual
- `Complete` explícito previene reprocessing de mensajes ya procesados

---

## Azure Container Apps

### 10. **Image caching requiere --revision-suffix único**

**Problema:** Después de `az acr build`, el Container App NO repulla la imagen si el tag es el mismo (`:latest`).

**Solución:** SIEMPRE usar `--revision-suffix` único en cada update:

```bash
# ❌ NO repulla la imagen
az containerapp update -n ca-weather-be-dev -g rg --image acr.azurecr.io/weather-api:latest

# ✅ Repulla la imagen con revision única
az containerapp update -n ca-weather-be-dev -g rg \
  --image acr.azurecr.io/weather-api:latest \
  --revision-suffix "be-$(date +%s)"
```

**Pattern en AGENTS.md:** Todos los comandos de redeploy usan `--revision-suffix`.

---

### 11. **Secrets son declarativos en Bicep**

**Problema:** Si un secret no está en el array de Bicep, se **borra** en el próximo redeploy.

**Solución:** Usar Key Vault references (NO inline secrets):

```bicep
secrets: [
  {
    name: 'appinsights-connection-string'
    keyVaultUrl: '${kvUri}secrets/appinsights-connection-string'
    identity: identityId
  }
]

env: [
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    secretRef: 'appinsights-connection-string'
  }
]
```

**Beneficios:**
- Secrets rotables sin redeploy del Container App
- Secret audit trail en Key Vault
- No hay secrets en Bicep templates

---

### 12. **Workers scaled to zero devuelven 0 replicas (no error)**

**Gotcha:** Cuando consultás la ARM API para replica count y el worker está scaled to zero (KEDA), devuelve `replicas: 0` (NO un error).

```csharp
// InfrastructureHealthService
var replicas = appData.Properties.Template.Scale.MinReplicas ?? 0;  // ← puede ser 0
```

**Pattern en Health page:** Mostrar "0 replicas (scaled down)" en lugar de "error".

---

## Container Jobs

### 13. **.NET 10 + Alpine = SIGSEGV crash**

**Problema:** Container Jobs con `mcr.microsoft.com/dotnet/runtime:10.0-alpine` crashean con exit code 139 (segmentation fault).

**Solución:** Usar Debian base image:

```dockerfile
# ❌ NO funciona con .NET 10
FROM mcr.microsoft.com/dotnet/runtime:10.0-alpine

# ✅ Funciona
FROM mcr.microsoft.com/dotnet/runtime:10.0
```

**Sin workaround para Alpine.** Usar Debian hasta que se fixee en .NET 10 stable.

---

### 14. **Logs vacíos en Container Jobs crasheados**

**Problema:** Si el job crashea antes de que el logging provider se inicialice, `az containerapp job logs show` muestra vacío.

**Solución:** Consultar **ContainerAppSystemLogs** en Log Analytics:

```kql
ContainerAppSystemLogs_CL
| where ContainerJobName_s == "ca-weather-enqueuer-dev"
| where TimeGenerated > ago(1h)
| project TimeGenerated, Log_s, ExitCode_d, Reason_s
| order by TimeGenerated desc
```

**Esto muestra:** Exit code, razón del crash, errores de runtime (antes de que la app logge).

---

### 15. **Graceful shutdown con IHostApplicationLifetime**

**Pattern obligatorio:** Jobs DEBEN usar `ApplicationStopping` token para responder a SIGTERM (cuando se para el job).

```csharp
// Program.cs
var app = builder.Build();
var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
var service = app.Services.GetRequiredService<EnqueuerService>();

try
{
    // ✅ Pasar ApplicationStopping (NO CancellationToken.None)
    await service.RunAsync(lifetime.ApplicationStopping);
    Environment.ExitCode = 0;
}
catch (OperationCanceledException)
{
    // Graceful shutdown (user stopped job)
    _logger.LogInformation("Job cancelled by user");
    Environment.ExitCode = 0;  // ← Exit 0, no error
}
catch (Exception ex)
{
    _logger.LogError(ex, "Job failed");
    Environment.ExitCode = 1;  // ← Exit 1, error real
}
```

**Sin esto:** El job ignora SIGTERM y corre hasta timeout (300s default) → SIGKILL.

---

## Easy Auth (Entra ID)

### 16. **Cross-tenant auth requiere accessTokenAcceptedVersion: 2**

**Problema:** Auth entre tenant personal (cuenta@gmail.com) y tenant corporativo falla con token v1.

**Solución:** Cambiar app manifest en Entra ID:

```json
{
  "accessTokenAcceptedVersion": 2,  // ← OBLIGATORIO para cross-tenant
  "signInAudience": "AzureADandPersonalMicrosoftAccount"
}
```

**Verificación:** El token JWT debe tener `"ver": "2.0"` (NO `"1.0"`).

---

### 17. **Token Store requiere SAS URL con `&`**

**Problema:** Token Store necesita SAS URL con query params (`?sv=...&sig=...`). Usar `az keyvault secret set --value` falla con parse error.

**Solución:** Crear archivo temporal con SAS URL y usar `--file`:

```bash
# ❌ Falla con error de parse
az keyvault secret set --vault-name kv --name token-store-sas --value "https://...?sv=...&sig=..."

# ✅ Funciona
echo "https://...?sv=...&sig=..." > /tmp/sas.txt
az keyvault secret set --vault-name kv --name token-store-sas --file /tmp/sas.txt
rm /tmp/sas.txt
```

---

### 18. **Easy Auth secrets DEBEN existir ANTES del deploy**

**Gotcha:** Si deployás Container Apps con `enableAuth: true` y los secrets (`auth-client-secret-frontend`, `auth-client-secret-backend`) no existen en Key Vault, el deploy **falla** o los apps no arrancan.

**Orden correcto:**
1. Deploy Bicep infra (Key Vault, auto-seeded secrets)
2. **Agregar manualmente** secrets de Easy Auth a Key Vault
3. Deploy Container Apps con `enableAuth: true`

---

## KEDA Scaling

### 19. **KEDA metrics están en AzureMetrics (Log Analytics), NO en App Insights**

**Problema:** Query KQL en `customMetrics` no encuentra `ActiveMessages`.

**Solución:** Buscar en `AzureMetrics` table:

```kql
AzureMetrics
| where ResourceProvider == "MICROSOFT.SERVICEBUS"
| where MetricName == "ActiveMessages"
| where Resource == "WEATHER-JOBS"  // queue name en uppercase
| summarize avg(Average) by bin(TimeGenerated, 5m)
```

**Service Bus diagnostic settings:** DEBEN enviar `AllMetrics` a Log Analytics para que KEDA funcione.

---

### 20. **Change Feed Processor NO necesita KEDA**

**Lección:** Change Feed Processor usa leases para distribuir trabajo automáticamente entre replicas. NO necesita KEDA scaler.

**Config recomendada:**
```bicep
scale: {
  minReplicas: 1
  maxReplicas: 1  // ← Fixed, o maxReplicas = particiones físicas en prod
}
```

**Si usás KEDA con Change Feed:** El scaler no correlaciona con work distribution (leases), puede causar starvation.

---

## Managed Identity y RBAC

### 21. **Una identity por workload (no compartir)**

**Pattern probado:**
- Backend: `uami-ca-weather-be-dev`
- Frontend: `uami-ca-weather-fe-dev`
- Workers: `id-weather-worker-dev` (compartida entre WeatherWorker y DashboardWorker)
- Job: `id-weather-job-dev`

**Beneficios:**
- Least privilege: cada identity tiene SOLO los roles que necesita
- Audit trail: logs muestran qué workload hizo qué acción
- Security boundary: compromise de frontend NO afecta backend

---

### 22. **Backend necesita Contributor para editar jobs (no solo Reader)**

**Problema:** Backend con Reader role puede listar jobs (Health page) pero NO editarlos (Scheduler page "Guardar Cambios").

**Solución:** Asignar **Contributor** role al backend identity:

```bicep
resource backendContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, backendIdentity.id, 'Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 
      'b24988ac-6180-42a0-ab88-20f7382dd24c')  // Contributor
    principalId: backendIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}
```

**Pattern en Bicep:** Todos los roles están en Bicep (no asignaciones manuales).

---

### 23. **RBAC propagation delay (~60 segundos)**

**Gotcha:** Después de asignar un rol, puede tardar ~60 segundos hasta que Key Vault references o ARM API calls funcionen.

**Workaround durante deploy:** Esperar 60s después de role assignments antes de deploy de Container Apps.

---

## Key Vault

### 24. **Todos los secrets van a Key Vault (regla)**

**Pattern obligatorio:** TODO secreto va a Key Vault (connection strings, client secrets, SAS URLs).

**Auto-seeded en Bicep:**
- `appinsights-connection-string`
- ~~`sql-connection-string`~~ (removido en Managed Identity migration)
- ~~`cosmos-connection-string`~~ (removido en Managed Identity migration)

**Manuales (una vez):**
- `auth-client-secret-frontend`
- `auth-client-secret-backend`
- `token-store-sas`

**Container Apps referencian via `keyVaultUrl`:**
```bicep
secrets: [
  {
    name: 'appinsights-connection-string'
    keyVaultUrl: '${kvUri}secrets/appinsights-connection-string'
    identity: identityId
  }
]
```

**Beneficios:**
- Secret rotation sin redeploy
- No secrets en código ni en templates
- Audit trail en Key Vault access logs

---

## Change Feed Processor

### 25. **Idempotencia con timestamp >= (no solo >)**

**Problema:** Si `updatedAt` no se actualiza manualmente en edits (Azure Portal), Change Feed ignora el cambio con condición `>`.

**Solución:** Usar `>=` en lugar de `>`:

```csharp
// ChangeFeedHandler.cs
if (persona.UpdatedAt >= existing.CosmosUpdatedAt)  // ← >= permite timestamps iguales
{
    // Syncronizar cambios a SQL
    existing.Edad = persona.Edad;
    existing.CosmosUpdatedAt = persona.UpdatedAt;
    existing.SyncVersion++;
    await dbContext.SaveChangesAsync(cancellationToken);
}
else
{
    // Protección contra eventos viejos (replay attack, clock skew)
    logger.LogDebug("Skipped — SQL has newer version");
}
```

**Justificación:**
- Change Feed solo trae documentos modificados (gracias a checkpoint)
- `>=` permite procesamiento de edits manuales sin actualizar timestamp
- `<` protege contra eventos viejos por clock skew o replay

---

### 26. **Leases en container separado**

**Pattern probado:** Change Feed Processor usa container `changefeed-leases` para distribuir particiones.

```bicep
resource leasesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: 'changefeed-leases'
  properties: {
    resource: {
      id: 'changefeed-leases'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}
```

**Lección:** NO mezclar leases con datos de negocio (diferentes throughput requirements).

---

## Application Insights & OpenTelemetry

### 27. **Dual telemetry: SDK + Managed OTel Agent**

**Arquitectura probada:** App envía telemetría directo via SDK + managed agent captura logs adicionales.

```csharp
// Program.cs
builder.Services.AddOpenTelemetry()
    .UseAzureMonitor();  // ← SDK directo

// Bicep: Container App Environment con managed OTel agent
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}
```

**Beneficios:**
- SDK captura: HTTP requests, dependencies, custom metrics
- Agent captura: stdout/stderr logs, platform events
- Visibilidad completa sin gaps

---

### 28. **Service Bus Activities requieren feature flag**

**Pattern en Workers:**
```csharp
// Program.cs
AppContext.SetSwitch("Azure.Experimental.EnableActivitySource", true);  // ← OBLIGATORIO

builder.Services.AddOpenTelemetry()
    .UseAzureMonitor()
    .WithTracing(tracing => tracing
        .AddSource("Azure.Messaging.ServiceBus.*"));  // ← Activity source
```

**Sin esto:** Service Bus message processing NO genera traces en App Insights.

---

## .NET 10 Patterns

### 29. **Primary constructors para DI (SIEMPRE)**

**Pattern obligatorio (C# 12+):**
```csharp
// ✅ SIEMPRE usar primary constructors
public class ChangeFeedHandler(
    IDbContextFactory<DashboardDbContext> dbContextFactory,
    ServiceBusClient serviceBusClient,
    ILogger<ChangeFeedHandler> logger) : IChangeFeedHandler
{
    // No fields, no constructor body — acceso directo a params
    public async Task ProcessBatchAsync(IReadOnlyCollection<Persona> personas)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync();
        var sender = serviceBusClient.CreateSender("topic");
        logger.LogInformation("Processing {Count} items", personas.Count);
    }
}
```

**NO usar:**
```csharp
// ❌ NO usar constructores tradicionales con asignaciones
private readonly ILogger _logger;
public ChangeFeedHandler(ILogger<ChangeFeedHandler> logger)
{
    _logger = logger;
}
```

**Referencias:** Ver `ChangeFeedHandler`, `DashboardEventHandler` como referencia.

---

### 30. **Method names as documentation**

**Lección:** Nombres de métodos deben leerse como pseudocódigo. Preferir nombres largos y descriptivos en lugar de comentarios.

```csharp
// ✅ Método auto-documentado
private async Task InsertNewCounterOrRetry(string eventType)
{
    // Código claro, nombre explica el qué
}

// ✅ Extraer métodos privados con nombres claros
private async Task IncrementExistingCounter(ChangeFeedCounter counter)
{
    counter.Count++;
    counter.UpdatedAt = DateTime.UtcNow;
    await dbContext.SaveChangesAsync();
}

// ❌ Método genérico con comentarios inline
private async Task ProcessCounter(string type, bool isNew)
{
    // Check if new or existing...
    if (isNew)
    {
        // Insert new counter...
    }
    else
    {
        // Increment existing...
    }
}
```

**Beneficios:**
- Código legible sin comentarios
- Refactoring más fácil (métodos pequeños, single responsibility)
- Tests unitarios más enfocados

---

## Frontend (React + shadcn/ui)

### 31. **Runtime config injection con nginx**

**Pattern probado:** No hardcodear API URLs en build — inyectarlas en runtime.

```dockerfile
# Dockerfile
FROM nginx:alpine
COPY docker-entrypoint.d/inject-config.sh /docker-entrypoint.d/
COPY nginx.conf /etc/nginx/nginx.conf
COPY dist/ /usr/share/nginx/html/
```

```bash
# inject-config.sh
cat > /usr/share/nginx/html/config.js <<EOF
window.APP_CONFIG = {
  API_BASE_URL: "${API_BASE_URL}",
  APP_INSIGHTS_CONNECTION_STRING: "${APP_INSIGHTS_CONNECTION_STRING}"
};
EOF
```

**Benefits:**
- Una imagen para dev/staging/prod
- No rebuild para cambiar config
- Secrets inyectados en runtime (NO en build)

---

### 32. **shadcn/ui: npx shadcn add puede fallar silenciosamente**

**Gotcha:** `npx shadcn add alert-dialog` a veces NO crea el archivo component.

**Workaround:** Crear manualmente desde template si `npx shadcn add` no funciona:

```bash
# Crear archivo manualmente
cat > src/components/ui/alert-dialog.tsx <<'EOF'
// Copiar template desde https://ui.shadcn.com/docs/components/alert-dialog
EOF
```

**Pattern:** Verificar siempre que el archivo existe después de `npx shadcn add`.

---

## Bicep IaC

### 33. **Feature flags para deploys parciales**

**Pattern probado:** Usar parámetros boolean para deployar features opcionales.

```bicep
param deployKeyVault bool = true
param deployDashboard bool = false
param deployWorker bool = false
param deployContainerApps bool = true

module keyVault 'modules/key-vault.bicep' = if (deployKeyVault) {
  // ...
}

module dashboard 'modules/dashboard.bicep' = if (deployDashboard) {
  // ...
}
```

**Beneficios:**
- Deploy incremental (no recrear todo)
- Testing de features individuales
- Rollback granular (deshabilitar feature sin borrar resource)

---

### 34. **Validar Bicep antes de commit (regla)**

**Command obligatorio antes de commit:**
```bash
az bicep build --file biceps/main.bicep
```

**Agrega pre-commit hook:**
```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/bash
az bicep build --file biceps/main.bicep || exit 1
EOF
chmod +x .git/hooks/pre-commit
```

**Previene:** Syntax errors, reference errors, API version incompatibilidades.

---

### 35. **Naming convention: {resource-prefix}-{workload}-{env}-{uniqueSuffix}**

**Pattern usado:**
```bicep
var uniqueSuffix = uniqueString(resourceGroup().id)
var acrName = 'acrweather${uniqueSuffix}'  // globally unique
var backendAppName = 'ca-weather-be-${environment}'  // scoped to RG
var kvName = 'kv-weather-${environment}-${take(uniqueSuffix, 6)}'
```

**Ejemplos reales:**
- `ca-weather-be-dev` (Container App backend)
- `ca-weather-fe-dev` (Container App frontend)
- `kv-weather-dev-u6qlzs` (Key Vault con unique suffix)
- `sb-weather-dev-u6qlzs` (Service Bus)

---

## Referencias Cruzadas

- **DEPLOYMENT.md:** Procedimiento E2E validado para deploy desde cero
- **EASY-AUTH-TUTORIAL.md:** Tutorial paso a paso de Easy Auth con troubleshooting
- **WORKER-KEDA-DESIGN.md:** Diseño detallado de workers con KEDA scaling
- **STOP-JOB-EXECUTION-DESIGN.md:** Implementación de stop job + graceful shutdown
- **AGENTS.md:** Gotchas consolidados (sección "Gotchas & Lessons Learned")

---

## Changelog

| Fecha | Cambios |
|-------|---------|
| 2026-07-23 | Documento inicial con 35 lecciones consolidadas de AGENTS.md, README.md, y experiencia de implementación |

