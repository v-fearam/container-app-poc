using System.Text.Json;
using Microsoft.Azure.Cosmos;

namespace WeatherApi.Services;

/// <summary>
/// Custom Cosmos serializer using System.Text.Json.
/// Respects STJ attributes like [JsonIgnore], [JsonPropertyName], etc.
/// </summary>
public sealed class CosmosSystemTextJsonSerializer(JsonSerializerOptions options) : CosmosSerializer
{
    public override T FromStream<T>(Stream stream)
    {
        using (stream)
        {
            if (stream is MemoryStream ms && ms.Length == 0)
                return default!;

            return JsonSerializer.Deserialize<T>(stream, options)!;
        }
    }

    public override Stream ToStream<T>(T input)
    {
        var stream = new MemoryStream();
        JsonSerializer.Serialize(stream, input, options);
        stream.Position = 0;
        return stream;
    }
}
