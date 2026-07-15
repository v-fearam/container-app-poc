using Azure.Messaging.ServiceBus;
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Text.Json;
using WeatherApi.Data;
using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// DLQ management service implementation
/// </summary>
public class DlqService(
    ServiceBusClient serviceBusClient,
    IServiceProvider serviceProvider,
    ILogger<DlqService> logger) : IDlqService
{

    public async Task<IEnumerable<DlqMessageDto>> PeekDlqMessagesAsync(
        string queueName,
        int maxMessages = 10,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Peeking DLQ messages for queue={QueueName} maxCount={MaxCount}", queueName, maxMessages);

        ServiceBusReceiver receiver = CreateDlqReceiver(queueName);

        await using (receiver)
        {
            var messages = await receiver.PeekMessagesAsync(maxMessages, cancellationToken: cancellationToken);

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

            return dlqMessages;
        }
    }

    public async Task<int> RequeueMessagesAsync(
        string queueName,
        IEnumerable<RequeueDlqMessageRequest> requests,
        CancellationToken cancellationToken = default)
    {
        int requeuedCount = 0;

        foreach (var request in requests)
        {
            try
            {
                await RequeueSingleMessageAsync(queueName, request, cancellationToken);
                requeuedCount++;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to requeue message={MessageId} from queue={QueueName}", request.MessageId, queueName);
            }
        }

        return requeuedCount;
    }

    public async Task<int> DiscardMessagesAsync(
        string queueName,
        IEnumerable<DiscardDlqMessageRequest> requests,
        CancellationToken cancellationToken = default)
    {
        int discardedCount = 0;

        foreach (var request in requests)
        {
            try
            {
                await DiscardSingleMessageAsync(queueName, request, cancellationToken);
                discardedCount++;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to discard message={MessageId} from queue={QueueName}", request.MessageId, queueName);
            }
        }

        return discardedCount;
    }

    private async Task RequeueSingleMessageAsync(
        string queueName,
        RequeueDlqMessageRequest request,
        CancellationToken cancellationToken)
    {
        logger.LogInformation("Requeuing DLQ message={MessageId} from queue={QueueName}", request.MessageId, queueName);

        // 1. Receive (with lock) the message from DLQ
        ServiceBusReceiver dlqReceiver = CreateDlqReceiver(queueName);

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
                throw new InvalidOperationException($"Message {request.MessageId} not found in DLQ");
            }

            // 2. Clone message (optionally with edited body)
            var messageBody = string.IsNullOrEmpty(request.EditedBodyJson)
                ? targetMessage.Body
                : new BinaryData(Encoding.UTF8.GetBytes(request.EditedBodyJson));

            var newMessage = new ServiceBusMessage(messageBody)
            {
                ContentType = targetMessage.ContentType,
                CorrelationId = targetMessage.CorrelationId,
                Subject = targetMessage.Subject,
                MessageId = Guid.NewGuid().ToString(), // New message ID
                TimeToLive = targetMessage.TimeToLive
            };

            // Copy application properties
            foreach (var prop in targetMessage.ApplicationProperties)
            {
                newMessage.ApplicationProperties[prop.Key] = prop.Value;
            }

            // 3. Send to original queue
            string originalQueueName = queueName.Contains('/') ? queueName.Split('/')[0] : queueName;
            await using var sender = serviceBusClient.CreateSender(originalQueueName);
            await sender.SendMessageAsync(newMessage, cancellationToken);

            // 4. Complete (remove) from DLQ
            await dlqReceiver.CompleteMessageAsync(targetMessage, cancellationToken);

            // Abandon other received messages
            foreach (var msg in receivedMessages.Where(m => m.MessageId != request.MessageId))
            {
                await dlqReceiver.AbandonMessageAsync(msg, cancellationToken: cancellationToken);
            }
        }
    }

    private async Task DiscardSingleMessageAsync(
        string queueName,
        DiscardDlqMessageRequest request,
        CancellationToken cancellationToken)
    {
        logger.LogInformation("Discarding DLQ message={MessageId} from queue={QueueName}", request.MessageId, queueName);

        ServiceBusReceiver dlqReceiver = CreateDlqReceiver(queueName);
        string? messageBody = null;

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
                throw new InvalidOperationException($"Message {request.MessageId} not found in DLQ");
            }

            // Capture body before completing
            messageBody = targetMessage.Body.ToString();

            // Complete (delete) the target message
            await dlqReceiver.CompleteMessageAsync(targetMessage, cancellationToken);

            // Abandon other received messages
            foreach (var msg in receivedMessages.Where(m => m.MessageId != request.MessageId))
            {
                await dlqReceiver.AbandonMessageAsync(msg, cancellationToken: cancellationToken);
            }
        }

        // Increment DiscardedCount in SQL
        await IncrementDiscardedCountAsync(messageBody, queueName, cancellationToken);
    }

    /// <summary>
    /// Parse message body to extract vertical/processType and increment DiscardedCount in QueueCounters.
    /// </summary>
    private async Task IncrementDiscardedCountAsync(string? messageBody, string queueName, CancellationToken cancellationToken)
    {
        var dbContext = serviceProvider.GetService<DashboardDbContext>();
        if (dbContext == null)
        {
            logger.LogWarning("DashboardDbContext not available, skipping DiscardedCount increment");
            return;
        }

        // Parse body to extract vertical and processType
        string vertical = "Unknown";
        string processType = "Unknown";
        DateTime messageDate = DateTime.UtcNow.Date;

        if (!string.IsNullOrEmpty(messageBody))
        {
            try
            {
                using var doc = JsonDocument.Parse(messageBody);
                var root = doc.RootElement;
                if (root.TryGetProperty("vertical", out var v))
                    vertical = v.GetString() ?? vertical;
                if (root.TryGetProperty("processType", out var pt))
                    processType = pt.GetString() ?? processType;
                if (root.TryGetProperty("timestamp", out var ts) && DateTime.TryParse(ts.GetString(), out var parsedDate))
                    messageDate = parsedDate.Date;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to parse message body for discard counter");
            }
        }

        // Resolve the original queue name (strip topic/subscription format)
        var originalQueue = queueName.Contains('/') ? queueName.Split('/')[0] : queueName;
        // Map topic names back to the queue name used in SQL (e.g., nd-dashboard-events → weather-jobs)
        if (originalQueue == "nd-dashboard-events") originalQueue = "weather-jobs";

        try
        {
            // Try to update existing row
            var counter = await dbContext.QueueCounters
                .FirstOrDefaultAsync(q =>
                    q.Vertical == vertical &&
                    q.QueueName == originalQueue &&
                    q.ProcessType == processType &&
                    q.Date == messageDate,
                    cancellationToken);

            if (counter != null)
            {
                counter.DiscardedCount++;
                counter.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                // Create new row with just discarded count
                dbContext.QueueCounters.Add(new Data.Entities.QueueCounter
                {
                    Vertical = vertical,
                    QueueName = originalQueue,
                    ProcessType = processType,
                    Date = messageDate,
                    DiscardedCount = 1,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Incremented DiscardedCount for {Vertical}/{Queue}/{ProcessType}/{Date}",
                vertical, originalQueue, processType, messageDate);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to increment DiscardedCount");
        }
    }

    private ServiceBusReceiver CreateDlqReceiver(string queueName)
    {
        // Check if queueName has subscription format (topic/subscription)
        if (queueName.Contains('/'))
        {
            var parts = queueName.Split('/');
            return serviceBusClient.CreateReceiver(parts[0], parts[1], new ServiceBusReceiverOptions
            {
                SubQueue = SubQueue.DeadLetter
            });
        }
        else
        {
            return serviceBusClient.CreateReceiver(queueName, new ServiceBusReceiverOptions
            {
                SubQueue = SubQueue.DeadLetter
            });
        }
    }
}

