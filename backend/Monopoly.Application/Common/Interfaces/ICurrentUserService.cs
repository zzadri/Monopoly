namespace Monopoly.Application.Common.Interfaces;

/// <summary>
/// Resolves the calling Player from the current request's authenticated
/// identity, provisioning a Player row on first sight of a Keycloak subject.
/// </summary>
public interface ICurrentUserService
{
    Task<Guid> GetOrProvisionPlayerIdAsync(CancellationToken cancellationToken = default);

    /// <summary>Null quand l'appelant est un invité (pas de compte Keycloak).</summary>
    Task<Guid?> TryGetPlayerIdAsync(CancellationToken cancellationToken = default);
}
