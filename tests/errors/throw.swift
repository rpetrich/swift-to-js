public enum BasicError: Error {
	case requested
}

public func attempt(shouldThrow: Bool) throws -> () {
	if shouldThrow {
		throw BasicError.requested
	}
}
