using System.Text.Json;
using Azure.Identity;
using Azure.Messaging.ServiceBus;

// Parse args: --namespace <fqdn> --queue <name> --count <N>
var ns = GetArg(args, "--namespace") ?? "sb-weather-dev-CHANGEME.servicebus.windows.net";
var queue = GetArg(args, "--queue") ?? "weather-jobs";
var count = int.Parse(GetArg(args, "--count") ?? "1000");

Console.WriteLine($"═══════════════════════════════════════════════════");
Console.WriteLine($"  Service Bus Enqueuer");
Console.WriteLine($"  Namespace: {ns}");
Console.WriteLine($"  Queue:     {queue}");
Console.WriteLine($"  Messages:  1 to {count}");
Console.WriteLine($"═══════════════════════════════════════════════════");
Console.WriteLine();

await using var client = new ServiceBusClient(ns, new DefaultAzureCredential());
await using var sender = client.CreateSender(queue);

var sent = 0;
for (int i = 1; i <= count; i++)
{
    var payload = JsonSerializer.Serialize(new
    {
        number = i,
        timestamp = DateTime.UtcNow.ToString("O")
    });

    await sender.SendMessageAsync(new ServiceBusMessage(payload)
    {
        ContentType = "application/json",
        Subject = $"job-{i}"
    });

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
Console.WriteLine($"✓ Completado: {sent} mensajes enviados a '{queue}'");

static string? GetArg(string[] args, string name)
{
    var idx = Array.IndexOf(args, name);
    return idx >= 0 && idx + 1 < args.Length ? args[idx + 1] : null;
}
