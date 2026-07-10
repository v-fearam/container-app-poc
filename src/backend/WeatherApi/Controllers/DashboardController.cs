using Azure.Identity;
using Azure.Messaging.ServiceBus.Administration;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Data;
using WeatherApi.Models;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<DashboardController> _logger;

    public DashboardController(IConfiguration configuration, ILogger<DashboardController> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Get Dashboard KPI for a specific date and vertical
    /// Combines SQL counters + live DLQ count from Service Bus
    /// </summary>
    [HttpGet("kpi")]
    [ProducesResponseType(typeof(IEnumerable<DashboardKpiResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetKpi(
        [FromQuery] DateTime? fecha = null,
        [FromQuery] string? vertical = null,
        CancellationToken cancellationToken = default)
    {
        var targetDate = fecha ?? DateTime.UtcNow.Date;
        var targetVertical = vertical ?? "Vertical1";

        _logger.LogInformation("Getting Dashboard KPI for date={Date} vertical={Vertical}", targetDate, targetVertical);

        try
        {
            // 1. Query SQL for enqueued/processed counters
            var sqlCounters = await GetSqlCountersAsync(targetDate, targetVertical, cancellationToken);

            // 2. Query Service Bus for live DLQ counts
            var dlqCounts = await GetDlqCountsAsync(cancellationToken);

            // 3. Merge SQL counters with DLQ counts
            var kpiResults = sqlCounters.Select(counter => new DashboardKpiResponse
            {
                Vertical = counter.Vertical,
                QueueName = counter.QueueName,
                ProcessType = counter.ProcessType,
                Date = counter.Date,
                EnqueuedCount = counter.EnqueuedCount,
                ProcessedCount = counter.ProcessedCount,
                DeadLetterCount = dlqCounts.GetValueOrDefault(counter.QueueName, 0)
            }).ToList();

            return Ok(kpiResults);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting Dashboard KPI");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to retrieve Dashboard KPI" });
        }
    }

    private async Task<List<(string Vertical, string QueueName, string ProcessType, DateTime Date, int EnqueuedCount, int ProcessedCount)>> GetSqlCountersAsync(
        DateTime date,
        string vertical,
        CancellationToken cancellationToken)
    {
        var results = new List<(string, string, string, DateTime, int, int)>();
        var connectionString = _configuration["SQL_CONNECTION_STRING"] ?? throw new InvalidOperationException("SQL_CONNECTION_STRING not configured");

        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        var query = @"
            SELECT Vertical, QueueName, ProcessType, Date, EnqueuedCount, ProcessedCount
            FROM dbo.QueueCounters
            WHERE Date = @Date AND Vertical = @Vertical
            ORDER BY QueueName, ProcessType";

        using var command = new SqlCommand(query, connection);
        command.Parameters.AddWithValue("@Date", date);
        command.Parameters.AddWithValue("@Vertical", vertical);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add((
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetDateTime(3),
                reader.GetInt32(4),
                reader.GetInt32(5)
            ));
        }

        return results;
    }

    private async Task<Dictionary<string, int>> GetDlqCountsAsync(CancellationToken cancellationToken)
    {
        var counts = new Dictionary<string, int>();
        var serviceBusNamespace = _configuration["ServiceBus__Namespace"] ?? throw new InvalidOperationException("ServiceBus__Namespace not configured");

        var credential = new DefaultAzureCredential();
        var adminClient = new ServiceBusAdministrationClient(serviceBusNamespace, credential);

        // Get DLQ count for weather-jobs queue
        try
        {
            var queueProps = await adminClient.GetQueueRuntimePropertiesAsync("weather-jobs", cancellationToken);
            counts["weather-jobs"] = (int)queueProps.Value.DeadLetterMessageCount;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get DLQ count for queue weather-jobs");
            counts["weather-jobs"] = 0;
        }

        // Get DLQ count for nd-dashboard-events subscription
        try
        {
            var subProps = await adminClient.GetSubscriptionRuntimePropertiesAsync("nd-dashboard-events", "counter-updater", cancellationToken);
            counts["nd-dashboard-events/counter-updater"] = (int)subProps.Value.DeadLetterMessageCount;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get DLQ count for subscription counter-updater");
            counts["nd-dashboard-events/counter-updater"] = 0;
        }

        return counts;
    }
}
