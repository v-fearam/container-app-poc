namespace WeatherApi.Models;

/// <summary>
/// Response model for the /userinfo endpoint.
/// </summary>
public record UserInfo
{
    public bool IsAuthenticated { get; init; }
    public string? Email { get; init; }
    public string? Name { get; init; }
    public string? UserId { get; init; }
    public List<string>? Roles { get; init; }
    public string? Message { get; init; }
}
