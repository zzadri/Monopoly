using Monopoly.Domain.Enums;

namespace Monopoly.Domain.Entities;

/// <summary>
/// Échange proposé par un joueur à un autre : propriétés et/ou argent des deux
/// côtés, accepté ou refusé par le destinataire (CONTEXT.md — Échange).
/// Sans échanges, les groupes de couleur restent éclatés entre joueurs et
/// personne ne peut construire : la partie ne finit jamais.
/// </summary>
public class TradeOffer
{
    public Guid Id { get; init; }
    public required Guid GameId { get; init; }
    public required Guid ProposerId { get; init; }
    public required Guid TargetId { get; init; }

    /// <summary>Ids de cases séparés par des virgules.</summary>
    public string OfferedSpaceIds { get; set; } = string.Empty;
    public string RequestedSpaceIds { get; set; } = string.Empty;

    public decimal OfferedMoney { get; set; }
    public decimal RequestedMoney { get; set; }

    public TradeStatus Status { get; set; } = TradeStatus.Pending;
    public DateTimeOffset CreatedAt { get; init; }

    public IEnumerable<Guid> Offered() => Parse(OfferedSpaceIds);
    public IEnumerable<Guid> Requested() => Parse(RequestedSpaceIds);

    private static IEnumerable<Guid> Parse(string csv) =>
        csv.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(Guid.Parse);
}
