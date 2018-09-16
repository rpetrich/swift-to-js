public func negate<T: SignedNumeric>(number: T) -> T {
    return -number
}

public func negate(integer: Int) -> Int {
	return negate(number: integer)
}
