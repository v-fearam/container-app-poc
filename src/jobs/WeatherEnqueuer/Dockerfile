# syntax=docker/dockerfile:1
# Multi-stage build for WeatherEnqueuer Console App

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY WeatherEnqueuer.csproj ./
RUN dotnet restore

# Copy source code and build
COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

# Runtime image
FROM mcr.microsoft.com/dotnet/runtime:10.0-alpine
WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy published app from build stage
COPY --from=build /app/publish .

# Console app runs to completion then exits
ENTRYPOINT ["dotnet", "WeatherEnqueuer.dll"]
