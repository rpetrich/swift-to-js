public class Deinit {
	init() {
		print("init called")				
	}
	deinit {
		print("deinit called")				
	}
}

public func allocate() -> Deinit {
	return Deinit()
}
