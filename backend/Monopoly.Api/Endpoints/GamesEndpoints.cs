using Mediator;
using Microsoft.AspNetCore.SignalR;
using Monopoly.Api.Hubs;
using Monopoly.Application.Games.Actions;
using Monopoly.Application.Games.Contracts;
using Monopoly.Application.Games.CreateGame;
using Monopoly.Application.Games.GetGame;

namespace Monopoly.Api.Endpoints;

public static class GamesEndpoints
{
    public static void MapGamesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/games").WithTags("Games");

        // Créer une partie nécessite un compte (un invité ne peut que rejoindre).
        group.MapPost("/", async (CreateGameCommand command, ISender sender, CancellationToken ct) =>
        {
            var gameId = await sender.Send(command, ct);
            return Results.Created($"/games/{gameId}", new { id = gameId });
        }).RequireAuthorization();

        group.MapGet("/", async (ISender sender, CancellationToken ct) =>
            Results.Ok(await sender.Send(new ListOpenGamesQuery(), ct)));

        group.MapGet("/{id:guid}", async (Guid id, string? guestSecret, ISender sender, CancellationToken ct) =>
        {
            var game = await sender.Send(new GetGameQuery(id), ct);
            return game is null ? Results.NotFound() : Results.Ok(game);
        });

        group.MapGet("/{id:guid}/state", async (Guid id, string? guestSecret, ISender sender, CancellationToken ct) =>
            Results.Ok(await sender.Send(new GetGameStateQuery(id, guestSecret), ct)));

        group.MapPost("/{id:guid}/join", async (
            Guid id,
            JoinGameBody? body,
            ISender sender,
            IHubContext<GameHub> hub,
            CancellationToken ct) =>
        {
            var result = await sender.Send(new JoinGameCommand(id, body?.GuestName, body?.GuestSecret), ct);
            await BroadcastAsync(hub, id, result.State, ct);
            return Results.Ok(result);
        });

        group.MapPost("/{id:guid}/actions", async (
            Guid id,
            GameActionBody body,
            ISender sender,
            IHubContext<GameHub> hub,
            CancellationToken ct) =>
        {
            var state = await sender.Send(new PerformGameActionCommand(id, body.Action, body.SpaceId, body.GuestSecret), ct);
            await BroadcastAsync(hub, id, state, ct);
            return Results.Ok(state);
        });

        group.MapPost("/{id:guid}/trades", async (
            Guid id,
            ProposeTradeBody body,
            ISender sender,
            IHubContext<GameHub> hub,
            CancellationToken ct) =>
        {
            var state = await sender.Send(new ProposeTradeCommand(
                id, body.TargetId, body.OfferedSpaceIds ?? [], body.RequestedSpaceIds ?? [],
                body.OfferedMoney, body.RequestedMoney, body.GuestSecret), ct);
            await BroadcastAsync(hub, id, state, ct);
            return Results.Ok(state);
        });

        group.MapPost("/{id:guid}/trades/{tradeId:guid}/respond", async (
            Guid id,
            Guid tradeId,
            RespondTradeBody body,
            ISender sender,
            IHubContext<GameHub> hub,
            CancellationToken ct) =>
        {
            var state = await sender.Send(new RespondTradeCommand(id, tradeId, body.Accept, body.GuestSecret), ct);
            await BroadcastAsync(hub, id, state, ct);
            return Results.Ok(state);
        });
    }

    /// <summary>
    /// L'état diffusé ne contient jamais le siège de quelqu'un en particulier :
    /// chaque client recharge/complète le sien via YourParticipantId local.
    /// </summary>
    private static Task BroadcastAsync(IHubContext<GameHub> hub, Guid gameId, GameStateDto state, CancellationToken ct) =>
        hub.Clients.Group(gameId.ToString()).SendAsync("gameStateChanged", state with { YourParticipantId = null }, ct);

    public record JoinGameBody(string? GuestName, string? GuestSecret);
    public record ProposeTradeBody(Guid TargetId, List<Guid>? OfferedSpaceIds, List<Guid>? RequestedSpaceIds, decimal OfferedMoney, decimal RequestedMoney, string? GuestSecret);
    public record RespondTradeBody(bool Accept, string? GuestSecret);
    public record GameActionBody(GameActionType Action, Guid? SpaceId, string? GuestSecret);
}
