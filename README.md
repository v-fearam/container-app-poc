# Container App POC — Easy Auth + Full-Stack

POC de Azure Container Apps con Easy Auth (Entra ID), React + .NET 10, telemetría con Application Insights.

## Tags de referencia

| Tag | Descripción | Cuándo volver |
|-----|-------------|---------------|
| `v0.2-stable` | Easy Auth + Worker + KEDA funcionando end-to-end | Si algo se rompe durante la implementación del Dashboard, comparar con `git diff v0.2-stable` |

Para volver a este punto: `git checkout v0.2-stable`
Para comparar cambios: `git diff v0.2-stable..HEAD`

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Nginx |
| Backend | .NET 10 API (Controllers + Easy Auth service) |
| Worker | .NET 10 Worker Service + Service Bus + KEDA (scale 0→10) |
| Auth | Easy Auth (Custom OIDC) + App Roles (User/Admin) |
| Infra | Azure Container Apps + ACR + Service Bus + App Insights |
| IaC | Bicep (main.bicep + easyauth.bicep separados) |

## Estructura

```
container-app-poc/
├── src/
│   ├── frontend/               # React SPA + nginx
│   │   ├── src/context/        # AuthContext (Easy Auth)
│   │   ├── src/hooks/          # useApi
│   │   ├── src/pages/          # HomePage, AdminPage
│   │   ├── nginx.conf          # /_authinfo endpoint
│   │   └── Dockerfile
│   ├── backend/WeatherApi/     # .NET 10 API
│   │   ├── Controllers/        # Weather, Auth controllers
│   │   ├── Attributes/         # RequireAuth, RequireRole
│   │   ├── Services/           # EasyAuthService
│   │   └── Dockerfile
│   ├── worker/WeatherWorker/   # .NET 10 Worker Service (Service Bus + KEDA)
│   │   ├── Worker.cs           # ServiceBusProcessor + DLQ simulations
│   │   ├── Program.cs          # DI + OpenTelemetry
│   │   └── Dockerfile
│   └── tools/ServiceBusEnqueuer/ # Console app — encola mensajes para testing
│       └── Program.cs
├── biceps/
│   ├── main.bicep              # Infra completa (Worker opcional)
│   ├── easyauth.bicep          # Easy Auth (separado)
│   └── modules/
│       ├── container-registry.bicep
│       ├── container-app.bicep
│       ├── worker-container-app.bicep  # Worker + KEDA scaler
│       ├── service-bus.bicep           # Service Bus + Queue + DLQ
│       └── managed-identity.bicep      # MI + roles (SB + AcrPull)
└── docs/
    ├── EASY-AUTH-TUTORIAL.md   # Guía completa de Easy Auth
    └── WORKER-KEDA-DESIGN.md  # Diseño Worker + KEDA + Service Bus
```

---

## 🚀 Despliegue Completo (desde cero)

### Variables de entorno

```bash
export RG="rg-far-container-app-easyauth"
export LOCATION="eastus2"
```

### Paso 1: Resource Group

```bash
az group create --name $RG --location $LOCATION
```

### Paso 2: Infraestructura base (sin Container Apps)

```bash
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters deployContainerApps=false
```

Crea: ACR, Log Analytics, Application Insights, Container App Environment.

### Paso 3: Build de imágenes en ACR

```bash
ACR_NAME=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.acrName.value' -o tsv)

# Backend
az acr build --registry $ACR_NAME \
  --image weather-api:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Frontend
az acr build --registry $ACR_NAME \
  --image weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend
```

### Paso 4: Deploy Container Apps

```bash
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters deployContainerApps=true
```

### Paso 5: Obtener URLs

```bash
FRONTEND_URL=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.frontendAppUrl.value' -o tsv)
BACKEND_URL=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.backendAppUrl.value' -o tsv)

echo "Frontend: $FRONTEND_URL"
echo "Backend:  $BACKEND_URL"
```

### Paso 6 (Opcional): Configurar Easy Auth

Ver [docs/EASY-AUTH-TUTORIAL.md](docs/EASY-AUTH-TUTORIAL.md) para la guía completa.

Resumen rápido:

```bash
# 1. Crear App Registrations en Entra ID (ver tutorial)
# 2. Setear secrets en los Container Apps
az containerapp secret set -n ca-weather-fe-dev -g $RG --secrets \
  microsoft-provider-authentication-secret="<FE_CLIENT_SECRET>" \
  token-store-sas="<SAS_URL_FROM_DEPLOYMENT>"

az containerapp secret set -n ca-weather-be-dev -g $RG --secrets \
  microsoft-provider-authentication-secret="<BE_CLIENT_SECRET>"

# 3. Deploy auth config
az deployment group create -g $RG \
  --template-file biceps/easyauth.bicep \
  --parameters \
    frontendClientId="<FE_CLIENT_ID>" \
    backendClientId="<BE_CLIENT_ID>" \
    oidcWellKnownUrl="<OIDC_DISCOVERY_URL>"
```

---

## 🔧 Worker + KEDA (extender ambiente existente)

Si ya tenés la infra base deployada, corré estos pasos para agregar el worker:

### Paso 1: Deploy infra del Worker (Service Bus + MI + roles)

```bash
# Crea Service Bus, Managed Identity con roles (SB Receiver/Sender + AcrPull)
# NO crea el Container App aún (la imagen no existe todavía)
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters deployWorker=true deployWorkerApp=false
```

### Paso 2: Build y push imagen del worker

```bash
ACR_NAME=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.acrName.value' -o tsv)

az acr build --registry $ACR_NAME \
  --image weather-worker:latest \
  --file src/worker/WeatherWorker/Dockerfile \
  src/worker/WeatherWorker
```

### Paso 3: Deploy Worker Container App

```bash
# Ahora que la imagen existe, creamos el Container App con KEDA
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters deployWorker=true deployWorkerApp=true
```

Esto crea:
- **Service Bus Namespace** (Standard) + Queue `weather-jobs` (DLQ, maxDeliveryCount:3, lock:5min)
- **User Managed Identity** con roles `Service Bus Data Receiver` + `Sender` + `AcrPull`
- **Worker Container App** con KEDA scaler (1 replica por cada 5 msgs, min:0, max:10)

### Paso 4: Asignar rol de Service Bus a tu usuario (para el enqueuer local)

```bash
# Tu usuario necesita "Azure Service Bus Data Sender" para enviar mensajes desde local
USER_OID=$(az ad signed-in-user show --query id -o tsv)
SB_ID=$(az servicebus namespace list -g $RG --query '[0].id' -o tsv)

az role assignment create \
  --assignee $USER_OID \
  --role "Azure Service Bus Data Sender" \
  --scope $SB_ID
```

### Paso 5: Test — Encolar mensajes (local)

```bash
SB_NS=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.serviceBusNamespaceFqdn.value' -o tsv)

cd src/tools/ServiceBusEnqueuer
dotnet run -- --namespace $SB_NS --queue weather-jobs --count 1000
```

### Paso 6: Verificar queue y scaling

```bash
SB_NAME=$(az servicebus namespace list -g $RG --query '[0].name' -o tsv)

# Ver tamaño de la cola (mensajes activos + DLQ)
az servicebus queue show -g $RG \
  --namespace-name $SB_NAME \
  --name weather-jobs \
  --query '{active: countDetails.activeMessageCount, deadLetter: countDetails.deadLetterMessageCount, scheduled: countDetails.scheduledMessageCount}' -o table

# Ver réplicas activas del worker
az containerapp replica list -n ca-weather-worker-dev -g $RG -o table

# Ver logs en tiempo real
az containerapp logs show -n ca-weather-worker-dev -g $RG --follow
```

### Verificar DLQ

Los mensajes #10 (exception), #20 (validación) y #30 (timeout) van a la Dead Letter Queue:

```bash
# Contar mensajes en DLQ
az servicebus queue show -g $RG \
  --namespace-name $(az servicebus namespace list -g $RG --query '[0].name' -o tsv) \
  --name weather-jobs \
  --query 'countDetails.deadLetterMessageCount' -o tsv
```

Ver [docs/WORKER-KEDA-DESIGN.md](docs/WORKER-KEDA-DESIGN.md) para el diseño completo.

---

## 📊 Dashboard POC (monitoreo + DLQ management)

Si ya tenés Worker + KEDA funcionando, podés extender el ambiente con el **Dashboard POC**: frontend en tiempo real para KPIs, gestión de DLQ, y health de componentes.

**Arquitectura:**
- **SQL Database** (Basic 5 DTUs) — almacena contadores por vertical + queue + processType + fecha
- **Service Bus Topic `nd-dashboard-events`** + subscription `counter-updater`
- **DashboardWorker** — consume eventos del topic, actualiza contadores en SQL (KEDA topic subscription scaler)
- **Backend APIs** — `/api/dashboard/kpi`, `/api/dlq/*`, `/api/health/components`
- **Frontend** — DashboardPage, DlqManagerPage, HealthPage (auto-refresh)

### Paso 1: Deploy infra del Dashboard (SQL + Topic + Subscription)

```bash
# Prereqs: ACR, Container App Environment, Service Bus ya deployados con Worker
# Obtener info del SQL admin (tu usuario de Entra ID)
USER_OID=$(az ad signed-in-user show --query id -o tsv)
USER_UPN=$(az ad signed-in-user show --query userPrincipalName -o tsv)

# Deploy SQL Database + topic + subscription (NO el Dashboard Worker Container App aún)
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters deployDashboard=true \
    sqlServerName="sql-weather-dash-$RANDOM" \
    sqlAdminObjectId="$USER_OID" \
    sqlAdminLogin="$USER_UPN"
```

**Salida esperada:** SQL Server + Database `dashboard-db`, Topic `nd-dashboard-events`, Subscription `counter-updater`.

### Paso 2: Crear schema SQL

```bash
# Obtener nombre del SQL Server
SQL_SERVER=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.sqlServerFqdn.value' -o tsv)

# Conectar como Entra ID admin y ejecutar el schema
az sql server show -g $RG --name ${SQL_SERVER%%.database.windows.net} --query fullyQualifiedDomainName

# Usando sqlcmd o Azure Portal Query Editor:
sqlcmd -S $SQL_SERVER -d dashboard-db -G -i sql/001-dashboard-schema.sql
```

Si no tenés `sqlcmd`, usá **Azure Portal → SQL Database → Query editor (preview)** y pegá el contenido de `sql/001-dashboard-schema.sql`.

### Paso 3: Mapear Managed Identity como usuario SQL (MANUAL)

**⚠️ Paso manual obligatorio**: conectar como Entra ID admin y ejecutar:

```sql
-- Reemplazar 'identity-weather-dev' con el nombre de tu User Assigned Managed Identity
CREATE USER [identity-weather-dev] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [identity-weather-dev];
ALTER ROLE db_datawriter ADD MEMBER [identity-weather-dev];
GO
```

Para obtener el nombre de la identity:

```bash
az deployment group show -g $RG --name main \
  --query 'properties.outputs.managedIdentityName.value' -o tsv
```

### Paso 4: Build imágenes Dashboard (backend + DashboardWorker)

```bash
ACR_NAME=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.acrName.value' -o tsv)

# Backend (rebuild para incluir nuevos controllers)
az acr build --registry $ACR_NAME \
  --image weather-api:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Dashboard Worker (nuevo)
az acr build --registry $ACR_NAME \
  --image dashboard-worker:latest \
  --file src/worker/DashboardWorker/Dockerfile \
  src/worker/DashboardWorker
```

### Paso 5: Redeploy backend + deploy DashboardWorker Container App

```bash
# Redeploy backend (actualiza con nuevos controllers)
az containerapp update -n ca-weather-be-dev -g $RG

# Obtener SQL connection string
SQL_SERVER=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.sqlServerFqdn.value' -o tsv)
SQL_CONN="Server=${SQL_SERVER};Database=dashboard-db;Authentication=Active Directory Default"

# Deploy DashboardWorker Container App con SQL connection string
az deployment group create \
  --resource-group $RG \
  --template-file biceps/modules/dashboard-worker-container-app.bicep \
  --parameters \
    containerAppName="ca-dashboard-worker-dev" \
    environmentId="$(az deployment group show -g $RG --name main --query 'properties.outputs.containerAppEnvironmentId.value' -o tsv)" \
    containerImage="${ACR_NAME}.azurecr.io/dashboard-worker:latest" \
    acrName="$ACR_NAME" \
    managedIdentityId="$(az deployment group show -g $RG --name main --query 'properties.outputs.managedIdentityId.value' -o tsv)" \
    managedIdentityClientId="$(az deployment group show -g $RG --name main --query 'properties.outputs.managedIdentityClientId.value' -o tsv)" \
    serviceBusNamespaceFqdn="$(az deployment group show -g $RG --name main --query 'properties.outputs.serviceBusNamespaceFqdn.value' -o tsv)" \
    sqlConnectionString="$SQL_CONN" \
    appInsightsConnectionString="$(az monitor app-insights component show -g $RG --query '[0].connectionString' -o tsv)"
```

### Paso 6: Test — Encolar mensajes y verificar eventos

```bash
SB_NS=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.serviceBusNamespaceFqdn.value' -o tsv)

# El enqueuer ahora publica eventos a nd-dashboard-events
cd src/tools/ServiceBusEnqueuer
dotnet run -- --namespace $SB_NS --queue weather-jobs --count 100
```

### Paso 7: Verificar Dashboard Worker escalando

```bash
# Ver mensajes en subscription
SB_NAME=$(az servicebus namespace list -g $RG --query '[0].name' -o tsv)
az servicebus topic subscription show -g $RG \
  --namespace-name $SB_NAME \
  --topic-name nd-dashboard-events \
  --name counter-updater \
  --query 'countDetails.{active:activeMessageCount,deadLetter:deadLetterMessageCount}' -o table

# Ver réplicas del Dashboard Worker (KEDA topic subscription scaler)
az containerapp replica list -n ca-dashboard-worker-dev -g $RG -o table

# Logs del Dashboard Worker
az containerapp logs show -n ca-dashboard-worker-dev -g $RG --follow
```

### Paso 8: Acceder al Dashboard UI

```bash
FRONTEND_URL=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.frontendAppUrl.value' -o tsv)

echo "Dashboard: ${FRONTEND_URL}/dashboard"
echo "Health:    ${FRONTEND_URL}/health"
echo "DLQ Mgmt:  ${FRONTEND_URL}/dashboard/dlq/weather-jobs"
```

**Páginas:**
- `/dashboard` — KPIs en tiempo real (auto-refresh 5s): contadores por vertical + queue + processType
- `/dashboard/dlq/:queueName` — Gestión de DLQ: peek, editar body, reencolar, descartar
- `/health` — Estado de componentes (auto-refresh 30s)

### Paso 9: Verificar end-to-end

```sql
-- Consultar contadores en SQL
SELECT vertical, queueName, processType, date, enqueuedCount, processedCount, dlqCount
FROM QueueCounters
ORDER BY date DESC, vertical, queueName, processType;
```

**Flujo completo:**
1. `ServiceBusEnqueuer` → envía mensaje a `weather-jobs` + publica `MessageEnqueued` a topic
2. `WeatherWorker` (KEDA queue scaler) → procesa mensaje → publica `MessageProcessed` a topic
3. `DashboardWorker` (KEDA topic scaler) → consume eventos → UPSERT en SQL
4. Frontend `/dashboard` → GET `/api/dashboard/kpi` → muestra contadores + DLQ counts live

Ver [docs/dashboard-poc.md](docs/dashboard-poc.md) para el diseño completo.

---

## 🔄 Actualizar código (rebuild + redeploy)

```bash
ACR_NAME=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.acrName.value' -o tsv)

# Rebuild
az acr build --registry $ACR_NAME --image weather-api:latest --file src/backend/WeatherApi/Dockerfile src/backend/WeatherApi

az acr build --registry $ACR_NAME --image weather-frontend:latest --file src/frontend/Dockerfile src/frontend

# Redeploy (force new revision)
az containerapp update -n ca-weather-be-dev -g $RG
az containerapp update -n ca-weather-fe-dev -g $RG
```

---

## 🧹 Limpiar recursos

```bash
az group delete --name $RG --yes --no-wait
```

---

## 📊 Monitoreo

Telemetría end-to-end con **OpenTelemetry + Azure Monitor**:

**Backend (.NET 10)**:
- Paquete: `Azure.Monitor.OpenTelemetry.AspNetCore` → `UseAzureMonitor()`
- Auto-recolecta: HTTP requests, dependencies, ILogger logs, exceptions, metrics
- [Docs: Enable OpenTelemetry](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable)

**Frontend (React SPA)**:
- Page views, custom events, route tracking via Application Insights JS SDK

**Managed OTel Agent (platform level)**:
- Configurado en el Container App Environment vía Bicep
- Reenvía traces y logs a App Insights sin cambios en la app
- [Docs: OTel agents in Container Apps](https://learn.microsoft.com/azure/container-apps/opentelemetry-agents)

**Arquitectura dual**: la app envía directo a App Insights (via SDK) + el managed agent captura logs/traces adicionales a nivel plataforma. Esto garantiza visibilidad completa.

```kql
// Requests últimas 24h
requests | where timestamp > ago(24h)
| summarize count(), avg(duration) by name, resultCode

// ILogger traces
traces | where timestamp > ago(24h) and customDimensions.CategoryName startswith "WeatherApi"
```

---

## 📚 Documentación

| Doc | Contenido |
|-----|-----------|
| [docs/EASY-AUTH-TUTORIAL.md](docs/EASY-AUTH-TUTORIAL.md) | Guía completa Easy Auth: App Registrations, Token Store, Custom OIDC, roles |
| [docs/WORKER-KEDA-DESIGN.md](docs/WORKER-KEDA-DESIGN.md) | Diseño Worker + KEDA + Service Bus: arquitectura, DLQ, scaling |
| [docs/dashboard-poc.md](docs/dashboard-poc.md) | Dashboard POC: diseño completo, arquitectura, implementación paso a paso |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Desarrollo local |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Detalles de deployment |


