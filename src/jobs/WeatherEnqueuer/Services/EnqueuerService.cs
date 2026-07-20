using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace WeatherEnqueuer.Services;

public class EnqueuerService : IEnqueuerService
{
    private readonly ServiceBusClient _serviceBusClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EnqueuerService> _logger;

    public EnqueuerService(
        ServiceBusClient serviceBusClient,
        IConfiguration configuration,
        ILogger<EnqueuerService> logger)
    {
        _serviceBusClient = serviceBusClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        var weatherQueueName = _configuration["WEATHER_QUEUE_NAME"] ?? "weather-queue";
        var dashboardTopicName = _configuration["DASHBOARD_TOPIC_NAME"] ?? "dashboard-events";
        var messageCountStr = _configuration["MESSAGE_COUNT"] ?? "50";
        var jobName = _configuration["JOB_NAME"] ?? "weather-enqueuer";

        if (!int.TryParse(messageCountStr, out var messageCount) || messageCount <= 0)
        {
            throw new InvalidOperationException($"Invalid MESSAGE_COUNT: {messageCountStr}. Must be a positive integer.");
        }

        _logger.LogInformation("Starting job: {JobName}", jobName);
        _logger.LogInformation("Weather Queue: {QueueName}, Dashboard Topic: {TopicName}, Message Count: {MessageCount}",
            weatherQueueName, dashboardTopicName, messageCount);

        var executedAt = DateTime.UtcNow;

        await using var weatherQueueSender = _serviceBusClient.CreateSender(weatherQueueName);
        await using var dashboardTopicSender = _serviceBusClient.CreateSender(dashboardTopicName);

        // Send messages to weather-queue
        _logger.LogInformation("Sending {MessageCount} messages to {QueueName}...", messageCount, weatherQueueName);
        
        for (int i = 1; i <= messageCount; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var message = new ServiceBusMessage(JsonSerializer.Serialize(new
            {
                Temperature = Random.Shared.Next(-10, 40),
                Location = $"Location-{i}",
                Timestamp = DateTime.UtcNow
            }))
            {
                MessageId = Guid.NewGuid().ToString()
            };

            await weatherQueueSender.SendMessageAsync(message, cancellationToken);

            if (i % 10 == 0 || i == messageCount)
            {
                _logger.LogInformation("Sent {Current}/{Total} messages", i, messageCount);
            }
        }

        _logger.LogInformation("Successfully sent {MessageCount} messages to {QueueName}", messageCount, weatherQueueName);

        // Publish JobExecuted event to dashboard-events topic
        var jobExecutedEvent = new
        {
            EventType = "JobExecuted",
            EventId = Guid.NewGuid().ToString(),
            JobName = jobName,
            ExecutedAt = executedAt,
            MessageCount = messageCount,
            Timestamp = DateTime.UtcNow
        };

        var dashboardMessage = new ServiceBusMessage(JsonSerializer.Serialize(jobExecutedEvent))
        {
            MessageId = Guid.NewGuid().ToString(),
            Subject = "JobExecuted"
        };

        await dashboardTopicSender.SendMessageAsync(dashboardMessage, cancellationToken);
        _logger.LogInformation("Published JobExecuted event to {TopicName}", dashboardTopicName);
        _logger.LogInformation("Job completed successfully");
    }
}
