namespace Monopoly.Domain.Enums;

/// <summary>
/// Où en est le tour courant. Le serveur n'accepte une action que si elle
/// correspond à la phase en cours (état autoritaire, cf. ADR 0003).
/// </summary>
public enum TurnPhase
{
    /// <summary>Le joueur courant doit lancer les dés.</summary>
    AwaitingRoll,

    /// <summary>Le joueur vient de tomber sur un bien libre : acheter ou passer.</summary>
    AwaitingPurchaseDecision,

    /// <summary>Le joueur est en prison et doit choisir : payer, carte, ou tenter un doublet.</summary>
    AwaitingJailDecision,

    /// <summary>Tout est résolu, le joueur peut construire/échanger puis finir son tour.</summary>
    AwaitingEndTurn,

    /// <summary>Le joueur doit régler une dette avant de continuer (vendre/hypothéquer ou faire faillite).</summary>
    AwaitingDebtSettlement
}
