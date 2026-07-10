using Azure.Messaging.ServiceBus;
using DashboardWorker.Configuration;
using DashboardWorker.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using System.Diagnostics;
using System.Text.Json;

namespace DashboardWorker.Services;

public class DashboardWorkerService : BackgroundService
{
    private readonly ILogger<DashboardWorkerService> _logger;
    private readonly ServiceBusClient _serviceBusClient;
    private readonly ServiceBusOptions _sbOptions;
    private readonly SqlOptions _sqlOptions;
    private ServiceBusProcessor? _processor;

    public DashboardWorkerService(
        ILogger<DashboardWorkerService> logger,
        ServiceBusClient serviceBusClient,
        IOptions<ServiceBusOptions> sbOptions,
        IOptions<SqlOptions> sqlOptions)
    {
        _logger = logger;
        _serviceBusClient = serviceBusClient;
        _sbOptions = sbOptions.Value;
        _sqlOptions = sqlOptions.Value;
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
        using var connection = new SqlConnection(_sqlOptions.ConnectionString);
        await connection.OpenAsync(cancellationToken);

        // UPDATE-first pattern (concurrency-safe, avoids MERGE deadlocks)
        var updateQuery = evt.EventType == "MessageEnqueued"
            ? @"
                UPDATE dbo.QueueCounters
                SET EnqueuedCount = EnqueuedCount + 1, UpdatedAt = GETUTCDATE()
                WHERE Vertical = @Vertical AND QueueName = @QueueName AND ProcessType = @ProcessType AND Date = @Date"
            : @"
                UPDATE dbo.QueueCounters
                SET ProcessedCount = ProcessedCount + 1, UpdatedAt = GETUTCDATE()
                WHERE Vertical = @Vertical AND QueueName = @QueueName AND ProcessType = @ProcessType AND Date = @Date";

        using var updateCmd = new SqlCommand(updateQuery, connection);
        updateCmd.Parameters.AddWithValue("@Vertical", evt.Vertical);
        updateCmd.Parameters.AddWithValue("@QueueName", evt.QueueName);
        updateCmd.Parameters.AddWithValue("@ProcessType", evt.ProcessType);
        updateCmd.Parameters.AddWithValue("@Date", evt.Timestamp.Date);

        var rowsAffected = await updateCmd.ExecuteNonQueryAsync(cancellationToken);

        if (rowsAffected == 0)
        {
            // Row doesn't exist yet — INSERT
            var insertQuery = @"
                INSERT INTO dbo.QueueCounters (Vertical, QueueName, ProcessType, Date, EnqueuedCount, ProcessedCount, CreatedAt, UpdatedAt)
                VALUES (@Vertical, @QueueName, @ProcessType, @Date, @EnqueuedCount, @ProcessedCount, GETUTCDATE(), GETUTCDATE())";

            using var insertCmd = new SqlCommand(insertQuery, connection);
            insertCmd.Parameters.AddWithValue("@Vertical", evt.Vertical);
            insertCmd.Parameters.AddWithValue("@QueueName", evt.QueueName);
            insertCmd.Parameters.AddWithValue("@ProcessType", evt.ProcessType);
            insertCmd.Parameters.AddWithValue("@Date", evt.Timestamp.Date);
            insertCmd.Parameters.AddWithValue("@EnqueuedCount", evt.EventType == "MessageEnqueued" ? 1 : 0);
            insertCmd.Parameters.AddWithValue("@ProcessedCount", evt.EventType == "MessageProcessed" ? 1 : 0);

            try
            {
                await insertCmd.ExecuteNonQueryAsync(cancellationToken);
            }
            catch (SqlException ex) when (ex.Number == 2627) // Unique constraint violation
            {
                // Another worker inserted between our UPDATE and INSERT — retry UPDATE
                _logger.LogDebug("Unique constraint violation during INSERT. Retrying UPDATE.");
                rowsAffected = await updateCmd.ExecuteNonQueryAsync(cancellationToken);
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
