using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Azure;
using WeatherApi.Data;
using WeatherApi.Extensions;
using WeatherApi.Middleware;
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
// Optional: Only register if connection string is provided
var sqlConnectionString = builder.Configuration["SQL_CONNECTION_STRING"];
Console.WriteLine($"[DEBUG] SQL_CONNECTION_STRING is {(string.IsNullOrEmpty(sqlConnectionString) ? "EMPTY" : "SET")}");

if (!string.IsNullOrEmpty(sqlConnectionString))
{
    builder.Services.AddDbContext<DashboardDbContext>(options =>
        options.UseSqlServer(sqlConnectionString));
}

// Azure SDK Clients (Service Bus, Service Bus Administration)
// Optional: Only register if Service Bus namespace is provided
var serviceBusNamespace = builder.Configuration["ServiceBus:Namespace"];
Console.WriteLine($"[DEBUG] ServiceBus:Namespace is {(string.IsNullOrEmpty(serviceBusNamespace) ? "EMPTY" : serviceBusNamespace)}");

if (!string.IsNullOrEmpty(serviceBusNamespace))
{
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
}

// Business Services (Service Layer) - conditional based on dependencies
if (!string.IsNullOrEmpty(sqlConnectionString) && !string.IsNullOrEmpty(serviceBusNamespace))
{
    Console.WriteLine("[DEBUG] Registering DashboardService and DlqService");
    builder.Services.AddScoped<IDashboardService, DashboardService>();
    builder.Services.AddScoped<IDlqService, DlqService>();
}
else
{
    Console.WriteLine($"[DEBUG] NOT registering DashboardService - SQL={!string.IsNullOrEmpty(sqlConnectionString)}, ServiceBus={!string.IsNullOrEmpty(serviceBusNamespace)}");
}

builder.Services.AddScoped<IHealthService, HealthService>();

// Health Checks
var healthChecksBuilder = builder.Services.AddHealthChecks()
    .AddCheck("self", () => Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy("API is running"));

// SQL Database health check
if (!string.IsNullOrEmpty(sqlConnectionString))
{
    healthChecksBuilder.AddDbContextCheck<DashboardDbContext>("sql", tags: new[] { "db", "sql" });
}
else
{
    // Report SQL as degraded when not configured (useful to see app started without DB)
    healthChecksBuilder.AddCheck("sql", () =>
        Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Degraded("SQL Database not configured - SQL_CONNECTION_STRING missing"),
        tags: new[] { "db", "sql" });
}

// Service Bus health check
if (!string.IsNullOrEmpty(serviceBusNamespace))
{
    healthChecksBuilder.AddCheck("servicebus", () =>
        Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy($"Service Bus configured: {serviceBusNamespace}"));
}
else
{
    // Report Service Bus as degraded when not configured
    healthChecksBuilder.AddCheck("servicebus", () =>
        Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Degraded("Service Bus not configured - ServiceBus__Namespace missing"));
}

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

// ─── Global Exception Handler (must be first) ───────────────────────────────
app.UseMiddleware<GlobalExceptionHandlerMiddleware>();

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
