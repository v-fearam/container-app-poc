using Microsoft.AspNetCore.Mvc;
using WeatherApi.Models;
using WeatherApi.Services;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    private readonly IDashboardService _dashboardService;
    private readonly ILogger<DashboardController> _logger;

    public DashboardController(
        IDashboardService dashboardService,
        ILogger<DashboardController> logger)
    {
        _dashboardService = dashboardService;
        _logger = logger;
    }

    /// <summary>
    /// Get Dashboard KPI for a specific date and vertical
    /// Combines SQL counters + live DLQ count from Service Bus
    /// </summary>
    [HttpGet("kpi")]
    [ProducesResponseType(typeof(IEnumerable<DashboardKpiResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetKpi(
        [FromQuery] DateTime? fecha = null,
        [FromQuery] string? vertical = null,
        CancellationToken cancellationToken = default)
    {
        var targetDate = fecha ?? DateTime.UtcNow.Date;
        var targetVertical = vertical ?? "Vertical1";

        _logger.LogInformation("Getting Dashboard KPI for date={Date} vertical={Vertical}", targetDate, targetVertical);

        try
        {
            var kpiResults = await _dashboardService.GetKpiAsync(targetDate, targetVertical, cancellationToken);
            return Ok(kpiResults);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting Dashboard KPI");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to retrieve Dashboard KPI" });
        }
    }
}
