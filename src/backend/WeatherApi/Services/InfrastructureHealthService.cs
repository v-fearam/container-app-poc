using Azure.Core;
using Azure.ResourceManager;
using Azure.ResourceManager.AppContainers;
using Azure.Messaging.ServiceBus.Administration;
using Microsoft.Extensions.Caching.Memory;
using WeatherApi.Models;

namespace WeatherApi.Services;

public interface IInfrastructureHealthService
{
    Task<InfrastructureHealthResponse> GetInfrastructureHealthAsync(CancellationToken ct = default);
}

/// <summary>
/// Queries Azure ARM API (via SDK) for Container Apps status/replicas and Service Bus for queue depths.
/// Results are cached in IMemoryCache to avoid hitting ARM rate limits.
/// </summary>
public class InfrastructureHealthService(
    ArmClient armClient,
    IMemoryCache cache,
    IConfiguration configuration,
    ServiceBusAdministrationClient? sbAdminClient,
    ILogger<InfrastructureHealthService> logger) : IInfrastructureHealthService
{
    private const string CacheKey = "infra-health";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(25);

    public async Task<InfrastructureHealthResponse> GetInfrastructureHealthAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue(CacheKey, out InfrastructureHealthResponse? cached) && cached is not null)
            return cached;

        var response = new InfrastructureHealthResponse();

        // Parallel: Container Apps + Container App Jobs + Service Bus
        var containerAppsTask = GetContainerAppsStatusAsync(ct);
        var containerAppJobsTask = GetContainerAppJobsStatusAsync(ct);
        var serviceBusTask = GetServiceBusStatusAsync(ct);

        await Task.WhenAll(containerAppsTask, containerAppJobsTask, serviceBusTask);

        response.ContainerApps = await containerAppsTask;
        response.ContainerAppJobs = await containerAppJobsTask;
        response.ServiceBus = await serviceBusTask;
        response.CachedAt = DateTime.UtcNow;

        cache.Set(CacheKey, response, CacheDuration);
        return response;
    }

    private async Task<List<ContainerAppStatusDto>> GetContainerAppsStatusAsync(CancellationToken ct)
    {
        var subscriptionId = configuration["AZURE_SUBSCRIPTION_ID"] ?? "";
        var resourceGroup = configuration["AZURE_RESOURCE_GROUP"] ?? "";

        if (string.IsNullOrEmpty(subscriptionId) || string.IsNullOrEmpty(resourceGroup))
        {
            logger.LogWarning("AZURE_SUBSCRIPTION_ID or AZURE_RESOURCE_GROUP not configured");
            return [];
        }

        try
        {
            var subscription = armClient.GetSubscriptionResource(
                new ResourceIdentifier($"/subscriptions/{subscriptionId}"));
            
            var rg = await subscription.GetResourceGroupAsync(resourceGroup, ct);
            var apps = new List<ContainerAppStatusDto>();

            await foreach (var app in rg.Value.GetContainerApps().GetAllAsync(cancellationToken: ct))
            {
                var name = app.Data.Name;
                var status = "Unknown";
                
                // SDK only has ProvisioningState (no RunningStatus)
                if (app.Data.ProvisioningState.HasValue)
                    status = app.Data.ProvisioningState.Value.ToString();

                var maxReplicas = app.Data.Template?.Scale?.MaxReplicas ?? 1;
                var latestRevision = app.Data.LatestRevisionName;

                // Get replica count
                var replicas = await GetReplicaCountAsync(app, latestRevision, ct);

                apps.Add(new ContainerAppStatusDto
                {
                    Name = name,
                    Status = replicas > 0 ? "Running" : "Scaled to zero",
                    ActiveReplicas = replicas,
                    MaxReplicas = maxReplicas,
                    LatestRevision = latestRevision
                });
            }

            return apps;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error querying Container Apps status via SDK");
            return [];
        }
    }

    private async Task<int> GetReplicaCountAsync(
        ContainerAppResource app, string? revisionName, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(revisionName)) return 0;

        try
        {
            var revision = await app.GetContainerAppRevisionAsync(revisionName, ct);
            if (revision == null || revision.Value == null) return 0;

            var replicas = await revision.Value.GetContainerAppReplicas()
                .GetAllAsync(cancellationToken: ct)
                .ToListAsync(ct);

            return replicas.Count;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Could not get replicas for {App}/{Revision}", app.Data.Name, revisionName);
            return 0;
        }
    }

    private async Task<List<ContainerAppJobStatusDto>> GetContainerAppJobsStatusAsync(CancellationToken ct)
    {
        var subscriptionId = configuration["AZURE_SUBSCRIPTION_ID"] ?? "";
        var resourceGroup = configuration["AZURE_RESOURCE_GROUP"] ?? "";

        if (string.IsNullOrEmpty(subscriptionId) || string.IsNullOrEmpty(resourceGroup))
        {
            logger.LogWarning("AZURE_SUBSCRIPTION_ID or AZURE_RESOURCE_GROUP not configured");
            return [];
        }

        try
        {
            var subscription = armClient.GetSubscriptionResource(
                new ResourceIdentifier($"/subscriptions/{subscriptionId}"));
            
            var rg = await subscription.GetResourceGroupAsync(resourceGroup, ct);
            var jobs = new List<ContainerAppJobStatusDto>();

            await foreach (var job in rg.Value.GetContainerAppJobs().GetAllAsync(cancellationToken: ct))
            {
                var name = job.Data.Name;
                var triggerType = job.Data.Configuration?.TriggerType.ToString() ?? "Unknown";
                string? cronExpression = null;

                if (job.Data.Configuration?.ScheduleTriggerConfig != null)
                {
                    cronExpression = job.Data.Configuration.ScheduleTriggerConfig.CronExpression;
                }

                // Get running executions count
                var runningExecutions = await GetRunningExecutionsCountAsync(job, ct);

                // Get last execution info
                var (lastStatus, lastTime) = await GetLastExecutionInfoAsync(job, ct);

                jobs.Add(new ContainerAppJobStatusDto
                {
                    Name = name,
                    TriggerType = triggerType,
                    CronExpression = cronExpression,
                    LastExecutionStatus = lastStatus,
                    LastExecutionTime = lastTime,
                    RunningExecutions = runningExecutions
                });
            }

            return jobs;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error querying Container App Jobs status via SDK");
            return [];
        }
    }

    private async Task<int> GetRunningExecutionsCountAsync(ContainerAppJobResource job, CancellationToken ct)
    {
        try
        {
            int runningCount = 0;
            
            await foreach (var exec in job.GetContainerAppJobExecutions().GetAllAsync(cancellationToken: ct))
            {
                var status = exec.Data.Status?.ToString();
                if (status == "Running" || status == "Pending")
                    runningCount++;
            }

            return runningCount;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Could not get executions for job {JobName}", job.Data.Name);
            return 0;
        }
    }

    private async Task<(string? status, DateTimeOffset? time)> GetLastExecutionInfoAsync(
        ContainerAppJobResource job, CancellationToken ct)
    {
        try
        {
            var executions = await job.GetContainerAppJobExecutions()
                .GetAllAsync(cancellationToken: ct)
                .ToListAsync(ct);

            if (executions.Count == 0) return (null, null);

            // First execution is the latest
            var lastExec = executions[0];
            var status = lastExec.Data.Status?.ToString();
            var startTime = lastExec.Data.StartOn;

            return (status, startTime);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Could not get last execution info for job {JobName}", job.Data.Name);
            return (null, null);
        }
    }

    private async Task<ServiceBusStatusDto> GetServiceBusStatusAsync(CancellationToken ct)
    {
        var result = new ServiceBusStatusDto();

        if (sbAdminClient is null)
        {
            logger.LogDebug("ServiceBusAdministrationClient not available");
            return result;
        }

        try
        {
            // Discover queues
            await foreach (var queue in sbAdminClient.GetQueuesAsync(ct))
            {
                var props = await sbAdminClient.GetQueueRuntimePropertiesAsync(queue.Name, ct);
                result.Queues.Add(new QueueStatusDto
                {
                    Name = queue.Name,
                    ActiveMessages = props.Value.ActiveMessageCount,
                    DeadLetterMessages = props.Value.DeadLetterMessageCount,
                    ScheduledMessages = props.Value.ScheduledMessageCount
                });
            }

            // Discover topics + subscriptions
            await foreach (var topic in sbAdminClient.GetTopicsAsync(ct))
            {
                await foreach (var sub in sbAdminClient.GetSubscriptionsAsync(topic.Name, ct))
                {
                    var props = await sbAdminClient.GetSubscriptionRuntimePropertiesAsync(
                        topic.Name, sub.SubscriptionName, ct);
                    result.Subscriptions.Add(new SubscriptionStatusDto
                    {
                        TopicName = topic.Name,
                        SubscriptionName = sub.SubscriptionName,
                        ActiveMessages = props.Value.ActiveMessageCount,
                        DeadLetterMessages = props.Value.DeadLetterMessageCount
                    });
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error querying Service Bus runtime properties");
        }

        return result;
    }
}
