# Deploy Complete Infrastructure and Apps to Azure

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup,
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "eastus2",
    
    [Parameter(Mandatory=$false)]
    [string]$AcrName,
    
    [Parameter(Mandatory=$false)]
    [string]$AppInsightsConnectionString
)

Write-Host "🚀 Deploying Camuzzi Weather App to Azure Container Apps" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create Resource Group
Write-Host "📦 Step 1: Creating Resource Group..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Resource Group creation failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Resource Group created" -ForegroundColor Green
Write-Host ""

# Step 2: Deploy Infrastructure (ACR, Log Analytics, App Insights, Container App Environment)
Write-Host "🏗️  Step 2: Deploying Infrastructure..." -ForegroundColor Yellow
az deployment group create `
    --resource-group $ResourceGroup `
    --template-file biceps/main.bicep `
    --parameters location=$Location deployContainerApp=false
    
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Infrastructure deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Infrastructure deployed" -ForegroundColor Green
Write-Host ""

# Get ACR name from deployment
if (-not $AcrName) {
    Write-Host "🔍 Getting ACR name from deployment..." -ForegroundColor Yellow
    $AcrName = az deployment group show `
        --resource-group $ResourceGroup `
        --name main `
        --query 'properties.outputs.acrName.value' `
        --output tsv
    Write-Host "ACR Name: $AcrName" -ForegroundColor Cyan
}

# Get App Insights connection string if not provided
if (-not $AppInsightsConnectionString) {
    Write-Host "🔍 Getting App Insights connection string..." -ForegroundColor Yellow
    $AppInsightsConnectionString = az deployment group show `
        --resource-group $ResourceGroup `
        --name main `
        --query 'properties.outputs.appInsightsConnectionString.value' `
        --output tsv
}

Write-Host ""

# Step 3: Build Docker Images
Write-Host "🐳 Step 3: Building Docker Images..." -ForegroundColor Yellow
.\scripts\build-images.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker build failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 4: Push Images to ACR
Write-Host "📤 Step 4: Pushing Images to ACR..." -ForegroundColor Yellow
.\scripts\push-to-acr.ps1 -AcrName $AcrName
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ACR push failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 5: Deploy Container Apps
Write-Host "🚢 Step 5: Deploying Container Apps..." -ForegroundColor Yellow

$acrLoginServer = "$AcrName.azurecr.io"
$backendImage = "$acrLoginServer/camuzzi-weather-backend:latest"
$frontendImage = "$acrLoginServer/camuzzi-weather-frontend:latest"

# Get Container App Environment name
$containerAppEnvName = az deployment group show `
    --resource-group $ResourceGroup `
    --name main `
    --query 'properties.outputs.containerAppEnvironmentName.value' `
    --output tsv

# Deploy Backend Container App
Write-Host "  • Deploying Backend API..." -ForegroundColor Cyan
az containerapp create `
    --name camuzzi-backend `
    --resource-group $ResourceGroup `
    --environment $containerAppEnvName `
    --image $backendImage `
    --target-port 8080 `
    --ingress external `
    --registry-server $acrLoginServer `
    --registry-identity system `
    --cpu 0.5 `
    --memory 1.0Gi `
    --min-replicas 1 `
    --max-replicas 3 `
    --secrets appinsights-connection-string="$AppInsightsConnectionString" `
    --env-vars APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:appinsights-connection-string

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend deployment failed" -ForegroundColor Red
    exit 1
}

# Get Backend URL
$backendUrl = az containerapp show `
    --name camuzzi-backend `
    --resource-group $ResourceGroup `
    --query 'properties.configuration.ingress.fqdn' `
    --output tsv
$backendUrl = "https://$backendUrl"

Write-Host "  ✅ Backend deployed: $backendUrl" -ForegroundColor Green

# Deploy Frontend Container App
Write-Host "  • Deploying Frontend..." -ForegroundColor Cyan
az containerapp create `
    --name camuzzi-frontend `
    --resource-group $ResourceGroup `
    --environment $containerAppEnvName `
    --image $frontendImage `
    --target-port 80 `
    --ingress external `
    --registry-server $acrLoginServer `
    --registry-identity system `
    --cpu 0.25 `
    --memory 0.5Gi `
    --min-replicas 1 `
    --max-replicas 5 `
    --secrets appinsights-connection-string="$AppInsightsConnectionString" `
    --env-vars `
        VITE_API_URL="$backendUrl" `
        VITE_APPINSIGHTS_CONNECTION_STRING=secretref:appinsights-connection-string

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend deployment failed" -ForegroundColor Red
    exit 1
}

# Get Frontend URL
$frontendUrl = az containerapp show `
    --name camuzzi-frontend `
    --resource-group $ResourceGroup `
    --query 'properties.configuration.ingress.fqdn' `
    --output tsv
$frontendUrl = "https://$frontendUrl"

Write-Host "  ✅ Frontend deployed: $frontendUrl" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "  • Resource Group: $ResourceGroup" -ForegroundColor White
Write-Host "  • Location: $Location" -ForegroundColor White
Write-Host "  • ACR: $acrLoginServer" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Application URLs:" -ForegroundColor Cyan
Write-Host "  • Frontend: $frontendUrl" -ForegroundColor White
Write-Host "  • Backend:  $backendUrl" -ForegroundColor White
Write-Host ""
Write-Host "📊 Monitor in Application Insights:" -ForegroundColor Cyan
Write-Host "  az portal show --resource-group $ResourceGroup" -ForegroundColor White
