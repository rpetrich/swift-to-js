public struct Point {
	var x: Double
	var y: Double
	public init(x _x: Double, y _y: Double) {
		x = _x
		y = _y
	}
}

public enum Position {
	case empty
	case twoDimensional(Point)
	case threeDimensional(Point, Double)
}

public func makeCopy(ofPosition position: Position) -> Position {
	let copy = position
	return copy
}
