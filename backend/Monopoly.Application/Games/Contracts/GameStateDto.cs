namespace Monopoly.Application.Games.Contracts;

/// <summary>Vue complète d'une partie telle que le client doit l'afficher.</summary>
public record GameStateDto(
    Guid Id,
    string Status,
    string Phase,
    int TurnNumber,
    Guid? CurrentParticipantId,
    Guid? WinnerParticipantId,
    int Rows,
    int Columns,
    int Die1,
    int Die2,
    decimal FreeParkingPot,
    decimal PendingDebtAmount,
    PendingPurchaseDto? PendingPurchase,
    GameOptionsDto Options,
    IReadOnlyList<GameSpaceDto> Spaces,
    IReadOnlyList<GamePlayerDto> Players,
    IReadOnlyList<GameEventDto> Events,
    IReadOnlyList<TradeOfferDto> Trades,
    Guid? YourParticipantId
);

public record TradeOfferDto(
    Guid Id,
    Guid ProposerId,
    string ProposerName,
    Guid TargetId,
    string TargetName,
    IReadOnlyList<TradeSpaceDto> Offered,
    IReadOnlyList<TradeSpaceDto> Requested,
    decimal OfferedMoney,
    decimal RequestedMoney
);

public record TradeSpaceDto(Guid Id, string Name, string? GroupColorHex);

public record PendingPurchaseDto(Guid SpaceId, string Name, decimal Price);

public record GameOptionsDto(
    decimal ArgentDepart,
    bool LoyerDoubleEnsembleComplet,
    bool CagnotteVacances,
    bool Encheres,
    bool PasDeLoyerEnPrison,
    bool HypothequeSansLoyer,
    bool ConstructionEquilibree,
    bool MelangerOrdreJoueurs,
    int TurnLimit
);

public record GameSpaceDto(
    Guid Id,
    int Position,
    string Type,
    string Name,
    string? GroupColorHex,
    decimal? Price,
    decimal? HouseCost,
    Guid? OwnerParticipantId,
    int Houses,
    bool HasHotel,
    bool IsMortgaged,
    decimal? CurrentRent,
    bool CanBuild,
    bool CanSellBuilding,
    bool CanMortgage,
    bool CanUnmortgage
);

public record GamePlayerDto(
    Guid Id,
    string DisplayName,
    string Kind,
    string? BotDifficulty,
    decimal Money,
    int Position,
    bool InPrison,
    bool IsBankrupt,
    bool IsConnected,
    int GetOutOfJailCards,
    string TokenColor,
    decimal NetWorth,
    int SeatOrder
);

public record GameEventDto(int Sequence, string Type, string Message, Guid? ParticipantId, DateTimeOffset CreatedAt);

/// <summary>Résumé d'une partie ouverte, pour la liste des salons.</summary>
public record GameSummaryDto(
    Guid Id,
    string Status,
    int MaxPlayers,
    int PlayerCount,
    bool IsPrivate,
    decimal ArgentDepart,
    bool HasBots,
    string HostName,
    DateTimeOffset CreatedAt
);
