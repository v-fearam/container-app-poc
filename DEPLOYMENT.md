# Guía de Despliegue - Container App POC

Esta guía detalla **paso a paso** cómo desplegar la aplicación completa (Frontend + Backend) a Azure Container Apps usando WSL y Azure CLI.

## 📋 Pre-requisitos

- ✅ WSL (Windows Subsystem for Linux) o Linux
- ✅ Docker Desktop corriendo
- ✅ Azure CLI instalado y autenticado
- ✅ Subscription de Azure activa

## 🚀 Despliegue Paso a Paso

### Paso 1: Configurar Variables de Ambiente

Abre tu terminal WSL y configura las variables:

```bash
export AZURE_RESOURCE_GROUP="rg-far-container-app-easyauth"
export AZURE_LOCATION="eastus2"
```

**Nota**: Puedes cambiar estos valores según tus necesidades.

### Paso 2: Login a Azure

```bash
# Login a Azure CLI
az login

# Verificar tu subscription actual
az account show --output table

# (Opcional) Si tienes múltiples subscriptions, selecciona una
az account list --output table
az account set --subscription "TU_SUBSCRIPTION_ID"
```

### Paso 3: Crear Resource Group

```bash
az group create \
  --name $AZURE_RESOURCE_GROUP \
  --location $AZURE_LOCATION
```

✅ Esto crea el contenedor lógico para todos tus recursos.

### Paso 4: Desplegar Infraestructura Base

```bash
az deployment group create \
  --resource-group $AZURE_RESOURCE_GROUP \
  --template-file biceps/main.bicep \
  --parameters location=$AZURE_LOCATION deployContainerApps=false
```

**¿Qué despliega este comando?**
- ✅ Azure Container Registry (ACR) - para almacenar tus imágenes Docker
- ✅ Log Analytics Workspace - para logs centralizados
- ✅ Application Insights - para telemetría y monitoreo
- ✅ Container App Environment - el ambiente donde correrán tus apps

⏱️ **Tiempo estimado**: 3-5 minutos

### Paso 5: Obtener el Nombre del ACR

```bash
ACR_NAME=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.acrName.value' \
  --output tsv)

echo "📦 ACR Name: $ACR_NAME"
```

### Paso 6: Construir las Imágenes Docker

```bash
# Construir imagen del backend (.NET 10 Minimal API)
docker build \
  -t camuzzi-weather-backend:latest \
  -f src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Construir imagen del frontend (React + Nginx)
docker build \
  -t camuzzi-weather-frontend:latest \
  -f src/frontend/Dockerfile \
  src/frontend
```

**¿Qué hace cada build?**
- **Backend**: Compila .NET 10 → runtime optimizado (multi-stage)
- **Frontend**: Build de Vite → servidor Nginx Alpine (multi-stage)

⏱️ **Tiempo estimado**: 2-4 minutos por imagen

### Paso 7: Login al ACR

```bash
az acr login --name $ACR_NAME
```

✅ Esto autentica tu Docker local con tu Azure Container Registry.

### Paso 8: Tagear las Imágenes

```bash
# Tagear backend
docker tag camuzzi-weather-backend:latest \
  $ACR_NAME.azurecr.io/camuzzi-weather-backend:latest

# Tagear frontend
docker tag camuzzi-weather-frontend:latest \
  $ACR_NAME.azurecr.io/camuzzi-weather-frontend:latest
```

### Paso 9: Push de las Imágenes al ACR

```bash
# Push backend
docker push $ACR_NAME.azurecr.io/camuzzi-weather-backend:latest

# Push frontend
docker push $ACR_NAME.azurecr.io/camuzzi-weather-frontend:latest
```

⏱️ **Tiempo estimado**: 2-3 minutos (depende de tu conexión)

### Paso 10: Desplegar las Container Apps

```bash
az deployment group create \
  --resource-group $AZURE_RESOURCE_GROUP \
  --template-file biceps/main.bicep \
  --parameters location=$AZURE_LOCATION deployContainerApps=true
```

**¿Qué despliega este comando?**
- ✅ **Backend Container App** (`ca-backend-weather`)
  - Puerto: 8080
  - CPU: 0.5 cores, RAM: 1 GB
  - Auto-scaling: 1-3 replicas
  - App Insights configurado
  
- ✅ **Frontend Container App** (`ca-frontend-weather`)
  - Puerto: 80
  - CPU: 0.25 cores, RAM: 0.5 GB
  - Auto-scaling: 1-5 replicas
  - Variable `VITE_API_URL` apuntando al backend
  - App Insights configurado

- ✅ **Managed Identity** con permisos de `AcrPull` para ambas apps

⏱️ **Tiempo estimado**: 2-3 minutos

### Paso 11: Obtener las URLs de tu Aplicación

```bash
# URL del Frontend
FRONTEND_URL=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.frontendAppUrl.value' \
  --output tsv)

# URL del Backend
BACKEND_URL=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.backendAppUrl.value' \
  --output tsv)

echo ""
echo "🎉 Deployment Complete!"
echo ""
echo "🌐 Frontend: $FRONTEND_URL"
echo "🌐 Backend:  $BACKEND_URL"
```

### Paso 12: Verificar que Todo Funciona

```bash
# Probar el backend
curl $BACKEND_URL/weatherforecast

# Abrir el frontend en tu browser
echo "Abre en tu navegador: $FRONTEND_URL"
```

---

## 🔄 Actualizar una Aplicación Existente

Si ya desplegaste y solo quieres actualizar el código:

### Actualizar Backend

```bash
# 1. Hacer tus cambios en src/backend/WeatherApi/

# 2. Reconstruir la imagen
docker build -t camuzzi-weather-backend:latest \
  -f src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# 3. Tagear y subir
docker tag camuzzi-weather-backend:latest \
  $ACR_NAME.azurecr.io/camuzzi-weather-backend:latest
docker push $ACR_NAME.azurecr.io/camuzzi-weather-backend:latest

# 4. Obtener el nombre del Container App
BACKEND_APP=$(az containerapp list \
  --resource-group $AZURE_RESOURCE_GROUP \
  --query "[?contains(name, 'backend')].name" \
  --output tsv)

# 5. Crear nueva revisión (restart para que tome la nueva imagen)
az containerapp revision restart \
  --name $BACKEND_APP \
  --resource-group $AZURE_RESOURCE_GROUP
```

### Actualizar Frontend

```bash
# 1. Hacer tus cambios en src/frontend/

# 2. Reconstruir la imagen
docker build -t camuzzi-weather-frontend:latest \
  -f src/frontend/Dockerfile \
  src/frontend

# 3. Tagear y subir
docker tag camuzzi-weather-frontend:latest \
  $ACR_NAME.azurecr.io/camuzzi-weather-frontend:latest
docker push $ACR_NAME.azurecr.io/camuzzi-weather-frontend:latest

# 4. Obtener el nombre del Container App
FRONTEND_APP=$(az containerapp list \
  --resource-group $AZURE_RESOURCE_GROUP \
  --query "[?contains(name, 'frontend')].name" \
  --output tsv)

# 5. Crear nueva revisión
az containerapp revision restart \
  --name $FRONTEND_APP \
  --resource-group $AZURE_RESOURCE_GROUP
```

---

## 📊 Monitoreo y Troubleshooting

### Ver Logs en Tiempo Real

```bash
# Logs del backend
az containerapp logs show \
  --name ca-backend-weather \
  --resource-group $AZURE_RESOURCE_GROUP \
  --follow

# Logs del frontend
az containerapp logs show \
  --name ca-frontend-weather \
  --resource-group $AZURE_RESOURCE_GROUP \
  --follow
```

### Ver Métricas en Application Insights

```bash
# Queries de ejemplo en Log Analytics
az monitor log-analytics query \
  --workspace $(az deployment group show \
    --resource-group $AZURE_RESOURCE_GROUP \
    --name main \
    --query 'properties.outputs.logAnalyticsWorkspaceId.value' -o tsv) \
  --analytics-query "requests | where timestamp > ago(1h) | summarize count() by resultCode"
```

### Verificar Estado de las Apps

```bash
# Ver todas las container apps
az containerapp list \
  --resource-group $AZURE_RESOURCE_GROUP \
  --output table

# Detalles de una app específica
az containerapp show \
  --name ca-backend-weather \
  --resource-group $AZURE_RESOURCE_GROUP
```

---

## 🗑️ Limpiar Recursos

Cuando termines de probar, puedes eliminar todo:

```bash
# ⚠️ CUIDADO: Esto elimina TODOS los recursos del resource group
az group delete \
  --name $AZURE_RESOURCE_GROUP \
  --yes \
  --no-wait
```

Este script hace TODO automáticamente:
1. ✅ Crea el Resource Group
2. ✅ Despliega infraestructura (ACR, Log Analytics, App Insights, Container App Environment)
3. ✅ Construye las imágenes Docker
4. ✅ Sube las imágenes al ACR
5. ✅ Despliega ambos Container Apps (Frontend y Backend)
6. ✅ Configura App Insights y variables de entorno

Al finalizar, verás las URLs de tu aplicación:
```
🌐 Application URLs:
  • Frontend: https://ca-frontend-weather.xxx.azurecontainerapps.io
  • Backend:  https://ca-backend-weather.xxx.azurecontainerapps.io
```

---

## 🔧 Despliegue Manual Paso a Paso (Opción 2)

Si prefieres control total del proceso:

### Paso 1: Login y Configuración

```powershell
# Login a Azure
az login

# Configurar subscription (si tienes múltiples)
az account set --subscription "TU_SUBSCRIPTION_ID"

# Variables de ambiente
$env:AZURE_RESOURCE_GROUP = "rg-far-container-app-easyauth"
$env:AZURE_LOCATION = "eastus2"
```

### Paso 2: Crear Resource Group

```powershell
az group create `
  --name $env:AZURE_RESOURCE_GROUP `
  --location $env:AZURE_LOCATION
```

### Paso 3: Desplegar Infraestructura Base

```powershell
# Desplegar sin Container Apps primero
az deployment group create `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --template-file biceps/main.bicep `
  --parameters location=$env:AZURE_LOCATION deployContainerApps=false
```

Esto crea:
- ✅ Azure Container Registry (ACR)
- ✅ Log Analytics Workspace
- ✅ Application Insights
- ✅ Container App Environment

### Paso 4: Obtener el nombre del ACR

```powershell
$ACR_NAME = az deployment group show `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --name main `
  --query 'properties.outputs.acrName.value' `
  --output tsv

Write-Host "ACR Name: $ACR_NAME"
```

### Paso 5: Construir Imágenes Docker

```powershell
# Construir ambas imágenes
.\scripts\build-images.ps1
```

Esto construye:
- `camuzzi-weather-backend:latest` (.NET 10 API)
- `camuzzi-weather-frontend:latest` (React + Nginx)

### Paso 6: Subir Imágenes al ACR

```powershell
# Push to Azure Container Registry
.\scripts\push-to-acr.ps1 -AcrName $ACR_NAME
```

### Paso 7: Desplegar Container Apps

```powershell
# Ahora sí, desplegar los Container Apps
az deployment group create `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --template-file biceps/main.bicep `
  --parameters location=$env:AZURE_LOCATION deployContainerApps=true
```

Esto crea:
- ✅ **Backend Container App** (`ca-backend-weather`)
  - Puerto: 8080
  - Replicas: 1-3 (auto-scaling)
  - CPU: 0.5 cores, Memory: 1 GB
  - App Insights configurado

- ✅ **Frontend Container App** (`ca-frontend-weather`)
  - Puerto: 80
  - Replicas: 1-5 (auto-scaling)
  - CPU: 0.25 cores, Memory: 0.5 GB
  - App Insights configurado
  - Variable VITE_API_URL apuntando al backend

### Paso 8: Obtener URLs de la Aplicación

```powershell
# URL del Frontend
$FRONTEND_URL = az deployment group show `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --name main `
  --query 'properties.outputs.frontendAppUrl.value' `
  --output tsv

# URL del Backend
$BACKEND_URL = az deployment group show `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --name main `
  --query 'properties.outputs.backendAppUrl.value' `
  --output tsv

Write-Host "Frontend: $FRONTEND_URL"
Write-Host "Backend:  $BACKEND_URL"
```

---

## 🔄 Actualizar una Aplicación Existente

Si ya desplegaste y solo quieres actualizar el código:

```powershell
# 1. Construir nuevas imágenes
.\scripts\build-images.ps1

# 2. Subir al ACR
.\scripts\push-to-acr.ps1 -AcrName $ACR_NAME

# 3. Reiniciar los Container Apps para que tomen la nueva imagen
az containerapp revision restart `
  --name ca-backend-weather `
  --resource-group $RESOURCE_GROUP `
  --revision-name latest

az containerapp revision restart `
  --name ca-frontend-weather `
  --resource-group $RESOURCE_GROUP `
  --revision-name latest
```

O simplemente re-ejecutar el despliegue de Bicep (más lento pero más seguro):

```powershell
az deployment group create `
  --resource-group $RESOURCE_GROUP `
  --template-file biceps/main.bicep `
  --parameters location=$LOCATION deployContainerApps=true
```

---

## 📊 Monitoreo con Application Insights

Una vez desplegado, puedes ver la telemetría en tiempo real:

### Portal de Azure

1. Ve a **Application Insights** → `appi-camuzzi-weather`
2. Secciones importantes:
   - **Application Map**: Ver flujo frontend → backend
   - **Live Metrics**: Métricas en tiempo real
   - **Performance**: Tiempos de respuesta
   - **Failures**: Errores y excepciones

### Consultas KQL Útiles

```kql
// Requests al frontend y backend
requests
| where cloud_RoleName in ("ca-frontend-weather", "ca-backend-weather")
| summarize count(), avg(duration) by cloud_RoleName, resultCode
| render barchart

// Dependencias (llamadas frontend → backend)
dependencies
| where cloud_RoleName == "ca-frontend-weather"
| where target has "ca-backend-weather"
| project timestamp, duration, success, resultCode

// Trace completo end-to-end
requests
| where operation_Id == "XXX" // Reemplaza con un operation_Id específico
| union dependencies
| project timestamp, itemType, name, duration, success
| order by timestamp asc
```

---

## 🧹 Limpiar Recursos

Para eliminar todo:

```powershell
az group delete `
  --name $RESOURCE_GROUP `
  --yes `
  --no-wait
```

---

## 🐛 Troubleshooting

### El Container App no arranca

```powershell
# Ver logs del container
az containerapp logs show `
  --name ca-backend-weather `
  --resource-group $RESOURCE_GROUP `
  --tail 50

# Ver revisiones
az containerapp revision list `
  --name ca-backend-weather `
  --resource-group $RESOURCE_GROUP `
  --query "[].{Name:name, Created:properties.createdTime, Active:properties.active}"
```

### Error de permisos de ACR

```powershell
# Asignar rol AcrPull manualmente
$CONTAINER_APP_PRINCIPAL_ID = az containerapp show `
  --name ca-backend-weather `
  --resource-group $RESOURCE_GROUP `
  --query 'identity.principalId' `
  --output tsv

az role assignment create `
  --assignee $CONTAINER_APP_PRINCIPAL_ID `
  --role AcrPull `
  --scope "/subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.ContainerRegistry/registries/$ACR_NAME"
```

### Frontend no se conecta al backend

Verifica que la variable de entorno esté configurada:

```powershell
az containerapp show `
  --name ca-frontend-weather `
  --resource-group $RESOURCE_GROUP `
  --query 'properties.template.containers[0].env'
```

Debería incluir:
```json
{
  "name": "VITE_API_URL",
  "value": "https://ca-backend-weather.xxx.azurecontainerapps.io"
}
```

---

## 🔧 Container Apps Jobs - Despliegue de Jobs Programados

Esta sección cubre cómo desplegar Container Apps Jobs (tareas programadas) para ejecutar workloads batch y event-driven.

### Paso 1: Ejecutar Migración SQL para JobExecutions

```bash
# Variables
export RG="rg-far-container-app-easyauth"
export SQL_SERVER=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.sqlServerFqdn.value' -o tsv | cut -d'.' -f1)

# Ejecutar migración 003_JobExecutions.sql
az sql db query \
  --server $SQL_SERVER \
  --database dashboard-poc \
  --auth-mode ActiveDirectoryPassword \
  --file sql/003_JobExecutions.sql
```

Esta migración crea la tabla `JobExecutions` para trackear ejecuciones de jobs programados.

### Paso 2: Build y Push WeatherEnqueuer Job Image

```bash
# Variables
export ACR=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.acrName.value' -o tsv)

# Build usando ACR (recomendado para evitar problemas de encoding en Windows)
az acr build --registry $ACR \
  --image weather-enqueuer:latest \
  --file src/jobs/WeatherEnqueuer/Dockerfile \
  src/jobs/WeatherEnqueuer
```

**¿Qué hace WeatherEnqueuer?**
- ✅ Encola N mensajes a `weather-queue` (N = env var `MESSAGE_COUNT`)
- ✅ Publica evento `JobExecuted` a `dashboard-events` topic
- ✅ Usa .NET Generic Host + DI + AddAzureClients
- ✅ Managed Identity para Service Bus

### Paso 3: Deploy Infraestructura con Container Jobs

```bash
# Obtener user info para SQL admin
export SQL_ADMIN_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
export SQL_ADMIN_LOGIN=$(az ad signed-in-user show --query userPrincipalName -o tsv)

# Deploy con deployJob=true
az deployment group create \
  -g $RG \
  -f biceps/main.bicep \
  --parameters workloadName='weather' \
  --parameters environmentShortName='dev' \
  --parameters deployContainerApps=true \
  --parameters deployWorker=true \
  --parameters deployWorkerApp=true \
  --parameters deployDashboard=true \
  --parameters deployDashboardWorkerApp=true \
  --parameters deployKeyVault=true \
  --parameters deployCosmosDB=true \
  --parameters deployChangeFeedWorker=true \
  --parameters deployJob=true \
  --parameters sqlLocation='centralus' \
  --parameters sqlAdminObjectId=$SQL_ADMIN_OBJECT_ID \
  --parameters sqlAdminLogin=$SQL_ADMIN_LOGIN \
  --parameters jobMessageCount='50' \
  --parameters jobCronExpression='*/5 * * * *'
```

**Parámetros del Job:**
- `deployJob=true` - Habilita deploy del Container Job
- `jobMessageCount='50'` - Mensajes a encolar por ejecución
- `jobCronExpression='*/5 * * * *'` - Ejecuta cada 5 minutos

**Qué se despliega:**
- ✅ Container App Job `ca-weather-enqueuer-dev`
- ✅ Schedule trigger (CRON: cada 5 minutos)
- ✅ Managed Identity con roles Service Bus Data Sender
- ✅ Environment variables (MESSAGE_COUNT, SERVICE_BUS_NAMESPACE, etc.)

### Paso 4: Redeploy Backend y Frontend (con Scheduler UI)

```bash
# Backend (incluye JobsController)
az acr build --registry $ACR \
  --image weather-api:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

az containerapp update -n ca-weather-be-dev -g $RG \
  --image $ACR.azurecr.io/weather-api:latest \
  --revision-suffix "be-$(date +%s)"

# Frontend (incluye SchedulerPage)
az acr build --registry $ACR \
  --image weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend

az containerapp update -n ca-weather-fe-dev -g $RG \
  --image $ACR.azurecr.io/weather-frontend:latest \
  --revision-suffix "fe-$(date +%s)"

# DashboardWorker (incluye JobExecuted handler)
az acr build --registry $ACR \
  --image dashboard-worker:latest \
  --file src/worker/DashboardWorker/Dockerfile \
  src/worker/DashboardWorker

az containerapp update -n ca-dashboard-worker-dev -g $RG \
  --image $ACR.azurecr.io/dashboard-worker:latest \
  --revision-suffix "dw-$(date +%s)"
```

**IMPORTANTE**: Usar `--revision-suffix` único para forzar repull de imagen desde ACR.

### Paso 5: Validación E2E del Container Job

#### 5.1 Ver Jobs y Próxima Ejecución

```bash
# Listar jobs en el ambiente
az containerapp job list -g $RG -o table

# Ver detalles del job
az containerapp job show -n ca-weather-enqueuer-dev -g $RG \
  --query '{Name:name, TriggerType:properties.configuration.triggerType, CRON:properties.configuration.scheduleTriggerConfig.cronExpression, MessageCount:properties.template.containers[0].env[?name==`MESSAGE_COUNT`].value | [0]}' \
  -o json
```

#### 5.2 Ejecutar Job Manualmente (sin esperar CRON)

```bash
# Trigger manual
az containerapp job start -n ca-weather-enqueuer-dev -g $RG

# Ver ejecuciones
az containerapp job execution list -n ca-weather-enqueuer-dev -g $RG -o table
```

#### 5.3 Ver Logs del Job

```bash
# Logs de la última ejecución
az containerapp job logs show -n ca-weather-enqueuer-dev -g $RG
```

Buscar:
- ✅ `Starting job: ca-weather-enqueuer-dev`
- ✅ `Sending 50 messages to weather-queue...`
- ✅ `Successfully sent 50 messages`
- ✅ `Published JobExecuted event to dashboard-events`

#### 5.4 Validar en SQL (JobExecutions table)

```bash
# Query JobExecutions via Azure CLI
az sql db query \
  --server $SQL_SERVER \
  --database dashboard-poc \
  --auth-mode ActiveDirectoryPassword \
  --query "SELECT JobName, Date, Hour, ExecutionCount, UpdatedAt FROM JobExecutions ORDER BY UpdatedAt DESC"
```

Esperado:
```
JobName                    | Date       | Hour | ExecutionCount | UpdatedAt
---------------------------|------------|------|----------------|-------------------
ca-weather-enqueuer-dev    | 2026-07-20 | 13   | 1              | 2026-07-20 13:05:12
```

#### 5.5 Verificar en Frontend (Scheduler Page)

1. Navegar a `https://ca-weather-fe-dev.<FQDN>/scheduler`
2. Ver tabla de jobs con CRON expression
3. Verificar "Última Ejecución" timestamp
4. Click en "Editar Frecuencia" (ícono Settings)
5. Cambiar CRON (ej: `*/10 * * * *` para cada 10 minutos)
6. Guardar y verificar que se actualiza

#### 5.6 Verificar Dashboard Widget

1. Navegar a `/dashboard`
2. Scroll a sección "Container Jobs"
3. Ver counters de ejecuciones por job por fecha
4. Verificar que incrementa después de cada ejecución

### Paso 6: Editar Schedule desde Frontend

```bash
# 1. Abrir frontend en browser
export FRONTEND_URL=$(az containerapp show -n ca-weather-fe-dev -g $RG \
  --query 'properties.configuration.ingress.fqdn' -o tsv)

echo "Frontend: https://$FRONTEND_URL/scheduler"

# 2. En el browser:
# - Click en Settings button del job
# - Cambiar CRON expression (ej: */15 * * * * para cada 15 min)
# - Save

# 3. Verificar desde CLI que se actualizó
az containerapp job show -n ca-weather-enqueuer-dev -g $RG \
  --query 'properties.configuration.scheduleTriggerConfig.cronExpression' -o tsv
```

### Troubleshooting Container Jobs

#### Job no ejecuta

```bash
# 1. Verificar que el job existe
az containerapp job show -n ca-weather-enqueuer-dev -g $RG

# 2. Ver executions (puede estar vacia si nunca corrió)
az containerapp job execution list -n ca-weather-enqueuer-dev -g $RG -o table

# 3. Trigger manual para ver logs
az containerapp job start -n ca-weather-enqueuer-dev -g $RG
az containerapp job logs show -n ca-weather-enqueuer-dev -g $RG
```

#### Job falla con RBAC error

El job necesita rol `Azure Service Bus Data Sender`. Verificar:

```bash
# Ver roles asignados al job identity
export JOB_IDENTITY=$(az containerapp job show -n ca-weather-enqueuer-dev -g $RG \
  --query 'identity.userAssignedIdentities' -o json | jq -r 'keys[0]' | xargs basename)

az role assignment list \
  --assignee $(az identity show -n $JOB_IDENTITY -g $RG --query principalId -o tsv) \
  --all -o table | grep "Service Bus"
```

Debería tener:
- `Azure Service Bus Data Sender` (scope: Service Bus namespace)

#### Scheduler Page no muestra jobs

1. **Backend JobsController:** Verificar que el backend tiene RBAC Reader en el RG
2. **Logs del backend:**

```bash
az containerapp logs show -n ca-weather-be-dev -g $RG --tail 50
```

Buscar errores `403 Forbidden` o `Unable to resolve service for type 'Azure.ResourceManager.ArmClient'`

3. **Verificar que el backend tiene ArmClient registrado:**

```bash
# Ver código en Program.cs
grep -n "AddSingleton<ArmClient>" src/backend/WeatherApi/Program.cs
```

---

## 📚 Referencias

- [Azure Container Apps Docs](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Azure Container Apps Jobs Docs](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [Application Insights Docs](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)
- [Easy Auth Tutorial](docs/EASY-AUTH-TUTORIAL.md)
- [Container Jobs POC Design](docs/container-jobs-poc.md)
- [.NET Instrumentation Guide](docs/DOTNET-INSTRUMENTATION.md)
- [Docker Guide](DOCKER.md)
