public struct Size {
    var width: Double
    var height: Double
    public init(width w: Double, height h: Double) {
        width = w
        height = h
    }
}

public func makeSizes(w1: Double, h1: Double, w2: Double, h2: Double) -> (Size, Size) {
    return (Size(width: w1, height: h1), Size(width: w2, height: h2))
}

public func sumSizes(sizes: (Size, Size)) -> Size {
	return Size(width: sizes.0.width + sizes.1.height, height: sizes.0.height + sizes.1.height)
}

public func copySizes(sizes: (Size, Size)) -> (Size, Size) {
	return sizes
}
