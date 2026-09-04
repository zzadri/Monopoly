namespace Monopoly.Domain.Entities;

/// <summary>
/// The default board (CreatorId null) or a Plateau personnalisé (CONTEXT.md):
/// 4x4 to 20x20, private by default, versioned - a Game always pins the
/// BoardVersionId it started with.
/// </summary>
public class Board
{
    public Guid Id { get; init; }
    public Guid? CreatorId { get; init; }
    public required string Name { get; set; }
    public int Rows { get; set; }
    public int Columns { get; set; }
    public bool IsPublic { get; set; }
    public DateTimeOffset CreatedAt { get; init; }

    public List<BoardVersion> Versions { get; init; } = [];
    public List<PropertyGroup> PropertyGroups { get; init; } = [];
}

/// <summary>
/// A frozen snapshot of a Board's spaces. A Game references one specific
/// BoardVersion so that a Rejeu stays consistent even after the creator
/// publishes an update (CONTEXT.md - Plateau personnalisé / Rejeu).
/// </summary>
public class BoardVersion
{
    public Guid Id { get; init; }
    public Guid BoardId { get; init; }
    public int VersionNumber { get; init; }
    public DateTimeOffset PublishedAt { get; init; }

    public List<BoardSpace> Spaces { get; init; } = [];
}
