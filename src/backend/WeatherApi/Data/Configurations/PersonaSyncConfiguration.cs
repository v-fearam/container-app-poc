using WeatherApi.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace WeatherApi.Data.Configurations;

/// <summary>
/// Entity configuration for PersonaSync.
/// </summary>
public class PersonaSyncConfiguration : IEntityTypeConfiguration<PersonaSync>
{
    public void Configure(EntityTypeBuilder<PersonaSync> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.Id)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(p => p.Nombre)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(p => p.Apellido)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(p => p.Email)
            .HasMaxLength(300);

        builder.Property(p => p.Ciudad)
            .HasMaxLength(200);

        builder.Property(p => p.CosmosUpdatedAt)
            .IsRequired()
            .HasColumnType("datetime2");

        builder.Property(p => p.SyncedAt)
            .IsRequired()
            .HasColumnType("datetime2");

        builder.Property(p => p.SyncVersion)
            .IsRequired()
            .HasDefaultValue(1);

        // Index for lookups by name
        builder.HasIndex(p => new { p.Apellido, p.Nombre })
            .HasDatabaseName("IX_PersonasSync_Apellido_Nombre");

        // Index for sync queries (check if record needs update)
        builder.HasIndex(p => p.CosmosUpdatedAt)
            .HasDatabaseName("IX_PersonasSync_CosmosUpdatedAt");
    }
}
