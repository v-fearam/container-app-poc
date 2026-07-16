namespace WeatherApi.Data.Entities;

/// <summary>
/// Daily aggregated counters for Change Feed processing.
/// Tracks success and error counts per collection per day.
/// </summary>
public class ChangeFeedCounter
{
    public int Id { get; set; }

    /// <summary>
    /// CosmosDB collection name (e.g., "personas", "nd-genericos").
    /// </summary>
    public string Collection { get; set; } = string.Empty;

    /// <summary>
    /// Date for this counter (UTC, date-only).
    /// </summary>
    public DateTime Date { get; set; }

    /// <summary>
    /// Number of documents successfully processed today.
    /// </summary>
    public int SuccessCount { get; set; }

    /// <summary>
    /// Number of documents that failed processing today (went to error container).
    /// </summary>
    public int ErrorCount { get; set; }

    public DateTime UpdatedAt { get; set; }
}
