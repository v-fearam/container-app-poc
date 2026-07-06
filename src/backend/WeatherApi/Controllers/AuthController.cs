using Microsoft.AspNetCore.Mvc;
using WeatherApi.Attributes;
using WeatherApi.Models;
using WeatherApi.Services;

namespace WeatherApi.Controllers;

/// <summary>
/// Handles authentication and user identity endpoints.
/// </summary>
[ApiController]
public class AuthController : ControllerBase
{
    private readonly EasyAuthService _easyAuthService;

    public AuthController(EasyAuthService easyAuthService)
    {
        _easyAuthService = easyAuthService;
    }

    /// <summary>
    /// Returns information about the currently authenticated user.
    /// </summary>
    [HttpGet("/userinfo")]
    [ProducesResponseType(typeof(UserInfo), StatusCodes.Status200OK)]
    public IActionResult GetUserInfo()
    {
        var principal = _easyAuthService.GetClientPrincipal();

        if (principal == null)
        {
            return Ok(new UserInfo
            {
                IsAuthenticated = false,
                Message = "Usuario no autenticado (Easy Auth no configurado o en desarrollo local)"
            });
        }

        var email = _easyAuthService.GetUserEmail();
        var name = _easyAuthService.GetUserName();
        var roles = _easyAuthService.GetRoles();

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
        var roles = _easyAuthService.GetRoles();
        return Ok(new { roles });
    }
}
