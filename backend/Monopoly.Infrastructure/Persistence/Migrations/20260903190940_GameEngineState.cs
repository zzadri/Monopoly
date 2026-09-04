using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monopoly.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class GameEngineState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CaisseCommuneDeckOrder",
                table: "Games",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ChanceDeckOrder",
                table: "Games",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "CurrentParticipantId",
                table: "Games",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DoublesInARow",
                table: "Games",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "FreeParkingPot",
                table: "Games",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "LastDie1",
                table: "Games",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "LastDie2",
                table: "Games",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "PendingDebtAmount",
                table: "Games",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingDebtCreditorId",
                table: "Games",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingPurchaseSpaceId",
                table: "Games",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Phase",
                table: "Games",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TurnNumber",
                table: "Games",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "WinnerParticipantId",
                table: "Games",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GetOutOfJailCards",
                table: "GameParticipants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "GuestSecret",
                table: "GameParticipants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TokenColor",
                table: "GameParticipants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "GameEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Message = table.Column<string>(type: "text", nullable: false),
                    ParticipantId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameEvents_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PropertyOwnerships_GameId_BoardSpaceId",
                table: "PropertyOwnerships",
                columns: new[] { "GameId", "BoardSpaceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameParticipants_GuestSecret",
                table: "GameParticipants",
                column: "GuestSecret");

            migrationBuilder.CreateIndex(
                name: "IX_GameEvents_GameId_Sequence",
                table: "GameEvents",
                columns: new[] { "GameId", "Sequence" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameEvents");

            migrationBuilder.DropIndex(
                name: "IX_PropertyOwnerships_GameId_BoardSpaceId",
                table: "PropertyOwnerships");

            migrationBuilder.DropIndex(
                name: "IX_GameParticipants_GuestSecret",
                table: "GameParticipants");

            migrationBuilder.DropColumn(
                name: "CaisseCommuneDeckOrder",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "ChanceDeckOrder",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "CurrentParticipantId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "DoublesInARow",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "FreeParkingPot",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "LastDie1",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "LastDie2",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "PendingDebtAmount",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "PendingDebtCreditorId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "PendingPurchaseSpaceId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "Phase",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "TurnNumber",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "WinnerParticipantId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "GetOutOfJailCards",
                table: "GameParticipants");

            migrationBuilder.DropColumn(
                name: "GuestSecret",
                table: "GameParticipants");

            migrationBuilder.DropColumn(
                name: "TokenColor",
                table: "GameParticipants");
        }
    }
}
