namespace Monopoly.Domain.Entities;

/// <summary>Ownership state of one BoardSpace within one Game.</summary>
public class PropertyOwnership
{
    public Guid Id { get; init; }
    public required Guid GameId { get; init; }
    public required Guid BoardSpaceId { get; init; }
    public required Guid OwnerParticipantId { get; set; }
    public int Houses { get; set; }
    public bool HasHotel { get; set; }
    public bool IsMortgaged { get; set; }
}
