using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace WeatherEnqueuer.Services;

public class EnqueuerService(
    ServiceBusClient serviceBusClient,
    IConfiguration configuration,
    ILogger<EnqueuerService> logger) : IEnqueuerService
{
    public async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        Console.WriteLine("=== WeatherEnqueuer starting ===");
        
        var queueName = configuration["WEATHER_QUEUE_NAME"] ?? "weather-jobs";
        var topicName = configuration["DASHBOARD_TOPIC_NAME"] ?? "nd-dashboard-events";
        var messageCountStr = configuration["MESSAGE_COUNT"] ?? "1000";
        var jobName = configuration["JOB_NAME"] ?? "weather-enqueuer";
        var vertical = configuration["VERTICAL"] ?? "Negocio";

        Console.WriteLine($"Config - Queue: {queueName}, Topic: {topicName}, Count: {messageCountStr}, Vertical: {vertical}");

        if (!int.TryParse(messageCountStr, out var messageCount) || messageCount <= 0)
        {
            throw new InvalidOperationException($"Invalid MESSAGE_COUNT: {messageCountStr}. Must be a positive integer.");
        }

        logger.LogInformation("Starting job: {JobName}", jobName);
        logger.LogInformation("Queue: {QueueName}, Topic: {TopicName}, Message Count: {MessageCount}, Vertical: {Vertical}",
            queueName, topicName, messageCount, vertical);

        var executedAt = DateTime.UtcNow;

        Console.WriteLine("Creating Service Bus senders...");
        await using var queueSender = serviceBusClient.CreateSender(queueName);
        Console.WriteLine("Queue sender created");
        
        await using var topicSender = serviceBusClient.CreateSender(topicName);
        Console.WriteLine("Topic sender created");

        var sent = 0;
        
        try
        {
            // Send messages to weather-jobs queue (same format as ServiceBusEnqueuer)
            logger.LogInformation("Sending {MessageCount} messages to {QueueName}...", messageCount, queueName);
            
            for (int i = 1; i <= messageCount; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                // Random processType: "Aviso de Deuda" o "Aviso de Corte"
                var processType = Random.Shared.Next(0, 2) == 0 ? "Aviso de Deuda" : "Aviso de Corte";

                var payload = JsonSerializer.Serialize(new
                {
                    number = i,
                    timestamp = DateTime.UtcNow.ToString("O"),
                    processType,
                    vertical
                });

                var message = new ServiceBusMessage(payload)
                {
                    ContentType = "application/json",
                    Subject = $"job-{i}",
                    MessageId = Guid.NewGuid().ToString()
                };

                // Send to queue (work)
                await queueSender.SendMessageAsync(message, cancellationToken);
                sent++;

                // Publish MessageEnqueued event to topic (fire-and-forget)
                try
                {
                    var eventPayload = JsonSerializer.Serialize(new
                    {
                        eventType = "MessageEnqueued",
                        vertical,
                        queueName,
                        processType,
                        timestamp = DateTime.UtcNow,
                        messageId = message.MessageId
                    });

                    await topicSender.SendMessageAsync(new ServiceBusMessage(eventPayload)
                    {
                        ContentType = "application/json",
                        Subject = "MessageEnqueued",
                        ApplicationProperties = { ["eventType"] = "MessageEnqueued", ["vertical"] = vertical }
                    }, cancellationToken);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to publish event for message {Number}", i);
                }

                // Sleep random 1-10s every 10 messages (simulate slow batch processing)
                if (i % 10 == 0)
                {
                    var sleepMs = Random.Shared.Next(1000, 10001); // 1000-10000ms
                    logger.LogInformation("Sent {Current}/{Total} messages. Sleeping {SleepMs}ms...", 
                        i, messageCount, sleepMs);
                    await Task.Delay(sleepMs, cancellationToken);
                }
                else if (i == messageCount)
                {
                    logger.LogInformation("Sent {Current}/{Total} messages (final)", i, messageCount);
                }
            }

            logger.LogInformation("Successfully sent {MessageCount} messages to {QueueName}", messageCount, queueName);
        }
        finally
        {
            // Send JobExecuted event to topic (for dashboard tracking) — always send, even if cancelled
            try
            {
                var jobEventPayload = JsonSerializer.Serialize(new
                {
                    eventType = "JobExecuted",
                    jobName,
                    executedAt = DateTime.UtcNow,
                    messagesSent = sent,
                    timestamp = DateTime.UtcNow
                });

                await topicSender.SendMessageAsync(new ServiceBusMessage(jobEventPayload)
                {
                    ContentType = "application/json",
                    Subject = "JobExecuted",
                    ApplicationProperties = { ["eventType"] = "JobExecuted", ["jobName"] = jobName }
                });

                logger.LogInformation("Published JobExecuted event for job {JobName} ({MessagesSent} messages sent)", 
                    jobName, sent);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to publish JobExecuted event for job {JobName}", jobName);
            }
        }

        logger.LogInformation("Job completed successfully");
    }
}

