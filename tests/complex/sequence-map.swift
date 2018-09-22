public func stringSequence(until limit: Int) -> String {
    return (1...limit).map(String.init).joined(separator: " ")
}
