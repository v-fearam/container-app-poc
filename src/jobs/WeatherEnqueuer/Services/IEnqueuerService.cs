namespace WeatherEnqueuer.Services;

/// <summary>
/// Service responsible for enqueuing weather messages and publishing job execution events.
/// </summary>
public interface IEnqueuerService
{
    Task ExecuteAsync(CancellationToken cancellationToken);
}
