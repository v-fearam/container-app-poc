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
/// Component health status
/// </summary>
public record ComponentHealthDto
{
    public required string ComponentName { get; init; }
    public required string Status { get; init; }
    public DateTime LastHeartbeat { get; init; }
    public string? Metadata { get; init; }
}
