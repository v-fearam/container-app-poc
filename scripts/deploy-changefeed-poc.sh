#!/bin/bash

# ==============================================================================
# Deploy Script — Change Feed POC
# ==============================================================================
# Deploys Cosmos DB infrastructure for the Change Feed POC.
# Run this AFTER deploying the base infrastructure (ACR, App Insights, etc.)
#
# Prerequisites:
# - Base infrastructure deployed (az deployment group create with main.bicep)
# - Resource group exists
# - az cli authenticated
#
# Usage:
#   chmod +x scripts/deploy-changefeed-poc.sh
#   ./scripts/deploy-changefeed-poc.sh
# ==============================================================================

set -e  # Exit on error

# Configuration
RG="${RESOURCE_GROUP:-rg-far-container-app-easyauth}"
LOCATION="${LOCATION:-eastus2}"

echo "====================================================================="
echo "Change Feed POC — Deployment"
echo "====================================================================="
echo "Resource Group: $RG"
echo "Location: $LOCATION"
echo ""

# Check if resource group exists
if ! az group show --name $RG &>/dev/null; then
    echo "❌ Resource group $RG does not exist. Creating..."
    az group create --name $RG --location $LOCATION
    echo "✅ Resource group created"
fi

echo ""
echo "📦 Step 1: Deploy Cosmos DB infrastructure"
echo "---------------------------------------------------------------------"
echo "This will create:"
echo "  - Cosmos DB account (serverless)"
echo "  - Database: change-feed-poc"
echo "  - Containers: personas, changefeed-leases, changefeed-errors"
echo "  - Role assignment: Cosmos DB Data Contributor → worker identity"
echo ""

az deployment group create \
  --resource-group $RG \
  --template-file biceps/main.bicep \
  --parameters \
    deployCosmosDB=true \
    deployWorker=true \
    deployDashboard=true \
    deployContainerApps=false \
  --name "changefeed-cosmos-$(date +%s)"

echo ""
echo "✅ Cosmos DB deployed successfully"
echo ""

# Retrieve outputs
echo "📋 Retrieving deployment outputs..."
COSMOS_ENDPOINT=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.cosmosEndpoint.value' -o tsv)

COSMOS_ACCOUNT=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.cosmosAccountName.value' -o tsv)

COSMOS_DB=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.cosmosDatabaseName.value' -o tsv)

WORKER_IDENTITY_PRINCIPAL=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.workerIdentityPrincipalId.value' -o tsv)

WORKER_IDENTITY_NAME=$(az deployment group show -g $RG --name main \
  --query 'properties.outputs.workerIdentityName.value' -o tsv)

echo ""
echo "====================================================================="
echo "✅ Deployment Complete"
echo "====================================================================="
echo ""
echo "Cosmos DB Details:"
echo "  Endpoint:      $COSMOS_ENDPOINT"
echo "  Account Name:  $COSMOS_ACCOUNT"
echo "  Database:      $COSMOS_DB"
echo "  Containers:    personas, changefeed-leases, changefeed-errors"
echo ""
echo "Worker Identity:"
echo "  Name:          $WORKER_IDENTITY_NAME"
echo "  Principal ID:  $WORKER_IDENTITY_PRINCIPAL"
echo "  Roles:         Cosmos DB Data Contributor (read/write/change feed)"
echo ""
echo "====================================================================="
echo "Next Steps:"
echo "====================================================================="
echo "1. Verify role assignment:"
echo "   az cosmosdb sql role assignment list \\"
echo "     --account-name $COSMOS_ACCOUNT \\"
echo "     --resource-group $RG \\"
echo "     --query \"[?principalId=='$WORKER_IDENTITY_PRINCIPAL']\""
echo ""
echo "2. Follow implementation steps in docs/change-feed-poc.md §11"
echo "   - SQL migrations (PersonasSync + ChangeFeedCounters)"
echo "   - Backend CRUD endpoints"
echo "   - Change Feed Worker project"
echo "   - Frontend tabs"
echo ""
echo "3. Test end-to-end:"
echo "   - Insert Persona via UI → verify counter increments → check SQL table"
echo ""
echo "====================================================================="
