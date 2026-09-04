using Mediator;
using Microsoft.AspNetCore.SignalR;
using Monopoly.Application.Games.Actions;

namespace Monopoly.Api.Hubs;

/// <summary>
/// Canal temps réel d'une partie (ADR 0001/0003) : les clients s'abonnent au
/// groupe de leur partie et reçoivent l'état recalculé par le serveur après
/// chaque action. Aucune règle n'est décidée ici.
/// </summary>
public class GameHub(GamePresence presence, ISender sender) : Hub
{
    public Task JoinGame(string gameId) => Groups.AddToGroupAsync(Context.ConnectionId, gameId);

    public Task LeaveGame(string gameId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, gameId);

    /// <summary>
    /// Une déconnexion — onglet fermé, réseau coupé, rage quit — rend le siège à
    /// un Bot de repli pour que la partie ne se fige pas sur un joueur absent.
    /// Le siège est rendu à son occupant dès qu'il se reconnecte.
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var seat = presence.Release(Context.ConnectionId);

        // Le siège reste occupé par une autre connexion (second onglet, ou
        // reconnexion déjà établie) : le joueur n'est pas parti.
        if (seat is not null && !presence.StillHeld(seat.ParticipantId))
        {
            var state = await sender.Send(
                new MarkParticipantDisconnectedCommand(seat.GameId, seat.ParticipantId));

            if (state is not null)
            {
                await Clients.Group(seat.GameId.ToString())
                    .SendAsync("gameStateChanged", state with { YourParticipantId = null });
            }
        }

        await base.OnDisconnectedAsync(exception);
    }
}
