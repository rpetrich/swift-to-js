public enum BasicError: Error {
	case requested
}

public func attempt(shouldThrow: Bool) throws -> () {
	if shouldThrow {
		throw BasicError.requested
	}
}

public func recover(shouldThrow: Bool) throws -> Int {
	do {
		try attempt(shouldThrow: shouldThrow)
		return 1
	}
}
