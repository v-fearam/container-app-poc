# Guía de Despliegue - Camuzzi Weather App

Esta guía detalla cómo desplegar la aplicación completa (Frontend + Backend) a Azure Container Apps.

## 📋 Pre-requisitos

- ✅ Docker Desktop corriendo
- ✅ Azure CLI instalado y autenticado (`az login`)
- ✅ Subscription de Azure activa

## 🚀 Despliegue Completo (Opción 1: Script Automatizado)

El método más rápido es usar el script de despliegue automatizado:

```powershell
# 1. Asegúrate de estar logueado en Azure
az login

# 2. Ejecuta el script de despliegue
.\scripts\deploy-to-azure.ps1 -ResourceGroup "rg-camuzzi-weather" -Location "eastus2"
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

# Variables
$RESOURCE_GROUP = "rg-camuzzi-weather"
$LOCATION = "eastus2"
```

### Paso 2: Crear Resource Group

```powershell
az group create `
  --name $RESOURCE_GROUP `
  --location $LOCATION
```

### Paso 3: Desplegar Infraestructura Base

```powershell
# Desplegar sin Container Apps primero
az deployment group create `
  --resource-group $RESOURCE_GROUP `
  --template-file biceps/main.bicep `
  --parameters location=$LOCATION deployContainerApps=false
```

Esto crea:
- ✅ Azure Container Registry (ACR)
- ✅ Log Analytics Workspace
- ✅ Application Insights
- ✅ Container App Environment

### Paso 4: Obtener el nombre del ACR

```powershell
$ACR_NAME = az deployment group show `
  --resource-group $RESOURCE_GROUP `
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
  --resource-group $RESOURCE_GROUP `
  --template-file biceps/main.bicep `
  --parameters location=$LOCATION deployContainerApps=true
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
  --resource-group $RESOURCE_GROUP `
  --name main `
  --query 'properties.outputs.frontendAppUrl.value' `
  --output tsv

# URL del Backend
$BACKEND_URL = az deployment group show `
  --resource-group $RESOURCE_GROUP `
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
