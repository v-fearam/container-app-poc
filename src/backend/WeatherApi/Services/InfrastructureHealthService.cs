using System.Net.Http.Headers;
using System.Text.Json;
using Azure.Core;
using Azure.Identity;
using Azure.Messaging.ServiceBus.Administration;
using Microsoft.Extensions.Caching.Memory;
using WeatherApi.Models;

namespace WeatherApi.Services;

public interface IInfrastructureHealthService
{
    Task<InfrastructureHealthResponse> GetInfrastructureHealthAsync(CancellationToken ct = default);
}

/// <summary>
/// Queries Azure ARM API for Container Apps status/replicas and Service Bus for queue depths.
/// Results are cached in IMemoryCache to avoid hitting ARM rate limits.
/// </summary>
public class InfrastructureHealthService(
    IHttpClientFactory httpClientFactory,
    TokenCredential credential,
    IMemoryCache cache,
    IConfiguration configuration,
    ServiceBusAdministrationClient? sbAdminClient,
    ILogger<InfrastructureHealthService> logger) : IInfrastructureHealthService
{
    private const string CacheKey = "infra-health";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(25);
    private static readonly string[] ArmScopes = ["https://management.azure.com/.default"];

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
            var token = await credential.GetTokenAsync(
                new TokenRequestContext(ArmScopes), ct);

            var client = httpClientFactory.CreateClient("arm");
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token.Token);

            // List all container apps in the resource group
            var listUrl = $"https://management.azure.com/subscriptions/{subscriptionId}" +
                          $"/resourceGroups/{resourceGroup}/providers/Microsoft.App/containerApps" +
                          "?api-version=2024-03-01";

            var listResponse = await client.GetAsync(listUrl, ct);
            if (!listResponse.IsSuccessStatusCode)
            {
                logger.LogWarning("ARM API returned {StatusCode} listing container apps",
                    listResponse.StatusCode);
                return [];
            }

            var json = await listResponse.Content.ReadAsStringAsync(ct);
            var doc = JsonDocument.Parse(json);
            var apps = new List<ContainerAppStatusDto>();

            foreach (var app in doc.RootElement.GetProperty("value").EnumerateArray())
            {
                var name = app.GetProperty("name").GetString() ?? "";
                var props = app.GetProperty("properties");
                var template = props.GetProperty("template");

                var status = "Unknown";
                if (props.TryGetProperty("runningStatus", out var rs))
                    status = rs.GetString() ?? "Unknown";
                else if (props.TryGetProperty("provisioningState", out var ps))
                    status = ps.GetString() ?? "Unknown";

                var maxReplicas = 1;
                if (template.TryGetProperty("scale", out var scale) &&
                    scale.TryGetProperty("maxReplicas", out var mr))
                    maxReplicas = mr.GetInt32();

                var latestRevision = props.TryGetProperty("latestRevisionName", out var lr)
                    ? lr.GetString() : null;

                // Get replica count
                var replicas = await GetReplicaCountAsync(
                    client, subscriptionId, resourceGroup, name, latestRevision, ct);

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
            logger.LogError(ex, "Error querying Container Apps status via ARM API");
            return [];
        }
    }

    private async Task<int> GetReplicaCountAsync(
        HttpClient client, string subscriptionId, string resourceGroup,
        string appName, string? revisionName, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(revisionName)) return 0;

        try
        {
            var url = $"https://management.azure.com/subscriptions/{subscriptionId}" +
                      $"/resourceGroups/{resourceGroup}/providers/Microsoft.App" +
                      $"/containerApps/{appName}/revisions/{revisionName}/replicas" +
                      "?api-version=2024-03-01";

            var response = await client.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode) return 0;

            var json = await response.Content.ReadAsStringAsync(ct);
            var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("value").GetArrayLength();
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Could not get replicas for {App}/{Revision}", appName, revisionName);
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
            var token = await credential.GetTokenAsync(
                new TokenRequestContext(ArmScopes), ct);

            var client = httpClientFactory.CreateClient("arm");
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token.Token);

            // List all container app jobs in the resource group
            var listUrl = $"https://management.azure.com/subscriptions/{subscriptionId}" +
                          $"/resourceGroups/{resourceGroup}/providers/Microsoft.App/jobs" +
                          "?api-version=2024-03-01";

            var listResponse = await client.GetAsync(listUrl, ct);
            if (!listResponse.IsSuccessStatusCode)
            {
                logger.LogWarning("ARM API returned {StatusCode} listing container app jobs",
                    listResponse.StatusCode);
                return [];
            }

            var json = await listResponse.Content.ReadAsStringAsync(ct);
            var doc = JsonDocument.Parse(json);
            var jobs = new List<ContainerAppJobStatusDto>();

            foreach (var job in doc.RootElement.GetProperty("value").EnumerateArray())
            {
                var name = job.GetProperty("name").GetString() ?? "";
                var props = job.GetProperty("properties");
                var config = props.GetProperty("configuration");

                var triggerType = config.GetProperty("triggerType").GetString() ?? "Unknown";
                
                string? cronExpression = null;
                if (config.TryGetProperty("scheduleTriggerConfig", out var scheduleTrigger) &&
                    scheduleTrigger.TryGetProperty("cronExpression", out var cronProp))
                {
                    cronExpression = cronProp.GetString();
                }

                // Get running executions count
                var runningExecutions = await GetRunningExecutionsCountAsync(
                    client, subscriptionId, resourceGroup, name, ct);

                // Get last execution info
                var (lastStatus, lastTime) = await GetLastExecutionInfoAsync(
                    client, subscriptionId, resourceGroup, name, ct);

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
            logger.LogError(ex, "Error querying Container App Jobs status via ARM API");
            return [];
        }
    }

    private async Task<int> GetRunningExecutionsCountAsync(
        HttpClient client, string subscriptionId, string resourceGroup,
        string jobName, CancellationToken ct)
    {
        try
        {
            var url = $"https://management.azure.com/subscriptions/{subscriptionId}" +
                      $"/resourceGroups/{resourceGroup}/providers/Microsoft.App" +
                      $"/jobs/{jobName}/executions?api-version=2024-03-01";

            var response = await client.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode) return 0;

            var json = await response.Content.ReadAsStringAsync(ct);
            var doc = JsonDocument.Parse(json);
            
            int runningCount = 0;
            foreach (var exec in doc.RootElement.GetProperty("value").EnumerateArray())
            {
                var status = exec.GetProperty("properties").GetProperty("status").GetString();
                if (status == "Running" || status == "Pending")
                    runningCount++;
            }

            return runningCount;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Could not get executions for job {JobName}", jobName);
            return 0;
        }
    }

    private async Task<(string? status, DateTime? time)> GetLastExecutionInfoAsync(
        HttpClient client, string subscriptionId, string resourceGroup,
        string jobName, CancellationToken ct)
    {
        try
        {
            var url = $"https://management.azure.com/subscriptions/{subscriptionId}" +
                      $"/resourceGroups/{resourceGroup}/providers/Microsoft.App" +
                      $"/jobs/{jobName}/executions?api-version=2024-03-01";

            var response = await client.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode) return (null, null);

            var json = await response.Content.ReadAsStringAsync(ct);
            var doc = JsonDocument.Parse(json);
            
            var executions = doc.RootElement.GetProperty("value").EnumerateArray().ToList();
            if (executions.Count == 0) return (null, null);

            // First execution is the latest
            var lastExec = executions[0];
            var props = lastExec.GetProperty("properties");
            
            var status = props.GetProperty("status").GetString();
            DateTime? startTime = null;
            
            if (props.TryGetProperty("startTime", out var startProp) &&
                startProp.ValueKind == JsonValueKind.String)
            {
                DateTime.TryParse(startProp.GetString(), out var parsed);
                startTime = parsed;
            }

            return (status, startTime);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Could not get last execution info for job {JobName}", jobName);
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
