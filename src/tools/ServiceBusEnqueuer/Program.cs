using System.Text.Json;
using Azure.Identity;
using Azure.Messaging.ServiceBus;

// Parse args: --namespace <fqdn> --queue <name> --count <N>
var ns = GetArg(args, "--namespace") ?? "sb-weather-dev-CHANGEME.servicebus.windows.net";
var queue = GetArg(args, "--queue") ?? "weather-jobs";
var count = int.Parse(GetArg(args, "--count") ?? "1000");
var topic = "nd-dashboard-events";

Console.WriteLine($"═══════════════════════════════════════════════════");
Console.WriteLine($"  Service Bus Enqueuer");
Console.WriteLine($"  Namespace: {ns}");
Console.WriteLine($"  Queue:     {queue}");
Console.WriteLine($"  Topic:     {topic} (events)");
Console.WriteLine($"  Messages:  1 to {count}");
Console.WriteLine($"═══════════════════════════════════════════════════");
Console.WriteLine();

await using var client = new ServiceBusClient(ns, new DefaultAzureCredential());
await using var queueSender = client.CreateSender(queue);
await using var topicSender = client.CreateSender(topic);

var sent = 0;
for (int i = 1; i <= count; i++)
{
    // Random processType (weather1 or weather2)
    var processType = Random.Shared.Next(0, 2) == 0 ? "weather1" : "weather2";
    
    var payload = JsonSerializer.Serialize(new
    {
        number = i,
        timestamp = DateTime.UtcNow.ToString("O"),
        processType,
        vertical = "Vertical1"
    });

    var message = new ServiceBusMessage(payload)
    {
        ContentType = "application/json",
        Subject = $"job-{i}"
    };

    // Send to queue (work)
    await queueSender.SendMessageAsync(message);

    // Publish MessageEnqueued event to topic (fire-and-forget)
    try
    {
        var eventPayload = JsonSerializer.Serialize(new
        {
            eventType = "MessageEnqueued",
            vertical = "Vertical1",
            queueName = queue,
            processType,
            timestamp = DateTime.UtcNow,
            messageId = message.MessageId
        });

        await topicSender.SendMessageAsync(new ServiceBusMessage(eventPayload)
        {
            ContentType = "application/json",
            Subject = "MessageEnqueued",
            ApplicationProperties = { ["eventType"] = "MessageEnqueued", ["vertical"] = "Vertical1" }
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"  [WARN] Failed to publish event for message {i}: {ex.Message}");
    }

    sent++;

    // Every 10 messages, pause with random delay 1-5s
    if (i % 10 == 0)
    {
        var delay = Random.Shared.Next(1000, 5001);
        Console.WriteLine($"  [{DateTime.Now:HH:mm:ss}] Enviados {i}/{count} — pausa {delay}ms");
        await Task.Delay(delay);
    }
}

Console.WriteLine();
Console.WriteLine($"✓ Completado: {sent} mensajes enviados a '{queue}' + eventos al topic '{topic}'");

static string? GetArg(string[] args, string name)
{
    var idx = Array.IndexOf(args, name);
    return idx >= 0 && idx + 1 < args.Length ? args[idx + 1] : null;
}
