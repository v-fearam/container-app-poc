using WeatherApi.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace WeatherApi.Data.Configurations;

/// <summary>
/// Entity configuration for QueueCounter with indexes and constraints.
/// </summary>
public class QueueCounterConfiguration : IEntityTypeConfiguration<QueueCounter>
{
    public void Configure(EntityTypeBuilder<QueueCounter> builder)
    {
        builder.HasKey(q => q.Id);

        builder.Property(q => q.Vertical)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(q => q.QueueName)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(q => q.ProcessType)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(q => q.Date)
            .IsRequired()
            .HasColumnType("date");

        builder.Property(q => q.EnqueuedCount)
            .IsRequired()
            .HasDefaultValue(0);

        builder.Property(q => q.ProcessedCount)
            .IsRequired()
            .HasDefaultValue(0);

        builder.Property(q => q.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("GETUTCDATE()");

        builder.Property(q => q.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("GETUTCDATE()");

        // Unique constraint matching SQL schema
        builder.HasIndex(q => new { q.Vertical, q.QueueName, q.ProcessType, q.Date })
            .IsUnique()
            .HasDatabaseName("UQ_QueueCounters_Vertical_Queue_ProcessType_Date");

        // Index for dashboard queries
        builder.HasIndex(q => new { q.Date, q.Vertical })
            .HasDatabaseName("IX_QueueCounters_Date_Vertical");
    }
}
