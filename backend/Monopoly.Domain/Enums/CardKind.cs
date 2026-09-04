namespace Monopoly.Domain.Enums;

public enum CardKind
{
    Chance,
    CaisseCommune
}

public enum CardEffect
{
    ReceiveMoney,
    PayMoney,
    ReceiveFromEachPlayer,
    PayEachPlayer,
    GoToStart,
    GoToJail,
    GetOutOfJailFree,
    MoveToPosition,
    MoveBack,
    MoveToNearestStation,
    PayPerBuilding
}
