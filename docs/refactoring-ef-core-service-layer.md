# Refactorización: Entity Framework Core + Service Layer + AddAzureClients

## Resumen

Refactorización completa a mejores prácticas de arquitectura .NET y Azure SDK siguiendo las guías de Microsoft.

## Cambios Principales

### 1. Service Layer Pattern (Backend)

**Antes:** Lógica de negocio en controllers
```csharp
public class DashboardController {
    public async Task<IActionResult> GetKpi() {
        // SQL directo
        using var connection = new SqlConnection(...);
        // Service Bus directo  
        var client = new ServiceBusClient(...);
        // Lógica compleja aquí
    }
}
```

**Después:** Controllers delgados, servicios con lógica
```csharp
// Controller
public class DashboardController {
    private readonly IDashboardService _service;
    
    public async Task<IActionResult> GetKpi() {
        var result = await _service.GetKpiAsync(...);
        return Ok(result);
    }
}

// Service
public class DashboardService : IDashboardService {
    private readonly DashboardDbContext _dbContext;
    private readonly ServiceBusAdministrationClient _sbAdmin;
    
    public async Task<IEnumerable<DashboardKpiResponse>> GetKpiAsync(...) {
        // Lógica de negocio aquí
    }
}
```

**Servicios creados:**
- `IDashboardService` / `DashboardService` - KPIs y métricas
- `IDlqService` / `DlqService` - Gestión DLQ (peek, requeue, discard)
- `IHealthService` / `HealthService` - Estado de componentes

### 2. Entity Framework Core Migration

**Antes:** ADO.NET directo (SQL strings, SqlConnection, SqlCommand)
```csharp
using var connection = new SqlConnection(connString);
await connection.OpenAsync();
var command = new SqlCommand(@"
    UPDATE dbo.QueueCounters 
    SET EnqueuedCount = EnqueuedCount + 1 
    WHERE ...", connection);
await command.ExecuteNonQueryAsync();
```

**Después:** EF Core type-safe con LINQ
```csharp
await _dbContext.QueueCounters
    .Where(q => q.Vertical == vertical && ...)
    .ExecuteUpdateAsync(q => q
        .SetProperty(x => x.EnqueuedCount, x => x.EnqueuedCount + 1)
        .SetProperty(x => x.UpdatedAt, DateTime.UtcNow));
```

**Estructura creada:**
```
Data/
├── Entities/
│   ├── QueueCounter.cs
│   └── ComponentHealth.cs
├── Configurations/
│   ├── QueueCounterConfiguration.cs  (Fluent API)
│   └── ComponentHealthConfiguration.cs
└── DashboardDbContext.cs
```

**Configuración Fluent API ejemplo:**
```csharp
public class QueueCounterConfiguration : IEntityTypeConfiguration<QueueCounter> {
    public void Configure(EntityTypeBuilder<QueueCounter> builder) {
        builder.HasKey(q => q.Id);
        builder.Property(q => q.Vertical).IsRequired().HasMaxLength(100);
        
        // Unique constraint (SQL schema match)
        builder.HasIndex(q => new { q.Vertical, q.QueueName, q.ProcessType, q.Date })
            .IsUnique()
            .HasDatabaseName("UQ_QueueCounters_Vertical_Queue_ProcessType_Date");
        
        // Performance index
        builder.HasIndex(q => new { q.Date, q.Vertical })
            .HasDatabaseName("IX_QueueCounters_Date_Vertical");
    }
}
```

**Benefits EF Core:**
- ✅ Type-safe queries (compile-time errors)
- ✅ AsNoTracking para read-only (performance)
- ✅ Projections con Select (solo columnas necesarias)
- ✅ ExecuteUpdateAsync para bulk updates sin tracking
- ✅ Migrations automáticas (futuro)

### 3. Azure SDK Dependency Injection

**Antes:** Clientes creados manualmente
```csharp
builder.Services.AddSingleton(new ServiceBusClient(namespace, new DefaultAzureCredential()));
```

**Después:** AddAzureClients (Microsoft.Extensions.Azure)
```csharp
builder.Services.AddAzureClients(clientBuilder =>
{
    // Credential compartido
    clientBuilder.UseCredential(new DefaultAzureCredential());

    // Service Bus client
    clientBuilder.AddServiceBusClientWithNamespace(serviceBusNamespace);

    // Service Bus Administration client (para DLQ metrics)
    clientBuilder.AddClient<ServiceBusAdministrationClient, ServiceBusClientOptions>(
        (options, credential, _) => new ServiceBusAdministrationClient(namespace, credential));
});
```

**Benefits AddAzureClients:**
- ✅ Lifetime management automático
- ✅ Health checks integrados
- ✅ Retry policies centralizados
- ✅ Telemetry automático
- ✅ Credential reuse (DefaultAzureCredential)
- ✅ Testing más fácil (mock interfaces)

### 4. Dependency Injection Completa

**Registración en Program.cs:**
```csharp
// EF Core
builder.Services.AddDbContext<DashboardDbContext>(options =>
    options.UseSqlServer(sqlConnectionString));

// Azure Clients
builder.Services.AddAzureClients(clientBuilder => { ... });

// Business Services
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IDlqService, DlqService>();
builder.Services.AddScoped<IHealthService, HealthService>();

// Health Checks
builder.Services.AddHealthChecks()
    .AddCheck("self", ...)
    .AddDbContextCheck<DashboardDbContext>("sql")
    .AddCheck("servicebus", ...);
```

**Inyección en controllers:**
```csharp
public class DashboardController : ControllerBase
{
    private readonly IDashboardService _dashboardService;
    private readonly ILogger<DashboardController> _logger;

    public DashboardController(
        IDashboardService dashboardService,
        ILogger<DashboardController> logger)
    {
        _dashboardService = dashboardService;
        _logger = logger;
    }
}
```

**Inyección en servicios:**
```csharp
public class DashboardService : IDashboardService
{
    private readonly DashboardDbContext _dbContext;
    private readonly ServiceBusAdministrationClient _sbAdminClient;
    private readonly ILogger<DashboardService> _logger;

    public DashboardService(
        DashboardDbContext dbContext,
        ServiceBusAdministrationClient sbAdminClient,
        ILogger<DashboardService> logger)
    {
        _dbContext = dbContext;
        _sbAdminClient = sbAdminClient;
        _logger = logger;
    }
}
```

### 5. Worker refactoring

**DashboardWorker/Program.cs:**
```csharp
// AddAzureClients también en worker
builder.Services.AddAzureClients(clientBuilder =>
{
    clientBuilder.UseCredential(new DefaultAzureCredential());
    clientBuilder.AddServiceBusClientWithNamespace(serviceBusNamespace);
});

// EF Core DbContext
builder.Services.AddDbContext<DashboardDbContext>(options =>
    options.UseSqlServer(sqlConnectionString));
```

**DashboardWorkerService:**
- Recibe ServiceBusClient inyectado
- Usa IServiceScopeFactory para crear DbContext (scoped lifetime en BackgroundService)
- UPSERT pattern preservado con ExecuteUpdateAsync

```csharp
public class DashboardWorkerService : BackgroundService
{
    private readonly ServiceBusClient _serviceBusClient;
    private readonly IServiceScopeFactory _scopeFactory;  // Para DbContext scoped
    
    private async Task UpsertCounterAsync(DashboardEvent evt, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<DashboardDbContext>();
        
        // EF Core bulk update (no tracking overhead)
        var rowsAffected = await dbContext.QueueCounters
            .Where(q => ...)
            .ExecuteUpdateAsync(q => q.SetProperty(...), ct);
            
        if (rowsAffected == 0) {
            // INSERT fallback
            dbContext.QueueCounters.Add(new QueueCounter { ... });
            await dbContext.SaveChangesAsync(ct);
        }
    }
}
```

## Packages Agregados

### Backend (WeatherApi.csproj)
```xml
<PackageReference Include="Microsoft.Extensions.Azure" Version="1.14.0" />
<PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="10.0.0" />
```

### DashboardWorker (DashboardWorker.csproj)
```xml
<PackageReference Include="Microsoft.Extensions.Azure" Version="1.14.0" />
<PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="10.0.0" />
```

## Performance Considerations

### EF Core Optimizations

**AsNoTracking para read-only:**
```csharp
var data = await _dbContext.QueueCounters
    .AsNoTracking()  // ⚡ No change tracking overhead
    .Where(...)
    .ToListAsync();
```

**Projections (Select solo columnas necesarias):**
```csharp
var dtos = await _dbContext.ComponentHealth
    .AsNoTracking()
    .Select(c => new ComponentHealthDto  // ⚡ Solo campos del DTO
    {
        ComponentName = c.ComponentName,
        Status = c.Status,
        LastHeartbeat = c.LastHeartbeat
    })
    .ToListAsync();
```

**Bulk updates sin tracking:**
```csharp
await _dbContext.QueueCounters
    .Where(q => ...)
    .ExecuteUpdateAsync(q => q  // ⚡ Directo a SQL, no carga entities
        .SetProperty(x => x.EnqueuedCount, x => x.EnqueuedCount + 1));
```

### UPSERT Pattern Preserved

El patrón UPDATE-first concurrency-safe se preserva con EF Core:

1. **Try UPDATE** con ExecuteUpdateAsync
2. **If 0 rows** → INSERT con SaveChangesAsync
3. **If unique constraint violation** → retry UPDATE en scope nuevo

Este patrón evita deadlocks de MERGE y maneja concurrencia correctamente.

## Testing Benefits

**Antes (ADO.NET):** Difícil mockear SqlConnection/SqlCommand

**Después (EF Core + DI):** Fácil mockear con interfaces

```csharp
// Unit test example
var mockDbContext = new Mock<DashboardDbContext>();
var mockSbAdmin = new Mock<ServiceBusAdministrationClient>();
var service = new DashboardService(mockDbContext.Object, mockSbAdmin.Object, logger);

// Test sin tocar Azure o SQL real
var result = await service.GetKpiAsync(date, vertical);
```

## Migration Path (Futuro)

Con EF Core, ahora podemos:

```bash
# Generar migration desde modelo actual
dotnet ef migrations add InitialCreate --project src/backend/WeatherApi

# Aplicar a base de datos
dotnet ef database update --project src/backend/WeatherApi

# Generar SQL script para revisión
dotnet ef migrations script --project src/backend/WeatherApi --output migration.sql
```

**Por ahora:** SQL schema manual (sql/001-dashboard-schema.sql) sigue válido.

**Futuro:** Migrar a EF Migrations para cambios de schema tracked.

## Referencias

- [Dependency Injection with Azure SDK for .NET](https://learn.microsoft.com/en-us/dotnet/azure/sdk/dependency-injection)
- [Entity Framework Core Best Practices](https://learn.microsoft.com/en-us/ef/core/)
- [Service Layer Pattern](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection)
- [ASP.NET Core Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/)

## Build Status

✅ Backend (WeatherApi): Build succeeded  
✅ DashboardWorker: Build succeeded  
✅ All projects: 0 warnings, 0 errors
