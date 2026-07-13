#!/bin/bash
set -e

# Dashboard POC Deployment Script
# Automates: Build images → Deploy infrastructure → Configure SQL

echo "=== Dashboard POC Deployment Script ==="
echo ""

# Variables
RG="${RG:-rg-far-container-app-easyauth}"
LOCATION="${LOCATION:-eastus2}"
SQL_LOCATION="${SQL_LOCATION:-centralus}"

# Check if resource group exists
if ! az group show --name "$RG" &>/dev/null; then
    echo "❌ Resource group $RG does not exist. Creating..."
    az group create --name "$RG" --location "$LOCATION"
fi

# Get user info
USER_OID=$(az ad signed-in-user show --query id -o tsv)
USER_UPN=$(az ad signed-in-user show --query userPrincipalName -o tsv)

echo "✅ User: $USER_UPN"
echo "✅ Resource Group: $RG"
echo ""

# Step 1: Deploy base infrastructure (ACR, App Insights, Container Apps Environment)
echo "=== Step 1: Deploying base infrastructure ===" 
az deployment group create \
  --resource-group "$RG" \
  --template-file biceps/main.bicep \
  --parameters deployContainerApps=false deployDashboard=false \
  --output none

echo "✅ Base infrastructure deployed"
echo ""

# Get outputs
ACR_NAME=$(az deployment group show -g "$RG" --name main \
  --query 'properties.outputs.acrName.value' -o tsv)

echo "✅ ACR: $ACR_NAME"
echo ""

# Step 2: Build all images
echo "=== Step 2: Building container images ===" 

echo "Building backend..."
az acr build \
  --registry "$ACR_NAME" \
  --image weather-api:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi \
  --no-logs

echo "Building frontend..."
az acr build \
  --registry "$ACR_NAME" \
  --image weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend \
  --no-logs

echo "Building worker..."
az acr build \
  --registry "$ACR_NAME" \
  --image weather-worker:latest \
  --file src/worker/WeatherWorker/Dockerfile \
  src/worker/WeatherWorker \
  --no-logs

echo "Building dashboard worker..."
az acr build \
  --registry "$ACR_NAME" \
  --image dashboard-worker:latest \
  --file src/worker/DashboardWorker/Dockerfile \
  src/worker/DashboardWorker \
  --no-logs

echo "✅ All images built"
echo ""

# Step 3: Deploy SQL Database (if not exists, reuse existing server)
echo "=== Step 3: Deploying SQL Database + Service Bus ===" 

# Check if SQL server exists
SQL_SERVER_NAME=$(az sql server list -g "$RG" --query "[0].name" -o tsv 2>/dev/null || echo "")

if [ -z "$SQL_SERVER_NAME" ]; then
    echo "Creating new SQL Server..."
    SQL_SERVER_NAME="sql-weather-dash-$RANDOM"
else
    echo "Using existing SQL Server: $SQL_SERVER_NAME"
fi

az deployment group create \
  --resource-group "$RG" \
  --template-file biceps/main.bicep \
  --parameters deployDashboard=true \
    sqlServerName="$SQL_SERVER_NAME" \
    sqlAdminObjectId="$USER_OID" \
    sqlAdminLogin="$USER_UPN" \
    sqlLocation="$SQL_LOCATION" \
  --output none

echo "✅ SQL Database + Service Bus deployed"
echo ""

# Get SQL outputs
SQL_SERVER_FQDN=$(az deployment group show -g "$RG" --name main \
  --query 'properties.outputs.sqlServerFqdn.value' -o tsv)
SQL_DB=$(az deployment group show -g "$RG" --name main \
  --query 'properties.outputs.sqlDatabaseName.value' -o tsv)

echo "✅ SQL Server: $SQL_SERVER_FQDN"
echo "✅ SQL Database: $SQL_DB"
echo ""

# Step 4: Create SQL schema (if not exists)
echo "=== Step 4: Creating SQL Schema ===" 
echo "⚠️  MANUAL STEP REQUIRED:"
echo ""
echo "1. Open: https://portal.azure.com"
echo "2. Go to: SQL databases → $SQL_DB → Query editor (preview)"
echo "3. Login with: Active Directory authentication"
echo "4. Copy and paste the content of: sql/001-dashboard-schema.sql"
echo "5. Click 'Run'"
echo ""
read -p "Press ENTER when schema creation is complete..."
echo ""

# Step 5: Grant SQL permissions to Managed Identities
echo "=== Step 5: Granting SQL Permissions ===" 

WORKER_IDENTITY=$(az identity list -g "$RG" \
  --query "[?contains(name, 'worker')].name" -o tsv)

BACKEND_IDENTITY=$(az identity list -g "$RG" \
  --query "[?contains(name, 'uami-ca-weather-be-dev')].name" -o tsv)

echo "Worker Identity: $WORKER_IDENTITY"
echo "Backend Identity: $BACKEND_IDENTITY"
echo ""
echo "⚠️  MANUAL STEP REQUIRED:"
echo ""
echo "1. Still in Query editor for database: $SQL_DB"
echo "2. Copy and paste this SQL:"
echo ""
echo "-- Grant permissions to DashboardWorker"
echo "CREATE USER [$WORKER_IDENTITY] FROM EXTERNAL PROVIDER;"
echo "ALTER ROLE db_datareader ADD MEMBER [$WORKER_IDENTITY];"
echo "ALTER ROLE db_datawriter ADD MEMBER [$WORKER_IDENTITY];"
echo ""
echo "-- Grant permissions to Backend API"
echo "CREATE USER [$BACKEND_IDENTITY] FROM EXTERNAL PROVIDER;"
echo "ALTER ROLE db_datareader ADD MEMBER [$BACKEND_IDENTITY];"
echo "ALTER ROLE db_datawriter ADD MEMBER [$BACKEND_IDENTITY];"
echo "GO"
echo ""
read -p "Press ENTER when SQL permissions are granted..."
echo ""

# Step 6: Deploy all Container Apps
echo "=== Step 6: Deploying all Container Apps ===" 

az deployment group create \
  --resource-group "$RG" \
  --template-file biceps/main.bicep \
  --parameters deployDashboard=true deployContainerApps=true \
    sqlServerName="$SQL_SERVER_NAME" \
    sqlAdminObjectId="$USER_OID" \
    sqlAdminLogin="$USER_UPN" \
    sqlLocation="$SQL_LOCATION" \
  --output none

echo "✅ All Container Apps deployed"
echo ""

# Step 7: Deploy DashboardWorker
echo "=== Step 7: Deploying DashboardWorker ===" 

SQL_CONN="Server=${SQL_SERVER_FQDN};Database=${SQL_DB};Authentication=Active Directory Default"

az deployment group create \
  --resource-group "$RG" \
  --template-file biceps/modules/dashboard-worker-container-app.bicep \
  --parameters \
    containerAppName="ca-dashboard-worker-dev" \
    environmentId="$(az deployment group show -g "$RG" --name main --query 'properties.outputs.containerAppEnvironmentId.value' -o tsv)" \
    containerImage="${ACR_NAME}.azurecr.io/dashboard-worker:latest" \
    acrName="$ACR_NAME" \
    managedIdentityId="$(az deployment group show -g "$RG" --name main --query 'properties.outputs.workerIdentityId.value' -o tsv)" \
    managedIdentityClientId="$(az deployment group show -g "$RG" --name main --query 'properties.outputs.workerIdentityClientId.value' -o tsv)" \
    serviceBusNamespaceFqdn="$(az deployment group show -g "$RG" --name main --query 'properties.outputs.serviceBusNamespaceFqdn.value' -o tsv)" \
    sqlConnectionString="$SQL_CONN" \
    appInsightsConnectionString="$(az deployment group show -g "$RG" --name main --query 'properties.outputs.appInsightsConnectionString.value' -o tsv)" \
  --output none

echo "✅ DashboardWorker deployed"
echo ""

# Get URLs
BACKEND_URL=$(az containerapp show --name ca-weather-be-dev --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

FRONTEND_URL=$(az containerapp show --name ca-weather-fe-dev --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo "=== ✅ Deployment Complete! ==="
echo ""
echo "Backend API:  https://$BACKEND_URL"
echo "Frontend UI:  https://$FRONTEND_URL"
echo "Dashboard:    https://$FRONTEND_URL/dashboard"
echo ""
echo "Test Dashboard API:"
echo "curl https://$BACKEND_URL/api/dashboard/kpi"
echo ""
