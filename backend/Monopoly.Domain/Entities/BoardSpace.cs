using Monopoly.Domain.Enums;

namespace Monopoly.Domain.Entities;

/// <summary>
/// One case of a BoardVersion. Economic fields (BasePrice, HouseCost,
/// MortgageValue, PropertyGroupId) are only meaningful when Type is Terrain,
/// Gare or Compagnie; every other Type leaves them null.
///
/// Rent is derived automatically from BasePrice (see CONTEXT.md - Terrain
/// price progression for Terrain, 25*2^(n-1) for Gare, (4+6*(n-1))*dice for
/// Compagnie) unless RentOverrides is set, letting a creator hand-tune values
/// (Terrain only - Gare/Compagnie formulas are fixed, only their base price
/// is adjustable).
/// </summary>
public class BoardSpace
{
    public Guid Id { get; init; }
    public Guid BoardVersionId { get; init; }
    public required int Position { get; init; }
    public required SpaceType Type { get; set; }
    public required string Name { get; set; }
    public string? ImageUrl { get; set; }

    public Guid? PropertyGroupId { get; set; }
    public decimal? BasePrice { get; set; }
    public decimal? HouseCost { get; set; }
    public decimal? MortgageValue { get; set; }

    /// <summary>Terrain only: [nu, 1 maison, 2, 3, 4, hôtel]. Null = auto.</summary>
    public decimal[]? RentOverrides { get; set; }
}
