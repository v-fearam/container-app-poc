#!/bin/bash
set -e

cd /mnt/c/repos/container-app-poc

# Variables
export RG="rg-far-container-app-easyauth"

echo "🚀 Full deployment with Cosmos DB..."
echo ""

# ============================================================================
# STEP 1: Deploy Cosmos DB (if not exists)
# ============================================================================

echo "1️⃣  Checking Cosmos DB..."
COSMOS_EXISTS=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosEndpoint.value' -o tsv 2>/dev/null || echo "")

if [ -z "$COSMOS_EXISTS" ]; then
  echo "   📦 Cosmos DB not found. Deploying infrastructure..."
  
  az deployment group create \
    --resource-group $RG \
    --template-file biceps/main.bicep \
    --parameters \
      deployCosmosDB=true \
      deployContainerApps=false \
    --name "main"
  
  echo "   ✅ Cosmos DB deployed"
else
  echo "   ✅ Cosmos DB already exists: $COSMOS_EXISTS"
fi

echo ""

# Get info
export ACR_NAME=$(az deployment group show -g $RG --name main --query 'properties.outputs.acrName.value' -o tsv)
export COSMOS_ENDPOINT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosEndpoint.value' -o tsv)
export COSMOS_ACCOUNT=$(az deployment group show -g $RG --name main --query 'properties.outputs.cosmosAccountName.value' -o tsv)

echo "Resources:"
echo "  ACR: $ACR_NAME"
echo "  Cosmos: $COSMOS_ACCOUNT"
echo ""

# ============================================================================
# STEP 2: Build images
# ============================================================================

echo "2️⃣  Building Docker images..."

# Backend
echo "   Building Backend..."
az acr build --registry $ACR_NAME \
  --image weather-api:latest \
  --file src/backend/WeatherApi/Dockerfile \
  src/backend/WeatherApi

# Frontend
echo "   Building Frontend..."
az acr build --registry $ACR_NAME \
  --image weather-frontend:latest \
  --file src/frontend/Dockerfile \
  src/frontend

# DashboardWorker
echo "   Building DashboardWorker..."
az acr build --registry $ACR_NAME \
  --image dashboard-worker:latest \
  --file src/worker/DashboardWorker/Dockerfile \
  src/worker/DashboardWorker

# ChangeFeedWorker
echo "   Building ChangeFeedWorker..."
az acr build --registry $ACR_NAME \
  --image changefeed-worker:latest \
  --file src/worker/ChangeFeedWorker/Dockerfile \
  src/worker/ChangeFeedWorker

echo "   ✅ All images built"
echo ""

# ============================================================================
# STEP 3: Deploy Container Apps
# ============================================================================

echo "3️⃣  Deploying Container Apps..."

az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters \
    deployContainerApps=true \
    deployWorkerApp=true \
    deployDashboardWorkerApp=true \
    deployChangeFeedWorker=true \
  --name "apps-$(date +%s)"

echo "   ✅ Container Apps deployed"
echo ""

# ============================================================================
# DONE
# ============================================================================

export FRONTEND_URL=$(az deployment group show -g $RG --name main --query 'properties.outputs.frontendAppUrl.value' -o tsv)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEPLOYMENT COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Change Feed POC:"
echo "   https://$FRONTEND_URL/changefeed"
echo ""
echo "📊 Cosmos DB Containers:"
echo "   • personas (monitored collection)"
echo "   • changefeed-leases (change feed processor)"
echo "   • changefeed-errors (dead-letter queue)"
echo ""
echo "🧪 Test workflow:"
echo "   1. Open URL above and login"
echo "   2. Create a persona in 'Cosmos Editor' tab"
echo "   3. Wait 30 seconds"
echo "   4. Check 'SQL Sync' tab → should show synced data"
echo "   5. Check 'Dashboard' tab → SuccessCount should be > 0"
echo ""
