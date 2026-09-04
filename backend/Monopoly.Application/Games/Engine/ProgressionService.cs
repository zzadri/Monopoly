using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.Engine;

/// <summary>
/// Crédite l'XP en fin de partie : XP pour avoir terminé, bonus au vainqueur.
/// Une partie contenant un Bot de partie ne compte pas (CONTEXT.md — Bot).
/// </summary>
public class ProgressionService(IMonopolyDbContext context)
{
    private const int XpForFinishing = 50;
    private const int XpForWinning = 150;
    private const int XpPerLevel = 500;

    public async Task AwardIfFinishedAsync(GameAggregate state, CancellationToken cancellationToken)
    {
        var game = state.Game;
        if (game.Status != GameStatus.Finished || game.XpAwarded) return;

        game.XpAwarded = true;
        if (!game.CountsForXpAndClassements) return;

        var playerIds = game.Participants
            .Where(p => p.Kind == ParticipantKind.Account && p.PlayerId is not null)
            .Select(p => p.PlayerId!.Value)
            .ToList();

        if (playerIds.Count == 0) return;

        var players = await context.Players
            .Where(p => playerIds.Contains(p.Id))
            .ToListAsync(cancellationToken);

        foreach (var participant in game.Participants.Where(p => p.PlayerId is not null))
        {
            var player = players.FirstOrDefault(p => p.Id == participant.PlayerId);
            if (player is null) continue;

            player.Xp += XpForFinishing;
            player.GamesPlayed++;

            if (participant.Id == game.WinnerParticipantId)
            {
                player.Xp += XpForWinning;
                player.GamesWon++;
            }

            var netWorth = state.NetWorth(participant);
            if (netWorth > player.BestNetWorth)
                player.BestNetWorth = netWorth;

            player.Level = 1 + player.Xp / XpPerLevel;
        }
    }
}
