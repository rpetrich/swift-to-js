public class Foo {
}

public func callExtended(_ foo: Foo, callback: () -> Bool) -> Bool {
	return withExtendedLifetime(foo, callback)
}
