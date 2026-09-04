using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Domain.Entities;

namespace Monopoly.Infrastructure.Persistence;

public class MonopolyDbContext(DbContextOptions<MonopolyDbContext> options) : DbContext(options), IMonopolyDbContext
{
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Board> Boards => Set<Board>();
    public DbSet<BoardVersion> BoardVersions => Set<BoardVersion>();
    public DbSet<PropertyGroup> PropertyGroups => Set<PropertyGroup>();
    public DbSet<BoardSpace> BoardSpaces => Set<BoardSpace>();
    public DbSet<Game> Games => Set<Game>();
    public DbSet<GameParticipant> GameParticipants => Set<GameParticipant>();
    public DbSet<GameEvent> GameEvents => Set<GameEvent>();
    public DbSet<PropertyOwnership> PropertyOwnerships => Set<PropertyOwnership>();
    public DbSet<TradeOffer> TradeOffers => Set<TradeOffer>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Nous générons nous-mêmes tous les Guid. Sans ceci, EF considère une
        // clé Guid déjà remplie comme "existe en base" et transforme les
        // insertions d'entités rattachées à un agrégat déjà suivi en UPDATE
        // qui n'affectent aucune ligne.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            var key = entityType.FindPrimaryKey();
            if (key?.Properties.Count == 1 && key.Properties[0].ClrType == typeof(Guid))
                key.Properties[0].ValueGenerated = Microsoft.EntityFrameworkCore.Metadata.ValueGenerated.Never;
        }

        modelBuilder.Entity<Player>().HasIndex(p => p.KeycloakSubject).IsUnique();

        modelBuilder.Entity<Board>()
            .HasMany(b => b.Versions)
            .WithOne()
            .HasForeignKey(v => v.BoardId);

        modelBuilder.Entity<Board>()
            .HasMany(b => b.PropertyGroups)
            .WithOne()
            .HasForeignKey(g => g.BoardId);

        modelBuilder.Entity<BoardVersion>()
            .HasMany(v => v.Spaces)
            .WithOne()
            .HasForeignKey(s => s.BoardVersionId);

        modelBuilder.Entity<Game>()
            .HasMany(g => g.Participants)
            .WithOne()
            .HasForeignKey(p => p.GameId);

        modelBuilder.Entity<Game>()
            .HasMany(g => g.Events)
            .WithOne()
            .HasForeignKey(e => e.GameId);

        modelBuilder.Entity<Game>().OwnsOne(g => g.Options);

        modelBuilder.Entity<GameEvent>().HasIndex(e => new { e.GameId, e.Sequence });
        modelBuilder.Entity<PropertyOwnership>().HasIndex(o => new { o.GameId, o.BoardSpaceId }).IsUnique();
        modelBuilder.Entity<GameParticipant>().HasIndex(p => p.GuestSecret);
        modelBuilder.Entity<TradeOffer>().HasIndex(t => new { t.GameId, t.Status });
    }
}
