using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using WeatherApi.Helpers;
using WeatherApi.Models;

namespace WeatherApi.Controllers;

/// <summary>
/// CRUD operations for Comunicaciones in CosmosDB.
/// Replaces CosmosPersonasController for the star model POC.
/// </summary>
[ApiController]
[Route("api/cosmos/comunicaciones")]
public class CosmosComunicacionesController(
    CosmosClient? cosmosClient,
    IConfiguration configuration,
    ILogger<CosmosComunicacionesController> logger) : ControllerBase
{
    private readonly string _databaseName = configuration["Cosmos:Database"] ?? "change-feed-poc";
    private readonly string _containerName = configuration["Cosmos:Collection"] ?? "comunicaciones";

    private Container? GetContainer()
    {
        if (cosmosClient == null)
        {
            logger.LogWarning("CosmosClient not configured — skipping Cosmos operation");
            return null;
        }
        return cosmosClient.GetContainer(_databaseName, _containerName);
    }

    [HttpGet]
    public async Task<IActionResult> ListComunicaciones(
        [FromQuery] int maxItems = 100,
        [FromQuery] string? continuationToken = null,
        CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        try
        {
            var query = new QueryDefinition("SELECT * FROM c ORDER BY c.fechaUltimaModif DESC");
            var options = new QueryRequestOptions { MaxItemCount = maxItems };

            var iterator = container.GetItemQueryIterator<ComunicacionDto>(
                query, continuationToken, options);
            var response = await iterator.ReadNextAsync(ct);

            return Ok(new
            {
                items = response.Resource,
                continuationToken = response.ContinuationToken,
                count = response.Count
            });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Failed to list comunicaciones from Cosmos");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetComunicacion(string id, CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        try
        {
            var response = await container.ReadItemAsync<ComunicacionDto>(
                id, new PartitionKey(id), cancellationToken: ct);
            return Ok(response.Resource);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { error = $"Comunicación with id '{id}' not found" });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Failed to get comunicación {Id} from Cosmos", LogSanitizer.Sanitize(id));
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateComunicacion(
        [FromBody] CreateComunicacionRequest request,
        CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        var comunicacion = new ComunicacionDto
        {
            Id = $"com-{Guid.NewGuid()}",
            TipoProceso = request.TipoProceso,
            Canal = request.Canal,
            Contacto = request.Contacto,
            Template = request.Template,
            Parametros = request.Parametros,
            Estado = "pending",
            FechaCreacion = DateTime.UtcNow,
            FechaUltimaModif = DateTime.UtcNow,
            Eventos = [],
            Ttl = request.Ttl
        };

        try
        {
            var response = await container.CreateItemAsync(
                comunicacion, new PartitionKey(comunicacion.Id), cancellationToken: ct);

            logger.LogInformation("Created comunicación {Id} in Cosmos", comunicacion.Id);
            return CreatedAtAction(
                nameof(GetComunicacion),
                new { id = comunicacion.Id },
                response.Resource);
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Failed to create comunicación in Cosmos");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateComunicacion(
        string id,
        [FromBody] UpdateComunicacionRequest request,
        CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        try
        {
            var existing = await container.ReadItemAsync<ComunicacionDto>(
                id, new PartitionKey(id), cancellationToken: ct);

            var updated = existing.Resource;
            updated.TipoProceso = request.TipoProceso;
            updated.Canal = request.Canal;
            updated.Contacto = request.Contacto;
            updated.Template = request.Template;
            updated.Parametros = request.Parametros;
            updated.Ttl = request.Ttl;
            updated.FechaUltimaModif = DateTime.UtcNow;

            var response = await container.ReplaceItemAsync(
                updated, id, new PartitionKey(id), cancellationToken: ct);

            logger.LogInformation("Updated comunicación {Id} in Cosmos", LogSanitizer.Sanitize(id));
            return Ok(response.Resource);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { error = $"Comunicación with id '{id}' not found" });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Failed to update comunicación {Id} in Cosmos", LogSanitizer.Sanitize(id));
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Add an event to an existing Comunicación.
    /// Replaces event if same tipo already exists (no duplicates by tipo).
    /// Updates estado to the new event tipo.
    /// </summary>
    [HttpPost("{id}/eventos")]
    public async Task<IActionResult> AgregarEvento(
        string id,
        [FromBody] AgregarEventoRequest request,
        CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        if (string.IsNullOrWhiteSpace(request.Tipo))
            return BadRequest(new { error = "Tipo de evento es requerido" });

        try
        {
            var existing = await container.ReadItemAsync<ComunicacionDto>(
                id, new PartitionKey(id), cancellationToken: ct);

            var comunicacion = existing.Resource;

            var nuevoEvento = new EventoDto
            {
                Tipo = request.Tipo,
                Fecha = request.Fecha ?? DateTime.UtcNow
            };

            // Replace if same tipo exists, otherwise add
            var existingEventIndex = comunicacion.Eventos.FindIndex(e => e.Tipo == request.Tipo);
            if (existingEventIndex >= 0)
                comunicacion.Eventos[existingEventIndex] = nuevoEvento;
            else
                comunicacion.Eventos.Add(nuevoEvento);

            comunicacion.Estado = request.Tipo;
            comunicacion.FechaUltimaModif = DateTime.UtcNow;

            var response = await container.ReplaceItemAsync(
                comunicacion, id, new PartitionKey(id), cancellationToken: ct);

            logger.LogInformation("Added event '{Tipo}' to comunicación {Id}", LogSanitizer.Sanitize(request.Tipo), LogSanitizer.Sanitize(id));
            return Ok(response.Resource);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { error = $"Comunicación with id '{id}' not found" });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Failed to add event to comunicación {Id}", LogSanitizer.Sanitize(id));
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteComunicacion(string id, CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        try
        {
            await container.DeleteItemAsync<ComunicacionDto>(
                id, new PartitionKey(id), cancellationToken: ct);

            logger.LogInformation("Deleted comunicación {Id} from Cosmos", LogSanitizer.Sanitize(id));
            return NoContent();
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { error = $"Comunicación with id '{id}' not found" });
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Failed to delete comunicación {Id} from Cosmos", LogSanitizer.Sanitize(id));
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
