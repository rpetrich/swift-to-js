public func attempt(shouldSucceed: Bool) throws -> Bool {
	precondition(shouldSucceed, "Should succeed")
	return shouldSucceed
}
