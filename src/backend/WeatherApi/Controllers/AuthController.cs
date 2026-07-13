using Microsoft.AspNetCore.Mvc;
using WeatherApi.Attributes;
using WeatherApi.Models;
using WeatherApi.Services;

namespace WeatherApi.Controllers;

/// <summary>
/// Handles authentication and user identity endpoints.
/// </summary>
[ApiController]
public class AuthController(
    IEasyAuthService easyAuthService,
    ILogger<AuthController> logger) : ControllerBase
{

    /// <summary>
    /// Returns information about the currently authenticated user.
    /// </summary>
    [HttpGet("/userinfo")]
    [ProducesResponseType(typeof(UserInfo), StatusCodes.Status200OK)]
    public IActionResult GetUserInfo()
    {
        var principal = easyAuthService.GetClientPrincipal();

        if (principal == null)
        {
            logger.LogWarning("Userinfo requested without authentication");
            return Ok(new UserInfo
            {
                IsAuthenticated = false,
                Message = "Usuario no autenticado (Easy Auth no configurado o en desarrollo local)"
            });
        }

        var email = easyAuthService.GetUserEmail();
        var name = easyAuthService.GetUserName();
        var roles = easyAuthService.GetRoles();

        logger.LogInformation("Userinfo requested by {User} with roles [{Roles}]", email ?? name, string.Join(", ", roles));

        return Ok(new UserInfo
        {
            IsAuthenticated = true,
            Email = email,
            Name = name,
            UserId = principal.UserId,
            Roles = roles,
            Message = roles.Count > 0
                ? $"Usuario con rol: {string.Join(", ", roles)}"
                : "Usuario sin roles asignados"
        });
    }

    /// <summary>
    /// Returns the list of roles assigned to the authenticated user.
    /// </summary>
    [HttpGet("/roles")]
    [RequireAuth]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult GetRoles()
    {
        var roles = easyAuthService.GetRoles();
        var user = easyAuthService.GetUserEmail() ?? "unknown";
        logger.LogInformation("Roles endpoint accessed by {User}: [{Roles}]", user, string.Join(", ", roles));
        return Ok(new { roles });
    }
}
