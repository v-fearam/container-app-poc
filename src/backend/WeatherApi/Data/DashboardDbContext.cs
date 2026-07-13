using WeatherApi.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherApi.Data;

/// <summary>
/// DbContext for Dashboard data including queue counters and component health.
/// </summary>
public class DashboardDbContext : DbContext
{
    public DashboardDbContext(DbContextOptions<DashboardDbContext> options) : base(options)
    {
    }

    public DbSet<QueueCounter> QueueCounters => Set<QueueCounter>();
    public DbSet<ComponentHealth> ComponentHealth => Set<ComponentHealth>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Apply all configurations from assembly
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(DashboardDbContext).Assembly);
    }
}
