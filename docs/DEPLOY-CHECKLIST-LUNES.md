# 📋 CHECKLIST DEPLOY LUNES — Change Feed POC E2E

**Fecha:** 2026-07-16  
**Tiempo estimado:** 45-60 minutos  
**Prerequisito crítico:** Leer `docs/DEPLOYMENT-CHANGE-FEED-POC.md` completo

---

## ✅ Pre-flight Check (5 min)

```bash
# 1. Verificar tools
az --version          # >= 2.50
dotnet --version      # >= 10.0
docker --version      # Desktop corriendo

# 2. Login Azure
az login
az account show

# 3. Exportar variables (⚠️ COPIAR EXACTAS)
export RG="rg-far-container-app-easyauth"
export LOCATION="eastus2"
export SQL_LOCATION="centralus"  # ⚠️ SQL Server YA EXISTE en centralus
export SQL_SERVER_NAME="sql-weather-dash-7446"
export SQL_ADMIN_LOGIN="<tu-email>@<tenant>.onmicrosoft.com"
export SQL_ADMIN_OBJECT_ID="<tu-object-id>"
export FRONTEND_CLIENT_ID="<frontend-app-id>"
export FRONTEND_CLIENT_SECRET="<regenerar>"
export BACKEND_CLIENT_ID="<backend-app-id>"
export BACKEND_CLIENT_SECRET="<regenerar>"
export TENANT_ID="<tu-tenant-id>"
```

---

## 🚀 Deploy Flow

### 1️⃣ Infra Base (5-7 min)
```bash
cd /mnt/c/repos/container-app-poc
az deployment group create -g $RG -f biceps/main.bicep \
  --parameters location=$LOCATION deployContainerApps=false \
    deployWorker=false deployDashboard=false deployCosmosDB=false \
  --name "base-$(date +%s)"

export ACR_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.acrName.value' -o tsv)
export KV_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.keyVaultName.value' -o tsv)
```

### 2️⃣ Secrets en KV (2 min)
```bash
az keyvault secret set --vault-name $KV_NAME --name auth-client-secret-frontend --value "$FRONTEND_CLIENT_SECRET"
az keyvault secret set --vault-name $KV_NAME --name auth-client-secret-backend --value "$BACKEND_CLIENT_SECRET"
```

### 3️⃣ SQL + Service Bus + Cosmos (7-10 min)
```bash
# ⚠️ CRÍTICO: sqlLocation=centralus (NO location)
az deployment group create -g $RG -f biceps/main.bicep \
  --parameters location=$LOCATION sqlLocation=$SQL_LOCATION \
    workloadName=weather environmentShortName=dev \
    deployContainerApps=false deployKeyVault=true \
    deployWorker=true deployDashboard=true deployCosmosDB=true \
    deployChangeFeedWorker=false \
    sqlServerName=$SQL_SERVER_NAME \
    sqlAdminObjectId=$SQL_ADMIN_OBJECT_ID \
    sqlAdminLogin=$SQL_ADMIN_LOGIN \
  --name "infra-$(date +%s)"

# Capturar outputs
export SQL_SERVER=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlServerFqdn.value' -o tsv)
export SQL_DB=$(az deployment group show -g $RG --name main --query 'properties.outputs.sqlDatabaseName.value' -o tsv)
export COSMOS_ACCOUNT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosAccountName.value' -o tsv)
```

⚠️ **Warnings esperados:** `"RoleAssignmentExists"` → NORMAL, continuar.

### 4️⃣ SQL Users (5 min — MANUAL)
```sql
-- Azure Portal → SQL Database → Query editor
CREATE USER [id-weather-worker-dev] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [id-weather-worker-dev];
ALTER ROLE db_datawriter ADD MEMBER [id-weather-worker-dev];

CREATE USER [uami-ca-weather-be-dev] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [uami-ca-weather-be-dev];
ALTER ROLE db_datawriter ADD MEMBER [uami-ca-weather-be-dev];
```

### 5️⃣ Migrations (3 min)
```bash
MY_IP=$(curl -s ifconfig.me)
az sql server firewall-rule create -g $RG --server $(echo $SQL_SERVER | cut -d'.' -f1) \
  --name AllowMyIP --start-ip-address $MY_IP --end-ip-address $MY_IP

export ConnectionStrings__DefaultConnection="Server=$SQL_SERVER;Database=$SQL_DB;Authentication=Active Directory Default;TrustServerCertificate=True"
cd /mnt/c/repos/container-app-poc/src/worker/DashboardWorker
dotnet ef database update --context DashboardDbContext

az sql server firewall-rule delete -g $RG --server $(echo $SQL_SERVER | cut -d'.' -f1) --name AllowMyIP
```

### 6️⃣ Build Images (10-15 min — PowerShell)
```powershell
cd C:\repos\container-app-poc
az acr build --registry $ACR_NAME --image weather-api:latest --file src\backend\WeatherApi\Dockerfile src\backend\WeatherApi
az acr build --registry $ACR_NAME --image weather-frontend:latest --file src\frontend\Dockerfile src\frontend
az acr build --registry $ACR_NAME --image weather-worker:latest --file src\worker\WeatherWorker\Dockerfile src\worker\WeatherWorker
az acr build --registry $ACR_NAME --image dashboard-worker:latest --file src\worker\DashboardWorker\Dockerfile src\worker\DashboardWorker
az acr build --registry $ACR_NAME --image changefeed-worker:latest --file src\worker\ChangeFeedWorker\Dockerfile src\worker\ChangeFeedWorker
```

### 7️⃣ Deploy Container Apps (5-7 min — WSL)
```bash
cd /mnt/c/repos/container-app-poc
az deployment group create -g $RG -f biceps/main.bicep \
  --parameters location=$LOCATION sqlLocation=$SQL_LOCATION \
    workloadName=weather environmentShortName=dev \
    containerRegistryName=$ACR_NAME cosmosAccountName=$COSMOS_ACCOUNT \
    sqlServerName=$SQL_SERVER_NAME sqlAdminObjectId=$SQL_ADMIN_OBJECT_ID \
    sqlAdminLogin=$SQL_ADMIN_LOGIN \
    deployContainerApps=true deployKeyVault=true \
    deployWorker=true deployWorkerApp=true \
    deployDashboard=true deployDashboardWorkerApp=true \
    deployCosmosDB=true deployChangeFeedWorker=true \
  --name "apps-$(date +%s)"

export BACKEND_FQDN=$(az containerapp show -n ca-weather-be-dev -g $RG --query 'properties.configuration.ingress.fqdn' -o tsv)
export FRONTEND_FQDN=$(az containerapp show -n ca-weather-fe-dev -g $RG --query 'properties.configuration.ingress.fqdn' -o tsv)
```

### 8️⃣ Easy Auth (5 min)
```bash
# 1. Actualizar redirect URIs en Entra ID (si FQDNs cambiaron)
#    → Portal → App registrations → Frontend → Authentication
#    → Add: https://$FRONTEND_FQDN/.auth/login/aad/callback

# 2. Deploy Easy Auth
az deployment group create -g $RG -f biceps/easyauth.bicep \
  --parameters backendAppName=ca-weather-be-dev frontendAppName=ca-weather-fe-dev \
    frontendClientId=$FRONTEND_CLIENT_ID backendClientId=$BACKEND_CLIENT_ID \
    tenantId=$TENANT_ID keyVaultName=$KV_NAME \
  --name "easyauth-$(date +%s)"
```

---

## ✅ Validación E2E (5 min)

```bash
# 1. Health check
curl https://$BACKEND_FQDN/api/health | jq .
# Esperar: { "status": "Healthy", "results": { "self": {...}, "sql": {...} } }

# 2. Crear persona en Cosmos
curl -X POST https://$BACKEND_FQDN/api/cosmos/personas \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test","apellido":"User","edad":25,"activo":true}' | jq .

# 3. Verificar en Cosmos
curl https://$BACKEND_FQDN/api/cosmos/personas | jq .

# 4. Esperar sync (15-20s)
sleep 20

# 5. Verificar en SQL
curl https://$BACKEND_FQDN/api/sync/personas | jq .
# ✅ Si ves el documento aquí → E2E funciona

# 6. Frontend + Auth
echo "Abrir: https://$FRONTEND_FQDN"
# → Login Microsoft → Dashboard con métricas
```

---

## 🚨 Red Flags (detener si ves estos errores)

| Error | Causa | Solución |
|-------|-------|----------|
| `"resource already exists in location centralus..."` | Usaste `location` en vez de `sqlLocation` | Verificar parámetro `sqlLocation=centralus` |
| `"Unable to resolve service for type 'DashboardDbContext'"` | Backend sin SQL config | Asegurar `deployDashboard=true` |
| `"required properties 'id;' are missing"` | Cosmos JSON serialization | Código ya tiene fix — verificar imagen |
| `"CREATE USER failed"` en SQL | No eres admin del SQL Server | Verificar que tu Entra ID está como admin |
| Frontend 404 en todas las rutas | nginx config malo | Verificar imagen tiene `try_files` |

---

## 🎯 Success Criteria

- [x] `curl /api/health` → `"Healthy"`
- [x] `curl /api/cosmos/personas` → lista documentos
- [x] `curl /api/sync/personas` → lista documentos sincronizados (después de ~20s)
- [x] Frontend redirige a Microsoft login
- [x] Después de login → Dashboard carga
- [x] Health page muestra todos los servicios como "Healthy"
- [x] DLQ Manager page carga métricas

**Si todos ✅ → ¡Deploy exitoso!**

---

## 📚 Docs de referencia rápida

| Documento | Cuándo leer |
|-----------|-------------|
| **`docs/DEPLOYMENT-CHANGE-FEED-POC.md`** | ⭐ **ANTES de empezar** — tiene todos los detalles |
| `AGENTS.md` | Para convenciones, gotchas, comandos comunes |
| `README.md` | Para arquitectura general |
| `docs/change-feed-poc.md` | Para diseño técnico del Change Feed |
| Session checkpoint 027 | Para historia de esta implementación |

---

**Última actualización:** 2026-07-16  
**Tiempo total real (validado):** 45-60 min (sin contar Docker builds)
