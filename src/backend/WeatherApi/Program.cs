using Azure.Monitor.OpenTelemetry.AspNetCore;
using System.Text;
using System.Text.Json;

// Cargar variables desde .env si existe
DotNetEnv.Env.Load();

var builder = WebApplication.CreateBuilder(args);

var configuredOrigins = (builder.Configuration["CORS_ALLOWED_ORIGINS"]
    ?? Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS")
    ?? "http://localhost:5173,http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

var configuredOriginSuffixes = (builder.Configuration["CORS_ALLOWED_ORIGIN_SUFFIXES"]
    ?? Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGIN_SUFFIXES")
    ?? ".azurecontainerapps.io")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

bool IsAllowedBySuffix(string origin)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var originUri))
    {
        return false;
    }

    return configuredOriginSuffixes.Any(suffix => originUri.Host.EndsWith(suffix, StringComparison.OrdinalIgnoreCase));
}

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure OpenTelemetry with Azure Monitor (opcional en desarrollo)
var appInsightsConnectionString = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"] 
    ?? Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING");

if (!string.IsNullOrEmpty(appInsightsConnectionString))
{
    builder.Services.AddOpenTelemetry().UseAzureMonitor();
    builder.Logging.AddConsole();
    Console.WriteLine("✅ Application Insights habilitado");
}
else
{
    Console.WriteLine("⚠️  Application Insights no configurado (opcional para desarrollo local)");
}

// Configure CORS to allow frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy =>
        {
                        policy.SetIsOriginAllowed(origin =>
                                        configuredOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase) || IsAllowedBySuffix(origin))
                                    .AllowAnyHeader()
                  .AllowAnyMethod()
                  .WithExposedHeaders("Request-Id", "Request-Context") // Expose correlation headers
                                .AllowCredentials() // Important for Easy Auth cookies
                                ;
        });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Enable CORS
app.UseCors("AllowFrontend");

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

// Helper method to parse Easy Auth header
ClientPrincipal? GetClientPrincipal(HttpContext context)
{
    if (context.Request.Headers.TryGetValue("X-MS-CLIENT-PRINCIPAL", out var principalHeader))
    {
        try
        {
            var decoded = Convert.FromBase64String(principalHeader!);
            var json = Encoding.UTF8.GetString(decoded);
            return JsonSerializer.Deserialize<ClientPrincipal>(json, new JsonSerializerOptions 
            { 
                PropertyNameCaseInsensitive = true 
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error parsing X-MS-CLIENT-PRINCIPAL: {ex.Message}");
        }
    }
    return null;
}

// Helper method to require a specific role — returns null if authorized, or an IResult with the error
IResult? RequireRole(HttpContext context, string requiredRole)
{
    var principal = GetClientPrincipal(context);
    if (principal == null)
    {
        return Results.Json(new { error = "Unauthorized", message = "No authentication principal found." }, statusCode: 401);
    }

    var roles = principal.Claims?
        .Where(c => c.Typ == "roles")
        .Select(c => c.Val)
        .ToList() ?? new List<string>();

    if (!roles.Contains(requiredRole, StringComparer.OrdinalIgnoreCase))
    {
        return Results.Json(new { error = "Forbidden", message = $"Required role '{requiredRole}' is missing." }, statusCode: 403);
    }

    return null;
}

// New endpoint: Get user info
app.MapGet("/userinfo", (HttpContext context) =>
{
    var principal = GetClientPrincipal(context);
    
    if (principal == null)
    {
        return Results.Ok(new UserInfo 
        { 
            IsAuthenticated = false,
            Message = "Usuario no autenticado (Easy Auth no configurado o en desarrollo local)"
        });
    }

    var email = principal.Claims?.FirstOrDefault(c => 
        c.Typ?.Contains("emailaddress") == true || 
        c.Typ == "email")?.Val;
    
    var name = principal.Claims?.FirstOrDefault(c => 
        c.Typ == "name")?.Val ?? principal.UserDetails;

    var roles = principal.Claims?
        .Where(c => c.Typ == "roles")
        .Select(c => c.Val)
        .ToList() ?? new List<string>();

    return Results.Ok(new UserInfo
    {
        IsAuthenticated = true,
        Email = email,
        Name = name,
        UserId = principal.UserId,
        Roles = roles,
        Message = roles.Any() ? $"Usuario con rol: {string.Join(", ", roles)}" : "Usuario sin roles asignados"
    });
})
.WithName("GetUserInfo")
.WithOpenApi();

app.MapGet("/weatherforecast", (HttpContext context) =>
{
    var principal = GetClientPrincipal(context);
    
    // Require authentication - return 401 if no valid token
    if (principal == null)
    {
        return Results.Unauthorized();
    }
    
    // Obtener el primer rol del usuario
    var userRole = "User";
    var roleClaim = principal.Claims?.FirstOrDefault(c => c.Typ == "roles");
    if (roleClaim != null)
    {
        userRole = roleClaim.Val ?? "User";
    }

    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)],
            userRole
        ))
        .ToArray();
    return Results.Ok(forecast);
})
.WithName("GetWeatherForecast")
.WithOpenApi();

app.MapGet("/weatherforecast/user", (HttpContext context) =>
{
    var authError = RequireRole(context, "Weather.Read");
    if (authError != null) return authError;

    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)],
            "User"
        ))
        .ToArray();
    return Results.Ok(forecast);
})
.WithName("GetWeatherForecastUser")
.WithOpenApi();

app.MapGet("/weatherforecast/admin", (HttpContext context) =>
{
    var authError = RequireRole(context, "Weather.Admin");
    if (authError != null) return authError;

    var principal = GetClientPrincipal(context)!;
    var requestedBy = principal.UserDetails ?? principal.UserId ?? "unknown";
    var claimsCount = principal.Claims?.Count ?? 0;

    var forecast = Enumerable.Range(1, 5).Select(index =>
        new AdminWeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)],
            "Admin",
            requestedBy,
            claimsCount
        ))
        .ToArray();
    return Results.Ok(forecast);
})
.WithName("GetWeatherForecastAdmin")
.WithOpenApi();

app.MapGet("/roles", (HttpContext context) =>
{
    var principal = GetClientPrincipal(context);
    if (principal == null)
    {
        return Results.Json(new { error = "Unauthorized", message = "No authentication principal found." }, statusCode: 401);
    }

    var roles = principal.Claims?
        .Where(c => c.Typ == "roles")
        .Select(c => c.Val)
        .ToList() ?? new List<string>();

    return Results.Ok(new { roles });
})
.WithName("GetRoles")
.WithOpenApi();

app.Run();

// Models para Easy Auth
record ClientPrincipal(
    string? Auth_typ,
    string? Name_typ,
    string? Role_typ,
    List<ClientClaim>? Claims,
    string? UserId,
    string? UserDetails
);

record ClientClaim(
    string? Typ,
    string? Val
);

// Response model for /userinfo
record UserInfo
{
    public bool IsAuthenticated { get; set; }
    public string? Email { get; set; }
    public string? Name { get; set; }
    public string? UserId { get; set; }
    public List<string>? Roles { get; set; }
    public string? Message { get; set; }
}

// Updated WeatherForecast to include user role
record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary, string UserRole)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

// Extended forecast for admin endpoint
record AdminWeatherForecast(DateOnly Date, int TemperatureC, string? Summary, string UserRole, string RequestedBy, int ClaimsCount)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
