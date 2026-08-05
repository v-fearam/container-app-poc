using ChangeFeedWorker.Models;

namespace ChangeFeedWorker.Services;

/// <summary>
/// Handles Change Feed events: syncs Comunicaciones to SQL star model and publishes dashboard events.
/// </summary>
public interface IChangeFeedHandler
{
    /// <summary>
    /// Processes a batch of Comunicación documents from the Change Feed.
    /// Calls SP usp_UpsertComunicacionGenerica for each and publishes events to Service Bus.
    /// </summary>
    Task ProcessBatchAsync(IReadOnlyCollection<Comunicacion> comunicaciones, CancellationToken cancellationToken);
}
