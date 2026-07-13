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
            DeadLetterCount = dlqCounts.GetValueOrDefault(q.QueueName, 0)
        }).ToList();

        return kpiResults;
    }

    private async Task<Dictionary<string, int>> GetDlqCountsAsync(CancellationToken cancellationToken)
    {
        var counts = new Dictionary<string, int>();

        // Get DLQ count for weather-jobs queue
        try
        {
            var queueProps = await sbAdminClient.GetQueueRuntimePropertiesAsync("weather-jobs", cancellationToken);
            counts["weather-jobs"] = (int)queueProps.Value.DeadLetterMessageCount;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to get DLQ count for queue weather-jobs");
            counts["weather-jobs"] = 0;
        }

        // Get DLQ count for nd-dashboard-events subscription
        try
        {
            var subProps = await sbAdminClient.GetSubscriptionRuntimePropertiesAsync("nd-dashboard-events", "counter-updater", cancellationToken);
            counts["nd-dashboard-events/counter-updater"] = (int)subProps.Value.DeadLetterMessageCount;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to get DLQ count for subscription counter-updater");
            counts["nd-dashboard-events/counter-updater"] = 0;
        }

        return counts;
    }
}

