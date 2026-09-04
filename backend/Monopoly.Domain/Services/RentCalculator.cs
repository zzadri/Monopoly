using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;

namespace Monopoly.Domain.Services;

/// <summary>
/// Formules de loyer actées dans CONTEXT.md :
/// - Terrain : loyer nu ≈ 6 % du prix, ×5 / ×15 / ×35 / ×50 selon les maisons, ×70 avec hôtel.
///   Le créateur d'un plateau peut écraser ces valeurs (BoardSpace.RentOverrides).
/// - Gare : 25 × 2^(n-1), n = nombre de gares du même propriétaire.
/// - Compagnie : dés × (4 + 6×(n-1)), n = nombre de compagnies du même propriétaire.
/// </summary>
public static class RentCalculator
{
    private static readonly decimal[] BuildingMultipliers = [1m, 5m, 15m, 35m, 50m, 70m];

    public static decimal BaseTerrainRent(decimal price) => Math.Round(price * 0.06m, 0, MidpointRounding.AwayFromZero);

    /// <param name="ownsWholeGroup">Le propriétaire détient tout le groupe de couleur.</param>
    /// <param name="doubleRentOptionActive">Option "Loyer doublé pour les ensembles complets".</param>
    public static decimal TerrainRent(
        BoardSpace space,
        int houses,
        bool hasHotel,
        bool ownsWholeGroup,
        bool doubleRentOptionActive)
    {
        var buildingIndex = hasHotel ? 5 : Math.Clamp(houses, 0, 4);

        if (space.RentOverrides is { Length: 6 } overrides)
            return overrides[buildingIndex];

        var baseRent = BaseTerrainRent(space.BasePrice ?? 0m);
        var rent = baseRent * BuildingMultipliers[buildingIndex];

        // Le doublement ne s'applique qu'aux terrains nus d'un groupe complet.
        if (buildingIndex == 0 && ownsWholeGroup && doubleRentOptionActive)
            rent *= 2m;

        return rent;
    }

    public static decimal StationRent(decimal basePrice, int stationsOwned)
    {
        if (stationsOwned <= 0) return 0m;
        var unit = basePrice > 0 ? Math.Round(basePrice / 8m, 0, MidpointRounding.AwayFromZero) : 25m;
        return unit * (decimal)Math.Pow(2, stationsOwned - 1);
    }

    public static decimal UtilityRent(int diceTotal, int utilitiesOwned)
    {
        if (utilitiesOwned <= 0) return 0m;
        var multiplier = 4 + 6 * (utilitiesOwned - 1);
        return diceTotal * multiplier;
    }

    public static decimal MortgageValue(BoardSpace space) => space.MortgageValue ?? (space.BasePrice ?? 0m) / 2m;

    /// <summary>Rachat d'hypothèque : principal + 10 % d'intérêt (Monopoly.md §14).</summary>
    public static decimal UnmortgageCost(BoardSpace space) => Math.Round(MortgageValue(space) * 1.1m, 0, MidpointRounding.AwayFromZero);

    public static bool IsOwnable(SpaceType type) =>
        type is SpaceType.Terrain or SpaceType.Gare or SpaceType.Compagnie;
}
