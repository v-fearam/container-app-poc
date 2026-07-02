# Build Docker Images Script

Write-Host "🐳 Building Camuzzi Weather App Docker Images..." -ForegroundColor Cyan
Write-Host ""

# Backend
Write-Host "📦 Building Backend (.NET 10)..." -ForegroundColor Yellow
docker build -t camuzzi-weather-backend:latest ./src/backend/WeatherApi
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Backend image built successfully" -ForegroundColor Green
Write-Host ""

# Frontend
Write-Host "🎨 Building Frontend (React + Vite)..." -ForegroundColor Yellow
docker build -t camuzzi-weather-frontend:latest ./src/frontend
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Frontend image built successfully" -ForegroundColor Green
Write-Host ""

# List images
Write-Host "📋 Docker Images:" -ForegroundColor Cyan
docker images | Select-String "camuzzi-weather"
Write-Host ""

Write-Host "🎉 All images built successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  • Test locally: docker-compose up" -ForegroundColor White
Write-Host "  • Push to ACR: .\scripts\push-to-acr.ps1 -AcrName <your-acr-name>" -ForegroundColor White
