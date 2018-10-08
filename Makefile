all: dist/swift-to-js.js dist/ast.js dist/types.js dist/declaration.js

clean:
	rm -rf dist/

test: all
	npm run test
	npm run lint

coverage: all
	npm run test:coverage

.PHONY: all clean test


dist/:
	mkdir -p dist/

dist/swift-to-js.js: dist/ package.json *.ts
	npm run build:ts

dist/ast.js: dist/ ast.pegjs
	npm run build:ast

dist/types.js: dist/ types.pegjs
	npm run build:types

dist/declaration.js: dist/ declaration.pegjs
	npm run build:declaration
