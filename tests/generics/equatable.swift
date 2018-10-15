public func equal<T: Equatable>(lhs: T, rhs: T) -> Bool {
	return lhs == rhs
}

public func integerEqual(lhs: Int, rhs: Int) -> Bool {
	return equal(lhs: lhs, rhs: rhs)
}

public func optionalDoubleEqual(lhs: Double?, rhs: Double?) -> Bool {
	return equal(lhs: lhs, rhs: rhs)
}

public func stringArrayEqual(lhs: [String], rhs: [String]) -> Bool {
	return equal(lhs: lhs, rhs: rhs)
}

public struct Point: Equatable {
	var x: Double
	var y: Double

	public static func ==(lhs: Point, rhs: Point) -> Bool {
		return lhs.x == rhs.x && lhs.y == rhs.y
	}
}

public func pointEqual(lhs: Point, rhs: Point) -> Bool {
	return equal(lhs: lhs, rhs: rhs)
}

public func pointEqualDirect(lhs: Point, rhs: Point) -> Bool {
	return lhs == rhs
}

public func pointNotEqualDirect(lhs: Point, rhs: Point) -> Bool {
	return lhs != rhs
}

public func pointArrayEqual(lhs: [Point], rhs: [Point]) -> Bool {
	return equal(lhs: lhs, rhs: rhs)
}

public func arrayEqual<T: Equatable>(lhs: [T], rhs: [T]) -> Bool {
	return equal(lhs: lhs, rhs: rhs)
}

