using Microsoft.EntityFrameworkCore;
using WeatherApi.Data;
using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Health service implementation for component monitoring.
/// DashboardDbContext is optional — if SQL is not configured, returns empty list.
/// </summary>
public class HealthService(
    IServiceProvider serviceProvider,
    ILogger<HealthService> logger) : IHealthService
{

    public async Task<IEnumerable<ComponentHealthDto>> GetComponentHealthAsync(
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Getting component health status");

        var dbContext = serviceProvider.GetService<DashboardDbContext>();
        if (dbContext is null)
        {
            logger.LogWarning("DashboardDbContext not available (SQL_CONNECTION_STRING not configured)");
            return [];
        }

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

