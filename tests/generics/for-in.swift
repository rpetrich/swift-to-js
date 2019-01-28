public func sum<T: AdditiveArithmetic>(array: [T]) -> T {
	var result = T.zero
	for element in array {
		result += element
	}
	return result
}
