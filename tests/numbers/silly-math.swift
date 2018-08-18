public func silly_math(num: Int) -> Int {
    var result = num;
    while (result < 10000) {
        result *= result;
    }
    return result;
}
