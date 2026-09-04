using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Domain.Entities;

namespace Monopoly.Infrastructure.Auth;

/// <summary>
/// Just-in-time provisioning: the first authenticated request from a given
/// Keycloak subject creates its Player row. Guests never call this - they
/// only ever join a room, never anything requiring a Player (Monopoly.md §1.2).
/// </summary>
public class CurrentUserService(IHttpContextAccessor httpContextAccessor, IMonopolyDbContext context) : ICurrentUserService
{
    public async Task<Guid> GetOrProvisionPlayerIdAsync(CancellationToken cancellationToken = default)
    {
        var user = httpContextAccessor.HttpContext?.User
            ?? throw new InvalidOperationException("No HTTP context available.");

        var subject = SubjectOf(user)
            ?? throw new InvalidOperationException("Authenticated request without a 'sub' claim.");

        var existing = await context.Players.SingleOrDefaultAsync(p => p.KeycloakSubject == subject, cancellationToken);
        if (existing is not null)
            return existing.Id;

        var displayName = user.FindFirst("preferred_username")?.Value
            ?? user.FindFirst(ClaimTypes.Name)?.Value
            ?? subject;

        var player = new Player
        {
            Id = Guid.NewGuid(),
            KeycloakSubject = subject,
            DisplayName = displayName,
            Xp = 0,
            Level = 0,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        context.Players.Add(player);
        await context.SaveChangesAsync(cancellationToken);

        return player.Id;
    }

    public async Task<Guid?> TryGetPlayerIdAsync(CancellationToken cancellationToken = default)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true) return null;
        if (SubjectOf(user) is null) return null;

        return await GetOrProvisionPlayerIdAsync(cancellationToken);
    }

    private static string? SubjectOf(ClaimsPrincipal user) =>
        user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst("sub")?.Value;
}
