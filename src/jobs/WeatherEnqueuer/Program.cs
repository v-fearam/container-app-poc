using Azure.Identity;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WeatherEnqueuer.Services;

Console.WriteLine("=== WeatherEnqueuer starting (before Host.CreateApplicationBuilder) ===");

var builder = Host.CreateApplicationBuilder(args);

Console.WriteLine("Host.CreateApplicationBuilder completed");

// Configure logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// Get Service Bus namespace from configuration
var serviceBusNamespace = builder.Configuration["SERVICE_BUS_NAMESPACE"]
    ?? throw new InvalidOperationException("SERVICE_BUS_NAMESPACE environment variable not set");

Console.WriteLine($"SERVICE_BUS_NAMESPACE: {serviceBusNamespace}");

// Register Azure clients using AddAzureClients (best practice for DI)
builder.Services.AddAzureClients(clientBuilder =>
{
    Console.WriteLine("Registering ServiceBusClient...");
    // Use namespace + managed identity (NOT connection string)
    clientBuilder.AddClient<Azure.Messaging.ServiceBus.ServiceBusClient, Azure.Messaging.ServiceBus.ServiceBusClientOptions>(
        (options, credential, provider) =>
        {
            return new Azure.Messaging.ServiceBus.ServiceBusClient(serviceBusNamespace, credential, options);
        })
        .WithCredential(new DefaultAzureCredential());
});

Console.WriteLine("ServiceBusClient registered");

// Register application services
builder.Services.AddTransient<IEnqueuerService, EnqueuerService>();

Console.WriteLine("Building host...");
var host = builder.Build();
Console.WriteLine("Host built successfully");

// Execute the enqueuer service
using (var scope = host.Services.CreateScope())
{
    Console.WriteLine("Creating scope and resolving services...");
    var enqueuerService = scope.ServiceProvider.GetRequiredService<IEnqueuerService>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var lifetime = scope.ServiceProvider.GetRequiredService<IHostApplicationLifetime>();

    Console.WriteLine("Services resolved, starting execution...");
    try
    {
        // Use ApplicationStopping token (NOT CancellationToken.None) for graceful shutdown
        await enqueuerService.ExecuteAsync(lifetime.ApplicationStopping);
        logger.LogInformation("Job execution completed successfully. Exiting with code 0.");
        Console.WriteLine("SUCCESS - Exiting with code 0");
        Environment.Exit(0);
    }
    catch (OperationCanceledException)
    {
        // Graceful shutdown via SIGTERM
        logger.LogInformation("Job execution cancelled (SIGTERM received). Exiting with code 0.");
        Console.WriteLine("CANCELLED (graceful) - Exiting with code 0");
        Environment.Exit(0);
    }
    catch (Exception ex)
    {
        // Real error
        logger.LogError(ex, "Job execution failed. Exiting with code 1.");
        Console.WriteLine($"ERROR - {ex.Message}");
        Console.WriteLine($"Stack: {ex.StackTrace}");
        Environment.Exit(1);
    }
}

