public func equal<T: Equatable>(lhs: T, rhs: T) -> Bool {
	return lhs == rhs
}

public func match<T: Equatable>(lhs: T, rhs: T) -> Bool {
	return lhs ~= rhs
}

public func matchInts(lhs: Int, rhs: Int) -> Bool {
	return lhs ~= rhs
}

public func matchOptionals(lhs: Bool?, rhs: Bool?) -> Bool {
	return lhs ~= rhs
}
