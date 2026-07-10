using System.Text.Json;

namespace WeatherWorker.Handlers;

/// <summary>
/// Represents a deserialized message from the weather-jobs queue.
/// </summary>
public sealed record WeatherJobMessage
{
    public int Number { get; init; }
    public DateTimeOffset Timestamp { get; init; }
    public string ProcessType { get; init; } = string.Empty;
    public string Vertical { get; init; } = string.Empty;

    /// <summary>
    /// Attempts to parse a raw Service Bus message body into a WeatherJobMessage.
    /// </summary>
    public static bool TryParse(string body, out WeatherJobMessage? message)
    {
        message = null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            message = new WeatherJobMessage
            {
                Number = root.GetProperty("number").GetInt32(),
                Timestamp = root.TryGetProperty("timestamp", out var ts)
                    ? ts.GetDateTimeOffset()
                    : DateTimeOffset.MinValue,
                ProcessType = root.TryGetProperty("processType", out var pt)
                    ? pt.GetString() ?? string.Empty
                    : string.Empty,
                Vertical = root.TryGetProperty("vertical", out var vert)
                    ? vert.GetString() ?? string.Empty
                    : string.Empty
            };
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
