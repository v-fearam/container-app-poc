using Azure.Messaging.ServiceBus;
using DashboardWorker.Configuration;
using DashboardWorker.Data;
using DashboardWorker.Data.Entities;
using DashboardWorker.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Diagnostics;
using System.Text.Json;

namespace DashboardWorker.Services;

public class DashboardWorkerService : BackgroundService
{
    private readonly ILogger<DashboardWorkerService> _logger;
    private readonly ServiceBusClient _serviceBusClient;
    private readonly ServiceBusOptions _sbOptions;
    private readonly IDbContextFactory<DashboardDbContext> _dbContextFactory;
    private ServiceBusProcessor? _processor;

    public DashboardWorkerService(
        ILogger<DashboardWorkerService> logger,
        ServiceBusClient serviceBusClient,
        IOptions<ServiceBusOptions> sbOptions,
        IDbContextFactory<DashboardDbContext> dbContextFactory)
    {
        _logger = logger;
        _serviceBusClient = serviceBusClient;
        _sbOptions = sbOptions.Value;
        _dbContextFactory = dbContextFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Dashboard Worker starting for topic={Topic} subscription={Subscription}", 
            _sbOptions.TopicName, _sbOptions.SubscriptionName);

        _processor = _serviceBusClient.CreateProcessor(_sbOptions.TopicName, _sbOptions.SubscriptionName, new ServiceBusProcessorOptions
        {
            AutoCompleteMessages = false,
            MaxConcurrentCalls = 5,
            PrefetchCount = 10
        });

        _processor.ProcessMessageAsync += ProcessMessageAsync;
        _processor.ProcessErrorAsync += ProcessErrorAsync;

        await _processor.StartProcessingAsync(stoppingToken);

        _logger.LogInformation("Dashboard Worker started successfully");

        // Keep alive until cancellation
        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (TaskCanceledException)
        {
            _logger.LogInformation("Dashboard Worker received shutdown signal");
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Dashboard Worker stopping gracefully...");

        if (_processor != null)
        {
            await _processor.StopProcessingAsync(cancellationToken);
            await _processor.DisposeAsync();
        }

        await base.StopAsync(cancellationToken);
        _logger.LogInformation("Dashboard Worker stopped");
    }

    private async Task ProcessMessageAsync(ProcessMessageEventArgs args)
    {
        var activity = Activity.Current;
        var messageBody = args.Message.Body.ToString();

        try
        {
            _logger.LogInformation("Processing dashboard event. MessageId={MessageId} DeliveryCount={DeliveryCount}",
                args.Message.MessageId, args.Message.DeliveryCount);

            var dashboardEvent = JsonSerializer.Deserialize<DashboardEvent>(messageBody);
            if (dashboardEvent == null)
            {
                _logger.LogWarning("Failed to deserialize dashboard event. Dead-lettering message.");
                await args.DeadLetterMessageAsync(args.Message, "DeserializationFailed",
                    "Could not deserialize message body to DashboardEvent", args.CancellationToken);
                return;
            }

            switch (dashboardEvent.EventType)
            {
                case "MessageEnqueued":
                case "MessageProcessed":
                    await UpsertCounterAsync(dashboardEvent, args.CancellationToken);
                    await args.CompleteMessageAsync(args.Message, args.CancellationToken);
                    _logger.LogInformation("Dashboard event processed. EventType={EventType} Vertical={Vertical} Queue={Queue}",
                        dashboardEvent.EventType, dashboardEvent.Vertical, dashboardEvent.QueueName);
                    break;

                default:
                    _logger.LogWarning("Unknown EventType={EventType}. Dead-lettering message.", dashboardEvent.EventType);
                    await args.DeadLetterMessageAsync(args.Message, "UnknownEventType",
                        $"EventType '{dashboardEvent.EventType}' is not recognized", args.CancellationToken);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing dashboard event. MessageId={MessageId} DeliveryCount={DeliveryCount}",
                args.Message.MessageId, args.Message.DeliveryCount);

            await args.AbandonMessageAsync(args.Message, cancellationToken: args.CancellationToken);
        }
    }

    private async Task UpsertCounterAsync(DashboardEvent evt, CancellationToken cancellationToken)
    {
        await using var dbContext = await _dbContextFactory.CreateDbContextAsync(cancellationToken);

        var date = evt.Timestamp.Date;
        var filter = dbContext.QueueCounters
            .Where(q => q.Vertical == evt.Vertical && q.QueueName == evt.QueueName && q.ProcessType == evt.ProcessType && q.Date == date);

        var rowsAffected = evt.EventType switch
        {
            "MessageEnqueued" => await filter.ExecuteUpdateAsync(q => q
                .SetProperty(x => x.EnqueuedCount, x => x.EnqueuedCount + 1)
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken),

            "MessageProcessed" => await filter.ExecuteUpdateAsync(q => q
                .SetProperty(x => x.ProcessedCount, x => x.ProcessedCount + 1)
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken),

            _ => throw new InvalidOperationException($"Unexpected EventType: {evt.EventType}")
        };

        if (rowsAffected == 0)
        {
            var counter = new QueueCounter
            {
                Vertical = evt.Vertical,
                QueueName = evt.QueueName,
                ProcessType = evt.ProcessType,
                Date = date,
                EnqueuedCount = evt.EventType == "MessageEnqueued" ? 1 : 0,
                ProcessedCount = evt.EventType == "MessageProcessed" ? 1 : 0,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            dbContext.QueueCounters.Add(counter);

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx && sqlEx.Number == 2627)
            {
                _logger.LogDebug("Unique constraint violation during INSERT. Retrying UPDATE.");

                await using var retryDbContext = await _dbContextFactory.CreateDbContextAsync(cancellationToken);
                var retryFilter = retryDbContext.QueueCounters
                    .Where(q => q.Vertical == evt.Vertical && q.QueueName == evt.QueueName && q.ProcessType == evt.ProcessType && q.Date == date);

                _ = evt.EventType switch
                {
                    "MessageEnqueued" => await retryFilter.ExecuteUpdateAsync(q => q
                        .SetProperty(x => x.EnqueuedCount, x => x.EnqueuedCount + 1)
                        .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken),

                    "MessageProcessed" => await retryFilter.ExecuteUpdateAsync(q => q
                        .SetProperty(x => x.ProcessedCount, x => x.ProcessedCount + 1)
                        .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken),

                    _ => 0
                };
            }
        }
    }

    private Task ProcessErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception, "Service Bus processor error. Source={ErrorSource}", args.ErrorSource);
        return Task.CompletedTask;
    }
}
