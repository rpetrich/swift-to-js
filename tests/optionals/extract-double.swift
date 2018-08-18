public func description_of_double(option: Bool??) -> String {
    if let unwrapped = option {
        if let doubleUnwrapped = unwrapped {
            if doubleUnwrapped {
                return "True"
            }
            return "False"
        }
        return "Inner None"
    }
    return "Outer None"
}
