using Mediator;
using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Application.Games.Contracts;
using Monopoly.Application.Games.Engine;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.Actions;

public record GetGameStateQuery(Guid GameId, string? GuestSecret) : IRequest<GameStateDto>;

public class GetGameStateQueryHandler(
    GameSessionService sessions,
    ICurrentUserService currentUser
) : IRequestHandler<GetGameStateQuery, GameStateDto>
{
    public async ValueTask<GameStateDto> Handle(GetGameStateQuery request, CancellationToken cancellationToken)
    {
        var state = await sessions.LoadAsync(request.GameId, cancellationToken);
        var playerId = await currentUser.TryGetPlayerIdAsync(cancellationToken);
        var actor = sessions.ResolveActor(state, playerId, request.GuestSecret);
        return sessions.ToDto(state, actor?.Id);
    }
}

public record ListOpenGamesQuery : IRequest<IReadOnlyList<GameSummaryDto>>;

public class ListOpenGamesQueryHandler(IMonopolyDbContext context) : IRequestHandler<ListOpenGamesQuery, IReadOnlyList<GameSummaryDto>>
{
    public async ValueTask<IReadOnlyList<GameSummaryDto>> Handle(ListOpenGamesQuery request, CancellationToken cancellationToken)
    {
        var games = await context.Games
            .Include(g => g.Participants)
            .Where(g => !g.IsPrivate && (g.Status == GameStatus.Lobby || g.Status == GameStatus.InProgress))
            .OrderByDescending(g => g.CreatedAt)
            .Take(50)
            .ToListAsync(cancellationToken);

        return games.Select(g => new GameSummaryDto(
            g.Id,
            g.Status.ToString(),
            g.MaxPlayers,
            g.Participants.Count,
            g.IsPrivate,
            g.Options.ArgentDepart,
            g.Participants.Any(p => p.Kind == ParticipantKind.BotDePartie),
            g.Participants.OrderBy(p => p.SeatOrder).FirstOrDefault()?.DisplayName ?? "—",
            g.CreatedAt)).ToList();
    }
}
