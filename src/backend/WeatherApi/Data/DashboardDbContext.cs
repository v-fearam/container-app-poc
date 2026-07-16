using WeatherApi.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherApi.Data;

/// <summary>
/// DbContext for Dashboard data (queue counters and Change Feed sync).
/// </summary>
public class DashboardDbContext : DbContext
{
    public DashboardDbContext(DbContextOptions<DashboardDbContext> options) : base(options)
    {
    }

    public DbSet<QueueCounter> QueueCounters => Set<QueueCounter>();
    public DbSet<PersonaSync> PersonasSync => Set<PersonaSync>();
    public DbSet<ChangeFeedCounter> ChangeFeedCounters => Set<ChangeFeedCounter>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(DashboardDbContext).Assembly);
    }
}
