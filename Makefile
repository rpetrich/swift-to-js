SWIFT = xcrun swiftc
#SWIFT = ../swift-source/build/Ninja-RelWithDebInfoAssert/swift-macosx-x86_64/bin/swiftc
FAKE_TARGET = i386-apple-ios7.0
FAKE_SDK = ~/Downloads/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator.sdk
CLOSURE_FORMATTING = PRETTY_PRINT

all: test.swift-min.js

clean:
	rm -f *.sil *.sil.ast *.swift.js *.swift-min.js

test: test.swift.js
	node tests.js

.PHONY: all clean test

%.sil: %.swift Makefile
	$(SWIFT) -emit-sil -g -Ounchecked -parse-as-library --target=$(FAKE_TARGET) -sdk $(FAKE_SDK) -Xfrontend -disable-objc-interop -module-name="$*" "$<" -o "$@"

%.sil.ast: %.swift Makefile
	$(SWIFT) -print-ast -g -Ounchecked -parse-as-library --target=$(FAKE_TARGET) -sdk $(FAKE_SDK) -Xfrontend -disable-objc-interop -module-name="$*" "$<" > "$@"

%.swift.js: %.sil %.sil.ast src/*.js
	node src/swift-to-js.js --ast "$<.ast" --sil "$<" --output "$@"

%.swift-min.js: %.swift.js closure-compiler.jar externs.js
	java -jar closure-compiler.jar --js "$<" --externs externs.js --compilation_level ADVANCED_OPTIMIZATIONS --warning_level VERBOSE --formatting $(CLOSURE_FORMATTING) --js_output_file "$@"

closure-compiler/compiler-latest.zip:
	mkdir -p closure-compiler
	( pushd closure-compiler && curl -O 'https://dl.google.com/closure-compiler/compiler-latest.zip' )

closure-compiler/COPYING: closure-compiler/compiler-latest.zip
	unzip closure-compiler/compiler-latest.zip -d closure-compiler && touch closure-compiler/COPYING

closure-compiler.jar: closure-compiler/COPYING
	@ln -sf closure-compiler/closure-compiler-v*.jar closure-compiler.jar
