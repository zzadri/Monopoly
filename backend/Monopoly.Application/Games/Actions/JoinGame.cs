using Mediator;
using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Application.Games.Contracts;
using Monopoly.Application.Games.Engine;
using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.Actions;

/// <summary>
/// Rejoindre un salon. Un compte prend un siège rattaché à son Player ; un
/// invité reçoit un secret opaque qui lui sert de laissez-passer pour agir
/// (il n'a pas de compte Keycloak, cf. Monopoly.md §1.2).
/// </summary>
public record JoinGameCommand(Guid GameId, string? GuestName, string? ExistingGuestSecret) : IRequest<JoinGameResult>;

public record JoinGameResult(GameStateDto State, Guid ParticipantId, string? GuestSecret);

public class JoinGameCommandHandler(
    IMonopolyDbContext context,
    GameSessionService sessions,
    ICurrentUserService currentUser
) : IRequestHandler<JoinGameCommand, JoinGameResult>
{
    private static readonly string[] TokenColors =
        ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#2c3e50", "#c2185b"];

    public async ValueTask<JoinGameResult> Handle(JoinGameCommand request, CancellationToken cancellationToken)
    {
        var state = await sessions.LoadAsync(request.GameId, cancellationToken);
        var game = state.Game;

        var playerId = await currentUser.TryGetPlayerIdAsync(cancellationToken);

        // Déjà assis ? On rend simplement la main sur le siège existant.
        var existing = sessions.ResolveActor(state, playerId, request.ExistingGuestSecret);
        if (existing is not null)
        {
            existing.IsConnected = true;
            if (existing.Kind == ParticipantKind.BotDeRepli)
            {
                // Rendre le siège à ce qu'il était : un invité qui revient reste
                // un invité. Seul un siège rattaché à un Player est un compte.
                existing.Kind = existing.PlayerId is null ? ParticipantKind.Guest : ParticipantKind.Account;
                existing.BotDifficulty = null;
            }
            await context.SaveChangesAsync(cancellationToken);
            return new JoinGameResult(sessions.ToDto(state, existing.Id), existing.Id, existing.GuestSecret);
        }

        if (game.Status != GameStatus.Lobby)
            throw new InvalidOperationException("Cette partie a déjà commencé.");
        if (game.Participants.Count >= game.MaxPlayers)
            throw new InvalidOperationException("Ce salon est complet.");

        string displayName;
        string? guestSecret = null;
        ParticipantKind kind;

        if (playerId is { } id)
        {
            var player = await context.Players.SingleAsync(p => p.Id == id, cancellationToken);
            displayName = player.DisplayName;
            kind = ParticipantKind.Account;
        }
        else
        {
            displayName = string.IsNullOrWhiteSpace(request.GuestName) ? "Invité" : request.GuestName.Trim();
            guestSecret = Guid.NewGuid().ToString("N");
            kind = ParticipantKind.Guest;
        }

        var seat = game.Participants.Count;
        var participant = new GameParticipant
        {
            Id = Guid.NewGuid(),
            GameId = game.Id,
            PlayerId = playerId,
            Kind = kind,
            DisplayName = displayName,
            SeatOrder = seat,
            Money = game.Options.ArgentDepart,
            Position = 0,
            TokenColor = TokenColors[seat % TokenColors.Length],
            GuestSecret = guestSecret,
        };

        game.Participants.Add(participant);

        var joinEvent = new GameEvent
        {
            Id = Guid.NewGuid(),
            GameId = game.Id,
            Sequence = state.NextEventSequence++,
            Type = "PlayerJoined",
            Message = $"{displayName} rejoint le salon.",
            ParticipantId = participant.Id,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        game.Events.Add(joinEvent);
        state.RecentEvents.Add(joinEvent);

        await context.SaveChangesAsync(cancellationToken);

        return new JoinGameResult(sessions.ToDto(state, participant.Id), participant.Id, guestSecret);
    }
}
