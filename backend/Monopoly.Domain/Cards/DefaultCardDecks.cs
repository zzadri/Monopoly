using Monopoly.Domain.Enums;

namespace Monopoly.Domain.Cards;

/// <summary>
/// Paquets Chance et Caisse Commune du plateau par défaut (Monopoly.md §7).
/// Les positions référencent le plateau par défaut : 0 Départ, 11 Bd de la
/// Villette, 15 Gare de Lyon, 24 Av. Henri-Martin, 39 Rue de la Paix.
/// </summary>
public static class DefaultCardDecks
{
    public static readonly IReadOnlyList<CardDefinition> Chance =
    [
        new("ch-01", CardKind.Chance, "Avancez jusqu'à la case Départ. Touchez 300 €.", CardEffect.GoToStart, Amount: 300),
        new("ch-02", CardKind.Chance, "Rendez-vous Rue de la Paix.", CardEffect.MoveToPosition, Position: 39),
        new("ch-03", CardKind.Chance, "Rendez-vous Boulevard de la Villette. Si vous passez par la case Départ, recevez 200 €.", CardEffect.MoveToPosition, Position: 11),
        new("ch-04", CardKind.Chance, "Avancez jusqu'à l'Avenue Henri-Martin. Si vous passez par la case Départ, recevez 200 €.", CardEffect.MoveToPosition, Position: 24),
        new("ch-05", CardKind.Chance, "Avancez jusqu'à la Gare de Lyon. Si vous passez par la case Départ, recevez 200 €.", CardEffect.MoveToPosition, Position: 15),
        new("ch-06", CardKind.Chance, "Rendez-vous à la gare la plus proche. Si vous passez par la case Départ, recevez 200 €.", CardEffect.MoveToNearestStation),
        new("ch-07", CardKind.Chance, "Reculez de trois cases.", CardEffect.MoveBack, Position: 3),
        new("ch-08", CardKind.Chance, "Allez en prison. Ne passez pas par la case Départ, ne touchez pas 200 €.", CardEffect.GoToJail),
        new("ch-09", CardKind.Chance, "Vous êtes libéré de prison. Cette carte peut être conservée jusqu'à ce qu'elle soit utilisée.", CardEffect.GetOutOfJailFree),
        new("ch-10", CardKind.Chance, "Vous êtes imposé pour les réparations de voirie : 150 € par maison, 500 € par hôtel.", CardEffect.PayPerBuilding, Amount: 150, SecondaryAmount: 500),
        new("ch-11", CardKind.Chance, "Faites des réparations dans toutes vos maisons : 250 € par maison, 750 € par hôtel.", CardEffect.PayPerBuilding, Amount: 250, SecondaryAmount: 750),
        new("ch-12", CardKind.Chance, "Amende pour excès de vitesse : payez 150 €.", CardEffect.PayMoney, Amount: 150),
        new("ch-13", CardKind.Chance, "Amende pour ivresse : payez 200 €.", CardEffect.PayMoney, Amount: 200),
        new("ch-14", CardKind.Chance, "Payez pour frais de scolarité : 250 €.", CardEffect.PayMoney, Amount: 250),
        new("ch-15", CardKind.Chance, "La banque vous verse un dividende de 200 €.", CardEffect.ReceiveMoney, Amount: 200),
        new("ch-16", CardKind.Chance, "Votre immeuble et votre prêt rapportent : touchez 150 €.", CardEffect.ReceiveMoney, Amount: 150),
        new("ch-17", CardKind.Chance, "Vous avez gagné le prix des mots croisés : recevez 200 €.", CardEffect.ReceiveMoney, Amount: 200),
    ];

    public static readonly IReadOnlyList<CardDefinition> CaisseCommune =
    [
        new("cc-01", CardKind.CaisseCommune, "Erreur de la banque en votre faveur : recevez 200 €.", CardEffect.ReceiveMoney, Amount: 200),
        new("cc-02", CardKind.CaisseCommune, "La vente de vos actions vous rapporte : recevez 50 €.", CardEffect.ReceiveMoney, Amount: 50),
        new("cc-03", CardKind.CaisseCommune, "Votre police d'assurance-vie arrive à échéance : recevez 100 €.", CardEffect.ReceiveMoney, Amount: 100),
        new("cc-04", CardKind.CaisseCommune, "Vous gagnez le deuxième prix de beauté : recevez 10 €.", CardEffect.ReceiveMoney, Amount: 10),
        new("cc-05", CardKind.CaisseCommune, "Vous héritez : recevez 100 €.", CardEffect.ReceiveMoney, Amount: 100),
        new("cc-06", CardKind.CaisseCommune, "Revenu annuel : recevez 100 €.", CardEffect.ReceiveMoney, Amount: 100),
        new("cc-07", CardKind.CaisseCommune, "Remboursement d'impôt : recevez 20 €.", CardEffect.ReceiveMoney, Amount: 20),
        new("cc-08", CardKind.CaisseCommune, "Les contributions vous remboursent : recevez 20 €.", CardEffect.ReceiveMoney, Amount: 20),
        new("cc-09", CardKind.CaisseCommune, "C'est votre anniversaire : chaque joueur vous donne 10 €.", CardEffect.ReceiveFromEachPlayer, Amount: 10),
        new("cc-10", CardKind.CaisseCommune, "Recevez votre intérêt sur l'emprunt à 7 % : recevez 25 €.", CardEffect.ReceiveMoney, Amount: 25),
        new("cc-11", CardKind.CaisseCommune, "Payez la note du médecin : 50 €.", CardEffect.PayMoney, Amount: 50),
        new("cc-12", CardKind.CaisseCommune, "Payez votre police d'assurance : 50 €.", CardEffect.PayMoney, Amount: 50),
        new("cc-13", CardKind.CaisseCommune, "Payez à l'hôpital : 100 €.", CardEffect.PayMoney, Amount: 100),
        new("cc-14", CardKind.CaisseCommune, "Avancez jusqu'à la case Départ. Recevez 200 €.", CardEffect.GoToStart, Amount: 200),
        new("cc-15", CardKind.CaisseCommune, "Allez en prison. Ne passez pas par la case Départ.", CardEffect.GoToJail),
        new("cc-16", CardKind.CaisseCommune, "Vous êtes libéré de prison. Cette carte peut être conservée jusqu'à ce qu'elle soit utilisée.", CardEffect.GetOutOfJailFree),
    ];

    public static CardDefinition ById(string id) =>
        Chance.Concat(CaisseCommune).First(c => c.Id == id);
}
