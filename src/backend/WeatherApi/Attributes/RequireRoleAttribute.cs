using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using WeatherApi.Services;

namespace WeatherApi.Attributes;

/// <summary>
/// Action filter that requires the caller to have a specific Easy Auth role.
/// Returns 401 if not authenticated, 403 if the required role is missing.
/// </summary>
/// <example>
/// [RequireRole("Admin")]
/// public IActionResult GetAdminData() { ... }
/// </example>
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
        private readonly EasyAuthService _easyAuthService;

        public RequireRoleFilter(string role, EasyAuthService easyAuthService)
        {
            _role = role;
            _easyAuthService = easyAuthService;
        }

        public void OnActionExecuting(ActionExecutingContext context)
        {
            var principal = _easyAuthService.GetClientPrincipal();

            if (principal == null)
            {
                context.Result = new JsonResult(new { error = "Unauthorized", message = "No authentication principal found." })
                {
                    StatusCode = StatusCodes.Status401Unauthorized
                };
                return;
            }

            if (!_easyAuthService.HasRole(_role))
            {
                context.Result = new JsonResult(new { error = "Forbidden", message = $"Required role '{_role}' is missing." })
                {
                    StatusCode = StatusCodes.Status403Forbidden
                };
            }
        }

        public void OnActionExecuted(ActionExecutedContext context) { }
    }
}

/// <summary>
/// Action filter that requires any authenticated Easy Auth principal.
/// Returns 401 if not authenticated.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireAuthAttribute : TypeFilterAttribute
{
    public RequireAuthAttribute() : base(typeof(RequireAuthFilter)) { }

    private class RequireAuthFilter : IActionFilter
    {
        private readonly EasyAuthService _easyAuthService;

        public RequireAuthFilter(EasyAuthService easyAuthService)
        {
            _easyAuthService = easyAuthService;
        }

        public void OnActionExecuting(ActionExecutingContext context)
        {
            var principal = _easyAuthService.GetClientPrincipal();

            if (principal == null)
            {
                context.Result = new JsonResult(new { error = "Unauthorized", message = "No authentication principal found." })
                {
                    StatusCode = StatusCodes.Status401Unauthorized
                };
            }
        }

        public void OnActionExecuted(ActionExecutedContext context) { }
    }
}
