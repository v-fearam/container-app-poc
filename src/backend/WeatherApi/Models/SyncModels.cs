namespace WeatherApi.Models;

/// <summary>
/// DTO for comunicación from SQL star model View (vw_ComunicacionesConDims).
/// Property names MUST match View column aliases exactly (case-insensitive).
/// </summary>
public record ComunicacionSyncDto
{
    public long Id { get; init; }
    public string CosmosId { get; init; } = string.Empty;
    public DateTime FechaCreacion { get; init; }
    public DateTime FechaUltimaModif { get; init; }
    public string? Parametros { get; init; }
    public int DiaCreacion { get; init; }
    public string TipoProceso { get; init; } = string.Empty;
    public string Canal { get; init; } = string.Empty;
    public string Contacto { get; init; } = string.Empty;
    public string TipoContacto { get; init; } = string.Empty;
    public string Estado { get; init; } = string.Empty;
    public DateTime FechaDate { get; init; }
    public int CantEventos { get; init; }
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
