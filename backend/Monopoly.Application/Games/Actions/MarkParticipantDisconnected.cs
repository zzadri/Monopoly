using Mediator;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Application.Games.Contracts;
using Monopoly.Application.Games.Engine;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.Actions;

/// <summary>
/// Un joueur a perdu sa connexion temps réel : son siège passe en Bot de repli
/// (CONTEXT.md — Bot) et la partie continue sans lui. Il récupère sa place en
/// se reconnectant, via <see cref="JoinGameCommand"/>.
///
/// Émise par le serveur depuis <c>GameHub.OnDisconnectedAsync</c>, jamais par un
/// client : personne ne peut donc déclarer un adversaire déconnecté.
/// </summary>
public record MarkParticipantDisconnectedCommand(Guid GameId, Guid ParticipantId) : IRequest<GameStateDto?>;

public class MarkParticipantDisconnectedCommandHandler(
    IMonopolyDbContext context,
    GameSessionService sessions,
    ProgressionService progression
) : IRequestHandler<MarkParticipantDisconnectedCommand, GameStateDto?>
{
    public async ValueTask<GameStateDto?> Handle(
        MarkParticipantDisconnectedCommand request,
        CancellationToken cancellationToken)
    {
        var state = await sessions.LoadAsync(request.GameId, cancellationToken);

        var participant = state.Game.Participants.FirstOrDefault(p => p.Id == request.ParticipantId);
        if (participant is null) return null;

        participant.IsConnected = false;

        // Un salon qui n'a pas démarré n'a pas de tour à débloquer, et un siège
        // déjà tenu par un bot ou déjà en faillite n'a rien à reprendre.
        var takeOver =
            state.Game.Status == GameStatus.InProgress
            && !participant.IsBankrupt
            && participant.Kind is ParticipantKind.Account or ParticipantKind.Guest;

        if (takeOver)
        {
            participant.Kind = ParticipantKind.BotDeRepli;

            // Pas de difficulté : un Bot de repli n'est pas un choix de partie.
            // BotPlayer retombe alors sur Moyen.
            participant.BotDifficulty = null;

            var engine = new GameEngine(state, Random.Shared);

            // Indispensable : les bots ne tournent d'habitude qu'à la suite d'une
            // action humaine (PerformGameAction). Si le joueur qui vient de partir
            // était le joueur courant, plus personne n'a le droit d'agir et la
            // partie resterait figée sur sa phase. C'est ici, et nulle part
            // ailleurs, qu'on la relance.
            BotPlayer.PlayPendingBotTurns(engine);

            foreach (var ownership in engine.NewOwnerships)
                context.PropertyOwnerships.Add(ownership);
            foreach (var trade in engine.NewTrades)
                context.TradeOffers.Add(trade);

            await progression.AwardIfFinishedAsync(state, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);

        return sessions.ToDto(state, null);
    }
}
