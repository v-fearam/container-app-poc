using Azure.Identity;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WeatherEnqueuer.Services;

var builder = Host.CreateApplicationBuilder(args);

// Configure logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// Get Service Bus namespace from configuration
var serviceBusNamespace = builder.Configuration["SERVICE_BUS_NAMESPACE"]
    ?? throw new InvalidOperationException("SERVICE_BUS_NAMESPACE environment variable not set");

// Register Azure clients using AddAzureClients (best practice for DI)
builder.Services.AddAzureClients(clientBuilder =>
{
    clientBuilder.AddServiceBusClient(serviceBusNamespace)
        .WithCredential(new DefaultAzureCredential());
});

// Register application services
builder.Services.AddTransient<IEnqueuerService, EnqueuerService>();

var host = builder.Build();

// Execute the enqueuer service
using (var scope = host.Services.CreateScope())
{
    var enqueuerService = scope.ServiceProvider.GetRequiredService<IEnqueuerService>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    try
    {
        await enqueuerService.ExecuteAsync(CancellationToken.None);
        logger.LogInformation("Job execution completed successfully. Exiting with code 0.");
        Environment.Exit(0);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Job execution failed. Exiting with code 1.");
        Environment.Exit(1);
    }
}

