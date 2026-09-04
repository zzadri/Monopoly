using Mediator;
using Monopoly.Application.Boards.GetDefaultBoard;

namespace Monopoly.Api.Endpoints;

public static class BoardsEndpoints
{
    public static void MapBoardsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/boards").WithTags("Boards");

        group.MapGet("/default", async (ISender sender, CancellationToken ct) =>
            Results.Ok(await sender.Send(new GetDefaultBoardQuery(), ct)));
    }
}
