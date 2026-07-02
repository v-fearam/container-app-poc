# Guía de Desarrollo Local

Esta guía explica cómo ejecutar la aplicación localmente para desarrollo y testing.

## 📋 Pre-requisitos

- ✅ .NET 10 SDK
- ✅ Node.js 18+ y npm
- ✅ Docker Desktop (opcional, para testing con contenedores)

## 🚀 Desarrollo Local (sin Docker)

### Backend (.NET 10)

```bash
cd src/backend/WeatherApi
dotnet restore
dotnet run
```

El backend estará disponible en: **http://localhost:5000**

### Frontend (React + Vite)

```bash
cd src/frontend
npm install
npm run dev
```

El frontend estará disponible en: **http://localhost:5173**

**Nota**: El frontend está configurado para conectarse al backend en `http://localhost:5000` por defecto.

## 🐳 Desarrollo con Docker

### Construir Imágenes Localmente

```bash
# Backend
docker build -t camuzzi-weather-backend:latest \
  -f src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Frontend
docker build -t camuzzi-weather-frontend:latest \
  -f src/frontend/Dockerfile \
  src/frontend
```

### Ejecutar con Docker Compose

```bash
docker-compose up --build
```

URLs:
- Frontend: **http://localhost:3000**
- Backend: **http://localhost:5000**

Para detener:
```bash
docker-compose down
```

## 📝 Variables de Ambiente

### Backend (.env en src/backend/WeatherApi/)

```bash
APPLICATIONINSIGHTS_CONNECTION_STRING=your-connection-string-here
```

### Frontend (.env en src/frontend/)

```bash
VITE_API_URL=http://localhost:5000
VITE_APPINSIGHTS_CONNECTION_STRING=your-connection-string-here
```

**Nota**: App Insights es opcional para desarrollo local. Si no configuras el connection string, se usará un mock que solo hace console.log.

## 🧪 Testing Local de la Build de Producción

Para probar las imágenes Docker de producción localmente:

```bash
# 1. Construir las imágenes
docker build -t backend:test -f src/backend/WeatherApi/Dockerfile src/backend/WeatherApi
docker build -t frontend:test -f src/frontend/Dockerfile src/frontend

# 2. Ejecutar backend
docker run -p 8080:8080 backend:test

# 3. Ejecutar frontend (en otra terminal)
docker run -p 80:80 frontend:test
```

## 🔧 Troubleshooting

### El frontend no se conecta al backend

Verifica que:
1. El backend esté corriendo en el puerto correcto
2. La variable `VITE_API_URL` esté configurada correctamente
3. No haya problemas de CORS (el backend tiene CORS habilitado por defecto)

### Error de puertos ocupados

Si los puertos 5000, 5173, 3000 u 8080 están ocupados:

```bash
# Ver qué proceso está usando el puerto
netstat -ano | findstr :5000  # Windows
lsof -i :5000                  # Linux/Mac

# Mata el proceso o cambia el puerto en el código
```

### Hot reload no funciona

Asegúrate de estar ejecutando `npm run dev` (no `npm run build`). Vite tiene hot reload automático.

## 📚 Más Información

- **Dockerfiles**: Ver [DOCKER.md](../DOCKER.md) para detalles de las builds multi-stage
- **Deployment**: Ver [DEPLOYMENT.md](../DEPLOYMENT.md) para desplegar a Azure
- **Telemetría**: Ver [docs/DOTNET-INSTRUMENTATION.md](../docs/DOTNET-INSTRUMENTATION.md) para App Insights
