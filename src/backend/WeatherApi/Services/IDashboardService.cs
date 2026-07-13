using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Service for dashboard KPI operations
/// </summary>
public interface IDashboardService
{
    /// <summary>
    /// Get dashboard KPI for a specific date and vertical
    /// </summary>
    Task<IEnumerable<DashboardKpiResponse>> GetKpiAsync(
        DateTime date, 
        string vertical, 
        CancellationToken cancellationToken = default);
}
