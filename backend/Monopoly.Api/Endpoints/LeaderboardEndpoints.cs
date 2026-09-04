using Mediator;
using Monopoly.Application.Leaderboards;

namespace Monopoly.Api.Endpoints;

public static class LeaderboardEndpoints
{
    public static void MapLeaderboardEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/leaderboards/{board}", async (string board, ISender sender, CancellationToken ct) =>
            Results.Ok(await sender.Send(new GetLeaderboardQuery(board), ct)))
           .WithTags("Leaderboards");
    }
}
