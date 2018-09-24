public func addOne(to int: inout Int) {
	int += 1
}

public func incremented(integer: Int) -> Int {
	var copy = integer
	addOne(to: &copy)
	return copy
}
