public func parseBoolean(fromString str: String) -> Bool? {
	return Bool(str)
}

public func parseBooleanTrue() -> Bool? {
	return Bool("True")
}

public func parseBooleanFalse() -> Bool? {
	return Bool("False")
}

public func parseBooleanElse() -> Bool? {
	return Bool("Else")
}
