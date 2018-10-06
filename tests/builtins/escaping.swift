public func test(_ predicate: (Int) -> Bool) -> Bool {
    return withoutActuallyEscaping(predicate) { escapablePredicate in
    	escapablePredicate(42)
    }
}
