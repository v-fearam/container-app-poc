# Container App POC - Easy Auth + Full-Stack Monorepo

Proyecto de prueba de concepto para implementar y probar Easy Authentication en Azure Container Apps con una aplicación full-stack moderna.

## 🎯 Objetivo

Explorar y validar la configuración de Easy Auth (Azure App Service Authentication/Authorization) en Azure Container Apps con una aplicación React + .NET 10 y telemetría completa.

## 📦 Estado Actual

✅ **Aplicación Full-Stack Completa**
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- Backend: .NET 10 Minimal API con WeatherForecast
- Application Insights configurado con correlación end-to-end
- Dockerfiles multi-stage optimizados para producción
- Infraestructura Bicep lista para deployment

## 🏗️ Estructura del Proyecto

```
container-app-poc/
├── src/
│   ├── frontend/              # React + TypeScript + Vite
│   │   ├── Dockerfile        # Multi-stage con Nginx
│   │   └── nginx.conf        # Config optimizada para SPA
│   └── backend/WeatherApi/   # .NET 10 Minimal API
│       ├── Program.cs        # API con App Insights
│       └── Dockerfile        # Multi-stage optimizado
├── biceps/                   # Infraestructura Azure
│   ├── main.bicep           # Orquestador principal
│   └── modules/             # Módulos reutilizables
├── docs/                     # Documentación
├── DEPLOYMENT.md            # Guía detallada de deployment
└── DEVELOPMENT.md           # Guía de desarrollo local
```

## 🎨 Stack Tecnológico

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite 8
- **Styling**: Tailwind CSS 3
- **Telemetría**: @microsoft/applicationinsights-web
- **Servidor**: Nginx (Alpine)

### Backend
- **Framework**: .NET 10 Minimal API
- **Telemetría**: Azure.Monitor.OpenTelemetry.AspNetCore
- **Runtime**: ASP.NET Core 10

### Infraestructura
- **Compute**: Azure Container Apps
- **Registry**: Azure Container Registry (ACR)
- **Monitoring**: Application Insights + Log Analytics
- **Auth**: Easy Auth (Entra ID)

## ☁️ Despliegue a Azure Container Apps

### Pre-requisitos
- WSL (Windows Subsystem for Linux) o Linux
- Docker Desktop corriendo
- Azure CLI instalado (`az --version`)

### Paso 1: Configurar Variables

```bash
export AZURE_RESOURCE_GROUP="rg-far-container-app-easyauth"
export AZURE_LOCATION="eastus2"
export CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"
export CORS_ALLOWED_ORIGIN_SUFFIXES=".azurecontainerapps.io"
```

### Paso 2: Login a Azure

```bash
az login
```

### Paso 3: Crear Resource Group

```bash
az group create \
  --name $AZURE_RESOURCE_GROUP \
  --location $AZURE_LOCATION
```

### Paso 4: Desplegar Infraestructura Base

```bash
az deployment group create \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --template-file biceps/main.bicep \
  --parameters \
    location=$AZURE_LOCATION \
    corsAllowedOrigins="$CORS_ALLOWED_ORIGINS" \
    corsAllowedOriginSuffixes="$CORS_ALLOWED_ORIGIN_SUFFIXES" \
    deployContainerApps=false
```

Esto crea:
- ✅ Azure Container Registry (ACR)
- ✅ Log Analytics Workspace
- ✅ Application Insights
- ✅ Container App Environment

### Paso 5: Construir y Publicar Imágenes

```bash
# Obtener nombre del ACR
ACR_NAME=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.acrName.value' \
  --output tsv)

# Construir backend en ACR
az acr build \
  --registry $ACR_NAME \
  --image camuzzi-weather-backend:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Construir frontend en ACR
az acr build \
  --registry $ACR_NAME \
  --image camuzzi-weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend
```

### Paso 6: Desplegar Container Apps

```bash
az deployment group create \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --template-file biceps/main.bicep \
  --parameters \
    location=$AZURE_LOCATION \
    corsAllowedOrigins="$CORS_ALLOWED_ORIGINS" \
    corsAllowedOriginSuffixes="$CORS_ALLOWED_ORIGIN_SUFFIXES" \
    deployContainerApps=true
```

Esto crea:
- ✅ **Backend Container App** (puerto 8080, .NET 10 API)
- ✅ **Frontend Container App** (puerto 80, React + Nginx)
- ✅ App Insights configurado en ambas apps
- ✅ Managed Identity con permisos AcrPull
- ✅ CORS habilitado para localhost y dominios `*.azurecontainerapps.io`

### Paso 7: Obtener URLs

```bash
# Frontend URL
FRONTEND_URL=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.frontendAppUrl.value' \
  --output tsv)

# Backend URL
BACKEND_URL=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.backendAppUrl.value' \
  --output tsv)

echo "🌐 Frontend: $FRONTEND_URL"
echo "🌐 Backend:  $BACKEND_URL"
```

### 🔄 Actualizar Aplicación (Backend y Frontend)

Después de hacer cambios en el código, sigue estos pasos para reconstruir y redeplegar:

#### Paso 1: Obtener Variables Necesarias

```bash
# Si no las tienes guardadas, obtén el nombre del ACR
ACR_NAME=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.acrName.value' \
  --output tsv)

echo "ACR Name: $ACR_NAME"
```

#### Actualizar Ambos (Backend y Frontend)

```bash
# Reconstruir backend
az acr build \
  --registry $ACR_NAME \
  --image camuzzi-weather-backend:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Reconstruir frontend
az acr build \
  --registry $ACR_NAME \
  --image camuzzi-weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend

# Forzar nueva revisión en backend (pull de imagen actualizada)
az containerapp update \
  --name ca-weather-be-dev \
  --resource-group $AZURE_RESOURCE_GROUP

# Forzar nueva revisión en frontend (pull de imagen actualizada)
az containerapp update \
  --name ca-weather-fe-dev \
  --resource-group $AZURE_RESOURCE_GROUP
```

#### Verificar el Deployment

```bash
# Ver URL del frontend
FRONTEND_URL=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.frontendAppUrl.value' \
  --output tsv)

# Ver URL del backend
BACKEND_URL=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.backendAppUrl.value' \
  --output tsv)

echo "✅ Frontend: $FRONTEND_URL"
echo "✅ Backend:  $BACKEND_URL"

# Verificar que el backend responda
curl $BACKEND_URL/weatherforecast
```

## 📚 Documentación

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Guía completa de despliegue con explicaciones detalladas
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Desarrollo local sin Docker o con Docker Compose
- **[DOCKER.md](DOCKER.md)** - Detalles de Dockerfiles y troubleshooting
- **[docs/EASY-AUTH-TUTORIAL.md](docs/EASY-AUTH-TUTORIAL.md)** - Configuración de Easy Auth con Entra ID

## 🔐 Configurar Easy Auth

Para proteger la aplicación con Microsoft Entra ID:

1. Portal Azure → Container App → Settings → Authentication
2. Add identity provider → Microsoft
3. Create new app registration
4. Require authentication → Save

📚 **Tutorial completo**: [docs/EASY-AUTH-TUTORIAL.md](docs/EASY-AUTH-TUTORIAL.md)

## 📊 Monitoreo con Application Insights

Telemetría end-to-end incluida:
- ✅ Page views y user actions (Frontend)
- ✅ HTTP requests y dependencies (Backend)
- ✅ Distributed tracing con W3C Trace Context
- ✅ Application Map para visualizar flujos

### Query KQL de Ejemplo

```kql
// Ver requests de las últimas 24 horas
requests
| where timestamp > ago(24h)
| summarize count(), avg(duration) by cloud_RoleName
| render barchart
```

Ver más queries en [DEPLOYMENT.md](DEPLOYMENT.md).

## 🧹 Limpiar Recursos

```bash
az group delete --name $AZURE_RESOURCE_GROUP --yes --no-wait
```

## 📄 Licencia

Este proyecto es un POC (Proof of Concept) para fines educativos y de demostración.

