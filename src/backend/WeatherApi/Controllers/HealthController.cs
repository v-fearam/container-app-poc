using Microsoft.AspNetCore.Mvc;
using WeatherApi.Models;
using WeatherApi.Services;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController(
    IInfrastructureHealthService infraHealthService,
    ILogger<HealthController> logger) : ControllerBase
{
    /// <summary>
    /// Get infrastructure health: Container Apps status/replicas + Service Bus queue depths
    /// </summary>
    [HttpGet("infrastructure")]
    [ProducesResponseType(typeof(InfrastructureHealthResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetInfrastructureHealth(CancellationToken cancellationToken = default)
    {
        var result = await infraHealthService.GetInfrastructureHealthAsync(cancellationToken);
        return Ok(result);
    }
}
