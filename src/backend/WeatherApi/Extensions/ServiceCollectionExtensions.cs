using WeatherApi.Services;

namespace WeatherApi.Extensions;

/// <summary>
/// Extension methods for clean service registration.
/// </summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers EasyAuthService and IHttpContextAccessor for Easy Auth header parsing.
    /// </summary>
    public static IServiceCollection AddEasyAuth(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<EasyAuthService>();
        return services;
    }

    /// <summary>
    /// Configures the CORS policy for the frontend, supporting both explicit origins and suffix-based matching.
    /// </summary>
    public static IServiceCollection AddWeatherCors(this IServiceCollection services, IConfiguration configuration)
    {
        var configuredOrigins = (configuration["CORS_ALLOWED_ORIGINS"]
            ?? Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS")
            ?? "http://localhost:5173,http://localhost:3000")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var configuredOriginSuffixes = (configuration["CORS_ALLOWED_ORIGIN_SUFFIXES"]
            ?? Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGIN_SUFFIXES")
            ?? ".azurecontainerapps.io")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        services.AddCors(options =>
        {
            options.AddPolicy("AllowFrontend", policy =>
            {
                policy.SetIsOriginAllowed(origin =>
                        configuredOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase) ||
                        IsAllowedBySuffix(origin, configuredOriginSuffixes))
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .WithExposedHeaders("Request-Id", "Request-Context")
                    .AllowCredentials();
            });
        });

        return services;
    }

    private static bool IsAllowedBySuffix(string origin, string[] suffixes)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var originUri))
            return false;

        return suffixes.Any(suffix => originUri.Host.EndsWith(suffix, StringComparison.OrdinalIgnoreCase));
    }
}
