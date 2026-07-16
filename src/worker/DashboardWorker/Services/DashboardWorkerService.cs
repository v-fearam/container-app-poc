using Azure.Messaging.ServiceBus;
using DashboardWorker.Configuration;
using DashboardWorker.Models;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace DashboardWorker.Services;

/// <summary>
/// BackgroundService responsible for Service Bus processor lifecycle only.
/// Delegates all business logic to IDashboardEventHandler.
/// </summary>
public class DashboardWorkerService(
    ILogger<DashboardWorkerService> logger,
    ServiceBusClient serviceBusClient,
    IOptions<ServiceBusOptions> sbOptions,
    IDashboardEventHandler eventHandler) : BackgroundService
{
    private readonly ServiceBusOptions _sbOptions = sbOptions.Value;
    private ServiceBusProcessor? _processor;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Dashboard Worker starting for topic={Topic} subscription={Subscription}",
            _sbOptions.TopicName, _sbOptions.SubscriptionName);

        _processor = serviceBusClient.CreateProcessor(_sbOptions.TopicName, _sbOptions.SubscriptionName, new ServiceBusProcessorOptions
        {
            AutoCompleteMessages = false,
            MaxConcurrentCalls = 5,
            PrefetchCount = 10
        });

        _processor.ProcessMessageAsync += ProcessMessageAsync;
        _processor.ProcessErrorAsync += ProcessErrorAsync;

        await _processor.StartProcessingAsync(stoppingToken);
        logger.LogInformation("Dashboard Worker started successfully");

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (TaskCanceledException)
        {
            logger.LogInformation("Dashboard Worker received shutdown signal");
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Dashboard Worker stopping gracefully...");

        if (_processor != null)
        {
            await _processor.StopProcessingAsync(cancellationToken);
            await _processor.DisposeAsync();
        }

        await base.StopAsync(cancellationToken);
        logger.LogInformation("Dashboard Worker stopped");
    }

    private async Task ProcessMessageAsync(ProcessMessageEventArgs args)
    {
        var messageBody = args.Message.Body.ToString();

        try
        {
            logger.LogInformation("Processing dashboard event. MessageId={MessageId} DeliveryCount={DeliveryCount}",
                args.Message.MessageId, args.Message.DeliveryCount);

            var dashboardEvent = JsonSerializer.Deserialize<DashboardEvent>(messageBody);
            if (dashboardEvent == null)
            {
                await args.DeadLetterMessageAsync(args.Message, "DeserializationFailed",
                    "Could not deserialize message body to DashboardEvent", args.CancellationToken);
                return;
            }

            var result = await eventHandler.HandleAsync(dashboardEvent, args.CancellationToken);
            await SettleMessageAsync(args, result, dashboardEvent);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error processing dashboard event. MessageId={MessageId} DeliveryCount={DeliveryCount}",
                args.Message.MessageId, args.Message.DeliveryCount);

            await args.AbandonMessageAsync(args.Message, cancellationToken: args.CancellationToken);
        }
    }

    private async Task SettleMessageAsync(ProcessMessageEventArgs args, MessageHandleResult result, DashboardEvent evt)
    {
        switch (result.Settlement)
        {
            case MessageSettlement.Complete:
                await args.CompleteMessageAsync(args.Message, args.CancellationToken);
                logger.LogInformation("Dashboard event completed. EventType={EventType} Vertical={Vertical} Queue={Queue}",
                    evt.EventType, evt.Vertical, evt.QueueName);
                break;

            case MessageSettlement.DeadLetter:
                await args.DeadLetterMessageAsync(args.Message, result.DeadLetterReason,
                    result.DeadLetterDescription, args.CancellationToken);
                break;

            case MessageSettlement.Abandon:
                await args.AbandonMessageAsync(args.Message, cancellationToken: args.CancellationToken);
                break;
        }
    }

    private Task ProcessErrorAsync(ProcessErrorEventArgs args)
    {
        logger.LogError(args.Exception, "Service Bus processor error. Source={ErrorSource}", args.ErrorSource);
        return Task.CompletedTask;
    }
}

