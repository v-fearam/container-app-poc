using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WeatherApi.Data;
using WeatherApi.Models;
using WeatherApi.Services;

namespace WeatherApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController(
    IServiceProvider serviceProvider,
    DashboardDbContext? dbContext,
    ILogger<DashboardController> logger) : ControllerBase
{

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
        var dashboardService = serviceProvider.GetService<IDashboardService>();
        if (dashboardService is null)
            return StatusCode(503, new { error = "ServiceUnavailable", message = "Dashboard service not configured (SQL_CONNECTION_STRING or ServiceBus:Namespace missing)" });

        var targetDate = fecha ?? DateTime.UtcNow.Date;
        var targetVertical = vertical ?? "Vertical1";

        logger.LogInformation("Getting Dashboard KPI for date={Date} vertical={Vertical}", targetDate, targetVertical);

        var kpiResults = await dashboardService.GetKpiAsync(targetDate, targetVertical, cancellationToken);
        return Ok(kpiResults);
    }

    /// <summary>
    /// Get Change Feed counters (daily aggregated stats per collection).
    /// </summary>
    /// <param name="days">Number of days to retrieve (default 7, max 30)</param>
    [HttpGet("changefeed")]
    [ProducesResponseType(typeof(List<ChangeFeedCounterDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> GetChangeFeedCounters([FromQuery] int days = 7)
    {
        if (dbContext == null)
        {
            logger.LogWarning("SQL Database not configured");
            return StatusCode(503, new { error = "SQL Database not configured" });
        }

        days = Math.Min(days, 30); // Cap at 30 days
        var cutoffDate = DateTime.UtcNow.Date.AddDays(-days);

        var counters = await dbContext.ChangeFeedCounters
            .Where(c => c.Date >= cutoffDate)
            .OrderByDescending(c => c.Date)
            .ThenBy(c => c.Collection)
            .Select(c => new ChangeFeedCounterDto
            {
                Collection = c.Collection,
                Date = c.Date,
                SuccessCount = c.SuccessCount,
                ErrorCount = c.ErrorCount,
                UpdatedAt = c.UpdatedAt
            })
            .ToListAsync();

        return Ok(counters);
    }
}
