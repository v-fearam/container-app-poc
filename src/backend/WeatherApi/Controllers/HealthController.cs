using Microsoft.AspNetCore.Mvc;
using WeatherApi.Models;
using WeatherApi.Services;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly IHealthService _healthService;
    private readonly ILogger<HealthController> _logger;

    public HealthController(
        IHealthService healthService,
        ILogger<HealthController> logger)
    {
        _healthService = healthService;
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
            var components = await _healthService.GetComponentHealthAsync(cancellationToken);
            return Ok(components);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting component health");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to retrieve component health" });
        }
    }
}
