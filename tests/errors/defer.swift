public enum BasicError: Error {
	case requested
}

public func attempt(shouldThrow: Bool) throws -> Bool {
	if shouldThrow {
		throw BasicError.requested
	}
	return true
}

var processing: Bool

public func defers(shouldThrow: Bool) -> Bool? {
	processing = true
	defer {
		processing = false
	}
	return try? attempt(shouldThrow: shouldThrow)
}
