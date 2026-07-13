# Global Error Handler Middleware

Este documento describe la implementación del middleware global de manejo de errores en el proyecto.

## Objetivo

Centralizar el manejo de excepciones no controladas para:
- Evitar repetición de try-catch genéricos en cada controller
- Garantizar respuestas de error consistentes en toda la API
- Mejorar el logging centralizado de errores
- Diferenciar entre errores de desarrollo (detallados) y producción (genéricos)

## Implementación

### 1. GlobalExceptionHandlerMiddleware

**Ubicación:** `src/backend/WeatherApi/Middleware/GlobalExceptionHandlerMiddleware.cs`

**Responsabilidades:**
- Captura todas las excepciones no manejadas en el pipeline HTTP
- Mapea tipos de excepción a códigos de estado HTTP apropiados
- Genera respuestas JSON estructuradas y consistentes
- Registra todos los errores con contexto completo (path, method, user)
- Incluye stack trace solo en Development (seguridad)

**Mapeo de excepciones:**
```csharp
ArgumentNullException      → 400 Bad Request
ArgumentException          → 400 Bad Request
InvalidOperationException  → 400 Bad Request
UnauthorizedAccessException→ 401 Unauthorized
KeyNotFoundException       → 404 Not Found
Todas las demás           → 500 Internal Server Error
```

**Formato de respuesta:**
```json
{
  "error": "InvalidArgument",
  "message": "Parameter cannot be null",
  "details": "Stack trace completo (solo en Development)",
  "path": "/api/dashboard/kpi",
  "timestamp": "2025-01-19T10:30:00Z"
}
```

### 2. Registro en Program.cs

El middleware se registra **primero** en el pipeline (línea ~84):

```csharp
app.UseMiddleware<GlobalExceptionHandlerMiddleware>();
```

**Orden importante:**
1. Global Exception Handler (primero para capturar todo)
2. Health checks
3. Swagger (solo Development)
4. CORS
5. Controllers

### 3. Simplificación de Controllers

**Antes** (con try-catch repetitivo):
```csharp
[HttpGet("kpi")]
public async Task<IActionResult> GetKpi(...)
{
    try
    {
        var result = await _service.GetKpiAsync(...);
        return Ok(result);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error getting KPI");
        return StatusCode(500, new { error = "Failed to retrieve KPI" });
    }
}
```

**Después** (sin try-catch genérico):
```csharp
[HttpGet("kpi")]
public async Task<IActionResult> GetKpi(...)
{
    var result = await _service.GetKpiAsync(...);
    return Ok(result);
}
```

**Controllers refactorizados:**
- ✅ `DashboardController.GetKpi` - Removido try-catch genérico
- ✅ `DlqManagerController.PeekDlqMessages` - Removido try-catch genérico
- ✅ `DlqManagerController.RequeueDlqMessage` - Removido try-catch genérico
- ✅ `DlqManagerController.DiscardDlqMessage` - Removido try-catch genérico
- ✅ `HealthController.GetComponentHealth` - Removido try-catch genérico

## Cuándo mantener try-catch en controllers

El middleware global maneja **errores genéricos**. Mantén try-catch en casos especiales:

### ✅ Casos donde SÍ mantener try-catch:

1. **Lógica de negocio específica:**
```csharp
try 
{
    await _paymentService.ProcessPayment(amount);
}
catch (InsufficientFundsException ex)
{
    return BadRequest(new { error = "Fondos insuficientes", balance = ex.CurrentBalance });
}
```

2. **Fallback a alternativas:**
```csharp
try 
{
    return await _primaryCache.GetAsync(key);
}
catch (CacheException)
{
    _logger.LogWarning("Primary cache failed, using secondary");
    return await _secondaryCache.GetAsync(key);
}
```

3. **Enriquecimiento de contexto:**
```csharp
try 
{
    return await _service.ProcessOrder(orderId);
}
catch (Exception ex)
{
    _logger.LogError(ex, "Failed processing order {OrderId} for customer {CustomerId}", 
        orderId, customerId);
    throw; // Re-lanzar para que el middleware global maneje la respuesta
}
```

### ❌ NO mantener try-catch para:

1. **Logging genérico + retorno de error 500**
   - El middleware ya hace esto automáticamente
   
2. **Conversión de excepción → JSON error**
   - El middleware provee formato consistente
   
3. **Catch genérico sin lógica de recuperación**
   - Deja que el middleware lo maneje

## Ventajas de este patrón

### 1. Menos código repetitivo
- Controllers más concisos y legibles
- Reducción de ~30% en líneas de código por endpoint

### 2. Consistencia
- Todas las respuestas de error tienen el mismo formato JSON
- Logging uniforme con contexto (path, method, user)

### 3. Seguridad
- Stack traces solo en Development
- Mensajes genéricos en Production (no filtración de información)

### 4. Mantenibilidad
- Un solo lugar para cambiar el formato de errores
- Un solo lugar para agregar telemetría de errores (APM, Application Insights)

### 5. Testing
- Tests de controllers más simples (no testear manejo de errores en cada uno)
- Tests del middleware cubren manejo global

## Comportamiento en diferentes ambientes

### Development
```json
{
  "error": "InternalServerError",
  "message": "An unexpected error occurred",
  "details": "System.NullReferenceException: Object reference not set...\n   at WeatherApi.Services.DashboardService.GetKpiAsync...",
  "path": "/api/dashboard/kpi",
  "timestamp": "2025-01-19T10:30:00Z"
}
```

### Production
```json
{
  "error": "InternalServerError",
  "message": "An unexpected error occurred",
  "path": "/api/dashboard/kpi",
  "timestamp": "2025-01-19T10:30:00Z"
}
```
*(sin `details` field)*

## Logging

Cada error capturado genera un log completo:

```
[Error] GlobalExceptionHandlerMiddleware: Unhandled exception occurred. 
        Path: /api/dashboard/kpi, Method: GET, User: user@example.com
System.InvalidOperationException: Queue not found
   at WeatherApi.Services.DlqService.GetQueueAsync...
```

**Información incluida:**
- Path HTTP completo
- Método HTTP (GET, POST, etc.)
- Usuario autenticado (o "Anonymous")
- Stack trace completo
- Correlation ID (si se usa Application Insights)

## Referencias

**Implementación basada en:**
- Ejemplo de LASA-Portales ModuloPagos (`Startup.cs` líneas 72-87)
- Best practices de ASP.NET Core Middleware
- Microsoft Docs: [Handle errors in ASP.NET Core](https://learn.microsoft.com/aspnet/core/fundamentals/error-handling)

**Archivos relacionados:**
- `src/backend/WeatherApi/Middleware/GlobalExceptionHandlerMiddleware.cs` - Implementación
- `src/backend/WeatherApi/Program.cs` - Registro del middleware (línea ~84)
- `src/backend/WeatherApi/Controllers/*` - Controllers simplificados

## Próximos pasos (opcional)

### 1. Agregar ProblemDetails
Considerar migrar a `ProblemDetails` (RFC 7807) para respuestas aún más estándar:

```csharp
app.UseExceptionHandler(options => 
{
    options.Run(async context =>
    {
        var problemDetails = new ProblemDetails
        {
            Status = 500,
            Title = "An error occurred",
            Detail = env.IsDevelopment() ? exception.ToString() : null,
            Instance = context.Request.Path
        };
        await context.Response.WriteAsJsonAsync(problemDetails);
    });
});
```

### 2. Integración con Application Insights
El middleware ya logea con `ILogger`, que automáticamente envía a Application Insights si está configurado. Opcionalmente agregar:

```csharp
// En HandleExceptionAsync
var telemetry = new ExceptionTelemetry(exception)
{
    SeverityLevel = SeverityLevel.Error
};
telemetry.Properties["Path"] = context.Request.Path;
telemetry.Properties["Method"] = context.Request.Method;
_telemetryClient.TrackException(telemetry);
```

### 3. Rate limiting de errores
Para evitar spam de logs en caso de errores masivos:

```csharp
private readonly RateLimitService _rateLimiter;

// Solo logear 1 error del mismo tipo cada 10 segundos
if (_rateLimiter.ShouldLog(exception.GetType()))
{
    _logger.LogError(exception, "...");
}
```

## Resumen

✅ **Un middleware global** reemplaza **~15 try-catch blocks** en controllers  
✅ **Controllers más limpios** enfocados en lógica de negocio  
✅ **Respuestas consistentes** en toda la API  
✅ **Seguridad mejorada** (stack traces solo en dev)  
✅ **Logging centralizado** con contexto completo  

Este patrón es una **best practice estándar** en ASP.NET Core para aplicaciones modernas.
