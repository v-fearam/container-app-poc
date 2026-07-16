namespace WeatherApi.Data.Entities;

/// <summary>
/// Synchronized copy of Persona documents from CosmosDB.
/// Updated via Change Feed Processor with idempotency by CosmosUpdatedAt timestamp.
/// </summary>
public class PersonaSync
{
    /// <summary>
    /// CosmosDB document id (partition key in Cosmos).
    /// </summary>
    public string Id { get; set; } = string.Empty;

    public string Nombre { get; set; } = string.Empty;

    public string Apellido { get; set; } = string.Empty;

    public string? Email { get; set; }

    public int? Edad { get; set; }

    public string? Ciudad { get; set; }

    /// <summary>
    /// Timestamp from CosmosDB document (updatedAt field).
    /// Used for idempotency: only sync if this is newer than current SQL value.
    /// </summary>
    public DateTime CosmosUpdatedAt { get; set; }

    /// <summary>
    /// When this record was last synced from Cosmos to SQL.
    /// </summary>
    public DateTime SyncedAt { get; set; }

    /// <summary>
    /// Incremented on each sync (for tracking update frequency).
    /// </summary>
    public int SyncVersion { get; set; }
}
