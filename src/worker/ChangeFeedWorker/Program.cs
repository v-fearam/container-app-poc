using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using ChangeFeedWorker.Configuration;
using ChangeFeedWorker.Data;
using ChangeFeedWorker.Services;
using Microsoft.Azure.Cosmos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Azure;
using OpenTelemetry.Resources;

var builder = Host.CreateApplicationBuilder(args);

// ─── Enable Azure SDK distributed tracing (creates Activity spans) ─────────
AppContext.SetSwitch("Azure.Experimental.EnableActivitySource", true);

// ─── Configuration (Options pattern) ────────────────────────────────────────
builder.Services.Configure<CosmosOptions>(builder.Configuration.GetSection(CosmosOptions.SectionName));

// ─── Entity Framework Core (SQL Database with Managed Identity) ─────────────
var sqlConnectionString = builder.Configuration["Sql:ConnectionString"]
    ?? Environment.GetEnvironmentVariable("Sql__ConnectionString")
    ?? throw new InvalidOperationException("Sql:ConnectionString is required. Set in appsettings or env var.");

builder.Services.AddDbContextFactory<DashboardDbContext>(options =>
    options.UseSqlServer(sqlConnectionString));

// ─── Cosmos DB Client (with DefaultAzureCredential) ────────────────────────
var cosmosEndpoint = builder.Configuration["Cosmos:Endpoint"]
    ?? Environment.GetEnvironmentVariable("Cosmos__Endpoint")
    ?? throw new InvalidOperationException("Cosmos:Endpoint is required. Set in appsettings or env var.");

builder.Services.AddSingleton(sp =>
{
    var credential = new DefaultAzureCredential();
    var options = new CosmosClientOptions
    {
        ApplicationName = "ChangeFeedWorker",
        ConnectionMode = ConnectionMode.Direct
    };
    return new CosmosClient(cosmosEndpoint, credential, options);
});

// ─── Azure SDK Clients (Service Bus for dashboard events) ──────────────────
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

// ─── Business Logic (Change Feed Handler) ──────────────────────────────────
builder.Services.AddSingleton<IChangeFeedHandler, ChangeFeedHandler>();

// ─── Observability (OpenTelemetry + Azure Monitor) ──────────────────────────
var appInsightsCs = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]
    ?? Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING");

if (!string.IsNullOrEmpty(appInsightsCs))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService("ChangeFeedWorker"))
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
builder.Services.AddHostedService<ChangeFeedWorkerService>();

var host = builder.Build();
host.Run();
