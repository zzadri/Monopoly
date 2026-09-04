using Mediator;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.CreateGame;

public record CreateGameCommand(
    Guid BoardVersionId,
    int MaxPlayers,
    bool IsPrivate,
    bool LoyerDoubleEnsembleComplet,
    bool CagnotteVacances,
    bool Encheres,
    bool PasDeLoyerEnPrison,
    bool ConstructionEquilibree,
    decimal ArgentDepart,
    bool MelangerOrdreJoueurs,
    int BotCount,
    BotDifficulty? BotDifficulty,
    int TurnLimit
) : IRequest<Guid>;
