using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Monopoly.Api.Hubs;
using Monopoly.Application.Games.Engine;
using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;
using Monopoly.Infrastructure.Persistence;

namespace Monopoly.Api;

/// <summary>
/// Un salon ouvert mais jamais lancé finit par encombrer la liste et laisse
/// des joueurs attendre pour rien : au bout de cinq minutes il est annulé et
/// l'état diffusé renvoie les clients vers l'accueil.
/// </summary>
public class IdleLobbyCleanupService(
    IServiceScopeFactory scopeFactory,
    IHubContext<GameHub> hub,
    ILogger<IdleLobbyCleanupService> logger
) : BackgroundService
{
    private static readonly TimeSpan MaxLobbyAge = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await CloseIdleLobbiesAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Échec du nettoyage des salons inactifs");
            }
        }
    }

    private async Task CloseIdleLobbiesAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MonopolyDbContext>();
        var sessions = scope.ServiceProvider.GetRequiredService<GameSessionService>();

        var cutoff = DateTimeOffset.UtcNow - MaxLobbyAge;
        var staleIds = await context.Games
            .Where(g => g.Status == GameStatus.Lobby && g.CreatedAt < cutoff)
            .Select(g => g.Id)
            .ToListAsync(cancellationToken);

        foreach (var gameId in staleIds)
        {
            var state = await sessions.LoadAsync(gameId, cancellationToken);
            state.Game.Status = GameStatus.Cancelled;
            state.Game.EndedAt = DateTimeOffset.UtcNow;

            var entry = new GameEvent
            {
                Id = Guid.NewGuid(),
                GameId = gameId,
                Sequence = state.NextEventSequence++,
                Type = "LobbyClosed",
                Message = "Salon fermé : la partie n'a pas démarré dans les cinq minutes.",
                CreatedAt = DateTimeOffset.UtcNow,
            };
            state.Game.Events.Add(entry);
            state.RecentEvents.Add(entry);

            await context.SaveChangesAsync(cancellationToken);

            var dto = sessions.ToDto(state, null);
            await hub.Clients.Group(gameId.ToString()).SendAsync("gameStateChanged", dto, cancellationToken);
            logger.LogInformation("Salon {GameId} fermé pour inactivité", gameId);
        }
    }
}
