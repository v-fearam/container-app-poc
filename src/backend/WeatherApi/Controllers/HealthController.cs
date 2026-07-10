using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using WeatherApi.Models;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<HealthController> _logger;

    public HealthController(IConfiguration configuration, ILogger<HealthController> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Get component health status from SQL (worker heartbeats)
    /// </summary>
    [HttpGet("components")]
    [ProducesResponseType(typeof(IEnumerable<ComponentHealthDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetComponentHealth(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Getting component health status");

        try
        {
            var connectionString = _configuration["SQL_CONNECTION_STRING"] 
                ?? throw new InvalidOperationException("SQL_CONNECTION_STRING not configured");

            var components = new List<ComponentHealthDto>();

            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);

            var query = @"
                SELECT ComponentName, ComponentType, InstanceId, Status, LastHeartbeat, Version
                FROM dbo.ComponentHealth
                ORDER BY ComponentType, ComponentName, LastHeartbeat DESC";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync(cancellationToken);

            while (await reader.ReadAsync(cancellationToken))
            {
                components.Add(new ComponentHealthDto
                {
                    ComponentName = reader.GetString(0),
                    ComponentType = reader.GetString(1),
                    InstanceId = reader.GetString(2),
                    Status = reader.GetString(3),
                    LastHeartbeat = reader.GetDateTime(4),
                    Version = reader.IsDBNull(5) ? null : reader.GetString(5)
                });
            }

            return Ok(components);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting component health");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to retrieve component health" });
        }
    }
}
