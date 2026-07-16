using Azure.Messaging.ServiceBus;

namespace WeatherWorker.Services;

/// <summary>
/// Publishes dashboard events (MessageEnqueued, MessageProcessed) to the dashboard topic.
/// Encapsulates message formatting and fire-and-forget error handling.
/// </summary>
public interface IDashboardEventPublisher
{
    Task PublishMessageProcessedAsync(string vertical, string queueName, string processType, string messageId, CancellationToken cancellationToken = default);
    Task PublishMessageEnqueuedAsync(string vertical, string queueName, string processType, string messageId, CancellationToken cancellationToken = default);
}

public sealed class DashboardEventPublisher(
    ServiceBusSender topicSender,
    ILogger<DashboardEventPublisher> logger) : IDashboardEventPublisher
{
    public Task PublishMessageProcessedAsync(string vertical, string queueName, string processType, string messageId, CancellationToken cancellationToken = default)
        => PublishEventAsync("MessageProcessed", vertical, queueName, processType, messageId, cancellationToken);

    public Task PublishMessageEnqueuedAsync(string vertical, string queueName, string processType, string messageId, CancellationToken cancellationToken = default)
        => PublishEventAsync("MessageEnqueued", vertical, queueName, processType, messageId, cancellationToken);

    private async Task PublishEventAsync(string eventType, string vertical, string queueName, string processType, string messageId, CancellationToken cancellationToken)
    {
        try
        {
            var payload = System.Text.Json.JsonSerializer.Serialize(new
            {
                eventType,
                vertical,
                queueName,
                processType,
                timestamp = DateTime.UtcNow,
                messageId
            });

            await topicSender.SendMessageAsync(new ServiceBusMessage(payload)
            {
                ContentType = "application/json",
                Subject = eventType,
                ApplicationProperties = { ["eventType"] = eventType, ["vertical"] = vertical }
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to publish {EventType} event for message {MessageId}", eventType, messageId);
        }
    }
}
