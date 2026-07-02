# Instrumentación de Aplicación .NET con Application Insights

Esta guía describe cómo instrumentar una aplicación .NET (ASP.NET Core o .NET 10+) para enviar telemetría completa a Application Insights cuando se ejecuta en Azure Container Apps.

## Requisitos Previos

- Aplicación ASP.NET Core o .NET 10+
- Application Insights ya desplegado (se crea automáticamente con `biceps/main.bicep`)
- Connection string disponible (inyectado automáticamente como variable de entorno en el Container App)

## Pasos de Instrumentación

### 1. Agregar el paquete NuGet

Para **ASP.NET Core** (recomendado para aplicaciones web):

```bash
dotnet add package Azure.Monitor.OpenTelemetry.AspNetCore
```

Para **.NET** en general (console apps, worker services, etc.):

```bash
dotnet add package Azure.Monitor.OpenTelemetry.Exporter
```

### 2. Modificar el código de la aplicación

#### ASP.NET Core (Web APIs, MVC, Blazor)

Edita tu archivo `Program.cs`:

```csharp
// Agregar using al inicio del archivo
using Azure.Monitor.OpenTelemetry.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Configurar OpenTelemetry con Azure Monitor
// Esta línea debe ir ANTES de builder.Build()
builder.Services.AddOpenTelemetry().UseAzureMonitor();

// ... resto de tu configuración ...

var app = builder.Build();

// ... configuración de middleware ...

app.Run();
```

#### .NET Console/Worker Service

Para aplicaciones que no son ASP.NET Core:

```csharp
using Azure.Monitor.OpenTelemetry.Exporter;
using OpenTelemetry;
using OpenTelemetry.Trace;
using OpenTelemetry.Metrics;
using OpenTelemetry.Logs;

// Configurar trazas
var tracerProvider = Sdk.CreateTracerProviderBuilder()
    .AddAzureMonitorTraceExporter()
    .Build();

// Configurar métricas
var metricsProvider = Sdk.CreateMeterProviderBuilder()
    .AddAzureMonitorMetricExporter()
    .Build();

// Configurar logs
var loggerFactory = LoggerFactory.Create(builder =>
{
    builder.AddOpenTelemetry(logging =>
    {
        logging.AddAzureMonitorLogExporter();
    });
});

// Mantener estas instancias activas durante toda la vida de la aplicación
```

### 3. Variable de Entorno (Ya Configurada)

El Bicep ya configura automáticamente la variable de entorno `APPLICATIONINSIGHTS_CONNECTION_STRING` en el Container App como un secret. **No necesitas hacer nada adicional**.

Si ejecutas localmente para desarrollo, puedes configurarla:

```bash
export APPLICATIONINSIGHTS_CONNECTION_STRING="<tu-connection-string>"
```

O en Windows PowerShell:

```powershell
$env:APPLICATIONINSIGHTS_CONNECTION_STRING="<tu-connection-string>"
```

Para obtener el connection string:

```bash
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name main \
  --query properties.outputs.appInsightsConnectionString.value \
  --output tsv
```

### 4. Dockerfile para la Aplicación

Ejemplo de `Dockerfile` para una aplicación ASP.NET Core:

```dockerfile
# Usar imagen base de .NET 10 SDK para build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copiar archivo de proyecto y restaurar dependencias
COPY ["MyApp/MyApp.csproj", "MyApp/"]
RUN dotnet restore "MyApp/MyApp.csproj"

# Copiar todo el código y compilar
COPY . .
WORKDIR "/src/MyApp"
RUN dotnet build "MyApp.csproj" -c Release -o /app/build

# Publicar la aplicación
FROM build AS publish
RUN dotnet publish "MyApp.csproj" -c Release -o /app/publish

# Imagen final con runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 8080

# Copiar la aplicación publicada
COPY --from=publish /app/publish .

# Punto de entrada
ENTRYPOINT ["dotnet", "MyApp.dll"]
```

**Importante**: Asegúrate de que el puerto expuesto (8080) coincida con el `targetPort` configurado en el Bicep.

### 5. Build y Push de la Imagen a ACR

```bash
# Variables
RESOURCE_GROUP="rg-container-app-easyauth"
ACR_NAME=$(az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name main \
  --query properties.outputs.acrName.value \
  --output tsv)

# Login a ACR
az acr login --name $ACR_NAME

# Build y push de la imagen
docker build -t $ACR_NAME.azurecr.io/aspnetapp:latest -f MyApp/Dockerfile .
docker push $ACR_NAME.azurecr.io/aspnetapp:latest
```

### 6. Actualizar el Container App para usar tu imagen

Una vez que la imagen esté en ACR, actualiza el parámetro `useAcrImage` a `true` en `biceps/main.bicep`:

```bicep
module containerApp 'modules/container-app.bicep' = {
  name: 'container-app-deployment'
  params: {
    location: location
    containerAppName: containerAppName
    environmentId: environment.outputs.environmentId
    containerImage: '${containerRegistry.outputs.acrLoginServer}/${acrImageName}:${acrImageTag}'
    acrName: containerRegistryName
    useAcrImage: true  // Cambiar a true
    appInsightsConnectionString: appInsights.outputs.connectionString
  }
}
```

Y redespliega:

```bash
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file biceps/main.bicep \
  --parameters location=$LOCATION \
               acrImageName=aspnetapp \
               acrImageTag=latest
```

## Telemetría Recopilada Automáticamente

Una vez instrumentada, la aplicación enviará automáticamente:

### 📊 Trazas (Traces)
- HTTP requests entrantes (con URL, método, código de respuesta, duración)
- HTTP requests salientes (dependencias)
- Llamadas a bases de datos (SQL, Cosmos DB, etc.)
- Llamadas a servicios externos
- Excepciones y stack traces

### 📈 Métricas (Metrics)
- Request rate (requests/sec)
- Request duration (latency)
- Dependency duration
- Exception rate
- Custom metrics que definas

### 📝 Logs (Logs)
- Todos los logs de `ILogger`
- Nivel de log (Information, Warning, Error, etc.)
- Structured logging con propiedades

### ⚠️ Excepciones
- Exception type
- Message
- Stack trace
- Propiedades personalizadas

## Verificación

### En Azure Portal

1. **Application Insights → Live Metrics**
   - Ve telemetría en tiempo real mientras pruebas la aplicación

2. **Application Insights → Performance**
   - Analiza tiempos de respuesta y dependencias

3. **Application Insights → Failures**
   - Revisa excepciones y requests fallidos

4. **Application Insights → Application Map**
   - Visualiza la arquitectura y dependencias

### Consultas KQL

```kql
// Ver todas las requests HTTP
requests
| where cloud_RoleName has "ca-easyauth-demo"
| project timestamp, name, url, resultCode, duration, success
| order by timestamp desc

// Ver excepciones
exceptions
| where cloud_RoleName has "ca-easyauth-demo"
| project timestamp, type, outerMessage, problemId
| order by timestamp desc

// Analizar latencia (percentiles)
requests
| where cloud_RoleName has "ca-easyauth-demo"
| summarize 
    count(),
    avg(duration),
    percentile(duration, 50),
    percentile(duration, 95),
    percentile(duration, 99)
  by bin(timestamp, 5m)
| render timechart
```

## Telemetría Personalizada (Opcional)

### Agregar Custom Events

```csharp
using System.Diagnostics;

// Crear un ActivitySource
private static readonly ActivitySource MyActivitySource = new("MyApp.Operations");

public void MyMethod()
{
    // Iniciar una actividad personalizada
    using var activity = MyActivitySource.StartActivity("ProcessOrder");
    activity?.SetTag("order.id", orderId);
    activity?.SetTag("customer.id", customerId);
    
    // Tu lógica de negocio...
}
```

### Agregar Custom Metrics

```csharp
using System.Diagnostics.Metrics;

// Crear un Meter
private static readonly Meter MyMeter = new("MyApp.Metrics");
private static readonly Counter<int> OrderCounter = MyMeter.CreateCounter<int>("orders.processed");

public void ProcessOrder()
{
    // Incrementar contador
    OrderCounter.Add(1, new KeyValuePair<string, object?>("order.type", "premium"));
}
```

### Enriquecer Logs

```csharp
logger.LogInformation("Order {OrderId} processed for customer {CustomerId}", 
    orderId, customerId);
```

## Recursos Adicionales

- [Documentación oficial de OpenTelemetry para .NET](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable?tabs=aspnetcore)
- [Azure Monitor OpenTelemetry Distro para ASP.NET Core](https://github.com/Azure/azure-sdk-for-net/tree/main/sdk/monitor/Azure.Monitor.OpenTelemetry.AspNetCore)
- [Instrumentación personalizada](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-add-modify)
- [Sampling y filtrado](https://learn.microsoft.com/en-us/azure/azure-monitor/app/sampling-classic-api)

## Notas Importantes

⚠️ **No uses `appsettings.json` para configurar Application Insights** - Es una forma obsoleta. Usa siempre la variable de entorno `APPLICATIONINSIGHTS_CONNECTION_STRING`.

✅ **El SDK es compatible con OpenTelemetry estándar** - Puedes usar librerías OpenTelemetry nativas junto con el distro de Azure Monitor.

🔒 **Connection String como Secret** - El Bicep ya lo configura como secret en Container Apps, por lo que no se expone en logs ni en el portal.

📊 **Sampling por defecto** - Para controlar costos, Application Insights puede aplicar sampling. Revisa la configuración si necesitas 100% de los datos.
