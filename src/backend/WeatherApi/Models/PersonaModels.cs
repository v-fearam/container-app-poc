using System.Text.Json.Serialization;

namespace WeatherApi.Models;

/// <summary>
/// Persona document for CosmosDB.
/// Used for Change Feed POC.
/// </summary>
public class PersonaDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    [JsonPropertyName("nombre")]
    public string Nombre { get; set; } = string.Empty;
    
    [JsonPropertyName("apellido")]
    public string Apellido { get; set; } = string.Empty;
    
    [JsonPropertyName("email")]
    public string? Email { get; set; }
    
    [JsonPropertyName("edad")]
    public int? Edad { get; set; }
    
    [JsonPropertyName("ciudad")]
    public string? Ciudad { get; set; }
    
    [JsonPropertyName("activo")]
    public bool Activo { get; set; } = true;
    
    [JsonPropertyName("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Request to create a new Persona.
/// </summary>
public class CreatePersonaRequest
{
    public string Nombre { get; set; } = string.Empty;
    public string Apellido { get; set; } = string.Empty;
    public string? Email { get; set; }
    public int? Edad { get; set; }
    public string? Ciudad { get; set; }
    public bool Activo { get; set; } = true;
}

/// <summary>
/// Request to update an existing Persona.
/// </summary>
public class UpdatePersonaRequest
{
    public string Nombre { get; set; } = string.Empty;
    public string Apellido { get; set; } = string.Empty;
    public string? Email { get; set; }
    public int? Edad { get; set; }
    public string? Ciudad { get; set; }
}
