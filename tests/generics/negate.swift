public func negate<T: SignedNumeric>(number: T) -> T {
	return -number
}

public func negate(integer: Int) -> Int {
	return negate(number: integer)
}

public func negate(double: Double) -> Double {
	return negate(number: double)
}

public func negateDirect(double: Double) -> Double {
	return -double
}
