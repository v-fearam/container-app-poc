using Azure.Identity;
using Azure.Messaging.ServiceBus;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using OpenTelemetry.Resources;
using WeatherWorker.Configuration;
using WeatherWorker.Handlers;
using WeatherWorker.Services;

var builder = Host.CreateApplicationBuilder(args);

// ─── Enable Azure SDK distributed tracing (creates Activity spans per message) ─
AppContext.SetSwitch("Azure.Experimental.EnableActivitySource", true);

// ─── Configuration (Options pattern) ────────────────────────────────────────
builder.Services.Configure<ServiceBusOptions>(builder.Configuration.GetSection(ServiceBusOptions.SectionName));
builder.Services.Configure<WorkerOptions>(builder.Configuration.GetSection(WorkerOptions.SectionName));

// ─── Observability (OpenTelemetry + Azure Monitor) ──────────────────────────
var appInsightsCs = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]
    ?? Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING");

if (!string.IsNullOrEmpty(appInsightsCs))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService("WeatherWorker"))
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

// ─── Service Bus sender for Dashboard events topic ─
builder.Services.AddSingleton(sp =>
{
    var client = sp.GetRequiredService<ServiceBusClient>();
    return client.CreateSender("nd-dashboard-events");
});

// ─── Message handlers (registered as singletons for reuse across concurrent calls) ─
builder.Services.AddSingleton<DefaultMessageHandler>();
builder.Services.AddSingleton<DlqSimulationHandlers.UnhandledExceptionHandler>();
builder.Services.AddSingleton<DlqSimulationHandlers.ValidationFailureHandler>();
builder.Services.AddSingleton<DlqSimulationHandlers.LockTimeoutHandler>();
builder.Services.AddSingleton<MessageDispatcher>();

// ─── Hosted service ─────────────────────────────────────────────────────────
builder.Services.AddHostedService<ServiceBusWorker>();

var host = builder.Build();
host.Run();
