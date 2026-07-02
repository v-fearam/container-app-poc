# Push Images to Azure Container Registry

param(
    [Parameter(Mandatory=$true)]
    [string]$AcrName,
    
    [Parameter(Mandatory=$false)]
    [string]$Tag = "latest"
)

Write-Host "🚀 Pushing images to Azure Container Registry: $AcrName" -ForegroundColor Cyan
Write-Host ""

# Login to ACR
Write-Host "🔑 Logging in to ACR..." -ForegroundColor Yellow
az acr login --name $AcrName
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ACR login failed" -ForegroundColor Red
    exit 1
}

$acrLoginServer = "$AcrName.azurecr.io"

# Tag and push backend
Write-Host "📦 Tagging and pushing backend..." -ForegroundColor Yellow
docker tag camuzzi-weather-backend:latest "$acrLoginServer/camuzzi-weather-backend:$Tag"
docker push "$acrLoginServer/camuzzi-weather-backend:$Tag"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend push failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Backend pushed successfully" -ForegroundColor Green
Write-Host ""

# Tag and push frontend
Write-Host "🎨 Tagging and pushing frontend..." -ForegroundColor Yellow
docker tag camuzzi-weather-frontend:latest "$acrLoginServer/camuzzi-weather-frontend:$Tag"
docker push "$acrLoginServer/camuzzi-weather-frontend:$Tag"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend push failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Frontend pushed successfully" -ForegroundColor Green
Write-Host ""

Write-Host "🎉 All images pushed to $acrLoginServer!" -ForegroundColor Green
Write-Host ""
Write-Host "Images:" -ForegroundColor Cyan
Write-Host "  • $acrLoginServer/camuzzi-weather-backend:$Tag" -ForegroundColor White
Write-Host "  • $acrLoginServer/camuzzi-weather-frontend:$Tag" -ForegroundColor White
