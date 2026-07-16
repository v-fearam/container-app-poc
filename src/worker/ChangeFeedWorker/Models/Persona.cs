using Newtonsoft.Json;

namespace ChangeFeedWorker.Models;

/// <summary>
/// Persona document from CosmosDB.
/// Must match the schema in the backend and Cosmos container.
/// </summary>
public class Persona
{
    [JsonProperty("id")]
    public string Id { get; set; } = string.Empty;

    [JsonProperty("nombre")]
    public string Nombre { get; set; } = string.Empty;

    [JsonProperty("apellido")]
    public string Apellido { get; set; } = string.Empty;

    [JsonProperty("email")]
    public string? Email { get; set; }

    [JsonProperty("edad")]
    public int? Edad { get; set; }

    [JsonProperty("ciudad")]
    public string? Ciudad { get; set; }

    [JsonProperty("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}
