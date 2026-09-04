using Mediator;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Application.Games.Contracts;
using Monopoly.Application.Games.Engine;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.Actions;

public record ProposeTradeCommand(
    Guid GameId,
    Guid TargetId,
    IReadOnlyList<Guid> OfferedSpaceIds,
    IReadOnlyList<Guid> RequestedSpaceIds,
    decimal OfferedMoney,
    decimal RequestedMoney,
    string? GuestSecret
) : IRequest<GameStateDto>;

public record RespondTradeCommand(Guid GameId, Guid TradeId, bool Accept, string? GuestSecret) : IRequest<GameStateDto>;

public class ProposeTradeCommandHandler(
    IMonopolyDbContext context,
    GameSessionService sessions,
    ProgressionService progression,
    ICurrentUserService currentUser
) : IRequestHandler<ProposeTradeCommand, GameStateDto>
{
    public async ValueTask<GameStateDto> Handle(ProposeTradeCommand request, CancellationToken cancellationToken)
    {
        var state = await sessions.LoadAsync(request.GameId, cancellationToken);
        var playerId = await currentUser.TryGetPlayerIdAsync(cancellationToken);
        var actor = sessions.ResolveActor(state, playerId, request.GuestSecret)
            ?? throw new UnauthorizedAccessException("Vous ne participez pas à cette partie.");

        var engine = new GameEngine(state, Random.Shared);
        engine.ProposeTrade(actor.Id, request.TargetId, request.OfferedSpaceIds, request.RequestedSpaceIds,
            request.OfferedMoney, request.RequestedMoney);

        // Un bot destinataire répond immédiatement.
        BotPlayer.AnswerPendingTrades(engine);

        foreach (var trade in engine.NewTrades)
            context.TradeOffers.Add(trade);

        await progression.AwardIfFinishedAsync(state, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
        return sessions.ToDto(state, actor.Id);
    }
}

public class RespondTradeCommandHandler(
    IMonopolyDbContext context,
    GameSessionService sessions,
    ProgressionService progression,
    ICurrentUserService currentUser
) : IRequestHandler<RespondTradeCommand, GameStateDto>
{
    public async ValueTask<GameStateDto> Handle(RespondTradeCommand request, CancellationToken cancellationToken)
    {
        var state = await sessions.LoadAsync(request.GameId, cancellationToken);
        var playerId = await currentUser.TryGetPlayerIdAsync(cancellationToken);
        var actor = sessions.ResolveActor(state, playerId, request.GuestSecret)
            ?? throw new UnauthorizedAccessException("Vous ne participez pas à cette partie.");

        var engine = new GameEngine(state, Random.Shared);
        engine.RespondToTrade(actor.Id, request.TradeId, request.Accept);

        if (state.Game.Status == GameStatus.InProgress)
            BotPlayer.PlayPendingBotTurns(engine);

        foreach (var ownership in engine.NewOwnerships)
            context.PropertyOwnerships.Add(ownership);
        foreach (var trade in engine.NewTrades)
            context.TradeOffers.Add(trade);

        await progression.AwardIfFinishedAsync(state, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
        return sessions.ToDto(state, actor.Id);
    }
}
