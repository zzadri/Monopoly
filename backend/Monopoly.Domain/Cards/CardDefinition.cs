using Monopoly.Domain.Enums;

namespace Monopoly.Domain.Cards;

/// <summary>
/// Une carte Chance ou Caisse Commune. Les paquets par défaut viennent de
/// Monopoly.md §7 ; un plateau personnalisé pourra fournir les siens.
/// </summary>
public record CardDefinition(
    string Id,
    CardKind Kind,
    string Text,
    CardEffect Effect,
    decimal Amount = 0,
    int Position = 0,
    decimal SecondaryAmount = 0
);
