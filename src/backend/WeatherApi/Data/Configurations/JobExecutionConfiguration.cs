using WeatherApi.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace WeatherApi.Data.Configurations;

/// <summary>
/// Entity configuration for JobExecution with unique constraint per job/date/hour.
/// </summary>
public class JobExecutionConfiguration : IEntityTypeConfiguration<JobExecution>
{
    public void Configure(EntityTypeBuilder<JobExecution> builder)
    {
        builder.HasKey(j => j.Id);

        builder.Property(j => j.JobName)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(j => j.Date)
            .IsRequired()
            .HasColumnType("date");

        builder.Property(j => j.Hour)
            .IsRequired();

        builder.Property(j => j.ExecutionCount)
            .IsRequired()
            .HasDefaultValue(0);

        builder.Property(j => j.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("GETUTCDATE()");

        // Unique constraint: one counter per job per date per hour
        builder.HasIndex(j => new { j.JobName, j.Date, j.Hour })
            .IsUnique()
            .HasDatabaseName("UQ_JobExecutions_JobName_Date_Hour");

        // Index for dashboard queries (get recent executions by date)
        builder.HasIndex(j => new { j.Date, j.JobName })
            .HasDatabaseName("IX_JobExecutions_Date_JobName");
    }
}
