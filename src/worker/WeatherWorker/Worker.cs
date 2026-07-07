using System.Text.Json;
using Azure.Messaging.ServiceBus;

namespace WeatherWorker;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly ServiceBusClient _client;
    private readonly IConfiguration _config;
    private ServiceBusProcessor? _processor;

    public Worker(ILogger<Worker> logger, ServiceBusClient client, IConfiguration config)
    {
        _logger = logger;
        _client = client;
        _config = config;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var queueName = _config["ServiceBus:QueueName"]
            ?? Environment.GetEnvironmentVariable("ServiceBus__QueueName")
            ?? "weather-jobs";

        _processor = _client.CreateProcessor(queueName, new ServiceBusProcessorOptions
        {
            AutoCompleteMessages = false,
            MaxConcurrentCalls = 5,
            PrefetchCount = 10
        });

        _processor.ProcessMessageAsync += ProcessMessage;
        _processor.ProcessErrorAsync += ProcessError;

        _logger.LogInformation("Worker starting — listening on queue '{Queue}'", queueName);
        await _processor.StartProcessingAsync(stoppingToken);

        // Keep alive until cancellation
        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    private async Task ProcessMessage(ProcessMessageEventArgs args)
    {
        var body = args.Message.Body.ToString();
        int number = 0;

        try
        {
            var doc = JsonDocument.Parse(body);
            number = doc.RootElement.GetProperty("number").GetInt32();
        }
        catch
        {
            _logger.LogWarning("Could not parse message body: {Body}", body);
            await args.CompleteMessageAsync(args.Message);
            return;
        }

        _logger.LogInformation(
            "Procesando mensaje #{Number} | DeliveryCount={DeliveryCount} | EnqueuedTime={Enqueued}",
            number, args.Message.DeliveryCount, args.Message.EnqueuedTime);

        switch (number)
        {
            case 10:
                // Simulate unhandled failure — Service Bus retries up to maxDeliveryCount then DLQ
                _logger.LogError("Mensaje #{Number} — simulando fallo no controlado (intento {Count}/3)", number, args.Message.DeliveryCount);
                throw new InvalidOperationException($"Simulated processing failure for message #{number}");

            case 20:
                // Explicit DLQ — business validation failure
                await args.DeadLetterMessageAsync(args.Message,
                    deadLetterReason: "ValidationFailed",
                    deadLetterErrorDescription: "Validation failed: invalid parameter value in message #20");
                _logger.LogWarning("Mensaje #{Number} enviado a DLQ por validación de negocio", number);
                return;

            case 30:
                // Simulate lock timeout — sleep longer than lock duration (5min)
                _logger.LogWarning("Mensaje #{Number} simulando timeout largo (10min > lock 5min)...", number);
                await Task.Delay(TimeSpan.FromMinutes(10), args.CancellationToken);
                break;

            default:
                // Normal processing — random delay 1-30s
                var delay = Random.Shared.Next(1000, 30001);
                _logger.LogInformation("Mensaje #{Number} — trabajando {Delay}ms", number, delay);
                await Task.Delay(delay, args.CancellationToken);
                break;
        }

        await args.CompleteMessageAsync(args.Message);
        _logger.LogInformation("Mensaje #{Number} completado exitosamente", number);
    }

    private Task ProcessError(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception,
            "Error en Service Bus — Source={Source}, Entity={Entity}",
            args.ErrorSource, args.EntityPath);
        return Task.CompletedTask;
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Worker stopping — draining processor...");
        if (_processor != null)
        {
            await _processor.StopProcessingAsync(cancellationToken);
            await _processor.DisposeAsync();
        }
        await base.StopAsync(cancellationToken);
    }
}
