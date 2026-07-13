using Azure.Messaging.ServiceBus;
using System.Text;
using System.Text.Json;
using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// DLQ management service implementation
/// </summary>
public class DlqService(
    ServiceBusClient serviceBusClient,
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

            // Complete (delete) the target message
            await dlqReceiver.CompleteMessageAsync(targetMessage, cancellationToken);

            // Abandon other received messages
            foreach (var msg in receivedMessages.Where(m => m.MessageId != request.MessageId))
            {
                await dlqReceiver.AbandonMessageAsync(msg, cancellationToken: cancellationToken);
            }
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

