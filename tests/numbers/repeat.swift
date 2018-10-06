public func silly_math(num: Int) -> Int {
    var result = num;
    repeat {
        result *= result;
    } while (result < 10000)
    return result;
}
