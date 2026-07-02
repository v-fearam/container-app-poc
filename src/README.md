# Monorepo - Weather App con Application Insights

Este monorepo contiene una aplicación full-stack con:
- **Frontend**: React + TypeScript + Vite con Application Insights
- **Backend**: .NET 8 Web API con OpenTelemetry y Azure Monitor

## 🚀 Desarrollo Local

### Pre-requisitos

- Node.js 18+ y npm
- .NET 8 SDK
- (Opcional) Application Insights connection string para telemetría

### Instalación

```bash
# Instalar dependencias del frontend
cd src/frontend
npm install

# Backend ya tiene las dependencias restauradas
```

### Ejecutar en Desarrollo

#### Opción 1: Ejecutar ambos servicios simultáneamente

Desde la raíz del proyecto:

```bash
npm install
npm run dev
```

Esto ejecutará:
- Frontend en http://localhost:5173
- Backend en http://localhost:5000

#### Opción 2: Ejecutar servicios individualmente

**Terminal 1 - Backend:**
```bash
cd src/backend/WeatherApi
dotnet run
```

**Terminal 2 - Frontend:**
```bash
cd src/frontend
npm run dev
```

### Configuración de Application Insights (Opcional para desarrollo)

Si quieres probar telemetría localmente:

1. Copia `.env.example` a `.env` en `src/frontend/`
2. Agrega tu connection string:
   ```
   VITE_APPINSIGHTS_CONNECTION_STRING=InstrumentationKey=...
   ```
3. El backend lee el connection string de la variable de entorno:
   ```bash
   $env:APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=..."
   dotnet run
   ```

## 📦 Estructura del Proyecto

```
container-app-poc/
├── src/
│   ├── frontend/              # React + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── App.tsx       # Componente principal con Weather UI
│   │   │   ├── appInsights.ts # Configuración de App Insights
│   │   │   └── main.tsx      # Entry point con AppInsightsContext
│   │   ├── .env              # Variables de entorno (gitignored)
│   │   └── package.json
│   └── backend/              # .NET 8 Web API
│       └── WeatherApi/
│           ├── Program.cs    # API con CORS y App Insights
│           └── WeatherApi.csproj
├── biceps/                   # Infrastructure as Code
├── docs/                     # Documentación
└── package.json             # Scripts del monorepo
```

## 🧪 Probar la Aplicación

1. Abre http://localhost:5173 en tu navegador
2. Haz clic en "Obtener Clima"
3. Deberías ver 5 días de pronóstico del tiempo
4. Si Application Insights está configurado, verás telemetría en Azure Portal

## 🔍 Features

### Frontend React
- ✅ UI moderna con gradientes y animaciones
- ✅ Application Insights SDK con correlación CORS
- ✅ Track de eventos personalizados (clicks, métricas, excepciones)
- ✅ TypeScript para type safety
- ✅ Vite para fast refresh en desarrollo

### Backend .NET
- ✅ Minimal API con WeatherForecast endpoint
- ✅ OpenTelemetry con Azure Monitor
- ✅ CORS configurado para permitir frontend
- ✅ Swagger UI en desarrollo (http://localhost:5000/swagger)
- ✅ Headers de correlación distribuida (Request-Id, traceparent)

## 📊 Telemetría End-to-End

La aplicación está configurada para **distributed tracing** completo:

1. **Frontend** genera un `traceparent` header en cada request
2. **Backend** lo propaga y correlaciona automáticamente
3. En Application Insights puedes ver:
   - El click del botón en el frontend
   - La llamada HTTP desde React
   - El procesamiento en la API .NET
   - Todo correlacionado bajo un mismo `operation_Id`

### Consultas KQL para ver correlación

```kql
// Ver requests correlacionados
let opId = "OPERATION_ID_FROM_APP_INSIGHTS";
union dependencies, requests
| where operation_Id == opId
| project timestamp, itemType, name, duration, success
| order by timestamp asc
```

## 🐛 Troubleshooting

### CORS Error
Si ves errores de CORS en la consola del navegador:
- Verifica que el backend esté corriendo en http://localhost:5000
- Verifica que el frontend esté en http://localhost:5173
- Revisa `Program.cs` para asegurar que el puerto del frontend esté en la política CORS

### Connection String Error
Si ves warnings de App Insights:
- Es normal en desarrollo local sin connection string configurado
- La app funciona igual, solo no envía telemetría
- Para habilitar telemetría, configura las variables de entorno

## 🔜 Próximos Pasos

- [ ] Crear Dockerfiles para ambos servicios
- [ ] Actualizar Bicep para desplegar ambos containers
- [ ] Configurar CI/CD pipeline
- [ ] Agregar tests unitarios y de integración

## 📚 Documentación

Ver carpeta `docs/` para:
- Tutorial de Easy Auth
- Guía de instrumentación de .NET
- Monitoreo con Application Insights
