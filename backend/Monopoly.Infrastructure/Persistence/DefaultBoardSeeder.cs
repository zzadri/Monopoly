using Microsoft.EntityFrameworkCore;
using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;

namespace Monopoly.Infrastructure.Persistence;

/// <summary>
/// Idempotent bootstrap of the default board — the classic 40-case French
/// Monopoly layout, with "Vacances" (Monopoly.md's custom rule) taking the
/// bottom-right corner instead of "Parc Gratuit". Runs in every environment
/// at startup: CreateGame always needs a BoardVersion to point at.
/// </summary>
public static class DefaultBoardSeeder
{
    public static readonly Guid DefaultBoardId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    public static readonly Guid DefaultBoardVersionId = Guid.Parse("00000000-0000-0000-0000-000000000002");

    private record GroupDef(Guid Id, string Name, string ColorHex, decimal HouseCost);

    private static readonly GroupDef Marron = new(Guid.Parse("00000000-0000-0000-0001-000000000001"), "Marron", "#955436", 50m);
    private static readonly GroupDef BleuCiel = new(Guid.Parse("00000000-0000-0000-0001-000000000002"), "Bleu ciel", "#AAE0FA", 50m);
    private static readonly GroupDef Rose = new(Guid.Parse("00000000-0000-0000-0001-000000000003"), "Rose", "#D93A96", 100m);
    private static readonly GroupDef Orange = new(Guid.Parse("00000000-0000-0000-0001-000000000004"), "Orange", "#F7941D", 100m);
    private static readonly GroupDef Rouge = new(Guid.Parse("00000000-0000-0000-0001-000000000005"), "Rouge", "#ED1B24", 150m);
    private static readonly GroupDef Jaune = new(Guid.Parse("00000000-0000-0000-0001-000000000006"), "Jaune", "#FEF200", 150m);
    private static readonly GroupDef Vert = new(Guid.Parse("00000000-0000-0000-0001-000000000007"), "Vert", "#1FB25A", 200m);
    private static readonly GroupDef BleuFonce = new(Guid.Parse("00000000-0000-0000-0001-000000000008"), "Bleu foncé", "#0072BB", 200m);

    public static async Task SeedAsync(MonopolyDbContext context)
    {
        await context.Database.MigrateAsync();

        if (await context.Boards.AnyAsync(b => b.Id == DefaultBoardId))
            return;

        var groups = new[] { Marron, BleuCiel, Rose, Orange, Rouge, Jaune, Vert, BleuFonce };

        var board = new Board
        {
            Id = DefaultBoardId,
            CreatorId = null,
            Name = "Plateau par défaut",
            Rows = 11,
            Columns = 11,
            IsPublic = true,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        board.PropertyGroups.AddRange(groups.Select(g => new PropertyGroup { Id = g.Id, BoardId = board.Id, Name = g.Name, ColorHex = g.ColorHex }));

        var version = new BoardVersion
        {
            Id = DefaultBoardVersionId,
            BoardId = board.Id,
            VersionNumber = 1,
            PublishedAt = DateTimeOffset.UtcNow,
        };

        BoardSpace Terrain(int position, string name, GroupDef group, decimal price) => new()
        {
            Id = Guid.NewGuid(),
            BoardVersionId = version.Id,
            Position = position,
            Type = SpaceType.Terrain,
            Name = name,
            PropertyGroupId = group.Id,
            BasePrice = price,
            HouseCost = group.HouseCost,
            MortgageValue = price / 2,
        };

        BoardSpace Gare(int position, string name) => new()
        {
            Id = Guid.NewGuid(),
            BoardVersionId = version.Id,
            Position = position,
            Type = SpaceType.Gare,
            Name = name,
            BasePrice = 200m,
            MortgageValue = 100m,
        };

        BoardSpace Compagnie(int position, string name) => new()
        {
            Id = Guid.NewGuid(),
            BoardVersionId = version.Id,
            Position = position,
            Type = SpaceType.Compagnie,
            Name = name,
            BasePrice = 150m,
            MortgageValue = 75m,
        };

        BoardSpace Special(int position, SpaceType type, string name) => new()
        {
            Id = Guid.NewGuid(),
            BoardVersionId = version.Id,
            Position = position,
            Type = type,
            Name = name,
        };

        version.Spaces.AddRange([
            Special(0, SpaceType.Depart, "Départ"),
            Terrain(1, "Boulevard de Belleville", Marron, 60m),
            Special(2, SpaceType.CaisseCommune, "Caisse de Communauté"),
            Terrain(3, "Rue Lecourbe", Marron, 60m),
            Special(4, SpaceType.Taxe, "Impôt sur le Revenu"),
            Gare(5, "Gare Montparnasse"),
            Terrain(6, "Rue de Vaugirard", BleuCiel, 100m),
            Special(7, SpaceType.Chance, "Chance"),
            Terrain(8, "Rue de Courcelles", BleuCiel, 100m),
            Terrain(9, "Avenue de la République", BleuCiel, 120m),
            Special(10, SpaceType.Prison, "Prison / Simple visite"),
            Terrain(11, "Boulevard de la Villette", Rose, 140m),
            Compagnie(12, "Compagnie de Distribution d'Électricité"),
            Terrain(13, "Avenue de Neuilly", Rose, 140m),
            Terrain(14, "Rue de Paradis", Rose, 160m),
            Gare(15, "Gare de Lyon"),
            Terrain(16, "Avenue Mozart", Orange, 180m),
            Special(17, SpaceType.CaisseCommune, "Caisse de Communauté"),
            Terrain(18, "Boulevard Saint-Michel", Orange, 180m),
            Terrain(19, "Place Pigalle", Orange, 200m),
            Special(20, SpaceType.Vacances, "Vacances"),
            Terrain(21, "Avenue Matignon", Rouge, 220m),
            Special(22, SpaceType.Chance, "Chance"),
            Terrain(23, "Boulevard Malesherbes", Rouge, 220m),
            Terrain(24, "Avenue Henri-Martin", Rouge, 240m),
            Gare(25, "Gare du Nord"),
            Terrain(26, "Faubourg Saint-Honoré", Jaune, 260m),
            Terrain(27, "Place de la Bourse", Jaune, 260m),
            Compagnie(28, "Compagnie des Eaux"),
            Terrain(29, "Rue La Fayette", Jaune, 280m),
            Special(30, SpaceType.AllezEnPrison, "Allez en Prison"),
            Terrain(31, "Avenue de Breteuil", Vert, 300m),
            Terrain(32, "Avenue Foch", Vert, 300m),
            Special(33, SpaceType.CaisseCommune, "Caisse de Communauté"),
            Terrain(34, "Boulevard des Capucines", Vert, 320m),
            Gare(35, "Gare Saint-Lazare"),
            Special(36, SpaceType.Chance, "Chance"),
            Terrain(37, "Avenue des Champs-Élysées", BleuFonce, 350m),
            Special(38, SpaceType.Taxe, "Taxe de Luxe"),
            Terrain(39, "Rue de la Paix", BleuFonce, 400m),
        ]);

        board.Versions.Add(version);

        context.Boards.Add(board);
        await context.SaveChangesAsync();
    }
}
