using WeatherApi.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherApi.Data;

/// <summary>
/// DbContext for Dashboard data (queue counters, Change Feed counters, job executions).
/// PersonasSync removed — star model is queried via raw SQL View.
/// </summary>
public class DashboardDbContext : DbContext
{
    public DashboardDbContext(DbContextOptions<DashboardDbContext> options) : base(options)
    {
    }

    public DbSet<QueueCounter> QueueCounters => Set<QueueCounter>();
    public DbSet<ChangeFeedCounter> ChangeFeedCounters => Set<ChangeFeedCounter>();
    public DbSet<JobExecution> JobExecutions => Set<JobExecution>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(DashboardDbContext).Assembly);
    }
}
