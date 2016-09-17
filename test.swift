import Darwin

// Basic integer types

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

// Optionals

public func optional_from(num: Int) -> Bool? {
    if (num > 0) {
        return true
    } else if (num == 0) {
        return false
    }
    return .none
}

public func has_value(option: Bool?) -> Bool {
    return option != nil
}

// Strings

public func hello_world() -> String {
    return "Hello World!"
}

public func string_length(str: String) -> Int {
    return str.utf16.count;
}

public func description_of(option: Bool?) -> String {
    if let unwrapped = option {
        if unwrapped {
            return "True"
        }
        return "False"
    }
    return "None"
}

// public func concat(l: String, r: String) -> String {
//     return l + r
// }

// Arrays

// public func twoInts(first: Int, second: Int) -> [Int] {
//     return [first, second]
// }

// public func arrayCount(array: [Int]) -> Int {
//     return array.count
// }

// public func arrayGet(array: [Int], index: Int) -> Int {
//     return array[index]
// }

// public func oneInt(value: Int) -> [Int] {
//     return [value]
// }

// Enums

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

// Structs

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
    var isOrigin: Bool {
        get {
            return x == 0 && y == 0
        }
    }
}

public var origin = Point()

public func getOrigin() -> Point {
    return origin
}

public func distance(first: Point, second: Point) -> Double {
    let delta = Point(x: first.x - second.x, y: first.y - second.y)
    return sqrt(delta.x * delta.x + delta.y * delta.y)
}

// Compound Structs

public struct Size {
    var width: Double
    var height: Double
    public init() {
        width = 0
        height = 0
    }
    public init(width _width: Double, height _height: Double) {
        width = _width
        height = _height
    }
    var isEmpty: Bool {
        get {
            return width == 0 && width == 0
        }
    }
}

public struct Rect {
    var origin: Point
    var size: Size
}

public var zeroRect = Rect(origin: Point(), size: Size())

public func getZeroRect() -> Rect {
    return zeroRect;
}

// Classes

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
