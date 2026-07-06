namespace WeatherApi.Models;

/// <summary>
/// Represents the client principal from Azure Easy Auth (X-MS-CLIENT-PRINCIPAL header).
/// </summary>
public record ClientPrincipal(
    string? Auth_typ,
    string? Name_typ,
    string? Role_typ,
    List<ClientClaim>? Claims,
    string? UserId,
    string? UserDetails
);

/// <summary>
/// Represents a single claim from the Easy Auth principal.
/// </summary>
public record ClientClaim(
    string? Typ,
    string? Val
);
