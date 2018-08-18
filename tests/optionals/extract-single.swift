public func description_of(option: Bool?) -> String {
    if let unwrapped = option {
        if unwrapped {
            return "True"
        }
        return "False"
    }
    return "None"
}
