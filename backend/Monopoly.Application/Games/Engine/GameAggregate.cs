using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;

namespace Monopoly.Application.Games.Engine;

/// <summary>
/// Tout l'état nécessaire pour arbitrer un tour : la partie, ses sièges, le
/// plateau figé de la version utilisée, et qui possède quoi.
/// </summary>
public sealed class GameAggregate
{
    public required Game Game { get; init; }
    public required List<BoardSpace> Spaces { get; init; }
    public required List<PropertyGroup> Groups { get; init; }
    public required List<PropertyOwnership> Ownerships { get; init; }
    public required List<TradeOffer> Trades { get; init; }

    /// <summary>
    /// Derniers événements seulement : le journal complet d'une partie longue
    /// se compte en milliers de lignes, on ne le recharge pas à chaque action.
    /// </summary>
    public required List<GameEvent> RecentEvents { get; init; }

    /// <summary>Numéro du prochain événement, calculé au chargement.</summary>
    public required int NextEventSequence { get; set; }

    public int BoardSize => Spaces.Count;

    public IEnumerable<GameParticipant> ActivePlayers =>
        Game.Participants.Where(p => !p.IsBankrupt).OrderBy(p => p.SeatOrder);

    public GameParticipant? Current =>
        Game.Participants.FirstOrDefault(p => p.Id == Game.CurrentParticipantId);

    public BoardSpace SpaceAt(int position) =>
        Spaces.First(s => s.Position == position);

    public BoardSpace SpaceById(Guid id) =>
        Spaces.First(s => s.Id == id);

    public PropertyOwnership? OwnershipOf(Guid spaceId) =>
        Ownerships.FirstOrDefault(o => o.BoardSpaceId == spaceId);

    public GameParticipant? OwnerOf(Guid spaceId)
    {
        var ownership = OwnershipOf(spaceId);
        return ownership is null ? null : Game.Participants.FirstOrDefault(p => p.Id == ownership.OwnerParticipantId);
    }

    public IEnumerable<BoardSpace> SpacesOfType(SpaceType type) =>
        Spaces.Where(s => s.Type == type);

    public IEnumerable<BoardSpace> SpacesOfGroup(Guid groupId) =>
        Spaces.Where(s => s.PropertyGroupId == groupId);

    public int CountOwnedOfType(Guid participantId, SpaceType type) =>
        Spaces.Count(s => s.Type == type && OwnershipOf(s.Id)?.OwnerParticipantId == participantId);

    public bool OwnsWholeGroup(Guid participantId, Guid? groupId)
    {
        if (groupId is null) return false;
        var groupSpaces = SpacesOfGroup(groupId.Value).ToList();
        return groupSpaces.Count > 0 &&
               groupSpaces.All(s => OwnershipOf(s.Id)?.OwnerParticipantId == participantId);
    }

    public IEnumerable<PropertyOwnership> OwnershipsOf(Guid participantId) =>
        Ownerships.Where(o => o.OwnerParticipantId == participantId);

    /// <summary>Patrimoine total : liquide + prix des biens + coût des bâtiments (Monopoly.md §IV).</summary>
    public decimal NetWorth(GameParticipant participant)
    {
        var total = participant.Money;
        foreach (var ownership in OwnershipsOf(participant.Id))
        {
            var space = SpaceById(ownership.BoardSpaceId);
            total += ownership.IsMortgaged ? (space.BasePrice ?? 0m) / 2m : space.BasePrice ?? 0m;
            total += ownership.Houses * (space.HouseCost ?? 0m);
            if (ownership.HasHotel) total += 5 * (space.HouseCost ?? 0m);
        }
        return total;
    }
}
