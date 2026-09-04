namespace Monopoly.Domain.Entities;

/// <summary>
/// Journal ordonné de tout ce qui s'est passé dans une partie : sert de log
/// en direct, d'historique, et de base au Rejeu coup par coup (CONTEXT.md).
/// </summary>
public class GameEvent
{
    public Guid Id { get; init; }
    public required Guid GameId { get; init; }
    public required int Sequence { get; init; }
    public required string Type { get; init; }
    public required string Message { get; init; }
    public Guid? ParticipantId { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
}
