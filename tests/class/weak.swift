public class WeakSelf {
	weak var property: WeakSelf?
	init() {
	}
}

public func allocate() -> WeakSelf {
	let result = WeakSelf()
	result.property = result
	return result
}

public func read(weakSelf: WeakSelf) -> WeakSelf? {
	return weakSelf.property
}
