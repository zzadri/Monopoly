using Mediator;
using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;

namespace Monopoly.Application.Boards.GetDefaultBoard;

public class GetDefaultBoardQueryHandler(IMonopolyDbContext context) : IRequestHandler<GetDefaultBoardQuery, DefaultBoardDto>
{
    public async ValueTask<DefaultBoardDto> Handle(GetDefaultBoardQuery request, CancellationToken cancellationToken)
    {
        var board = await context.Boards
            .Include(b => b.Versions).ThenInclude(v => v.Spaces)
            .Include(b => b.PropertyGroups)
            .Where(b => b.CreatorId == null)
            .OrderBy(b => b.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("Aucun plateau par défaut trouvé — le seed n'a pas tourné.");

        var latestVersion = board.Versions.OrderByDescending(v => v.VersionNumber).First();
        var groupColorsById = board.PropertyGroups.ToDictionary(g => g.Id, g => g.ColorHex);

        var spaces = latestVersion.Spaces
            .OrderBy(s => s.Position)
            .Select(s => new BoardSpaceDto(
                s.Position,
                s.Type.ToString(),
                s.Name,
                s.PropertyGroupId is { } groupId ? groupColorsById.GetValueOrDefault(groupId) : null,
                s.BasePrice
            ))
            .ToList();

        return new DefaultBoardDto(board.Id, latestVersion.Id, board.Name, board.Rows, board.Columns, spaces);
    }
}
