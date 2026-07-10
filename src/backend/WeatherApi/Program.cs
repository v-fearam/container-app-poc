using Azure.Monitor.OpenTelemetry.AspNetCore;
using WeatherApi.Extensions;

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

// Health Checks
builder.Services.AddHealthChecks()
    .AddCheck("self", () => Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy("API is running"))
    .AddAsyncCheck("sql", async (ct) =>
    {
        try
        {
            var connString = builder.Configuration["SQL_CONNECTION_STRING"];
            if (string.IsNullOrEmpty(connString)) return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Degraded("SQL not configured");
            
            using var conn = new Microsoft.Data.SqlClient.SqlConnection(connString);
            await conn.OpenAsync(ct);
            return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy("SQL connected");
        }
        catch (Exception ex)
        {
            return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Unhealthy("SQL unavailable", ex);
        }
    })
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
