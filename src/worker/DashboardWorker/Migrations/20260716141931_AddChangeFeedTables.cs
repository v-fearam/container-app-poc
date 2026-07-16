using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DashboardWorker.Migrations
{
    /// <inheritdoc />
    public partial class AddChangeFeedTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ChangeFeedCounters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Collection = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Date = table.Column<DateTime>(type: "date", nullable: false),
                    SuccessCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    ErrorCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChangeFeedCounters", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PersonasSync",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Nombre = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Apellido = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Edad = table.Column<int>(type: "int", nullable: true),
                    Ciudad = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CosmosUpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SyncedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SyncVersion = table.Column<int>(type: "int", nullable: false, defaultValue: 1)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersonasSync", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QueueCounters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Vertical = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    QueueName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ProcessType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Date = table.Column<DateTime>(type: "date", nullable: false),
                    EnqueuedCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    ProcessedCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QueueCounters", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ChangeFeedCounters_Date",
                table: "ChangeFeedCounters",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "UQ_ChangeFeedCounters_Collection_Date",
                table: "ChangeFeedCounters",
                columns: new[] { "Collection", "Date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PersonasSync_Apellido_Nombre",
                table: "PersonasSync",
                columns: new[] { "Apellido", "Nombre" });

            migrationBuilder.CreateIndex(
                name: "IX_PersonasSync_CosmosUpdatedAt",
                table: "PersonasSync",
                column: "CosmosUpdatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_QueueCounters_Date_Vertical",
                table: "QueueCounters",
                columns: new[] { "Date", "Vertical" });

            migrationBuilder.CreateIndex(
                name: "UQ_QueueCounters_Vertical_Queue_ProcessType_Date",
                table: "QueueCounters",
                columns: new[] { "Vertical", "QueueName", "ProcessType", "Date" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChangeFeedCounters");

            migrationBuilder.DropTable(
                name: "PersonasSync");

            migrationBuilder.DropTable(
                name: "QueueCounters");
        }
    }
}
