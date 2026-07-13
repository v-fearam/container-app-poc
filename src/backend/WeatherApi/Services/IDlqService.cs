using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Service for DLQ (Dead Letter Queue) management operations
/// </summary>
public interface IDlqService
{
    /// <summary>
    /// Peek messages from a DLQ without removing them
    /// </summary>
    Task<IEnumerable<DlqMessageDto>> PeekDlqMessagesAsync(
        string queueName,
        int maxMessages = 10,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Requeue messages from DLQ to original queue
    /// </summary>
    Task<int> RequeueMessagesAsync(
        string queueName,
        IEnumerable<RequeueDlqMessageRequest> requests,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Discard (complete) messages from DLQ
    /// </summary>
    Task<int> DiscardMessagesAsync(
        string queueName,
        IEnumerable<DiscardDlqMessageRequest> requests,
        CancellationToken cancellationToken = default);
}
