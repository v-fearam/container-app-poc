using WeatherWorker;

using Azure.Identity;
using Azure.Messaging.ServiceBus;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using OpenTelemetry.Resources;

var builder = Host.CreateApplicationBuilder(args);

// OpenTelemetry + Azure Monitor
var appInsightsConnectionString = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]
    ?? Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING");

if (!string.IsNullOrEmpty(appInsightsConnectionString))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService("WeatherWorker"))
        .UseAzureMonitor(options =>
        {
            options.ConnectionString = appInsightsConnectionString;
        });
    builder.Logging.AddOpenTelemetry(o => o.IncludeFormattedMessage = true);
}
else
{
    Console.WriteLine("WARNING: APPLICATIONINSIGHTS_CONNECTION_STRING not set — telemetry disabled");
}

// Service Bus client (Managed Identity in Azure, az login locally)
var sbNamespace = builder.Configuration["ServiceBus:Namespace"]
    ?? Environment.GetEnvironmentVariable("ServiceBus__Namespace")
    ?? throw new InvalidOperationException("ServiceBus:Namespace configuration is required");

builder.Services.AddSingleton(new ServiceBusClient(sbNamespace, new DefaultAzureCredential()));

// Worker service
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
