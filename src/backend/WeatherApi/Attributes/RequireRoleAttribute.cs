using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using WeatherApi.Services;

namespace WeatherApi.Attributes;

/// <summary>
/// Action filter that requires the caller to have a specific Easy Auth role.
/// Returns 401 if not authenticated, 403 if the required role is missing.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public class RequireRoleAttribute : TypeFilterAttribute
{
    public RequireRoleAttribute(string role) : base(typeof(RequireRoleFilter))
    {
        Arguments = [role];
    }

    private class RequireRoleFilter : IActionFilter
    {
        private readonly string _role;
        private readonly IEasyAuthService _easyAuthService;
        private readonly ILogger<RequireRoleFilter> _logger;

        public RequireRoleFilter(string role, IEasyAuthService easyAuthService, ILogger<RequireRoleFilter> logger)
        {
            _role = role;
            _easyAuthService = easyAuthService;
            _logger = logger;
        }

        public void OnActionExecuting(ActionExecutingContext context)
        {
            var principal = _easyAuthService.GetClientPrincipal();

            if (principal == null)
            {
                _logger.LogWarning("Access denied to {Path}: no authentication principal", context.HttpContext.Request.Path);
                context.Result = new JsonResult(new { error = "Unauthorized", message = "No authentication principal found." })
                {
                    StatusCode = StatusCodes.Status401Unauthorized
                };
                return;
            }

            if (!_easyAuthService.HasRole(_role))
            {
                var user = principal.UserDetails ?? principal.UserId ?? "unknown";
                _logger.LogWarning("Access denied to {Path}: user {User} missing role {Role}", context.HttpContext.Request.Path, user, _role);
                context.Result = new JsonResult(new { error = "Forbidden", message = $"Required role '{_role}' is missing." })
                {
                    StatusCode = StatusCodes.Status403Forbidden
                };
            }
        }

        public void OnActionExecuted(ActionExecutedContext context) { }
    }
}
