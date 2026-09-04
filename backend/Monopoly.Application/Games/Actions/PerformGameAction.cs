using Mediator;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Application.Games.Contracts;
using Monopoly.Application.Games.Engine;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.Actions;

public enum GameActionType
{
    Start,
    Roll,
    Buy,
    Decline,
    EndTurn,
    Build,
    SellBuilding,
    Mortgage,
    Unmortgage,
    PayJailFine,
    UseJailCard,
    Bankrupt
}

public record PerformGameActionCommand(
    Guid GameId,
    GameActionType Action,
    Guid? SpaceId,
    string? GuestSecret
) : IRequest<GameStateDto>;

public class PerformGameActionCommandHandler(
    IMonopolyDbContext context,
    GameSessionService sessions,
    ProgressionService progression,
    ICurrentUserService currentUser
) : IRequestHandler<PerformGameActionCommand, GameStateDto>
{
    public async ValueTask<GameStateDto> Handle(PerformGameActionCommand request, CancellationToken cancellationToken)
    {
        var state = await sessions.LoadAsync(request.GameId, cancellationToken);

        var playerId = await currentUser.TryGetPlayerIdAsync(cancellationToken);
        var actor = sessions.ResolveActor(state, playerId, request.GuestSecret)
            ?? throw new UnauthorizedAccessException("Vous ne participez pas à cette partie.");

        var engine = new GameEngine(state, Random.Shared);

        switch (request.Action)
        {
            case GameActionType.Start:
                engine.Start();
                break;
            case GameActionType.Roll:
                engine.Roll(actor.Id);
                break;
            case GameActionType.Buy:
                engine.BuyPendingProperty(actor.Id);
                break;
            case GameActionType.Decline:
                engine.DeclinePendingProperty(actor.Id);
                break;
            case GameActionType.EndTurn:
                engine.EndTurn(actor.Id);
                break;
            case GameActionType.Build:
                engine.BuildHouse(actor.Id, RequireSpace(request));
                break;
            case GameActionType.SellBuilding:
                engine.SellBuilding(actor.Id, RequireSpace(request));
                break;
            case GameActionType.Mortgage:
                engine.Mortgage(actor.Id, RequireSpace(request));
                break;
            case GameActionType.Unmortgage:
                engine.Unmortgage(actor.Id, RequireSpace(request));
                break;
            case GameActionType.PayJailFine:
                engine.PayJailFine(actor.Id);
                break;
            case GameActionType.UseJailCard:
                engine.UseJailCard(actor.Id);
                break;
            case GameActionType.Bankrupt:
                engine.DeclareBankruptcy(actor.Id);
                break;
        }

        // Les bots enchaînent leurs tours immédiatement après l'action humaine.
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

    private static Guid RequireSpace(PerformGameActionCommand request) =>
        request.SpaceId ?? throw new ArgumentException("Cette action nécessite une case cible.", nameof(request));
}
