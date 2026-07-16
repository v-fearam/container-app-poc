# 🚀 Deployment Guide — Change Feed POC E2E

**Objetivo:** Desplegar desde cero el POC completo de Change Feed + Easy Auth en **45 minutos** sin tropezones.

**Fecha de última validación:** 2026-07-16  
**Estado:** ✅ Validado end-to-end

---

## 📌 Pre-requisitos (verificar ANTES de empezar)

### 1. Tools instalados
- ✅ WSL2 (Windows Subsystem for Linux) o Linux
- ✅ Azure CLI >= 2.50
- ✅ Docker Desktop corriendo (para local dev)
- ✅ .NET 10 SDK (para migrations locales)

### 2. Azure Subscription
```bash
# Verificar login y subscription
az account show
az account list --output table

# Si necesitas cambiar de subscription
az account set --subscription "<subscription-id>"
```

### 3. Variables de ambiente (exportar en tu terminal)
```bash
# Resource Group y Location
export RG="rg-far-container-app-easyauth"
export LOCATION="eastus2"
export SQL_LOCATION="centralus"  # ⚠️ IMPORTANTE: SQL Server YA existe en centralus

# Tu info de Entra ID (para SQL Server admin)
export SQL_ADMIN_LOGIN="<tu-email>@<tu-tenant>.onmicrosoft.com"
export SQL_ADMIN_OBJECT_ID="<tu-object-id>"

# ⚠️ Easy Auth App Registrations (REUTILIZAR las existentes)
# Portal Azure → Entra ID → App registrations → buscar "Weather App"
export FRONTEND_CLIENT_ID="<frontend-app-id>"
export FRONTEND_CLIENT_SECRET="<regenerar-o-usar-existente>"
export BACKEND_CLIENT_ID="<backend-app-id>"
export BACKEND_CLIENT_SECRET="<regenerar-o-usar-existente>"
export TENANT_ID="<tu-tenant-id>"

# Nombre del SQL Server existente (⚠️ CRÍTICO)
export SQL_SERVER_NAME="sql-weather-dash-7446"
```

**⚠️ NOTA CRÍTICA:**
- El SQL Server **YA EXISTE** en `centralus`. NO intentar crearlo en `eastus2`.
- Usa `sqlLocation=centralus` en todos los deploys que incluyan `deployDashboard=true`.
- Si el deploy falla con "SQL Server already exists in location X", verifica que `sqlLocation` apunta a la región correcta.

---

## 🏗️ Paso 1: Deploy de infraestructura base (5-7 min)

```bash
cd /mnt/c/repos/container-app-poc

# Deploy: ACR + Log Analytics + App Insights + Container App Environment + Key Vault
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters \
    location=$LOCATION \
    workloadName=weather \
    environmentShortName=dev \
    deployContainerApps=false \
    deployWorker=false \
    deployDashboard=false \
    deployCosmosDB=false \
    deployKeyVault=true \
  --name "base-infra-$(date +%s)"

# Capturar outputs importantes
export ACR_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.acrName.value' -o tsv)
export KV_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.keyVaultName.value' -o tsv)

echo "✅ ACR: $ACR_NAME"
echo "✅ Key Vault: $KV_NAME"
```

**¿Qué se desplegó?**
- Azure Container Registry (ACR) para imágenes Docker
- Log Analytics Workspace (logs centralizados)
- Application Insights (telemetría)
- Container App Environment (donde correrán las apps)
- Key Vault (secrets centralizados con RBAC)

---

## 🔐 Paso 2: Guardar secretos de Easy Auth en Key Vault (2 min)

```bash
# Secrets de Easy Auth (frontend y backend)
az keyvault secret set --vault-name $KV_NAME \
  --name auth-client-secret-frontend \
  --value "$FRONTEND_CLIENT_SECRET"

az keyvault secret set --vault-name $KV_NAME \
  --name auth-client-secret-backend \
  --value "$BACKEND_CLIENT_SECRET"

echo "✅ Secrets de Easy Auth guardados"
```

---

## 🗄️ Paso 3: Deploy SQL + Service Bus + Cosmos DB (7-10 min)

```bash
# ⚠️ NOTA: Usa sqlLocation=centralus porque el SQL Server ya existe ahí
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters \
    location=$LOCATION \
    sqlLocation=$SQL_LOCATION \
    workloadName=weather \
    environmentShortName=dev \
    deployContainerApps=false \
    deployKeyVault=true \
    deployWorker=true \
    deployDashboard=true \
    deployCosmosDB=true \
    deployChangeFeedWorker=false \
    sqlServerName=$SQL_SERVER_NAME \
    sqlAdminObjectId=$SQL_ADMIN_OBJECT_ID \
    sqlAdminLogin=$SQL_ADMIN_LOGIN \
  --name "infra-data-$(date +%s)"

# Capturar outputs
export SQL_SERVER=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlServerFqdn.value' -o tsv)
export SQL_DB=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlDatabaseName.value' -o tsv)
export COSMOS_ENDPOINT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosEndpoint.value' -o tsv)
export COSMOS_ACCOUNT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosAccountName.value' -o tsv)
export SB_NAMESPACE=$(az deployment group show -g $RG --name main --query 'properties.outputs.serviceBusNamespaceFqdn.value' -o tsv)

echo "✅ SQL Server: $SQL_SERVER"
echo "✅ SQL Database: $SQL_DB"
echo "✅ Cosmos Endpoint: $COSMOS_ENDPOINT"
echo "✅ Service Bus: $SB_NAMESPACE"
```

**¿Qué se desplegó?**
- SQL Server + Database (si no existía ya)
- Service Bus namespace + queues + topics
- Cosmos DB account + database + containers (personas, changefeed-leases, changefeed-errors)
- Managed Identity para workers (id-weather-worker-dev)
- RBAC roles: Cosmos DB Data Contributor, Service Bus Data Owner

**⚠️ Posibles warnings durante deploy:**
```
"RoleAssignmentExists": "The role assignment already exists..."
```
**Esto es NORMAL** — los roles ya están asignados de un deploy anterior. El deploy continúa sin problema.

---

## 💾 Paso 4: SQL User + Migrations (5-8 min) — ⚠️ MANUAL

### 4.1 Crear SQL Users (Azure Portal)

**Por qué es manual:** Bicep/ARM no puede ejecutar T-SQL. Hay que hacerlo una vez por ambiente.

```sql
-- Azure Portal → SQL Database (dashboard-poc) → Query editor
-- Autenticarse con Entra ID, ejecutar:

-- User para el worker (lee/escribe contadores)
CREATE USER [id-weather-worker-dev] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [id-weather-worker-dev];
ALTER ROLE db_datawriter ADD MEMBER [id-weather-worker-dev];

-- User para el backend (lee/escribe contadores y Sync tables)
CREATE USER [uami-ca-weather-be-dev] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [uami-ca-weather-be-dev];
ALTER ROLE db_datawriter ADD MEMBER [uami-ca-weather-be-dev];
```

### 4.2 Ejecutar Migrations desde local (WSL)

```bash
# 1. Abrir firewall temporalmente
MY_IP=$(curl -s ifconfig.me)
az sql server firewall-rule create \
  --resource-group $RG \
  --server $(echo $SQL_SERVER | cut -d'.' -f1) \
  --name AllowMyIP \
  --start-ip-address $MY_IP \
  --end-ip-address $MY_IP

# 2. Connection string con MI auth
export ConnectionStrings__DefaultConnection="Server=$SQL_SERVER;Database=$SQL_DB;Authentication=Active Directory Default;TrustServerCertificate=True"

# 3. Ejecutar migrations del DashboardWorker (incluye ChangeFeedCounters y SyncedPersonas)
cd /mnt/c/repos/container-app-poc/src/worker/DashboardWorker
dotnet ef database update --context DashboardDbContext

# 4. Cleanup: cerrar firewall
az sql server firewall-rule delete \
  --resource-group $RG \
  --server $(echo $SQL_SERVER | cut -d'.' -f1) \
  --name AllowMyIP

echo "✅ Migrations ejecutadas correctamente"
```

**Tablas creadas:**
- `QueueCounters` (workers Dashboard/Weather)
- `ComponentHealth` (heartbeats)
- `ChangeFeedCounters` (métricas del Change Feed Worker)
- `SyncedPersonas` (Personas sincronizadas desde Cosmos)

---

## 🐳 Paso 5: Build y push de imágenes Docker (10-15 min)

**⚠️ NOTA:** Ejecutar desde **PowerShell** (NO WSL), porque Docker Desktop corre en Windows.

```powershell
cd C:\repos\container-app-poc

# Verificar que $ACR_NAME esté disponible (si no, exportarlo de nuevo)
# $ACR_NAME = "<acr-name-from-step-1>"

# Backend API
az acr build --registry $ACR_NAME --image weather-api:latest `
  --file src\backend\WeatherApi\Dockerfile `
  src\backend\WeatherApi

# Frontend (React + Nginx)
az acr build --registry $ACR_NAME --image weather-frontend:latest `
  --file src\frontend\Dockerfile `
  src\frontend

# WeatherWorker (queue processor)
az acr build --registry $ACR_NAME --image weather-worker:latest `
  --file src\worker\WeatherWorker\Dockerfile `
  src\worker\WeatherWorker

# DashboardWorker (topic processor)
az acr build --registry $ACR_NAME --image dashboard-worker:latest `
  --file src\worker\DashboardWorker\Dockerfile `
  src\worker\DashboardWorker

# ChangeFeedWorker (Cosmos → SQL sync)
az acr build --registry $ACR_NAME --image changefeed-worker:latest `
  --file src\worker\ChangeFeedWorker\Dockerfile `
  src\worker\ChangeFeedWorker
```

**Tiempo estimado:** ~2-3 minutos por imagen (total: 10-15 min)

---

## 🚀 Paso 6: Deploy Container Apps (5-7 min)

```bash
# Volver a WSL
cd /mnt/c/repos/container-app-poc

# Deploy todas las Container Apps
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters \
    location=$LOCATION \
    sqlLocation=$SQL_LOCATION \
    workloadName=weather \
    environmentShortName=dev \
    containerRegistryName=$ACR_NAME \
    serviceBusNamespaceName=$(echo $SB_NAMESPACE | cut -d'.' -f1) \
    keyVaultName=$KV_NAME \
    cosmosAccountName=$COSMOS_ACCOUNT \
    sqlServerName=$SQL_SERVER_NAME \
    sqlAdminObjectId=$SQL_ADMIN_OBJECT_ID \
    sqlAdminLogin=$SQL_ADMIN_LOGIN \
    deployContainerApps=true \
    deployKeyVault=true \
    deployWorker=true \
    deployWorkerApp=true \
    deployDashboard=true \
    deployDashboardWorkerApp=true \
    deployCosmosDB=true \
    deployChangeFeedWorker=true \
  --name "apps-$(date +%s)"

# Capturar FQDNs
export BACKEND_FQDN=$(az containerapp show -n ca-weather-be-dev -g $RG --query 'properties.configuration.ingress.fqdn' -o tsv)
export FRONTEND_FQDN=$(az containerapp show -n ca-weather-fe-dev -g $RG --query 'properties.configuration.ingress.fqdn' -o tsv)

echo "✅ Backend: https://$BACKEND_FQDN"
echo "✅ Frontend: https://$FRONTEND_FQDN"
```

**¿Qué se desplegó?**
- Backend Container App (`ca-weather-be-dev`)
  - Env vars: `SQL_CONNECTION_STRING`, `Cosmos__Endpoint`, `Cosmos__Database`, `Cosmos__Collection`, `ServiceBus__Namespace`, `AZURE_CLIENT_ID`
  - Secrets: `sql-connection-string`, `appinsights-connection-string`
  - **CRÍTICO:** `deployDashboard=true` asegura que SQL_CONNECTION_STRING esté presente (ver Gotcha #7)
- Frontend Container App (`ca-weather-fe-dev`)
- WeatherWorker Container App (`ca-weather-worker-dev`) - KEDA queue scaler
- DashboardWorker Container App (`ca-dashboard-worker-dev`) - KEDA topic scaler
- ChangeFeedWorker Container App (`ca-changefeed-worker-dev`) - fixed 1 replica

---

## 🔐 Paso 7: Deploy Easy Auth (5 min)

### 7.1 Actualizar Redirect URIs en Entra ID

**⚠️ MANUAL — Solo si los FQDNs cambiaron:**

1. Azure Portal → Entra ID → App registrations
2. Buscar "Weather App Frontend"
3. Authentication → Add URI: `https://<frontend-fqdn>/.auth/login/aad/callback`
4. Save

### 7.2 Deploy Easy Auth via Bicep

```bash
# Deploy Easy Auth config para Frontend y Backend
az deployment group create \
  --resource-group $RG \
  --template-file biceps/easyauth.bicep \
  --parameters \
    backendAppName=ca-weather-be-dev \
    frontendAppName=ca-weather-fe-dev \
    frontendClientId=$FRONTEND_CLIENT_ID \
    backendClientId=$BACKEND_CLIENT_ID \
    tenantId=$TENANT_ID \
    keyVaultName=$KV_NAME \
  --name "easyauth-$(date +%s)"

echo "✅ Easy Auth configurado"
```

**⚠️ Token Store (Blob Storage):**
El token store necesita un **SAS URL** guardado manualmente en Key Vault como `token-store-sas`.
Si no existe, Easy Auth funciona igual pero sin token refresh automático.

---

## ✅ Paso 8: Validación E2E (5-10 min)

### 8.1 Verificar health de todos los servicios

```bash
# Backend health
curl https://$BACKEND_FQDN/api/health | jq .

# Esperar respuesta:
# {
#   "status": "Healthy",
#   "results": {
#     "self": { "status": "Healthy" },
#     "sql": { "status": "Healthy" }
#   }
# }
```

### 8.2 Test Change Feed POC E2E

```bash
# 1. Crear persona en Cosmos via API
curl -X POST https://$BACKEND_FQDN/api/cosmos/personas \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan",
    "apellido": "Pérez",
    "edad": 30,
    "activo": true
  }' | jq .

# Respuesta esperada:
# {
#   "id": "<guid>",
#   "nombre": "Juan",
#   "apellido": "Pérez",
#   "edad": 30,
#   "activo": true,
#   "updatedAt": "2026-07-16T..."
# }

# 2. Verificar documento en Cosmos
curl https://$BACKEND_FQDN/api/cosmos/personas | jq .

# 3. Esperar 15-20 segundos (ChangeFeedWorker procesando)
sleep 20

# 4. Verificar sincronización en SQL
curl https://$BACKEND_FQDN/api/sync/personas | jq .

# Respuesta esperada (si sync funcionó):
# [
#   {
#     "id": "<guid>",
#     "nombre": "Juan",
#     "apellido": "Pérez",
#     "edad": 30,
#     "cosmosUpdatedAt": "2026-07-16T...",
#     "syncedAt": "2026-07-16T...",
#     "syncVersion": 1
#   }
# ]
```

**✅ Si ves el documento en `/api/sync/personas` → ¡E2E funciona!**

### 8.3 Test Frontend + Easy Auth

```bash
# Abrir frontend en browser
echo "Abrir en browser: https://$FRONTEND_FQDN"
```

**Flujo esperado:**
1. Browser redirige a Microsoft login
2. Después de autenticar → Dashboard page con métricas
3. Navegar a "Health" → ver estado de todos los servicios
4. Navegar a "DLQ Manager" → ver queues/topics del Service Bus

---

## 🎯 Resumen: Lo que acabas de desplegar

```
┌──────────────────────────────────────────────────────────────┐
│                    Azure Container Apps Environment          │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │  Frontend  │  │  Backend   │  │  Workers (3)         │  │
│  │  React     │──│  .NET 10   │  │  - WeatherWorker     │  │
│  │  Easy Auth │  │  Easy Auth │  │  - DashboardWorker   │  │
│  │            │  │  Cosmos+SQL│  │  - ChangeFeedWorker  │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
        │                  │                    │
        ▼                  ▼                    ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Entra ID    │  │  Cosmos DB       │  │  Service Bus     │
│  Easy Auth   │  │  (3 containers)  │  │  (queues+topics) │
└──────────────┘  └──────────────────┘  └──────────────────┘
        │                  │                    │
        ▼                  ▼                    ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Key Vault   │  │  SQL Server      │  │  App Insights    │
│  (secrets)   │  │  (4 tables)      │  │  (telemetry)     │
└──────────────┘  └──────────────────┘  └──────────────────┘
```

**Recursos desplegados:**
- 5 Container Apps (Frontend, Backend, 3 Workers)
- 1 Azure Container Registry (ACR)
- 1 Cosmos DB account (3 containers)
- 1 SQL Server + Database (4 tables)
- 1 Service Bus namespace (1 queue, 1 topic, 1 subscription)
- 1 Key Vault (6 secrets)
- 1 Log Analytics Workspace
- 1 Application Insights
- 2 Managed Identities (Backend + Workers)

---

## 🐛 Gotchas & Lecciones Aprendidas

### Gotcha #1: SQL Server Location Mismatch
**Error:** `"The resource 'sql-weather-dash-7446' already exists in location 'centralus' in resource group... A resource with the same name cannot be created in location 'eastus2'"`

**Solución:** Usar `sqlLocation=centralus` en el deploy. El SQL Server ya existe en centralus.

---

### Gotcha #2: Backend no resuelve DashboardDbContext
**Error:** `"Unable to resolve service for type 'WeatherApi.Data.DashboardDbContext'"`

**Causa:** Backend no tenía `SQL_CONNECTION_STRING` en env vars.

**Solución:** Asegurarse de que `deployDashboard=true` en el deploy de Container Apps. Esto agrega automáticamente:
- Secret `sql-connection-string` (KV reference)
- Env var `SQL_CONNECTION_STRING=secretref:sql-connection-string`
- Registra `DashboardDbContext` en DI

---

### Gotcha #3: Cosmos DB "required properties 'id' missing"
**Error:** `"The input content is invalid because the required properties - 'id;' - are missing"`

**Causa:** Cosmos DB espera propiedades en **lowercase** (`id`, `nombre`) pero C# usa PascalCase (`Id`, `Nombre`).

**Solución aplicada en código:**
```csharp
// src/backend/WeatherApi/Models/PersonaModels.cs
public class PersonaDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("nombre")]
    public string Nombre { get; set; }
    // ...
}

// src/backend/WeatherApi/Program.cs
builder.Services.AddSingleton(sp =>
{
    var endpoint = builder.Configuration["Cosmos:Endpoint"];
    return new CosmosClient(endpoint, new DefaultAzureCredential(),
        new CosmosClientOptions
        {
            SerializerOptions = new CosmosSerializationOptions
            {
                PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase
            }
        });
});
```

---

### Gotcha #4: RBAC Role Assignment Warnings
**Warning:** `"RoleAssignmentExists": "The role assignment already exists..."`

**¿Es un error?** NO. Es solo un warning. El deployment continúa exitosamente.

**Por qué pasa:** Bicep usa `guid()` para role assignment names. Si re-deployás, el guid es el mismo → Azure detecta que ya existe.

---

### Gotcha #5: Container App no toma imagen nueva después de `az acr build`
**Problema:** Hiciste `az acr build` pero el Container App sigue usando la imagen vieja.

**Causa:** Azure Container Apps **cachea imágenes** por digest. Si el tag es el mismo (`:latest`), no re-pull.

**Solución:** Forzar nueva revisión con `--revision-suffix` único:
```bash
az containerapp update -n ca-weather-be-dev -g $RG \
  --image $ACR_NAME.azurecr.io/weather-api:latest \
  --revision-suffix "be-$(date +%s)"
```

---

### Gotcha #6: ChangeFeedWorker no escala con KEDA
**Pregunta:** ¿Por qué no hay KEDA scaler para ChangeFeedWorker?

**Respuesta:** El Change Feed Processor **distribuye trabajo automáticamente** via leases (una lease por partición física de Cosmos). No necesita KEDA.

**Configuración correcta:**
```bicep
scale: {
  minReplicas: 1  // Siempre ON — evita lag de rebalanceo (~77s)
  maxReplicas: 1  // Para POC con 1 partición física
}
```

**Para producción:** `maxReplicas` = número de particiones físicas del container Cosmos.

---

### Gotcha #7: Backend necesita `deployDashboard=true` para SQL support
**Problema:** Backend no tiene `SQL_CONNECTION_STRING` → no puede leer/escribir SQL.

**Causa:** En `main.bicep`, la configuración SQL del backend está condicionada a `deployDashboard`:
```bicep
// biceps/modules/backend-container-app.bicep
enableSql: deployDashboard  // ← Si deployDashboard=false, no hay SQL config
```

**Solución:** SIEMPRE usar `deployDashboard=true` cuando deployés Backend + ChangeFeedWorker.

---

### Gotcha #8: SAS URLs con `&` fallan en Key Vault
**Error:** `az keyvault secret set --value "<sas-url-with-&>"` → `&` se interpreta como separador de comandos.

**Solución:** Guardar en archivo temporal:
```bash
echo "https://...?sig=...&se=..." > /tmp/sas.txt
az keyvault secret set --vault-name $KV_NAME --name token-store-sas --file /tmp/sas.txt
rm /tmp/sas.txt
```

---

## 📚 Documentación de referencia

| Documento | Descripción |
|-----------|-------------|
| [`README.md`](../README.md) | Arquitectura general, KQL queries |
| [`DEPLOYMENT.md`](../DEPLOYMENT.md) | Guía de deploy manual paso a paso |
| [`docs/change-feed-poc.md`](./change-feed-poc.md) | Diseño técnico del Change Feed POC |
| [`docs/dashboard-poc.md`](./dashboard-poc.md) | Diseño del Dashboard |
| [`docs/WORKER-KEDA-DESIGN.md`](./WORKER-KEDA-DESIGN.md) | Workers + KEDA scaling patterns |
| [`docs/EASY-AUTH-TUTORIAL.md`](./EASY-AUTH-TUTORIAL.md) | Tutorial Easy Auth paso a paso |
| [`AGENTS.md`](../AGENTS.md) | Convenciones del proyecto, tech stack |

---

## 🧪 Testing local (opcional)

### Correr Backend localmente con Cosmos + SQL

```bash
# 1. Exportar variables de ambiente
export Cosmos__Endpoint="https://$COSMOS_ACCOUNT.documents.azure.com:443/"
export Cosmos__Database="change-feed-poc"
export Cosmos__Collection="personas"
export SQL_CONNECTION_STRING="Server=$SQL_SERVER;Database=$SQL_DB;Authentication=Active Directory Default;TrustServerCertificate=True"
export APPLICATIONINSIGHTS_CONNECTION_STRING="<from-kv>"

# 2. Correr backend
cd src/backend/WeatherApi
dotnet run

# 3. Test endpoints
curl http://localhost:5000/api/health
curl http://localhost:5000/api/cosmos/personas
```

---

## 🔄 Re-deployments (updates)

### Actualizar solo código (sin infra)

```bash
# 1. Build nueva imagen (PowerShell)
cd C:\repos\container-app-poc
az acr build --registry $ACR_NAME --image weather-api:latest `
  --file src\backend\WeatherApi\Dockerfile `
  src\backend\WeatherApi

# 2. Forzar nueva revisión (WSL)
az containerapp update -n ca-weather-be-dev -g $RG \
  --image $ACR_NAME.azurecr.io/weather-api:latest \
  --revision-suffix "be-$(date +%s)"
```

### Actualizar infra sin tocar Container Apps

```bash
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters deployContainerApps=false <otros-params> \
  --name "infra-update-$(date +%s)"
```

---

## ✅ Checklist final

Antes de cerrar, verifica:

- [ ] `curl https://$BACKEND_FQDN/api/health` → `"status": "Healthy"`
- [ ] `curl https://$BACKEND_FQDN/api/cosmos/personas` → lista personas
- [ ] `curl https://$BACKEND_FQDN/api/sync/personas` → lista personas sincronizadas desde Cosmos
- [ ] Frontend (`https://$FRONTEND_FQDN`) redirige a Microsoft login
- [ ] Después de login → Dashboard page carga sin errores
- [ ] Health page muestra todos los servicios como "Healthy"
- [ ] DLQ Manager page carga métricas de Service Bus
- [ ] Logs del ChangeFeedWorker muestran "Batch processing complete"

**Si todos los checkmarks están verdes → ¡Deploy exitoso! 🎉**

---

**Última actualización:** 2026-07-16  
**Validado por:** Federico Arambarri  
**Tiempo total estimado:** 45-60 minutos (sin contar builds de Docker)
