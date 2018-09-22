import { noinline, returnFunctionType, returnType, wrapped } from "./functions";
import { parseFunctionType, parseType } from "./parse";
import { expressionSkipsCopy, field, Field, FunctionMap, getField, inheritLayout, PossibleRepresentation, primitive, protocol, ProtocolConformance, ReifiedType, reifyType, struct, TypeParameterHost } from "./reified";
import { emitScope, mangleName, newScope, rootScope, Scope, uniqueIdentifier } from "./scope";
import { Function, Tuple, Type } from "./types";
import { cached, expectLength, lookupForMap } from "./utils";
import { ArgGetter, array, call, callable, copy, expr, ExpressionValue, functionValue, isNestedOptional, literal, read, reuseExpression, set, simplify, statements, stringifyType, tuple, typeFromValue, typeValue, undefinedValue, update, Value, valueOfExpression, variable } from "./values";

import { assignmentExpression, binaryExpression, blockStatement, callExpression, conditionalExpression, Expression, expressionStatement, functionExpression, identifier, Identifier, ifStatement, isLiteral, logicalExpression, memberExpression, newExpression, NullLiteral, returnStatement, Statement, thisExpression, ThisExpression, throwStatement, unaryExpression, variableDeclaration, variableDeclarator } from "babel-types";

function returnOnlyArgument(scope: Scope, arg: ArgGetter): Value {
	return arg(0, "value");
}

function returnThis(scope: Scope, arg: ArgGetter): Value {
	return arg("this");
}

function returnTodo(scope: Scope, arg: ArgGetter, type: Type, name: string): Value {
	console.error(name);
	return call(expr(mangleName("todo_missing_builtin$" + name)), undefinedValue, [], scope);
}

function returnLength(scope: Scope, arg: ArgGetter): Value {
	const arg0 = arg(0);
	return arg0.kind === "direct" ? variable(read(arg0, scope)) : expr(read(arg0, scope));
}

function binaryBuiltin(operator: "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "&" | "|" | "^" | "==" | "===" | "!=" | "!==", typeArgumentCount: number, valueChecker?: (value: Value, scope: Scope) => Value) {
	if (typeof valueChecker !== "undefined") {
		return wrapped((scope: Scope, arg: ArgGetter) => valueChecker(expr(binaryExpression(operator, read(arg(typeArgumentCount, "lhs"), scope), read(arg(typeArgumentCount + 1, "rhs"), scope))), scope));
	}
	return wrapped((scope: Scope, arg: ArgGetter) => expr(binaryExpression(operator, read(arg(typeArgumentCount, "lhs"), scope), read(arg(typeArgumentCount + 1, "rhs"), scope))));
}

function updateBuiltin(operator: "+" | "-" | "*" | "/" | "|" | "&", typeArgumentCount: number, valueChecker?: (value: Value, scope: Scope) => Value) {
	if (typeof valueChecker !== "undefined") {
		return wrapped((scope: Scope, arg: ArgGetter) => update(arg(typeArgumentCount, "target"), scope, (value) => valueChecker(expr(binaryExpression(operator, read(value, scope), read(arg(typeArgumentCount + 1, "value"), scope))), scope)));
	}
	return wrapped((scope: Scope, arg: ArgGetter) => set(arg(typeArgumentCount, "target"), arg(typeArgumentCount + 1, "value"), scope, operator + "=" as any));
}

const assignmentBuiltin = wrapped((scope: Scope, arg: ArgGetter) => set(arg(0, "target"), arg(1, "value"), scope));

const readLengthField = (name: string, globalScope: Scope) => field("count", reifyType("Int", globalScope), (value, scope) => {
	return expr(memberExpression(read(value, scope), identifier("length")));
});

const isEmptyFromLength = (globalScope: Scope) => field("isEmpty", reifyType("Bool", globalScope), (value, scope) => {
	return expr(binaryExpression("!==", memberExpression(read(value, scope), identifier("length")), literal(0)));
});

const startIndexOfZero = (globalScope: Scope) => field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => {
	return expr(literal(0));
});

const voidType: Tuple = { kind: "tuple", types: [] };

export const forceUnwrapFailed: Value = functionValue("Swift.(swift-to-js).forceUnwrapFailed()", undefined, { kind: "function", arguments: voidType, return: voidType, throws: true, rethrows: false, attributes: [] });

function buildIntegerType(min: number, max: number, checked: boolean, wrap: (value: Value, scope: Scope) => Value): ReifiedType {
	const fields: Field[] = [];
	const range: NumericRange = { min: literal(min), max: literal(max) };
	const widerHigh: NumericRange = checked ? { min: literal(min), max: literal(max + 1) } : range;
	const widerLow: NumericRange = checked ? { min: literal(min - 1), max: literal(max) } : range;
	const widerBoth: NumericRange = checked ? { min: literal(min - 1), max: literal(max + 1) } : range;
	const integerTypeName = min < 0 ? "SignedInteger" : "UnsignedInteger";
	const integerType: ProtocolConformance = {
		"min"() {
			return expr(literal(min));
		},
		"max"() {
			return expr(literal(max));
		},
		"init": wrapped((scope, arg, type) => {
			expectLength(type.arguments.types, 1);
			const sourceType = typeFromValue(typeValue(type.arguments.types[0], integerTypeName), scope);
			return integerRangeCheck(
				scope,
				arg(0, "value"),
				rangeForNumericType(sourceType, scope),
				range,
			);
		}),
		"init(exactly:)": wrapped((scope, arg, type) => {
			expectLength(type.arguments.types, 1);
			const source = rangeForNumericType(typeFromValue(typeValue(type.arguments.types[0], integerTypeName), scope), scope);
			const requiresGreaterThanCheck = possiblyGreaterThan(source, range);
			const requiresLessThanCheck = possiblyLessThan(source, range);
			if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
				return arg(0, "value");
			}
			const [first, after] = reuseExpression(read(arg(0, "value"), scope), scope, "value");
			let check: Expression;
			if (requiresGreaterThanCheck && requiresLessThanCheck) {
				check = logicalExpression(
					"||",
					binaryExpression(">", first, range.min),
					binaryExpression("<", after, range.max),
				);
			} else if (requiresGreaterThanCheck) {
				check = binaryExpression(">", first, range.max);
			} else if (requiresLessThanCheck) {
				check = binaryExpression("<", first, range.min);
			} else {
				return arg(0, "value");
			}
			return expr(conditionalExpression(
				check,
				literal(null),
				after,
			));
		}),
		"&-": binaryBuiltin("-", 0, wrap),
	};
	const fixedWidthIntegerType: ProtocolConformance = {
		"&+": binaryBuiltin("+", 0, wrap),
		"&*": binaryBuiltin("*", 0, wrap),
	};
	const reifiedType: ReifiedType = {
		fields,
		functions: lookupForMap({
			"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument),
			"init(clamping:)": wrapped((scope, arg, type) => {
				expectLength(type.arguments.types, 1);
				const source = rangeForNumericType(typeFromValue(typeValue(type.arguments.types[0], "SignedInteger"), scope), scope);
				const requiresGreaterThanCheck = possiblyGreaterThan(source, range);
				const requiresLessThanCheck = possiblyLessThan(source, range);
				if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
					return arg(0, "value");
				}
				const [first, after] = reuseExpression(read(arg(0, "value"), scope), scope, "value");
				if (requiresGreaterThanCheck && requiresLessThanCheck) {
					return expr(conditionalExpression(
						binaryExpression(">", first, range.max),
						range.max,
						conditionalExpression(
							binaryExpression("<", after, range.min),
							range.min,
							after,
						),
					));
				} else if (requiresGreaterThanCheck) {
					return expr(conditionalExpression(
						binaryExpression(">", first, range.max),
						range.max,
						after,
					));
				} else {
					return expr(conditionalExpression(
						binaryExpression("<", first, range.min),
						range.min,
						after,
					));
				}
			}),
			"+": wrapped((scope, arg, type) => integerRangeCheck(scope, expr(binaryExpression("+", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope))), widerHigh, range)),
			"-": wrapped((scope, arg, type) => {
				if (type.arguments.types.length === 1) {
					if (min >= 0) {
						throw new TypeError(`Range does not permit negative values: ${min}...${max}`);
					}
					return integerRangeCheck(scope, expr(unaryExpression("-", read(arg(0, "value"), scope))), widerLow, range);
				}
				return integerRangeCheck(scope, expr(binaryExpression("-", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope))), widerLow, range);
			}),
			"*": wrapped((scope, arg, type) => integerRangeCheck(scope, expr(binaryExpression("*", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope))), widerBoth, range)),
			"/": (scope, arg) => expr(binaryExpression("|", binaryExpression("/", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope)), literal(0))),
			"%": binaryBuiltin("%", 0),
			"<": binaryBuiltin("<", 0),
			">": binaryBuiltin(">", 0),
			"<=": binaryBuiltin("<=", 0),
			">=": binaryBuiltin(">=", 0),
			"&": binaryBuiltin("&", 0),
			"|": binaryBuiltin("|", 0),
			"^": binaryBuiltin("^", 0),
			"==": binaryBuiltin("===", 0),
			"!=": binaryBuiltin("!==", 0),
			"+=": updateBuiltin("+", 0),
			"-=": updateBuiltin("-", 0),
			"*=": updateBuiltin("*", 0),
		} as FunctionMap),
		conformances: {
			[integerTypeName]: integerType,
			FixedWidthInteger: fixedWidthIntegerType,
			LosslessStringConvertible: {
			},
		},
		possibleRepresentations: PossibleRepresentation.Number,
		defaultValue() {
			return expr(literal(0));
		},
		innerTypes: {
			Type: cached(() => primitive(PossibleRepresentation.Object, expr(literal({})), [
				field("min", reifiedType, () => expr(literal(min))),
				field("max", reifiedType, () => expr(literal(max))),
			], {
			})),
		},
	};
	if (min < 0) {
		reifiedType.conformances.SignedNumeric = {
			"-": wrapped((scope, arg) => expr(unaryExpression("-", read(arg(0, "value"), scope)))),
		};
	}
	fields.push(field("hashValue", reifiedType, (value) => value));
	return reifiedType;
}

function buildFloatingType(): ReifiedType {
	const fields: Field[] = [];
	const reifiedType: ReifiedType = {
		fields,
		functions: lookupForMap({
			"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument),
			"+": wrapped((scope, arg, type) => expr(binaryExpression("+", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope)))),
			"-": wrapped((scope, arg, type) => {
				if (type.arguments.types.length === 1) {
					return expr(unaryExpression("-", read(arg(0, "value"), scope)));
				}
				return expr(binaryExpression("-", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope)));
			}),
			"*": wrapped((scope, arg, type) => expr(binaryExpression("*", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope)))),
			"/": wrapped((scope, arg, type) => expr(binaryExpression("/", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope)))),
			"%": binaryBuiltin("%", 0),
			"<": binaryBuiltin("<", 0),
			">": binaryBuiltin(">", 0),
			"<=": binaryBuiltin("<=", 0),
			">=": binaryBuiltin(">=", 0),
			"&": binaryBuiltin("&", 0),
			"|": binaryBuiltin("|", 0),
			"^": binaryBuiltin("^", 0),
			"+=": updateBuiltin("+", 0),
			"-=": updateBuiltin("-", 0),
			"*=": updateBuiltin("*", 0),
			"/=": updateBuiltin("/", 0),
		} as FunctionMap),
		conformances: {
			SignedNumeric: {
				"-": wrapped((scope, arg) => expr(unaryExpression("-", read(arg(0, "value"), scope)))),
			},
			FloatingPoint: {
				"==": binaryBuiltin("===", 0),
				"!=": binaryBuiltin("!==", 0),
				"squareRoot()": (scope, arg, type) => {
					const expression = read(arg(1, "value"), scope);
					return callable(() => expr(callExpression(memberExpression(identifier("Math"), identifier("sqrt")), [expression])), returnType(type));
				},
			},
		},
		possibleRepresentations: PossibleRepresentation.Number,
		defaultValue() {
			return expr(literal(0));
		},
		innerTypes: {
		},
	};
	fields.push(field("hashValue", reifiedType, (value) => value));
	return reifiedType;
}

function callSimpleMethod(protocolType: ReifiedType, methodName: string, scope: Scope) {
	const functionBuilder = protocolType.functions(methodName);
	if (typeof functionBuilder !== "function") {
		throw new TypeError(`Expected a function as a result of searching for simple method ${methodName}`);
	}
	return functionBuilder(scope, () => {
		throw new Error(`Did not expect to be called with arguments`);
	}, parseType("(Int) -> Int") as Function, methodName);
}

interface NumericRange {
	min: Expression;
	max: Expression;
}

function rangeForNumericType(type: ReifiedType, scope: Scope): NumericRange {
	const min = read(callSimpleMethod(type, "min", scope), scope);
	const max = read(callSimpleMethod(type, "max", scope), scope);
	return {
		min,
		max,
	};
}

function possiblyGreaterThan(left: NumericRange, right: NumericRange): boolean {
	const leftMax = valueOfExpression(left.max);
	const rightMax = valueOfExpression(right.max);
	return typeof leftMax !== "number" || typeof rightMax !== "number" || leftMax > rightMax;
}

function possiblyLessThan(left: NumericRange, right: NumericRange): boolean {
	const leftMin = valueOfExpression(left.min);
	const rightMin = valueOfExpression(right.min);
	return typeof leftMin !== "number" || typeof rightMin !== "number" || leftMin < rightMin;
}

function integerRangeCheck(scope: Scope, value: Value, source: NumericRange, dest: NumericRange) {
	const requiresGreaterThanCheck = possiblyGreaterThan(source, dest);
	const requiresLessThanCheck = possiblyLessThan(source, dest);
	if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
		return value;
	}
	const expression = read(value, scope);
	const constant = valueOfExpression(expression);
	const constantMin = valueOfExpression(dest.min);
	const constantMax = valueOfExpression(dest.max);
	if (typeof constant === "number" && typeof constantMin === "number" && typeof constantMax === "number" && constant >= constantMin && constant <= constantMax) {
		return expr(expression);
	}
	const [first, after] = reuseExpression(expression, scope, "integer");
	let check: Expression;
	if (requiresGreaterThanCheck && requiresLessThanCheck) {
		check = logicalExpression(
			"||",
			binaryExpression(">", first, dest.min),
			binaryExpression("<", after, dest.max),
		);
	} else if (requiresGreaterThanCheck) {
		check = binaryExpression(">", first, dest.max);
	} else {
		check = binaryExpression("<", first, dest.min);
	}
	return expr(conditionalExpression(
		check,
		read(call(functionValue("Swift.(swift-to-js).numericRangeFailed()", undefined, { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] }), undefinedValue, [], scope), scope),
		after,
	));
}

function integerThrowingInit(scope: Scope, arg: ArgGetter, type: Function, typeArgument: ReifiedType): Value {
	expectLength(type.arguments.types, 1);
	return integerRangeCheck(
		scope,
		arg(0, "value"),
		rangeForNumericType(reifyType(type.arguments.types[0], scope), scope),
		rangeForNumericType(typeArgument, scope),
	);
}

function integerOptionalInit(scope: Scope, arg: ArgGetter, type: Function, typeArgument: ReifiedType): Value {
	expectLength(type.arguments.types, 1);
	const source = rangeForNumericType(reifyType(type.arguments.types[0], scope), scope);
	const dest = rangeForNumericType(typeArgument, scope);
	const requiresGreaterThanCheck = possiblyGreaterThan(source, dest);
	const requiresLessThanCheck = possiblyLessThan(source, dest);
	if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
		return arg(0, "value");
	}
	const [first, after] = reuseExpression(read(arg(0, "value"), scope), scope, "value");
	let check: Expression;
	if (requiresGreaterThanCheck && requiresLessThanCheck) {
		check = logicalExpression(
			"||",
			binaryExpression(">", first, dest.min),
			binaryExpression("<", after, dest.max),
		);
	} else if (requiresGreaterThanCheck) {
		check = binaryExpression(">", first, dest.max);
	} else if (requiresLessThanCheck) {
		check = binaryExpression("<", first, dest.min);
	} else {
		return arg(0, "value");
	}
	return expr(conditionalExpression(
		check,
		literal(null),
		after,
	));
}

function forwardToTypeArgument(scope: Scope, arg: ArgGetter, type: Function, name: string) {
	const typeArg = arg(0, "type");
	return call(functionValue(name, typeArg, type), undefinedValue, [typeArg], scope);
}

function defaultTypes(checkedIntegers: boolean): { [name: string]: (globalScope: Scope, typeParameters: TypeParameterHost) => ReifiedType } {
	const BoolType = cached(() => primitive(PossibleRepresentation.Boolean, expr(literal(false)), [], {
		"init(_builtinBooleanLiteral:)": wrapped(returnOnlyArgument),
		"_getBuiltinLogicValue()": (scope, arg, type) => callable(() => arg(0, "literal"), parseType("() -> Int1")),
		"&&": wrapped((scope, arg) => expr(logicalExpression("&&", read(arg(0, "lhs"), scope), read(call(arg(1, "rhs"), undefinedValue, [], scope), scope)))),
		"||": wrapped((scope, arg) => expr(logicalExpression("||", read(arg(0, "lhs"), scope), read(call(arg(1, "rhs"), undefinedValue, [], scope), scope)))),
	}));
	return {
		"Bool": BoolType,
		"Int1": BoolType,
		"SignedNumeric": cached(() => protocol("SignedNumeric")),
		"SignedInteger": cached(() => protocol("SignedInteger")),
		"UnsignedInteger": cached(() => protocol("UnsignedInteger")),
		"FixedWidthInteger": cached(() => protocol("FixedWidthInteger")),
		"UInt": cached(() => buildIntegerType(0, 4294967295, checkedIntegers, (value, scope) => expr(binaryExpression(">>>", read(value, scope), literal(0))))),
		"Int": cached(() => buildIntegerType(-2147483648, 2147483647, checkedIntegers, (value, scope) => expr(binaryExpression("|", read(value, scope), literal(0))))),
		"UInt8": cached(() => buildIntegerType(0, 255, checkedIntegers, (value, scope) => expr(binaryExpression("&", read(value, scope), literal(0xFF))))),
		"Int8": cached(() => buildIntegerType(-128, 127, checkedIntegers, (value, scope) => expr(binaryExpression(">>", binaryExpression("<<", read(value, scope), literal(24)), literal(24))))),
		"UInt16": cached(() => buildIntegerType(0, 65535, checkedIntegers, (value, scope) => expr(binaryExpression("&", read(value, scope), literal(0xFFFF))))),
		"Int16": cached(() => buildIntegerType(-32768, 32767, checkedIntegers, (value, scope) => expr(binaryExpression(">>", binaryExpression("<<", read(value, scope), literal(16)), literal(16))))),
		"UInt32": cached(() => buildIntegerType(0, 4294967295, checkedIntegers, (value, scope) => expr(binaryExpression(">>>", read(value, scope), literal(0))))),
		"Int32": cached(() => buildIntegerType(-2147483648, 2147483647, checkedIntegers, (value, scope) => expr(binaryExpression("|", read(value, scope), literal(0))))),
		"UInt64": cached(() => buildIntegerType(0, Number.MAX_SAFE_INTEGER, checkedIntegers, (value) => value)), // 52-bit integers
		"Int64": cached(() => buildIntegerType(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, checkedIntegers, (value) => value)), // 53-bit integers
		"FloatingPoint": cached(() => protocol("FloatingPoint")),
		"Float": cached(() => buildFloatingType()),
		"Double": cached(() => buildFloatingType()),
		"String": (globalScope) => {
			const UnicodeScalarView = primitive(PossibleRepresentation.Array, expr(literal([])), [
				field("count", reifyType("Int", globalScope), (value, scope) => expr(memberExpression(read(value, scope), identifier("length")))),
				field("startIndex", reifyType("Int64", globalScope), (value, scope) => expr(literal(0))),
				field("endIndex", reifyType("Int64", globalScope), (value, scope) => expr(memberExpression(read(value, scope), identifier("length")))),
			]);
			const UTF16View = primitive(PossibleRepresentation.String, expr(literal("")), [
				field("count", reifyType("Int", globalScope), (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
				field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => expr(literal(0))),
				field("endIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
			]);
			const UTF8View = primitive(PossibleRepresentation.Array, expr(literal([])), [
				field("count", reifyType("Int", globalScope), (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
				field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => expr(literal(0))),
				field("endIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => expr(memberExpression(read(value, scope), identifier("length")))),
			]);
			return primitive(PossibleRepresentation.String, expr(literal("")), [
				field("unicodeScalars", UnicodeScalarView, (value, scope) => call(expr(memberExpression(identifier("Array"), identifier("from"))), undefinedValue, [value], scope)),
				field("utf16", UTF16View, (value) => value),
				field("utf8", UTF8View, (value, scope) => call(expr(memberExpression(newExpression(identifier("TextEncoder"), [literal("utf-8")]), identifier("encode"))), undefinedValue, [value], scope)),
			], {
				"init": wrapped((scope, arg) => call(expr(identifier("String")), undefinedValue, [arg(0, "value")], scope)),
				"+": binaryBuiltin("+", 0),
				"lowercased()": (scope, arg, type) => callable(() => call(expr(memberExpression(read(arg(0, "value"), scope), identifier("toLowerCase"))), undefinedValue, [], scope), parseType("(String) -> String")),
				"uppercased()": (scope, arg, type) => callable(() => call(expr(memberExpression(read(arg(0, "value"), scope), identifier("toUpperCase"))), undefinedValue, [], scope), parseType("(String) -> String")),
			}, {
				"UnicodeScalarView": () => UnicodeScalarView,
				"UTF16View": () => UTF16View,
				"UTF8View": () => UTF8View,
			});
		},
		"StaticString": cached(() => primitive(PossibleRepresentation.String, expr(literal("")), [
		], {
		})),
		"Optional": (globalScope, typeParameters) => {
			const [ wrappedType ] = typeParameters(1);
			const reified = reifyType(wrappedType, globalScope);
			const optionalType: Type = { kind: "optional", type: wrappedType };
			return {
				fields: [],
				functions: lookupForMap({
					"none": () => expr(emptyOptional(optionalType)),
					"some": wrapped((scope, arg) => wrapInOptional(arg(0, "wrapped"), optionalType, scope)),
					"==": binaryBuiltin("===", 0), // TODO: Fix to use proper comparator for internal type
					"!=": binaryBuiltin("!==", 0), // TODO: Fix to use proper comparator for internal type
					"flatMap": returnTodo,
				} as FunctionMap),
				conformances: {},
				possibleRepresentations: PossibleRepresentation.Array,
				defaultValue() {
					return expr(emptyOptional(wrappedType));
				},
				copy: reified.copy || isNestedOptional(optionalType) ? (value, scope) => {
					const expression = read(value, scope);
					if (expressionSkipsCopy(expression)) {
						return expr(expression);
					}
					if (reified.copy) {
						// Nested optionals require special support since they're stored as [] for .none, [null] for .some(.none) and [v] for .some(.some(v))
						const [first, after] = reuseExpression(expression, scope, "copyValue");
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
		"_OptionalNilComparisonType": cached(() => primitive(PossibleRepresentation.Null, expr(literal(null)), [], {
			"init(nilLiteral:)": wrapped((scope, arg, type) => expr(literal(null))),
		})),
		"Array": (globalScope, typeParameters) => {
			const [ valueType ] = typeParameters(1);
			const reified = reifyType(valueType, globalScope);
			const optionalValueType: Type = { kind: "optional", type: valueType };
			const reifiedOptional = reifyType(optionalValueType, globalScope);
			return {
				fields: [
					readLengthField("count", globalScope),
					isEmptyFromLength(globalScope),
					readLengthField("capacity", globalScope),
					startIndexOfZero(globalScope),
					readLengthField("endIndex", globalScope),
					field("first", reifiedOptional, (value: Value, scope: Scope) => {
						const [first, after] = reuseExpression(read(value, scope), scope, "array");
						return expr(conditionalExpression(
							memberExpression(first, identifier("length")),
							read(wrapInOptional(expr(memberExpression(after, literal(0), true)), optionalValueType, scope), scope),
							emptyOptional(optionalValueType),
						));
					}),
					field("last", reifiedOptional, (value: Value, scope: Scope) => {
						const [first, after] = reuseExpression(read(value, scope), scope, "array");
						return expr(conditionalExpression(
							memberExpression(first, identifier("length")),
							read(wrapInOptional(expr(memberExpression(after, binaryExpression("-", memberExpression(after, identifier("length")), literal(1)), true)), optionalValueType, scope), scope),
							emptyOptional(optionalValueType),
						));
					}),
				],
				functions: lookupForMap({
					"init": wrapped((scope, arg) => call(expr(memberExpression(identifier("Array"), identifier("from"))), undefinedValue, [arg(0, "iterable")], scope)),
					"count": returnLength,
					"subscript": {
						get(scope, arg) {
							return arrayBoundsCheck(arg(1, "array"), arg(2, "index"), scope, "read");
						},
						set(scope, arg) {
							return expr(assignmentExpression("=", read(arrayBoundsCheck(arg(1, "array"), arg(2, "index"), scope, "write"), scope), read(copy(arg(3, "value"), valueType), scope)));
						},
					},
					"append()": wrapped((scope, arg) => {
						const pushExpression = expr(memberExpression(read(arg(2, "array"), scope), identifier("push")));
						const newElement = copy(arg(2, "newElement"), valueType);
						return call(pushExpression, undefinedValue, [newElement], scope);
					}),
					"insert(at:)": wrapped((scope, arg) => {
						const array = arg(1, "array");
						const newElement = copy(arg(2, "newElement"), valueType);
						const i = arg(3, "i");
						return call(functionValue("Swift.(swift-to-js).arrayInsertAt()", undefined, { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] }), undefinedValue, [array, newElement, i], scope);
					}),
					"remove(at:)": wrapped((scope, arg) => {
						const array = arg(1, "array");
						const i = arg(2, "i");
						return call(functionValue("Swift.(swift-to-js).arrayRemoveAt()", undefined, { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] }), undefinedValue, [array, i], scope);
					}),
					"removeFirst()": wrapped((scope, arg) => {
						const [first, after] = reuseExpression(callExpression(memberExpression(read(arg(1, "array"), scope), identifier("shift")), []), scope, "element");
						return expr(conditionalExpression(
							binaryExpression("!==", first, read(undefinedValue, scope)),
							after,
							read(arrayBoundsFailed(scope), scope),
						));
					}),
					"removeLast()": wrapped((scope, arg) => {
						const [first, after] = reuseExpression(callExpression(memberExpression(read(arg(1, "array"), scope), identifier("pop")), []), scope, "element");
						return expr(conditionalExpression(
							binaryExpression("!==", first, read(undefinedValue, scope)),
							after,
							read(arrayBoundsFailed(scope), scope),
						));
					}),
					"popLast()": wrapped((scope, arg) => {
						const [first, after] = reuseExpression(callExpression(memberExpression(read(arg(1, "array"), scope), identifier("pop")), []), scope, "element");
						return expr(conditionalExpression(
							binaryExpression("!==", first, read(undefinedValue, scope)),
							read(wrapInOptional(expr(after), optionalValueType, scope), scope),
							emptyOptional(optionalValueType),
						));
					}),
					"removeAll(keepingCapacity:)": wrapped((scope, arg) => {
						return expr(assignmentExpression("=", memberExpression(read(arg(1, "array"), scope), identifier("length")), literal(0)));
					}),
					"reserveCapacity()": wrapped((scope, arg) => undefinedValue),
					"index(after:)": wrapped((scope, arg) => {
						const array = arg(1, "array");
						const i = arg(2, "i");
						const [first, after] = reuseExpression(read(i, scope), scope, "index");
						return expr(conditionalExpression(
							binaryExpression("<", read(array, scope), first),
							binaryExpression("+", after, literal(1)),
							read(arrayBoundsFailed(scope), scope),
						));
					}),
					"index(before:)": wrapped((scope, arg) => {
						const i = arg(2, "i");
						const [first, after] = reuseExpression(read(i, scope), scope, "index");
						return expr(conditionalExpression(
							binaryExpression(">", first, literal(0)),
							binaryExpression("-", after, literal(1)),
							read(arrayBoundsFailed(scope), scope),
						));
					}),
					"distance(from:to:)": wrapped((scope, arg) => {
						const start = arg(2, "start");
						const end = arg(3, "end");
						return expr(binaryExpression("-", read(end, scope), read(start, scope)));
					}),
				} as FunctionMap),
				conformances: {},
				possibleRepresentations: PossibleRepresentation.Array,
				defaultValue() {
					return expr(literal([]));
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
			const [ keyType, valueType ] = typeParameters(2);
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
					functions: lookupForMap({
						subscript: {
							get(scope, arg, type) {
								const [dictFirst, dictAfter] = reuseExpression(read(arg(2, "dict"), scope), scope, "dict");
								const [indexFirst, indexAfter] = reuseExpression(read(arg(3, "index"), scope), scope, "index");
								return expr(conditionalExpression(
									callExpression(
										memberExpression(
											memberExpression(
												identifier("Object"),
												identifier("hasOwnProperty"),
											),
											identifier("call"),
										),
										[dictFirst, indexFirst],
									),
									read(wrapInOptional(copy(expr(memberExpression(dictAfter, indexAfter, true)), valueType), possibleValueType, scope), scope),
									emptyOptional(possibleValueType),
								));
							},
							set(scope, arg, type) {
								const dict = read(arg(2, "dict"), scope);
								const index = read(arg(3, "index"), scope);
								const valueExpression = read(arg(4, "value"), scope);
								if (valueType.kind === "optional") {
									if (valueExpression.type === "ArrayExpression" && valueExpression.elements.length === 0) {
										return expr(unaryExpression("delete", memberExpression(dict, index, true)));
									}
								} else {
									if (valueExpression.type === "NullLiteral") {
										return expr(unaryExpression("delete", memberExpression(dict, index, true)));
									}
								}
								if (isLiteral(valueExpression) || valueExpression.type === "ArrayExpression" || valueExpression.type === "ObjectExpression") {
									return expr(assignmentExpression("=", memberExpression(dict, index, true), valueExpression));
								}
								const [valueFirst, valueAfter] = reuseExpression(valueExpression, scope, "value");
								return expr(conditionalExpression(
									optionalIsSome(valueFirst, possibleValueType),
									assignmentExpression("=", memberExpression(dict, index, true), read(copy(unwrapOptional(expr(valueAfter), possibleValueType, scope), valueType), scope)),
									unaryExpression("delete", memberExpression(dict, index, true)),
								));
							},
						},
					} as FunctionMap),
					conformances: {},
					possibleRepresentations: PossibleRepresentation.Object,
					defaultValue() {
						return expr(literal({}));
					},
					copy(value, scope) {
						const expression = read(value, scope);
						if (expressionSkipsCopy(expression)) {
							return expr(expression);
						}
						if (reifiedValueType.copy) {
							throw new TypeError(`Copying dictionaries with non-simple values is not yet implemented!`);
						}
						return expr(callExpression(memberExpression(identifier("Object"), identifier("assign")), [literal({}), expression]));
					},
					innerTypes: {
						Keys: () => {
							return inheritLayout(reifiedKeysType, [
								readLengthField("count", globalScope),
								isEmptyFromLength(globalScope),
								startIndexOfZero(globalScope),
								readLengthField("endIndex", globalScope),
								field("first", reifyType(possibleKeyType, globalScope), (value: Value, scope: Scope) => {
									const [first, after] = reuseExpression(read(value, scope), scope, "keys");
									const stringKey = memberExpression(after, literal(0), true);
									const convertedKey = typeof converter !== "undefined" ? callExpression(converter, [stringKey]) : stringKey;
									return expr(conditionalExpression(memberExpression(first, identifier("length")), read(wrapInOptional(expr(convertedKey), possibleKeyType, scope), scope), emptyOptional(possibleKeyType)));
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
		"Error": (globalScope) => primitive(PossibleRepresentation.Number, expr(literal(0)), [
			field("hashValue", reifyType("Int", globalScope), (value) => value),
		], {
		}),
		"Collection": () => protocol("Collection"),
		"BidirectionalCollection": () => protocol("BidirectionalCollection"),
		"ClosedRange": () => protocol("ClosedRange"),
		"Strideable": () => protocol("Strideable"),
		"Hasher": () => protocol("Hasher"),
	};
}

export function emptyOptional(type: Type) {
	return literal(isNestedOptional(type) ? [] : null);
}

export function wrapInOptional(value: Value, type: Type, scope: Scope) {
	return isNestedOptional(type) ? array([value], scope) : value;
}

export function unwrapOptional(value: Value, type: Type, scope: Scope) {
	if (isNestedOptional(type)) {
		return expr(memberExpression(read(value, scope), literal(0), true));
	}
	return value;
}

export function optionalIsNone(expression: Expression, type: Type): Expression {
	if (isNestedOptional(type)) {
		return binaryExpression("===", memberExpression(expression, identifier("length")), literal(0));
	}
	return binaryExpression("===", expression, literal(null));
}

export function optionalIsSome(expression: Expression, type: Type): Expression {
	if (isNestedOptional(type)) {
		return binaryExpression("!==", memberExpression(expression, identifier("length")), literal(0));
	}
	return binaryExpression("!==", expression, literal(null));
}

function arrayBoundsFailed(scope: Scope) {
	return call(functionValue("Swift.(swift-to-js).arrayBoundsFailed()", undefined, { kind: "function", arguments: voidType, return: voidType, throws: true, rethrows: false, attributes: [] }), undefinedValue, [], scope);
}

function arrayBoundsCheck(array: Value, index: Value, scope: Scope, mode: "read" | "write") {
	const [firstArray, remainingArray] = reuseExpression(read(array, scope), scope, "array");
	const [firstIndex, remainingIndex] = reuseExpression(read(index, scope), scope, "index");
	return variable(memberExpression(
		firstArray,
		simplify(conditionalExpression(
			logicalExpression(
				"&&",
				binaryExpression(mode === "write" ? ">=" : ">", memberExpression(remainingArray, identifier("length")), firstIndex),
				binaryExpression(">=", remainingIndex, literal(0)),
			),
			remainingIndex,
			read(arrayBoundsFailed(scope), scope),
		)),
		true,
	));
}

export const functions: FunctionMap = {
	"Swift.(swift-to-js).numericRangeFailed()": noinline((scope, arg) => statements([throwStatement(newExpression(identifier("RangeError"), [literal("Not enough bits to represent the given value")]))])),
	"Swift.(swift-to-js).forceUnwrapFailed()": noinline((scope, arg) => statements([throwStatement(newExpression(identifier("TypeError"), [literal("Unexpectedly found nil while unwrapping an Optional value")]))])),
	"Swift.(swift-to-js).arrayBoundsFailed()": noinline((scope, arg) => statements([throwStatement(newExpression(identifier("RangeError"), [literal("Array index out of range")]))])),
	"Swift.(swift-to-js).arrayInsertAt()": noinline((scope, arg) => {
		return statements([
			ifStatement(
				logicalExpression("||",
					binaryExpression(">",
						read(arg(2, "i"), scope),
						memberExpression(read(arg(0, "array"), scope), identifier("length")),
					),
					binaryExpression("<",
						read(arg(2, "i"), scope),
						literal(0),
					),
				),
				expressionStatement(read(arrayBoundsFailed(scope), scope)),
			),
			// TODO: Remove use of splice, since it's slow
			expressionStatement(callExpression(
				memberExpression(read(arg(0, "array"), scope), identifier("splice")),
				[
					read(arg(2, "i"), scope),
					literal(0),
					read(arg(1, "newElement"), scope),
				],
			)),
		]);
	}),
	"Swift.(swift-to-js).arrayRemoveAt()": noinline((scope, arg) => {
		return statements([
			ifStatement(
				logicalExpression("||",
					binaryExpression(">=",
						read(arg(1, "i"), scope),
						memberExpression(read(arg(0, "array"), scope), identifier("length")),
					),
					binaryExpression("<",
						read(arg(1, "i"), scope),
						literal(0),
					),
				),
				expressionStatement(read(arrayBoundsFailed(scope), scope)),
			),
			// TODO: Remove use of splice, since it's slow
			returnStatement(
				memberExpression(
					callExpression(
						memberExpression(read(arg(0, "array"), scope), identifier("splice")),
						[
							read(arg(1, "i"), scope),
							literal(1),
						],
					),
					literal(0),
					true,
				),
			),
		]);
	}),
	"Sequence.reduce": (scope, arg, type) => callable((innerScope, innerArg) => {
		return call(expr(identifier("Sequence$reduce")), undefinedValue, [arg(0)], scope);
	}, returnType(type)),
	"??": returnTodo,
	"~=": (scope, arg) => expr(binaryExpression("===", read(arg(1, "pattern"), scope), read(arg(2, "value"), scope))),
	"print(_:separator:terminator:)": (scope, arg, type) => call(expr(memberExpression(identifier("console"), identifier("log"))), undefinedValue, [arg(0, "items")], scope),
	"precondition(_:_:file:line:)": (scope, arg, type) => statements([
		ifStatement(
			unaryExpression("!", read(call(arg(0, "condition"), undefinedValue, [], scope), scope)),
			blockStatement([
				expressionStatement(identifier("debugger")),
				throwStatement(newExpression(identifier("Error"), [
					read(call(arg(1, "message"), undefinedValue, [], scope), scope),
					read(arg(2, "file"), scope),
					read(arg(3, "line"), scope),
				])),
			]),
		),
	]),
	"preconditionFailed(_:file:line:)": (scope, arg, type) => statements([
		expressionStatement(identifier("debugger")),
		throwStatement(newExpression(identifier("Error"), [
			read(call(arg(0, "message"), undefinedValue, [], scope), scope),
			read(arg(1, "file"), scope),
			read(arg(2, "line"), scope),
		])),
	]),
	"fatalError(_:file:line:)": (scope, arg, type) => statements([
		expressionStatement(identifier("debugger")),
		throwStatement(newExpression(identifier("Error"), [
			read(call(arg(0, "message"), undefinedValue, [], scope), scope),
			read(arg(1, "file"), scope),
			read(arg(2, "line"), scope),
		])),
	]),
};

export function newScopeWithBuiltins(): Scope {
	return {
		name: "global",
		declarations: Object.create(null),
		types: Object.assign(Object.create(null), defaultTypes(false)),
		functions: Object.assign(Object.create(null), functions),
		functionUsage: Object.create(null),
		mapping: Object.create(null),
		parent: undefined,
	};
}
