public class Point {
	var x: Double
	var y: Double

	init(x _x: Double, y _y: Double) {
		x = _x
		y = _y
	}
}

let origin = Point(x: 0, y: 0)

public func pointOffsetFromOrigin(x: Double, y: Double) -> Point {
	let result = Point(x: origin.x, y: origin.y)
	result.x += x
	result.y += y
	return result
}
