public enum BasicError: Error {
	case requested
}

public func attempt(shouldSucceed: Bool) throws -> () {
	guard shouldSucceed else {
		throw BasicError.requested
	}
}
