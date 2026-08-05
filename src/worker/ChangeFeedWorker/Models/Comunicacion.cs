using Newtonsoft.Json;

namespace ChangeFeedWorker.Models;

/// <summary>
/// Comunicación document from CosmosDB.
/// Uses Newtonsoft.Json because the worker's CosmosClient has no custom serializer.
/// </summary>
public class Comunicacion
{
    [JsonProperty("id")]
    public string Id { get; set; } = string.Empty;

    [JsonProperty("tipoProceso")]
    public string TipoProceso { get; set; } = string.Empty;

    [JsonProperty("canal")]
    public string Canal { get; set; } = string.Empty;

    [JsonProperty("contacto")]
    public string Contacto { get; set; } = string.Empty;

    [JsonProperty("parametros")]
    public Dictionary<string, object>? Parametros { get; set; }

    [JsonProperty("template")]
    public string? Template { get; set; }

    [JsonProperty("estado")]
    public string Estado { get; set; } = "pending";

    [JsonProperty("fechaCreacion")]
    public DateTime FechaCreacion { get; set; }

    [JsonProperty("fechaUltimaModif")]
    public DateTime FechaUltimaModif { get; set; }

    [JsonProperty("eventos")]
    public List<Evento> Eventos { get; set; } = [];

    [JsonProperty("ttl")]
    public int? Ttl { get; set; }
}

public class Evento
{
    [JsonProperty("tipo")]
    public string Tipo { get; set; } = string.Empty;

    [JsonProperty("fecha")]
    public DateTime Fecha { get; set; }
}
