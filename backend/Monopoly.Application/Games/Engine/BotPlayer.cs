using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;
using Monopoly.Domain.Services;

namespace Monopoly.Application.Games.Engine;

/// <summary>
/// Joue automatiquement les tours des bots. Plus la difficulté est haute,
/// plus le bot garde peu de trésorerie de sécurité et construit tôt
/// (Monopoly.md §6).
/// </summary>
public static class BotPlayer
{
    private const int MaxActionsPerTurn = 40;

    /// <summary>Fait jouer tous les bots jusqu'à ce que ce soit à un humain de jouer.</summary>
    public static void PlayPendingBotTurns(GameEngine engine)
    {
        AnswerPendingTrades(engine);

        var guard = 0;
        while (engine.State.Game.Status == GameStatus.InProgress && guard++ < 200)
        {
            var current = engine.State.Current;
            if (current is null || current.Kind is not (ParticipantKind.BotDePartie or ParticipantKind.BotDeRepli))
                return;

            PlayOneAction(engine, current);
            AnswerPendingTrades(engine);
        }
    }

    /// <summary>Un bot ne fait pas attendre : il répond aux offres qui lui sont faites tout de suite.</summary>
    public static void AnswerPendingTrades(GameEngine engine)
    {
        var state = engine.State;
        var pending = state.Trades
            .Where(t => t.Status == TradeStatus.Pending)
            .ToList();

        foreach (var offer in pending)
        {
            var target = state.Game.Participants.FirstOrDefault(p => p.Id == offer.TargetId);
            if (target is null || target.Kind is not (ParticipantKind.BotDePartie or ParticipantKind.BotDeRepli)) continue;

            var accept = EvaluateOffer(engine, target, offer);
            try
            {
                engine.RespondToTrade(target.Id, offer.Id, accept);
            }
            catch (InvalidOperationException)
            {
                offer.Status = TradeStatus.Declined;
            }
        }
    }

    private static bool EvaluateOffer(GameEngine engine, GameParticipant bot, TradeOffer offer)
    {
        var state = engine.State;
        var difficulty = bot.BotDifficulty ?? BotDifficulty.Moyen;

        decimal ValueOf(IEnumerable<Guid> spaceIds) =>
            spaceIds.Sum(id => state.SpaceById(id).BasePrice ?? 0m);

        var received = offer.OfferedMoney + ValueOf(offer.Offered());
        var given = offer.RequestedMoney + ValueOf(offer.Requested());

        if (offer.RequestedMoney > bot.Money) return false;

        // Exigence de marge selon la difficulté : un bot facile brade, un bot extrême négocie.
        var demandedRatio = difficulty switch
        {
            BotDifficulty.TresFacile => 0.7m,
            BotDifficulty.Facile => 0.95m,
            BotDifficulty.Moyen => 1.15m,
            BotDifficulty.Difficile => 1.35m,
            BotDifficulty.Extreme => 1.5m,
            _ => 1.15m
        };

        // Céder une case qui complète un groupe adverse coûte cher.
        var completesForProposer = offer.Requested().Any(id =>
        {
            var space = state.SpaceById(id);
            if (space.PropertyGroupId is not { } groupId) return false;
            return state.SpacesOfGroup(groupId)
                .Where(s => s.Id != id)
                .All(s => state.OwnershipOf(s.Id)?.OwnerParticipantId == offer.ProposerId);
        });

        if (completesForProposer && difficulty >= BotDifficulty.Moyen)
            demandedRatio += 0.6m;

        // À l'inverse, recevoir une case qui complète notre groupe vaut le prix fort.
        var completesForBot = offer.Offered().Any(id =>
        {
            var space = state.SpaceById(id);
            if (space.PropertyGroupId is not { } groupId) return false;
            return state.SpacesOfGroup(groupId)
                .Where(s => s.Id != id)
                .All(s => state.OwnershipOf(s.Id)?.OwnerParticipantId == bot.Id);
        });

        if (completesForBot) demandedRatio -= 0.5m;

        return given == 0 || received >= given * demandedRatio;
    }

    /// <summary>
    /// Cherche à compléter un groupe : le bot propose du cash au propriétaire
    /// de la case manquante. C'est ce qui débloque les parties (sans échange,
    /// les groupes restent éclatés et personne ne construit jamais).
    /// </summary>
    private static void TryProposeTrade(GameEngine engine, GameParticipant bot, BotDifficulty difficulty)
    {
        if (difficulty == BotDifficulty.TresFacile) return;

        var state = engine.State;

        // Ne pas harceler : une seule offre en attente par bot.
        if (state.Trades.Any(t => t.Status == TradeStatus.Pending && t.ProposerId == bot.Id)) return;

        foreach (var group in state.Groups)
        {
            var groupSpaces = state.SpacesOfGroup(group.Id).ToList();
            if (groupSpaces.Count < 2) continue;

            var missing = groupSpaces
                .Where(s => state.OwnershipOf(s.Id) is { } o && o.OwnerParticipantId != bot.Id)
                .ToList();

            var mine = groupSpaces.Count(s => state.OwnershipOf(s.Id)?.OwnerParticipantId == bot.Id);
            if (missing.Count != 1 || mine != groupSpaces.Count - 1) continue;

            var wanted = missing[0];
            var ownership = state.OwnershipOf(wanted.Id)!;
            if (ownership.Houses > 0 || ownership.HasHotel) continue;

            var owner = state.Game.Participants.FirstOrDefault(p => p.Id == ownership.OwnerParticipantId);
            if (owner is null || owner.IsBankrupt) continue;

            var price = wanted.BasePrice ?? 0m;
            var multiplier = difficulty switch
            {
                BotDifficulty.Facile => 1.4m,
                BotDifficulty.Moyen => 1.7m,
                BotDifficulty.Difficile => 2.0m,
                BotDifficulty.Extreme => 2.4m,
                _ => 1.7m
            };

            var cash = Math.Round(price * multiplier, 0);
            if (cash <= 0 || bot.Money - cash < CashBuffer(difficulty)) continue;

            try
            {
                engine.ProposeTrade(bot.Id, owner.Id, [], [wanted.Id], cash, 0m);
            }
            catch (InvalidOperationException)
            {
                // Offre impossible (constructions, etc.) : on passe au groupe suivant.
                continue;
            }

            return;
        }
    }

    private static void PlayOneAction(GameEngine engine, GameParticipant bot)
    {
        var game = engine.State.Game;
        var difficulty = bot.BotDifficulty ?? BotDifficulty.Moyen;

        switch (game.Phase)
        {
            case TurnPhase.AwaitingJailDecision:
                if (bot.GetOutOfJailCards > 0) engine.UseJailCard(bot.Id);
                else if (bot.Money > CashBuffer(difficulty) + 50m) engine.PayJailFine(bot.Id);
                else engine.Roll(bot.Id);
                break;

            case TurnPhase.AwaitingRoll:
                engine.Roll(bot.Id);
                break;

            case TurnPhase.AwaitingPurchaseDecision:
                if (ShouldBuy(engine, bot, difficulty)) engine.BuyPendingProperty(bot.Id);
                else engine.DeclinePendingProperty(bot.Id);
                break;

            case TurnPhase.AwaitingDebtSettlement:
                RaiseCashOrGiveUp(engine, bot);
                break;

            case TurnPhase.AwaitingEndTurn:
                TryProposeTrade(engine, bot, difficulty);
                TryBuild(engine, bot, difficulty);
                engine.EndTurn(bot.Id);
                break;

            default:
                engine.EndTurn(bot.Id);
                break;
        }
    }

    private static decimal CashBuffer(BotDifficulty difficulty) => difficulty switch
    {
        BotDifficulty.TresFacile => 400m,
        BotDifficulty.Facile => 250m,
        BotDifficulty.Moyen => 150m,
        BotDifficulty.Difficile => 80m,
        BotDifficulty.Extreme => 20m,
        _ => 150m
    };

    private static bool ShouldBuy(GameEngine engine, GameParticipant bot, BotDifficulty difficulty)
    {
        var state = engine.State;
        if (state.Game.PendingPurchaseSpaceId is not { } spaceId) return false;

        var space = state.SpaceById(spaceId);
        var price = space.BasePrice ?? 0m;
        if (bot.Money < price) return false;

        var remaining = bot.Money - price;
        var buffer = CashBuffer(difficulty);

        // Compléter un groupe de couleur, ou rafler les gares, vaut de se serrer la ceinture.
        var completesGroup = space.PropertyGroupId is { } groupId &&
            state.SpacesOfGroup(groupId)
                 .Where(s => s.Id != space.Id)
                 .All(s => state.OwnershipOf(s.Id)?.OwnerParticipantId == bot.Id);

        var isStation = space.Type == SpaceType.Gare;

        if (completesGroup && difficulty >= BotDifficulty.Moyen) return remaining >= 0;
        if (isStation && difficulty >= BotDifficulty.Difficile) return remaining >= 0;

        return remaining >= buffer;
    }

    private static void TryBuild(GameEngine engine, GameParticipant bot, BotDifficulty difficulty)
    {
        if (difficulty == BotDifficulty.TresFacile) return;

        var buildBuffer = difficulty switch
        {
            BotDifficulty.Facile => 600m,
            BotDifficulty.Moyen => 400m,
            BotDifficulty.Difficile => 250m,
            BotDifficulty.Extreme => 120m,
            _ => 400m
        };

        var state = engine.State;
        var actions = 0;

        while (actions++ < MaxActionsPerTurn)
        {
            var candidate = state.OwnershipsOf(bot.Id)
                .Where(o => !o.IsMortgaged && !o.HasHotel)
                .Select(o => new { Ownership = o, Space = state.SpaceById(o.BoardSpaceId) })
                .Where(x => x.Space.Type == SpaceType.Terrain)
                .Where(x => state.OwnsWholeGroup(bot.Id, x.Space.PropertyGroupId))
                .Where(x => bot.Money - (x.Space.HouseCost ?? 0m) >= buildBuffer)
                .OrderBy(x => x.Ownership.Houses)
                .ThenByDescending(x => x.Space.BasePrice)
                .FirstOrDefault();

            if (candidate is null) return;

            try
            {
                engine.BuildHouse(bot.Id, candidate.Space.Id);
            }
            catch (InvalidOperationException)
            {
                return;
            }
        }
    }

    private static void RaiseCashOrGiveUp(GameEngine engine, GameParticipant bot)
    {
        var state = engine.State;
        var needed = state.Game.PendingDebtAmount;
        var actions = 0;

        while (bot.Money < needed && actions++ < MaxActionsPerTurn)
        {
            var withBuildings = state.OwnershipsOf(bot.Id)
                .Where(o => o.HasHotel || o.Houses > 0)
                .OrderByDescending(o => o.HasHotel)
                .FirstOrDefault();

            if (withBuildings is not null)
            {
                engine.SellBuilding(bot.Id, withBuildings.BoardSpaceId);
                continue;
            }

            var mortgageable = state.OwnershipsOf(bot.Id)
                .Where(o => !o.IsMortgaged)
                .OrderBy(o => RentCalculator.MortgageValue(state.SpaceById(o.BoardSpaceId)))
                .FirstOrDefault();

            if (mortgageable is not null)
            {
                engine.Mortgage(bot.Id, mortgageable.BoardSpaceId);
                continue;
            }

            break;
        }

        if (state.Game.Phase == TurnPhase.AwaitingDebtSettlement)
            engine.DeclareBankruptcy(bot.Id);
    }
}
