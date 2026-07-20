namespace DashboardWorker.Data.Entities;

/// <summary>
/// Hourly aggregated counters for Container Apps Jobs executions.
/// Tracks execution counts per job per date per hour.
/// </summary>
public class JobExecution
{
    /// <summary>
    /// Synthetic ID (auto-incremental).
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// Container App Job name (e.g., "weather-enqueuer").
    /// </summary>
    public required string JobName { get; set; }

    /// <summary>
    /// Date for this counter (UTC, date-only).
    /// </summary>
    public DateTime Date { get; set; }

    /// <summary>
    /// Hour of day (0-23).
    /// </summary>
    public int Hour { get; set; }

    /// <summary>
    /// Number of times the job executed in this hour.
    /// </summary>
    public int ExecutionCount { get; set; }

    public DateTime UpdatedAt { get; set; }
}
