using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Options;
using WeatherWorker.Configuration;
using WeatherWorker.Handlers;

namespace WeatherWorker.Services;

/// <summary>
/// Background service that manages the Service Bus processor lifecycle.
/// Follows Single Responsibility: only starts/stops the processor and wires events.
/// All message processing logic is delegated to <see cref="MessageDispatcher"/>.
/// </summary>
public sealed class ServiceBusWorker : BackgroundService, IAsyncDisposable
{
    private readonly ILogger<ServiceBusWorker> _logger;
    private readonly ServiceBusClient _client;
    private readonly ServiceBusOptions _options;
    private readonly MessageDispatcher _dispatcher;
    private ServiceBusProcessor? _processor;

    public ServiceBusWorker(
        ILogger<ServiceBusWorker> logger,
        ServiceBusClient client,
        IOptions<ServiceBusOptions> options,
        MessageDispatcher dispatcher)
    {
        _logger = logger;
        _client = client;
        _options = options.Value;
        _dispatcher = dispatcher;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _processor = _client.CreateProcessor(_options.QueueName, new ServiceBusProcessorOptions
        {
            AutoCompleteMessages = false,
            MaxConcurrentCalls = _options.MaxConcurrentCalls,
            PrefetchCount = _options.PrefetchCount
        });

        _processor.ProcessMessageAsync += args => _dispatcher.DispatchAsync(args, stoppingToken);
        _processor.ProcessErrorAsync += HandleErrorAsync;

        _logger.LogInformation(
            "Worker starting — queue='{Queue}', concurrency={Concurrency}, prefetch={Prefetch}",
            _options.QueueName, _options.MaxConcurrentCalls, _options.PrefetchCount);

        await _processor.StartProcessingAsync(stoppingToken);

        // Keep alive until shutdown is requested
        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            // Expected on graceful shutdown
        }
    }

    private Task HandleErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception,
            "Service Bus error — Source={Source}, Entity={Entity}, Namespace={Namespace}",
            args.ErrorSource, args.EntityPath, args.FullyQualifiedNamespace);
        return Task.CompletedTask;
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Worker stopping — draining in-flight messages...");

        if (_processor is not null)
        {
            await _processor.StopProcessingAsync(cancellationToken);
        }

        await base.StopAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (_processor is not null)
        {
            await _processor.DisposeAsync();
            _processor = null;
        }
    }
}
