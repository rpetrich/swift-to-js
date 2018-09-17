public class Point {
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

public func distance(first: Point, second: Point) -> Double {
    let delta = Point(x: first.x - second.x, y: first.y - second.y)
    return (delta.x * delta.x + delta.y * delta.y).squareRoot()
}
