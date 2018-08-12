// //import Darwin

// // DOM APIs

// @javascript
// public protocol EventTarget {
// }

// @javascript
// public protocol Node : EventTarget {
//     func appendChild(_ newChild: Node) throws
//     func cloneNode(_ deeply: Bool) -> Node
//     func contains(_ node: Node) -> Bool
//     func hasChildNodes() -> Bool
//     func insertBefore(_ newNode: Node, _ referenceNode: Node?) -> Node
//     func isEqualNode(_ otherNode: Node) -> Bool
//     func isSameNode(_ otherNode: Node) -> Bool
//     func normalize()
//     func removeChild(_ childNode: Node) throws
//     func replaceChild(_ newChild: Node, _ oldChild: Node) throws -> Node
//     var baseURI: String { get }
//     var childNodes: [Node] { get } // Returns a DOMNodeList which is a "live collection"--we don't model this for now
//     var firstChild: Node? { get }
//     var lastChild: Node? { get }
//     var nextSibling: Node? { get }
//     var nodeName: String { get }
//     var nodeType: Int { get } // Should perhaps be a enum once we support numeric enums?
//     var nodeValue: String? { get set }
//     var ownerDocument: DOMDocument? { get }
//     var parentNode: Node? { get }
//     var parentElement: Element? { get }
//     var previousSibling: Node? { get }
//     var textContent: String { get set }
// }

// @javascript
// public protocol ParentNode : Node {
//     var children: [Element] { get set } // Returns a live HTMLCollection
//     var firstElementChild: Element? { get }
//     var lastElementChild: Element? { get }
//     var childElementCount: Int { get }
// }

// @javascript
// public protocol Element : ParentNode {
//     func querySelector(_ selector: String) -> HTMLElement?
//     func querySelectorAll(_ selector: String) -> [HTMLElement]
//     var className: String { get set }
//     var clientHeight: Int { get }
//     var clientLeft: Int { get }
//     var clientTop: Int { get }
//     var clientWidth: Int { get }
//     var id: String { get set }
//     var innerHTML: String { get set }
//     var outerHTML: String { get set }
//     var scrollHeight: Int { get }
//     var scrollLeft: Int { get set }
//     var scrollTop: Int { get set }
//     var scrollWidth: Int { get }
//     var tagName: String { get }
// }

// @javascript
// public protocol HTMLElement: Element {
//     func blur() throws
//     func click() throws
//     func focus() throws
//     var innerText: String { get set }
//     var contentEditable: String { get set }
//     var isContentEditable: Bool { get }
//     var dir: String { get set }
//     var lang: String { get set }
//     var offsetLeft: Int { get }
//     var offsetTop: Int { get }
//     var title: String { get set }
//     var tabIndex: Int { get set }
// }

// @javascript
// public protocol HTMLAnchorElement: HTMLElement {
//     var href: String { get set }
// }

// @javascript
// public protocol Window {
// }

// @javascript
// public protocol Location {
//     func assign(_ url: String)
//     func reload()
//     func replace(_ url: String)
//     var href: String { get set }
//     var `protocol`: String { get }
//     var host: String { get }
//     var hostname: String { get }
//     var port: String { get }
//     var pathname: String { get }
//     var search: String { get }
//     var hash: String { get }
//     var username: String { get }
//     var password: String { get }
//     var origin: String { get }
// }

// @javascript
// public protocol DOMDocument {
//     func getElementById(_ id: String) -> HTMLElement?
//     func createElement(_ tagName: String) throws -> HTMLElement
//     func querySelector(_ selector: String) -> HTMLElement?
//     func querySelectorAll(_ selector: String) -> [HTMLElement]
//     var activeElement: HTMLElement? { get }
//     var body: HTMLElement? { get }
//     var cookie: String { get set }
//     var defaultView: Window? { get }
//     var designMode: String { get set }
//     var dir: String { get set }
//     var domain: String { get set }
//     var head: HTMLElement { get }
//     var lastModified: String { get }
//     var location: Location { get }
//     var readyState: String { get }
//     var referrer: String { get }
//     var title: String { get set }
//     var URL: String { get }
// }

// @_silgen_name("_getDocument")
// func _getDocument() -> DOMDocument

// var document: DOMDocument {
//     get {
//         return _getDocument()
//     }
// }

// extension DOMDocument {
//     func createAnchorElement() -> HTMLAnchorElement {
//         return try! createElement("a") as! HTMLAnchorElement
//     }
// }

// public func rootElementHTML() -> String {
//     if let root = document.getElementById("root") {
//         return root.innerHTML
//     }
//     return ""
// }

// public func setRootElementHTML(to html: String) {
//     if let root = document.getElementById("root") {
//         root.innerHTML = html
//     }
// }

// //@_silgen_name("absoluteURL")
// @javascript
// public func absoluteURL(fromRelative path: String) throws -> String {
//     //var anchor = try document.createElement("a") as! HTMLAnchorElement
//     let anchor = document.createAnchorElement()
//     anchor.href = path
//     return anchor.href
// }

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

public func concat(l: String, r: String) -> String {
    return l + r
}

public func lowercase(ofString str: String) -> String {
    return str.lowercased()
}

public func uppercase(ofString str: String) -> String {
    return str.uppercased()
}

public func stringSequence(until limit: Int) -> String {
    return (1...limit).map({ num in String(num) }).joined(separator: " ")
}

// public func stringSequence(until limit: Int) -> [String] {
//     return (1...limit).map({ num in String(num) })
// }

public func description_of(option: Bool?) -> String {
    if let unwrapped = option {
        if unwrapped {
            return "True"
        }
        return "False"
    }
    return "None"
}

// public func description_of(option: Bool?) -> String {
//     return option.flatMap { foo in foo ? "True" : "False" } ?? "None"
// }

public func description_of_double(option: Bool??) -> String {
    if let unwrapped = option {
        if let doubleUnwrapped = unwrapped {
            if doubleUnwrapped {
                return "True"
            }
            return "False"
        }
        return "Inner None"
    }
    return "Outer None"
}

// Arrays

public func emptyIntArray() -> [Int] {
    return []
}

public func oneInt(value: Int) -> [Int] {
    return [value]
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

public func sequence(until limit: Int) -> [Int] {
    return Array(1...limit)
}

// Enums

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

public func getMaskedOrigin() -> Point {
    var result = origin;
    result.x = 0
    return result;
}

public func setOrigin(newValue: Point) {
    origin = newValue
}

public func distance(first: Point, second: Point) -> Double {
    let delta = Point(x: first.x - second.x, y: first.y - second.y)
    return (delta.x * delta.x + delta.y * delta.y).squareRoot()
}

public var foo: Double = 0

public func getFoo() -> Double {
    return foo
}

public func setFoo(newValue: Double) {
    foo = newValue
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

public func offset(point: Rect, by offset: Size) -> Rect {
    var result = point
    result.origin.x += offset.width
    result.origin.y += offset.height
    return result
}

var zeroRect = Rect(origin: Point(), size: Size())

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

final class IntHolderSubclass : IntHolder {
    var wasSet: Bool = false
    override var value: Int {
        didSet {
            wasSet = true
        }
    }
}

public func add(a: Float, b: Float) -> Float {
    return a + b
}

// Tuple

public var tuplePoint: (Double, Double) = (0, 0)

public func makeTuplePoint(x: Double, y: Double) -> (Double, Double) {
    return (x, y)
}

public func readX(fromTuplePoint point:(Double, Double)) -> Double {
    return point.0
}

public func readY(fromTuplePoint point:(Double, Double)) -> Double {
    return point.1
}

public func distanceToZero(ofPoint point:(Double, Double)) -> Double {
    let (x, y) = point
    return (x * x + y * y).squareRoot()
}

public func getTuplePoint() -> (Double, Double) {
    return tuplePoint
}

public func setTuplePoint(to newPoint: (Double, Double)) {
    tuplePoint = newPoint
}

// FizzBuzz

public func fizzBuzz() -> [String] {
    return (1...100).map { $0 % 3 == 0 ? $0 % 5 == 0 ? "FizzBuzz" : "Fizz" : $0 % 5 == 0 ? "Buzz" : String($0) };
}

// public func fizzBuzz() -> String {
//     var result: String = ""
//     (1...100).forEach {
//         result += $0 % 3 == 0 ? $0 % 5 == 0 ? "FizzBuzz" : "Fizz" : $0 % 5 == 0 ? "Buzz" : String($0);
//         result += "\n";
//     };
//     return result;
// }

public func fizzBuzz(of val: Int) -> String {
    return val % 3 == 0 ? val % 5 == 0 ? "FizzBuzz" : "Fizz" : val % 5 == 0 ? "Buzz" : String(val);
}
