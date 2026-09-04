namespace Monopoly.Domain.Enums;

/// <summary>
/// Distinguishes a real account holder from a guest and from the two kinds of
/// Bot defined in CONTEXT.md: a Bot de partie (chosen at setup, excludes the
/// game from XP/Classements) and a Bot de repli (takes over a disconnected
/// player, does not exclude the game).
/// </summary>
public enum ParticipantKind
{
    Account,
    Guest,
    BotDePartie,
    BotDeRepli
}
