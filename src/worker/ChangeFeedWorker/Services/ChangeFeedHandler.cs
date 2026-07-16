using System.Text.Json;
using Azure.Messaging.ServiceBus;
using ChangeFeedWorker.Configuration;
using ChangeFeedWorker.Data;
using ChangeFeedWorker.Data.Entities;
using ChangeFeedWorker.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChangeFeedWorker.Services;

/// <summary>
/// Handles Change Feed events: syncs Personas to SQL and publishes dashboard events.
/// Follows the same pattern as DashboardEventHandler (self-documenting methods, idempotent writes).
/// </summary>
public class ChangeFeedHandler(
    IDbContextFactory<DashboardDbContext> dbContextFactory,
    ServiceBusClient serviceBusClient,
    CosmosClient cosmosClient,
    IOptions<CosmosOptions> cosmosOptions,
    ILogger<ChangeFeedHandler> logger) : IChangeFeedHandler
{
    private readonly CosmosOptions _cosmosOptions = cosmosOptions.Value;

    public async Task ProcessBatchAsync(IReadOnlyCollection<Persona> personas, CancellationToken cancellationToken)
    {
        logger.LogInformation("Processing {Count} personas from Change Feed", personas.Count);

        var successCount = 0;
        var errorCount = 0;

        foreach (var persona in personas)
        {
            try
            {
                await UpsertPersonaToSql(persona, cancellationToken);
                await PublishSuccessEvent(persona, cancellationToken);
                successCount++;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to process Persona {Id}. Writing to error container.", persona.Id);
                await WriteToErrorContainer(persona, ex, cancellationToken);
                await PublishErrorEvent(persona, ex, cancellationToken);
                errorCount++;
            }
        }

        logger.LogInformation("Batch complete: {Success} success, {Error} errors", successCount, errorCount);

        // Update daily aggregated counter
        await UpdateChangeFeedCounter(successCount, errorCount, cancellationToken);
    }

    /// <summary>
    /// Upserts a Persona to SQL only if CosmosUpdatedAt is newer (idempotency).
    /// Increments SyncVersion on each update.
    /// </summary>
    private async Task UpsertPersonaToSql(Persona persona, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);

        var existing = await dbContext.PersonasSync
            .FirstOrDefaultAsync(p => p.Id == persona.Id, cancellationToken);

        if (existing == null)
        {
            // Insert new
            var newSync = new PersonaSync
            {
                Id = persona.Id!,
                Nombre = persona.Nombre,
                Apellido = persona.Apellido,
                Email = persona.Email,
                Edad = persona.Edad,
                Ciudad = persona.Ciudad,
                CosmosUpdatedAt = persona.UpdatedAt,
                SyncVersion = 1,
                SyncedAt = DateTime.UtcNow
            };
            dbContext.PersonasSync.Add(newSync);
            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogDebug("Inserted new Persona {Id} to SQL", persona.Id);
        }
        else if (persona.UpdatedAt > existing.CosmosUpdatedAt)
        {
            // Update only if Cosmos document is newer
            existing.Nombre = persona.Nombre;
            existing.Apellido = persona.Apellido;
            existing.Email = persona.Email;
            existing.Edad = persona.Edad;
            existing.Ciudad = persona.Ciudad;
            existing.CosmosUpdatedAt = persona.UpdatedAt;
            existing.SyncVersion++;
            existing.SyncedAt = DateTime.UtcNow;

            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogDebug("Updated Persona {Id} in SQL (v{Version})", persona.Id, existing.SyncVersion);
        }
        else
        {
            logger.LogDebug("Skipped Persona {Id} — SQL already has newer/same version", persona.Id);
        }
    }

    /// <summary>
    /// Publishes ChangeFeedProcessed event to Service Bus dashboard topic.
    /// </summary>
    private async Task PublishSuccessEvent(Persona persona, CancellationToken cancellationToken)
    {
        var evt = new
        {
            EventType = "ChangeFeedProcessed",
            Timestamp = DateTime.UtcNow,
            Vertical = _cosmosOptions.VerticalName,
            Collection = _cosmosOptions.Collection,
            DocumentId = persona.Id,
            ProcessedBy = _cosmosOptions.ProcessorName
        };

        await SendEventToServiceBus(evt, cancellationToken);
    }

    /// <summary>
    /// Publishes ChangeFeedError event to Service Bus dashboard topic.
    /// </summary>
    private async Task PublishErrorEvent(Persona persona, Exception ex, CancellationToken cancellationToken)
    {
        var evt = new
        {
            EventType = "ChangeFeedError",
            Timestamp = DateTime.UtcNow,
            Vertical = _cosmosOptions.VerticalName,
            Collection = _cosmosOptions.Collection,
            DocumentId = persona.Id,
            ErrorMessage = ex.Message,
            ProcessedBy = _cosmosOptions.ProcessorName
        };

        await SendEventToServiceBus(evt, cancellationToken);
    }

    private async Task SendEventToServiceBus(object evt, CancellationToken cancellationToken)
    {
        var topicName = "nd-dashboard-events"; // TODO: make configurable from appsettings
        var sender = serviceBusClient.CreateSender(topicName);

        var messageBody = JsonSerializer.Serialize(evt);
        var message = new ServiceBusMessage(messageBody)
        {
            ContentType = "application/json"
        };

        await sender.SendMessageAsync(message, cancellationToken);
    }

    /// <summary>
    /// Writes the failed Persona to the error container for manual reprocessing.
    /// POC uses a simple error container as DLQ; production should add retry policies.
    /// </summary>
    private async Task WriteToErrorContainer(Persona persona, Exception ex, CancellationToken cancellationToken)
    {
        var database = cosmosClient.GetDatabase(_cosmosOptions.Database);
        var errorContainer = database.GetContainer("changefeed-errors");

        var errorDoc = new
        {
            id = Guid.NewGuid().ToString(), // New ID for error record
            OriginalId = persona.Id,
            OriginalDocument = persona,
            ErrorMessage = ex.Message,
            ErrorStackTrace = ex.StackTrace,
            FailedAt = DateTime.UtcNow,
            ProcessorName = _cosmosOptions.ProcessorName
        };

        await errorContainer.CreateItemAsync(errorDoc, new PartitionKey(errorDoc.id), cancellationToken: cancellationToken);
    }

    /// <summary>
    /// Updates daily aggregated counter (SuccessCount + ErrorCount per Collection + Date).
    /// Follows same INSERT-then-UPDATE pattern as DashboardEventHandler.
    /// </summary>
    private async Task UpdateChangeFeedCounter(int successCount, int errorCount, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        var date = DateTime.UtcNow.Date;

        var updated = await IncrementExistingCounter(dbContext, date, successCount, errorCount, cancellationToken);

        if (!updated)
            await InsertNewCounterOrRetry(dbContext, date, successCount, errorCount, cancellationToken);
    }

    private async Task<bool> IncrementExistingCounter(
        DashboardDbContext dbContext, DateTime date, int successCount, int errorCount, CancellationToken cancellationToken)
    {
        var filter = dbContext.ChangeFeedCounters
            .Where(c => c.Collection == _cosmosOptions.Collection && c.Date == date);

        var rowsAffected = await filter.ExecuteUpdateAsync(c => c
            .SetProperty(x => x.SuccessCount, x => x.SuccessCount + successCount)
            .SetProperty(x => x.ErrorCount, x => x.ErrorCount + errorCount)
            .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken);

        return rowsAffected > 0;
    }

    private async Task InsertNewCounterOrRetry(
        DashboardDbContext dbContext, DateTime date, int successCount, int errorCount, CancellationToken cancellationToken)
    {
        var counter = new ChangeFeedCounter
        {
            Collection = _cosmosOptions.Collection,
            Date = date,
            SuccessCount = successCount,
            ErrorCount = errorCount,
            UpdatedAt = DateTime.UtcNow
        };

        dbContext.ChangeFeedCounters.Add(counter);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx && sqlEx.Number == 2627)
        {
            logger.LogDebug("Concurrent INSERT detected for counter. Retrying increment.");
            await RetryIncrementWithFreshContext(date, successCount, errorCount, cancellationToken);
        }
    }

    private async Task RetryIncrementWithFreshContext(
        DateTime date, int successCount, int errorCount, CancellationToken cancellationToken)
    {
        await using var retryDbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        await IncrementExistingCounter(retryDbContext, date, successCount, errorCount, cancellationToken);
    }
}
