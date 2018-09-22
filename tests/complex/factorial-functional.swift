public func factorial_functional(number: UInt) -> UInt {
    return (2...number).reduce(1, *)
}

