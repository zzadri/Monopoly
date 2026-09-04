using Monopoly.Domain.Enums;

namespace Monopoly.Domain.Entities;

/// <summary>
/// One seat in a Game. PlayerId is null for a Guest or a BotDePartie.
/// A BotDeRepli seat keeps its original PlayerId - it is the same seat,
/// just temporarily bot-controlled (CONTEXT.md - Bot).
/// </summary>
public class GameParticipant
{
    public Guid Id { get; init; }
    public required Guid GameId { get; init; }
    public Guid? PlayerId { get; set; }
    public required ParticipantKind Kind { get; set; }
    public required string DisplayName { get; set; }
    public int SeatOrder { get; set; }

    public decimal Money { get; set; }
    public int Position { get; set; }
    public bool InPrison { get; set; }
    public int JailTurnsElapsed { get; set; }
    public bool IsBankrupt { get; set; }
    public bool IsConnected { get; set; } = true;

    /// <summary>Cartes "Sortez de prison" conservées.</summary>
    public int GetOutOfJailCards { get; set; }

    /// <summary>
    /// Faillites infligées à d'autres joueurs pendant CETTE partie. Reporté sur
    /// le Player en fin de partie par ProgressionService (classement secondaire,
    /// CONTEXT.md — Classement).
    /// </summary>
    public int BankruptciesInflicted { get; set; }

    /// <summary>Only set when Kind == BotDePartie (Monopoly.md §6).</summary>
    public BotDifficulty? BotDifficulty { get; set; }

    /// <summary>Jeton de couleur affiché sur le plateau.</summary>
    public string TokenColor { get; set; } = "#888888";

    /// <summary>Identifiant opaque remis à un invité pour ré-agir sur sa place (pas de compte Keycloak).</summary>
    public string? GuestSecret { get; set; }
}
