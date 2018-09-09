public enum BasicError: Error {
	case requested
}

public func attempt(shouldThrow: Bool) throws -> Bool {
	if shouldThrow {
		throw BasicError.requested
	}
	return true
}

public func force(shouldThrow: Bool) -> Bool {
	return try! attempt(shouldThrow: shouldThrow)
}
