using Microsoft.AspNetCore.Mvc;
using WeatherApi.Models;
using WeatherApi.Services;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/dlq")]
public class DlqManagerController(
    IServiceProvider serviceProvider,
    ILogger<DlqManagerController> logger) : ControllerBase
{
    private IDlqService GetDlqServiceOrThrow()
    {
        return serviceProvider.GetService<IDlqService>()
            ?? throw new InvalidOperationException("DLQ service not configured (ServiceBus:Namespace missing)");
    }

    /// <summary>
    /// Peek DLQ messages for a queue or subscription
    /// </summary>
    [HttpGet("{queueName}")]
    [ProducesResponseType(typeof(IEnumerable<DlqMessageDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> PeekDlqMessages(
        string queueName,
        [FromQuery] int maxCount = 100,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Peeking DLQ messages for queue={QueueName} maxCount={MaxCount}", queueName, maxCount);

        var dlqService = GetDlqServiceOrThrow();
        var messages = await dlqService.PeekDlqMessagesAsync(queueName, maxCount, cancellationToken);
        return Ok(messages);
    }

    /// <summary>
    /// Requeue a DLQ message (with optional edits)
    /// </summary>
    [HttpPost("requeue")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> RequeueDlqMessage(
        [FromBody] RequeueDlqMessageRequest request,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Requeuing DLQ message={MessageId} from queue={QueueName}", request.MessageId, request.QueueName);

        var dlqService = GetDlqServiceOrThrow();
        var requeuedCount = await dlqService.RequeueMessagesAsync(
            request.QueueName,
            new[] { request },
            cancellationToken);

        if (requeuedCount == 0)
        {
            return NotFound(new { error = $"Message {request.MessageId} not found in DLQ" });
        }

        return Ok(new { success = true, message = $"Message {request.MessageId} requeued successfully" });
    }

    /// <summary>
    /// Discard (complete) a DLQ message
    /// </summary>
    [HttpPost("discard")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> DiscardDlqMessage(
        [FromBody] DiscardDlqMessageRequest request,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Discarding DLQ message={MessageId} from queue={QueueName}", request.MessageId, request.QueueName);

        var dlqService = GetDlqServiceOrThrow();
        var discardedCount = await dlqService.DiscardMessagesAsync(
            request.QueueName,
            new[] { request },
            cancellationToken);

        if (discardedCount == 0)
        {
            return NotFound(new { error = $"Message {request.MessageId} not found in DLQ" });
        }

        return Ok(new { success = true, message = $"Message {request.MessageId} discarded successfully" });
    }
}
