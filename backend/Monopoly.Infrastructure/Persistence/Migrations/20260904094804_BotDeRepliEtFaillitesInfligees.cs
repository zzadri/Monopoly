using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monopoly.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BotDeRepliEtFaillitesInfligees : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Options_HypothequeSansLoyer",
                table: "Games");

            migrationBuilder.AddColumn<int>(
                name: "BankruptciesInflicted",
                table: "GameParticipants",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BankruptciesInflicted",
                table: "GameParticipants");

            migrationBuilder.AddColumn<bool>(
                name: "Options_HypothequeSansLoyer",
                table: "Games",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
