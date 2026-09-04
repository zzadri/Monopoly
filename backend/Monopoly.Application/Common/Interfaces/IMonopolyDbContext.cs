using Microsoft.EntityFrameworkCore;
using Monopoly.Domain.Entities;

namespace Monopoly.Application.Common.Interfaces;

/// <summary>
/// Persistence port the Application layer depends on. Monopoly.Infrastructure
/// provides the real EF Core implementation - keeps Application unaware of
/// EF/Postgres.
/// </summary>
public interface IMonopolyDbContext
{
    DbSet<Player> Players { get; }
    DbSet<Board> Boards { get; }
    DbSet<BoardVersion> BoardVersions { get; }
    DbSet<BoardSpace> BoardSpaces { get; }
    DbSet<PropertyGroup> PropertyGroups { get; }
    DbSet<Game> Games { get; }
    DbSet<GameParticipant> GameParticipants { get; }
    DbSet<GameEvent> GameEvents { get; }
    DbSet<PropertyOwnership> PropertyOwnerships { get; }
    DbSet<TradeOffer> TradeOffers { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
