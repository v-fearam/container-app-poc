using Azure.Identity;
using Azure.Messaging.ServiceBus;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using DashboardWorker.Configuration;
using DashboardWorker.Services;
using OpenTelemetry.Resources;

var builder = Host.CreateApplicationBuilder(args);

// ─── Enable Azure SDK distributed tracing (creates Activity spans per message) ─
AppContext.SetSwitch("Azure.Experimental.EnableActivitySource", true);

// ─── Configuration (Options pattern) ────────────────────────────────────────
builder.Services.Configure<ServiceBusOptions>(builder.Configuration.GetSection(ServiceBusOptions.SectionName));
builder.Services.Configure<SqlOptions>(builder.Configuration.GetSection(SqlOptions.SectionName));

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

// ─── Service Bus client (Managed Identity in Azure, DefaultAzureCredential locally) ─
var sbNamespace = builder.Configuration["ServiceBus:Namespace"]
    ?? Environment.GetEnvironmentVariable("ServiceBus__Namespace")
    ?? throw new InvalidOperationException("ServiceBus:Namespace is required. Set in appsettings or env var.");

builder.Services.AddSingleton(new ServiceBusClient(sbNamespace, new DefaultAzureCredential()));

// ─── Hosted service ─────────────────────────────────────────────────────────
builder.Services.AddHostedService<DashboardWorkerService>();

var host = builder.Build();
host.Run();
