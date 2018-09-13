public struct Point {
    var x: Double
    var y: Double
}

var origin = Point(x: 0, y: 0)

public func pointOffsetFromOrigin(x: Double, y: Double) -> Point {
	var result = origin
	result.x += x
	result.y += y
	return result
}
