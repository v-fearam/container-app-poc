namespace WeatherApi.Models;

/// <summary>
/// Persona document for CosmosDB.
/// Used for Change Feed POC.
/// </summary>
public class PersonaDto
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Nombre { get; set; } = string.Empty;
    public string Apellido { get; set; } = string.Empty;
    public string? Email { get; set; }
    public int? Edad { get; set; }
    public string? Ciudad { get; set; }
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
