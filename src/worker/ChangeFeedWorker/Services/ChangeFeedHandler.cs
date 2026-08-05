using System.Data;
using Azure.Messaging.ServiceBus;
using ChangeFeedWorker.Configuration;
using ChangeFeedWorker.Data;
using ChangeFeedWorker.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChangeFeedWorker.Services;

/// <summary>
/// Handles Change Feed events: calls SP to upsert into star model, publishes dashboard events.
/// Uses ADO.NET for SP call (not EF Core) since star model uses raw SQL.
/// </summary>
public class ChangeFeedHandler(
    IDbContextFactory<DashboardDbContext> dbContextFactory,
    ServiceBusClient serviceBusClient,
    CosmosClient cosmosClient,
    IOptions<CosmosOptions> cosmosOptions,
    ILogger<ChangeFeedHandler> logger) : IChangeFeedHandler
{
    private readonly CosmosOptions _cosmosOptions = cosmosOptions.Value;

    public async Task ProcessBatchAsync(IReadOnlyCollection<Comunicacion> comunicaciones, CancellationToken cancellationToken)
    {
        logger.LogInformation("Processing {Count} comunicaciones from Change Feed", comunicaciones.Count);

        foreach (var comunicacion in comunicaciones)
        {
            try
            {
                await UpsertComunicacionToSql(comunicacion, cancellationToken);
                await PublishSuccessEvent(comunicacion, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to process Comunicación {Id}. Writing to error container.", comunicacion.Id);
                await WriteToErrorContainer(comunicacion, ex, cancellationToken);
                await PublishErrorEvent(comunicacion, ex, cancellationToken);
            }
        }

        logger.LogInformation("Batch processing complete");
    }

    /// <summary>
    /// Calls usp_UpsertComunicacionGenerica to upsert into star model (transactional, idempotent).
    /// </summary>
    private async Task UpsertComunicacionToSql(Comunicacion comunicacion, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        var connection = dbContext.Database.GetDbConnection();
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "usp_UpsertComunicacionGenerica";
        command.CommandType = CommandType.StoredProcedure;

        command.Parameters.Add(CreateParam("@cosmosId", comunicacion.Id));
        command.Parameters.Add(CreateParam("@fechaCreacion", comunicacion.FechaCreacion));
        command.Parameters.Add(CreateParam("@fechaUltimaModif", comunicacion.FechaUltimaModif));
        command.Parameters.Add(CreateParam("@estado", comunicacion.Estado));
        command.Parameters.Add(CreateParam("@tipoProceso", comunicacion.TipoProceso));
        command.Parameters.Add(CreateParam("@canal", comunicacion.Canal));
        command.Parameters.Add(CreateParam("@contacto", comunicacion.Contacto));
        // tipoContacto derived from canal (email → email, sms → sms)
        command.Parameters.Add(CreateParam("@tipoContacto", comunicacion.Canal));
        command.Parameters.Add(CreateParam("@parametros",
            comunicacion.Parametros != null ? Newtonsoft.Json.JsonConvert.SerializeObject(comunicacion.Parametros) : (object)DBNull.Value));
        command.Parameters.Add(CreateParam("@eventosJson",
            comunicacion.Eventos?.Count > 0 ? Newtonsoft.Json.JsonConvert.SerializeObject(comunicacion.Eventos) : (object)DBNull.Value));

        await command.ExecuteNonQueryAsync(cancellationToken);
        logger.LogDebug("Upserted comunicación {Id} to star model", comunicacion.Id);
    }

    private static SqlParameter CreateParam(string name, object value)
        => new(name, value);

    private async Task PublishSuccessEvent(Comunicacion comunicacion, CancellationToken cancellationToken)
    {
        var evt = new
        {
            EventType = "ChangeFeedProcessed",
            Timestamp = DateTime.UtcNow,
            Vertical = _cosmosOptions.VerticalName,
            Collection = _cosmosOptions.Collection,
            DocumentId = comunicacion.Id,
            ProcessedBy = _cosmosOptions.ProcessorName
        };

        await SendEventToServiceBus(evt, cancellationToken);
    }

    private async Task PublishErrorEvent(Comunicacion comunicacion, Exception ex, CancellationToken cancellationToken)
    {
        var evt = new
        {
            EventType = "ChangeFeedError",
            Timestamp = DateTime.UtcNow,
            Vertical = _cosmosOptions.VerticalName,
            Collection = _cosmosOptions.Collection,
            DocumentId = comunicacion.Id,
            ErrorMessage = ex.Message,
            ProcessedBy = _cosmosOptions.ProcessorName
        };

        await SendEventToServiceBus(evt, cancellationToken);
    }

    private async Task SendEventToServiceBus(object evt, CancellationToken cancellationToken)
    {
        var topicName = "nd-dashboard-events";
        var sender = serviceBusClient.CreateSender(topicName);

        var messageBody = Newtonsoft.Json.JsonConvert.SerializeObject(evt);
        var message = new ServiceBusMessage(messageBody)
        {
            ContentType = "application/json"
        };

        await sender.SendMessageAsync(message, cancellationToken);
    }

    private async Task WriteToErrorContainer(Comunicacion comunicacion, Exception ex, CancellationToken cancellationToken)
    {
        var database = cosmosClient.GetDatabase(_cosmosOptions.Database);
        var errorContainer = database.GetContainer("changefeed-errors");

        var errorDoc = new
        {
            id = Guid.NewGuid().ToString(),
            OriginalId = comunicacion.Id,
            OriginalDocument = comunicacion,
            ErrorMessage = ex.Message,
            ErrorStackTrace = ex.StackTrace,
            FailedAt = DateTime.UtcNow,
            ProcessorName = _cosmosOptions.ProcessorName
        };

        await errorContainer.CreateItemAsync(errorDoc, new PartitionKey(errorDoc.id), cancellationToken: cancellationToken);
    }
}
