using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using DashboardWorker.Configuration;
using DashboardWorker.Data;
using DashboardWorker.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Azure;
using OpenTelemetry.Resources;

var builder = Host.CreateApplicationBuilder(args);

// ─── Enable Azure SDK distributed tracing (creates Activity spans per message) ─
AppContext.SetSwitch("Azure.Experimental.EnableActivitySource", true);

// ─── Configuration (Options pattern) ────────────────────────────────────────
builder.Services.Configure<ServiceBusOptions>(builder.Configuration.GetSection(ServiceBusOptions.SectionName));

// ─── Entity Framework Core (SQL Database with Managed Identity) ─────────────
var sqlConnectionString = builder.Configuration["Sql:ConnectionString"]
    ?? Environment.GetEnvironmentVariable("Sql__ConnectionString")
    ?? throw new InvalidOperationException("Sql:ConnectionString is required. Set in appsettings or env var.");

builder.Services.AddDbContextFactory<DashboardDbContext>(options =>
    options.UseSqlServer(sqlConnectionString));

// ─── Azure SDK Clients (Service Bus) ────────────────────────────────────────
var serviceBusNamespace = builder.Configuration["ServiceBus:Namespace"]
    ?? Environment.GetEnvironmentVariable("ServiceBus__Namespace")
    ?? throw new InvalidOperationException("ServiceBus:Namespace is required. Set in appsettings or env var.");

builder.Services.AddAzureClients(clientBuilder =>
{
    // Use DefaultAzureCredential for all clients (works both locally and in Azure)
    clientBuilder.UseCredential(new DefaultAzureCredential());

    // Register Service Bus client
    clientBuilder.AddServiceBusClientWithNamespace(serviceBusNamespace);
});

// ─── Observability (OpenTelemetry + Azure Monitor) ──────────────────────────
var appInsightsCs = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]
    ?? Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING");

if (!string.IsNullOrEmpty(appInsightsCs))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService("DashboardWorker"))
        .UseAzureMonitor(o => o.ConnectionString = appInsightsCs);

    builder.Logging.AddOpenTelemetry(o =>
    {
        o.IncludeFormattedMessage = true;
        o.IncludeScopes = true;
    });
}
else
{
    Console.WriteLine("WARNING: APPLICATIONINSIGHTS_CONNECTION_STRING not set — telemetry disabled");
}

// ─── Hosted service ─────────────────────────────────────────────────────────
builder.Services.AddHostedService<DashboardWorkerService>();

var host = builder.Build();
host.Run();
