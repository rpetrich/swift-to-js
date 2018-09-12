public func makeUInt8(fromUInt16 value: UInt16) -> UInt8 {
	return UInt8(value)
}

public func makeInt32(fromInt value: Int) -> Int32 {
	return Int32(value)
}

public func makeInt16(fromInt value: Int) -> Int16 {
	return Int16(value)
}

public func makeClampedInt16(fromInt value: Int) -> Int16 {
	return Int16(clamping: value)
}

public func makeOptionalUInt8(fromUInt16 value: UInt16) -> UInt8? {
	return UInt8(exactly: value)
}
