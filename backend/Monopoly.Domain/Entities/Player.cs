namespace Monopoly.Domain.Entities;

/// <summary>
/// A registered account. Guests never get a Player row (CONTEXT.md: no stats
/// saved, cannot create a Board).
/// </summary>
public class Player
{
    public Guid Id { get; init; }
    public required string KeycloakSubject { get; init; }
    public required string DisplayName { get; set; }
    public int Xp { get; set; }
    public int Level { get; set; }
    public int GamesPlayed { get; set; }
    public int GamesWon { get; set; }
    /// <summary>Plus gros patrimoine atteint en une partie (classement secondaire).</summary>
    public decimal BestNetWorth { get; set; }
    public int BankruptciesInflicted { get; set; }
    public DateTimeOffset CreatedAt { get; init; }
}
