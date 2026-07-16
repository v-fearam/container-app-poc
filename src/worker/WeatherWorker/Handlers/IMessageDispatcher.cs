using Azure.Messaging.ServiceBus;

namespace WeatherWorker.Handlers;

/// <summary>
/// Contract for dispatching incoming Service Bus messages to the appropriate handler.
/// </summary>
public interface IMessageDispatcher
{
    Task DispatchAsync(ProcessMessageEventArgs args, CancellationToken cancellationToken);
}
