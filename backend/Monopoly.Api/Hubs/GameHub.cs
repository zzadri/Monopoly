using Microsoft.AspNetCore.SignalR;

namespace Monopoly.Api.Hubs;

/// <summary>
/// Canal temps réel d'une partie (ADR 0001/0003) : les clients s'abonnent au
/// groupe de leur partie et reçoivent l'état recalculé par le serveur après
/// chaque action. Aucune règle n'est décidée ici.
/// </summary>
public class GameHub : Hub
{
    public Task JoinGame(string gameId) => Groups.AddToGroupAsync(Context.ConnectionId, gameId);

    public Task LeaveGame(string gameId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, gameId);
}
