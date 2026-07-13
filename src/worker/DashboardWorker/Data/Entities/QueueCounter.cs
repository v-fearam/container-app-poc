namespace DashboardWorker.Data.Entities;

/// <summary>
/// Counter entity for dashboard metrics by vertical, queue, process type and date.
/// </summary>
public class QueueCounter
{
    public int Id { get; set; }
    public string Vertical { get; set; } = string.Empty;
    public string QueueName { get; set; } = string.Empty;
    public string ProcessType { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public int EnqueuedCount { get; set; }
    public int ProcessedCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
