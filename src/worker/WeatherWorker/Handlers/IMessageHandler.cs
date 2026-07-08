using Azure.Messaging.ServiceBus;

namespace WeatherWorker.Handlers;

/// <summary>
/// Contract for handling a single message from the queue.
/// Implementations encapsulate all processing logic and message disposition
/// (complete, dead-letter, or abandon).
/// </summary>
public interface IMessageHandler
{
    /// <summary>
    /// Processes a message and decides its final disposition.
    /// </summary>
    /// <param name="message">Parsed message payload</param>
    /// <param name="args">Service Bus event args for completing/dead-lettering</param>
    /// <param name="cancellationToken">Cancellation token for graceful shutdown</param>
    /// <returns>True if the message was handled (completed/dead-lettered); false to let it be abandoned</returns>
    Task<bool> HandleAsync(WeatherJobMessage message, ProcessMessageEventArgs args, CancellationToken cancellationToken);
}
