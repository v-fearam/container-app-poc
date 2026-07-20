namespace WeatherApi.Models;

/// <summary>
/// Container Apps Job details returned by the Jobs API.
/// </summary>
public class ContainerJobDto
{
    /// <summary>
    /// Job name.
    /// </summary>
    public required string Name { get; set; }

    /// <summary>
    /// Trigger type (Schedule, Manual, Event).
    /// </summary>
    public required string Type { get; set; }

    /// <summary>
    /// CRON expression (for scheduled jobs).
    /// </summary>
    public string? CronExpression { get; set; }

    /// <summary>
    /// Last execution start time (UTC).
    /// </summary>
    public DateTimeOffset? LastExecutionTime { get; set; }

    /// <summary>
    /// Last execution status (Succeeded, Failed, Running, etc.).
    /// </summary>
    public string? LastExecutionStatus { get; set; }

    /// <summary>
    /// Number of messages to enqueue (read from MESSAGE_COUNT env var).
    /// </summary>
    public int? MessageCount { get; set; }
}

/// <summary>
/// Request payload for updating job schedule.
/// </summary>
public class UpdateScheduleRequest
{
    /// <summary>
    /// New CRON expression (5 fields: minute hour day month weekday).
    /// </summary>
    public required string CronExpression { get; set; }
}

/// <summary>
/// Response from updating job schedule.
/// </summary>
public class UpdateScheduleResponse
{
    /// <summary>
    /// Job name.
    /// </summary>
    public required string Name { get; set; }

    /// <summary>
    /// Updated CRON expression.
    /// </summary>
    public required string CronExpression { get; set; }

    /// <summary>
    /// Whether the update succeeded.
    /// </summary>
    public required bool Updated { get; set; }
}

/// <summary>
/// Response from manually triggering a job.
/// </summary>
public class TriggerJobResponse
{
    /// <summary>
    /// Job name.
    /// </summary>
    public required string Name { get; set; }

    /// <summary>
    /// Execution name (unique identifier for this run).
    /// </summary>
    public required string ExecutionName { get; set; }

    /// <summary>
    /// Execution status (Started, Running, etc.).
    /// </summary>
    public required string Status { get; set; }
}
