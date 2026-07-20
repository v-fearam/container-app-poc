# syntax=docker/dockerfile:1
# Multi-stage build for WeatherEnqueuer Console App

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY WeatherEnqueuer.csproj ./
RUN dotnet restore

# Copy source code and build
COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

# Runtime image - USE DEBIAN (default) INSTEAD OF ALPINE (Alpine causes SIGSEGV with .NET 10)
FROM mcr.microsoft.com/dotnet/runtime:10.0
WORKDIR /app

# Create non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
USER appuser

# Copy published app from build stage
COPY --from=build /app/publish .

# Console app runs to completion then exits
ENTRYPOINT ["dotnet", "WeatherEnqueuer.dll"]
