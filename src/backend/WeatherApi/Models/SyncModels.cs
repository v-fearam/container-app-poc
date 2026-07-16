namespace WeatherApi.Models;

/// <summary>
/// DTO for synced Persona from SQL (read from PersonasSync table).
/// </summary>
public record PersonaSyncDto
{
    public string Id { get; init; } = string.Empty;
    public string Nombre { get; init; } = string.Empty;
    public string Apellido { get; init; } = string.Empty;
    public string? Email { get; init; }
    public int? Edad { get; init; }
    public string? Ciudad { get; init; }
    public DateTime CosmosUpdatedAt { get; init; }
    public DateTime SyncedAt { get; init; }
    public int SyncVersion { get; init; }
}

/// <summary>
/// DTO for Change Feed counter (aggregated daily stats per collection).
/// </summary>
public record ChangeFeedCounterDto
{
    public string Collection { get; init; } = string.Empty;
    public DateTime Date { get; init; }
    public int SuccessCount { get; init; }
    public int ErrorCount { get; init; }
    public DateTime UpdatedAt { get; init; }
}
