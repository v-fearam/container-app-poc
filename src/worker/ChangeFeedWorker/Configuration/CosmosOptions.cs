namespace ChangeFeedWorker.Configuration;

/// <summary>
/// Configuration options for CosmosDB connection.
/// Follows Options pattern — bound from appsettings.json "Cosmos" section.
/// </summary>
public class CosmosOptions
{
    public const string SectionName = "Cosmos";

    /// <summary>
    /// CosmosDB account endpoint (e.g., https://xxx.documents.azure.com:443/).
    /// </summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>
    /// Database name.
    /// </summary>
    public string Database { get; set; } = string.Empty;

    /// <summary>
    /// Collection to monitor (configurable per vertical in production).
    /// </summary>
    public string Collection { get; set; } = string.Empty;

    /// <summary>
    /// Unique processor name for leases (must be unique per collection).
    /// </summary>
    public string ProcessorName { get; set; } = string.Empty;

    /// <summary>
    /// Vertical name for dashboard events and metrics (e.g., "personas", "genericos").
    /// </summary>
    public string VerticalName { get; set; } = string.Empty;
}
