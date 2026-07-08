namespace WeatherWorker.Configuration;

/// <summary>
/// Typed configuration for worker processing behavior.
/// Bound from appsettings.json section "Worker".
/// </summary>
public sealed class WorkerOptions
{
    public const string SectionName = "Worker";

    /// <summary>Minimum random delay for normal message processing (ms)</summary>
    public int MinProcessingDelayMs { get; set; } = 1000;

    /// <summary>Maximum random delay for normal message processing (ms)</summary>
    public int MaxProcessingDelayMs { get; set; } = 30000;

    /// <summary>Duration for lock-timeout simulation — must exceed queue lock duration</summary>
    public int LockTimeoutSimulationMinutes { get; set; } = 10;
}
