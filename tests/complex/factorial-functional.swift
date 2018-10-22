public func factorial(of number: UInt) -> UInt {
    return (2...number).reduce(1, *)
}

print(factorial(of: 20))
