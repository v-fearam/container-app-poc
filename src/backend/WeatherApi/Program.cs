using Azure.Monitor.OpenTelemetry.AspNetCore;
using WeatherApi.Extensions;

// Cargar variables desde .env si existe
DotNetEnv.Env.Load();

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

// Configure OpenTelemetry with Azure Monitor (opcional en desarrollo)
var appInsightsConnectionString = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]
    ?? Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING");

if (!string.IsNullOrEmpty(appInsightsConnectionString))
{
    builder.Services.AddOpenTelemetry().UseAzureMonitor();
    builder.Logging.AddConsole();
    Console.WriteLine("✅ Application Insights habilitado");
}
else
{
    Console.WriteLine("⚠️  Application Insights no configurado (opcional para desarrollo local)");
}

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowFrontend");
app.MapControllers();

app.Run();
