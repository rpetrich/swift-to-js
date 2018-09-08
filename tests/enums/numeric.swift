public enum Divisible: Int {
    case byNone = 0
    case byThree = 1
    case byFive = 2
    case byBoth = 3
}

public func select_value(num: Int) -> Divisible {
    switch num % 15 {
        case 0:
            return Divisible.byBoth
        case 3, 6, 9, 12:
            return Divisible.byThree
        case 5, 10:
            return Divisible.byFive
        default:
            return Divisible.byNone
    }
}

public func describe(divisible: Divisible) -> String {
    switch divisible {
        case .byNone:
            return "divisible by neither three or five"
        case .byThree:
            return "divisible by three, but not five"
        case .byFive:
            return "divisible by five, but not three"
        case .byBoth:
            return "divisible by both three and five"
    }
}

public func rawValue(of divisible: Divisible) -> Int {
    return divisible.rawValue
}
