namespace Monopoly.Domain.Enums;

public enum GameStatus
{
    Lobby,
    InProgress,
    Finished,

    /// <summary>Salon fermé sans avoir démarré.</summary>
    Cancelled
}
