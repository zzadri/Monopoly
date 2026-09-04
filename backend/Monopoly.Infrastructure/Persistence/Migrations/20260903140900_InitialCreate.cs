using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monopoly.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Boards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Rows = table.Column<int>(type: "integer", nullable: false),
                    Columns = table.Column<int>(type: "integer", nullable: false),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Boards", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Games",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BoardVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Options_LoyerDoubleEnsembleComplet = table.Column<bool>(type: "boolean", nullable: false),
                    Options_CagnotteVacances = table.Column<bool>(type: "boolean", nullable: false),
                    Options_Encheres = table.Column<bool>(type: "boolean", nullable: false),
                    Options_PasDeLoyerEnPrison = table.Column<bool>(type: "boolean", nullable: false),
                    Options_HypothequeSansLoyer = table.Column<bool>(type: "boolean", nullable: false),
                    Options_ConstructionEquilibree = table.Column<bool>(type: "boolean", nullable: false),
                    Options_ArgentDepart = table.Column<decimal>(type: "numeric", nullable: false),
                    Options_MelangerOrdreJoueurs = table.Column<bool>(type: "boolean", nullable: false),
                    MaxPlayers = table.Column<int>(type: "integer", nullable: false),
                    IsPrivate = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CountsForXpAndClassements = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Games", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Players",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KeycloakSubject = table.Column<string>(type: "text", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: false),
                    Xp = table.Column<int>(type: "integer", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Players", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PropertyOwnerships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    BoardSpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerParticipantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Houses = table.Column<int>(type: "integer", nullable: false),
                    HasHotel = table.Column<bool>(type: "boolean", nullable: false),
                    IsMortgaged = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PropertyOwnerships", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BoardVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BoardId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardVersions_Boards_BoardId",
                        column: x => x.BoardId,
                        principalTable: "Boards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PropertyGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BoardId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    ColorHex = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PropertyGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PropertyGroups_Boards_BoardId",
                        column: x => x.BoardId,
                        principalTable: "Boards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GameParticipants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlayerId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: false),
                    SeatOrder = table.Column<int>(type: "integer", nullable: false),
                    Money = table.Column<decimal>(type: "numeric", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    InPrison = table.Column<bool>(type: "boolean", nullable: false),
                    JailTurnsElapsed = table.Column<int>(type: "integer", nullable: false),
                    IsBankrupt = table.Column<bool>(type: "boolean", nullable: false),
                    IsConnected = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameParticipants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameParticipants_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BoardSpaces",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BoardVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    ImageUrl = table.Column<string>(type: "text", nullable: true),
                    PropertyGroupId = table.Column<Guid>(type: "uuid", nullable: true),
                    BasePrice = table.Column<decimal>(type: "numeric", nullable: true),
                    HouseCost = table.Column<decimal>(type: "numeric", nullable: true),
                    MortgageValue = table.Column<decimal>(type: "numeric", nullable: true),
                    RentOverrides = table.Column<decimal[]>(type: "numeric[]", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardSpaces", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoardSpaces_BoardVersions_BoardVersionId",
                        column: x => x.BoardVersionId,
                        principalTable: "BoardVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BoardSpaces_BoardVersionId",
                table: "BoardSpaces",
                column: "BoardVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardVersions_BoardId",
                table: "BoardVersions",
                column: "BoardId");

            migrationBuilder.CreateIndex(
                name: "IX_GameParticipants_GameId",
                table: "GameParticipants",
                column: "GameId");

            migrationBuilder.CreateIndex(
                name: "IX_Players_KeycloakSubject",
                table: "Players",
                column: "KeycloakSubject",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PropertyGroups_BoardId",
                table: "PropertyGroups",
                column: "BoardId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BoardSpaces");

            migrationBuilder.DropTable(
                name: "GameParticipants");

            migrationBuilder.DropTable(
                name: "Players");

            migrationBuilder.DropTable(
                name: "PropertyGroups");

            migrationBuilder.DropTable(
                name: "PropertyOwnerships");

            migrationBuilder.DropTable(
                name: "BoardVersions");

            migrationBuilder.DropTable(
                name: "Games");

            migrationBuilder.DropTable(
                name: "Boards");
        }
    }
}
