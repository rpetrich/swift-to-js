public struct Size {
    var width: Double
    var height: Double
    var isEmpty: Bool {
    	return width == 0 && height == 0
    }
}

public func isEmpty(size: Size) -> Bool {
    return size.isEmpty
}
