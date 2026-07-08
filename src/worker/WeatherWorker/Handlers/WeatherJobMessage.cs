using System.Text.Json;

namespace WeatherWorker.Handlers;

/// <summary>
/// Represents a deserialized message from the weather-jobs queue.
/// </summary>
public sealed record WeatherJobMessage
{
    public int Number { get; init; }
    public DateTimeOffset Timestamp { get; init; }

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
                    : DateTimeOffset.MinValue
            };
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
