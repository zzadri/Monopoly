using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Application.Games.Contracts;
using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;
using Monopoly.Domain.Services;

namespace Monopoly.Application.Games.Engine;

/// <summary>
/// Charge une partie complète depuis la base, expose son état au client, et
/// identifie quel siège correspond à l'appelant (compte ou invité).
/// </summary>
public class GameSessionService(IMonopolyDbContext context)
{
    public async Task<GameAggregate> LoadAsync(Guid gameId, CancellationToken cancellationToken)
    {
        var game = await context.Games
            .Include(g => g.Participants)
            .SingleOrDefaultAsync(g => g.Id == gameId, cancellationToken)
            ?? throw new KeyNotFoundException("Partie introuvable.");

        // Journal : uniquement la fin, sinon une partie longue recharge des
        // milliers de lignes à chaque action.
        var recentEvents = await context.GameEvents
            .Where(e => e.GameId == gameId)
            .OrderByDescending(e => e.Sequence)
            .Take(60)
            .ToListAsync(cancellationToken);
        recentEvents.Reverse();

        var nextSequence = recentEvents.Count == 0 ? 0 : recentEvents[^1].Sequence + 1;

        var version = await context.BoardVersions
            .SingleOrDefaultAsync(v => v.Id == game.BoardVersionId, cancellationToken)
            ?? throw new KeyNotFoundException("Version de plateau introuvable.");

        var spaces = await context.BoardSpaces
            .Where(s => s.BoardVersionId == game.BoardVersionId)
            .OrderBy(s => s.Position)
            .ToListAsync(cancellationToken);

        var groups = await context.PropertyGroups
            .Where(g => g.BoardId == version.BoardId)
            .ToListAsync(cancellationToken);

        var ownerships = await context.PropertyOwnerships
            .Where(o => o.GameId == gameId)
            .ToListAsync(cancellationToken);

        var trades = await context.TradeOffers
            .Where(t => t.GameId == gameId && t.Status == TradeStatus.Pending)
            .ToListAsync(cancellationToken);

        return new GameAggregate
        {
            Game = game,
            Spaces = spaces,
            Groups = groups,
            Ownerships = ownerships,
            Trades = trades,
            RecentEvents = recentEvents,
            NextEventSequence = nextSequence,
        };
    }

    /// <summary>Le siège de l'appelant : compte connecté, ou invité identifié par son secret.</summary>
    public GameParticipant? ResolveActor(GameAggregate state, Guid? playerId, string? guestSecret)
    {
        if (playerId is { } id)
        {
            var byAccount = state.Game.Participants.FirstOrDefault(p => p.PlayerId == id);
            if (byAccount is not null) return byAccount;
        }

        if (!string.IsNullOrWhiteSpace(guestSecret))
            return state.Game.Participants.FirstOrDefault(p => p.GuestSecret == guestSecret);

        return null;
    }

    public GameStateDto ToDto(GameAggregate state, Guid? yourParticipantId)
    {
        var game = state.Game;

        var spaces = state.Spaces.Select(space =>
        {
            var ownership = state.OwnershipOf(space.Id);
            var owner = ownership is null ? null : game.Participants.FirstOrDefault(p => p.Id == ownership.OwnerParticipantId);

            decimal? rent = null;
            if (ownership is not null && owner is not null && !ownership.IsMortgaged)
            {
                rent = space.Type switch
                {
                    SpaceType.Terrain => RentCalculator.TerrainRent(
                        space, ownership.Houses, ownership.HasHotel,
                        state.OwnsWholeGroup(owner.Id, space.PropertyGroupId),
                        game.Options.LoyerDoubleEnsembleComplet),
                    SpaceType.Gare => RentCalculator.StationRent(space.BasePrice ?? 200m, state.CountOwnedOfType(owner.Id, SpaceType.Gare)),
                    SpaceType.Compagnie => RentCalculator.UtilityRent(Math.Max(game.LastDie1 + game.LastDie2, 7), state.CountOwnedOfType(owner.Id, SpaceType.Compagnie)),
                    _ => null
                };
            }

            var canBuild = false;
            var canSell = false;
            var canMortgage = false;
            var canUnmortgage = false;

            if (ownership is not null && owner is not null && game.Status == GameStatus.InProgress)
            {
                var buildings = ownership.HasHotel ? 5 : ownership.Houses;
                canSell = buildings > 0;
                canMortgage = !ownership.IsMortgaged && buildings == 0;
                canUnmortgage = ownership.IsMortgaged && owner.Money >= RentCalculator.UnmortgageCost(space);

                if (space.Type == SpaceType.Terrain && !ownership.IsMortgaged && !ownership.HasHotel &&
                    state.OwnsWholeGroup(owner.Id, space.PropertyGroupId) &&
                    owner.Money >= (space.HouseCost ?? 0m))
                {
                    canBuild = true;

                    // Construction équilibrée : on ne dépasse pas le niveau le plus bas du groupe.
                    if (game.Options.ConstructionEquilibree && space.PropertyGroupId is { } groupId)
                    {
                        var levels = state.SpacesOfGroup(groupId)
                            .Select(s => state.OwnershipOf(s.Id))
                            .Where(o => o is not null)
                            .Select(o => o!.HasHotel ? 5 : o.Houses)
                            .ToList();
                        if (levels.Count > 0 && buildings > levels.Min())
                            canBuild = false;
                    }
                }
            }

            return new GameSpaceDto(
                space.Id,
                space.Position,
                space.Type.ToString(),
                space.Name,
                space.PropertyGroupId is { } gid ? state.Groups.FirstOrDefault(g => g.Id == gid)?.ColorHex : null,
                space.BasePrice,
                space.HouseCost,
                ownership?.OwnerParticipantId,
                ownership?.Houses ?? 0,
                ownership?.HasHotel ?? false,
                ownership?.IsMortgaged ?? false,
                rent,
                canBuild,
                canSell,
                canMortgage,
                canUnmortgage);
        }).ToList();

        var players = game.Participants
            .OrderBy(p => p.SeatOrder)
            .Select(p => new GamePlayerDto(
                p.Id, p.DisplayName, p.Kind.ToString(), p.BotDifficulty?.ToString(),
                p.Money, p.Position, p.InPrison, p.IsBankrupt, p.IsConnected,
                p.GetOutOfJailCards, p.TokenColor, state.NetWorth(p), p.SeatOrder))
            .ToList();

        var events = state.RecentEvents
            .OrderByDescending(e => e.Sequence)
            .Take(60)
            .OrderBy(e => e.Sequence)
            .Select(e => new GameEventDto(e.Sequence, e.Type, e.Message, e.ParticipantId, e.CreatedAt))
            .ToList();

        var trades = state.Trades
            .Where(t => t.Status == TradeStatus.Pending)
            .Select(t =>
            {
                TradeSpaceDto Describe(Guid spaceId)
                {
                    var space = state.SpaceById(spaceId);
                    var color = space.PropertyGroupId is { } gid ? state.Groups.FirstOrDefault(g => g.Id == gid)?.ColorHex : null;
                    return new TradeSpaceDto(space.Id, space.Name, color);
                }

                var proposer = game.Participants.First(p => p.Id == t.ProposerId);
                var target = game.Participants.First(p => p.Id == t.TargetId);
                return new TradeOfferDto(
                    t.Id, proposer.Id, proposer.DisplayName, target.Id, target.DisplayName,
                    t.Offered().Select(Describe).ToList(),
                    t.Requested().Select(Describe).ToList(),
                    t.OfferedMoney, t.RequestedMoney);
            })
            .ToList();

        PendingPurchaseDto? pending = null;
        if (game.PendingPurchaseSpaceId is { } pendingId)
        {
            var space = state.SpaceById(pendingId);
            pending = new PendingPurchaseDto(space.Id, space.Name, space.BasePrice ?? 0m);
        }

        var boardRows = 11;
        var boardColumns = 11;
        var perimeter = state.Spaces.Count;
        if (perimeter > 0)
        {
            // rows == columns pour un plateau carré : perimètre = 4n - 4
            var side = (perimeter + 4) / 4;
            boardRows = side;
            boardColumns = side;
        }

        return new GameStateDto(
            game.Id,
            game.Status.ToString(),
            game.Phase.ToString(),
            game.TurnNumber,
            game.CurrentParticipantId,
            game.WinnerParticipantId,
            boardRows,
            boardColumns,
            game.LastDie1,
            game.LastDie2,
            game.FreeParkingPot,
            game.PendingDebtAmount,
            pending,
            new GameOptionsDto(
                game.Options.ArgentDepart,
                game.Options.LoyerDoubleEnsembleComplet,
                game.Options.CagnotteVacances,
                game.Options.Encheres,
                game.Options.PasDeLoyerEnPrison,
                game.Options.ConstructionEquilibree,
                game.Options.MelangerOrdreJoueurs,
                game.Options.TurnLimit),
            spaces,
            players,
            events,
            trades,
            yourParticipantId);
    }
}
