namespace WeatherApi.Models;

/// <summary>
/// Infrastructure health response combining Container Apps and Service Bus status
/// </summary>
public class InfrastructureHealthResponse
{
    public List<ContainerAppStatusDto> ContainerApps { get; set; } = [];
    public ServiceBusStatusDto ServiceBus { get; set; } = new();
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;
}

public class ContainerAppStatusDto
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = "Unknown";
    public int ActiveReplicas { get; set; }
    public int MaxReplicas { get; set; }
    public string? LatestRevision { get; set; }
}

public class ServiceBusStatusDto
{
    public List<QueueStatusDto> Queues { get; set; } = [];
    public List<SubscriptionStatusDto> Subscriptions { get; set; } = [];
}

public class QueueStatusDto
{
    public string Name { get; set; } = string.Empty;
    public long ActiveMessages { get; set; }
    public long DeadLetterMessages { get; set; }
    public long ScheduledMessages { get; set; }
}

public class SubscriptionStatusDto
{
    public string TopicName { get; set; } = string.Empty;
    public string SubscriptionName { get; set; } = string.Empty;
    public long ActiveMessages { get; set; }
    public long DeadLetterMessages { get; set; }
}
