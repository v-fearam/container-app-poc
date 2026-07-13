using DashboardWorker.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace DashboardWorker.Data.Configurations;

/// <summary>
/// Entity configuration for ComponentHealth.
/// </summary>
public class ComponentHealthConfiguration : IEntityTypeConfiguration<ComponentHealth>
{
    public void Configure(EntityTypeBuilder<ComponentHealth> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.ComponentName)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(c => c.Status)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(c => c.LastHeartbeat)
            .IsRequired();

        builder.Property(c => c.Metadata)
            .HasMaxLength(1000);

        // Unique constraint on component name
        builder.HasIndex(c => c.ComponentName)
            .IsUnique()
            .HasDatabaseName("UQ_ComponentHealth_ComponentName");

        // Index for queries by status
        builder.HasIndex(c => c.Status)
            .HasDatabaseName("IX_ComponentHealth_Status");
    }
}
