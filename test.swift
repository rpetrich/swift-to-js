import Darwin

func increment(number: Int) -> Int {
    return number + 1
}

public func increment_until_zero(number: Int) -> Int {
    if (number < 0) {
        return increment(number: number)
    }
    return number
}

public func decrement_until_zero(number: Int) -> Int {
    if (number > 0) {
        return number - 1
    }
    return number
}

public func negate(number: Int) -> Int {
    return -number
}

public func factorial_recursive(number: Int) -> Int {
    if (number <= 1) {
        return 1
    }
    return number * factorial_recursive(number: number - 1)
}

public func factorial_iterative(number: Int) -> Int {
    return number < 1 ? 1 : (1...number).reduce(1, *)
}

public func silly_math(num: Int) -> Int {
    var result = num;
    while (result < 10000) {
        result *= result;
    }
    return result;
}

public func more_silly_math(num: Int) -> Int {
    var result: Int
    if (num < 0) {
        result = num;
    } else {
        result = -num;
    }
    return result * 1000 + 4;
}

public func optional_from(num: Int) -> Bool? {
    if (num > 0) {
        return true
    } else if (num == 0) {
        return false
    }
    return .none
}

public func description_of(option: Bool?) -> String {
    if let unwrapped = option {
        if unwrapped {
            return "Greater than zero"
        }
        return "Equal to zero"
    }
    return "Less than zero"
}

public func has_value(option: Bool?) -> Bool {
    return option != nil
}

public func hello_world() -> String {
    return "Hello World!"
}

public func string_length(str: String) -> Int {
    return str.utf16.count;
}

public func twoInts(first: Int, second: Int) -> [Int] {
    return [first, second]
}

public func arrayCount(array: [Int]) -> Int {
    return array.count
}

public func arrayGet(array: [Int], index: Int) -> Int {
    return array[index]
}

public func oneInt(value: Int) -> [Int] {
    return [value]
}

// public enum Divisible {
//     case byNone
//     case byThree
//     case byFive
//     case byBoth
// }

// public func select_value(num: Int) -> Divisible {
//     switch num % 15 {
//         case 0:
//             return Divisible.byBoth
//         case 3, 6, 9, 12:
//             return Divisible.byThree
//         case 5, 10:
//             return Divisible.byFive
//         default:
//             return Divisible.byNone
//     }
// }

public struct Point {
    var x: Double
    var y: Double
    public init() {
        x = 0
        y = 0
    }
    public init(x _x: Double, y _y: Double) {
        x = _x
        y = _y
    }
    var isZero: Bool {
        get {
            return x == 0 && y == 0
        }
    }
}

public func distance(first: Point, second: Point) -> Double {
    let delta = Point(x: first.x - second.x, y: first.y - second.y)
    return sqrt(delta.x * delta.x + delta.y * delta.y)
}

public class IntHolder {
    var value: Int = 0
}

public func getValue(holder: IntHolder) -> Int {
    return holder.value;
}

public func newValue(val: Int) -> IntHolder {
    let result = IntHolder()
    result.value = val;
    return result;
}

public func updateValue(holder: IntHolder, value: Int) {
    holder.value = value;
}

public final class IntHolderSubclass : IntHolder {
    var wasSet: Bool = false
    override var value: Int {
        didSet {
            wasSet = true
        }
    }
}
