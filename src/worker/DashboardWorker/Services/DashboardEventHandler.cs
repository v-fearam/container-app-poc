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
            "MessageEnqueued" or "MessageProcessed" => await UpsertQueueCounterAndComplete(evt, cancellationToken),
            "ChangeFeedProcessed" => await UpsertChangeFeedCounterAndComplete(evt, isSuccess: true, cancellationToken),
            "ChangeFeedError" => await UpsertChangeFeedCounterAndComplete(evt, isSuccess: false, cancellationToken),
            _ => RejectUnknownEventType(evt)
        };
    }

    private async Task<MessageHandleResult> UpsertQueueCounterAndComplete(DashboardEvent evt, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        var date = evt.Timestamp.Date;

        var updated = await IncrementExistingQueueCounter(dbContext, evt, date, cancellationToken);

        if (!updated)
            await InsertNewQueueCounterOrRetry(evt, dbContext, date, cancellationToken);

        return new MessageHandleResult(MessageSettlement.Complete);
    }

    private async Task<MessageHandleResult> UpsertChangeFeedCounterAndComplete(
        DashboardEvent evt, bool isSuccess, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        var date = evt.Timestamp.Date;

        var updated = await IncrementExistingChangeFeedCounter(dbContext, evt, date, isSuccess, cancellationToken);

        if (!updated)
            await InsertNewChangeFeedCounterOrRetry(evt, dbContext, date, isSuccess, cancellationToken);

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

    private static async Task<bool> IncrementExistingQueueCounter(
        DashboardDbContext dbContext, DashboardEvent evt, DateTime date, CancellationToken cancellationToken)
    {
        var filter = FilterByQueueCounterKey(dbContext, evt, date);

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

    private static async Task<bool> IncrementExistingChangeFeedCounter(
        DashboardDbContext dbContext, DashboardEvent evt, DateTime date, bool isSuccess, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(evt.Collection))
            return false;

        var filter = dbContext.ChangeFeedCounters
            .Where(c => c.Collection == evt.Collection && c.Date == date);

        var rowsAffected = isSuccess
            ? await filter.ExecuteUpdateAsync(c => c
                .SetProperty(x => x.SuccessCount, x => x.SuccessCount + 1)
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken)
            : await filter.ExecuteUpdateAsync(c => c
                .SetProperty(x => x.ErrorCount, x => x.ErrorCount + 1)
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken);

        return rowsAffected > 0;
    }

    private async Task InsertNewQueueCounterOrRetry(
        DashboardEvent evt, DashboardDbContext dbContext, DateTime date, CancellationToken cancellationToken)
    {
        var counter = new QueueCounter
        {
            Vertical = evt.Vertical,
            QueueName = evt.QueueName!,
            ProcessType = evt.ProcessType!,
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
            logger.LogDebug("Concurrent INSERT detected for queue counter. Falling back to increment.");
            await RetryIncrementQueueWithFreshContext(evt, date, cancellationToken);
        }
    }

    private async Task InsertNewChangeFeedCounterOrRetry(
        DashboardEvent evt, DashboardDbContext dbContext, DateTime date, bool isSuccess, CancellationToken cancellationToken)
    {
        var counter = new ChangeFeedCounter
        {
            Collection = evt.Collection!,
            Date = date,
            SuccessCount = isSuccess ? 1 : 0,
            ErrorCount = isSuccess ? 0 : 1,
            UpdatedAt = DateTime.UtcNow
        };

        dbContext.ChangeFeedCounters.Add(counter);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx && sqlEx.Number == 2627)
        {
            logger.LogDebug("Concurrent INSERT detected for Change Feed counter. Falling back to increment.");
            await RetryIncrementChangeFeedWithFreshContext(evt, date, isSuccess, cancellationToken);
        }
    }

    private async Task RetryIncrementQueueWithFreshContext(
        DashboardEvent evt, DateTime date, CancellationToken cancellationToken)
    {
        await using var retryDbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        await IncrementExistingQueueCounter(retryDbContext, evt, date, cancellationToken);
    }

    private async Task RetryIncrementChangeFeedWithFreshContext(
        DashboardEvent evt, DateTime date, bool isSuccess, CancellationToken cancellationToken)
    {
        await using var retryDbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        await IncrementExistingChangeFeedCounter(retryDbContext, evt, date, isSuccess, cancellationToken);
    }

    private static IQueryable<QueueCounter> FilterByQueueCounterKey(
        DashboardDbContext dbContext, DashboardEvent evt, DateTime date)
    {
        return dbContext.QueueCounters
            .Where(q => q.Vertical == evt.Vertical
                && q.QueueName == evt.QueueName
                && q.ProcessType == evt.ProcessType
                && q.Date == date);
    }
}
