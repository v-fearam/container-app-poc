namespace WeatherApi.Data.Entities;

/// <summary>
/// Component health tracking entity for worker heartbeats.
/// </summary>
public class ComponentHealth
{
    public int Id { get; set; }
    public string ComponentName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime LastHeartbeat { get; set; }
    public string? Metadata { get; set; }
}
