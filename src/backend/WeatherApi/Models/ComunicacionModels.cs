using System.Text.Json.Serialization;

namespace WeatherApi.Models;

/// <summary>
/// Comunicación document for CosmosDB (replaces PersonaDto).
/// Represents a digital notification (email/sms) with embedded events.
/// </summary>
public class ComunicacionDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("tipoProceso")]
    public string TipoProceso { get; set; } = string.Empty;

    [JsonPropertyName("canal")]
    public string Canal { get; set; } = string.Empty;

    [JsonPropertyName("contacto")]
    public string Contacto { get; set; } = string.Empty;

    [JsonPropertyName("parametros")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, object>? Parametros { get; set; }

    [JsonPropertyName("template")]
    public string? Template { get; set; }

    [JsonPropertyName("estado")]
    public string Estado { get; set; } = "pending";

    [JsonPropertyName("fechaCreacion")]
    public DateTime FechaCreacion { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("fechaUltimaModif")]
    public DateTime FechaUltimaModif { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("eventos")]
    public List<EventoDto> Eventos { get; set; } = [];

    [JsonPropertyName("ttl")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Ttl { get; set; }
}

public class EventoDto
{
    [JsonPropertyName("tipo")]
    public string Tipo { get; set; } = string.Empty;

    [JsonPropertyName("fecha")]
    public DateTime Fecha { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Request to create a new Comunicación.
/// </summary>
public class CreateComunicacionRequest
{
    public string TipoProceso { get; set; } = string.Empty;
    public string Canal { get; set; } = string.Empty;
    public string Contacto { get; set; } = string.Empty;
    public string? Template { get; set; }
    public Dictionary<string, object>? Parametros { get; set; }
    public int? Ttl { get; set; }
}

/// <summary>
/// Request to update an existing Comunicación.
/// </summary>
public class UpdateComunicacionRequest
{
    public string TipoProceso { get; set; } = string.Empty;
    public string Canal { get; set; } = string.Empty;
    public string Contacto { get; set; } = string.Empty;
    public string? Template { get; set; }
    public Dictionary<string, object>? Parametros { get; set; }
    public int? Ttl { get; set; }
}

/// <summary>
/// Request to add an event to a Comunicación.
/// </summary>
public class AgregarEventoRequest
{
    public string Tipo { get; set; } = string.Empty;
    public DateTime? Fecha { get; set; }
}
