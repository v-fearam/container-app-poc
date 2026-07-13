using Microsoft.EntityFrameworkCore;
using WeatherApi.Data;
using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Health service implementation for component monitoring
/// </summary>
public class HealthService : IHealthService
{
    private readonly DashboardDbContext _dbContext;
    private readonly ILogger<HealthService> _logger;

    public HealthService(
        DashboardDbContext dbContext,
        ILogger<HealthService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<IEnumerable<ComponentHealthDto>> GetComponentHealthAsync(
        CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Getting component health status");

        // EF Core: AsNoTracking for read-only query with projection
        var components = await _dbContext.ComponentHealth
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
