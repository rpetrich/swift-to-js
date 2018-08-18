public func factorial_recursive(number: Int) -> Int {
    if (number <= 1) {
        return 1
    }
    return number * factorial_recursive(number: number - 1)
}
