using Mediator;

namespace Monopoly.Application.Boards.GetDefaultBoard;

public record GetDefaultBoardQuery : IRequest<DefaultBoardDto>;

public record DefaultBoardDto(
    Guid BoardId,
    Guid BoardVersionId,
    string Name,
    int Rows,
    int Columns,
    IReadOnlyList<BoardSpaceDto> Spaces
);

public record BoardSpaceDto(
    int Position,
    string Type,
    string Name,
    string? GroupColorHex,
    decimal? Price
);
