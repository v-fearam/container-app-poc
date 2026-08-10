namespace WeatherApi.Helpers;

internal static class LogSanitizer
{
    internal static string Sanitize(string? input) =>
        string.IsNullOrEmpty(input) ? string.Empty : input.Replace("\r", string.Empty).Replace("\n", string.Empty);
}
