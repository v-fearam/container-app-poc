# Docker Images Guide

This directory contains Docker configurations for the Camuzzi Weather App.

## 📦 Structure

```
.
├── src/
│   ├── backend/WeatherApi/
│   │   ├── Dockerfile          # Backend .NET 10 image
│   │   └── .dockerignore
│   └── frontend/
│       ├── Dockerfile          # Frontend React + Nginx image
│       ├── nginx.conf          # Nginx configuration
│       └── .dockerignore
├── docker-compose.yml          # Local development setup
└── scripts/
    ├── build-images.ps1       # Build both images
    ├── push-to-acr.ps1        # Push to Azure Container Registry
    └── run-local.ps1          # Run with Docker Compose
```

## 🚀 Quick Start

### 1. Build Images

```powershell
# Build both frontend and backend images
.\scripts\build-images.ps1
```

### 2. Run Locally

```powershell
# Start with Docker Compose
.\scripts\run-local.ps1

# Or manually:
docker-compose up --build
```

Access the app:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

### 3. Push to Azure Container Registry

```powershell
.\scripts\push-to-acr.ps1 -AcrName "your-acr-name"

# With custom tag:
.\scripts\push-to-acr.ps1 -AcrName "your-acr-name" -Tag "v1.0.0"
```

## 📝 Dockerfile Details

### Backend (WeatherApi)

- **Base Image**: `mcr.microsoft.com/dotnet/aspnet:10.0`
- **Build Image**: `mcr.microsoft.com/dotnet/sdk:10.0`
- **Port**: 8080
- **Features**:
  - Multi-stage build for smaller image size
  - Optimized for production
  - Includes Application Insights support

### Frontend (React + Vite)

- **Base Image**: `nginx:alpine`
- **Build Image**: `node:22-alpine`
- **npm in build stage**: `11.18.0`
- **Port**: 80
- **Features**:
  - Multi-stage build with Node.js and Nginx
  - Static file serving with Nginx
  - Gzip compression enabled
  - SPA routing configured
  - Security headers added

## 🔧 Environment Variables

### Backend
- `APPLICATIONINSIGHTS_CONNECTION_STRING` - App Insights connection string
- `ASPNETCORE_ENVIRONMENT` - Environment (Development/Production)

### Frontend
- `VITE_API_URL` - Backend API URL
- `VITE_APPINSIGHTS_CONNECTION_STRING` - App Insights connection string

## 📊 Image Sizes

- **Backend**: ~200 MB (runtime only)
- **Frontend**: ~25 MB (nginx + static files)

## 🏷️ Tagging Convention

Images are tagged with:
- `latest` - Latest build
- `v1.0.0`, `v1.1.0`, etc. - Semantic versioning
- `dev`, `staging`, `prod` - Environment tags

## 🐳 Docker Commands Reference

```powershell
# Build specific service
docker-compose build backend
docker-compose build frontend

# Run in foreground (see logs)
docker-compose up

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop containers
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Rebuild without cache
docker-compose build --no-cache
```

## 🔍 Troubleshooting

### Port conflicts
If ports 3000 or 5000 are in use, update `docker-compose.yml`:
```yaml
ports:
  - "8080:80"  # Change frontend port
  - "8081:8080"  # Change backend port
```

### Build failures
```powershell
# Clean Docker cache
docker system prune -a

# Rebuild from scratch
docker-compose build --no-cache
```

### Container health
```powershell
# Check container status
docker-compose ps

# Inspect specific container
docker inspect <container-id>
```
