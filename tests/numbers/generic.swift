public func add<T: Numeric>(lhs: T, rhs: T) -> T {
	return lhs + rhs
}

public func subtract<T: Numeric>(lhs: T, rhs: T) -> T {
	return lhs - rhs
}

public func addInts(lhs: Int, rhs: Int) -> Int {
	return add(lhs: lhs, rhs: rhs)
}

public func subtractInts(lhs: Int, rhs: Int) -> Int {
	return add(lhs: lhs, rhs: rhs)
}
