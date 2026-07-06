using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using WeatherApi.Services;

namespace WeatherApi.Attributes;

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
        private readonly ILogger<RequireAuthFilter> _logger;

        public RequireAuthFilter(EasyAuthService easyAuthService, ILogger<RequireAuthFilter> logger)
        {
            _easyAuthService = easyAuthService;
            _logger = logger;
        }

        public void OnActionExecuting(ActionExecutingContext context)
        {
            var principal = _easyAuthService.GetClientPrincipal();

            if (principal == null)
            {
                _logger.LogWarning("Authentication required for {Path}: no principal found", context.HttpContext.Request.Path);
                context.Result = new JsonResult(new { error = "Unauthorized", message = "No authentication principal found." })
                {
                    StatusCode = StatusCodes.Status401Unauthorized
                };
            }
        }

        public void OnActionExecuted(ActionExecutedContext context) { }
    }
}
