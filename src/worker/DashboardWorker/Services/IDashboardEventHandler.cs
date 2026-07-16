using DashboardWorker.Models;

namespace DashboardWorker.Services;

/// <summary>
/// Handles dashboard events (business logic).
/// Separated from BackgroundService infrastructure for testability and SRP.
/// </summary>
public interface IDashboardEventHandler
{
    /// <summary>
    /// Process a dashboard event and persist the counter update.
    /// Returns a result indicating how the message should be settled.
    /// </summary>
    Task<MessageHandleResult> HandleAsync(DashboardEvent evt, CancellationToken cancellationToken);
}

/// <summary>
/// Indicates how the Service Bus message should be settled after handling.
/// </summary>
public enum MessageSettlement
{
    Complete,
    DeadLetter,
    Abandon
}

public record MessageHandleResult(MessageSettlement Settlement, string? DeadLetterReason = null, string? DeadLetterDescription = null);
