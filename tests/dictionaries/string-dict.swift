public func newEmpty() -> [String: String] {
    return [:]
}

public func newSingle(key: String, value: String) -> [String: String] {
    return [key: value]
}

public func dictGet(_ dict: [String: String], key: String) -> String? {
    return dict[key]
}

public func dictSet(_ dict: inout [String: String], key: String, value: String) -> () {
    dict[key] = value
}

public func count(_ dict: [String: String]) -> Int {
    return dict.count
}

public func allKeys(_ dict: [String: String]) -> Dictionary<String, String>.Keys {
    return dict.keys
}

public func firstKey(_ dict: [String: String]) -> String? {
    return dict.keys.first
}
