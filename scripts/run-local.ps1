# Build and Run Locally with Docker Compose

Write-Host "🐳 Starting Camuzzi Weather App with Docker Compose..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Build and start containers
Write-Host "🏗️  Building and starting containers..." -ForegroundColor Yellow
docker-compose up --build -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start containers" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Containers started successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Service URLs:" -ForegroundColor Cyan
Write-Host "  • Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  • Backend:  http://localhost:5000" -ForegroundColor White
Write-Host ""
Write-Host "📊 View logs:" -ForegroundColor Cyan
Write-Host "  docker-compose logs -f" -ForegroundColor White
Write-Host ""
Write-Host "🛑 Stop containers:" -ForegroundColor Cyan
Write-Host "  docker-compose down" -ForegroundColor White
