using WeatherApi.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherApi.Data;

/// <summary>
/// DbContext for Dashboard data (queue counters).
/// </summary>
public class DashboardDbContext : DbContext
{
    public DashboardDbContext(DbContextOptions<DashboardDbContext> options) : base(options)
    {
    }

    public DbSet<QueueCounter> QueueCounters => Set<QueueCounter>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(DashboardDbContext).Assembly);
    }
}
