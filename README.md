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

## 🏗️ Estructura del Proyecto

```
container-app-poc/
├── src/
│   ├── frontend/              # React + TypeScript + Vite
│   │   ├── src/
│   │   │   ├── App.tsx       # UI moderna con Tailwind
│   │   │   ├── appInsights.ts # Configuración de telemetría
│   │   │   └── main.tsx
│   │   ├── Dockerfile        # Multi-stage con Nginx
│   │   └── nginx.conf        # Config optimizada para SPA
│   └── backend/WeatherApi/   # .NET 10 Minimal API
│       ├── Program.cs        # API con App Insights
│       └── Dockerfile        # Multi-stage optimizado
├── biceps/                   # Infraestructura Azure
├── docs/                     # Documentación
├── scripts/                  # Scripts de automatización
├── docker-compose.yml        # Desarrollo local
└── DOCKER.md                 # Guía completa de Docker
```

## 🚀 Quick Start

### Desarrollo Local (sin Docker)

```powershell
# Backend (.NET 10)
cd src/backend/WeatherApi
dotnet run

# Frontend (React + Vite)
cd src/frontend
npm install
npm run dev
```

Accede a:
- Frontend: http://localhost:5173
- Backend: http://localhost:5000

### Desarrollo con Docker

```powershell
# Construir imágenes
.\scripts\build-images.ps1

# Ejecutar localmente
.\scripts\run-local.ps1

# O con docker-compose
docker-compose up --build
```

Accede a:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

Ver [DOCKER.md](DOCKER.md) para guía completa de Docker.

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

## 🚀 Quick Start

### Desarrollo Local (sin Docker)

```powershell
# Backend (.NET 10)
cd src/backend/WeatherApi
dotnet run

# Frontend (React + Vite)
cd src/frontend
npm install
npm run dev
```

Accede a:
- Frontend: http://localhost:5173
- Backend: http://localhost:5000

### Desarrollo con Docker

```powershell
# Construir imágenes
.\scripts\build-images.ps1

# Ejecutar localmente
.\scripts\run-local.ps1

# O con docker-compose
docker-compose up --build
```

Accede a:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

Ver [DOCKER.md](DOCKER.md) para guía completa de Docker.

## ☁️ Despliegue a Azure Container Apps (WSL/Linux)

### Paso 1: Configurar Variables de Ambiente

```bash
# Configurar las variables que usaremos
export AZURE_RESOURCE_GROUP="rg-far-container-app-easyauth"
export AZURE_LOCATION="eastus2"
```

### Paso 2: Login a Azure

```bash
# Login a Azure CLI
az login

# (Opcional) Si tienes múltiples subscriptions
az account list --output table
az account set --subscription "TU_SUBSCRIPTION_ID"
```

### Paso 3: Crear Resource Group

```bash
# Crear el resource group
az group create \
  --name $AZURE_RESOURCE_GROUP \
  --location $AZURE_LOCATION
```

### Paso 4: Desplegar Infraestructura Base

```bash
# Desplegar ACR, Log Analytics, App Insights, Container App Environment
az deployment group create \
  --resource-group $AZURE_RESOURCE_GROUP \
  --template-file biceps/main.bicep \
  --parameters location=$AZURE_LOCATION deployContainerApps=false
```

Esto crea:
- ✅ Azure Container Registry (ACR)
- ✅ Log Analytics Workspace
- ✅ Application Insights
- ✅ Container App Environment

### Paso 5: Obtener el Nombre del ACR

```bash
# Obtener el nombre del ACR que se creó
ACR_NAME=$(az deployment group show \
  --resource-group $AZURE_RESOURCE_GROUP \
  --name main \
  --query 'properties.outputs.acrName.value' \
  --output tsv)

echo "ACR Name: $ACR_NAME"
```

### Paso 6: Construir Imágenes Docker

```bash
# Construir imagen del backend (.NET 10)
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

### Paso 7: Login al ACR y Subir Imágenes

```bash
# Login al Azure Container Registry
az acr login --name $ACR_NAME

# Tagear las imágenes con el nombre del ACR
docker tag camuzzi-weather-backend:latest $ACR_NAME.azurecr.io/camuzzi-weather-backend:latest
docker tag camuzzi-weather-frontend:latest $ACR_NAME.azurecr.io/camuzzi-weather-frontend:latest

# Push backend
docker push $ACR_NAME.azurecr.io/camuzzi-weather-backend:latest

# Push frontend
docker push $ACR_NAME.azurecr.io/camuzzi-weather-frontend:latest
```

### Paso 8: Desplegar Container Apps

```bash
# Desplegar las dos Container Apps (frontend y backend)
az deployment group create \
  --resource-group $AZURE_RESOURCE_GROUP \
  --template-file biceps/main.bicep \
  --parameters location=$AZURE_LOCATION deployContainerApps=true
```

Esto crea:
- ✅ **Backend Container App** (puerto 8080, .NET 10 API)
- ✅ **Frontend Container App** (puerto 80, React + Nginx)
- ✅ Configuración de App Insights en ambas apps
- ✅ Managed Identity con permisos de AcrPull

### Paso 9: Obtener las URLs de tu Aplicación

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

echo "🌐 Frontend: $FRONTEND_URL"
echo "🌐 Backend:  $BACKEND_URL"
```

### 🔄 Actualizar una Aplicación Existente

Si ya desplegaste y solo quieres actualizar el código:

```bash
# 1. Reconstruir la imagen (ejemplo: backend)
docker build -t camuzzi-weather-backend:latest -f src/backend/WeatherApi/Dockerfile src/backend/WeatherApi

# 2. Tagear y subir
docker tag camuzzi-weather-backend:latest $ACR_NAME.azurecr.io/camuzzi-weather-backend:latest
docker push $ACR_NAME.azurecr.io/camuzzi-weather-backend:latest

# 3. Reiniciar el container app para que tome la nueva imagen
az containerapp revision restart \
  --name ca-backend-weather \
  --resource-group $AZURE_RESOURCE_GROUP
```

Ver todas las opciones en **[DEPLOYMENT.md](DEPLOYMENT.md)**.

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

## 📊 Monitoreo con Application Insights

La aplicación incluye telemetría completa end-to-end:

**Frontend (React)**:
- ✅ Page views y navegación
- ✅ Click events y user actions
- ✅ Métricas de performance
- ✅ Errores de cliente

**Backend (.NET 10)**:
- ✅ HTTP requests/responses
- ✅ Dependencies (external calls)
- ✅ Exceptions y logs
- ✅ Custom metrics

**Correlación Distribuida**:
- ✅ Request-Id propagation
- ✅ W3C Trace Context
- ✅ End-to-end transaction tracking
- ✅ Application Map visualization

### Consultas KQL Útiles

```kql
// Ver todas las requests
requests
| where cloud_RoleName in ("ca-frontend-weather", "ca-backend-weather")
| summarize count(), avg(duration) by cloud_RoleName, name
| render barchart

// Trace end-to-end
requests
| where operation_Id == "XXX" // Reemplaza con operation_Id real
| union dependencies
| project timestamp, itemType, name, duration, success
| order by timestamp asc
```

Ver más queries en **[DEPLOYMENT.md](DEPLOYMENT.md#-monitoreo-con-application-insights)**.

## 🔐 Configurar Easy Auth (Opcional)

Para proteger la aplicación con autenticación de Microsoft Entra ID:

📚 **Tutorial completo**: [Configurar Easy Auth paso a paso](docs/EASY-AUTH-TUTORIAL.md)

**Resumen rápido**:
1. Portal Azure → Container App → Security → Authentication
2. Add identity provider → Microsoft
3. Create new app registration
4. Require authentication → Save

Ver tutorial completo para configuración avanzada (roles, usuarios restringidos, integración con código).

## 📚 Documentación Adicional

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Guía completa de despliegue (manual y automatizado)
- **[DOCKER.md](DOCKER.md)** - Guía de Docker (construcción, docker-compose, troubleshooting)
- **[EASY-AUTH-TUTORIAL.md](docs/EASY-AUTH-TUTORIAL.md)** - Configuración de autenticación con Entra ID
- **[DOTNET-INSTRUMENTATION.md](docs/DOTNET-INSTRUMENTATION.md)** - Guía de instrumentación .NET con App Insights

## 🧹 Limpiar Recursos

```powershell
az group delete --name rg-camuzzi-weather --yes --no-wait
```

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es un POC (Proof of Concept) para fines educativos y de demostración.

