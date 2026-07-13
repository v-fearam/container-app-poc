using System.Net;
using System.Text.Json;

namespace WeatherApi.Middleware;

/// <summary>
/// Global exception handling middleware that catches all unhandled exceptions
/// and returns consistent error responses.
/// </summary>
public class GlobalExceptionHandlerMiddleware(
    RequestDelegate next,
    ILogger<GlobalExceptionHandlerMiddleware> logger,
    IWebHostEnvironment env)
{

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        // Log the exception with full details
        logger.LogError(exception,
            "Unhandled exception occurred. Path: {Path}, Method: {Method}, User: {User}",
            context.Request.Path,
            context.Request.Method,
            context.User?.Identity?.Name ?? "Anonymous");

        // Determine status code based on exception type
        var (statusCode, error, message) = exception switch
        {
            ArgumentNullException => (HttpStatusCode.BadRequest, "InvalidArgument", exception.Message),
            ArgumentException => (HttpStatusCode.BadRequest, "InvalidArgument", exception.Message),
            InvalidOperationException => (HttpStatusCode.BadRequest, "InvalidOperation", exception.Message),
            UnauthorizedAccessException => (HttpStatusCode.Unauthorized, "Unauthorized", "Access denied"),
            KeyNotFoundException => (HttpStatusCode.NotFound, "NotFound", exception.Message),
            _ => (HttpStatusCode.InternalServerError, "InternalServerError", "An unexpected error occurred")
        };

        context.Response.StatusCode = (int)statusCode;
        context.Response.ContentType = "application/json";

        var response = new ErrorResponse
        {
            Error = error,
            Message = message,
            // Only include details in development
            Details = env.IsDevelopment() ? exception.ToString() : null,
            Path = context.Request.Path,
            Timestamp = DateTime.UtcNow
        };

        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(response, options));
    }

    private record ErrorResponse
    {
        public required string Error { get; init; }
        public required string Message { get; init; }
        public string? Details { get; init; }
        public required string Path { get; init; }
        public DateTime Timestamp { get; init; }
    }
}

