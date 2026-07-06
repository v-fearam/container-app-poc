namespace WeatherApi.Models;

/// <summary>
/// Standard weather forecast response including the requesting user's role.
/// </summary>
public record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary, string UserRole)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

/// <summary>
/// Extended weather forecast for admin endpoints with additional metadata.
/// </summary>
public record AdminWeatherForecast(DateOnly Date, int TemperatureC, string? Summary, string UserRole, string RequestedBy, int ClaimsCount)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
