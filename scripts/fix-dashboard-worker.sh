#!/bin/bash
set -e

cd /mnt/c/repos/container-app-poc

RG='rg-far-container-app-easyauth'
ACR_NAME='acrweatheru6qlzsmy'

echo "=== Building and Deploying Fixed DashboardWorker ==="

echo "📦 Building DashboardWorker image with Azure SQL Auth package..."
docker build -t ${ACR_NAME}.azurecr.io/dashboard-worker:latest -f src/worker/Dockerfile src/worker

echo "⬆️  Pushing to ACR..."
docker push ${ACR_NAME}.azurecr.io/dashboard-worker:latest

echo "🚀 Deploying DashboardWorker..."
TIMESTAMP=$(date +%Y%m%d%H%M%S)

az deployment group create \
  --resource-group $RG \
  --template-file biceps/modules/dashboard-worker-container-app.bicep \
  --parameters \
    containerAppName='ca-dashboard-worker-dev' \
    environmentId="$(az deployment group show -g $RG --name main --query 'properties.outputs.containerAppEnvironmentId.value' -o tsv)" \
    containerImage="${ACR_NAME}.azurecr.io/dashboard-worker:latest" \
    acrName="$ACR_NAME" \
    managedIdentityId="$(az deployment group show -g $RG --name main --query 'properties.outputs.managedIdentityId.value' -o tsv)" \
    managedIdentityClientId="$(az deployment group show -g $RG --name main --query 'properties.outputs.managedIdentityClientId.value' -o tsv)" \
    serviceBusNamespaceFqdn="$(az deployment group show -g $RG --name main --query 'properties.outputs.serviceBusNamespaceFqdn.value' -o tsv)" \
    sqlConnectionString="Server=tcp:sql-weather-dash-7515.database.windows.net,1433;Database=dashboard-poc;Authentication=Active Directory Default;" \
    appInsightsConnectionString="$(az monitor app-insights component show -g $RG --query '[0].connectionString' -o tsv)" \
    timestamp="$TIMESTAMP"

echo "✅ DashboardWorker deployed with SQL auth fix!"
echo ""
echo "Monitor logs with:"
echo "az containerapp logs show -n ca-dashboard-worker-dev -g $RG --follow"
