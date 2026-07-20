using ChangeFeedWorker.Configuration;
using ChangeFeedWorker.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;

namespace ChangeFeedWorker.Services;

/// <summary>
/// BackgroundService that initializes and runs the Change Feed Processor.
/// Delegates business logic to IChangeFeedHandler (separation of concerns).
/// 
/// For production: Each vertical gets its own Container App with different env vars.
/// See docs/change-feed-poc.md section 13.1 for deployment strategy.
/// </summary>
public class ChangeFeedWorkerService(
    CosmosClient cosmosClient,
    IOptions<CosmosOptions> cosmosOptions,
    IChangeFeedHandler handler,
    ILogger<ChangeFeedWorkerService> logger) : BackgroundService
{
    private readonly CosmosOptions _cosmosOptions = cosmosOptions.Value;
    private ChangeFeedProcessor? _processor;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "Starting Change Feed Processor for {Database}/{Collection} (Processor: {Processor}, Vertical: {Vertical})",
            _cosmosOptions.Database,
            _cosmosOptions.Collection,
            _cosmosOptions.ProcessorName,
            _cosmosOptions.VerticalName);

        var database = cosmosClient.GetDatabase(_cosmosOptions.Database);
        var monitoredContainer = database.GetContainer(_cosmosOptions.Collection);
        var leaseContainer = database.GetContainer("changefeed-leases");

        _processor = monitoredContainer
            .GetChangeFeedProcessorBuilder<Persona>(
                processorName: _cosmosOptions.ProcessorName,
                onChangesDelegate: HandleChangesAsync)
            .WithInstanceName($"{Environment.MachineName}-{Guid.NewGuid():N}") // Unique instance per pod
            .WithLeaseContainer(leaseContainer)
            .WithStartTime(DateTime.UtcNow.AddMinutes(-5)) // POC: start 5 min ago to catch recent changes
                .WithErrorNotification(HandleInfrastructureErrorAsync)
                .Build();

        await _processor.StartAsync();
        logger.LogInformation("Change Feed Processor started successfully");

        // Keep running until cancellation
        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    /// <summary>
    /// Handles SDK infrastructure errors: lease failures, partition read errors, connectivity issues.
    /// These fire BEFORE the delegate — meaning the SDK couldn't even read the batch.
    /// The SDK will retry automatically with exponential backoff.
    /// </summary>
    private Task HandleInfrastructureErrorAsync(string leaseToken, Exception exception)
    {
        logger.LogError(
            exception,
            "Change Feed infrastructure error on partition {LeaseToken}. " +
            "Type: {ErrorType}. The SDK will retry automatically.",
            leaseToken,
            exception.GetType().Name);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Change Feed delegate — invoked by SDK when new documents arrive.
    /// Each batch is processed independently with error isolation.
    /// Never let exceptions escape: SDK stops checkpointing and retries forever.
    /// </summary>
    private async Task HandleChangesAsync(
        ChangeFeedProcessorContext context,
        IReadOnlyCollection<Persona> changes,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Received {Count} changes from partition {PartitionKey}",
            changes.Count,
            context.LeaseToken);

        try
        {
            await handler.ProcessBatchAsync(changes, cancellationToken);
        }
        catch (Exception ex)
        {
            // CRITICAL: Never throw from this delegate.
            // If we throw, SDK stops checkpointing and retries the same batch forever.
            // Handler already logs individual failures; this is a last-resort catch.
            logger.LogError(ex, "Unexpected error in Change Feed handler. Swallowing to avoid infinite retry.");
        }

        // Checkpoint happens automatically when this method returns without exception
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Stopping Change Feed Processor...");

        if (_processor != null)
            await _processor.StopAsync();

        await base.StopAsync(cancellationToken);
        logger.LogInformation("Change Feed Processor stopped");
    }
}
