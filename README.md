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

## ☁️ Despliegue a Azure Container Apps

### Opción 1: Script Automatizado (Recomendado)

```powershell
# Login a Azure
az login

# Desplegar todo en un comando
.\scripts\deploy-to-azure.ps1 -ResourceGroup "rg-camuzzi-weather" -Location "eastus2"
```

Este script despliega:
- ✅ ACR + Log Analytics + App Insights + Container App Environment
- ✅ Construye y sube imágenes Docker
- ✅ Crea 2 Container Apps (Frontend + Backend)
- ✅ Configura App Insights con correlación end-to-end

### Opción 2: Paso a Paso Manual

Ver **[DEPLOYMENT.md](DEPLOYMENT.md)** para guía detallada paso a paso.

**Resumen rápido:**

1. **Desplegar infraestructura**:
   ```powershell
   az deployment group create \
     --resource-group rg-camuzzi-weather \
     --template-file biceps/main.bicep \
     --parameters deployContainerApps=false
   ```

2. **Construir y subir imágenes**:
   ```powershell
   .\scripts\build-images.ps1
   .\scripts\push-to-acr.ps1 -AcrName <nombre-del-acr>
   ```

3. **Desplegar Container Apps**:
   ```powershell
   az deployment group create \
     --resource-group rg-camuzzi-weather \
     --template-file biceps/main.bicep \
     --parameters deployContainerApps=true
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

