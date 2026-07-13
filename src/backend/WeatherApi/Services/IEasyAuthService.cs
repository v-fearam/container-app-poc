using WeatherApi.Models;

namespace WeatherApi.Services;

/// <summary>
/// Service that extracts and parses the Azure Easy Auth X-MS-CLIENT-PRINCIPAL header.
/// </summary>
public interface IEasyAuthService
{
    /// <summary>
    /// Reads and deserializes the X-MS-CLIENT-PRINCIPAL header from the current request.
    /// </summary>
    /// <returns>The parsed <see cref="ClientPrincipal"/>, or null if the header is missing or invalid.</returns>
    ClientPrincipal? GetClientPrincipal();

    /// <summary>
    /// Extracts all role claims from the current principal.
    /// </summary>
    List<string> GetRoles();

    /// <summary>
    /// Checks whether the current user has a specific role.
    /// </summary>
    bool HasRole(string role);

    /// <summary>
    /// Gets the email address of the current user from claims.
    /// </summary>
    string? GetUserEmail();

    /// <summary>
    /// Gets the display name of the current user from claims or UserDetails.
    /// </summary>
    string? GetUserName();
}
