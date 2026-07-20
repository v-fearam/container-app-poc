using Azure.Identity;
using Azure.Messaging.ServiceBus;
using System.Text.Json;

// Configuration from environment variables
var serviceBusNamespace = Environment.GetEnvironmentVariable("SERVICE_BUS_NAMESPACE")
    ?? throw new InvalidOperationException("SERVICE_BUS_NAMESPACE environment variable not set");

var weatherQueueName = Environment.GetEnvironmentVariable("WEATHER_QUEUE_NAME") ?? "weather-queue";
var dashboardTopicName = Environment.GetEnvironmentVariable("DASHBOARD_TOPIC_NAME") ?? "dashboard-events";

var messageCountStr = Environment.GetEnvironmentVariable("MESSAGE_COUNT") ?? "50";
if (!int.TryParse(messageCountStr, out var messageCount) || messageCount <= 0)
{
    throw new InvalidOperationException($"Invalid MESSAGE_COUNT: {messageCountStr}. Must be a positive integer.");
}

var jobName = Environment.GetEnvironmentVariable("JOB_NAME") ?? "weather-enqueuer";

Console.WriteLine($"[WeatherEnqueuer] Starting job: {jobName}");
Console.WriteLine($"[WeatherEnqueuer] Service Bus Namespace: {serviceBusNamespace}");
Console.WriteLine($"[WeatherEnqueuer] Weather Queue: {weatherQueueName}");
Console.WriteLine($"[WeatherEnqueuer] Dashboard Topic: {dashboardTopicName}");
Console.WriteLine($"[WeatherEnqueuer] Messages to send: {messageCount}");

// Create Service Bus client with Managed Identity
var credential = new DefaultAzureCredential();
await using var client = new ServiceBusClient(serviceBusNamespace, credential);

await using var weatherQueueSender = client.CreateSender(weatherQueueName);
await using var dashboardTopicSender = client.CreateSender(dashboardTopicName);

var executedAt = DateTime.UtcNow;

// Send messages to weather-queue
Console.WriteLine($"[WeatherEnqueuer] Sending {messageCount} messages to {weatherQueueName}...");
for (int i = 1; i <= messageCount; i++)
{
    var message = new ServiceBusMessage(JsonSerializer.Serialize(new
    {
        Temperature = Random.Shared.Next(-10, 40),
        Location = $"Location-{i}",
        Timestamp = DateTime.UtcNow
    }))
    {
        MessageId = Guid.NewGuid().ToString()
    };

    await weatherQueueSender.SendMessageAsync(message);

    if (i % 10 == 0 || i == messageCount)
    {
        Console.WriteLine($"[WeatherEnqueuer] Sent {i}/{messageCount} messages");
    }
}

Console.WriteLine($"[WeatherEnqueuer] Successfully sent {messageCount} messages to {weatherQueueName}");

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

await dashboardTopicSender.SendMessageAsync(dashboardMessage);
Console.WriteLine($"[WeatherEnqueuer] Published JobExecuted event to {dashboardTopicName}");
Console.WriteLine($"[WeatherEnqueuer] Job completed successfully. Exiting.");

// Exit code 0 indicates success
Environment.Exit(0);
