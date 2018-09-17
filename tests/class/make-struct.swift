public class Size {
	var width: Double
	var height: Double
	public init(width w: Double, height h: Double) {
		width = w
		height = h
	}
}

public func makeSize(w: Double, h: Double) -> Size {
	return Size(width: w, height: h)
}
