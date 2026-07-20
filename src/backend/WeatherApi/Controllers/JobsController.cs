using Azure.ResourceManager;
using Azure.ResourceManager.AppContainers;
using Azure.ResourceManager.Resources;
using Microsoft.AspNetCore.Mvc;
using WeatherApi.Models;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JobsController(
    ArmClient armClient,
    IConfiguration configuration,
    ILogger<JobsController> logger) : ControllerBase
{
    /// <summary>
    /// Lists all Container Apps Jobs in the configured environment.
    /// </summary>
    /// <returns>Array of job details including name, schedule, and last execution info.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(List<ContainerJobDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetJobs(CancellationToken ct)
    {
        var subscriptionId = configuration["AZURE_SUBSCRIPTION_ID"];
        var resourceGroup = configuration["AZURE_RESOURCE_GROUP"];

        if (string.IsNullOrEmpty(subscriptionId) || string.IsNullOrEmpty(resourceGroup))
        {
            logger.LogWarning("AZURE_SUBSCRIPTION_ID or AZURE_RESOURCE_GROUP not configured");
            return Ok(Array.Empty<ContainerJobDto>());
        }

        try
        {
            var subscription = armClient.GetSubscriptionResource(
                new Azure.Core.ResourceIdentifier($"/subscriptions/{subscriptionId}"));
            
            var rg = await subscription.GetResourceGroupAsync(resourceGroup, ct);
            var jobs = new List<ContainerJobDto>();

            await foreach (var job in rg.Value.GetContainerAppJobs().GetAllAsync(cancellationToken: ct))
            {
                var data = job.Data;
                var name = data.Name;
                var cronExpression = data.Configuration?.ScheduleTriggerConfig?.CronExpression;
                
                // Get latest execution (if any)
                ContainerAppJobExecutionResource? latestExecution = null;
                try
                {
                    var executions = job.GetContainerAppJobExecutions()
                        .GetAllAsync(cancellationToken: ct);
                    
                    await foreach (var exec in executions)
                    {
                        if (latestExecution == null || 
                            (exec.Data.StartOn.HasValue && latestExecution.Data.StartOn.HasValue &&
                             exec.Data.StartOn.Value > latestExecution.Data.StartOn.Value))
                        {
                            latestExecution = exec;
                        }
                    }
                }
                catch (Exception ex)
                {
                    logger.LogDebug(ex, "Could not retrieve executions for job {JobName}", name);
                }

                jobs.Add(new ContainerJobDto
                {
                    Name = name,
                    Type = data.Configuration?.TriggerType.ToString() ?? "Unknown",
                    CronExpression = cronExpression,
                    LastExecutionTime = latestExecution?.Data.StartOn,
                    LastExecutionStatus = latestExecution?.Data.Status?.ToString(),
                    MessageCount = GetMessageCountFromEnv(data)
                });
            }

            return Ok(jobs);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error listing Container Apps Jobs via ARM SDK");
            return Ok(Array.Empty<ContainerJobDto>());
        }
    }

    /// <summary>
    /// Gets details for a specific Container Apps Job.
    /// </summary>
    /// <param name="jobName">Name of the job</param>
    [HttpGet("{jobName}")]
    [ProducesResponseType(typeof(ContainerJobDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetJob(string jobName, CancellationToken ct)
    {
        var subscriptionId = configuration["AZURE_SUBSCRIPTION_ID"];
        var resourceGroup = configuration["AZURE_RESOURCE_GROUP"];

        if (string.IsNullOrEmpty(subscriptionId) || string.IsNullOrEmpty(resourceGroup))
        {
            return NotFound("Azure subscription or resource group not configured");
        }

        try
        {
            var subscription = armClient.GetSubscriptionResource(
                new Azure.Core.ResourceIdentifier($"/subscriptions/{subscriptionId}"));
            
            var rg = await subscription.GetResourceGroupAsync(resourceGroup, ct);
            var job = await rg.Value.GetContainerAppJobAsync(jobName, ct);

            if (job == null)
            {
                return NotFound($"Job '{jobName}' not found");
            }

            var data = job.Value.Data;
            var cronExpression = data.Configuration?.ScheduleTriggerConfig?.CronExpression;

            // Get latest execution
            ContainerAppJobExecutionResource? latestExecution = null;
            try
            {
                var executions = job.Value.GetContainerAppJobExecutions()
                    .GetAllAsync(cancellationToken: ct);
                
                await foreach (var exec in executions)
                {
                    if (latestExecution == null || 
                        (exec.Data.StartOn.HasValue && latestExecution.Data.StartOn.HasValue &&
                         exec.Data.StartOn.Value > latestExecution.Data.StartOn.Value))
                    {
                        latestExecution = exec;
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Could not retrieve executions for job {JobName}", jobName);
            }

            return Ok(new ContainerJobDto
            {
                Name = data.Name,
                Type = data.Configuration?.TriggerType.ToString() ?? "Unknown",
                CronExpression = cronExpression,
                LastExecutionTime = latestExecution?.Data.StartOn,
                LastExecutionStatus = latestExecution?.Data.Status?.ToString(),
                MessageCount = GetMessageCountFromEnv(data)
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error getting job {JobName} via ARM SDK", jobName);
            return NotFound($"Job '{jobName}' not found");
        }
    }

    /// <summary>
    /// Updates the CRON expression for a scheduled job.
    /// </summary>
    /// <param name="jobName">Name of the job</param>
    /// <param name="request">Updated CRON expression</param>
    [HttpPatch("{jobName}/schedule")]
    [ProducesResponseType(typeof(UpdateScheduleResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UpdateSchedule(
        string jobName,
        [FromBody] UpdateScheduleRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.CronExpression))
        {
            return BadRequest("CronExpression is required");
        }

        var subscriptionId = configuration["AZURE_SUBSCRIPTION_ID"];
        var resourceGroup = configuration["AZURE_RESOURCE_GROUP"];

        if (string.IsNullOrEmpty(subscriptionId) || string.IsNullOrEmpty(resourceGroup))
        {
            return NotFound("Azure subscription or resource group not configured");
        }

        try
        {
            var subscription = armClient.GetSubscriptionResource(
                new Azure.Core.ResourceIdentifier($"/subscriptions/{subscriptionId}"));
            
            var rg = await subscription.GetResourceGroupAsync(resourceGroup, ct);
            var job = await rg.Value.GetContainerAppJobAsync(jobName, ct);

            if (job == null)
            {
                return NotFound($"Job '{jobName}' not found");
            }

            // Update the job with new CRON expression
            var data = job.Value.Data;
            if (data.Configuration?.ScheduleTriggerConfig != null)
            {
                // Create a patch request with updated CRON expression
                // The SDK requires passing all configuration properties when patching
                var updatedConfig = new Azure.ResourceManager.AppContainers.Models.ContainerAppJobConfiguration(
                    triggerType: data.Configuration.TriggerType,
                    replicaTimeout: data.Configuration.ReplicaTimeout)
                {
                    ReplicaRetryLimit = data.Configuration.ReplicaRetryLimit,
                    ScheduleTriggerConfig = new Azure.ResourceManager.AppContainers.Models.JobConfigurationScheduleTriggerConfig(
                        cronExpression: request.CronExpression)
                    {
                        Parallelism = data.Configuration.ScheduleTriggerConfig.Parallelism,
                        ReplicaCompletionCount = data.Configuration.ScheduleTriggerConfig.ReplicaCompletionCount
                    }
                };

                // Copy over registries and secrets if they exist
                if (data.Configuration.Registries != null)
                {
                    foreach (var registry in data.Configuration.Registries)
                    {
                        updatedConfig.Registries.Add(registry);
                    }
                }

                if (data.Configuration.Secrets != null)
                {
                    foreach (var secret in data.Configuration.Secrets)
                    {
                        updatedConfig.Secrets.Add(secret);
                    }
                }

                var patch = new Azure.ResourceManager.AppContainers.Models.ContainerAppJobPatch
                {
                    Properties = new Azure.ResourceManager.AppContainers.Models.ContainerAppJobPatchProperties
                    {
                        Configuration = updatedConfig,
                        Template = data.Template
                    }
                };
                
                var updateOp = await job.Value.UpdateAsync(Azure.WaitUntil.Completed, patch, ct);
                
                return Ok(new UpdateScheduleResponse
                {
                    Name = jobName,
                    CronExpression = request.CronExpression,
                    Updated = true
                });
            }
            else
            {
                return BadRequest($"Job '{jobName}' is not a scheduled job");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error updating schedule for job {JobName}", jobName);
            return StatusCode(500, $"Error updating job schedule: {ex.Message}");
        }
    }

    /// <summary>
    /// Manually triggers a job execution.
    /// </summary>
    /// <param name="jobName">Name of the job</param>
    [HttpPost("{jobName}/trigger")]
    [ProducesResponseType(typeof(TriggerJobResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> TriggerJob(string jobName, CancellationToken ct)
    {
        var subscriptionId = configuration["AZURE_SUBSCRIPTION_ID"];
        var resourceGroup = configuration["AZURE_RESOURCE_GROUP"];

        if (string.IsNullOrEmpty(subscriptionId) || string.IsNullOrEmpty(resourceGroup))
        {
            return NotFound("Azure subscription or resource group not configured");
        }

        try
        {
            var subscription = armClient.GetSubscriptionResource(
                new Azure.Core.ResourceIdentifier($"/subscriptions/{subscriptionId}"));
            
            var rg = await subscription.GetResourceGroupAsync(resourceGroup, ct);
            var job = await rg.Value.GetContainerAppJobAsync(jobName, ct);

            if (job == null)
            {
                return NotFound($"Job '{jobName}' not found");
            }

            // Start a new execution
            var execution = await job.Value.StartAsync(Azure.WaitUntil.Started, cancellationToken: ct);
            var executionName = execution.Value.Name ?? $"{jobName}-manual-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";

            return Ok(new TriggerJobResponse
            {
                Name = jobName,
                ExecutionName = executionName,
                Status = "Started"
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error triggering job {JobName}", jobName);
            return StatusCode(500, $"Error triggering job: {ex.Message}");
        }
    }

    /// <summary>
    /// Extracts MESSAGE_COUNT from job environment variables.
    /// </summary>
    private static int? GetMessageCountFromEnv(ContainerAppJobData data)
    {
        var envVars = data.Template?.Containers?.FirstOrDefault()?.Env;
        if (envVars == null) return null;

        var messageCountVar = envVars.FirstOrDefault(e => 
            e.Name?.Equals("MESSAGE_COUNT", StringComparison.OrdinalIgnoreCase) == true);

        if (messageCountVar?.Value != null && int.TryParse(messageCountVar.Value, out var count))
        {
            return count;
        }

        return null;
    }
}
