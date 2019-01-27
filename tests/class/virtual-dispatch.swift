public class Foo {
	public func virtualCall(passthrough: Bool) -> String {
		return "Foo"
	}
	public final func staticCall() -> String {
		return "Static"
	}
}

public class Bar: Foo  {
	public override func virtualCall(passthrough: Bool) -> String {
		if (passthrough) {
			return super.virtualCall(passthrough: passthrough)
		} else {
			return "Bar"
		}
	}
	public final func newMethod() -> String {
		return "New method called on Bar"
	}
}

public func makeVirtualCall(onFoo foo: Foo, passthrough: Bool) -> String {
	return "Result: " + foo.virtualCall(passthrough: passthrough)
}

public func makeVirtualCall(onBar bar: Bar, passthrough: Bool) -> String {
	return "Result: " + bar.virtualCall(passthrough: passthrough)
}

public func makeStaticCall(onFoo foo: Foo) -> String {
	return "Result: " + foo.staticCall()
}

public func makeStaticCall(onBar bar: Bar) -> String {
	return "Result: " + bar.staticCall()
}

public func isBar(foo: Foo) -> Bool {
	return foo is Bar
}

public func makeCastAndCall(onFoo foo: Foo) -> String {
	if let bar = foo as? Bar {
		return bar.newMethod()
	} else {
		return "Not a Bar"
	}
}
