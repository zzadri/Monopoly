using Mediator;
using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;

namespace Monopoly.Application.Leaderboards;

/// <summary>
/// Classement principal (Niveau) et classements secondaires (CONTEXT.md).
/// Les parties contenant un Bot de partie n'ont pas alimenté ces chiffres.
/// </summary>
public record GetLeaderboardQuery(string Board) : IRequest<LeaderboardDto>;

public record LeaderboardDto(string Board, string Label, IReadOnlyList<LeaderboardRowDto> Rows);

public record LeaderboardRowDto(int Rank, string DisplayName, int Level, int Xp, int GamesPlayed, int GamesWon, decimal BestNetWorth, decimal Value);

public class GetLeaderboardQueryHandler(IMonopolyDbContext context) : IRequestHandler<GetLeaderboardQuery, LeaderboardDto>
{
    public async ValueTask<LeaderboardDto> Handle(GetLeaderboardQuery request, CancellationToken cancellationToken)
    {
        var query = context.Players.AsQueryable();

        var (label, ordered) = request.Board switch
        {
            "victoires" => ("Victoires", query.OrderByDescending(p => p.GamesWon).ThenByDescending(p => p.Xp)),
            "parties" => ("Parties jouées", query.OrderByDescending(p => p.GamesPlayed).ThenByDescending(p => p.Xp)),
            "patrimoine" => ("Plus gros patrimoine", query.OrderByDescending(p => p.BestNetWorth).ThenByDescending(p => p.Xp)),
            "faillites" => ("Faillites infligées", query.OrderByDescending(p => p.BankruptciesInflicted).ThenByDescending(p => p.Xp)),
            _ => ("Niveau", query.OrderByDescending(p => p.Xp).ThenByDescending(p => p.GamesWon)),
        };

        var players = await ordered.Take(50).ToListAsync(cancellationToken);

        var rows = players.Select((p, index) => new LeaderboardRowDto(
            index + 1,
            p.DisplayName,
            p.Level,
            p.Xp,
            p.GamesPlayed,
            p.GamesWon,
            p.BestNetWorth,
            request.Board switch
            {
                "victoires" => p.GamesWon,
                "parties" => p.GamesPlayed,
                "patrimoine" => p.BestNetWorth,
                "faillites" => p.BankruptciesInflicted,
                _ => p.Xp
            })).ToList();

        return new LeaderboardDto(request.Board, label, rows);
    }
}
