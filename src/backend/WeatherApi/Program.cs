using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Azure;
using WeatherApi.Data;
using WeatherApi.Extensions;
using WeatherApi.Services;

// Load .env file for local development (file may not exist in production)
if (File.Exists(".env")) DotNetEnv.Env.Load();

var builder = WebApplication.CreateBuilder(args);

// Add controllers
builder.Services.AddControllers();

// Swagger/OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Easy Auth service
builder.Services.AddEasyAuth();

// CORS
builder.Services.AddWeatherCors(builder.Configuration);

// Entity Framework Core (SQL Database with Managed Identity)
var sqlConnectionString = builder.Configuration["SQL_CONNECTION_STRING"]
    ?? throw new InvalidOperationException("SQL_CONNECTION_STRING is required");

builder.Services.AddDbContext<DashboardDbContext>(options =>
    options.UseSqlServer(sqlConnectionString));

// Azure SDK Clients (Service Bus, Service Bus Administration)
var serviceBusNamespace = builder.Configuration["ServiceBus__Namespace"]
    ?? throw new InvalidOperationException("ServiceBus__Namespace is required");

builder.Services.AddAzureClients(clientBuilder =>
{
    // Use DefaultAzureCredential for all clients (works both locally and in Azure)
    clientBuilder.UseCredential(new DefaultAzureCredential());

    // Register Service Bus client for DLQ operations
    clientBuilder.AddServiceBusClientWithNamespace(serviceBusNamespace);

    // Register Service Bus Administration client for DLQ metrics
    clientBuilder.AddClient<Azure.Messaging.ServiceBus.Administration.ServiceBusAdministrationClient, Azure.Messaging.ServiceBus.ServiceBusClientOptions>(
        (options, credential, _) => new Azure.Messaging.ServiceBus.Administration.ServiceBusAdministrationClient(serviceBusNamespace, credential));
});

// Business Services (Service Layer)
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IDlqService, DlqService>();
builder.Services.AddScoped<IHealthService, HealthService>();

// Health Checks
builder.Services.AddHealthChecks()
    .AddCheck("self", () => Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy("API is running"))
    .AddDbContextCheck<DashboardDbContext>("sql", tags: new[] { "db", "sql" })
    .AddCheck("servicebus", () =>
    {
        var ns = builder.Configuration["ServiceBus__Namespace"];
        if (string.IsNullOrEmpty(ns)) return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Degraded("Service Bus not configured");
        return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy("Service Bus configured");
    });

// OpenTelemetry + Azure Monitor (App Insights)
// UseAzureMonitor() auto-collects: HTTP requests, dependencies, ILogger logs, exceptions, metrics
// Ref: https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable
var appInsightsConnectionString = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]
    ?? Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING");

if (!string.IsNullOrEmpty(appInsightsConnectionString))
{
    builder.Services.AddOpenTelemetry().UseAzureMonitor(options =>
    {
        options.ConnectionString = appInsightsConnectionString;
    });
}

var app = builder.Build();

// Health endpoints (no auth, for Container Apps probes)
app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = check => check.Name == "self"
});

app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = _ => true // all checks
});

// Legacy /health endpoint (for backward compatibility)
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowFrontend");
app.MapControllers();

app.Run();
