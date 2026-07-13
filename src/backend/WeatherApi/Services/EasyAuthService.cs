using System.Text;
using System.Text.Json;
using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Service that extracts and parses the Azure Easy Auth X-MS-CLIENT-PRINCIPAL header.
/// </summary>
public class EasyAuthService : IEasyAuthService
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public EasyAuthService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    /// <summary>
    /// Reads and deserializes the X-MS-CLIENT-PRINCIPAL header from the current request.
    /// </summary>
    /// <returns>The parsed <see cref="ClientPrincipal"/>, or null if the header is missing or invalid.</returns>
    public ClientPrincipal? GetClientPrincipal()
    {
        var context = _httpContextAccessor.HttpContext;
        if (context == null)
            return null;

        if (context.Request.Headers.TryGetValue("X-MS-CLIENT-PRINCIPAL", out var principalHeader))
        {
            try
            {
                var decoded = Convert.FromBase64String(principalHeader!);
                var json = Encoding.UTF8.GetString(decoded);
                return JsonSerializer.Deserialize<ClientPrincipal>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error parsing X-MS-CLIENT-PRINCIPAL: {ex.Message}");
            }
        }

        return null;
    }

    /// <summary>
    /// Extracts all role claims from the current principal.
    /// </summary>
    public List<string> GetRoles()
    {
        var principal = GetClientPrincipal();
        return principal?.Claims?
            .Where(c => c.Typ == "roles")
            .Select(c => c.Val!)
            .ToList() ?? [];
    }

    /// <summary>
    /// Checks whether the current user has a specific role.
    /// </summary>
    public bool HasRole(string role)
    {
        return GetRoles().Contains(role, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Gets the email address of the current user from claims.
    /// </summary>
    public string? GetUserEmail()
    {
        var principal = GetClientPrincipal();
        return principal?.Claims?.FirstOrDefault(c =>
            c.Typ?.Contains("emailaddress") == true ||
            c.Typ == "email")?.Val;
    }

    /// <summary>
    /// Gets the display name of the current user from claims or UserDetails.
    /// </summary>
    public string? GetUserName()
    {
        var principal = GetClientPrincipal();
        return principal?.Claims?.FirstOrDefault(c => c.Typ == "name")?.Val
            ?? principal?.UserDetails;
    }
}
