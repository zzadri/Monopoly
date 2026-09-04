using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monopoly.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class XpAwarded : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "XpAwarded",
                table: "Games",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "XpAwarded",
                table: "Games");
        }
    }
}
