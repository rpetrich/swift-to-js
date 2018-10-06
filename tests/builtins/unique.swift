public class Foo {
}

public func isUnique(_ foo: inout Foo) -> Bool {
	return isKnownUniquelyReferenced(&foo)
}
