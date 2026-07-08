namespace WeatherWorker.Configuration;

/// <summary>
/// Typed configuration for Service Bus connection and processor behavior.
/// Bound from appsettings.json section "ServiceBus".
/// </summary>
public sealed class ServiceBusOptions
{
    public const string SectionName = "ServiceBus";

    /// <summary>Service Bus namespace FQDN (e.g., "sb-name.servicebus.windows.net")</summary>
    public required string Namespace { get; set; }

    /// <summary>Queue name to consume messages from</summary>
    public string QueueName { get; set; } = "weather-jobs";

    /// <summary>Maximum concurrent message handlers per instance</summary>
    public int MaxConcurrentCalls { get; set; } = 5;

    /// <summary>Number of messages to prefetch for throughput optimization</summary>
    public int PrefetchCount { get; set; } = 10;
}
