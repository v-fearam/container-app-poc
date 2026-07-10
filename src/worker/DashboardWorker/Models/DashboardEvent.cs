using System.Text.Json.Serialization;

namespace DashboardWorker.Models;

public record DashboardEvent
{
    [JsonPropertyName("eventType")]
    public string EventType { get; init; } = string.Empty; // "MessageEnqueued" | "MessageProcessed"
    
    [JsonPropertyName("vertical")]
    public string Vertical { get; init; } = string.Empty;
    
    [JsonPropertyName("queueName")]
    public string QueueName { get; init; } = string.Empty;
    
    [JsonPropertyName("processType")]
    public string ProcessType { get; init; } = string.Empty;
    
    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; init; }
    
    [JsonPropertyName("messageId")]
    public string MessageId { get; init; } = string.Empty;
}
