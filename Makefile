all: test.min.js

clean:
	rm -f *.sil.swift
	rm -f *.js

%.sil.swift: %.swift
	xcrun -sdk iphonesimulator swiftc -emit-sil -gnone -Ounchecked -parse-as-library --target=i386-apple-ios7.0 -module-name="$*" "$<" -o "$@"

%.js: %.sil.swift src/*.js
	node src/swift-to-js.js "$@" < "$<"

%.min.js: %.js
	java -jar closure-compiler.jar --js "$<" --compilation_level ADVANCED_OPTIMIZATIONS --warning_level VERBOSE --js_output_file "$@"
