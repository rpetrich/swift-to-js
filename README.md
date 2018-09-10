swift-to-js
===========
This is an experimental JavaScript backend for the standard Swift compiler. It's not ready for even beta use yet as much of the language is missing.

Installation
------------
#### Install Swift
Choose and install a compatible Swift development snapshot from [swift.org/downloads](https://swift.org/downloads). [2018-08-26](https://swift.org/builds/development/xcode/swift-DEVELOPMENT-SNAPSHOT-2018-08-26-a/swift-DEVELOPMENT-SNAPSHOT-2018-08-26-a-osx.pkg)'s snapshot build is known to be compatible. For macOS, the latest Xcode is required.

#### Install Node & NPM
You know what to do...

#### Clone and run the project
```bash
$ git clone git@github.com:rpetrich/swift-to-js.git
$ cd swift-to-js
$ npm install
$ npm run build
$ node . test.swift
```

#### Run the tests
```bash
$ npm test
```

## Development Notes
Approach used in swift-to-js is to translate the AST produced by `swiftc -dump-ast -- file.swift` incrementally using the type information provided by the compiler at each step to determine how to translate. Walking each AST node produces a partially-translated value on which peephole optimization can be performed before baking into the node to insert into an ever-growing babylon AST. Generated code uses ES6 features including module syntax. Basic support for tracing of source has been implemented, but not integrated with Babel's source map support.

It relies heavily on swiftc's proper pretty-printing of the AST. As the AST isn't documented or supported and changes from version-to-version—staying up to date with the latest swift releases may prove a chore! PEG grammars are provided for swift's pretty-printed AST, declaration reference syntax, and type declaration syntax. These were built piecemeal by examining output from the compiler and likely aren't exhaustive. Similarly, many details of the standard library's internal structure must be replicated directly and can drift from upstream.

Types are categorized into simple value types, complex value types and reference types. Simple value types are mapped directly to a single primitive type in JavaScript. Many Swift types share the same JavaScript types, and appropriate conversion/checking/boxing code is integrated when values are converted between types. Complex types are deep copied by value whenever they are returned or assigned into another value, including when inside data structures or wrapper types. Reference types will be implemented as ES6 classes (was in previous SSA-based implementation)

Simple value types are represented as the closest JavaScript equivalent. `Bool` becomes `boolean`, `Double` becomes `number` and `String` becomes `string`. Similarly, `Int`, `Float`, and `UInt` also become number, and optional runtime checks/conversions will performed automatically in future versions to ensure values stay in the proper ranges.

Structs are represented as JavaScript objects containing the appropriate fields and are automatically copied when necessary to preserve Swift's semantics. Much work has been undergone to remove as many superfluous copies as possible. Empty structs are represented as `undefined` and unary structs are represented as the underlying value. This is so that wrapper and trait-only types can have no overhead.

Basic support for consuming generic APIs is implemented (via `Optional`, `Array`, `Dictionary` and their associated types). Generic methods/functions in the standard library are currently implemented in an unsafe way where they assume array representations, rather than doing type specialization. Plan is to support only compile-time specialization for the initial pass, and then move onto supporting witness tables.

Optionals are implemented by representing `.none` as `null` and `.some(T)` as the underlying value for `T`. `null` as chosen instead of `undefined` somewhat arbitrarily. Nested optionals are implemented by boxing inside an array to avoid the ambiguity between `.none` and `.some(.none)`. `Bool??.none` becomes `[]`, `Bool??.some(Bool?.none)` becomes `[null]`, `Bool??.some(Bool?.some(true))` becomes `[true]`. Basic optimization for certain optional operations is implemented.

Tuples are implemented as arrays of the appropriate length, except unary tuples are represented as the underlying value and empty tuples (the unit type) are represented as `undefined`. Tuples are considered a complex value type and will be deep copied as use demands. Tuples containing only simple values are optimized into `.slice()` calls.

Array types are implemented as JavaScript arrays, with deep copying of embedded value types implemented if necessary. All array operations are bounds-checked with panics when the array is accessed outside its range—reads are allowed within the bounds and writes are allowed one passed the end.

Dictionary types are implemented as a JavaScript object and support only primitive keys. For non-string keys, appropriate conversion functions are implemented when reading keys. swift-to-js may migrate to using ES6 Maps for some types, but will need a custom map to support compound value types as keys.

Simple enums are implemented as a number representing each case. Enums that contain fields are implemented as an array with the first element representing the discriminant index and case fields stored starting at element index 1. If any field of any case requires copying a deep copy helper will be emitted for every assignment, otherwise a simple call to `slice`. In the future it may be possible that enums containing values with disjoint representations could even be stored unboxed. This requires more research.

Exceptions will be implemented as normal JavaScript exceptions and try/catch blocks (was in previous SSA-based implementation). Panics are, unfortunately, also implemented as exceptions leading to collisions in any code that recovers from an exception.

Constructors, private functions, any functions that call themselves recursively, and any library functions implemented in `builtins.ts` not marked with `noinline` will be inlined into calling functions. This avoids some amount of code bloat with swift's wrapper type functions present in the AST and allows copies of complex value types to be elided. In the future, better inlining decisions can be made.

`inout` parameters are supported only in cases where the callee is inlined. Intention is to add support for boxed representations of simple value types or of a different calling convention for `inout` parameters that copies the new value into the destination when the caller resumes.

Destructors aren't supported and won't ever be due to JavaScript's GC model. Intention is to abort compilation if any complex/impure destructors are discovered in the generated AST. 

Weak references are converted to strong references due to JavaScript's GC model and lack of support for weak references.

Names are mangled based on a few simple rules. Symbols that aren't supported in JavaScript identifiers are converted to `$name$` format. For example, the `==` function is converted to `$equals$$equals$`. Method/function names are mangled to include all named arguments separated by `$`. Internal helper functions are always prefixed by a `$` symbol, because `$` obviously represents Swift.

Source maps are produced by populating the bablyon AST's `loc` properties with data the Swift compiler includes in it's AST's `range` properties. When peephole optimizations remove operations, the inner-most source location is generally preserved. Mapping information will be missing on purely generated code and any code inlined from standard library functions.