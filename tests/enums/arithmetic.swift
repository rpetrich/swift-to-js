public enum ArithmeticExpression {
    case number(Double)
    indirect case addition(ArithmeticExpression, ArithmeticExpression)
    indirect case multiplication(ArithmeticExpression, ArithmeticExpression)
}

public func literal(_ value: Double) -> ArithmeticExpression {
	return .number(value)
}

public func add(_ left: ArithmeticExpression, _ right: ArithmeticExpression) -> ArithmeticExpression {
	return .addition(left, right)
}

public func multiply(_ left: ArithmeticExpression, _ right: ArithmeticExpression) -> ArithmeticExpression {
	return .multiplication(left, right)
}

public func eval(_ expression: ArithmeticExpression) -> Double {
	switch expression {
		case .number(let value):
			return value
		case .addition(let l, let r):
			return eval(l) + eval(r)
		case .multiplication(let l, let r):
			return eval(l) * eval(r)
	}
}

public func silly(_ expression: ArithmeticExpression) -> Double {
	switch expression {
		case .number(var value):
			value += 10
			return value
		case .addition(var l, _):
			l = literal(10)
			return eval(l)
		default:
			return 0
	}
}
