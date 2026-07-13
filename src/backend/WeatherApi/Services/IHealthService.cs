using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Service for component health operations
/// </summary>
public interface IHealthService
{
    /// <summary>
    /// Get all component health statuses
    /// </summary>
    Task<IEnumerable<ComponentHealthDto>> GetComponentHealthAsync(
        CancellationToken cancellationToken = default);
}
