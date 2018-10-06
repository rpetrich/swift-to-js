public func swapInts(a: inout Int, b: inout Int) {
	swap(&a, &b)
}

public func swapInts() -> Int {
	var a = 0
	var b = 1
	swap(&a, &b)
	return a
}
