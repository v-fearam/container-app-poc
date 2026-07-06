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

// Health endpoint (no auth, useful for probes and smoke tests)
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
