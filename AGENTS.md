# AGENTS.md — Container App POC

## Overview

POC de Azure Container Apps con Easy Auth (Entra ID), dashboard de observabilidad, workers event-driven, y buenas prácticas de seguridad (Key Vault, Managed Identity, RBAC).

**Propósito:** Validar patrones para una implementación productiva. Cada decisión de arquitectura aquí es replicable.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Container Apps Environment              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Frontend    │  │   Backend    │  │  Workers (0..N)      │  │
│  │  React+Vite  │  │  .NET 10 API │  │  WeatherWorker       │  │
│  │  nginx       │──│  Minimal API │  │  DashboardWorker     │  │
│  │  shadcn/ui   │  │  EF Core     │  │  KEDA-scaled         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Entra ID    │  │  Azure SQL       │  │  Service Bus     │
│  Easy Auth   │  │  (MI auth)       │  │  Queues + Topics │
└──────────────┘  └──────────────────┘  └──────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Key Vault   │  │  App Insights    │  │  Log Analytics   │
│  (secrets)   │  │  (telemetry)     │  │  (KQL)           │
└──────────────┘  └──────────────────┘  └──────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + TypeScript + Vite | React 18, Vite 5 |
| UI Components | shadcn/ui + Tailwind CSS | Latest |
| Backend API | .NET (C# Minimal API) | .NET 10 |
| ORM | Entity Framework Core | 10.x |
| Workers | .NET BackgroundService | .NET 10 |
| Auth | Easy Auth (Entra ID, Microsoft provider) | Platform-managed |
| Database | Azure SQL | Serverless |
| Messaging | Azure Service Bus (queues + topics) | Standard tier |
| Secrets | Azure Key Vault (KV references in Container Apps) | RBAC-enabled |
| IaC | Bicep (modular) | Latest |
| CI/CD | Docker → ACR → Container Apps | Manual deploy |
| Observability | App Insights + Log Analytics + KQL | - |
| Scaling | KEDA (Service Bus trigger) | - |

---

## Project Structure

```
container-app-poc/
├── src/
│   ├── frontend/          # React + Vite + shadcn/ui
│   │   └── src/
│   │       ├── pages/     # HomePage, DashboardPage, HealthPage, DlqManagerPage, AdminPage
│   │       ├── components/# Layout, Navbar, ProtectedRoute, ui/ (shadcn)
│   │       ├── services/  # API clients
│   │       ├── hooks/     # Custom React hooks
│   │       └── context/   # Auth context
│   ├── backend/WeatherApi/# .NET 10 Minimal API
│   │   ├── Controllers/   # Weather, Auth, Dashboard, Health, DlqManager
│   │   ├── Services/      # InfrastructureHealthService, etc.
│   │   ├── Models/        # DTOs
│   │   ├── Data/          # EF Core DbContext
│   │   ├── Middleware/    # Global error handler
│   │   └── Program.cs    # DI + pipeline
│   ├── worker/
│   │   ├── WeatherWorker/ # Processes weather-queue (SB trigger)
│   │   └── DashboardWorker/ # Processes dashboard-events topic
│   └── tools/             # Utility scripts
├── biceps/
│   ├── main.bicep         # Orchestrator (all modules)
│   ├── easyauth.bicep     # Easy Auth standalone deployment
│   └── modules/           # One file per resource type
├── docs/                  # Tutorials and design docs
├── scripts/               # Deployment helpers
├── sql/                   # Database migrations/scripts
└── docker-compose.yml     # Local development
```

---

## Key Patterns & Decisions

### Secrets Management
- **Regla:** Todo secreto va a Key Vault. Container Apps referencian via `keyVaultUrl`.
- **Auto-seeded (Bicep):** `appinsights-connection-string`, `sql-connection-string`
- **Manuales (una vez):** `auth-client-secret-frontend`, `auth-client-secret-backend`, `token-store-sas`
- **SAS URLs con `&`:** usar `az keyvault secret set --file` (no `--value`)

### Identity & RBAC
- **Una managed identity por workload** (BE, FE, Workers tienen la suya)
- **Todos los roles están en Bicep** — recrear el ambiente no requiere asignaciones manuales
- **SQL access:** requiere `CREATE USER [identity-name] FROM EXTERNAL PROVIDER` (T-SQL, no automatizable con Bicep)
- **Backend extra:** tiene `Reader` en el RG para consultar ARM API (infrastructure health)

### Authentication (Easy Auth)
- Platform-managed auth en Container Apps (no código en la app)
- Provider: Microsoft (Entra ID)
- Token Store habilitado (Azure Blob + SAS)
- Frontend: redirect flow (`return401`, `/.auth/login/aad`)
- Backend: valida `X-MS-TOKEN-AAD-ID-TOKEN` en headers
- Cross-tenant: requiere `accessTokenAcceptedVersion: 2` en app manifest

### Workers & Messaging
- KEDA scaling basado en queue depth
- `WeatherWorker`: consume `weather-queue`
- `DashboardWorker`: consume `dashboard-events` topic subscription
- Ambos: graceful shutdown, dead-letter handling
- **Patrón BackgroundService + Handler:** el BackgroundService maneja solo infra (processor lifecycle, settlement). La lógica de negocio va en un handler inyectado via interfaz (`IDashboardEventHandler`, `IMessageDispatcher`)
- **Azure SDK mocking:** `ServiceBusSender`, `ServiceBusClient`, `ServiceBusReceiver` tienen métodos `virtual` — se mockean directo con Moq sin necesidad de wrappers. Ver [Sample15_MockingClientTypes](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/servicebus/Azure.Messaging.ServiceBus/samples/Sample15_MockingClientTypes.md)

### Frontend
- SPA con React Router (client-side routing)
- nginx con `try_files $uri /index.html` para SPA routing
- Runtime config injection via `docker-entrypoint.d/` scripts
- shadcn/ui para componentes (no Material UI)

### Observability
- App Insights con connection string (no instrumentation key)
- Service Bus diagnostic settings → Log Analytics (AllMetrics + OperationalLogs)
- KQL queries documentadas en README
- Infrastructure Health endpoint: ARM REST API + ServiceBusAdminClient con IMemoryCache (25s TTL)

---

## Bicep Conventions

- **Modular:** un archivo por recurso en `biceps/modules/`
- **Feature flags:** `deployKeyVault`, `deployDashboard`, `deployWorker`, `deployWorkerApp` en `main.bicep`
- **Naming:** `{resource-prefix}-{workload}-{env}-{uniqueSuffix}` (e.g., `ca-weather-be-dev`)
- **Validate:** `az bicep build --file biceps/main.bicep` antes de commit
- **Roles in Bicep:** cada módulo asigna los roles que necesita su identity
- **KV references:** `{ name: 'x', keyVaultUrl: '${kvUri}secrets/x', identity: identityId }`

---

## Skills Index

Usar estos skills según la tarea:

| Skill | Cuándo usarlo |
|-------|--------------|
| `azure-prepare` | Preparar apps para deploy (generar Bicep, azure.yaml, Dockerfiles) |
| `azure-deploy` | Ejecutar deployments (`azd up`, `az deployment`) |
| `azure-validate` | Validar infraestructura antes de deploy |
| `azure-diagnostics` | Debug de problemas en producción (App Insights, logs, health) |
| `azure-kubernetes` | Si se migra a AKS |
| `azure-cost` | Análisis de costos y optimización |
| `azure-compliance` | Auditoría de seguridad y best practices |
| `azure-resource-lookup` | Listar/encontrar recursos en Azure |
| `azure-rbac` | Encontrar el rol correcto para una identity |
| `azure-ai` | Si se agrega AI Search u OpenAI |
| `microsoft-docs` | Buscar documentación de Azure/Microsoft |
| `appinsights-instrumentation` | Instrumentar con App Insights SDK |
| `vercel-react-best-practices` | Patterns de React (hooks, state, components) |
| `ui-ux-pro-max` | Diseño de UI/UX, layouts, accesibilidad |
| `entity-framework-core` | Queries, migrations, DbContext patterns |
| `writing-bicep-templates` | Escribir/mejorar templates Bicep |

---

## Documentation Index

| Documento | Descripción | Cuándo leerlo |
|-----------|-------------|---------------|
| [`README.md`](./README.md) | Arquitectura, deploy, KQL queries | Overview general del proyecto |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Instrucciones de deploy completo | Al hacer deploy desde cero |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Setup local de desarrollo | Al empezar a desarrollar |
| [`DOCKER.md`](./DOCKER.md) | Docker build y push a ACR | Al buildear imágenes |
| [`RUNNING.md`](./RUNNING.md) | Cómo correr localmente | Debug local |
| [`docs/EASY-AUTH-TUTORIAL.md`](./docs/EASY-AUTH-TUTORIAL.md) | Tutorial paso a paso de Easy Auth | Configurar auth en nueva app |
| [`docs/WORKER-KEDA-DESIGN.md`](./docs/WORKER-KEDA-DESIGN.md) | Diseño de workers con KEDA | Agregar nuevos workers |
| [`docs/dashboard-poc.md`](./docs/dashboard-poc.md) | Diseño del dashboard | Modificar dashboard features |
| [`docs/DOTNET-INSTRUMENTATION.md`](./docs/DOTNET-INSTRUMENTATION.md) | App Insights en .NET | Agregar telemetría |
| [`docs/refactoring-ef-core-service-layer.md`](./docs/refactoring-ef-core-service-layer.md) | Patterns EF Core | Refactoring de data access |
| [`docs/modern-csharp-features.md`](./docs/modern-csharp-features.md) | C# moderno usado en el proyecto | Estilo de código C# |
| [`docs/global-error-handler-middleware.md`](./docs/global-error-handler-middleware.md) | Middleware de errores | Error handling patterns |

---

## Development Guidelines

### C# (.NET 10)
- Minimal API style (no controllers tradicionales excepto los existentes)
- File-scoped namespaces
- **Primary constructors:** SIEMPRE usar primary constructors para inyección de dependencias (C# 12+). Sintaxis: `public class Service(IDependency dep, ILogger<Service> logger) : IService { ... }`. No usar constructores explícitos con asignaciones `_field = param`. Ver `ChangeFeedHandler`, `DashboardEventHandler` como referencia.
- Global usings
- Nullable reference types enabled
- `IResult` return types en endpoints
- **Method names as documentation:** los nombres de métodos deben leerse como pseudocódigo. Preferir nombres descriptivos y largos que expliquen el *qué* sin necesidad de comentarios (e.g., `InsertNewCounterOrRetry`, `IncrementExistingCounter`, `RetryIncrementWithFreshContext`). Extraer métodos privados con nombres claros en lugar de bloques largos con comentarios inline.

### TypeScript/React
- Functional components only
- Custom hooks para lógica reutilizable
- shadcn/ui para UI components (no instalar otras libraries de UI)
- Tailwind CSS para styling
- TypeScript strict mode

### General
- No secrets en código — siempre Key Vault
- No `@secure()` params flotando — KV references
- Roles en Bicep, no manuales (excepto SQL `CREATE USER`)
- Feature flags para deploys parciales
- Validate Bicep antes de commit

---

## Infrastructure (Live Environment)

| Resource | Name | Notes |
|----------|------|-------|
| Resource Group | `rg-far-container-app-easyauth` | eastus2 |
| ACR | `acrweatheru6qlzsmy` | Backend, Frontend, Workers, Jobs images |
| Key Vault | `kv-weather-dev-u6qlzs` | RBAC-enabled, secrets auto-seeded |
| Service Bus | `sb-weather-dev-u6qlzs` | Standard tier, diagnostics enabled |
| SQL Server | `sql-weather-dash-7446` | DB: `dashboard-poc` |
| Log Analytics | `law-weather-dev-u6qlzs` | Central workspace |
| App Insights | Connected to Log Analytics | .NET + React instrumentation |
| Backend App | `ca-weather-be-dev` | Identity: `uami-ca-weather-be-dev` |
| Frontend App | `ca-weather-fe-dev` | Identity: `uami-ca-weather-fe-dev` |
| Worker Identity | `id-weather-worker-dev` | Shared by both workers |
| Container Job | `ca-weather-enqueuer-dev` | Identity: `id-weather-job-dev`, CRON: */5 * * * * |

---

## Common Commands

```bash
# Validate Bicep
az bicep build --file biceps/main.bicep

# Deploy infrastructure
az deployment group create -g rg-far-container-app-easyauth -f biceps/main.bicep --parameters ...

# Build and push (from WSL)
az acr build --registry acrweatheru6qlzsmy --image weather-api:latest --file src/backend/WeatherApi/Dockerfile src/backend/WeatherApi
az acr build --registry acrweatheru6qlzsmy --image weather-frontend:latest --file src/frontend/Dockerfile src/frontend
az acr build --registry acrweatheru6qlzsmy --image dashboard-worker:latest --file src/worker/DashboardWorker/Dockerfile src/worker/DashboardWorker
az acr build --registry acrweatheru6qlzsmy --image weather-worker:latest --file src/worker/WeatherWorker/Dockerfile src/worker/WeatherWorker
az acr build --registry acrweatheru6qlzsmy --image weather-enqueuer:latest --file src/jobs/WeatherEnqueuer/Dockerfile src/jobs/WeatherEnqueuer

# Redeploy container app (ALWAYS use --revision-suffix to force fresh image pull)
az containerapp update -n ca-weather-be-dev -g rg-far-container-app-easyauth \
  --image acrweatheru6qlzsmy.azurecr.io/weather-api:latest \
  --revision-suffix "be-$(date +%s)"

az containerapp update -n ca-weather-fe-dev -g rg-far-container-app-easyauth \
  --image acrweatheru6qlzsmy.azurecr.io/weather-frontend:latest \
  --revision-suffix "fe-$(date +%s)"

az containerapp update -n ca-dashboard-worker-dev -g rg-far-container-app-easyauth \
  --image acrweatheru6qlzsmy.azurecr.io/dashboard-worker:latest \
  --revision-suffix "dw-$(date +%s)"

az containerapp update -n ca-weather-worker-dev -g rg-far-container-app-easyauth \
  --image acrweatheru6qlzsmy.azurecr.io/weather-worker:latest \
  --revision-suffix "ww-$(date +%s)"

# Set manual secret in KV
az keyvault secret set --vault-name kv-weather-dev-u6qlzs --name secret-name --value "value"

# Check app health
curl https://ca-weather-be-dev.wonderfulglacier-bd1b5cf9.eastus2.azurecontainerapps.io/api/health
```

---

## Gotchas & Lessons Learned

### General
1. **SAS URLs con `&`:** `az keyvault secret set --value` falla. Usar `--file`.
2. **RBAC propagation:** ~60 segundos después de asignar rol antes de que KV refs funcionen.
3. **ACR build en Windows:** Agregar `--no-logs` para evitar `UnicodeEncodeError` con checkmarks.
4. **Easy Auth cross-tenant:** Requiere `accessTokenAcceptedVersion: 2` en Entra app manifest.
5. **KEDA metrics:** `ActiveMessages` está en `AzureMetrics` (Log Analytics), NO en `customMetrics` (App Insights).
6. **Container Apps secrets:** Son declarativos — si un secret no está en el array de Bicep, se borra en redeploy. Por eso usamos KV references.
7. **SQL MI auth:** `Authentication=Active Directory Default` + `CREATE USER` manual en la DB.
8. **Workers scaled to zero:** ARM replicas API devuelve 0 replicas (no error).

### Cosmos DB + Change Feed (16/07/2026)
9. **SQL Server location mismatch:** El SQL Server existente está en `centralus`. Usar `sqlLocation=centralus` en deploys con `deployDashboard=true`, NO usar `location` (eastus2). Fallar en esto causa: `"resource already exists in location centralus... cannot be created in location eastus2"`.
10. **Backend sin SQL_CONNECTION_STRING:** Backend necesita `deployDashboard=true` en el deploy para que agregue `SQL_CONNECTION_STRING` env var + secret ref + DashboardDbContext DI. Sin esto: `"Unable to resolve service for type 'DashboardDbContext'"`.
11. **Cosmos JSON serialization:** Cosmos espera lowercase (`id`, `nombre`) pero C# usa PascalCase. **Solución obligatoria:**
    - Agregar `[JsonPropertyName("id")]` a los DTOs
    - Configurar `CosmosSerializationOptions` con `PropertyNamingPolicy = CamelCase` en Program.cs
    - Sin esto: `"required properties 'id;' are missing"` error.
12. **Container App image caching:** Después de `az acr build`, el Container App NO repulla la imagen si el tag es el mismo (`:latest`). **Solución:** usar `--revision-suffix` único en cada `az containerapp update`.
13. **RBAC role assignment warnings:** `"RoleAssignmentExists"` warnings durante deploy son **normales** — no son errores. El deployment continúa exitosamente.
14. **ChangeFeedWorker no usa KEDA:** Change Feed Processor distribuye trabajo via leases automáticamente. No necesita KEDA scaler. Usar `minReplicas=1, maxReplicas=1` fijo (o maxReplicas = particiones físicas en producción).
15. **DashboardWorker EventType deserialization:** Service Bus messages de ChangeFeedWorker usan PascalCase (`EventType: "ChangeFeedProcessed"`), pero el modelo C# tenía `[JsonPropertyName("eventType")]` (camelCase). **Solución:** Agregar `PropertyNameCaseInsensitive = true` al `JsonSerializerOptions` en el deserializador. Sin esto: EventType queda vacío y el mensaje va a dead-letter.
16. **Frontend date comparison bug:** Backend devuelve `date` como ISO completo (`"2026-07-16T00:00:00Z"`), pero frontend comparaba con `"2026-07-16"`. **Solución:** Usar `.split('T')[0]` en ambos lados al comparar fechas. Sin esto: dashboard "Procesados Hoy" siempre muestra 0.
17. **Easy Auth deployment state:** Easy Auth deployment puede tener éxito pero Container Apps no reflejan la configuración inmediatamente, o deployments posteriores de Container Apps pueden sobrescribir authConfig. **Solución:** Siempre verificar via REST API `/authConfigs/current` que `enabled: true`. Sin Easy Auth, backend devuelve 401 aunque frontend muestre "Autenticado".
18. **Easy Auth secrets DEBEN estar en Key Vault ANTES del deployment:** Los Container Apps (frontend y backend) tienen `enableAuth: true` y referencian `auth-client-secret-frontend` y `auth-client-secret-backend` desde Key Vault. Si estos secrets no existen al hacer el deployment de Container Apps (Paso 6), el deployment **falla con error de referencia a secret inexistente** o los apps no arrancan. **Solución:** Ejecutar Paso 2 (agregar secrets) ANTES del Paso 6 (deploy Container Apps).
19. **Backend identity necesita CREATE USER en SQL Database:** Después del deployment, el backend tiene managed identity con RBAC roles en Azure, pero **NO** tiene usuario SQL dentro de la database. Sin el `CREATE USER` manual, el backend falla al conectarse a SQL con error `"Login failed for user '<token-identified principal>'"`. **Solución:** Ejecutar Paso 5.1 para crear usuarios SQL para AMBOS backend identity Y worker identity. Bicep NO puede automatizar esto (limitación de Azure SQL, no de Bicep).
20. **Cosmos DB usa Managed Identity (NO connection string):** Backend y Workers usan `DefaultAzureCredential` + endpoint para acceder a Cosmos DB. Bicep asigna automáticamente el rol "Cosmos DB Built-in Data Contributor" al backend identity. **No se necesita secret en Key Vault**. SQL también usa Managed Identity (`Authentication=Active Directory Default` en connection string).
21. **Managed Identity migration requiere cleanup manual:** Ambientes deployados ANTES de commits `5497d24` (Cosmos MI) y `3ac881d` (SQL MI) tienen secrets obsoletos (`cosmos-connection-string`, `sql-connection-string`) en Key Vault y Container Apps. Backend falla con `"Unable to resolve service for type 'CosmosClient'"` porque `Cosmos__Endpoint` env var no existe. **Solución:** Ejecutar sección "Ambiente actual con secrets obsoletos" en DEPLOYMENT.md: (1) Eliminar secrets obsoletos de Key Vault, (2) Asignar rol Cosmos al backend, (3) Rebuild backend, (4) Redeploy con `--set-env-vars Cosmos__Endpoint=... SQL_CONNECTION_STRING=...` y `--remove-env-vars COSMOS_CONNECTION_STRING`. Estado final esperado: 2 secrets en backend (appinsights + auth), 3 secrets en Key Vault (appinsights + 2x auth), env vars como `value:` (NO `secretRef`).

### Container Jobs (20/07/2026)
22. **.NET 10 + Alpine = SIGSEGV crash:** Container Jobs que usan `mcr.microsoft.com/dotnet/runtime:10.0-alpine` fallan con exit code 139 (segmentation fault) antes de que la aplicación inicie. **Solución:** Usar Debian base image (`mcr.microsoft.com/dotnet/runtime:10.0`). No hay workaround para Alpine + .NET 10.
23. **AddServiceBusClient + Managed Identity:** `AddServiceBusClient(connectionString)` NO funciona con Managed Identity aunque se use `.WithCredential()`. Azure SDK espera connection string si se pasa string. **Solución:** Usar `AddClient<ServiceBusClient, ServiceBusClientOptions>` con constructor explícito: `new ServiceBusClient(namespace, credential, options)`. Ver DEPLOYMENT.md sección "Job falla con connection string could not be parsed".
24. **Container Jobs logs vacíos:** `az containerapp job logs show` solo muestra logs después de que el logging provider se inicializa. Si el job crashea antes (runtime crash, DI error), los logs quedan vacíos. **Solución:** Consultar **ContainerAppSystemLogs** en Log Analytics para ver ExitCode y errores del container runtime.
25. **Service Bus queue/topic names:** El ambiente usa `weather-jobs` (queue) y `nd-dashboard-events` (topic) — NO `weather-queue` ni `dashboard-events`. El typo "nd-" existe en producción pero el código debe matchearlo. Cambiar nombres requiere recrear recursos y actualizar todos los consumers.
26. **Backend necesita Contributor para editar jobs:** El backend tiene Reader role para listar Container Apps/Jobs (Health page), pero necesita **Contributor** role para modificar jobs (Scheduler page "Guardar Cambios"). Sin Contributor: error 401 "does not have authorization to perform action 'Microsoft.App/jobs/write'". **Solución:** Bicep asigna automáticamente Reader + Contributor al backend identity (ver `backend-container-app.bicep`). Ambientes viejos: ejecutar redeploy con `deployContainerApps=true` para agregar el rol.

