using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WeatherApi.Data;
using WeatherApi.Models;

namespace WeatherApi.Controllers;

/// <summary>
/// Endpoints for querying synced data from SQL (PersonasSync table).
/// Shows what the Change Feed Processor has synced from Cosmos → SQL.
/// </summary>
[ApiController]
[Route("api/sync")]
public class SyncController : ControllerBase
{
    private readonly DashboardDbContext? _dbContext;
    private readonly ILogger<SyncController> _logger;

    public SyncController(DashboardDbContext? dbContext, ILogger<SyncController> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    /// <summary>
    /// Gets all synced Personas from SQL, ordered by most recently synced first.
    /// </summary>
    /// <param name="limit">Max results to return (default 100, max 500)</param>
    [HttpGet("personas")]
    [ProducesResponseType(typeof(List<PersonaSyncDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> GetSyncedPersonas([FromQuery] int limit = 100)
    {
        if (_dbContext == null)
        {
            _logger.LogWarning("SQL Database not configured");
            return StatusCode(503, new { error = "SQL Database not configured" });
        }

        limit = Math.Min(limit, 500); // Cap at 500

        var personas = await _dbContext.PersonasSync
            .OrderByDescending(p => p.SyncedAt)
            .Take(limit)
            .Select(p => new PersonaSyncDto
            {
                Id = p.Id,
                Nombre = p.Nombre,
                Apellido = p.Apellido,
                Email = p.Email,
                Edad = p.Edad,
                Ciudad = p.Ciudad,
                CosmosUpdatedAt = p.CosmosUpdatedAt,
                SyncedAt = p.SyncedAt,
                SyncVersion = p.SyncVersion
            })
            .ToListAsync();

        return Ok(new
        {
            items = personas,
            continuationToken = (string?)null,
            count = personas.Count
        });
    }

    /// <summary>
    /// Gets a specific synced Persona by ID.
    /// </summary>
    [HttpGet("personas/{id}")]
    [ProducesResponseType(typeof(PersonaSyncDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> GetSyncedPersonaById(string id)
    {
        if (_dbContext == null)
        {
            _logger.LogWarning("SQL Database not configured");
            return StatusCode(503, new { error = "SQL Database not configured" });
        }

        var persona = await _dbContext.PersonasSync
            .Where(p => p.Id == id)
            .Select(p => new PersonaSyncDto
            {
                Id = p.Id,
                Nombre = p.Nombre,
                Apellido = p.Apellido,
                Email = p.Email,
                Edad = p.Edad,
                Ciudad = p.Ciudad,
                CosmosUpdatedAt = p.CosmosUpdatedAt,
                SyncedAt = p.SyncedAt,
                SyncVersion = p.SyncVersion
            })
            .FirstOrDefaultAsync();

        if (persona == null)
            return NotFound();

        return Ok(persona);
    }
}
