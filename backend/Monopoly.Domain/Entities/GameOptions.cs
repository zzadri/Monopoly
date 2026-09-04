namespace Monopoly.Domain.Entities;

/// <summary>
/// The configurable rules toggles from Monopoly.md §"Règles supplémentaires".
/// Owned by a Game; set once at creation.
/// </summary>
public class GameOptions
{
    public bool LoyerDoubleEnsembleComplet { get; set; }
    public bool CagnotteVacances { get; set; }
    public bool Encheres { get; set; }
    public bool PasDeLoyerEnPrison { get; set; }
    public bool HypothequeSansLoyer { get; set; }
    public bool ConstructionEquilibree { get; set; } = true;
    public decimal ArgentDepart { get; set; } = 1500m;
    public bool MelangerOrdreJoueurs { get; set; }

    /// <summary>
    /// Partie abrégée (Monopoly.md §IV-B) : au-delà de ce nombre de tours, le
    /// joueur le plus riche gagne. 0 = pas de limite.
    /// </summary>
    public int TurnLimit { get; set; }
}
