public class Size {
	var width: Double
	var height: Double
	public init(width w: Double, height h: Double) {
		width = w
		height = h
	}
}

public func makeSizes(w1: Double, h1: Double, w2: Double, h2: Double) -> [Size] {
	return [Size(width: w1, height: h1), Size(width: w2, height: h2)]
}

public func countSizes(sizes: [Size]) -> Int {
	return sizes.count
}

public func copySizes(sizes: [Size]) -> [Size] {
	return sizes
}
