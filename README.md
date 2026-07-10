# Container App POC — Easy Auth + Full-Stack

POC de Azure Container Apps con Easy Auth (Entra ID), React + .NET 10, telemetría con Application Insights.

## Tags de referencia

| Tag | Descripción | Cuándo volver |
|-----|-------------|---------------|
| `v0.2-stable` | Easy Auth + Worker + KEDA funcionando end-to-end | Si algo se rompe durante la implementación del Dashboard, comparar con `git diff v0.2-stable` |

Para volver a este punto: `git checkout v0.2-stable`
Para comparar cambios: `git diff v0.2-stable..HEAD`

## Arquitectura

```mermaid
graph TB
    subgraph "User"
        Browser[🌐 Browser]
    end

    subgraph "Azure Container Apps Environment"
        subgraph "Frontend"
            FE[React SPA<br/>Nginx<br/>Easy Auth]
        end
        
        subgraph "Backend"
            BE[.NET 10 API<br/>Weather/Dashboard/DLQ/Health<br/>Easy Auth]
        end
        
        subgraph "Workers"
            WW[WeatherWorker<br/>.NET 10<br/>KEDA Queue Scaler]
            DW[DashboardWorker<br/>.NET 10<br/>KEDA Topic Scaler]
        end
    end

    subgraph "Azure Services"
        ACR[Container Registry<br/>ACR]
        SB[Service Bus<br/>Standard]
        SQL[SQL Database<br/>Basic 5 DTUs]
        AI[Application Insights<br/>OpenTelemetry]
        ENTRA[Entra ID<br/>App Registrations<br/>Custom OIDC]
    end

    subgraph "Service Bus Resources"
        Q[Queue: weather-jobs<br/>+ DLQ]
        T[Topic: nd-dashboard-events]
        S[Subscription: counter-updater<br/>+ DLQ]
    end

    subgraph "SQL Database Tables"
        QC[QueueCounters<br/>vertical+queue+processType+date]
        CH[ComponentHealth<br/>worker heartbeats]
    end

    subgraph "Managed Identity"
        MI[User Assigned MI<br/>Roles:<br/>- SB Data Owner<br/>- AcrPull<br/>- SQL db_reader/writer]
    end

    %% User interactions
    Browser -->|HTTPS| FE
    FE -->|Easy Auth redirect| ENTRA
    FE -->|API calls| BE
    
    %% Backend interactions
    BE -->|Query counters + DLQ| SB
    BE -->|Query SQL| SQL
    BE -->|Telemetry| AI
    
    %% Worker flows
    WW -->|Pull messages| Q
    WW -->|Publish MessageProcessed| T
    DW -->|Consume events| S
    DW -->|UPSERT counters| QC
    DW -->|Heartbeat| CH
    
    %% Service Bus topology
    SB -.->|Contains| Q
    SB -.->|Contains| T
    T -.->|Routes to| S
    
    %% SQL topology
    SQL -.->|Contains| QC
    SQL -.->|Contains| CH
    
    %% ACR
    ACR -->|Pull images| FE
    ACR -->|Pull images| BE
    ACR -->|Pull images| WW
    ACR -->|Pull images| DW
    
    %% Managed Identity auth
    MI -->|Authenticate| WW
    MI -->|Authenticate| DW
    MI -->|Authenticate| BE
    
    %% Telemetry
    FE -->|Page views| AI
    WW -->|Traces| AI
    DW -->|Traces| AI

    %% Styling
    classDef azure fill:#0078D4,stroke:#fff,stroke-width:2px,color:#fff
    classDef servicebus fill:#59B4D9,stroke:#fff,stroke-width:2px,color:#fff
    classDef worker fill:#68217A,stroke:#fff,stroke-width:2px,color:#fff
    classDef database fill:#E81123,stroke:#fff,stroke-width:2px,color:#fff
    classDef frontend fill:#00BCF2,stroke:#fff,stroke-width:2px,color:#fff
    
    class ACR,AI,ENTRA,SB azure
    class Q,T,S servicebus
    class WW,DW worker
    class SQL,QC,CH database
    class FE,BE frontend
```

**Flujo end-to-end:**
1. `ServiceBusEnqueuer` → envía mensaje a `weather-jobs` + publica `MessageEnqueued` a `nd-dashboard-events`
2. `WeatherWorker` (KEDA queue scaler 0→10) → procesa mensaje → publica `MessageProcessed` a topic
3. `DashboardWorker` (KEDA topic scaler 0→10) → consume eventos → UPSERT en SQL `QueueCounters`
4. Frontend `/dashboard` → GET `/api/dashboard/kpi` → muestra contadores + DLQ counts en tiempo real (refresh 5s)

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Nginx |
| Backend | .NET 10 API (Controllers + Easy Auth service + Dashboard APIs) |
| Workers | .NET 10 Worker Service + Service Bus + KEDA (scale 0→10) |
| Database | Azure SQL Database (Basic 5 DTUs) |
| Auth | Easy Auth (Custom OIDC) + App Roles (User/Admin) |
| Infra | Azure Container Apps + ACR + Service Bus + SQL + App Insights |
| IaC | Bicep (main.bicep + easyauth.bicep + módulos) |

## Estructura

```
container-app-poc/
├── src/
│   ├── frontend/                       # React SPA + nginx
│   │   ├── src/context/                # AuthContext (Easy Auth)
│   │   ├── src/hooks/                  # useApi (get + post)
│   │   ├── src/pages/                  # HomePage, AdminPage, DashboardPage, DlqManagerPage, HealthPage
│   │   ├── nginx.conf                  # /_authinfo endpoint
│   │   └── Dockerfile
│   ├── backend/WeatherApi/             # .NET 10 API
│   │   ├── Controllers/                # Weather, Auth, Dashboard, DlqManager, Health
│   │   ├── Models/                     # DashboardModels (DTOs)
│   │   ├── Attributes/                 # RequireAuth, RequireRole
│   │   ├── Services/                   # EasyAuthService
│   │   └── Dockerfile
│   ├── worker/
│   │   ├── WeatherWorker/              # .NET 10 Worker Service (Service Bus queue + KEDA)
│   │   │   ├── Handlers/               # MessageDispatcher, DefaultHandler, DLQ simulations
│   │   │   ├── Services/               # ServiceBusWorker
│   │   │   ├── Program.cs              # DI + OpenTelemetry + Topic Sender
│   │   │   └── Dockerfile
│   │   └── DashboardWorker/            # .NET 10 Worker Service (Service Bus topic + KEDA)
│   │       ├── Services/               # DashboardWorkerService (topic processor + SQL UPSERT)
│   │       ├── Models/                 # DashboardEvent
│   │       ├── Configuration/          # ServiceBusOptions, SqlOptions
│   │       ├── Program.cs              # DI + OpenTelemetry
│   │       └── Dockerfile
│   └── tools/ServiceBusEnqueuer/       # Console app — encola mensajes + publica eventos
│       └── Program.cs
├── biceps/
│   ├── main.bicep                      # Orquestador principal (Worker + Dashboard opcionales)
│   ├── easyauth.bicep                  # Easy Auth config (separado)
│   └── modules/
│       ├── container-registry.bicep
│       ├── container-app.bicep         # Frontend + Backend Container Apps
│       ├── worker-container-app.bicep  # WeatherWorker + KEDA queue scaler
│       ├── dashboard-worker-container-app.bicep  # DashboardWorker + KEDA topic scaler
│       ├── service-bus.bicep           # Service Bus + Queue (weather-jobs) + Topic (nd-dashboard-events) + Subscription
│       ├── sql-database.bicep          # SQL Server + Database (Entra ID admin)
│       └── managed-identity.bicep      # User Assigned MI + roles (SB Data Owner, AcrPull, SQL)
├── sql/
│   └── 001-dashboard-schema.sql        # QueueCounters + ComponentHealth tables
└── docs/
    ├── EASY-AUTH-TUTORIAL.md           # Guía completa de Easy Auth
    ├── WORKER-KEDA-DESIGN.md           # Diseño Worker + KEDA + Service Bus
    └── dashboard-poc.md                # Dashboard POC: diseño, arquitectura, implementación
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

**⚠️ Prerrequisito:** Esta sección asume que ya seguiste los pasos de **"🚀 Despliegue Completo (desde cero)"** y **"🔧 Worker + KEDA"** arriba, es decir, ya tenés:
- ACR con imágenes del backend, frontend y WeatherWorker
- Container App Environment
- Service Bus con queue `weather-jobs`
- Managed Identity

Si estás empezando desde cero, **primero completá esas secciones**. Esta sección es para **extender** el ambiente existente con el Dashboard POC.

**Qué agrega el Dashboard POC:**
- **SQL Database** (Basic 5 DTUs) — almacena contadores por vertical + queue + processType + fecha
- **Service Bus Topic `nd-dashboard-events`** + subscription `counter-updater`
- **DashboardWorker** — consume eventos del topic, actualiza contadores en SQL (KEDA topic subscription scaler)
- **Backend APIs actualizados** — `/api/dashboard/kpi`, `/api/dlq/*`, `/api/health/components`
- **Frontend actualizado** — DashboardPage, DlqManagerPage, HealthPage (auto-refresh)

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

### Paso 4: Rebuild imágenes (Backend + WeatherWorker + nuevo DashboardWorker)

**⚠️ Importante:** Si venís de hacer el deploy inicial, las imágenes del backend y WeatherWorker ya existen en el ACR pero están desactualizadas (no tienen el código del Dashboard POC). Necesitás **rebuild** de las 3 imágenes:

```bash
ACR_NAME=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.acrName.value' -o tsv)

# Backend (REBUILD para incluir nuevos controllers: Dashboard, DlqManager, Health)
az acr build --registry $ACR_NAME \
  --image weather-api:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# WeatherWorker (REBUILD para incluir publicación de eventos al topic)
az acr build --registry $ACR_NAME \
  --image weather-worker:latest \
  --file src/worker/WeatherWorker/Dockerfile \
  src/worker/WeatherWorker

# DashboardWorker (NUEVO - primera vez)
az acr build --registry $ACR_NAME \
  --image dashboard-worker:latest \
  --file src/worker/DashboardWorker/Dockerfile \
  src/worker/DashboardWorker

# Frontend (REBUILD para incluir nuevas páginas: Dashboard, DlqManager, Health)
az acr build --registry $ACR_NAME \
  --image weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend
```

### Paso 5: Redeploy Backend + Frontend + WeatherWorker, y deploy DashboardWorker

Ahora que las 4 imágenes están actualizadas en el ACR, redeploy los Container Apps existentes y crea el nuevo DashboardWorker:

```bash
# Redeploy Backend (pull nueva imagen con controllers Dashboard/DlqManager/Health)
az containerapp update -n ca-weather-be-dev -g $RG

# Redeploy Frontend (pull nueva imagen con páginas Dashboard/DlqManager/Health)
az containerapp update -n ca-weather-fe-dev -g $RG

# Redeploy WeatherWorker (pull nueva imagen con publicación de eventos)
az containerapp update -n ca-weather-worker-dev -g $RG

# Obtener SQL connection string
SQL_SERVER=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.sqlServerFqdn.value' -o tsv)
SQL_CONN="Server=${SQL_SERVER};Database=dashboard-db;Authentication=Active Directory Default"

# Deploy DashboardWorker Container App (NUEVO - primera vez)
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


