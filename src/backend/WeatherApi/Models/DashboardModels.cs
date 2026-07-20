namespace WeatherApi.Models;

/// <summary>
/// Response model for Dashboard KPI endpoint
/// </summary>
public record DashboardKpiResponse
{
    public required string Vertical { get; init; }
    public required string QueueName { get; init; }
    public required string ProcessType { get; init; }
    public DateTime Date { get; init; }
    public int EnqueuedCount { get; init; }
    public int ProcessedCount { get; init; }
    public int DeadLetterCount { get; init; }
    public int DiscardedCount { get; init; }
    /// <summary>
    /// The Service Bus path to use for DLQ operations (queue name or topic/subscription)
    /// </summary>
    public string? DlqPath { get; init; }
}

/// <summary>
/// Dead letter queue message details
/// </summary>
public record DlqMessageDto
{
    public required string MessageId { get; init; }
    public required string DeadLetterReason { get; init; }
    public required string DeadLetterErrorDescription { get; init; }
    public DateTime EnqueuedTimeUtc { get; init; }
    public int DeliveryCount { get; init; }
    public required string BodyJson { get; init; }
    public required string QueueName { get; init; }
}

/// <summary>
/// Request to requeue a DLQ message (with optional edits)
/// </summary>
public record RequeueDlqMessageRequest
{
    public required string MessageId { get; init; }
    public required string QueueName { get; init; }
    public string? EditedBodyJson { get; init; } // null = requeue as-is
}

/// <summary>
/// Request to discard (complete) a DLQ message
/// </summary>
public record DiscardDlqMessageRequest
{
    public required string MessageId { get; init; }
    public required string QueueName { get; init; }
}

/// <summary>
/// Job Execution counter DTO for dashboard API.
/// </summary>
public record JobExecutionCounterDto
{
    public required string JobName { get; init; }
    public DateTime Date { get; init; }
    public int TotalExecutions { get; init; }
    public int HoursWithExecutions { get; init; }
}
