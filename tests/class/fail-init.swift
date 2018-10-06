public class Possible {
	let foo: Int = 0
	init?(successfully: Bool) {
		if (!successfully) {
			return nil
		}
	}
	init() {
	}
}

public func allocate(successfully: Bool) -> Possible? {
	return Possible(successfully: successfully)
}

public func allocateAlways() -> Possible? {
	return Possible()
}
