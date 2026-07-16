using ChangeFeedWorker.Models;

namespace ChangeFeedWorker.Services;

/// <summary>
/// Handles Change Feed events: syncs Personas to SQL and publishes dashboard events.
/// </summary>
public interface IChangeFeedHandler
{
    /// <summary>
    /// Processes a batch of Persona documents from the Change Feed.
    /// Upserts each one to SQL (idempotent by CosmosUpdatedAt) and publishes events to Service Bus.
    /// </summary>
    /// <param name="personas">Batch of Persona documents from Cosmos</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task ProcessBatchAsync(IReadOnlyCollection<Persona> personas, CancellationToken cancellationToken);
}
