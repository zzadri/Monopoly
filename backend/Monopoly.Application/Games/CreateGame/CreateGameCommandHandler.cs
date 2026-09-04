using Mediator;
using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.CreateGame;

public class CreateGameCommandHandler(
    IMonopolyDbContext context,
    ICurrentUserService currentUser
) : IRequestHandler<CreateGameCommand, Guid>
{
    private static readonly decimal[] AllowedStartingMoney = [500m, 1000m, 1500m, 2000m, 2500m, 3000m];

    private static readonly string[] TokenColors =
        ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#2c3e50", "#c2185b"];

    public async ValueTask<Guid> Handle(CreateGameCommand request, CancellationToken cancellationToken)
    {
        if (request.MaxPlayers is < 2 or > 8)
            throw new ArgumentOutOfRangeException(nameof(request.MaxPlayers), "Le nombre de joueurs doit être entre 2 et 8.");

        if (!AllowedStartingMoney.Contains(request.ArgentDepart))
            throw new ArgumentOutOfRangeException(nameof(request.ArgentDepart), "Argent de départ invalide.");

        if (request.BotCount < 0 || 1 + request.BotCount > request.MaxPlayers)
            throw new ArgumentOutOfRangeException(nameof(request.BotCount), "Le nombre de bots doit laisser au moins une place et respecter le nombre de joueurs maximum.");

        if (request.TurnLimit is < 0 or > 2000)
            throw new ArgumentOutOfRangeException(nameof(request.TurnLimit), "La limite de tours doit rester entre 0 (illimité) et 2000.");

        if (request.BotCount > 0 && request.BotDifficulty is null)
            throw new ArgumentException("La difficulté des bots est requise dès qu'un bot est ajouté.", nameof(request.BotDifficulty));

        var boardVersionExists = await context.BoardVersions
            .AnyAsync(v => v.Id == request.BoardVersionId, cancellationToken);
        if (!boardVersionExists)
            throw new KeyNotFoundException($"BoardVersion {request.BoardVersionId} introuvable.");

        var creatorPlayerId = await currentUser.GetOrProvisionPlayerIdAsync(cancellationToken);
        var creator = await context.Players
            .SingleAsync(p => p.Id == creatorPlayerId, cancellationToken);

        var game = new Game
        {
            Id = Guid.NewGuid(),
            BoardVersionId = request.BoardVersionId,
            MaxPlayers = request.MaxPlayers,
            IsPrivate = request.IsPrivate,
            CreatedAt = DateTimeOffset.UtcNow,
            // Bot de partie exclut la partie de l'XP/Classements (CONTEXT.md - Bot).
            CountsForXpAndClassements = request.BotCount == 0,
            Options = new GameOptions
            {
                LoyerDoubleEnsembleComplet = request.LoyerDoubleEnsembleComplet,
                CagnotteVacances = request.CagnotteVacances,
                Encheres = request.Encheres,
                PasDeLoyerEnPrison = request.PasDeLoyerEnPrison,
                ConstructionEquilibree = request.ConstructionEquilibree,
                ArgentDepart = request.ArgentDepart,
                MelangerOrdreJoueurs = request.MelangerOrdreJoueurs,
                TurnLimit = request.TurnLimit,
            },
        };

        game.Participants.Add(new GameParticipant
        {
            Id = Guid.NewGuid(),
            GameId = game.Id,
            PlayerId = creator.Id,
            Kind = ParticipantKind.Account,
            DisplayName = creator.DisplayName,
            SeatOrder = 0,
            Money = request.ArgentDepart,
            Position = 0,
            TokenColor = TokenColors[0],
        });

        for (var i = 0; i < request.BotCount; i++)
        {
            game.Participants.Add(new GameParticipant
            {
                Id = Guid.NewGuid(),
                GameId = game.Id,
                PlayerId = null,
                Kind = ParticipantKind.BotDePartie,
                DisplayName = $"Bot {i + 1} ({request.BotDifficulty})",
                SeatOrder = i + 1,
                Money = request.ArgentDepart,
                Position = 0,
                BotDifficulty = request.BotDifficulty,
                TokenColor = TokenColors[(i + 1) % TokenColors.Length],
            });
        }

        context.Games.Add(game);
        await context.SaveChangesAsync(cancellationToken);

        return game.Id;
    }
}
