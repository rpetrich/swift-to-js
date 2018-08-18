public func more_silly_math(num: Int) -> Int {
    var result: Int
    if (num < 0) {
        result = num;
    } else {
        result = -num;
    }
    return result * 1000 + 4;
}
