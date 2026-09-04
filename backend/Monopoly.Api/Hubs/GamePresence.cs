using System.Collections.Concurrent;

namespace Monopoly.Api.Hubs;

/// <summary>
/// Associe une connexion SignalR au siège qu'elle occupe, pour que
/// <see cref="GameHub.OnDisconnectedAsync"/> sache qui vient de partir.
///
/// L'association est posée par un appel HTTP authentifié
/// (<c>POST /games/{id}/presence</c>) et non par le hub : le serveur y résout
/// lui-même le siège depuis le compte Keycloak ou le secret d'invité, comme
/// pour toute autre action (ADR 0003). Un client ne peut donc pas se déclarer
/// occupant du siège d'un autre.
///
/// Volontairement en mémoire : une connexion ne survit pas au redémarrage du
/// processus, la persister n'aurait décrit qu'un état déjà faux au retour.
/// </summary>
public class GamePresence
{
    private readonly ConcurrentDictionary<string, Seat> seats = new();

    public void Track(string connectionId, Guid gameId, Guid participantId) =>
        seats[connectionId] = new Seat(gameId, participantId);

    public Seat? Release(string connectionId) =>
        seats.TryRemove(connectionId, out var seat) ? seat : null;

    /// <summary>
    /// Vrai si le même siège reste tenu par une autre connexion — un second
    /// onglet, ou une reconnexion dont la nouvelle connexion est arrivée avant
    /// que l'ancienne ne soit signalée fermée. Dans ce cas le joueur n'est pas
    /// parti et son siège ne doit pas passer en Bot de repli.
    /// </summary>
    public bool StillHeld(Guid participantId) =>
        seats.Values.Any(s => s.ParticipantId == participantId);

    public record Seat(Guid GameId, Guid ParticipantId);
}
