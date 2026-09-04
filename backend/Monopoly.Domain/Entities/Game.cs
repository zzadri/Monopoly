using Monopoly.Domain.Enums;

namespace Monopoly.Domain.Entities;

public class Game
{
    public Guid Id { get; init; }
    public required Guid BoardVersionId { get; init; }
    public GameStatus Status { get; set; } = GameStatus.Lobby;
    public required GameOptions Options { get; init; }
    public int MaxPlayers { get; set; }
    public bool IsPrivate { get; set; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }

    /// <summary>False as soon as one BotDePartie is seated (CONTEXT.md - Bot).</summary>
    public bool CountsForXpAndClassements { get; set; } = true;

    // --- État de tour (serveur autoritaire, cf. ADR 0003) ---

    public Guid? CurrentParticipantId { get; set; }
    public TurnPhase Phase { get; set; } = TurnPhase.AwaitingRoll;
    public int TurnNumber { get; set; }
    public int LastDie1 { get; set; }
    public int LastDie2 { get; set; }
    public int DoublesInARow { get; set; }

    /// <summary>Case sur laquelle une décision d'achat est en attente.</summary>
    public Guid? PendingPurchaseSpaceId { get; set; }

    /// <summary>Dette restant à régler par le joueur courant avant de pouvoir continuer.</summary>
    public decimal PendingDebtAmount { get; set; }

    /// <summary>Créancier de la dette en cours (null = la banque).</summary>
    public Guid? PendingDebtCreditorId { get; set; }

    /// <summary>Cagnotte "Vacances" si l'option est active.</summary>
    public decimal FreeParkingPot { get; set; }

    /// <summary>Pioches mélangées : ids de cartes, la prochaine est en tête.</summary>
    public string ChanceDeckOrder { get; set; } = string.Empty;
    public string CaisseCommuneDeckOrder { get; set; } = string.Empty;

    public Guid? WinnerParticipantId { get; set; }

    /// <summary>Évite de créditer deux fois l'XP de fin de partie.</summary>
    public bool XpAwarded { get; set; }

    public List<GameParticipant> Participants { get; init; } = [];
    public List<GameEvent> Events { get; init; } = [];
}
