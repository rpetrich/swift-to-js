public func add<T: Numeric>(lhs: T, rhs: T) -> T {
	return lhs + rhs
}

public func subtract<T: Numeric>(lhs: T, rhs: T) -> T {
	return lhs - rhs
}

public func double<T: Numeric>(target: inout T) {
	target += target
}

public func addInts(lhs: Int, rhs: Int) -> Int {
	return add(lhs: lhs, rhs: rhs)
}

public func subtractInts(lhs: Int, rhs: Int) -> Int {
	return subtract(lhs: lhs, rhs: rhs)
}

public func double(int: inout Int) {
	double(target: &int)
}

public func double(ofInt int: Int) -> Int {
	var temp = int
	double(target: &temp)
	return temp
}
