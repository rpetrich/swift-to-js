public func callAndDiscard(_ predicate: (Int) -> Bool) {
    _ = withoutActuallyEscaping(predicate) { escapablePredicate in
    	escapablePredicate(42)
    }
}
