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
    private readonly IServiceScopeFactory _scopeFactory;
    private ServiceBusProcessor? _processor;

    public DashboardWorkerService(
        ILogger<DashboardWorkerService> logger,
        ServiceBusClient serviceBusClient,
        IOptions<ServiceBusOptions> sbOptions,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _serviceBusClient = serviceBusClient;
        _sbOptions = sbOptions.Value;
        _scopeFactory = scopeFactory;
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

            // Parse event
            var dashboardEvent = JsonSerializer.Deserialize<DashboardEvent>(messageBody);
            if (dashboardEvent == null)
            {
                _logger.LogWarning("Failed to deserialize dashboard event. Completing message to avoid infinite retry.");
                await args.CompleteMessageAsync(args.Message, args.CancellationToken);
                return;
            }

            // UPSERT counter in SQL (concurrency-safe)
            await UpsertCounterAsync(dashboardEvent, args.CancellationToken);

            // Complete message (remove from subscription)
            await args.CompleteMessageAsync(args.Message, args.CancellationToken);

            _logger.LogInformation("Dashboard event processed successfully. EventType={EventType} Vertical={Vertical} Queue={Queue} ProcessType={ProcessType}",
                dashboardEvent.EventType, dashboardEvent.Vertical, dashboardEvent.QueueName, dashboardEvent.ProcessType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing dashboard event. MessageId={MessageId} DeliveryCount={DeliveryCount}",
                args.Message.MessageId, args.Message.DeliveryCount);

            // Abandon message (will be redelivered or go to DLQ after max delivery count)
            await args.AbandonMessageAsync(args.Message, cancellationToken: args.CancellationToken);
        }
    }

    private async Task UpsertCounterAsync(DashboardEvent evt, CancellationToken cancellationToken)
    {
        // Create scope to get DbContext (scoped lifetime)
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<DashboardDbContext>();

        var date = evt.Timestamp.Date;

        // EF Core: Try UPDATE first (concurrency-safe, avoids MERGE deadlocks)
        var rowsAffected = evt.EventType == "MessageEnqueued"
            ? await dbContext.QueueCounters
                .Where(q => q.Vertical == evt.Vertical && q.QueueName == evt.QueueName && q.ProcessType == evt.ProcessType && q.Date == date)
                .ExecuteUpdateAsync(q => q
                    .SetProperty(x => x.EnqueuedCount, x => x.EnqueuedCount + 1)
                    .SetProperty(x => x.UpdatedAt, DateTime.UtcNow),
                    cancellationToken)
            : await dbContext.QueueCounters
                .Where(q => q.Vertical == evt.Vertical && q.QueueName == evt.QueueName && q.ProcessType == evt.ProcessType && q.Date == date)
                .ExecuteUpdateAsync(q => q
                    .SetProperty(x => x.ProcessedCount, x => x.ProcessedCount + 1)
                    .SetProperty(x => x.UpdatedAt, DateTime.UtcNow),
                    cancellationToken);

        if (rowsAffected == 0)
        {
            // Row doesn't exist yet — INSERT
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
                // Another worker inserted between our UPDATE and INSERT — retry UPDATE
                _logger.LogDebug("Unique constraint violation during INSERT. Retrying UPDATE.");
                
                // Create new scope for retry (previous context may be in bad state)
                using var retryScope = _scopeFactory.CreateScope();
                var retryDbContext = retryScope.ServiceProvider.GetRequiredService<DashboardDbContext>();
                
                rowsAffected = evt.EventType == "MessageEnqueued"
                    ? await retryDbContext.QueueCounters
                        .Where(q => q.Vertical == evt.Vertical && q.QueueName == evt.QueueName && q.ProcessType == evt.ProcessType && q.Date == date)
                        .ExecuteUpdateAsync(q => q
                            .SetProperty(x => x.EnqueuedCount, x => x.EnqueuedCount + 1)
                            .SetProperty(x => x.UpdatedAt, DateTime.UtcNow),
                            cancellationToken)
                    : await retryDbContext.QueueCounters
                        .Where(q => q.Vertical == evt.Vertical && q.QueueName == evt.QueueName && q.ProcessType == evt.ProcessType && q.Date == date)
                        .ExecuteUpdateAsync(q => q
                            .SetProperty(x => x.ProcessedCount, x => x.ProcessedCount + 1)
                            .SetProperty(x => x.UpdatedAt, DateTime.UtcNow),
                            cancellationToken);
                
                if (rowsAffected == 0)
                {
                    _logger.LogWarning("Retry UPDATE also failed. Counter may be inconsistent.");
                }
            }
        }
    }

    private Task ProcessErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception, "Service Bus processor error. Source={ErrorSource}", args.ErrorSource);
        return Task.CompletedTask;
    }
}
