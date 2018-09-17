public class Size {
	var width: Double
	var height: Double

	init(width: Double, height: Double) {
	}

	public var isEmpty: Bool {
		return width == 0 && height == 0
	}

	var isEmptyInlined: Bool {
		return width == 0 && height == 0
	}
}

public func isEmpty(size: Size) -> Bool {
	return size.isEmpty
}

public func isEmptyInlined(size: Size) -> Bool {
	return size.isEmptyInlined
}
