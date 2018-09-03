public func dictionaryKeys(_ dict: [Int: Int]) -> Dictionary<Int, Int>.Keys {
    return dict.keys
}

public func firstKey(_ dict: [Int: Int]) -> Int? {
    return dict.keys.first
}
