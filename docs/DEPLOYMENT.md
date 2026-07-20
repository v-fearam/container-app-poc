# Deployment Guide — Change Feed POC

> **Objetivo:** Comandos completos para deployar y re-deployar la POC desde cero.  
> **Contexto:** El viernes se borra todo. El lunes se replica con estos comandos.

---

## Managed Identity & Secrets Architecture

**Filosofía:** Todos los Azure services usan **Managed Identity** (NO connection strings con credenciales).

| Service | Auth Method | Secret in Key Vault? |
|---------|-------------|---------------------|
| **SQL Database** | Connection string con `Authentication=Active Directory Default` | ❌ NO — se pasa como env var directo (no tiene credenciales) |
| **Cosmos DB** | Endpoint + `DefaultAzureCredential` | ❌ NO — endpoint se pasa como env var directo (público) |
| **Service Bus** | Namespace FQDN + `DefaultAzureCredential` | ❌ NO — FQDN se pasa como env var directo (público) |
| **App Insights** | Connection string (tiene instrumentation key) | ✅ SÍ — `appinsights-connection-string` |
| **Easy Auth** | Client secrets (credenciales de Entra ID apps) | ✅ SÍ — `auth-client-secret-frontend`, `auth-client-secret-backend` |
| **Token Store** | SAS URL (short-lived, regenerado en cada deploy) | ✅ SÍ — `token-store-sas` |

**Roles de Bicep:**
- Bicep asigna automáticamente todos los roles RBAC necesarios (Cosmos Data Contributor, Service Bus Owner, SQL AAD Admin, Key Vault Secrets User)
- **Excepción:** SQL Database requiere `CREATE USER` manual (Bicep no puede ejecutar T-SQL)

---

## Pre-requisitos

1. Azure CLI autenticado: `az login`
2. Suscripción seleccionada: `az account set --subscription <id>`
3. Permisos necesarios:
   - Owner o Contributor en la suscripción
   - Key Vault Secrets Officer (para seed automático de secrets)
   - Cosmos DB Account Contributor

---

## Variables globales

```bash
# Configuración base
export RG="rg-far-container-app-easyauth"
export LOCATION="eastus2"
export WORKLOAD="weather"
export ENV="dev"

# Tu Entra ID admin (obtenido automáticamente desde az cli)
export SQL_ADMIN_LOGIN=$(az account show --query user.name -o tsv)
export SQL_ADMIN_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
```

---

## Paso 1: Deploy infraestructura base (sin Container Apps)

```bash
# Crear resource group (si no existe)
az group create --name $RG --location $LOCATION

# Deploy: ACR + App Insights + Log Analytics + Container App Environment + Key Vault
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters \
    location=$LOCATION \
    workloadName=$WORKLOAD \
    environmentShortName=$ENV \
    deployContainerApps=false \
    deployWorker=false \
    deployDashboard=false \
    deployCosmosDB=false \
  --name "base-infra-$(date +%s)"

# Outputs
export ACR_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.acrName.value' -o tsv)
export ACR_LOGIN_SERVER=$(az deployment group show -g $RG --name main --query 'properties.outputs.acrLoginServer.value' -o tsv)
export KV_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.keyVaultName.value' -o tsv || echo "")
export APP_INSIGHTS_CONN=$(az deployment group show -g $RG --name main --query 'properties.outputs.appInsightsConnectionString.value' -o tsv)

echo "ACR: $ACR_NAME"
echo "Key Vault: $KV_NAME"

# Asignar rol "Key Vault Secrets Officer" a tu usuario (necesario para escribir secrets)
az role assignment create \
  --role "Key Vault Secrets Officer" \
  --assignee $(az ad signed-in-user show --query id -o tsv) \
  --scope $(az keyvault show --name $KV_NAME --resource-group $RG --query id -o tsv)

echo "⏳ Esperar ~60 segundos para propagación de RBAC antes de continuar..."
sleep 60
echo "✅ Rol asignado y propagado"
```

---

## Paso 2: Configurar Easy Auth secrets en Key Vault

⚠️ **CRÍTICO:** Los Container Apps (frontend y backend) referencian estos secrets desde Key Vault. Si no existen, el deployment de Container Apps (Paso 6) va a **fallar** o los apps no van a arrancar.

```bash
# App Registrations (REUTILIZAR las existentes del ambiente actual)
# Portal → Entra ID → App registrations → buscar "Weather App Backend" y "Weather App Frontend"

export FRONTEND_CLIENT_ID="e9e60b6c-3b17-40f9-8722-0e2387fb232d"
export BACKEND_CLIENT_ID="9cbeba2f-de5d-42c5-b886-1f1395e59e3e"

# Regenerar client secrets en el portal (o usar existentes si los tenés guardados):
# Frontend App Registration → Certificates & secrets → New client secret → copiar value
export FRONTEND_CLIENT_SECRET="<value-del-portal>"

# Backend App Registration → Certificates & secrets → New client secret → copiar value  
export BACKEND_CLIENT_SECRET="<value-del-portal>"

# Guardar secrets en Key Vault (REQUERIDO ANTES del Paso 6)
az keyvault secret set \
  --vault-name $KV_NAME \
  --name auth-client-secret-frontend \
  --value "$FRONTEND_CLIENT_SECRET"

az keyvault secret set \
  --vault-name $KV_NAME \
  --name auth-client-secret-backend \
  --value "$BACKEND_CLIENT_SECRET"

# Verificar que existen
az keyvault secret show --vault-name $KV_NAME --name auth-client-secret-frontend --query name -o tsv
az keyvault secret show --vault-name $KV_NAME --name auth-client-secret-backend --query name -o tsv

echo "✅ Easy Auth secrets guardados en Key Vault"
```

**NOTA:** Si las App Registrations no existen, ver Anexo A para crearlas desde cero.

---

## Paso 3: Build y push imágenes Docker

```bash
# Backend
az acr build --registry $ACR_NAME \
  --image weather-api:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Frontend
az acr build --registry $ACR_NAME \
  --image weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend

# WeatherWorker
az acr build --registry $ACR_NAME \
  --image weather-worker:latest \
  --file src/worker/WeatherWorker/Dockerfile \
  src/worker/WeatherWorker

# DashboardWorker
az acr build --registry $ACR_NAME \
  --image dashboard-worker:latest \
  --file src/worker/DashboardWorker/Dockerfile \
  src/worker/DashboardWorker

# ChangeFeedWorker
az acr build --registry $ACR_NAME \
  --image changefeed-worker:latest \
  --file src/worker/ChangeFeedWorker/Dockerfile \
  src/worker/ChangeFeedWorker
```

---

## Paso 4: Deploy Worker + Dashboard + Cosmos infrastructure

```bash
# Deploy: SQL Server + Database + Service Bus + Cosmos DB + Worker Identity + roles
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters \
    deployWorker=true \
    deployDashboard=true \
    deployCosmosDB=true \
    deployContainerApps=false \
    sqlLocation=centralus \
    sqlAdminLogin=$SQL_ADMIN_LOGIN \
    sqlAdminObjectId=$SQL_ADMIN_OBJECT_ID \
  --name "main"

# Outputs
export SQL_SERVER=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlServerFqdn.value' -o tsv)
export SQL_DB=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlDatabaseName.value' -o tsv)
export SQL_CONN_STR=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlConnectionString.value' -o tsv)
export SB_NAMESPACE=$(az deployment group show -g $RG --name main --query 'properties.outputs.serviceBusNamespaceFqdn.value' -o tsv)
export COSMOS_ENDPOINT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosEndpoint.value' -o tsv)
export COSMOS_ACCOUNT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosAccountName.value' -o tsv)

echo "SQL Server: $SQL_SERVER"
echo "Database: $SQL_DB"
echo "Service Bus: $SB_NAMESPACE"
echo "Cosmos Endpoint: $COSMOS_ENDPOINT"
```

**NOTA:** Cosmos DB usa Managed Identity (no connection string). El backend identity obtiene automáticamente el rol "Cosmos DB Built-in Data Contributor" via Bicep.

---

## Paso 5: Configurar SQL Database (User + Migrations)

⚠️ **CRÍTICO:** SQL Database necesita usuarios para las managed identities (Worker Y Backend) antes de que los apps puedan conectarse. Sin esto: `Login failed for user '<token-identified principal>'` error.

### 5.1 Crear usuarios de managed identity en SQL

```bash
# Obtener nombres de las managed identities del deployment
export WORKER_IDENTITY_NAME=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.workerIdentityName.value' -o tsv)

export BACKEND_IDENTITY_NAME=$(az containerapp show -n ca-weather-be-dev -g $RG \
  --query 'identity.userAssignedIdentities' -o json | jq -r 'keys[0]' | xargs basename)

export SQL_SERVER=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.sqlServerFqdn.value' -o tsv | cut -d'.' -f1)

export SQL_DB=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.sqlDatabaseName.value' -o tsv)

echo "Worker identity: $WORKER_IDENTITY_NAME"
echo "Backend identity: $BACKEND_IDENTITY_NAME"
echo "SQL Server: $SQL_SERVER"
echo "Database: $SQL_DB"

# Imprimir el T-SQL a ejecutar (con los nombres reales de las identities)
echo ""
echo "================================================================================"
echo "EJECUTAR EN AZURE PORTAL → SQL Database → Query editor:"
echo "================================================================================"
echo ""
echo "-- 1. Crear usuario para WORKER identity (DashboardWorker, WeatherWorker, ChangeFeedWorker):"
echo "CREATE USER [$WORKER_IDENTITY_NAME] FROM EXTERNAL PROVIDER;"
echo "ALTER ROLE db_datareader ADD MEMBER [$WORKER_IDENTITY_NAME];"
echo "ALTER ROLE db_datawriter ADD MEMBER [$WORKER_IDENTITY_NAME];"
echo ""
echo "-- 2. Crear usuario para BACKEND identity (ca-weather-be-dev):"
echo "CREATE USER [$BACKEND_IDENTITY_NAME] FROM EXTERNAL PROVIDER;"
echo "ALTER ROLE db_datareader ADD MEMBER [$BACKEND_IDENTITY_NAME];"
echo "ALTER ROLE db_datawriter ADD MEMBER [$BACKEND_IDENTITY_NAME];"
echo ""
echo "================================================================================"
```

**Cómo ejecutarlo:** 
1. Abrir [Azure Portal](https://portal.azure.com) → SQL Database `dashboard-poc` → **Query editor**
2. Autenticarse con **Entra ID** (tu usuario admin)
3. Copiar y pegar el T-SQL de arriba (ambos bloques: worker Y backend)
4. Ejecutar (se ejecutan juntos sin problema)

**Explicación:** Bicep puede asignar roles RBAC de Azure, pero **NO** puede crear usuarios SQL dentro de la database. Esto es un paso manual obligatorio (Gotcha #7).

### 5.2 Correr EF Core migrations

```bash
# Opción 1: Desde local (requiere firewall rule para tu IP + connection string)
cd src/worker/DashboardWorker

# Agregar tu IP al firewall de SQL Server
MY_IP=$(curl -s ifconfig.me)
az sql server firewall-rule create \
  --resource-group $RG \
  --server $(echo $SQL_SERVER | cut -d'.' -f1) \
  --name AllowMyIP \
  --start-ip-address $MY_IP \
  --end-ip-address $MY_IP

# Connection string con tu Entra ID admin
export ConnectionStrings__DefaultConnection="Server=$SQL_SERVER;Database=$SQL_DB;Authentication=Active Directory Default;TrustServerCertificate=True"

# Instalar dotnet-ef tool (si no está instalado)
dotnet tool install --global dotnet-ef
# O actualizar si ya existe:
# dotnet tool update --global dotnet-ef

# Asegurarse que ~/.dotnet/tools está en PATH (común en WSL)
export PATH="$PATH:$HOME/.dotnet/tools"

# Correr migrations
dotnet ef database update --context DashboardDbContext

# Remover firewall rule (opcional, por seguridad)
az sql server firewall-rule delete \
  --resource-group $RG \
  --server $(echo $SQL_SERVER | cut -d'.' -f1) \
  --name AllowMyIP

# Opción 2: Desde Azure Portal SQL Query Editor (manual)
# Portal → SQL Database dashboard-poc → Query editor → autenticarse con Entra ID
# Ejecutar el siguiente script (crea todas las tablas necesarias):
# → Copiar y pegar contenido de: sql/003-changefeed-tables.sql
```

**Migrations incluidas:**
- Initial: QueueCounters table
- AddChangeFeedTables: PersonasSync + ChangeFeedCounters tables

---

## Paso 6: Deploy Container Apps (Backend + Frontend + Workers)

```bash
# Deploy: Backend + Frontend + WeatherWorker + DashboardWorker + ChangeFeedWorker
# IMPORTANTE: pasar todos los flags deploy* para que las condiciones del Bicep sean true
az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters \
    deployContainerApps=true \
    deployWorker=true \
    deployWorkerApp=true \
    deployDashboard=true \
    deployDashboardWorkerApp=true \
    deployCosmosDB=true \
    deployChangeFeedWorker=true \
    sqlLocation=centralus \
    sqlAdminLogin=$SQL_ADMIN_LOGIN \
    sqlAdminObjectId=$SQL_ADMIN_OBJECT_ID \
  --name "main"

# Outputs
export BACKEND_URL=$(az deployment group show -g $RG --name main --query 'properties.outputs.backendAppUrl.value' -o tsv)
export FRONTEND_URL=$(az deployment group show -g $RG --name main --query 'properties.outputs.frontendAppUrl.value' -o tsv)

echo "Backend URL: $BACKEND_URL"
echo "Frontend URL: $FRONTEND_URL"

# ⚠️ VERIFICACIÓN POST-DEPLOY (CRÍTICO para Managed Identity)
# Verificar que el backend tenga los env vars CORRECTOS (NO secrets)
echo ""
echo "=== Verificando configuración del backend ==="

# 1. Secrets (deberían ser solo 2: appinsights + auth)
echo "Secrets en backend (esperado: 2):"
az containerapp show -n ca-weather-be-dev -g $RG \
  --query "properties.configuration.secrets[].name" -o table

# 2. Env vars críticos (Cosmos__Endpoint y SQL_CONNECTION_STRING deben ser 'value', NO 'secretRef')
echo ""
echo "Environment variables (Cosmos__Endpoint y SQL_CONNECTION_STRING deben tener valor, NO secret ref):"
az containerapp show -n ca-weather-be-dev -g $RG \
  --query "properties.template.containers[0].env[?contains(name, 'Cosmos') || contains(name, 'SQL')].{name:name, value:value, secretRef:secretRef}" \
  -o table

# 3. Secrets en Key Vault (deberían ser solo 3: appinsights + 2 auth secrets)
echo ""
echo "Secrets en Key Vault (esperado: 3):"
az keyvault secret list --vault-name $KV_NAME --query "[].name" -o tsv

echo ""
echo "✅ Si hay más de 2 secrets en backend O más de 3 en Key Vault, ver sección Troubleshooting"
```

**Configuración esperada después del deploy:**

| Componente | Configuración | Esperado |
|------------|---------------|----------|
| **Backend secrets** | `appinsights-connection-string`, `microsoft-provider-authentication-secret` | ✅ 2 secrets |
| **Backend env vars** | `Cosmos__Endpoint` (value), `SQL_CONNECTION_STRING` (value), `ServiceBus__Namespace` (value) | ✅ env vars con valor directo |
| **Key Vault secrets** | `appinsights-connection-string`, `auth-client-secret-backend`, `auth-client-secret-frontend` | ✅ 3 secrets |

**⚠️ ANTI-PATTERNS (si ves esto, el deploy está mal):**
- ❌ `cosmos-connection-string` o `sql-connection-string` en Key Vault
- ❌ `COSMOS_CONNECTION_STRING` env var en backend (debería ser `Cosmos__Endpoint`)
- ❌ Backend env vars con `secretRef` para Cosmos o SQL (deben ser `value`)

---

echo "Backend: https://$BACKEND_URL"
echo "Frontend: https://$FRONTEND_URL"
```

---

## Paso 7: Deploy Easy Auth (Entra ID OIDC)

⚠️ **CRÍTICO:** Este paso es **obligatorio**. Sin Easy Auth configurado, el backend devolverá **401 - No autenticado** en todos los endpoints aunque el frontend muestre "Autenticado".

### 7.1 Actualizar Redirect URIs (si cambió el FQDN)

```bash
# Portal → Entra ID → App registrations → Frontend App → Authentication
# Verificar que exista la redirect URI correcta según el tipo de tenant:
#
#   Entra ID normal (workforce):  https://<frontend-fqdn>/.auth/login/aad/callback
#   Entra External ID (CIAM):     https://<frontend-fqdn>/.auth/login/entraid/callback
#
# Si el FQDN cambió, agregar nueva redirect URI del tipo correcto
```

### 7.2 Deploy Easy Auth config

```bash
# OIDC Well-Known URL según el tipo de tenant:
#   Entra External ID (CIAM):    https://<subdomain>.ciamlogin.com/$TENANT_ID/v2.0/.well-known/openid-configuration
#   Entra ID normal (workforce): https://login.microsoftonline.com/$TENANT_ID/v2.0/.well-known/openid-configuration
#
# Este proyecto usa CIAM (cognitomigration):
export OIDC_WELL_KNOWN_URL="https://cognitomigration.ciamlogin.com/$TENANT_ID/v2.0/.well-known/openid-configuration"

# IMPORTANTE: inyectar client secrets en los Container Apps ANTES del deploy.
# El Bicep referencia "microsoft-provider-authentication-secret" por nombre pero no lo crea.
az containerapp secret set \
  --name ca-weather-fe-dev \
  --resource-group $RG \
  --secrets "microsoft-provider-authentication-secret=$FRONTEND_CLIENT_SECRET"

az containerapp secret set \
  --name ca-weather-be-dev \
  --resource-group $RG \
  --secrets "microsoft-provider-authentication-secret=$BACKEND_CLIENT_SECRET"

# Deploy Easy Auth (nombre fijo "easyauth" para poder leer outputs después)
az deployment group create \
  --resource-group $RG \
  --template-file biceps/easyauth.bicep \
  --parameters \
    backendAppName="ca-weather-be-dev" \
    frontendAppName="ca-weather-fe-dev" \
    frontendClientId=$FRONTEND_CLIENT_ID \
    backendClientId=$BACKEND_CLIENT_ID \
    oidcWellKnownUrl="$OIDC_WELL_KNOWN_URL" \
    providerName="entraid" \
  --name "easyauth"

# Actualizar token-store-sas en Key Vault con el valor real generado por el deployment
export TOKEN_STORE_SAS=$(az deployment group show -g $RG \
  --name "easyauth" \
  --query 'properties.outputs.tokenStoreSasUrl.value' -o tsv)

az keyvault secret set --vault-name $KV_NAME \
  --name token-store-sas \
  --value "$TOKEN_STORE_SAS"

# Reiniciar frontend para que lea el nuevo token-store-sas
REVISION=$(az containerapp revision list \
  --name ca-weather-fe-dev \
  --resource-group $RG \
  --query "[?properties.active].name" -o tsv)

az containerapp revision restart \
  --name ca-weather-fe-dev \
  --resource-group $RG \
  --revision "$REVISION"

echo "✅ Easy Auth configurado"
echo "Callback URL para App Registration:"
az deployment group show -g $RG --name "easyauth" \
  --query 'properties.outputs.frontendCallbackUrl.value' -o tsv
```

---

## Paso 8: Validar Change Feed POC End-to-End

### 8.1 Test Frontend con autenticación

```bash
# Abrir en browser
open https://$FRONTEND_URL

# Debería redirigir a login de Microsoft
# Después de login: ver dashboard, DLQ manager, health page
```

### 8.2 Test Change Feed POC

```bash
# 1. Crear documento de prueba en Cosmos
az cosmosdb sql container item create \
  --account-name $COSMOS_ACCOUNT \
  --database-name change-feed-poc \
  --container-name personas \
  --resource-group $RG \
  --partition-key-value "test-001" \
  --body '{
    "id": "test-001",
    "nombre": "Juan",
    "apellido": "Pérez",
    "email": "juan@example.com",
    "edad": 30,
    "ciudad": "Buenos Aires",
    "updatedAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'

# 2. Ver logs de ChangeFeedWorker (debe procesar el documento)
az containerapp logs show \
# 2. Ver logs de ChangeFeedWorker (esperar ~30 segundos)
export CHANGEFEED_WORKER_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.changeFeedWorkerAppName.value' -o tsv)

az containerapp logs show \
  --name $CHANGEFEED_WORKER_NAME \
  --resource-group $RG \
  --tail 50

# Buscar: "Processing 1 personas from Change Feed"
# Buscar: "Inserted new Persona test-001 to SQL"

# 3. Test backend endpoints (CON autenticación - usar browser o Postman con token)
# GET https://$BACKEND_URL/api/cosmos/personas
# GET https://$BACKEND_URL/api/sync/personas
# GET https://$BACKEND_URL/api/dashboard/changefeed
```

---

## ✅ Deployment E2E Completo

Si llegaste aquí, tenés deployed:
- ✅ Backend + Frontend + 3 Workers
- ✅ SQL Database con managed identity + migrations
- ✅ Cosmos DB con Change Feed POC
- ✅ Easy Auth con Entra ID
- ✅ Service Bus + Key Vault
- ✅ Telemetry con App Insights

**Próximos pasos:**
- Crear personas en Cosmos (frontend cuando esté listo)
- Ver sincronización automática a SQL
- Ver contadores en dashboard
- Testear DLQ manager
- Ver health endpoints

---

## Anexo A: Crear App Registrations desde cero (si no existen)
# 1. Frontend App Registration
#    - Name: "Weather App Frontend - Dev"
#    - Redirect URI: https://<frontend-fqdn>/.auth/login/aad/callback
#    - Implicit: ID tokens
#    - API permissions: User.Read
#    - Generate client secret → save as $FRONTEND_CLIENT_SECRET

# 2. Backend App Registration
#    - Name: "Weather App Backend - Dev"
#    - Expose an API: api://weather-backend-dev
#    - Scope: Weather.Read
#    - API permissions: add frontend app as authorized client
#    - App Roles: Admin, User
#    - Generate client secret → save as $BACKEND_CLIENT_SECRET
```

### 6.2 Guardar secrets en Key Vault

```bash
export FRONTEND_CLIENT_ID="<frontend-app-id>"
export FRONTEND_CLIENT_SECRET="<frontend-client-secret>"
export BACKEND_CLIENT_ID="<backend-app-id>"
export BACKEND_CLIENT_SECRET="<backend-client-secret>"

# Guardar en Key Vault
az keyvault secret set --vault-name $KV_NAME \
  --name auth-client-secret-frontend \
  --value "$FRONTEND_CLIENT_SECRET"

az keyvault secret set --vault-name $KV_NAME \
  --name auth-client-secret-backend \
  --value "$BACKEND_CLIENT_SECRET"
```

### 6.3 Deploy Easy Auth config

```bash
az deployment group create \
  --resource-group $RG \
  --template-file biceps/easyauth.bicep \
  --parameters \
    backendAppName="ca-${WORKLOAD}-be-${ENV}" \
    frontendAppName="ca-${WORKLOAD}-fe-${ENV}" \
    backendClientId=$BACKEND_CLIENT_ID \
    frontendClientId=$FRONTEND_CLIENT_ID \
    keyVaultName=$KV_NAME \
  --name "easyauth-$(date +%s)"
```

---

## Verificación end-to-end

### Backend Health

```bash
curl $BACKEND_URL/health
# Esperar: {"status":"healthy","timestamp":"..."}
```

### Service Bus

```bash
# Enviar mensaje de prueba (desde WSL)
cd src/tools/ServiceBusEnqueuer
dotnet run
```

### Dashboard

```bash
# Abrir en navegador (autenticarse con Entra ID)
open $FRONTEND_URL
```

### Cosmos DB

```bash
# Listar containers
az cosmosdb sql container list \
  --account-name $COSMOS_ACCOUNT \
  --database-name $COSMOS_DB \
  --resource-group $RG \
  --query "[].id"
```

---

## Troubleshooting

### Container App no arranca

```bash
# Ver logs en tiempo real
az containerapp logs show \
  --name ca-weather-be-dev \
  --resource-group $RG \
  --follow
```

### SQL connection failures

```bash
# Verificar que la managed identity tiene roles
az sql db show \
  --server <server-name> \
  --name dashboard-poc \
  --resource-group $RG

# Verificar firewall rules
az sql server firewall-rule list \
  --server <server-name> \
  --resource-group $RG
```

### Cosmos role assignment missing

```bash
# Re-deployar solo el módulo Cosmos con fix
az deployment group create \
  --resource-group $RG \
  --template-file biceps/modules/cosmos-db.bicep \
  --parameters \
    cosmosAccountName=$COSMOS_ACCOUNT \
    databaseName=$COSMOS_DB \
    dataContributorPrincipalId=$(az deployment group show -g $RG --name main \
      --query 'properties.outputs.workerIdentityPrincipalId.value' -o tsv)
```

---

### Backend o Workers fallan con "Login failed for user '<token-identified principal>'"

**Síntomas:**
- Backend logs muestran: `Microsoft.Data.SqlClient.SqlException: Login failed for user '<token-identified principal>'`
- Workers (DashboardWorker, WeatherWorker, ChangeFeedWorker) no pueden conectarse a SQL
- Error al llamar endpoints que usan SQL: `/api/dashboard/kpi`, `/api/sync/personas`

**Causa:** Falta el paso manual de crear usuarios SQL para las managed identities (backend y/o worker).

**Solución:**
Ejecutar **Paso 5.1** completo para crear usuarios SQL:
```bash
export RG="rg-far-container-app-easyauth"
export WORKER_IDENTITY_NAME=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.workerIdentityName.value' -o tsv)

export BACKEND_IDENTITY_NAME=$(az containerapp show -n ca-weather-be-dev -g $RG \
  --query 'identity.userAssignedIdentities' -o json | jq -r 'keys[0]' | xargs basename)

export SQL_SERVER=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.sqlServerFqdn.value' -o tsv | cut -d'.' -f1)

export SQL_DB=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.sqlDatabaseName.value' -o tsv)

echo "Worker identity: $WORKER_IDENTITY_NAME"
echo "Backend identity: $BACKEND_IDENTITY_NAME"
echo ""
echo "EJECUTAR EN AZURE PORTAL → SQL Database $SQL_DB → Query editor:"
echo ""
echo "-- Worker identity:"
echo "CREATE USER [$WORKER_IDENTITY_NAME] FROM EXTERNAL PROVIDER;"
echo "ALTER ROLE db_datareader ADD MEMBER [$WORKER_IDENTITY_NAME];"
echo "ALTER ROLE db_datawriter ADD MEMBER [$WORKER_IDENTITY_NAME];"
echo ""
echo "-- Backend identity:"
echo "CREATE USER [$BACKEND_IDENTITY_NAME] FROM EXTERNAL PROVIDER;"
echo "ALTER ROLE db_datareader ADD MEMBER [$BACKEND_IDENTITY_NAME];"
echo "ALTER ROLE db_datawriter ADD MEMBER [$BACKEND_IDENTITY_NAME];"
```

Después de ejecutar el T-SQL en el portal, el error desaparece inmediatamente (no requiere redeploy).

---

### Backend devuelve 401 aunque frontend muestre "Autenticado"

**Síntomas:**
- Frontend muestra "Estado de autenticación: Autenticado"
- DevTools → Network → Headers muestra `accessToken: ""`
- Backend devuelve **401 - No autenticado** en todos los endpoints

**Causa:** Falta el Paso 7 (Deploy Easy Auth) o se redeployaron los Container Apps después de configurar Easy Auth.

**Solución:**
1. Verificar que Easy Auth está configurado:
   ```bash
   az rest --method GET --url "/subscriptions/<sub-id>/resourceGroups/$RG/providers/Microsoft.App/containerApps/ca-weather-be-dev/authConfigs/current?api-version=2023-05-01" \
     --query '{enabled: properties.platform.enabled, clientId: properties.identityProviders.azureActiveDirectory.registration.clientId}'
   ```

2. Si `enabled: null`, ejecutar Paso 7 completo (Deploy Easy Auth)

3. **Cerrar sesión y volver a autenticarse** (el accessToken se genera en el login, no se puede renovar sin re-autenticar)

---

### Backend devuelve 500 en /api/cosmos/personas

**Síntomas:**
- Frontend muestra "Error al cargar datos"
- Backend logs muestran: `Unable to resolve service for type 'Microsoft.Azure.Cosmos.CosmosClient'`
- DevTools → Network muestra: `500 Internal Server Error`

**Causa posible #1:** Backend no tiene env var `Cosmos__Endpoint` (el CosmosClient solo se registra si ese env var existe)

**Solución:**
```bash
export RG="rg-far-container-app-easyauth"

# Verificar si tiene el env var
az containerapp show -n ca-weather-be-dev -g $RG \
  --query "properties.template.containers[0].env[?name=='Cosmos__Endpoint'].{name:name, value:value}" \
  -o table

# Si NO aparece o value está vacío, ejecutar sección "Ambiente actual con secrets obsoletos"
```

**Causa posible #2:** Backend identity no tiene rol "Cosmos DB Built-in Data Contributor"

**Solución:**
```bash
export COSMOS_ACCOUNT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosAccountName.value' -o tsv)
export BACKEND_IDENTITY_NAME=$(az containerapp show -n ca-weather-be-dev -g $RG \
  --query 'identity.userAssignedIdentities' -o json | jq -r 'keys[0]' | xargs basename)
export BACKEND_PRINCIPAL_ID=$(az identity show -n $BACKEND_IDENTITY_NAME -g $RG --query principalId -o tsv)

# Ver roles
az cosmosdb sql role assignment list \
  --account-name $COSMOS_ACCOUNT \
  --resource-group $RG \
  --query "[?principalId=='$BACKEND_PRINCIPAL_ID'].{RoleDefinitionId:roleDefinitionId}" \
  -o table

# Si NO tiene rol, asignar:
az cosmosdb sql role assignment create \
  --account-name $COSMOS_ACCOUNT \
  --resource-group $RG \
  --scope "/" \
  --principal-id $BACKEND_PRINCIPAL_ID \
  --role-definition-id "00000000-0000-0000-0000-000000000002"
```

---

### Ambiente actual con secrets obsoletos (cosmos-connection-string, sql-connection-string)

**Síntomas:**
- Backend tiene secrets `cosmos-connection-string` y/o `sql-connection-string` en Container App
- Backend tiene env vars `COSMOS_CONNECTION_STRING` y/o `SQL_CONNECTION_STRING` con `secretRef` (en lugar de `value`)
- Key Vault tiene secrets `cosmos-connection-string` y/o `sql-connection-string`
- Backend falla con `Unable to resolve service for type 'Microsoft.Azure.Cosmos.CosmosClient'`

**Causa:** El ambiente fue deployado ANTES de la refactorización a Managed Identity (commits `5497d24` y `3ac881d`). Los secrets obsoletos bloquean el registro de servicios.

**Solución:** Limpiar secrets obsoletos y redeploy con Managed Identity:

```bash
export RG="rg-far-container-app-easyauth"
export KV_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.keyVaultName.value' -o tsv)
export ACR_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.acrName.value' -o tsv)
export COSMOS_ACCOUNT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosAccountName.value' -o tsv)
export COSMOS_ENDPOINT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosEndpoint.value' -o tsv)
export SQL_SERVER=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlServerFqdn.value' -o tsv)
export SQL_DB=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlDatabaseName.value' -o tsv)
export BACKEND_IDENTITY_NAME=$(az containerapp show -n ca-weather-be-dev -g $RG \
  --query 'identity.userAssignedIdentities' -o json | jq -r 'keys[0]' | xargs basename)
export BACKEND_PRINCIPAL_ID=$(az identity show -n $BACKEND_IDENTITY_NAME -g $RG --query principalId -o tsv)

# 1. Eliminar secrets obsoletos de Key Vault
echo "Eliminando secrets obsoletos de Key Vault..."
az keyvault secret delete --vault-name $KV_NAME --name cosmos-connection-string 2>/dev/null || echo "cosmos-connection-string ya no existe (OK)"
az keyvault secret delete --vault-name $KV_NAME --name sql-connection-string 2>/dev/null || echo "sql-connection-string ya no existe (OK)"

# 2. Asignar rol Cosmos DB Data Contributor al backend identity (si no existe)
echo ""
echo "Asignando rol Cosmos DB Data Contributor..."
az cosmosdb sql role assignment create \
  --account-name $COSMOS_ACCOUNT \
  --resource-group $RG \
  --scope "/" \
  --principal-id $BACKEND_PRINCIPAL_ID \
  --role-definition-id "00000000-0000-0000-0000-000000000002" \
  2>/dev/null || echo "Rol ya existe (OK)"

# 3. Rebuild backend (código usa Managed Identity)
echo ""
echo "Rebuilding backend con Managed Identity..."
cd /mnt/c/repos/container-app-poc
az acr build \
  --registry $ACR_NAME \
  --image weather-api:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# 4. Generar connection string SQL con MI
export SQL_CONN_STR="Server=tcp:${SQL_SERVER},1433;Initial Catalog=${SQL_DB};Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"

# 5. Redeploy backend con env vars correctos (NO secrets)
echo ""
echo "Redeployando backend con Managed Identity env vars..."
az containerapp update \
  -n ca-weather-be-dev \
  -g $RG \
  --image ${ACR_NAME}.azurecr.io/weather-api:latest \
  --set-env-vars \
    "Cosmos__Endpoint=${COSMOS_ENDPOINT}" \
    "SQL_CONNECTION_STRING=${SQL_CONN_STR}" \
  --remove-env-vars COSMOS_CONNECTION_STRING \
  --revision-suffix "be-mi-full-$(date +%s)"

echo ""
echo "✅ Backend migrado a Managed Identity"
echo ""
echo "Verificación (esperar ~30s para que arranque):"
echo "  Backend secrets: az containerapp show -n ca-weather-be-dev -g $RG --query 'properties.configuration.secrets[].name' -o table"
echo "  Backend env vars: az containerapp show -n ca-weather-be-dev -g $RG --query \"properties.template.containers[0].env[?contains(name, 'Cosmos') || contains(name, 'SQL')].{name:name, value:value}\" -o table"
echo "  Key Vault secrets: az keyvault secret list --vault-name $KV_NAME --query '[].name' -o tsv"
echo ""
echo "Configuración esperada:"
echo "  - Backend secrets: 2 (appinsights-connection-string, microsoft-provider-authentication-secret)"
echo "  - Backend env vars: Cosmos__Endpoint (value), SQL_CONNECTION_STRING (value)"
echo "  - Key Vault secrets: 3 (appinsights-connection-string, auth-client-secret-backend, auth-client-secret-frontend)"
```

---
  --query 'identity.userAssignedIdentities' -o json | jq -r 'keys[0]' | xargs basename)

# Ver roles
az role assignment list \
  --assignee $(az identity show -n $BACKEND_IDENTITY_NAME -g $RG --query principalId -o tsv) \
  --scope $(az cosmosdb show -n $COSMOS_ACCOUNT -g $RG --query id -o tsv) \
  --query "[].{Role:roleDefinitionName}" -o table
```

Si NO tiene rol, redeploy la infraestructura con `deployCosmosDB=true` (el Bicep asigna el rol automáticamente).

---
   ```bash
   az rest --method GET --url "/subscriptions/<sub-id>/resourceGroups/$RG/providers/Microsoft.App/containerApps/ca-weather-be-dev/authConfigs/current?api-version=2023-05-01" \
     --query '{enabled: properties.platform.enabled, clientId: properties.identityProviders.azureActiveDirectory.registration.clientId}'
   ```

2. Si `enabled: null`, ejecutar Paso 7 completo (Deploy Easy Auth)

3. **Cerrar sesión y volver a autenticarse** (el accessToken se genera en el login, no se puede renovar sin re-autenticar)

---

## Cleanup (viernes al final del día)

```bash
# Borrar todo
az group delete --name $RG --yes --no-wait

# Verificar que se borró
az group show --name $RG
# Esperar: ResourceGroupNotFound
```

---

## Re-deploy completo (lunes)

```bash
# 1. Copiar este archivo completo
# 2. Ejecutar paso 1 → paso 7 en secuencia
# 3. Tiempo estimado: 20-30 minutos
# 4. Al final tendrás TODO deployado (base + workers + dashboard + Cosmos)
```

---

## Referencia rápida de comandos

```bash
# Variables críticas (guardar en ~/.bashrc o similar)
export RG="rg-far-container-app-easyauth"
export ACR_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.acrName.value' -o tsv)

# Re-build y re-deploy un worker (ejemplo: DashboardWorker)
az acr build --registry $ACR_NAME \
  --image dashboard-worker:latest \
  --file src/worker/DashboardWorker/Dockerfile \
  src/worker/DashboardWorker \
  --no-logs

az containerapp update \
  --name ca-weather-dash-worker-dev \
  --resource-group $RG \
  --image ${ACR_NAME}.azurecr.io/dashboard-worker:latest \
  --revision-suffix "dw-$(date +%s)"
```
