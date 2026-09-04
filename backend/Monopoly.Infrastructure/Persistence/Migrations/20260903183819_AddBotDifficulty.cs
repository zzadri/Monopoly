using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monopoly.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBotDifficulty : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "BotDifficulty",
                table: "GameParticipants",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BotDifficulty",
                table: "GameParticipants");
        }
    }
}
