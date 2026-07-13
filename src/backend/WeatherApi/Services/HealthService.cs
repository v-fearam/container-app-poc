using Microsoft.EntityFrameworkCore;
using WeatherApi.Data;
using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Health service implementation for component monitoring
/// </summary>
public class HealthService(
    DashboardDbContext dbContext,
    ILogger<HealthService> logger) : IHealthService
{

    public async Task<IEnumerable<ComponentHealthDto>> GetComponentHealthAsync(
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Getting component health status");

        // EF Core: AsNoTracking for read-only query with projection
        var components = await dbContext.ComponentHealth
            .AsNoTracking()
            .OrderBy(c => c.ComponentName)
            .ThenByDescending(c => c.LastHeartbeat)
            .Select(c => new ComponentHealthDto
            {
                ComponentName = c.ComponentName,
                Status = c.Status,
                LastHeartbeat = c.LastHeartbeat,
                Metadata = c.Metadata
            })
            .ToListAsync(cancellationToken);

        return components;
    }
}

