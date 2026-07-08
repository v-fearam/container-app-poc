using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Options;

namespace WeatherWorker.Handlers;

/// <summary>
/// DLQ simulation handlers for testing dead-letter scenarios.
/// Each handler demonstrates a different DLQ pattern.
/// </summary>
public static class DlqSimulationHandlers
{
    /// <summary>
    /// Simulates an unhandled exception — Service Bus will retry up to maxDeliveryCount,
    /// then auto-move to DLQ.
    /// </summary>
    public sealed class UnhandledExceptionHandler(ILogger<UnhandledExceptionHandler> logger) : IMessageHandler
    {
        public Task<bool> HandleAsync(WeatherJobMessage message, ProcessMessageEventArgs args, CancellationToken cancellationToken)
        {
            logger.LogError(
                "Mensaje #{Number} — simulando fallo no controlado (intento {Count}/{Max})",
                message.Number, args.Message.DeliveryCount, 3);

            throw new InvalidOperationException(
                $"Simulated unhandled failure for message #{message.Number}");
        }
    }

    /// <summary>
    /// Simulates a business validation failure — explicitly sends the message to DLQ
    /// with a reason and description for debugging.
    /// </summary>
    public sealed class ValidationFailureHandler(ILogger<ValidationFailureHandler> logger) : IMessageHandler
    {
        public async Task<bool> HandleAsync(WeatherJobMessage message, ProcessMessageEventArgs args, CancellationToken cancellationToken)
        {
            await args.DeadLetterMessageAsync(
                args.Message,
                deadLetterReason: "ValidationFailed",
                deadLetterErrorDescription: $"Business validation failed for message #{message.Number}: invalid parameter value",
                cancellationToken: cancellationToken);

            logger.LogWarning("Mensaje #{Number} enviado a DLQ por validación de negocio", message.Number);
            return true;
        }
    }

    /// <summary>
    /// Simulates a lock timeout — holds the message longer than the queue's lock duration,
    /// causing Service Bus to make it available for redelivery.
    /// </summary>
    public sealed class LockTimeoutHandler(
        ILogger<LockTimeoutHandler> logger,
        IOptions<Configuration.WorkerOptions> options) : IMessageHandler
    {
        public async Task<bool> HandleAsync(WeatherJobMessage message, ProcessMessageEventArgs args, CancellationToken cancellationToken)
        {
            var minutes = options.Value.LockTimeoutSimulationMinutes;
            logger.LogWarning(
                "Mensaje #{Number} — simulando timeout ({Minutes}min > lock duration)",
                message.Number, minutes);

            await Task.Delay(TimeSpan.FromMinutes(minutes), cancellationToken);

            await args.CompleteMessageAsync(args.Message, cancellationToken);
            return true;
        }
    }
}
