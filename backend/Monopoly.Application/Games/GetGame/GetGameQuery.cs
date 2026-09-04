using Mediator;

namespace Monopoly.Application.Games.GetGame;

public record GetGameQuery(Guid GameId) : IRequest<GameDto?>;

public record GameDto(
    Guid Id,
    Guid BoardVersionId,
    string Status,
    int MaxPlayers,
    bool IsPrivate,
    bool CountsForXpAndClassements,
    decimal ArgentDepart,
    bool LoyerDoubleEnsembleComplet,
    bool CagnotteVacances,
    bool Encheres,
    bool PasDeLoyerEnPrison,
    bool HypothequeSansLoyer,
    bool ConstructionEquilibree,
    bool MelangerOrdreJoueurs,
    IReadOnlyList<GameParticipantDto> Participants
);

public record GameParticipantDto(
    Guid Id,
    string DisplayName,
    string Kind,
    int SeatOrder,
    decimal Money,
    int Position,
    string? BotDifficulty
);
