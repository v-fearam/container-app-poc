using WeatherApi.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace WeatherApi.Data.Configurations;

/// <summary>
/// Entity configuration for ChangeFeedCounter with unique constraint per collection/date.
/// </summary>
public class ChangeFeedCounterConfiguration : IEntityTypeConfiguration<ChangeFeedCounter>
{
    public void Configure(EntityTypeBuilder<ChangeFeedCounter> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.Collection)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(c => c.Date)
            .IsRequired()
            .HasColumnType("date");

        builder.Property(c => c.SuccessCount)
            .IsRequired()
            .HasDefaultValue(0);

        builder.Property(c => c.ErrorCount)
            .IsRequired()
            .HasDefaultValue(0);

        builder.Property(c => c.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("GETUTCDATE()");

        // Unique constraint: one counter per collection per date
        builder.HasIndex(c => new { c.Collection, c.Date })
            .IsUnique()
            .HasDatabaseName("UQ_ChangeFeedCounters_Collection_Date");

        // Index for dashboard queries (get today's counters)
        builder.HasIndex(c => c.Date)
            .HasDatabaseName("IX_ChangeFeedCounters_Date");
    }
}
