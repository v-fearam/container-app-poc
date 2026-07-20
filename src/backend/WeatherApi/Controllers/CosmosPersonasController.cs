using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using WeatherApi.Models;

namespace WeatherApi.Controllers;

/// <summary>
/// CRUD operations for Personas in CosmosDB.
/// Part of Change Feed POC.
/// </summary>
[ApiController]
[Route("api/cosmos/personas")]
public class CosmosPersonasController : ControllerBase
{
    private readonly CosmosClient? _cosmosClient;
    private readonly string _databaseName;
    private readonly string _containerName;
    private readonly ILogger<CosmosPersonasController> _logger;

    public CosmosPersonasController(
        CosmosClient? cosmosClient,
        IConfiguration configuration,
        ILogger<CosmosPersonasController> logger)
    {
        _cosmosClient = cosmosClient;
        _databaseName = configuration["Cosmos:Database"] ?? "change-feed-poc";
        _containerName = configuration["Cosmos:Collection"] ?? "personas";
        _logger = logger;
    }

    private Container? GetContainer()
    {
        if (_cosmosClient == null)
        {
            _logger.LogWarning("CosmosClient not configured — skipping Cosmos operation");
            return null;
        }
        return _cosmosClient.GetContainer(_databaseName, _containerName);
    }

    /// <summary>
    /// List all personas (with optional pagination).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> ListPersonas(
        [FromQuery] int maxItems = 100,
        [FromQuery] string? continuationToken = null,
        CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        try
        {
            var query = new QueryDefinition("SELECT * FROM c ORDER BY c.updatedAt DESC");
            var options = new QueryRequestOptions { MaxItemCount = maxItems };

            var iterator = container.GetItemQueryIterator<PersonaDto>(
                query,
                continuationToken,
                options);

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
            _logger.LogError(ex, "Failed to list personas from Cosmos");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get a persona by ID.
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetPersona(string id, CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        try
        {
            var response = await container.ReadItemAsync<PersonaDto>(
                id,
                new PartitionKey(id),
                cancellationToken: ct);

            return Ok(response.Resource);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { error = $"Persona with id '{id}' not found" });
        }
        catch (CosmosException ex)
        {
            _logger.LogError(ex, "Failed to get persona {Id} from Cosmos", id);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Create a new persona.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreatePersona(
        [FromBody] CreatePersonaRequest request,
        CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        var persona = new PersonaDto
        {
            Id = Guid.NewGuid().ToString(),
            Nombre = request.Nombre,
            Apellido = request.Apellido,
            Email = request.Email,
            Edad = request.Edad,
            Ciudad = request.Ciudad,
            Activo = request.Activo,
            UpdatedAt = DateTime.UtcNow,
            Ttl = request.Ttl
        };

        try
        {
            var response = await container.CreateItemAsync(
                persona,
                new PartitionKey(persona.Id),
                cancellationToken: ct);

            _logger.LogInformation("Created persona {Id} in Cosmos", persona.Id);
            return CreatedAtAction(
                nameof(GetPersona),
                new { id = persona.Id },
                response.Resource);
        }
        catch (CosmosException ex)
        {
            _logger.LogError(ex, "Failed to create persona in Cosmos");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Update an existing persona.
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdatePersona(
        string id,
        [FromBody] UpdatePersonaRequest request,
        CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        try
        {
            // Read existing to preserve createdAt if it exists
            var existing = await container.ReadItemAsync<PersonaDto>(
                id,
                new PartitionKey(id),
                cancellationToken: ct);

            var updated = existing.Resource;
            updated.Nombre = request.Nombre;
            updated.Apellido = request.Apellido;
            updated.Email = request.Email;
            updated.Edad = request.Edad;
            updated.Ciudad = request.Ciudad;
            updated.Ttl = request.Ttl;
            updated.UpdatedAt = DateTime.UtcNow;

            var response = await container.ReplaceItemAsync(
                updated,
                id,
                new PartitionKey(id),
                cancellationToken: ct);

            _logger.LogInformation("Updated persona {Id} in Cosmos", id);
            return Ok(response.Resource);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { error = $"Persona with id '{id}' not found" });
        }
        catch (CosmosException ex)
        {
            _logger.LogError(ex, "Failed to update persona {Id} in Cosmos", id);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Delete a persona.
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePersona(string id, CancellationToken ct = default)
    {
        var container = GetContainer();
        if (container == null)
            return StatusCode(503, new { error = "Cosmos DB not configured" });

        try
        {
            await container.DeleteItemAsync<PersonaDto>(
                id,
                new PartitionKey(id),
                cancellationToken: ct);

            _logger.LogInformation("Deleted persona {Id} from Cosmos", id);
            return NoContent();
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { error = $"Persona with id '{id}' not found" });
        }
        catch (CosmosException ex)
        {
            _logger.LogError(ex, "Failed to delete persona {Id} from Cosmos", id);
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
