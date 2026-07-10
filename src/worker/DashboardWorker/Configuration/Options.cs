namespace DashboardWorker.Configuration;

public class ServiceBusOptions
{
    public const string SectionName = "ServiceBus";
    public string Namespace { get; set; } = string.Empty;
    public string TopicName { get; set; } = "nd-dashboard-events";
    public string SubscriptionName { get; set; } = "counter-updater";
}

public class SqlOptions
{
    public const string SectionName = "Sql";
    public string ConnectionString { get; set; } = string.Empty;
}
