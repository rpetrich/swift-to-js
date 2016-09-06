func increment(a: Int) -> Int {
    return a + 1
}

public func increment_until_zero(a: Int) -> Int {
    if (a < 0) {
        return increment(a)
    }
    return a
}

public func decrement_until_zero(a: Int) -> Int {
    if (a > 0) {
        return a - 1
    }
    return a
}

public func negate(a: Int) -> Int {
    return -a
}

public func factorial_recursive(number: Int) -> Int {
    if (number <= 1) {
        return 1
    }
    return number * factorial_recursive(number - 1)
}

public func factorial_iterative(number: Int) -> Int {
    return number < 1 ? 1 : (1...number).reduce(1, combine: *)
}

public func silly_math(num: Int) -> Int {
    var result = num;
    while (result < 10000) {
        result *= result;
    }
    return result;
}

public func hello_world() -> String {
    return "Hello World!"
}

public func string_length(str: String) -> Int {
    return str.utf16.count;
}

/*public func concat(a: String, b: String) -> String {
    return a + b
}*/
