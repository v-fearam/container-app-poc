using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Options;
using WeatherWorker.Configuration;

namespace WeatherWorker.Handlers;

/// <summary>
/// Default handler — simulates work with a random delay and completes the message.
/// </summary>
public sealed class DefaultMessageHandler(
    ILogger<DefaultMessageHandler> logger,
    IOptions<WorkerOptions> options) : IMessageHandler
{
    public async Task<bool> HandleAsync(WeatherJobMessage message, ProcessMessageEventArgs args, CancellationToken cancellationToken)
    {
        var opts = options.Value;
        var delay = Random.Shared.Next(opts.MinProcessingDelayMs, opts.MaxProcessingDelayMs + 1);

        logger.LogInformation("Mensaje #{Number} — procesando ({Delay}ms)", message.Number, delay);
        await Task.Delay(delay, cancellationToken);

        await args.CompleteMessageAsync(args.Message, cancellationToken);
        logger.LogInformation("Mensaje #{Number} completado exitosamente", message.Number);
        return true;
    }
}
