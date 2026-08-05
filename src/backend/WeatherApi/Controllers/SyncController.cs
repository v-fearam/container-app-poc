using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using WeatherApi.Data;
using WeatherApi.Models;

namespace WeatherApi.Controllers;

/// <summary>
/// Endpoints for querying the star model in SQL (replaces PersonasSync).
/// Shows comunicaciones synced from Cosmos via Change Feed → Stored Procedure.
/// </summary>
[ApiController]
[Route("api/sync")]
public class SyncController(DashboardDbContext? dbContext, ILogger<SyncController> logger) : ControllerBase
{
    /// <summary>
    /// Gets comunicaciones from the star model View with dimensions resolved.
    /// </summary>
    [HttpGet("comunicaciones")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> GetSyncedComunicaciones([FromQuery] int limit = 100)
    {
        if (dbContext == null)
        {
            logger.LogWarning("SQL Database not configured");
            return StatusCode(503, new { error = "SQL Database not configured" });
        }

        limit = Math.Min(limit, 500);

        var comunicaciones = await dbContext.Database
            .SqlQueryRaw<ComunicacionSyncDto>(
                "SELECT TOP({0}) id, cosmosId, fechaCreacion, fechaUltimaModif, parametros, diaCreacion, tipoProceso, canal, contacto, tipoContacto, estado, fechaDate, cantEventos FROM vw_ComunicacionesConDims ORDER BY fechaUltimaModif DESC",
                limit)
            .ToListAsync();

        return Ok(new
        {
            items = comunicaciones,
            continuationToken = (string?)null,
            count = comunicaciones.Count
        });
    }
}
