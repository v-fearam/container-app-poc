using Azure.Messaging.ServiceBus.Administration;
using Microsoft.EntityFrameworkCore;
using WeatherApi.Data;
using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Dashboard service implementation with business logic for KPI calculations
/// </summary>
public class DashboardService(
    DashboardDbContext dbContext,
    ServiceBusAdministrationClient sbAdminClient,
    ILogger<DashboardService> logger) : IDashboardService
{

    public async Task<IEnumerable<DashboardKpiResponse>> GetKpiAsync(
        DateTime date,
        string vertical,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Getting Dashboard KPI for date={Date} vertical={Vertical}", date, vertical);

        // 1. Query EF Core for enqueued/processed counters (AsNoTracking for read-only)
        var sqlCounters = await dbContext.QueueCounters
            .AsNoTracking()
            .Where(q => q.Date == date && q.Vertical == vertical)
            .ToListAsync(cancellationToken);

        // 2. Query Service Bus for live DLQ counts
        var dlqCounts = await GetDlqCountsAsync(cancellationToken);

        // 3. Merge SQL counters with DLQ counts
        var kpiResults = sqlCounters.Select(q => new DashboardKpiResponse
        {
            Vertical = q.Vertical,
            QueueName = q.QueueName,
            ProcessType = q.ProcessType,
            Date = q.Date,
            EnqueuedCount = q.EnqueuedCount,
            ProcessedCount = q.ProcessedCount,
            DiscardedCount = q.DiscardedCount,
            DeadLetterCount = dlqCounts.TryGetValue(q.QueueName, out var dlq) ? dlq.Count : 0,
            DlqPath = dlqCounts.TryGetValue(q.QueueName, out var dlqPath) ? dlqPath.Path : null
        }).ToList();

        return kpiResults;
    }

    private async Task<Dictionary<string, (int Count, string Path)>> GetDlqCountsAsync(CancellationToken cancellationToken)
    {
        var counts = new Dictionary<string, (int Count, string Path)>();

        // Get DLQ count for weather-jobs queue (if it exists as a standalone queue)
        try
        {
            var queueProps = await sbAdminClient.GetQueueRuntimePropertiesAsync("weather-jobs", cancellationToken);
            var dlqCount = (int)queueProps.Value.DeadLetterMessageCount;
            if (dlqCount > 0)
                counts["weather-jobs"] = (dlqCount, "weather-jobs");
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Queue weather-jobs not found, checking topic subscription instead");
        }

        // Get DLQ count from the topic subscription (this is where messages actually go)
        try
        {
            var subProps = await sbAdminClient.GetSubscriptionRuntimePropertiesAsync("nd-dashboard-events", "counter-updater", cancellationToken);
            var subDlqCount = (int)subProps.Value.DeadLetterMessageCount;
            
            if (subDlqCount > 0)
            {
                if (counts.ContainsKey("weather-jobs"))
                    counts["weather-jobs"] = (counts["weather-jobs"].Count + subDlqCount, "nd-dashboard-events/counter-updater");
                else
                    counts["weather-jobs"] = (subDlqCount, "nd-dashboard-events/counter-updater");
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to get DLQ count for subscription counter-updater");
        }

        return counts;
    }
}

