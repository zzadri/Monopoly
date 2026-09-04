using Mediator;
using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;

namespace Monopoly.Application.Games.GetGame;

public class GetGameQueryHandler(IMonopolyDbContext context) : IRequestHandler<GetGameQuery, GameDto?>
{
    public async ValueTask<GameDto?> Handle(GetGameQuery request, CancellationToken cancellationToken)
    {
        var game = await context.Games
            .Include(g => g.Participants)
            .SingleOrDefaultAsync(g => g.Id == request.GameId, cancellationToken);

        if (game is null)
            return null;

        return new GameDto(
            game.Id,
            game.BoardVersionId,
            game.Status.ToString(),
            game.MaxPlayers,
            game.IsPrivate,
            game.CountsForXpAndClassements,
            game.Options.ArgentDepart,
            game.Options.LoyerDoubleEnsembleComplet,
            game.Options.CagnotteVacances,
            game.Options.Encheres,
            game.Options.PasDeLoyerEnPrison,
            game.Options.ConstructionEquilibree,
            game.Options.MelangerOrdreJoueurs,
            game.Participants
                .OrderBy(p => p.SeatOrder)
                .Select(p => new GameParticipantDto(p.Id, p.DisplayName, p.Kind.ToString(), p.SeatOrder, p.Money, p.Position, p.BotDifficulty?.ToString()))
                .ToList()
        );
    }
}
