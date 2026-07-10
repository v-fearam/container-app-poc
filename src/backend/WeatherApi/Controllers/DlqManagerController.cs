using Azure.Identity;
using Azure.Messaging.ServiceBus;
using Azure.Messaging.ServiceBus.Administration;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using WeatherApi.Models;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/dlq")]
public class DlqManagerController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<DlqManagerController> _logger;

    public DlqManagerController(IConfiguration configuration, ILogger<DlqManagerController> logger)
    {
        _configuration = configuration;
        _logger = logger;
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
        _logger.LogInformation("Peeking DLQ messages for queue={QueueName} maxCount={MaxCount}", queueName, maxCount);

        try
        {
            var serviceBusNamespace = _configuration["ServiceBus__Namespace"] ?? throw new InvalidOperationException("ServiceBus__Namespace not configured");
            var credential = new DefaultAzureCredential();

            await using var client = new ServiceBusClient(serviceBusNamespace, credential);

            ServiceBusReceiver receiver;
            // Check if queueName has subscription format (topic/subscription)
            if (queueName.Contains('/'))
            {
                var parts = queueName.Split('/');
                receiver = client.CreateReceiver(parts[0], parts[1], new ServiceBusReceiverOptions
                {
                    SubQueue = SubQueue.DeadLetter
                });
            }
            else
            {
                receiver = client.CreateReceiver(queueName, new ServiceBusReceiverOptions
                {
                    SubQueue = SubQueue.DeadLetter
                });
            }

            await using (receiver)
            {
                var messages = await receiver.PeekMessagesAsync(maxCount, cancellationToken: cancellationToken);

                var dlqMessages = messages.Select(msg => new DlqMessageDto
                {
                    MessageId = msg.MessageId,
                    DeadLetterReason = msg.DeadLetterReason ?? "Unknown",
                    DeadLetterErrorDescription = msg.DeadLetterErrorDescription ?? "",
                    EnqueuedTimeUtc = msg.EnqueuedTime.UtcDateTime,
                    DeliveryCount = msg.DeliveryCount,
                    BodyJson = msg.Body.ToString(),
                    QueueName = queueName
                }).ToList();

                return Ok(dlqMessages);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error peeking DLQ for queue={QueueName}", queueName);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to peek DLQ messages" });
        }
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
        _logger.LogInformation("Requeuing DLQ message={MessageId} from queue={QueueName}", request.MessageId, request.QueueName);

        try
        {
            var serviceBusNamespace = _configuration["ServiceBus__Namespace"] ?? throw new InvalidOperationException("ServiceBus__Namespace not configured");
            var credential = new DefaultAzureCredential();

            await using var client = new ServiceBusClient(serviceBusNamespace, credential);

            // 1. Receive (with lock) the message from DLQ
            ServiceBusReceiver dlqReceiver;
            if (request.QueueName.Contains('/'))
            {
                var parts = request.QueueName.Split('/');
                dlqReceiver = client.CreateReceiver(parts[0], parts[1], new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });
            }
            else
            {
                dlqReceiver = client.CreateReceiver(request.QueueName, new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });
            }

            await using (dlqReceiver)
            {
                // Receive messages until we find the one with matching MessageId
                ServiceBusReceivedMessage? targetMessage = null;
                var receivedMessages = new List<ServiceBusReceivedMessage>();

                await foreach (var msg in dlqReceiver.ReceiveMessagesAsync(cancellationToken: cancellationToken))
                {
                    receivedMessages.Add(msg);
                    if (msg.MessageId == request.MessageId)
                    {
                        targetMessage = msg;
                        break;
                    }
                }

                if (targetMessage == null)
                {
                    // Abandon all received messages
                    foreach (var msg in receivedMessages)
                    {
                        await dlqReceiver.AbandonMessageAsync(msg, cancellationToken: cancellationToken);
                    }
                    return NotFound(new { error = $"Message {request.MessageId} not found in DLQ" });
                }

                // 2. Create sender for the original queue
                var targetQueueName = request.QueueName.Contains('/') ? request.QueueName.Split('/')[0] : request.QueueName;
                await using var sender = client.CreateSender(targetQueueName);

                // 3. Clone message (with edited body if provided)
                var newBody = string.IsNullOrWhiteSpace(request.EditedBodyJson)
                    ? targetMessage.Body
                    : new BinaryData(request.EditedBodyJson);

                var newMessage = new ServiceBusMessage(newBody)
                {
                    MessageId = Guid.NewGuid().ToString(), // New MessageId
                    CorrelationId = targetMessage.CorrelationId,
                    Subject = targetMessage.Subject,
                    ContentType = targetMessage.ContentType,
                    TimeToLive = targetMessage.TimeToLive
                };

                // Copy application properties
                foreach (var prop in targetMessage.ApplicationProperties)
                {
                    newMessage.ApplicationProperties[prop.Key] = prop.Value;
                }

                // 4. Send to original queue
                await sender.SendMessageAsync(newMessage, cancellationToken);

                // 5. Complete (delete) from DLQ
                await dlqReceiver.CompleteMessageAsync(targetMessage, cancellationToken);

                // 6. Abandon other messages we peeked
                foreach (var msg in receivedMessages.Where(m => m.MessageId != request.MessageId))
                {
                    await dlqReceiver.AbandonMessageAsync(msg, cancellationToken: cancellationToken);
                }

                _logger.LogInformation("Successfully requeued message={MessageId} to queue={Queue}", request.MessageId, targetQueueName);
                return Ok(new { message = "Message requeued successfully" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requeuing DLQ message={MessageId}", request.MessageId);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to requeue message" });
        }
    }

    /// <summary>
    /// Discard (complete/delete) a DLQ message
    /// </summary>
    [HttpPost("discard")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> DiscardDlqMessage(
        [FromBody] DiscardDlqMessageRequest request,
        CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Discarding DLQ message={MessageId} from queue={QueueName}", request.MessageId, request.QueueName);

        try
        {
            var serviceBusNamespace = _configuration["ServiceBus__Namespace"] ?? throw new InvalidOperationException("ServiceBus__Namespace not configured");
            var credential = new DefaultAzureCredential();

            await using var client = new ServiceBusClient(serviceBusNamespace, credential);

            ServiceBusReceiver dlqReceiver;
            if (request.QueueName.Contains('/'))
            {
                var parts = request.QueueName.Split('/');
                dlqReceiver = client.CreateReceiver(parts[0], parts[1], new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });
            }
            else
            {
                dlqReceiver = client.CreateReceiver(request.QueueName, new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });
            }

            await using (dlqReceiver)
            {
                // Receive messages until we find the one with matching MessageId
                ServiceBusReceivedMessage? targetMessage = null;
                var receivedMessages = new List<ServiceBusReceivedMessage>();

                await foreach (var msg in dlqReceiver.ReceiveMessagesAsync(cancellationToken: cancellationToken))
                {
                    receivedMessages.Add(msg);
                    if (msg.MessageId == request.MessageId)
                    {
                        targetMessage = msg;
                        break;
                    }
                }

                if (targetMessage == null)
                {
                    // Abandon all received messages
                    foreach (var msg in receivedMessages)
                    {
                        await dlqReceiver.AbandonMessageAsync(msg, cancellationToken: cancellationToken);
                    }
                    return NotFound(new { error = $"Message {request.MessageId} not found in DLQ" });
                }

                // Complete (delete) the target message
                await dlqReceiver.CompleteMessageAsync(targetMessage, cancellationToken);

                // Abandon other messages we received
                foreach (var msg in receivedMessages.Where(m => m.MessageId != request.MessageId))
                {
                    await dlqReceiver.AbandonMessageAsync(msg, cancellationToken: cancellationToken);
                }

                _logger.LogInformation("Successfully discarded message={MessageId} from DLQ", request.MessageId);
                return Ok(new { message = "Message discarded successfully" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error discarding DLQ message={MessageId}", request.MessageId);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to discard message" });
        }
    }
}
