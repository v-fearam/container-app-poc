using DashboardWorker.Data;
using DashboardWorker.Data.Entities;
using DashboardWorker.Models;
using Microsoft.EntityFrameworkCore;

namespace DashboardWorker.Services;

/// <summary>
/// Processes dashboard events by upserting queue counters in SQL.
/// Owns all business logic — the BackgroundService only handles messaging infrastructure.
/// </summary>
public class DashboardEventHandler(
    IDbContextFactory<DashboardDbContext> dbContextFactory,
    ILogger<DashboardEventHandler> logger) : IDashboardEventHandler
{
    public async Task<MessageHandleResult> HandleAsync(DashboardEvent evt, CancellationToken cancellationToken)
    {
        return evt.EventType switch
        {
            "MessageEnqueued" or "MessageProcessed" => await UpsertCounterAndComplete(evt, cancellationToken),
            _ => RejectUnknownEventType(evt)
        };
    }

    private async Task<MessageHandleResult> UpsertCounterAndComplete(DashboardEvent evt, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        var date = evt.Timestamp.Date;

        var updated = await IncrementExistingCounter(dbContext, evt, date, cancellationToken);

        if (!updated)
            await InsertNewCounterOrRetry(evt, dbContext, date, cancellationToken);

        return new MessageHandleResult(MessageSettlement.Complete);
    }

    private MessageHandleResult RejectUnknownEventType(DashboardEvent evt)
    {
        logger.LogWarning("Unknown EventType={EventType}. Sending to dead-letter.", evt.EventType);
        return new MessageHandleResult(
            MessageSettlement.DeadLetter,
            "UnknownEventType",
            $"EventType '{evt.EventType}' is not recognized");
    }

    private static async Task<bool> IncrementExistingCounter(
        DashboardDbContext dbContext, DashboardEvent evt, DateTime date, CancellationToken cancellationToken)
    {
        var filter = FilterByCounterKey(dbContext, evt, date);

        var rowsAffected = evt.EventType switch
        {
            "MessageEnqueued" => await filter.ExecuteUpdateAsync(q => q
                .SetProperty(x => x.EnqueuedCount, x => x.EnqueuedCount + 1)
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken),

            "MessageProcessed" => await filter.ExecuteUpdateAsync(q => q
                .SetProperty(x => x.ProcessedCount, x => x.ProcessedCount + 1)
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken),

            _ => 0
        };

        return rowsAffected > 0;
    }

    private async Task InsertNewCounterOrRetry(
        DashboardEvent evt, DashboardDbContext dbContext, DateTime date, CancellationToken cancellationToken)
    {
        var counter = new QueueCounter
        {
            Vertical = evt.Vertical,
            QueueName = evt.QueueName,
            ProcessType = evt.ProcessType,
            Date = date,
            EnqueuedCount = evt.EventType == "MessageEnqueued" ? 1 : 0,
            ProcessedCount = evt.EventType == "MessageProcessed" ? 1 : 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        dbContext.QueueCounters.Add(counter);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx && sqlEx.Number == 2627)
        {
            logger.LogDebug("Concurrent INSERT detected. Falling back to increment.");
            await RetryIncrementWithFreshContext(evt, date, cancellationToken);
        }
    }

    private async Task RetryIncrementWithFreshContext(
        DashboardEvent evt, DateTime date, CancellationToken cancellationToken)
    {
        await using var retryDbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        await IncrementExistingCounter(retryDbContext, evt, date, cancellationToken);
    }

    private static IQueryable<QueueCounter> FilterByCounterKey(
        DashboardDbContext dbContext, DashboardEvent evt, DateTime date)
    {
        return dbContext.QueueCounters
            .Where(q => q.Vertical == evt.Vertical
                && q.QueueName == evt.QueueName
                && q.ProcessType == evt.ProcessType
                && q.Date == date);
    }
}
