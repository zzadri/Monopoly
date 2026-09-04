namespace Monopoly.Domain.Entities;

/// <summary>
/// A colour group of Terrain spaces. Minimum 2 properties per group, no
/// maximum (CONTEXT.md - Plateau personnalisé).
/// </summary>
public class PropertyGroup
{
    public Guid Id { get; init; }
    public Guid BoardId { get; init; }
    public required string Name { get; set; }
    public required string ColorHex { get; set; }
}
