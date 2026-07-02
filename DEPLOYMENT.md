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

## 📚 Referencias

- [Azure Container Apps Docs](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Application Insights Docs](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)
- [Easy Auth Tutorial](docs/EASY-AUTH-TUTORIAL.md)
- [.NET Instrumentation Guide](docs/DOTNET-INSTRUMENTATION.md)
- [Docker Guide](DOCKER.md)
