func increment(number: Int) -> Int {
    return number + 1
}

public func increment_until_zero(number: Int) -> Int {
    if (number < 0) {
        return increment(number: number)
    }
    return number
}
