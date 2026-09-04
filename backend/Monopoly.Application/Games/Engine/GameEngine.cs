using Monopoly.Domain.Cards;
using Monopoly.Domain.Entities;
using Monopoly.Domain.Enums;
using Monopoly.Domain.Services;

namespace Monopoly.Application.Games.Engine;

/// <summary>
/// Arbitre de la partie. Toutes les règles vivent ici, côté serveur : le
/// client n'envoie que des intentions (ADR 0003). Chaque méthode publique
/// valide que l'acteur a le droit d'agir dans la phase courante.
/// </summary>
public sealed class GameEngine(GameAggregate state, Random random)
{
    private const decimal JailFine = 50m;
    private const decimal SalaryOnPassingGo = 200m;
    private const int MaxHousesPerSpace = 4;

    public GameAggregate State => state;
    public List<PropertyOwnership> NewOwnerships { get; } = [];
    public List<TradeOffer> NewTrades { get; } = [];

    // ---------------------------------------------------------------- Démarrage

    public void Start()
    {
        var game = state.Game;
        if (game.Status != GameStatus.Lobby)
            throw new InvalidOperationException("La partie a déjà démarré.");
        if (game.Participants.Count < 2)
            throw new InvalidOperationException("Il faut au moins deux joueurs pour démarrer.");

        if (game.Options.MelangerOrdreJoueurs)
        {
            var shuffled = game.Participants.OrderBy(_ => random.Next()).ToList();
            for (var i = 0; i < shuffled.Count; i++)
                shuffled[i].SeatOrder = i;
        }

        game.ChanceDeckOrder = Shuffle(DefaultCardDecks.Chance.Select(c => c.Id));
        game.CaisseCommuneDeckOrder = Shuffle(DefaultCardDecks.CaisseCommune.Select(c => c.Id));

        game.Status = GameStatus.InProgress;
        game.StartedAt = DateTimeOffset.UtcNow;
        game.TurnNumber = 1;
        game.Phase = TurnPhase.AwaitingRoll;
        game.CurrentParticipantId = state.ActivePlayers.First().Id;

        Log("GameStarted", "La partie commence.");
        Log("TurnStarted", $"Au tour de {state.Current!.DisplayName}.", state.Current.Id);
    }

    // ---------------------------------------------------------------- Dés / déplacement

    public void Roll(Guid actorId)
    {
        var actor = RequireTurn(actorId);
        if (state.Game.Phase is not (TurnPhase.AwaitingRoll or TurnPhase.AwaitingJailDecision))
            throw new InvalidOperationException("Ce n'est pas le moment de lancer les dés.");

        var die1 = random.Next(1, 7);
        var die2 = random.Next(1, 7);
        state.Game.LastDie1 = die1;
        state.Game.LastDie2 = die2;
        var total = die1 + die2;
        var isDouble = die1 == die2;

        Log("DiceRolled", $"{actor.DisplayName} lance les dés : {die1} + {die2} = {total}.", actor.Id);

        if (actor.InPrison)
        {
            if (isDouble)
            {
                actor.InPrison = false;
                actor.JailTurnsElapsed = 0;
                Log("JailReleased", $"{actor.DisplayName} fait un doublet et sort de prison.", actor.Id);
                MoveBy(actor, total);
                return;
            }

            actor.JailTurnsElapsed++;
            if (actor.JailTurnsElapsed >= 3)
            {
                Log("JailFineForced", $"{actor.DisplayName} n'a pas fait de doublet au bout de trois tours et paie {JailFine} €.", actor.Id);
                Pay(actor, JailFine, null);
                if (state.Game.Phase == TurnPhase.AwaitingDebtSettlement) return;
                actor.InPrison = false;
                actor.JailTurnsElapsed = 0;
                MoveBy(actor, total);
                return;
            }

            Log("JailStay", $"{actor.DisplayName} reste en prison.", actor.Id);
            state.Game.Phase = TurnPhase.AwaitingEndTurn;
            return;
        }

        if (isDouble)
        {
            state.Game.DoublesInARow++;
            if (state.Game.DoublesInARow >= 3)
            {
                Log("ThreeDoubles", $"{actor.DisplayName} fait trois doublets d'affilée : direction la prison.", actor.Id);
                SendToJail(actor);
                state.Game.Phase = TurnPhase.AwaitingEndTurn;
                return;
            }
        }
        else
        {
            state.Game.DoublesInARow = 0;
        }

        MoveBy(actor, total);
    }

    private void MoveBy(GameParticipant actor, int steps)
    {
        var newPosition = actor.Position + steps;
        if (newPosition >= state.BoardSize)
        {
            newPosition -= state.BoardSize;
            Receive(actor, SalaryOnPassingGo, "salaire en passant par la case Départ");
        }
        actor.Position = newPosition;
        ResolveLanding(actor);
    }

    private void MoveTo(GameParticipant actor, int position, bool collectSalaryIfPassing)
    {
        if (collectSalaryIfPassing && position < actor.Position)
            Receive(actor, SalaryOnPassingGo, "salaire en passant par la case Départ");
        actor.Position = position;
        ResolveLanding(actor);
    }

    // ---------------------------------------------------------------- Résolution de case

    private void ResolveLanding(GameParticipant actor)
    {
        var space = state.SpaceAt(actor.Position);
        Log("Landed", $"{actor.DisplayName} arrive sur {space.Name}.", actor.Id);

        switch (space.Type)
        {
            case SpaceType.Terrain:
            case SpaceType.Gare:
            case SpaceType.Compagnie:
                ResolveProperty(actor, space);
                break;

            case SpaceType.Taxe:
                var tax = space.Name.Contains("revenu", StringComparison.OrdinalIgnoreCase) ? 200m : 100m;
                Log("Tax", $"{actor.DisplayName} paie {tax} € de taxe.", actor.Id);
                PayToBankOrPot(actor, tax);
                break;

            case SpaceType.AllezEnPrison:
                SendToJail(actor);
                break;

            case SpaceType.Chance:
                DrawCard(actor, CardKind.Chance);
                break;

            case SpaceType.CaisseCommune:
                DrawCard(actor, CardKind.CaisseCommune);
                break;

            case SpaceType.Vacances:
                if (state.Game.Options.CagnotteVacances && state.Game.FreeParkingPot > 0)
                {
                    var pot = state.Game.FreeParkingPot;
                    state.Game.FreeParkingPot = 0;
                    Receive(actor, pot, "cagnotte Vacances");
                }
                break;

            case SpaceType.Depart:
            case SpaceType.Prison:
            default:
                break;
        }

        if (state.Game.Phase is TurnPhase.AwaitingRoll or TurnPhase.AwaitingJailDecision)
            state.Game.Phase = TurnPhase.AwaitingEndTurn;
    }

    private void ResolveProperty(GameParticipant actor, BoardSpace space)
    {
        var ownership = state.OwnershipOf(space.Id);

        if (ownership is null)
        {
            state.Game.PendingPurchaseSpaceId = space.Id;
            state.Game.Phase = TurnPhase.AwaitingPurchaseDecision;
            return;
        }

        if (ownership.OwnerParticipantId == actor.Id) return;

        var owner = state.Game.Participants.First(p => p.Id == ownership.OwnerParticipantId);

        if (ownership.IsMortgaged)
        {
            Log("RentSkipped", $"{space.Name} est hypothéqué : pas de loyer.", actor.Id);
            return;
        }

        if (state.Game.Options.PasDeLoyerEnPrison && owner.InPrison)
        {
            Log("RentSkipped", $"{owner.DisplayName} est en prison : pas de loyer sur {space.Name}.", actor.Id);
            return;
        }

        var rent = ComputeRent(space, ownership, owner);
        if (rent <= 0) return;

        Log("RentDue", $"{actor.DisplayName} doit {rent} € de loyer à {owner.DisplayName} pour {space.Name}.", actor.Id);
        Pay(actor, rent, owner);
    }

    private decimal ComputeRent(BoardSpace space, PropertyOwnership ownership, GameParticipant owner) => space.Type switch
    {
        SpaceType.Terrain => RentCalculator.TerrainRent(
            space,
            ownership.Houses,
            ownership.HasHotel,
            state.OwnsWholeGroup(owner.Id, space.PropertyGroupId),
            state.Game.Options.LoyerDoubleEnsembleComplet),
        SpaceType.Gare => RentCalculator.StationRent(space.BasePrice ?? 200m, state.CountOwnedOfType(owner.Id, SpaceType.Gare)),
        SpaceType.Compagnie => RentCalculator.UtilityRent(state.Game.LastDie1 + state.Game.LastDie2, state.CountOwnedOfType(owner.Id, SpaceType.Compagnie)),
        _ => 0m
    };

    // ---------------------------------------------------------------- Cartes

    private void DrawCard(GameParticipant actor, CardKind kind)
    {
        var order = kind == CardKind.Chance ? state.Game.ChanceDeckOrder : state.Game.CaisseCommuneDeckOrder;
        var ids = order.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
        if (ids.Count == 0)
        {
            var source = kind == CardKind.Chance ? DefaultCardDecks.Chance : DefaultCardDecks.CaisseCommune;
            ids = source.Select(c => c.Id).OrderBy(_ => random.Next()).ToList();
        }

        var cardId = ids[0];
        ids.RemoveAt(0);
        var card = DefaultCardDecks.ById(cardId);

        // La carte "sortez de prison" est conservée par le joueur : elle ne
        // retourne sous la pioche qu'une fois utilisée (Monopoly.md §5).
        if (card.Effect != CardEffect.GetOutOfJailFree)
            ids.Add(cardId);

        var newOrder = string.Join(',', ids);
        if (kind == CardKind.Chance) state.Game.ChanceDeckOrder = newOrder;
        else state.Game.CaisseCommuneDeckOrder = newOrder;

        Log("CardDrawn", $"{actor.DisplayName} tire une carte {(kind == CardKind.Chance ? "Chance" : "Caisse Commune")} : {card.Text}", actor.Id);
        ApplyCard(actor, card);
    }

    private void ApplyCard(GameParticipant actor, CardDefinition card)
    {
        switch (card.Effect)
        {
            case CardEffect.ReceiveMoney:
                Receive(actor, card.Amount, "carte");
                break;

            case CardEffect.PayMoney:
                PayToBankOrPot(actor, card.Amount);
                break;

            case CardEffect.ReceiveFromEachPlayer:
                foreach (var other in state.ActivePlayers.Where(p => p.Id != actor.Id).ToList())
                {
                    Pay(other, card.Amount, actor);
                }
                break;

            case CardEffect.PayEachPlayer:
                foreach (var other in state.ActivePlayers.Where(p => p.Id != actor.Id).ToList())
                {
                    Pay(actor, card.Amount, other);
                }
                break;

            case CardEffect.GoToStart:
                actor.Position = 0;
                Receive(actor, card.Amount, "carte");
                break;

            case CardEffect.GoToJail:
                SendToJail(actor);
                break;

            case CardEffect.GetOutOfJailFree:
                actor.GetOutOfJailCards++;
                break;

            case CardEffect.MoveToPosition:
                MoveTo(actor, card.Position, collectSalaryIfPassing: true);
                break;

            case CardEffect.MoveBack:
                var back = actor.Position - card.Position;
                if (back < 0) back += state.BoardSize;
                actor.Position = back;
                ResolveLanding(actor);
                break;

            case CardEffect.MoveToNearestStation:
                var stations = state.SpacesOfType(SpaceType.Gare).Select(s => s.Position).OrderBy(p => p).ToList();
                if (stations.Count > 0)
                {
                    var next = stations.FirstOrDefault(p => p > actor.Position, stations[0]);
                    MoveTo(actor, next, collectSalaryIfPassing: true);
                }
                break;

            case CardEffect.PayPerBuilding:
                var owned = state.OwnershipsOf(actor.Id).ToList();
                var houses = owned.Sum(o => o.Houses);
                var hotels = owned.Count(o => o.HasHotel);
                var due = houses * card.Amount + hotels * card.SecondaryAmount;
                if (due > 0)
                {
                    Log("RepairsDue", $"{actor.DisplayName} doit {due} € de réparations ({houses} maison(s), {hotels} hôtel(s)).", actor.Id);
                    PayToBankOrPot(actor, due);
                }
                break;
        }
    }

    // ---------------------------------------------------------------- Achat

    public void BuyPendingProperty(Guid actorId)
    {
        var actor = RequireTurn(actorId);
        if (state.Game.Phase != TurnPhase.AwaitingPurchaseDecision || state.Game.PendingPurchaseSpaceId is not { } spaceId)
            throw new InvalidOperationException("Aucun achat en attente.");

        var space = state.SpaceById(spaceId);
        var price = space.BasePrice ?? 0m;
        if (actor.Money < price)
            throw new InvalidOperationException("Fonds insuffisants pour cet achat.");

        actor.Money -= price;
        var ownership = new PropertyOwnership
        {
            Id = Guid.NewGuid(),
            GameId = state.Game.Id,
            BoardSpaceId = space.Id,
            OwnerParticipantId = actor.Id,
        };
        state.Ownerships.Add(ownership);
        NewOwnerships.Add(ownership);

        Log("PropertyBought", $"{actor.DisplayName} achète {space.Name} pour {price} €.", actor.Id);
        state.Game.PendingPurchaseSpaceId = null;
        state.Game.Phase = TurnPhase.AwaitingEndTurn;
    }

    public void DeclinePendingProperty(Guid actorId)
    {
        var actor = RequireTurn(actorId);
        if (state.Game.Phase != TurnPhase.AwaitingPurchaseDecision || state.Game.PendingPurchaseSpaceId is not { } spaceId)
            throw new InvalidOperationException("Aucun achat en attente.");

        var space = state.SpaceById(spaceId);
        Log("PropertyDeclined", $"{actor.DisplayName} renonce à acheter {space.Name}.", actor.Id);

        // Les enchères sont une option de partie ; sans elle le bien reste libre.
        // TODO enchères temps réel : pour l'instant l'option laisse le bien libre.
        state.Game.PendingPurchaseSpaceId = null;
        state.Game.Phase = TurnPhase.AwaitingEndTurn;
    }

    // ---------------------------------------------------------------- Prison

    public void PayJailFine(Guid actorId)
    {
        var actor = RequireTurn(actorId);
        if (!actor.InPrison) throw new InvalidOperationException("Vous n'êtes pas en prison.");

        Pay(actor, JailFine, null);
        if (state.Game.Phase == TurnPhase.AwaitingDebtSettlement) return;

        actor.InPrison = false;
        actor.JailTurnsElapsed = 0;
        Log("JailFinePaid", $"{actor.DisplayName} paie {JailFine} € et sort de prison.", actor.Id);
        state.Game.Phase = TurnPhase.AwaitingRoll;
    }

    public void UseJailCard(Guid actorId)
    {
        var actor = RequireTurn(actorId);
        if (!actor.InPrison) throw new InvalidOperationException("Vous n'êtes pas en prison.");
        if (actor.GetOutOfJailCards <= 0) throw new InvalidOperationException("Vous n'avez pas de carte de sortie de prison.");

        actor.GetOutOfJailCards--;
        actor.InPrison = false;
        actor.JailTurnsElapsed = 0;
        Log("JailCardUsed", $"{actor.DisplayName} utilise une carte « Sortez de prison ».", actor.Id);
        state.Game.Phase = TurnPhase.AwaitingRoll;
    }

    private void SendToJail(GameParticipant actor)
    {
        var jail = state.SpacesOfType(SpaceType.Prison).FirstOrDefault();
        actor.Position = jail?.Position ?? actor.Position;
        actor.InPrison = true;
        actor.JailTurnsElapsed = 0;
        state.Game.DoublesInARow = 0;
        Log("SentToJail", $"{actor.DisplayName} va en prison.", actor.Id);
    }

    // ---------------------------------------------------------------- Constructions / hypothèques

    public void BuildHouse(Guid actorId, Guid spaceId)
    {
        var actor = RequireActorOwns(actorId, spaceId, out var ownership, out var space);
        if (space.Type != SpaceType.Terrain) throw new InvalidOperationException("On ne construit que sur un terrain.");
        if (!state.OwnsWholeGroup(actor.Id, space.PropertyGroupId)) throw new InvalidOperationException("Il faut posséder tout le groupe de couleur.");
        if (ownership.IsMortgaged) throw new InvalidOperationException("Ce terrain est hypothéqué.");
        if (ownership.HasHotel) throw new InvalidOperationException("Cette propriété a déjà un hôtel.");

        var groupOwnerships = state.SpacesOfGroup(space.PropertyGroupId!.Value)
            .Select(s => state.OwnershipOf(s.Id))
            .Where(o => o is not null)
            .Select(o => o!)
            .ToList();

        if (state.Game.Options.ConstructionEquilibree)
        {
            var minLevel = groupOwnerships.Min(o => o.HasHotel ? 5 : o.Houses);
            var myLevel = ownership.HasHotel ? 5 : ownership.Houses;
            if (myLevel > minLevel)
                throw new InvalidOperationException("Construction équilibrée : construisez d'abord sur les autres terrains du groupe.");
        }

        var cost = space.HouseCost ?? 0m;
        if (actor.Money < cost) throw new InvalidOperationException("Fonds insuffisants.");

        actor.Money -= cost;
        if (ownership.Houses >= MaxHousesPerSpace)
        {
            ownership.Houses = 0;
            ownership.HasHotel = true;
            Log("HotelBuilt", $"{actor.DisplayName} érige un hôtel sur {space.Name} ({cost} €).", actor.Id);
        }
        else
        {
            ownership.Houses++;
            Log("HouseBuilt", $"{actor.DisplayName} construit une maison sur {space.Name} ({cost} €). Total : {ownership.Houses}.", actor.Id);
        }
    }

    public void SellBuilding(Guid actorId, Guid spaceId)
    {
        var actor = RequireActorOwns(actorId, spaceId, out var ownership, out var space);
        if (!ownership.HasHotel && ownership.Houses == 0) throw new InvalidOperationException("Rien à vendre sur cette propriété.");

        var refund = (space.HouseCost ?? 0m) / 2m;
        if (ownership.HasHotel)
        {
            ownership.HasHotel = false;
            ownership.Houses = MaxHousesPerSpace;
            Receive(actor, refund, $"revente de l'hôtel de {space.Name}");
        }
        else
        {
            ownership.Houses--;
            Receive(actor, refund, $"revente d'une maison de {space.Name}");
        }

        SettleDebtIfPossible(actor);
    }

    public void Mortgage(Guid actorId, Guid spaceId)
    {
        var actor = RequireActorOwns(actorId, spaceId, out var ownership, out var space);
        if (ownership.IsMortgaged) throw new InvalidOperationException("Déjà hypothéqué.");
        if (ownership.Houses > 0 || ownership.HasHotel) throw new InvalidOperationException("Revendez d'abord les constructions.");

        ownership.IsMortgaged = true;
        Receive(actor, RentCalculator.MortgageValue(space), $"hypothèque de {space.Name}");
        SettleDebtIfPossible(actor);
    }

    public void Unmortgage(Guid actorId, Guid spaceId)
    {
        var actor = RequireActorOwns(actorId, spaceId, out var ownership, out var space);
        if (!ownership.IsMortgaged) throw new InvalidOperationException("Cette propriété n'est pas hypothéquée.");

        var cost = RentCalculator.UnmortgageCost(space);
        if (actor.Money < cost) throw new InvalidOperationException("Fonds insuffisants pour lever l'hypothèque.");

        actor.Money -= cost;
        ownership.IsMortgaged = false;
        Log("Unmortgaged", $"{actor.DisplayName} lève l'hypothèque de {space.Name} ({cost} €).", actor.Id);
    }

    // ---------------------------------------------------------------- Fin de tour / faillite

    public void EndTurn(Guid actorId)
    {
        var actor = RequireTurn(actorId);
        if (state.Game.Phase == TurnPhase.AwaitingDebtSettlement)
            throw new InvalidOperationException("Réglez d'abord votre dette.");
        if (state.Game.Phase is TurnPhase.AwaitingRoll or TurnPhase.AwaitingPurchaseDecision)
            throw new InvalidOperationException("Terminez d'abord votre action en cours.");

        // Un doublet rejoue (sauf sortie de prison ou trois doublets).
        var rolledDouble = state.Game.LastDie1 == state.Game.LastDie2 && state.Game.DoublesInARow > 0;
        if (rolledDouble && !actor.InPrison && !actor.IsBankrupt)
        {
            Log("DoubleReplay", $"{actor.DisplayName} a fait un doublet et rejoue.", actor.Id);
            state.Game.Phase = TurnPhase.AwaitingRoll;
            return;
        }

        AdvanceToNextPlayer();
    }

    public void DeclareBankruptcy(Guid actorId)
    {
        var actor = state.Game.Participants.First(p => p.Id == actorId);
        var creditor = state.Game.PendingDebtCreditorId is { } cid
            ? state.Game.Participants.FirstOrDefault(p => p.Id == cid)
            : null;

        Bankrupt(actor, creditor);
    }

    private void Bankrupt(GameParticipant actor, GameParticipant? creditor)
    {
        Log("Bankrupt", $"{actor.DisplayName} fait faillite.", actor.Id);

        foreach (var ownership in state.OwnershipsOf(actor.Id).ToList())
        {
            if (creditor is not null)
            {
                ownership.OwnerParticipantId = creditor.Id;
            }
            else
            {
                state.Ownerships.Remove(ownership);
                NewOwnerships.Remove(ownership);
                ownership.OwnerParticipantId = Guid.Empty;
            }
        }

        // Une faillite envers la banque n'est infligée par personne.
        if (creditor is not null)
            creditor.BankruptciesInflicted++;

        if (creditor is not null && actor.Money > 0)
        {
            creditor.Money += actor.Money;
            Log("AssetsTransferred", $"{creditor.DisplayName} récupère les biens et {actor.Money} € de {actor.DisplayName}.", creditor.Id);
        }

        actor.Money = 0;
        actor.IsBankrupt = true;
        state.Game.PendingDebtAmount = 0;
        state.Game.PendingDebtCreditorId = null;

        if (state.ActivePlayers.Count() <= 1)
        {
            EndGame();
            return;
        }

        if (state.Game.CurrentParticipantId == actor.Id)
            AdvanceToNextPlayer();
        else
            state.Game.Phase = TurnPhase.AwaitingEndTurn;
    }

    private void EndGame(string? reason = null)
    {
        // Dernier debout, ou à la limite de tours : le plus riche (Monopoly.md §IV-B).
        var winner = state.ActivePlayers
            .OrderByDescending(state.NetWorth)
            .FirstOrDefault();

        state.Game.Status = GameStatus.Finished;
        state.Game.EndedAt = DateTimeOffset.UtcNow;
        state.Game.WinnerParticipantId = winner?.Id;
        state.Game.Phase = TurnPhase.AwaitingEndTurn;

        var suffix = reason is null ? "" : $" ({reason})";
        Log("GameFinished", winner is null ? "Partie terminée." : $"{winner.DisplayName} remporte la partie{suffix} !", winner?.Id);
    }

    private void AdvanceToNextPlayer()
    {
        var players = state.ActivePlayers.ToList();
        if (players.Count <= 1)
        {
            EndGame();
            return;
        }

        var currentIndex = players.FindIndex(p => p.Id == state.Game.CurrentParticipantId);
        var next = players[(currentIndex + 1 + players.Count) % players.Count];

        state.Game.CurrentParticipantId = next.Id;
        state.Game.TurnNumber++;

        if (state.Game.Options.TurnLimit > 0 && state.Game.TurnNumber > state.Game.Options.TurnLimit)
        {
            EndGame("limite de tours atteinte");
            return;
        }
        state.Game.DoublesInARow = 0;
        state.Game.PendingPurchaseSpaceId = null;
        state.Game.Phase = next.InPrison ? TurnPhase.AwaitingJailDecision : TurnPhase.AwaitingRoll;

        Log("TurnStarted", $"Au tour de {next.DisplayName}.", next.Id);
    }

    // ---------------------------------------------------------------- Échanges

    public TradeOffer ProposeTrade(
        Guid actorId,
        Guid targetId,
        IReadOnlyList<Guid> offeredSpaceIds,
        IReadOnlyList<Guid> requestedSpaceIds,
        decimal offeredMoney,
        decimal requestedMoney)
    {
        var proposer = state.Game.Participants.FirstOrDefault(p => p.Id == actorId && !p.IsBankrupt)
            ?? throw new InvalidOperationException("Joueur inconnu.");
        var target = state.Game.Participants.FirstOrDefault(p => p.Id == targetId && !p.IsBankrupt)
            ?? throw new InvalidOperationException("Destinataire inconnu.");
        if (proposer.Id == target.Id) throw new InvalidOperationException("On n'échange pas avec soi-même.");
        if (offeredSpaceIds.Count == 0 && requestedSpaceIds.Count == 0 && offeredMoney == 0 && requestedMoney == 0)
            throw new InvalidOperationException("Un échange doit porter sur quelque chose.");
        if (offeredMoney < 0 || requestedMoney < 0) throw new InvalidOperationException("Montant invalide.");
        if (offeredMoney > proposer.Money) throw new InvalidOperationException("Tu n'as pas cette somme.");

        ValidateTradeable(offeredSpaceIds, proposer.Id);
        ValidateTradeable(requestedSpaceIds, target.Id);

        var offer = new TradeOffer
        {
            Id = Guid.NewGuid(),
            GameId = state.Game.Id,
            ProposerId = proposer.Id,
            TargetId = target.Id,
            OfferedSpaceIds = string.Join(',', offeredSpaceIds),
            RequestedSpaceIds = string.Join(',', requestedSpaceIds),
            OfferedMoney = offeredMoney,
            RequestedMoney = requestedMoney,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        state.Trades.Add(offer);
        NewTrades.Add(offer);
        Log("TradeProposed", $"{proposer.DisplayName} propose un échange à {target.DisplayName}.", proposer.Id);
        return offer;
    }

    public void RespondToTrade(Guid actorId, Guid tradeId, bool accept)
    {
        var offer = state.Trades.FirstOrDefault(t => t.Id == tradeId && t.Status == TradeStatus.Pending)
            ?? throw new InvalidOperationException("Échange introuvable ou déjà traité.");

        if (offer.TargetId != actorId && !(offer.ProposerId == actorId && !accept))
            throw new InvalidOperationException("Cet échange ne vous concerne pas.");

        var proposer = state.Game.Participants.First(p => p.Id == offer.ProposerId);
        var target = state.Game.Participants.First(p => p.Id == offer.TargetId);

        if (!accept)
        {
            offer.Status = offer.ProposerId == actorId ? TradeStatus.Cancelled : TradeStatus.Declined;
            Log("TradeDeclined", $"L'échange entre {proposer.DisplayName} et {target.DisplayName} n'a pas abouti.", actorId);
            return;
        }

        var offered = offer.Offered().ToList();
        var requested = offer.Requested().ToList();

        // L'état a pu changer depuis la proposition.
        ValidateTradeable(offered, proposer.Id);
        ValidateTradeable(requested, target.Id);
        if (proposer.Money < offer.OfferedMoney) throw new InvalidOperationException("Le proposant n'a plus les fonds.");
        if (target.Money < offer.RequestedMoney) throw new InvalidOperationException("Tu n'as pas les fonds demandés.");

        foreach (var spaceId in offered)
            state.OwnershipOf(spaceId)!.OwnerParticipantId = target.Id;
        foreach (var spaceId in requested)
            state.OwnershipOf(spaceId)!.OwnerParticipantId = proposer.Id;

        proposer.Money -= offer.OfferedMoney;
        target.Money += offer.OfferedMoney;
        target.Money -= offer.RequestedMoney;
        proposer.Money += offer.RequestedMoney;

        offer.Status = TradeStatus.Accepted;

        var summary = $"{proposer.DisplayName} ↔ {target.DisplayName} : {offered.Count} bien(s) et {offer.OfferedMoney} € contre {requested.Count} bien(s) et {offer.RequestedMoney} €.";
        Log("TradeAccepted", $"Échange conclu. {summary}", actorId);
    }

    private void ValidateTradeable(IReadOnlyList<Guid> spaceIds, Guid expectedOwnerId)
    {
        foreach (var spaceId in spaceIds)
        {
            var ownership = state.OwnershipOf(spaceId)
                ?? throw new InvalidOperationException("Propriété non détenue.");
            if (ownership.OwnerParticipantId != expectedOwnerId)
                throw new InvalidOperationException("Une des propriétés a changé de main.");
            if (ownership.Houses > 0 || ownership.HasHotel)
                throw new InvalidOperationException("Revendez les constructions avant d'échanger un terrain.");

            // Règles officielles §13 : rien ne s'échange dans un groupe bâti.
            var space = state.SpaceById(spaceId);
            if (space.PropertyGroupId is { } groupId &&
                state.SpacesOfGroup(groupId).Any(s => state.OwnershipOf(s.Id) is { } o && (o.Houses > 0 || o.HasHotel)))
                throw new InvalidOperationException("Ce groupe comporte des constructions : vendez-les d'abord.");
        }
    }

    // ---------------------------------------------------------------- Argent

    private void Receive(GameParticipant participant, decimal amount, string reason)
    {
        if (amount <= 0) return;
        participant.Money += amount;
        Log("MoneyReceived", $"{participant.DisplayName} reçoit {amount} € ({reason}).", participant.Id);
    }

    private void PayToBankOrPot(GameParticipant payer, decimal amount)
    {
        if (state.Game.Options.CagnotteVacances)
            state.Game.FreeParkingPot += amount;
        Pay(payer, amount, null);
    }

    private void Pay(GameParticipant payer, decimal amount, GameParticipant? creditor)
    {
        if (amount <= 0) return;

        if (payer.Money >= amount)
        {
            payer.Money -= amount;
            if (creditor is not null)
            {
                creditor.Money += amount;
                Log("RentPaid", $"{payer.DisplayName} paie {amount} € à {creditor.DisplayName}.", payer.Id);
            }
            else
            {
                Log("PaidBank", $"{payer.DisplayName} paie {amount} € à la banque.", payer.Id);
            }
            return;
        }

        // Fonds insuffisants : le joueur doit se renflouer ou faire faillite.
        state.Game.PendingDebtAmount = amount;
        state.Game.PendingDebtCreditorId = creditor?.Id;
        state.Game.Phase = TurnPhase.AwaitingDebtSettlement;
        Log("DebtPending", $"{payer.DisplayName} ne peut pas payer {amount} € : il doit vendre, hypothéquer ou déclarer faillite.", payer.Id);
    }

    private void SettleDebtIfPossible(GameParticipant actor)
    {
        if (state.Game.Phase != TurnPhase.AwaitingDebtSettlement) return;
        if (state.Game.CurrentParticipantId != actor.Id) return;
        if (actor.Money < state.Game.PendingDebtAmount) return;

        var amount = state.Game.PendingDebtAmount;
        var creditor = state.Game.PendingDebtCreditorId is { } cid
            ? state.Game.Participants.FirstOrDefault(p => p.Id == cid)
            : null;

        actor.Money -= amount;
        if (creditor is not null) creditor.Money += amount;

        state.Game.PendingDebtAmount = 0;
        state.Game.PendingDebtCreditorId = null;
        state.Game.Phase = TurnPhase.AwaitingEndTurn;
        Log("DebtSettled", $"{actor.DisplayName} règle sa dette de {amount} €.", actor.Id);
    }

    // ---------------------------------------------------------------- Utilitaires

    private GameParticipant RequireTurn(Guid actorId)
    {
        if (state.Game.Status != GameStatus.InProgress)
            throw new InvalidOperationException("La partie n'est pas en cours.");
        if (state.Game.CurrentParticipantId != actorId)
            throw new InvalidOperationException("Ce n'est pas votre tour.");
        return state.Game.Participants.First(p => p.Id == actorId);
    }

    private GameParticipant RequireActorOwns(Guid actorId, Guid spaceId, out PropertyOwnership ownership, out BoardSpace space)
    {
        var actor = state.Game.Participants.FirstOrDefault(p => p.Id == actorId)
            ?? throw new InvalidOperationException("Joueur inconnu.");
        ownership = state.OwnershipOf(spaceId) ?? throw new InvalidOperationException("Propriété non détenue.");
        if (ownership.OwnerParticipantId != actorId) throw new InvalidOperationException("Cette propriété ne vous appartient pas.");
        space = state.SpaceById(spaceId);
        return actor;
    }

    private string Shuffle(IEnumerable<string> ids) =>
        string.Join(',', ids.OrderBy(_ => random.Next()));

    public void Log(string type, string message, Guid? participantId = null)
    {
        var entry = new GameEvent
        {
            Id = Guid.NewGuid(),
            GameId = state.Game.Id,
            Sequence = state.NextEventSequence++,
            Type = type,
            Message = message,
            ParticipantId = participantId,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        state.Game.Events.Add(entry);
        state.RecentEvents.Add(entry);
    }
}
