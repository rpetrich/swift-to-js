import { abstractMethod, FunctionBuilder, noinline, returnFunctionType, returnType, wrapped } from "./functions";
import { parseFunctionType, parseType } from "./parse";
import { expressionSkipsCopy, field, Field, FunctionMap, getField, inheritLayout, PossibleRepresentation, primitive, protocol, ProtocolConformance, ProtocolConformanceMap, ReifiedType, reifyType, struct, TypeMap, TypeParameterHost } from "./reified";
import { addVariable, DeclarationFlags, emitScope, lookup, mangleName, newScope, rootScope, Scope, uniqueName } from "./scope";
import { Function, Tuple, Type } from "./types";
import { cached, concat, expectLength, lookupForMap } from "./utils";
import { ArgGetter, array, call, callable, copy, expr, ExpressionValue, functionValue, isNestedOptional, ignore, isPure, literal, read, reuseExpression, set, simplify, statements, stringifyType, transform, tuple, typeFromValue, typeType, typeValue, undefinedValue, update, Value, valueOfExpression, variable } from "./values";

import { arrayExpression, arrayPattern, assignmentExpression, binaryExpression, blockStatement, breakStatement, callExpression, conditionalExpression, Expression, expressionStatement, forStatement, functionExpression, identifier, Identifier, ifStatement, isLiteral, logicalExpression, memberExpression, newExpression, NullLiteral, returnStatement, Statement, thisExpression, ThisExpression, throwStatement, unaryExpression, updateExpression, variableDeclaration, variableDeclarator, VariableDeclarator, whileStatement } from "babel-types";

function returnOnlyArgument(scope: Scope, arg: ArgGetter): Value {
	return arg(0, "value");
}

function returnTodo(scope: Scope, arg: ArgGetter, type: Type, name: string): Value {
	console.error(name);
	return call(expr(mangleName("todo_missing_builtin$" + name)), [], [], scope);
}

function returnLength(scope: Scope, arg: ArgGetter): Value {
	const arg0 = arg(0);
	return arg0.kind === "direct" ? variable(read(arg0, scope)) : expr(read(arg0, scope));
}

function binaryBuiltin(operator: "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "&" | "|" | "^" | "==" | "===" | "!=" | "!==", typeArgumentCount: number, valueChecker?: (value: Value, scope: Scope) => Value) {
	return (scope: Scope, arg: ArgGetter) => transform(arg(typeArgumentCount, "lhs"), scope, (lhs) => {
		return transform(arg(typeArgumentCount + 1, "rhs"), scope, (rhs) => {
			const unchecked = expr(binaryExpression(operator, lhs, rhs));
			return typeof valueChecker !== "undefined" ? valueChecker(unchecked, scope) : unchecked;
		});
	});
}

function updateBuiltin(operator: "+" | "-" | "*" | "/" | "|" | "&", typeArgumentCount: number, valueChecker?: (value: Value, scope: Scope) => Value) {
	if (typeof valueChecker !== "undefined") {
		return (scope: Scope, arg: ArgGetter) => update(arg(typeArgumentCount, "target"), scope, (value) => valueChecker(expr(binaryExpression(operator, read(value, scope), read(arg(typeArgumentCount + 1, "value"), scope))), scope));
	}
	return (scope: Scope, arg: ArgGetter) => set(arg(typeArgumentCount, "target"), arg(typeArgumentCount + 1, "value"), scope, operator + "=" as any);
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

function cachedBuilder(fn: (scope: Scope) => ReifiedType): (scope: Scope) => ReifiedType {
	let value: ReifiedType | undefined;
	return (scope: Scope) => {
		if (typeof value === "undefined") {
			return value = fn(scope);
		}
		return value;
	};
}

function buildIntegerType(globalScope: Scope, min: number, max: number, checked: boolean, wrap: (value: Value, scope: Scope) => Value): ReifiedType {
	const fields: Field[] = [];
	const range: NumericRange = { min: literal(min), max: literal(max) };
	const widerHigh: NumericRange = checked ? { min: literal(min), max: literal(max + 1) } : range;
	const widerLow: NumericRange = checked ? { min: literal(min - 1), max: literal(max) } : range;
	const widerBoth: NumericRange = checked ? { min: literal(min - 1), max: literal(max + 1) } : range;
	const integerTypeName = min < 0 ? "SignedInteger" : "UnsignedInteger";
	const initExactly = wrapped((scope, arg, type) => {
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
	});
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
		"init(exactly:)": initExactly,
		"&-": wrapped(binaryBuiltin("-", 0, wrap)),
	};
	const fixedWidthIntegerType: ProtocolConformance = {
		"&+": wrapped(binaryBuiltin("+", 0, wrap)),
		"&*": wrapped(binaryBuiltin("*", 0, wrap)),
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
				// TODO: Support detecting unary vs binary
				if (type.arguments.types.length === 1) {
					return integerRangeCheck(scope, expr(unaryExpression("-", read(arg(0, "value"), scope))), widerLow, range);
				}
				return integerRangeCheck(scope, expr(binaryExpression("-", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope))), widerLow, range);
			}),
			"*": wrapped((scope, arg, type) => integerRangeCheck(scope, expr(binaryExpression("*", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope))), widerBoth, range)),
			"/": (scope, arg) => expr(binaryExpression("|", binaryExpression("/", read(arg(0, "lhs"), scope), read(arg(1, "rhs"), scope)), literal(0))),
			"%": wrapped(binaryBuiltin("%", 0)),
			"<": wrapped(binaryBuiltin("<", 0)),
			">": wrapped(binaryBuiltin(">", 0)),
			"<=": wrapped(binaryBuiltin("<=", 0)),
			">=": wrapped(binaryBuiltin(">=", 0)),
			"&": wrapped(binaryBuiltin("&", 0)),
			"|": wrapped(binaryBuiltin("|", 0)),
			"^": wrapped(binaryBuiltin("^", 0)),
			"==": wrapped(binaryBuiltin("===", 0)),
			"!=": wrapped(binaryBuiltin("!==", 0)),
			"+=": wrapped(updateBuiltin("+", 0)),
			"-=": wrapped(updateBuiltin("-", 0)),
			"*=": wrapped(updateBuiltin("*", 0)),
			"...": wrapped((scope, arg) => {
				return tuple([arg(0, "start"), arg(1, "end")]);
			}),
		} as FunctionMap),
		conformances: applyDefaultConformances({
			Equatable: {
				"==": wrapped(binaryBuiltin("===", 0)),
				"!=": wrapped(binaryBuiltin("!==", 0)),
			},
			Numeric: {
				"init(exactly:)": () => expr(literal(42)), // TODO: Figure out what to do here
				"+": wrapped(binaryBuiltin("+", 0, (value, scope) => integerRangeCheck(scope, value, widerHigh, range))),
				"-": wrapped(binaryBuiltin("-", 0, (value, scope) => integerRangeCheck(scope, value, widerLow, range))),
				"*": wrapped(binaryBuiltin("*", 0, (value, scope) => integerRangeCheck(scope, value, widerBoth, range))),
			},
			[integerTypeName]: integerType,
			SignedNumeric: {
				"-": wrapped((scope, arg) => expr(unaryExpression("-", read(arg(0, "value"), scope)))),
			},
			FixedWidthInteger: fixedWidthIntegerType,
			Strideable: {
				"...": wrapped((scope, arg) => {
					return tuple([arg(0, "start"), arg(1, "end")]);
				}),
			},
			CustomStringConvertible: {
			},
			LosslessStringConvertible: {
				"init": wrapped((scope, arg) => {
					const input = read(arg(0, "description"), scope);
					const value = valueOfExpression(input);
					if (typeof value === "string") {
						const convertedValue = parseInt(value, 10);
						return expr(literal(isNaN(convertedValue) ? null : convertedValue));
					}
					const result = uniqueName(scope, "integer");
					return statements([
						addVariable(scope, result, parseType("Int"), callExpression(identifier("parseInt"), [
							input,
							literal(10),
						]), DeclarationFlags.Const),
						returnStatement(
							conditionalExpression(
								binaryExpression("===",
									read(lookup(result, scope), scope),
									read(lookup(result, scope), scope)
								),
								literal(null),
								read(lookup(result, scope), scope)
							)
						)
					]);
				}),
			},
		}, globalScope),
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
	fields.push(field("hashValue", reifiedType, (value) => value));
	return reifiedType;
}

function buildFloatingType(globalScope: Scope): ReifiedType {
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
			"%": wrapped(binaryBuiltin("%", 0)),
			"<": wrapped(binaryBuiltin("<", 0)),
			">": wrapped(binaryBuiltin(">", 0)),
			"<=": wrapped(binaryBuiltin("<=", 0)),
			">=": wrapped(binaryBuiltin(">=", 0)),
			"&": wrapped(binaryBuiltin("&", 0)),
			"|": wrapped(binaryBuiltin("|", 0)),
			"^": wrapped(binaryBuiltin("^", 0)),
			"+=": wrapped(updateBuiltin("+", 0)),
			"-=": wrapped(updateBuiltin("-", 0)),
			"*=": wrapped(updateBuiltin("*", 0)),
			"/=": wrapped(updateBuiltin("/", 0)),
		} as FunctionMap),
		conformances: applyDefaultConformances({
			Equatable: {
				"==": wrapped(binaryBuiltin("===", 0)),
				"!=": wrapped(binaryBuiltin("!==", 0)),
			},
			SignedNumeric: {
				"-": wrapped((scope, arg) => expr(unaryExpression("-", read(arg(0, "value"), scope)))),
			},
			FloatingPoint: {
				"==": wrapped(binaryBuiltin("===", 0)),
				"!=": wrapped(binaryBuiltin("!==", 0)),
				"squareRoot()": (scope, arg, type) => {
					const expression = read(arg(1, "value"), scope);
					return callable(() => expr(callExpression(memberExpression(identifier("Math"), identifier("sqrt")), [expression])), returnType(type));
				},
			},
			LosslessStringConvertible: {
				"init": wrapped((scope, arg) => {
					const input = read(arg(0, "description"), scope);
					const value = valueOfExpression(input);
					if (typeof value === "string") {
						const convertedValue = Number(value);
						return expr(literal(isNaN(convertedValue) ? null : convertedValue));
					}
					const result = uniqueName(scope, "number");
					return statements([
						addVariable(scope, result, parseType("Int"), callExpression(identifier("Number"), [
							input,
						]), DeclarationFlags.Const),
						returnStatement(
							conditionalExpression(
								binaryExpression("===",
									read(lookup(result, scope), scope),
									read(lookup(result, scope), scope)
								),
								literal(null),
								read(lookup(result, scope), scope)
							)
						)
					]);
				}),
			},
		}, globalScope),
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
			binaryExpression("<", first, dest.min),
			binaryExpression(">", after, dest.max),
		);
	} else if (requiresGreaterThanCheck) {
		check = binaryExpression(">", first, dest.max);
	} else {
		check = binaryExpression("<", first, dest.min);
	}
	const functionType: Function = { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] };
	return expr(conditionalExpression(
		check,
		read(call(functionValue("Swift.(swift-to-js).numericRangeFailed()", undefined, functionType), [], [], scope), scope),
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
	return call(functionValue(name, typeArg, type), [typeArg], [typeType], scope);
}

function closedRangeIterate(range: Value, scope: Scope, body: (value: Value) => Statement): Statement[] {
	let start;
	let end;
	let contents = [];
	const intType = parseType("Int");
	const i = uniqueName(scope, "i");
	if (range.kind === "tuple" && range.values.length === 2) {
		start = read(range.values[0], scope);
		contents.push(addVariable(scope, i, intType, start));
		const endExpression = read(range.values[1], scope);
		if (isPure(endExpression)) {
			end = expr(endExpression);
		} else {
			const endIdentifier = uniqueName(scope, "end");
			contents.push(addVariable(scope, endIdentifier, intType, end));
			end = lookup(endIdentifier, scope);
		}
	} else {
		addVariable(scope, i, intType);
		const endIdentifier = uniqueName(scope, "end");
		addVariable(scope, endIdentifier, intType);
		contents.push(variableDeclaration("const", [variableDeclarator(arrayPattern([read(lookup(i, scope), scope), read(lookup(endIdentifier, scope), scope)]), read(range, scope))]));
		end = lookup(endIdentifier, scope);
	}
	const result = forStatement(
		contents.length === 1 ? contents[0] : undefined,
		binaryExpression("<=", read(lookup(i, scope), scope), read(end, scope)),
		updateExpression("++", read(lookup(i, scope), scope)),
		body(lookup(i, scope)),
	);
	if (contents.length === 1) {
		return [result];
	} else {
		return concat(contents as Statement[], [result]);
	}
}

function adaptedMethod(otherMethodName: string, adapter: (otherValue: Value, scope: Scope, arg: ArgGetter, type: Function) => Value) {
	return (scope: Scope, arg: ArgGetter, type: Function) => {
		const typeArg = arg(0, "T");
		const otherMethod = call(functionValue(otherMethodName, typeArg, type), [typeArg], [typeType], scope);
		const functionType = returnFunctionType(type);
		return callable((innerScope, innerArg) => adapter(otherMethod, innerScope, innerArg, functionType), functionType);
	}
}

function updateMethod(otherMethodName: string) {
	return adaptedMethod(otherMethodName, (targetMethod, scope, arg, type) => {
		return set(arg(0, "lhs"), call(targetMethod, [arg(0, "lhs"), arg(1, "rhs")], type.arguments.types, scope), scope);
	});
}

function applyDefaultConformances(conformances: ProtocolConformanceMap, scope: Scope): ProtocolConformanceMap {
	const result: ProtocolConformanceMap = Object.create(null);
	for (const key of Object.keys(conformances)) {
		const reified = reifyType(key, scope);
		if (!Object.hasOwnProperty.call(reified.conformances, key)) {
			throw new TypeError(`${key} is not a protocol`);
		}
		result[key] = Object.assign(Object.assign(Object.create(null), reified.conformances[key]), conformances[key]);
	}
	return result;
}

const dummyType: Type = { kind: "name", name: "Dummy" };

function defaultTypes(checkedIntegers: boolean): TypeMap {
	const protocolTypes: TypeMap = Object.create(null);
	function addProtocol(name: string, conformance: ProtocolConformance) {
		const result = protocol({
			[name]: conformance
		});
		protocolTypes[name] = () => result;
	}

	addProtocol("Equatable", {
		"==": abstractMethod,
		"!=": adaptedMethod("==", (equalsMethod, scope, arg, type) => transform(call(equalsMethod, [arg(0, "lhs"), arg(1, "rhs")], type.arguments.types, scope), scope, (equals) => {
			return expr(unaryExpression("!", equals));
		})),
		"~=": adaptedMethod("==", (equalsMethod, scope, arg, type) => call(equalsMethod, [arg(0, "lhs"), arg(1, "rhs")], type.arguments.types, scope)),
	});
	addProtocol("Comparable", {
		"<": abstractMethod,
		">": adaptedMethod("<", (lessThanMethod, scope, arg, type) => call(lessThanMethod, [arg(1, "rhs"), arg(0, "lhs")], type.arguments.types, scope)),
		"<=": adaptedMethod("<", (lessThanMethod, scope, arg, type) => transform(call(lessThanMethod, [arg(1, "rhs"), arg(0, "lhs")], type.arguments.types, scope), scope, (lessThan) => {
			return expr(unaryExpression("!", lessThan));
		})),
		">=": adaptedMethod("<", (lessThanMethod, scope, arg, type) => transform(call(lessThanMethod, [arg(0, "lhs"), arg(1, "rhs")], type.arguments.types, scope), scope, (lessThan) => {
			return expr(unaryExpression("!", lessThan));
		})),
	});
	addProtocol("Numeric", {
		"init(exactly:)": abstractMethod,
		"+": abstractMethod,
		"+=": updateMethod("+"),
		"-": abstractMethod,
		"-=": updateMethod("-"),
		"*": abstractMethod,
		"*=": updateMethod("*"),
	});
	addProtocol("SignedNumeric", {
		"-": abstractMethod, // TODO: Implement - in terms of negate
		"negate": adaptedMethod("-", (negateMethod, scope, arg, type) => {
			return set(arg(0, "lhs"), call(negateMethod, [arg(1, "rhs")], type.arguments.types, scope), scope);
		}),
	});
	addProtocol("BinaryInteger", {
		"init(exactly:)": abstractMethod,
		"init(truncatingIfNeeded:)": abstractMethod,
		"init(clamping:)": abstractMethod,
		"/": abstractMethod,
		"/=": abstractMethod,
		"%": abstractMethod,
		"%=": abstractMethod,
		"+": abstractMethod,
		"+=": abstractMethod,
		"-": abstractMethod,
		"-=": abstractMethod,
		"*": abstractMethod,
		"*=": abstractMethod,
		"~": abstractMethod,
		"&": abstractMethod,
		"&=": abstractMethod,
		"|": abstractMethod,
		"|=": abstractMethod,
		"^": abstractMethod,
		"^=": abstractMethod,
		">>": abstractMethod,
		">>=": abstractMethod,
		"<<": abstractMethod,
		"<<=": abstractMethod,
		"quotientAndRemainder(dividingBy:)": abstractMethod,
		"isMultiple(of:)": abstractMethod,
		"signum": abstractMethod,
	});
	addProtocol("SignedInteger", {});
	addProtocol("UnsignedInteger", {});
	addProtocol("FixedWidthInteger", {});
	addProtocol("FloatingPoint", {});
	addProtocol("Sequence", {});
	addProtocol("Collection", {});
	addProtocol("BidirectionalCollection", {});
	addProtocol("Strideable", {
		"distance(to:)": abstractMethod,
		"advanced(by:)": abstractMethod,
	});
	addProtocol("Hasher", {});
	addProtocol("CustomStringConvertible", {
		// TODO: Support properties
	});
	addProtocol("LosslessStringConvertible", {
		"init": abstractMethod,
	});

	const BoolType = cachedBuilder((globalScope: Scope) => primitive(PossibleRepresentation.Boolean, expr(literal(false)), [
		field("description", reifyType(parseType("String"), globalScope), (target, scope) => {
			return transform(target, scope, (expression) => expr(conditionalExpression(expression, literal("True"), literal("False"))));
		}),
	], {
		"init(_builtinBooleanLiteral:)": wrapped(returnOnlyArgument),
		"init": wrapped((scope, arg) => transform(arg(0, "string"), scope, (expression) => {
			// Optional init from string
			const [first, after] = reuseExpression(expression, scope, "string");
			return expr(logicalExpression("||",
				binaryExpression("===",
					first,
					literal("True"),
				),
				logicalExpression("&&",
					binaryExpression("!==",
						after,
						literal("False"),
					),
					literal(null),
				),
			));
		})),
		"_getBuiltinLogicValue()": (scope, arg, type) => callable(() => arg(0, "literal"), parseType("() -> Int1")),
		"&&": wrapped((scope, arg) => expr(logicalExpression("&&", read(arg(0, "lhs"), scope), read(call(arg(1, "rhs"), [], [], scope), scope)))),
		"||": wrapped((scope, arg) => expr(logicalExpression("||", read(arg(0, "lhs"), scope), read(call(arg(1, "rhs"), [], [], scope), scope)))),
		"!": wrapped((scope, arg) => expr(unaryExpression("!", read(arg(0, "value"), scope)))),
		"random": wrapped((scope, arg) => expr(binaryExpression("<", callExpression(memberExpression(identifier("Math"), identifier("random")), []), literal(0.5)))),
	}, applyDefaultConformances({
		Equatable: {
			"==": wrapped(binaryBuiltin("===", 0)),
			"!=": wrapped(binaryBuiltin("!==", 0)),
		},
	}, globalScope)));

	return Object.assign(Object.assign(Object.create(null), protocolTypes), {
		"Bool": BoolType,
		"Int1": BoolType,
		"UInt": cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 4294967295, checkedIntegers, (value, scope) => expr(binaryExpression(">>>", read(value, scope), literal(0))))),
		"Int": cachedBuilder((globalScope) => buildIntegerType(globalScope, -2147483648, 2147483647, checkedIntegers, (value, scope) => expr(binaryExpression("|", read(value, scope), literal(0))))),
		"UInt8": cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 255, checkedIntegers, (value, scope) => expr(binaryExpression("&", read(value, scope), literal(0xFF))))),
		"Int8": cachedBuilder((globalScope) => buildIntegerType(globalScope, -128, 127, checkedIntegers, (value, scope) => expr(binaryExpression(">>", binaryExpression("<<", read(value, scope), literal(24)), literal(24))))),
		"UInt16": cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 65535, checkedIntegers, (value, scope) => expr(binaryExpression("&", read(value, scope), literal(0xFFFF))))),
		"Int16": cachedBuilder((globalScope) => buildIntegerType(globalScope, -32768, 32767, checkedIntegers, (value, scope) => expr(binaryExpression(">>", binaryExpression("<<", read(value, scope), literal(16)), literal(16))))),
		"UInt32": cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 4294967295, checkedIntegers, (value, scope) => expr(binaryExpression(">>>", read(value, scope), literal(0))))),
		"Int32": cachedBuilder((globalScope) => buildIntegerType(globalScope, -2147483648, 2147483647, checkedIntegers, (value, scope) => expr(binaryExpression("|", read(value, scope), literal(0))))),
		"UInt64": cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, Number.MAX_SAFE_INTEGER, checkedIntegers, (value) => value)), // 52-bit integers
		"Int64": cachedBuilder((globalScope) => buildIntegerType(globalScope, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, checkedIntegers, (value) => value)), // 53-bit integers
		"Float": cachedBuilder(buildFloatingType),
		"Double": cachedBuilder(buildFloatingType),
		"String": cachedBuilder((globalScope) => {
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
				field("unicodeScalars", UnicodeScalarView, (value, scope) => call(expr(memberExpression(identifier("Array"), identifier("from"))), [value], [{ kind: "name", name: "String" }], scope)),
				field("utf16", UTF16View, (value) => value),
				field("utf8", UTF8View, (value, scope) => call(expr(memberExpression(newExpression(identifier("TextEncoder"), [literal("utf-8")]), identifier("encode"))), [value], [{ kind: "name", name: "String" }], scope)),
			], {
				"init": wrapped((scope, arg) => call(expr(identifier("String")), [arg(0, "value")], [{ kind: "name", name: "String" }], scope)),
				"+": wrapped(binaryBuiltin("+", 0)),
				"lowercased()": (scope, arg, type) => callable(() => call(expr(memberExpression(read(arg(0, "value"), scope), identifier("toLowerCase"))), [], [], scope), parseType("(String) -> String")),
				"uppercased()": (scope, arg, type) => callable(() => call(expr(memberExpression(read(arg(0, "value"), scope), identifier("toUpperCase"))), [], [], scope), parseType("(String) -> String")),
			}, {
				Equatable: {
					"==": wrapped(binaryBuiltin("===", 0)),
					"!=": wrapped(binaryBuiltin("!==", 0)),
				},
			}, {
				"UnicodeScalarView": () => UnicodeScalarView,
				"UTF16View": () => UTF16View,
				"UTF8View": () => UTF8View,
			});
		}),
		"StaticString": cachedBuilder(() => primitive(PossibleRepresentation.String, expr(literal("")), [
		], {
		})),
		"Optional": (globalScope, typeParameters) => {
			const [ wrappedType ] = typeParameters(1);
			const reified = reifyType(wrappedType, globalScope);
			const optionalType: Type = { kind: "optional", type: wrappedType };
			// Assume values that can be represented as boolean, number or string can be value-wise compared
			const isDirectlyComparable = (reified.possibleRepresentations & ~(PossibleRepresentation.Boolean | PossibleRepresentation.Number | PossibleRepresentation.String)) === PossibleRepresentation.None;
			const compareEqual = isDirectlyComparable ? wrapped(binaryBuiltin("===", 0)) : wrapped((scope: Scope, arg: ArgGetter) => transform(arg(0, "lhs"), scope, (lhs) => {
				return transform(arg(1, "rhs"), scope, (rhs) => {
					const equalMethod = call(functionValue("==", typeValue(wrappedType, "Equatable"), parseFunctionType(`() -> () -> Bool`)), [typeValue(wrappedType)], [typeType], scope);
					const [firstLeft, afterLeft] = reuseExpression(lhs, scope, "lhs");
					const [firstRight, afterRight] = reuseExpression(rhs, scope, "rhs");
					return expr(conditionalExpression(
						optionalIsNone(firstLeft, optionalType),
						optionalIsNone(firstRight, optionalType),
						logicalExpression("&&",
							optionalIsSome(firstRight, optionalType),
							read(call(equalMethod, [
								unwrapOptional(expr(afterLeft), optionalType, scope),
								unwrapOptional(expr(afterRight), optionalType, scope),
							], [wrappedType, wrappedType], scope), scope),
						),
					));
				});
			}));
			const compareUnequal = isDirectlyComparable ? wrapped(binaryBuiltin("!==", 0)) : wrapped((scope: Scope, arg: ArgGetter) => transform(arg(0, "lhs"), scope, (lhs) => {
				return transform(arg(1, "rhs"), scope, (rhs) => {
					const unequalMethod = call(functionValue("!=", typeValue(wrappedType, "Equatable"), parseFunctionType(`() -> () -> Bool`)), [typeValue(wrappedType)], [typeType], scope);
					const [firstLeft, afterLeft] = reuseExpression(lhs, scope, "lhs");
					const [firstRight, afterRight] = reuseExpression(rhs, scope, "rhs");
					return expr(conditionalExpression(
						optionalIsNone(firstLeft, optionalType),
						optionalIsSome(firstRight, optionalType),
						logicalExpression("||",
							optionalIsNone(firstRight, optionalType),
							read(call(unequalMethod, [
								unwrapOptional(expr(afterLeft), optionalType, scope),
								unwrapOptional(expr(afterRight), optionalType, scope),
							], [wrappedType, wrappedType], scope), scope),
						),
					));
				});
			}));
			return {
				fields: [],
				functions: lookupForMap({
					"none": () => expr(emptyOptional(optionalType)),
					"some": wrapped((scope, arg) => wrapInOptional(arg(0, "wrapped"), optionalType, scope)),
					"==": compareEqual,
					"!=": compareUnequal,
					"flatMap": returnTodo,
				} as FunctionMap),
				conformances: applyDefaultConformances({
					Equatable: {
						"==": compareEqual,
						"!=": compareUnequal,
					},
				}, globalScope),
				possibleRepresentations: PossibleRepresentation.Array,
				defaultValue() {
					return expr(emptyOptional(optionalType));
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
		"_OptionalNilComparisonType": cachedBuilder(() => primitive(PossibleRepresentation.Null, expr(literal(null)), [], {
			"init(nilLiteral:)": wrapped((scope, arg, type) => expr(literal(null))),
		})),
		"Array": (globalScope, typeParameters) => {
			const [ valueType ] = typeParameters(1);
			const reified = reifyType(valueType, globalScope);
			const optionalValueType: Type = { kind: "optional", type: valueType };
			const reifiedOptional = reifyType(optionalValueType, globalScope);
			function arrayCompare(comparison: "equal" | "unequal") {
				return wrapped((scope, arg) => {
					return transform(arg(0, "lhs"), scope, (lhs) => {
						const [lhsFirst, lhsAfter] = reuseExpression(lhs, scope, "rhs");
						return transform(arg(1, "rhs"), scope, (rhs) => {
							const [rhsFirst, rhsAfter] = reuseExpression(rhs, scope, "rhs");
							const result = uniqueName(scope, comparison);
							const i = uniqueName(scope, "i");
							return statements([
								addVariable(scope, result, parseType("Bool"), undefined),
								ifStatement(
									binaryExpression("!==",
										memberExpression(lhsFirst, identifier("length")),
										memberExpression(rhsFirst, identifier("length"))
									),
									blockStatement(ignore(set(lookup(result, scope), expr(literal(comparison === "unequal")), scope), scope)),
									blockStatement(concat(
										[
											addVariable(scope, i, parseType("Int"), literal(0)),
											whileStatement(
												logicalExpression("&&",
													binaryExpression("<",
														read(lookup(i, scope), scope),
														memberExpression(lhsAfter, identifier("length"))
													),
													binaryExpression("===",
														memberExpression(lhsAfter, read(lookup(i, scope), scope), true),
														memberExpression(rhsAfter, read(lookup(i, scope), scope), true)
													),
												),
												blockStatement([
													expressionStatement(updateExpression("++", read(lookup(i, scope), scope))),
												])
											),
										],
										ignore(set(
											lookup(result, scope),
											expr(binaryExpression(comparison === "unequal" ? "!==" : "===",
												read(lookup(i, scope), scope),
												memberExpression(lhsAfter, identifier("length"))
											)),
											scope
										), scope),
									))
								),
								returnStatement(read(lookup(result, scope), scope)),
							]);
						});
					});
				});
			}
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
					// TODO: Fill in proper init
					"init": wrapped((scope, arg) => call(expr(memberExpression(identifier("Array"), identifier("from"))), [arg(0, "iterable")], [dummyType], scope)),
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
						return call(pushExpression, [newElement], [valueType], scope);
					}),
					"insert(at:)": wrapped((scope, arg) => {
						const array = arg(1, "array");
						const newElement = copy(arg(2, "newElement"), valueType);
						const i = arg(3, "i");
						return call(functionValue("Swift.(swift-to-js).arrayInsertAt()", undefined, { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] }), [array, newElement, i], [dummyType, valueType, dummyType], scope);
					}),
					"remove(at:)": wrapped((scope, arg) => {
						const array = arg(1, "array");
						const i = arg(2, "i");
						return call(functionValue("Swift.(swift-to-js).arrayRemoveAt()", undefined, { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] }), [array, i], [dummyType, valueType], scope);
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
					"joined(separator:)": (scope, arg, type) => {
						return callable((innerScope, innerArg) => {
							return transform(arg(1, "collection"), innerScope, (collection) => {
								return call(
									expr(memberExpression(collection, identifier("join"))),
									[innerArg(0, "separator")],
									[dummyType],
									scope,
								);
							});
						}, returnType(type));
					},
				} as FunctionMap),
				conformances: applyDefaultConformances({
					Equatable: {
						"==": arrayCompare("equal"),
						"!=": arrayCompare("unequal"),
					},
					BidirectionalCollection: {
						"joined(separator:)": (scope, arg, type) => {
							return callable((innerScope, innerArg) => {
								return transform(arg(1, "collection"), innerScope, (collection) => {
									return call(
										expr(memberExpression(collection, identifier("join"))),
										[innerArg(0, "separator")],
										[dummyType],
										scope,
									);
								});
							}, returnType(type));
						},
					},
				}, globalScope),
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
						const id = uniqueName(scope, "value");
						// TODO: Fill in addVariable
						//addVariable();
						const converter = functionExpression(undefined, [identifier(id)], blockStatement([returnStatement(read(reified.copy(expr(identifier(id)), scope), scope))]));
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
					conformances: applyDefaultConformances({
						// TODO: Implement Equatable
						Equatable: {
						},
					}, globalScope),
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
		"Error": cachedBuilder((globalScope) => primitive(PossibleRepresentation.Number, expr(literal(0)), [
			field("hashValue", reifyType("Int", globalScope), (value) => value),
		], {
		})),
		"ClosedRange": cachedBuilder(() => primitive(PossibleRepresentation.Array, tuple([expr(literal(0)), expr(literal(0))]), [], {
			map: (scope, arg, type) => {
				const range = arg(2, "range");
				return callable((innerScope, innerArg) => {
					const mapped = uniqueName(innerScope, "mapped");
					const callback = innerArg(0, "callback");
					return statements(concat(
						[addVariable(innerScope, mapped, dummyType, arrayExpression([]), DeclarationFlags.Const)],
						closedRangeIterate(range, innerScope, (i) => blockStatement([
							expressionStatement(callExpression(memberExpression(read(lookup(mapped, scope), scope), identifier("push")), [read(call(callback, [i], [dummyType], scope), scope)])),
						])),
						[returnStatement(read(lookup(mapped, scope), scope))]
					));
				}, returnType(type));
			},
			reduce: (scope, arg, type) => {
				const range = arg(2, "range");
				return callable((innerScope, innerArg) => {
					const result = uniqueName(innerScope, "result");
					const initialResult = innerArg(0, "initialResult");
					const next = innerArg(1, "next");
					return statements(concat(
						[addVariable(innerScope, result, dummyType, read(initialResult, scope))],
						closedRangeIterate(range, innerScope, (i) => blockStatement(
							ignore(set(lookup(result, scope), call(next, [lookup(result, scope), i], [dummyType, dummyType], scope), scope), scope),
						)),
						[returnStatement(read(lookup(result, scope), scope))],
					));
				}, returnType(type));
			},
		}, {
			// TODO: Implement Equatable
			Equatable: {
				"==": wrapped(binaryBuiltin("===", 0)),
				"!=": wrapped(binaryBuiltin("!==", 0)),
			},
		})),
	} as TypeMap);
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
	return call(functionValue("Swift.(swift-to-js).arrayBoundsFailed()", undefined, { kind: "function", arguments: voidType, return: voidType, throws: true, rethrows: false, attributes: [] }), [], [], scope);
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
		return call(expr(identifier("Sequence$reduce")), [arg(0)], [dummyType], scope);
	}, returnType(type)),
	"??": returnTodo,
	"~=": (scope, arg) => expr(binaryExpression("===", read(arg(1, "pattern"), scope), read(arg(2, "value"), scope))),
	"print(_:separator:terminator:)": (scope, arg, type) => call(expr(memberExpression(identifier("console"), identifier("log"))), [arg(0, "items")], [dummyType], scope),
	"precondition(_:_:file:line:)": (scope, arg, type) => statements([
		ifStatement(
			unaryExpression("!", read(call(arg(0, "condition"), [], [], scope), scope)),
			blockStatement([
				expressionStatement(identifier("debugger")),
				throwStatement(newExpression(identifier("Error"), [
					read(call(arg(1, "message"), [], [], scope), scope),
					read(arg(2, "file"), scope),
					read(arg(3, "line"), scope),
				])),
			]),
		),
	]),
	"preconditionFailed(_:file:line:)": (scope, arg, type) => statements([
		expressionStatement(identifier("debugger")),
		throwStatement(newExpression(identifier("Error"), [
			read(call(arg(0, "message"), [], [], scope), scope),
			read(arg(1, "file"), scope),
			read(arg(2, "line"), scope),
		])),
	]),
	"fatalError(_:file:line:)": (scope, arg, type) => statements([
		expressionStatement(identifier("debugger")),
		throwStatement(newExpression(identifier("Error"), [
			read(call(arg(0, "message"), [], [], scope), scope),
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
