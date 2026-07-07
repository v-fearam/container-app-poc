# Container App POC — Easy Auth + Full-Stack

POC de Azure Container Apps con Easy Auth (Entra ID), React + .NET 10, telemetría con Application Insights.

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
│   │   ├── src/hooks/          # useApi (Bearer interceptor)
│   │   ├── src/pages/          # HomePage, AdminPage
│   │   ├── nginx.conf          # /_authinfo endpoint
│   │   └── Dockerfile
│   └── backend/WeatherApi/     # .NET 10 API
│       ├── Controllers/        # Weather, Auth controllers
│       ├── Attributes/         # RequireAuth, RequireRole
│       ├── Services/           # EasyAuthService
│       └── Dockerfile
├── biceps/
│   ├── main.bicep              # Infra base (sin auth)
│   ├── easyauth.bicep          # Easy Auth (separado)
│   └── modules/                # Módulos reutilizables
└── docs/
    └── EASY-AUTH-TUTORIAL.md   # Guía completa de Easy Auth
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
dotnet run -- --namespace $SB_NS --queue weather-jobs --count 100
```

### Paso 6: Verificar scaling

```bash
# Ver réplicas activas
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
| [DEVELOPMENT.md](DEVELOPMENT.md) | Desarrollo local |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Detalles de deployment |

