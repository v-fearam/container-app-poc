using System.Text.Json.Serialization;

namespace DashboardWorker.Models;

public record DashboardEvent
{
    [JsonPropertyName("eventType")]
    public string EventType { get; init; } = string.Empty; // "MessageEnqueued" | "MessageProcessed" | "ChangeFeedProcessed" | "ChangeFeedError"
    
    [JsonPropertyName("vertical")]
    public string Vertical { get; init; } = string.Empty;
    
    [JsonPropertyName("queueName")]
    public string? QueueName { get; init; } // Only for queue events
    
    [JsonPropertyName("processType")]
    public string? ProcessType { get; init; } // Only for queue events
    
    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; init; }
    
    [JsonPropertyName("messageId")]
    public string? MessageId { get; init; } // Only for queue events
    
    // ─── Change Feed specific fields ────────────────────────────────────────
    
    [JsonPropertyName("collection")]
    public string? Collection { get; init; } // Only for Change Feed events
    
    [JsonPropertyName("documentId")]
    public string? DocumentId { get; init; } // Only for Change Feed events
    
    [JsonPropertyName("processedBy")]
    public string? ProcessedBy { get; init; } // Only for Change Feed events
    
    [JsonPropertyName("errorMessage")]
    public string? ErrorMessage { get; init; } // Only for ChangeFeedError events
}
