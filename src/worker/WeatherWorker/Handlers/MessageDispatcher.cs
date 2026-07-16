using Azure.Messaging.ServiceBus;

namespace WeatherWorker.Handlers;

/// <summary>
/// Routes incoming messages to the appropriate handler based on message content.
/// Acts as a Mediator between the Service Bus processor and message handlers.
/// </summary>
public sealed class MessageDispatcher(
    ILogger<MessageDispatcher> logger,
    DefaultMessageHandler defaultHandler,
    DlqSimulationHandlers.UnhandledExceptionHandler exceptionHandler,
    DlqSimulationHandlers.ValidationFailureHandler validationHandler,
    DlqSimulationHandlers.LockTimeoutHandler lockTimeoutHandler) : IMessageDispatcher
{
    // Message numbers that trigger DLQ simulations
    private const int ExceptionTrigger = 10;
    private const int ValidationTrigger = 20;
    private const int LockTimeoutTrigger = 30;

    /// <summary>
    /// Dispatches a raw message to the correct handler based on its parsed content.
    /// </summary>
    public async Task DispatchAsync(ProcessMessageEventArgs args, CancellationToken cancellationToken)
    {
        var body = args.Message.Body.ToString();

        if (!WeatherJobMessage.TryParse(body, out var message) || message is null)
        {
            logger.LogWarning("Could not parse message body — completing to avoid poison loop: {Body}", body);
            await args.CompleteMessageAsync(args.Message, cancellationToken);
            return;
        }

        logger.LogInformation(
            "Recibido mensaje #{Number} | DeliveryCount={DeliveryCount} | EnqueuedTime={Enqueued}",
            message.Number, args.Message.DeliveryCount, args.Message.EnqueuedTime);

        IMessageHandler handler = message.Number switch
        {
            ExceptionTrigger => exceptionHandler,
            ValidationTrigger => validationHandler,
            LockTimeoutTrigger => lockTimeoutHandler,
            _ => defaultHandler
        };

        await handler.HandleAsync(message, args, cancellationToken);
    }
}
