public func optional_from(num: Int) -> Bool?? {
    if (num > 0) {
        return true
    } else if (num == 0) {
        return .some(.none)
    }
    return .none
}
