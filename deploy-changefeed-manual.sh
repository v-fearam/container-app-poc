#!/bin/bash
set -e

# Variables
RG="rg-far-container-app-easyauth"
APP_NAME="ca-changefeed-worker-dev"
ENV_NAME="cae-weather-dev-u6qlzs"
ACR_NAME="acrweatheru6qlzsmy"
IMAGE=".azurecr.io/changefeed-worker:latest"

# Get existing resources
COSMOS_ENDPOINT=
SB_NAMESPACE=
SQL_CONN=
APPINSIGHTS_CONN=
WORKER_IDENTITY=
WORKER_CLIENT_ID=

echo "Creating ChangeFeedWorker Container App..."
echo "  Cosmos: "
echo "  Service Bus: "
echo "  Identity: id-weather-worker-dev"

az containerapp create   --name    --resource-group    --environment    --image    --registry-server .azurecr.io   --registry-identity    --user-assigned    --cpu 0.5   --memory 1.0Gi   --min-replicas 1   --max-replicas 1   --ingress external   --target-port 8080   --env-vars     "COSMOS_ENDPOINT="     "COSMOS_DATABASE=change-feed-poc"     "COSMOS_COLLECTION=personas"     "PROCESSOR_NAME=cfp-personas"     "VERTICAL_NAME=personas"     "SERVICE_BUS_NAMESPACE="     "DASHBOARD_TOPIC=nd-dashboard-events"     "Sql__ConnectionString=secretref:sql-connection-string"     "APPLICATIONINSIGHTS_CONNECTION_STRING="     "AZURE_CLIENT_ID="

echo ""
echo "✅ ChangeFeedWorker deployed!"
echo ""
