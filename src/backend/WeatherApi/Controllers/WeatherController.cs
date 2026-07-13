using Microsoft.AspNetCore.Mvc;
using WeatherApi.Attributes;
using WeatherApi.Models;
using WeatherApi.Services;

namespace WeatherApi.Controllers;

/// <summary>
/// Provides weather forecast data, gated by Easy Auth roles.
/// </summary>
[ApiController]
[Route("weatherforecast")]
public class WeatherController : ControllerBase
{
    private static readonly string[] Summaries =
    [
        "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
    ];

    private readonly IEasyAuthService _easyAuthService;
    private readonly ILogger<WeatherController> _logger;

    public WeatherController(IEasyAuthService easyAuthService, ILogger<WeatherController> logger)
    {
        _easyAuthService = easyAuthService;
        _logger = logger;
    }

    /// <summary>
    /// Returns a 5-day weather forecast. Works without auth; includes role info if logged in.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(WeatherForecast[]), StatusCodes.Status200OK)]
    public IActionResult Get()
    {
        var principal = _easyAuthService.GetClientPrincipal();
        var userRole = "";

        if (principal != null)
        {
            var user = principal.UserDetails ?? principal.UserId ?? "anonymous";
            var roleClaim = principal.Claims?.FirstOrDefault(c => c.Typ == "roles");
            userRole = roleClaim?.Val ?? "";
            _logger.LogInformation("Weather forecast requested by {User} with role {Role}", user, userRole);
        }
        else
        {
            _logger.LogInformation("Weather forecast requested without authentication");
        }

        var forecast = Enumerable.Range(1, 5).Select(index =>
            new WeatherForecast(
                DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
                Random.Shared.Next(-20, 55),
                Summaries[Random.Shared.Next(Summaries.Length)],
                userRole
            )).ToArray();

        return Ok(forecast);
    }

    /// <summary>
    /// Returns a 5-day weather forecast restricted to users with the "User" role.
    /// </summary>
    [HttpGet("user")]
    [RequireRole("User")]
    [ProducesResponseType(typeof(WeatherForecast[]), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public IActionResult GetForUser()
    {
        var user = _easyAuthService.GetUserEmail() ?? "unknown";
        _logger.LogInformation("User-role endpoint accessed by {User}", user);

        var forecast = Enumerable.Range(1, 5).Select(index =>
            new WeatherForecast(
                DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
                Random.Shared.Next(-20, 55),
                Summaries[Random.Shared.Next(Summaries.Length)],
                "User"
            )).ToArray();

        return Ok(forecast);
    }

    /// <summary>
    /// Returns a 5-day weather forecast with admin metadata, restricted to the "Admin" role.
    /// </summary>
    [HttpGet("admin")]
    [RequireRole("Admin")]
    [ProducesResponseType(typeof(AdminWeatherForecast[]), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public IActionResult GetForAdmin()
    {
        var principal = _easyAuthService.GetClientPrincipal()!;
        var requestedBy = principal.UserDetails ?? principal.UserId ?? "unknown";
        var claimsCount = principal.Claims?.Count ?? 0;

        _logger.LogInformation("Admin endpoint accessed by {User} with {ClaimsCount} claims", requestedBy, claimsCount);

        var forecast = Enumerable.Range(1, 5).Select(index =>
            new AdminWeatherForecast(
                DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
                Random.Shared.Next(-20, 55),
                Summaries[Random.Shared.Next(Summaries.Length)],
                "Admin",
                requestedBy,
                claimsCount
            )).ToArray();

        return Ok(forecast);
    }
}
