using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monopoly.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TradesAndTurnLimit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Options_TurnLimit",
                table: "Games",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "TradeOffers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProposerId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferedSpaceIds = table.Column<string>(type: "text", nullable: false),
                    RequestedSpaceIds = table.Column<string>(type: "text", nullable: false),
                    OfferedMoney = table.Column<decimal>(type: "numeric", nullable: false),
                    RequestedMoney = table.Column<decimal>(type: "numeric", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TradeOffers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TradeOffers_GameId_Status",
                table: "TradeOffers",
                columns: new[] { "GameId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TradeOffers");

            migrationBuilder.DropColumn(
                name: "Options_TurnLimit",
                table: "Games");
        }
    }
}
