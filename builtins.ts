import { noinline, returnType, wrapped } from "./functions";
import { copyValue, expressionSkipsCopy, field, Field, FunctionMap, inheritLayout, PossibleRepresentation, primitive, ReifiedType, reifyType, struct } from "./reified";
import { emitScope, mangleName, newScope, rootScope, Scope, uniqueIdentifier } from "./scope";
import { parse as parseType, Type } from "./types";
import { expectLength } from "./utils";
import { ArgGetter, call, callable, expr, ExpressionValue, functionValue, hoistToIdentifier, isNestedOptional, read, reuseExpression, set, statements, stringifyType, tuple, unbox, undefinedValue, Value, variable } from "./values";

import { arrayExpression, assignmentExpression, binaryExpression, blockStatement, booleanLiteral, callExpression, conditionalExpression, Expression, expressionStatement, functionExpression, identifier, Identifier, ifStatement, isLiteral, logicalExpression, memberExpression, newExpression, nullLiteral, NullLiteral, numericLiteral, objectExpression, returnStatement, Statement, stringLiteral, thisExpression, ThisExpression, throwStatement, unaryExpression, variableDeclaration, variableDeclarator } from "babel-types";

function returnOnlyArgument(scope: Scope, arg: ArgGetter): Value {
	return arg(0);
}

function returnThis(scope: Scope, arg: ArgGetter): Value {
	return arg("this");
}

function returnTodo(scope: Scope, arg: ArgGetter, type: Type, name: string): Value {
	console.log(name);
	return call(expr(mangleName("todo_missing_builtin$" + name)), undefinedValue, [], scope);
}

function returnLength(scope: Scope, arg: ArgGetter): Value {
	const arg0 = arg(0);
	return arg0.kind === "direct" ? variable(read(arg0, scope)) : expr(read(arg0, scope));
}

function binaryBuiltin(operator: "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "&" | "|" | "^" | "==" | "===" | "!=" | "!==") {
	return wrapped((scope: Scope, arg: ArgGetter) => expr(binaryExpression(operator, read(arg(0), scope), read(arg(1), scope))));
}

function assignmentBuiltin(operator: "=" | "+=" | "-=" | "*=" | "/=" | "|=" | "&=") {
	return wrapped((scope: Scope, arg: ArgGetter) => set(arg(0), arg(1), scope, operator));
}

const voidType: Type = { kind: "tuple", types: [] };

export const forceUnwrapFailed: Value = functionValue("Swift.(swift-to-js).forceUnwrapFailed()", undefined, { kind: "function", arguments: voidType, return: voidType, throws: true, rethrows: false, attributes: [] });

export const defaultTypes: { [name: string]: (globalScope: Scope, typeParameters: ReadonlyArray<Type>) => ReifiedType } = {
	"Bool": () => primitive(PossibleRepresentation.Boolean, expr(booleanLiteral(false)), [], {
		"init(_builtinBooleanLiteral:)": wrapped(returnOnlyArgument),
		"_getBuiltinLogicValue()": (scope, arg, type) => callable(() => arg(0), returnType(type)),
		"&&": wrapped((scope, arg) => expr(logicalExpression("&&", read(arg(0), scope), read(call(arg(1), undefinedValue, [], scope), scope)))),
		"||": wrapped((scope, arg) => expr(logicalExpression("||", read(arg(0), scope), read(call(arg(1), undefinedValue, [], scope), scope)))),
	}),
	"SignedNumeric": () => primitive(PossibleRepresentation.Number, expr(numericLiteral(0)), [], {
		"-": wrapped((scope, arg) => expr(unaryExpression("-", read(arg(0), scope)))),
	}),
	"Int": () => primitive(PossibleRepresentation.Number, expr(numericLiteral(0)), [], {
		"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument),
		"+": binaryBuiltin("+"),
		"-": binaryBuiltin("-"),
		"*": binaryBuiltin("*"),
		"/": (scope, arg) => expr(binaryExpression("|", binaryExpression("/", read(arg(0), scope), read(arg(1), scope)), numericLiteral(0))),
		"%": binaryBuiltin("%"),
		"<": binaryBuiltin("<"),
		">": binaryBuiltin(">"),
		"<=": binaryBuiltin("<="),
		">=": binaryBuiltin(">="),
		"&": binaryBuiltin("&"),
		"|": binaryBuiltin("|"),
		"^": binaryBuiltin("^"),
		"==": binaryBuiltin("==="),
		"!=": binaryBuiltin("!=="),
		"+=": assignmentBuiltin("+="),
		"-=": assignmentBuiltin("-="),
		"*=": assignmentBuiltin("*="),
	}),
	"Int64": () => primitive(PossibleRepresentation.Number, expr(numericLiteral(0))),
	"FloatingPoint": () => primitive(PossibleRepresentation.Number, expr(numericLiteral(0)), [], {
		"==": binaryBuiltin("==="),
		"!=": binaryBuiltin("!=="),
		"squareRoot()": (scope, arg, type) => callable(() => expr(callExpression(memberExpression(identifier("Math"), identifier("sqrt")), [read(arg(0), scope)])), returnType(type)),
	}),
	"Float": () => primitive(PossibleRepresentation.Number, expr(numericLiteral(0)), [], {
		"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument),
		"+": binaryBuiltin("+"),
		"-": binaryBuiltin("-"),
		"*": binaryBuiltin("*"),
		"/": binaryBuiltin("/"),
		"%": binaryBuiltin("%"),
		"<": binaryBuiltin("<"),
		">": binaryBuiltin(">"),
		"<=": binaryBuiltin("<="),
		">=": binaryBuiltin(">="),
		"&": binaryBuiltin("&"),
		"|": binaryBuiltin("|"),
		"^": binaryBuiltin("^"),
		"==": binaryBuiltin("==="),
		"!=": binaryBuiltin("!=="),
		"+=": assignmentBuiltin("+="),
		"-=": assignmentBuiltin("-="),
		"*=": assignmentBuiltin("*="),
		"/=": assignmentBuiltin("/="),
	}),
	"Double": () => primitive(PossibleRepresentation.Number, expr(numericLiteral(0)), [], {
		"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument),
		"+": binaryBuiltin("+"),
		"-": binaryBuiltin("-"),
		"*": binaryBuiltin("*"),
		"/": binaryBuiltin("/"),
		"%": binaryBuiltin("%"),
		"<": binaryBuiltin("<"),
		">": binaryBuiltin(">"),
		"<=": binaryBuiltin("<="),
		">=": binaryBuiltin(">="),
		"&": binaryBuiltin("&"),
		"|": binaryBuiltin("|"),
		"^": binaryBuiltin("^"),
		"==": binaryBuiltin("==="),
		"!=": binaryBuiltin("!=="),
		"+=": assignmentBuiltin("+="),
		"-=": assignmentBuiltin("-="),
		"*=": assignmentBuiltin("*="),
		"/=": assignmentBuiltin("/="),
	}),
	"String": (globalScope, typeParameters) => {
		const UnicodeScalarView = primitive(PossibleRepresentation.Array, expr(arrayExpression([])), [
			field("count", reifyType("Int", globalScope), (value, scope) => expr(memberExpression(read(value, scope), identifier("length")))),
			field("startIndex", reifyType("Int64", globalScope), (value, scope) => expr(numericLiteral(0))),
			field("endIndex", reifyType("Int64", globalScope), (value, scope) => expr(memberExpression(read(value, scope), identifier("length")))),
		]);
		const UTF16View = primitive(PossibleRepresentation.String, expr(stringLiteral("")), [
			field("count", reifyType("Int", globalScope), (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
			field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => expr(numericLiteral(0))),
			field("endIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
		]);
		const UTF8View = primitive(PossibleRepresentation.Array, expr(arrayExpression([])), [
			field("count", reifyType("Int", globalScope), (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
			field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => expr(numericLiteral(0))),
			field("endIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
		]);
		return primitive(PossibleRepresentation.String, expr(stringLiteral("")), [
			field("unicodeScalars", UnicodeScalarView, (value, scope) => call(expr(memberExpression(identifier("Array"), identifier("from"))), undefinedValue, [value], scope)),
			field("utf16", UTF16View, (value) => value),
			field("utf8", UTF8View, (value, scope) => call(expr(memberExpression(newExpression(identifier("TextEncoder"), [stringLiteral("utf-8")]), identifier("encode"))), undefinedValue, [value], scope)),
		], {
			"init": wrapped((scope, arg) => call(expr(identifier("String")), undefinedValue, [arg(0)], scope)),
			"+": binaryBuiltin("+"),
			"lowercased()": (scope, arg, type) => callable(() => call(expr(memberExpression(read(arg(0), scope), identifier("toLowerCase"))), undefinedValue, [], scope), returnType(type)),
			"uppercased()": (scope, arg, type) => callable(() => call(expr(memberExpression(read(arg(0), scope), identifier("toUpperCase"))), undefinedValue, [], scope), returnType(type)),
		}, {
			"UnicodeScalarView": () => UnicodeScalarView,
			"UTF16View": () => UTF16View,
			"UTF8View": () => UTF8View,
		});
	},
	"Optional": (globalScope, typeParameters) => {
		expectLength(typeParameters, 1);
		const reified = reifyType(typeParameters[0], globalScope);
		const optionalType: Type = { kind: "optional", type: typeParameters[0] };
		return {
			fields: [],
			functions: {
				"none": (scope, arg, type) => expr(emptyOptional(optionalType)),
				"some": wrapped((scope, arg, type) => wrapInOptional(arg(0, "wrapped"), optionalType, scope)),
				"==": binaryBuiltin("==="), // TODO: Fix to use proper comparator for internal type
				"!=": binaryBuiltin("!=="), // TODO: Fix to use proper comparator for internal type
				"flatMap": returnTodo,
			},
			possibleRepresentations: PossibleRepresentation.Array,
			defaultValue() {
				return expr(emptyOptional(typeParameters[0]));
			},
			copy: reified.copy || isNestedOptional(optionalType) ? (value, scope) => {
				const expression = read(value, scope);
				if (expressionSkipsCopy(expression)) {
					return expr(expression);
				}
				if (reified.copy) {
					// Nested optionals require special support since they're stored as [] for .none, [null] for .some(.none) and [v] for .some(.some(v))
					const [first, after] = reuseExpression(expression, scope);
					return expr(conditionalExpression(
						optionalIsNone(first, optionalType),
						emptyOptional(optionalType),
						read(wrapInOptional(reified.copy(expr(after), scope), optionalType, scope), scope),
					));
				} else if (isNestedOptional(optionalType)) {
					// Nested Optionals of simple value are sliced
					return expr(callExpression(memberExpression(expression, identifier("slice")), []));
				} else {
					// Optionals of simple value are passed through
					return value;
				}
			} : undefined,
			innerTypes: {},
		};
	},
	// Should be represented as an empty struct, but we currently
	"_OptionalNilComparisonType": () => primitive(PossibleRepresentation.Null, expr(nullLiteral()), [], {
		"init(nilLiteral:)": wrapped((scope, arg, type) => expr(nullLiteral())),
	}),
	"Array": (globalScope, typeParameters) => {
		expectLength(typeParameters, 1);
		const reified = reifyType(typeParameters[0], globalScope);
		return {
			fields: [
				field("count", reifyType("Int", globalScope), (value, scope) => expr(memberExpression(read(value, scope), identifier("length")))),
			],
			functions: {
				init: wrapped((scope, arg) => call(expr(memberExpression(identifier("Array"), identifier("from"))), undefinedValue, [arg(0)], scope)),
				count: returnLength,
				subscript: {
					get(scope, arg, type) {
						const array = hoistToIdentifier(read(arg(0, "array"), scope), scope, "array");
						const index = hoistToIdentifier(read(arg(1, "index"), scope), scope, "index");
						return statements([
							arrayBoundsCheck(array, index),
							returnStatement(memberExpression(array, index, true)),
						]);
					},
					set(scope, arg, type) {
						const array = hoistToIdentifier(read(arg(0, "array"), scope), scope, "array");
						const index = hoistToIdentifier(read(arg(1, "index"), scope), scope, "index");
						const value = hoistToIdentifier(read(arg(2, "value"), scope), scope, "value");
						return statements([
							arrayBoundsCheck(array, index),
							returnStatement(assignmentExpression("=", memberExpression(array, index, true), value)),
						]);
					},
				},
			},
			possibleRepresentations: PossibleRepresentation.Array,
			defaultValue() {
				return expr(arrayExpression([]));
			},
			copy(value, scope) {
				const expression = read(value, scope);
				if (expressionSkipsCopy(expression)) {
					return expr(expression);
				}
				if (reified.copy) {
					// Arrays of complex types are mapped using a generated copy function
					const id = uniqueIdentifier(scope, "value");
					const converter = functionExpression(undefined, [id], blockStatement([returnStatement(read(reified.copy(expr(id), scope), scope))]));
					return expr(callExpression(memberExpression(expression, identifier("map")), [converter]));
				} else {
					// Simple arrays are sliced
					return expr(callExpression(memberExpression(expression, identifier("slice")), []));
				}
			},
			innerTypes: {},
		};
	},
	"Dictionary": (globalScope, typeParameters) => {
		expectLength(typeParameters, 2);
		const [ keyType, valueType ] = typeParameters;
		const possibleKeyType: Type = { kind: "optional", type: keyType };
		const possibleValueType: Type = { kind: "optional", type: valueType };
		const reifiedKeyType = reifyType(keyType, globalScope);
		const reifiedValueType = reifyType(valueType, globalScope);
		function objectDictionaryImplementation(converter?: Identifier): ReifiedType {
			const reifiedKeysType = reifyType({ kind: "array", type: keyType }, globalScope);
			return {
				fields: [
					field("count", reifyType("Int", globalScope), (value, scope) => expr(memberExpression(callExpression(memberExpression(identifier("Object"), identifier("keys")), [read(value, scope)]), identifier("length")))),
					field("keys", reifiedKeysType, (value: Value, scope: Scope) => {
						return expr(callExpression(memberExpression(identifier("Object"), identifier("keys")), [read(value, scope)]));
					}),
				],
				functions: {
					subscript: {
						get(scope, arg, type) {
							const dict = hoistToIdentifier(read(arg(0, "dict"), scope), scope, "dict");
							const index = hoistToIdentifier(read(arg(1, "index"), scope), scope, "index");
							return expr(conditionalExpression(
								callExpression(
									memberExpression(
										memberExpression(
											identifier("Object"),
											identifier("hasOwnProperty"),
										),
										identifier("call"),
									),
									[dict, index],
								),
								read(wrapInOptional(copyValue(expr(memberExpression(dict, index, true)), valueType, scope), possibleValueType, scope), scope),
								emptyOptional(possibleValueType),
							));
						},
						set(scope, arg, type) {
							const dict = hoistToIdentifier(read(arg(0, "dict"), scope), scope, "dict");
							const index = hoistToIdentifier(read(arg(1, "index"), scope), scope, "index");
							const valueExpression = read(arg(2, "value"), scope);
							const remove = unaryExpression("delete", memberExpression(dict, index, true));
							if (valueType.kind === "optional") {
								if (valueExpression.type === "ArrayExpression" && valueExpression.elements.length === 0) {
									return expr(remove);
								}
							} else {
								if (valueExpression.type === "NullLiteral") {
									return expr(remove);
								}
							}
							if (isLiteral(valueExpression) || valueExpression.type === "ArrayExpression" || valueExpression.type === "ObjectExpression") {
								return expr(assignmentExpression("=", memberExpression(dict, index, true), valueExpression));
							}
							const hoistedValue = hoistToIdentifier(valueExpression, scope, "value");
							return expr(conditionalExpression(
								optionalIsSome(hoistedValue, possibleValueType),
								assignmentExpression("=", memberExpression(dict, index, true), read(copyValue(unwrapOptional(expr(hoistedValue), possibleValueType, scope), valueType, scope), scope)),
								remove,
							));
						},
					},
				},
				possibleRepresentations: PossibleRepresentation.Object,
				defaultValue() {
					return expr(objectExpression([]));
				},
				copy(value, scope) {
					const expression = read(value, scope);
					if (expressionSkipsCopy(expression)) {
						return expr(expression);
					}
					if (reifiedValueType.copy) {
						throw new TypeError(`Copying dictionaries with non-simple values is not yet implemented!`);
					}
					return expr(callExpression(memberExpression(identifier("Object"), identifier("assign")), [objectExpression([]), expression]));
				},
				innerTypes: {
					Keys: () => {
						return inheritLayout(reifiedKeysType, [
							field("count", reifyType("Int", globalScope), (value: Value, scope: Scope) => {
								return expr(memberExpression(read(value, scope), identifier("length")));
							}),
							field("endIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => {
								return expr(memberExpression(read(value, scope), identifier("length")));
							}),
							field("first", reifyType(possibleKeyType, globalScope), (value: Value, scope: Scope) => {
								const [first, after] = reuseExpression(read(value, scope), scope);
								const stringKey = memberExpression(after, numericLiteral(0), true);
								const convertedKey = typeof converter !== "undefined" ? callExpression(converter, [stringKey]) : stringKey;
								return expr(conditionalExpression(memberExpression(first, identifier("length")), read(wrapInOptional(expr(convertedKey), possibleKeyType, scope), scope), emptyOptional(possibleKeyType)));
							}),
							field("isEmpty", reifyType("Bool", globalScope), (value: Value, scope: Scope) => {
								return expr(binaryExpression("!==", memberExpression(read(value, scope), identifier("length")), numericLiteral(0)));
							}),
							field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => {
								return expr(numericLiteral(0));
							}),
							field("underestimatedCount", reifyType("Int", globalScope), (value: Value, scope: Scope) => {
								return expr(memberExpression(read(value, scope), identifier("length")));
							}),
						]);
					},
				},
			};
		}
		switch (reifiedKeyType.possibleRepresentations) {
			case PossibleRepresentation.String:
				return objectDictionaryImplementation();
			case PossibleRepresentation.Boolean:
				return objectDictionaryImplementation(identifier("Boolean"));
			case PossibleRepresentation.Number:
				return objectDictionaryImplementation(identifier("Number"));
			default:
				throw new Error(`No dictionary implementation for keys of type ${stringifyType(keyType)}`);
		}
	},
	"Collection": (globalScope, typeParameters) => primitive(PossibleRepresentation.Array, expr(arrayExpression([])), [
		field("count", reifyType("Int", globalScope), (value, scope) => expr(memberExpression(read(value, scope), identifier("length")))),
	]),
};

export function emptyOptional(type: Type) {
	return isNestedOptional(type) ? arrayExpression([]) : nullLiteral();
}

export function wrapInOptional(value: Value, type: Type, scope: Scope) {
	return isNestedOptional(type) ? expr(arrayExpression([read(value, scope)])) : value;
}

export function unwrapOptional(value: Value, type: Type, scope: Scope) {
	if (isNestedOptional(type)) {
		return expr(memberExpression(read(value, scope), numericLiteral(0), true));
	}
	return value;
}

export function optionalIsNone(expression: Expression, type: Type): Expression {
	if (isNestedOptional(type)) {
		return binaryExpression("===", memberExpression(expression, identifier("length")), numericLiteral(0));
	}
	return binaryExpression("===", expression, nullLiteral());
}

export function optionalIsSome(expression: Expression, type: Type): Expression {
	if (isNestedOptional(type)) {
		return binaryExpression("!==", memberExpression(expression, identifier("length")), numericLiteral(0));
	}
	return binaryExpression("!==", expression, nullLiteral());
}

function arrayBoundsCheck(array: Identifier | ThisExpression, index: Identifier | ThisExpression): Statement {
	return ifStatement(
		logicalExpression(
			"||",
			binaryExpression(">=", index, memberExpression(array, identifier("length"))),
			binaryExpression("<", index, numericLiteral(0)),
		),
		throwStatement(newExpression(identifier("RangeError"), [stringLiteral("Array index out of range")])),
	);
}

export const functions: FunctionMap = {
	"Swift.(swift-to-js).forceUnwrapFailed()": noinline((scope, arg) => statements([throwStatement(newExpression(identifier("TypeError"), [stringLiteral("Unexpectedly found nil while unwrapping an Optional value")]))])),
	"Sequence.reduce": (scope, arg, type) => callable((innerScope, innerArg) => {
		return call(expr(identifier("Sequence$reduce")), undefinedValue, [arg(0)], scope);
	}, returnType(type)),
	"Strideable....": wrapped((scope, arg) => expr(arrayExpression([read(arg(0), scope), read(arg(1), scope)]))),
	"Collection.count": returnLength,
	"Collection.map": (scope, arg) => expr(callExpression(memberExpression(memberExpression(arrayExpression([]), identifier("map")), identifier("bind")), [read(arg(0), scope)])),
	"BidirectionalCollection.joined(separator:)": (scope, arg) => expr(callExpression(memberExpression(read(arg("this"), scope), identifier("join")), [read(arg(0), scope)])),
	"??": returnTodo,
	"~=": (scope, arg) => expr(binaryExpression("===", read(arg(0), scope), read(arg(1), scope))),
	"print(_:separator:terminator:)": (scope, arg, type) => call(expr(memberExpression(identifier("console"), identifier("log"))), undefinedValue, [arg(0, "items")], scope),
};

export function newScopeWithBuiltins(): Scope {
	return {
		name: "global",
		declarations: Object.create(null),
		types: Object.assign(Object.create(null), defaultTypes),
		functions: Object.assign(Object.create(null), functions),
		functionUsage: Object.create(null),
		mapping: Object.create(null),
		parent: undefined,
	};
}
