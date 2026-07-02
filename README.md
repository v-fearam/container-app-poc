# Container App POC - Easy Auth

Proyecto de prueba de concepto para implementar y probar Easy Authentication en Azure Container Apps.

## Objetivo

Explorar y validar la configuración de Easy Auth (Azure App Service Authentication/Authorization) en Azure Container Apps para proteger aplicaciones mediante autenticación integrada.

## Estado

🚧 En desarrollo inicial

📊 **Application Insights configurado** - Ver [guía de monitoreo](docs/APPLICATION-INSIGHTS.md)

## Tecnologías

- Azure Container Apps
- Azure Container Registry (ACR)
- Easy Auth (Azure App Service Authentication)
- .NET Sample App

## Arquitectura

La infraestructura incluye:
- **Container App Environment**: Entorno administrado para Container Apps
- **Container App**: Aplicación de ejemplo .NET (ASP.NET Core)
- **Azure Container Registry**: Registro privado para imágenes de contenedor
- **Log Analytics Workspace**: Para logging y monitoreo del sistema
- **Application Insights**: Para telemetría de aplicación, trazas distribuidas y análisis de rendimiento

## Despliegue

### Pre-requisitos

- Azure CLI instalado
- Suscripción de Azure activa
- WSL (Windows Subsystem for Linux) configurado

### Pasos de despliegue desde WSL

1. **Iniciar sesión en Azure**
   ```bash
   az login
   ```

2. **Configurar la suscripción (si tienes múltiples suscripciones)**
   ```bash
   az account set --subscription "TU_SUBSCRIPTION_ID"
   ```

3. **Crear un grupo de recursos**
   ```bash
   RESOURCE_GROUP="rg-far-container-app-easyauth"
   LOCATION="eastus2"
   
   az group create \
     --name $RESOURCE_GROUP \
     --location $LOCATION
   ```

4. **Desplegar infraestructura base (sin Container App)**
   ```bash
   az deployment group create \
     --resource-group $RESOURCE_GROUP \
     --template-file biceps/main.bicep \
       --parameters location=$LOCATION deployContainerApp=false
   ```

5. **Importar la imagen al ACR privado** *(sin necesidad de Docker instalado localmente)*
   ```bash
   ACR_NAME=$(az deployment group show \
     --resource-group $RESOURCE_GROUP \
     --name main \
     --query properties.outputs.acrName.value \
     --output tsv)

   az acr import \
     --name $ACR_NAME \
     --source mcr.microsoft.com/dotnet/samples:aspnetapp \
     --image aspnetapp:latest
   ```

6. **Desplegar Container App (ya con imagen en ACR)**
   ```bash
   az deployment group create \
     --resource-group $RESOURCE_GROUP \
     --template-file biceps/main.bicep \
       --parameters location=$LOCATION deployContainerApp=true
   ```

7. **Obtener la URL de la aplicación**
   ```bash
   az deployment group show \
     --resource-group $RESOURCE_GROUP \
     --name main \
     --query properties.outputs.containerAppUrl.value \
     --output tsv
   ```

### Verificar el despliegue

Una vez desplegado, puedes acceder a la aplicación a través de la URL generada. Deberías ver la aplicación de ejemplo de ASP.NET Core.

```bash
# Ver todos los outputs del despliegue
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name main \
  --query properties.outputs
```

### Monitoreo con Application Insights

La infraestructura incluye Application Insights configurado automáticamente. Puedes ver la telemetría en:

1. **Portal de Azure → Application Insights → [nombre-del-recurso]**
   - Application Map: Visualización de dependencias
   - Performance: Tiempos de respuesta y duración
   - Failures: Errores y excepciones
   - Live Metrics: Métricas en tiempo real

2. **Consultas KQL útiles:**

```bash
# Ver logs de consola del Container App
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "ca-easyauth-demo"
| project TimeGenerated, Log_s
| order by TimeGenerated desc
| take 50

# Ver eventos del sistema (scaling, restarts)
ContainerAppSystemLogs_CL
| where ContainerAppName_s == "ca-easyauth-demo"
| project TimeGenerated, Reason_s, Log_s
| order by TimeGenerated desc

# Ver requests de la aplicación (requiere SDK en la app)
requests
| where cloud_RoleName has "ca-easyauth-demo"
| summarize count(), avg(duration) by resultCode, bin(timestamp, 5m)
| render timechart
```

> **Nota:** La imagen de ejemplo de .NET puede no tener el SDK de Application Insights instalado. Para telemetría completa de la aplicación (requests, dependencies, traces), necesitarás una imagen personalizada con el paquete `Azure.Monitor.OpenTelemetry.AspNetCore`.

## Siguiente paso: Easy Auth con Entra ID

Documentación de referencia: [Authentication with Microsoft Entra ID](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra)

## Instrumentación de Aplicación .NET para Application Insights

📚 **Para crear una aplicación .NET 10 con telemetría completa**, consulta la [guía de instrumentación](docs/DOTNET-INSTRUMENTATION.md).

**Resumen rápido**:
1. Instalar paquete: `dotnet add package Azure.Monitor.OpenTelemetry.AspNetCore`
2. Agregar en `Program.cs` (antes de `builder.Build()`):
   ```csharp
   using Azure.Monitor.OpenTelemetry.AspNetCore;
   builder.Services.AddOpenTelemetry().UseAzureMonitor();
   ```
3. La variable de entorno `APPLICATIONINSIGHTS_CONNECTION_STRING` ya está configurada automáticamente en el Container App

Con estos 3 pasos obtienes automáticamente:
- ✅ HTTP request/response tracking
- ✅ Dependency tracking (DB, HTTP calls)
- ✅ Exception tracking
- ✅ Custom logs con `ILogger`
- ✅ Distributed tracing
- ✅ Live metrics

Ver [guía completa](docs/DOTNET-INSTRUMENTATION.md) para Dockerfile, build, push a ACR y consultas KQL.

## Limpieza de recursos

Para eliminar todos los recursos creados (grupo de recursos, Container App, ACR, Log Analytics, etc.):

```bash
RESOURCE_GROUP="rg-far-container-app-easyauth"

# Eliminar el grupo de recursos y todos sus recursos
az group delete \
  --name $RESOURCE_GROUP \
  --yes \
  --no-wait

# Verificar que se está eliminando
az group show --name $RESOURCE_GROUP --query properties.provisioningState -o tsv
```

> **Nota:** `--no-wait` devuelve el control inmediatamente. La eliminación puede tardar varios minutos. Omítelo si quieres esperar a que termine.

