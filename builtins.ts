import { abstractMethod, noinline, wrapped, wrappedSelf, FunctionBuilder } from "./functions";
import { expressionSkipsCopy, inheritLayout, primitive, protocol, reifyType, FunctionMap, PossibleRepresentation, ProtocolConformance, ProtocolConformanceMap, ReifiedType, TypeMap } from "./reified";
import { addVariable, lookup, mangleName, uniqueName, DeclarationFlags, MappedNameValue, Scope } from "./scope";
import { Function, Tuple } from "./types";
import { concat, lookupForMap } from "./utils";
import { array, binary, call, callable, conditional, conformance, copy, expr, expressionLiteralValue, functionValue, hasRepresentation, ignore, isPure, literal, logical, member, read, reuse, set, statements, stringifyValue, transform, tuple, typeFromValue, typeTypeValue, typeValue, unary, undefinedValue, update, updateOperatorForBinaryOperator, ArgGetter, BinaryOperator, ExpressionValue, Value } from "./values";

import { arrayPattern, blockStatement, breakStatement, expressionStatement, forInStatement, forStatement, functionExpression, identifier, ifStatement, isLiteral, newExpression, returnStatement, throwStatement, updateExpression, variableDeclaration, variableDeclarator, whileStatement, Identifier, Node, Statement } from "@babel/types";

function returnOnlyArgument(scope: Scope, arg: ArgGetter): Value {
	return arg(0, "value");
}

function returnTodo(scope: Scope, arg: ArgGetter, name: string): Value {
	console.error(name);
	return call(expr(mangleName("todo_missing_builtin$" + name)), [], [], scope);
}

function unavailableFunction(scope: Scope, arg: ArgGetter, name: string): Value {
	throw new Error(`${name} is not available`);
}

function binaryBuiltin(operator: BinaryOperator, typeArgumentCount: number, valueChecker?: (value: Value, scope: Scope) => Value) {
	return (scope: Scope, arg: ArgGetter) => {
		const unchecked = binary(operator,
			arg(typeArgumentCount, "lhs"),
			arg(typeArgumentCount + 1, "rhs"),
			scope,
		);
		return typeof valueChecker !== "undefined" ? valueChecker(unchecked, scope) : unchecked;
	};
}

function updateBuiltin(operator: keyof typeof updateOperatorForBinaryOperator, typeArgumentCount: number, valueChecker?: (value: Value, scope: Scope) => Value) {
	if (typeof valueChecker !== "undefined") {
		return (scope: Scope, arg: ArgGetter) => update(arg(typeArgumentCount, "target"), scope, (value) => valueChecker(binary(operator, value, arg(typeArgumentCount + 1, "value"), scope), scope));
	}
	return (scope: Scope, arg: ArgGetter) => set(arg(typeArgumentCount, "target"), arg(typeArgumentCount + 1, "value"), scope, updateOperatorForBinaryOperator[operator]);
}

const readLengthField = wrapped((scope: Scope, arg: ArgGetter) => {
	return member(arg(0, "self"), "length", scope);
}, "(Any) -> Int");

const isEmptyFromLength = wrapped((scope: Scope, arg: ArgGetter) => {
	return binary("!==", member(arg(0, "self"), "length", scope), literal(0), scope);
}, "(Any) -> Bool");

const startIndexOfZero = wrapped((scope: Scope, arg: ArgGetter) => {
	return literal(0);
}, "(Any) -> Int");

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
	const range: NumericRange = { min: literal(min), max: literal(max) };
	const widerHigh: NumericRange = checked ? { min: literal(min), max: literal(max + 1) } : range;
	const widerLow: NumericRange = checked ? { min: literal(min - 1), max: literal(max) } : range;
	const widerBoth: NumericRange = checked ? { min: literal(min - 1), max: literal(max + 1) } : range;
	const integerTypeName = min < 0 ? "SignedInteger" : "UnsignedInteger";
	function initExactly(outerScope: Scope, outerArg: ArgGetter): Value {
		const sourceTypeArg = outerArg(0, "T");
		return callable((scope: Scope, arg: ArgGetter) => {
			const sourceIntConformance = conformance(sourceTypeArg, integerTypeName, scope);
			const source = rangeForNumericType(sourceIntConformance, scope);
			const requiresGreaterThanCheck = possiblyGreaterThan(source, range, scope);
			const requiresLessThanCheck = possiblyLessThan(source, range, scope);
			if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
				return arg(0, "value");
			}
			return reuseArgs(arg, 0, scope, ["value"], (value) => {
				let check;
				if (requiresGreaterThanCheck && requiresLessThanCheck) {
					check = logical(
						"||",
						binary(">", value, range.min, scope),
						binary("<", value, range.max, scope),
						scope,
					);
				} else if (requiresGreaterThanCheck) {
					check = binary(">", value, range.max, scope);
				} else if (requiresLessThanCheck) {
					check = binary("<", value, range.min, scope);
				} else {
					return value;
				}
				return conditional(
					check,
					literal(null),
					value,
					scope,
				);
			});
		}, "(Self) -> Self");
	}
	const customStringConvertibleConformance: ProtocolConformance = {
		functions: {
			description: wrapped((scope, arg) => call(expr(identifier("String")), [arg(0, "self")], ["Self"], scope), "(Self) -> String"),
		},
		requirements: [],
	};
	const hashableConformance: ProtocolConformance = {
		functions: {
			hashValue: wrapped((scope, arg) => arg(0, "self"), "(Self) -> Int"),
		},
		requirements: [],
	};
	const equatableConformance: ProtocolConformance = {
		functions: {
			"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
			"!=": wrapped(binaryBuiltin("!==", 0), "(Self, Self) -> Bool"),
		},
		requirements: [],
	};
	const numericConformance: ProtocolConformance = {
		functions: {
			"init(exactly:)": initExactly,
			"+": wrapped(binaryBuiltin("+", 0, (value, scope) => integerRangeCheck(scope, value, widerHigh, range)), "(Self, Self) -> Self"),
			"-": wrapped(binaryBuiltin("-", 0, (value, scope) => integerRangeCheck(scope, value, widerLow, range)), "(Self, Self) -> Self"),
			"*": wrapped(binaryBuiltin("*", 0, (value, scope) => integerRangeCheck(scope, value, widerBoth, range)), "(Self, Self) -> Self"),
		},
		requirements: [],
	};
	const signedNumericConformance: ProtocolConformance = {
		functions: {
			"-": wrapped((scope, arg) => unary("-", arg(0, "value"), scope), "(Self) -> Self"),
		},
		requirements: [],
	};
	const comparableConformance: ProtocolConformance = {
		functions: {
			"<": wrapped(binaryBuiltin("<", 0), "(Self, Self) -> Bool"),
			">": wrapped(binaryBuiltin(">", 0), "(Self, Self) -> Bool"),
			"<=": wrapped(binaryBuiltin("<=", 0), "(Self, Self) -> Bool"),
			">=": wrapped(binaryBuiltin(">=", 0), "(Self, Self) -> Bool"),
		},
		requirements: [],
	};
	const strideableConformance: ProtocolConformance = {
		functions: {
			"+": wrapped((scope, arg) => integerRangeCheck(scope, binary("+", arg(0, "lhs"), arg(1, "rhs"), scope), widerHigh, range), "(Self, Self) -> Self"),
			"-": wrapped((scope, arg) => integerRangeCheck(scope, binary("-", arg(0, "lhs"), arg(1, "rhs"), scope), widerLow, range), "(Self, Self) -> Self"),
			"...": wrapped((scope, arg) => {
				return tuple([arg(0, "start"), arg(1, "end")]);
			}, "(Self, Self) -> Self"),
			"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
		},
		requirements: [],
	};
	const binaryIntegerConformance: ProtocolConformance = {
		functions: {
			"init(exactly:)": initExactly,
			"init(truncatingIfNeeded:)": abstractMethod,
			"init(clamping:)": abstractMethod,
			"/": wrapped((scope, arg) => binary("|", binary("/", arg(0, "lhs"), arg(1, "rhs"), scope), literal(0), scope), "(Self, Self) -> Self"),
			"%": wrapped((scope, arg) => binary("%", arg(0, "lhs"), arg(1, "rhs"), scope), "(Self, Self) -> Self"),
			"+": wrapped((scope, arg) => integerRangeCheck(scope, binary("+", arg(0, "lhs"), arg(1, "rhs"), scope), widerHigh, range), "(Self, Self) -> Self"),
			"-": wrapped((scope, arg) => integerRangeCheck(scope, binary("-", arg(0, "lhs"), arg(1, "rhs"), scope), widerLow, range), "(Self, Self) -> Self"),
			"*": wrapped((scope, arg) => integerRangeCheck(scope, binary("*", arg(0, "lhs"), arg(1, "rhs"), scope), widerBoth, range), "(Self, Self) -> Self"),
			"~": wrapped((scope, arg) => wrap(unary("~", arg(0, "self"), scope), scope), "(Self) -> Self"),
			">>": wrapped((scope, arg) => binary(">>", arg(0, "lhs"), arg(1, "rhs"), scope), "(Self, Self) -> Self"),
			"<<": wrapped((scope, arg) => binary("<<", arg(0, "lhs"), arg(1, "rhs"), scope), "(Self, Self) -> Self"), // TODO: Implement shift left
			"<": wrapped(binaryBuiltin("<", 0), "(Self, Self) -> Bool"),
			">": wrapped(binaryBuiltin(">", 0), "(Self, Self) -> Bool"),
			"<=": wrapped(binaryBuiltin("<=", 0), "(Self, Self) -> Bool"),
			">=": wrapped(binaryBuiltin(">=", 0), "(Self, Self) -> Bool"),
			"&": wrapped(binaryBuiltin("&", 0), "(Self, Self) -> Self"),
			"|": wrapped(binaryBuiltin("|", 0), "(Self, Self) -> Self"),
			"^": wrapped(binaryBuiltin("^", 0), "(Self, Self) -> Self"),
			"quotientAndRemainder(dividingBy:)": wrapped((scope, arg) => {
				return reuseArgs(arg, 0, scope, ["lhs", "rhs"], (lhs, rhs) => {
					return tuple([
						binary("|", binary("/", lhs, rhs, scope), literal(0), scope),
						binary("%", lhs, rhs, scope),
					]);
				});
			}, "(Self, Self) -> (Self, Self)"),
			"signum": wrapped((scope, arg) => {
				return reuseArgs(arg, 0, scope, ["self"], (int) => {
					if (min < 0) {
						return conditional(
							binary(">", int, literal(0), scope),
							literal(1),
							conditional(
								binary("<", int, literal(0), scope),
								literal(-1),
								int,
								scope,
							),
							scope,
						);
					} else {
						return conditional(
							binary(">", int, literal(0), scope),
							literal(1),
							int,
							scope,
						);
					}
				});
			}, "(Self) -> Self"),
			"isSigned": wrapped((scope, arg) => {
				return literal(min < 0);
			}, "() -> Bool"),
		},
		requirements: [],
	};
	const fixedWidthIntegerConformance: ProtocolConformance = {
		functions: {
			"&+": wrapped(binaryBuiltin("+", 0, wrap), "(Self, Self) -> Self"),
			"&*": wrapped(binaryBuiltin("*", 0, wrap), "(Self, Self) -> Self"),
			"&-": wrapped(binaryBuiltin("-", 0, wrap), "(Self, Self) -> Self"),
			"&<<": wrapped(binaryBuiltin("<<", 0, wrap), "(Self, Self) -> Self"),
			"&>>": wrapped(binaryBuiltin(">>", 0, wrap), "(Self, Self) -> Self"),
		},
		requirements: [],
	};
	const integerConformance: ProtocolConformance = {
		functions: {
			"min": wrapped(() => {
				return literal(min);
			}, "() -> Int"),
			"max": wrapped(() => {
				return literal(max);
			}, "() -> Int"),
			"init(_:)": (outerScope, outerArg, type) => {
				const sourceTypeArg = outerArg(0, "T");
				return callable((scope, arg) => {
					const sourceType = conformance(sourceTypeArg, integerTypeName, scope);
					return integerRangeCheck(
						scope,
						arg(0, "value"),
						rangeForNumericType(sourceType, scope),
						range,
					);
				}, "(Self) -> Self");
			},
			"init(exactly:)": initExactly,
			"&-": wrapped(binaryBuiltin("-", 0, wrap), "(Self, Self) -> Self"),
		},
		requirements: [],
	};
	const reifiedType: ReifiedType = {
		functions: lookupForMap({
			"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument, "(Self) -> Self"),
			"init(clamping:)": (scope: Scope, arg: ArgGetter, name: string) => {
				const source = rangeForNumericType(conformance(arg(0, "T"), integerTypeName, scope), scope);
				return callable((innerScope, innerArg) => {
					const requiresGreaterThanCheck = possiblyGreaterThan(source, range, scope);
					const requiresLessThanCheck = possiblyLessThan(source, range, scope);
					if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
						return innerArg(0, "value");
					}
					return reuse(innerArg(0, "value"), innerScope, "value", (value) => {
						if (requiresGreaterThanCheck && requiresLessThanCheck) {
							return conditional(
								binary(">", value, range.max, innerScope),
								range.max,
								conditional(
									binary("<", value, range.min, innerScope),
									range.min,
									value,
									innerScope,
								),
								innerScope,
							);
						} else if (requiresGreaterThanCheck) {
							return conditional(
								binary(">", value, range.max, innerScope),
								range.max,
								value,
								innerScope,
							);
						} else {
							return conditional(
								binary("<", value, range.min, innerScope),
								range.min,
								value,
								innerScope,
							);
						}
					});
				}, "(Self) -> Self");
			},
			"+": wrapped((scope, arg) => integerRangeCheck(scope, binary("+", arg(0, "lhs"), arg(1, "rhs"), scope), widerHigh, range), "(Self, Self) -> Self"),
			"-": wrapped((scope, arg, type, argTypes) => {
				if (argTypes.length === 1) {
					return integerRangeCheck(scope, unary("-", arg(0, "value"), scope), widerLow, range);
				}
				return integerRangeCheck(scope, binary("-", arg(0, "lhs"), arg(1, "rhs"), scope), widerLow, range);
			}, "(Self) -> Self"),
			"*": wrapped((scope, arg) => integerRangeCheck(scope, binary("*", arg(0, "lhs"), arg(1, "rhs"), scope), widerBoth, range), "(Self, Self) -> Self"),
			"/": wrapped((scope, arg) => binary("|", binary("/", arg(0, "lhs"), arg(1, "rhs"), scope), literal(0), scope), "(Self, Self) -> Self"),
			"%": wrapped(binaryBuiltin("%", 0), "(Self, Self) -> Self"),
			"<": wrapped(binaryBuiltin("<", 0), "(Self, Self) -> Bool"),
			">": wrapped(binaryBuiltin(">", 0), "(Self, Self) -> Bool"),
			"<=": wrapped(binaryBuiltin("<=", 0), "(Self, Self) -> Bool"),
			">=": wrapped(binaryBuiltin(">=", 0), "(Self, Self) -> Bool"),
			"&": wrapped(binaryBuiltin("&", 0), "(Self, Self) -> Self"),
			"|": wrapped(binaryBuiltin("|", 0), "(Self, Self) -> Self"),
			"^": wrapped(binaryBuiltin("^", 0), "(Self, Self) -> Self"),
			"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
			"!=": wrapped(binaryBuiltin("!==", 0), "(Self, Self) -> Bool"),
			"+=": wrapped(updateBuiltin("+", 0), "(inout Self, Self) -> Void"),
			"-=": wrapped(updateBuiltin("-", 0), "(inout Self, Self) -> Void"),
			"*=": wrapped(updateBuiltin("*", 0), "(inout Self, Self) -> Void"),
			"...": wrapped((scope, arg) => {
				return tuple([arg(0, "start"), arg(1, "end")]);
			}, "(Self, Self) -> Self.Stride"),
			"hashValue": wrapped((scope, arg) => {
				return arg(0, "self");
			}, "(Self) -> Int"),
			"min": wrapped(() => {
				return literal(min);
			}, "(Type) -> Self"),
			"max": wrapped(() => {
				return literal(max);
			}, "(Type) -> Self"),
		} as FunctionMap),
		conformances: applyDefaultConformances({
			Hashable: hashableConformance,
			Equatable: equatableConformance,
			Comparable: comparableConformance,
			BinaryInteger: binaryIntegerConformance,
			Numeric: numericConformance,
			[integerTypeName]: integerConformance,
			SignedNumeric: signedNumericConformance,
			FixedWidthInteger: fixedWidthIntegerConformance,
			Strideable: strideableConformance,
			CustomStringConvertible: customStringConvertibleConformance,
			LosslessStringConvertible: {
				functions: {
					"init(_:)": wrapped((scope, arg) => {
						const input = read(arg(0, "description"), scope);
						const value = expressionLiteralValue(input);
						if (typeof value === "string") {
							const convertedValue = parseInt(value, 10);
							return literal(isNaN(convertedValue) ? null : convertedValue);
						}
						const result = uniqueName(scope, "integer");
						return statements([
							addVariable(scope, result, "Int", call(expr(identifier("parseInt")), [
								expr(input),
								literal(10),
							], ["String", "Int"], scope), DeclarationFlags.Const),
							returnStatement(
								read(conditional(
									binary("!==",
										lookup(result, scope),
										lookup(result, scope),
										scope,
									),
									literal(null),
									lookup(result, scope),
									scope,
								), scope),
							),
						]);
					}, "(String) -> Self?"),
				},
				requirements: [],
			},
		}, globalScope),
		possibleRepresentations: PossibleRepresentation.Number,
		defaultValue() {
			return literal(0);
		},
		innerTypes: {
		},
	};
	return reifiedType;
}

function buildFloatingType(globalScope: Scope): ReifiedType {
	const reifiedType: ReifiedType = {
		functions: lookupForMap({
			"init(_:)": wrapped(returnOnlyArgument, "(Self) -> Self"),
			"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument, "(Self) -> Self"),
			"init(_builtinFloatLiteral:)": wrapped(returnOnlyArgument, "(Self) -> Self"),
			"+": wrapped((scope, arg, type) => binary("+", arg(0, "lhs"), arg(1, "rhs"), scope), "(Self, Self) -> Self"),
			"-": wrapped((scope, arg, type, argTypes) => {
				if (argTypes.length === 1) {
					return unary("-", arg(0, "value"), scope);
				}
				return binary("-", arg(0, "lhs"), arg(1, "rhs"), scope);
			}, "(Self, Self) -> Self"),
			"*": wrapped((scope, arg, type) => binary("*", arg(0, "lhs"), arg(1, "rhs"), scope), "(Self, Self) -> Self"),
			"/": wrapped((scope, arg, type) => binary("/", arg(0, "lhs"), arg(1, "rhs"), scope), "(Self, Self) -> Self"),
			"%": wrapped(binaryBuiltin("%", 0), "(Self, Self) -> Self"),
			"<": wrapped(binaryBuiltin("<", 0), "(Self, Self) -> Bool"),
			">": wrapped(binaryBuiltin(">", 0), "(Self, Self) -> Bool"),
			"<=": wrapped(binaryBuiltin("<=", 0), "(Self, Self) -> Bool"),
			">=": wrapped(binaryBuiltin(">=", 0), "(Self, Self) -> Bool"),
			"&": wrapped(binaryBuiltin("&", 0), "(Self, Self) -> Self"),
			"|": wrapped(binaryBuiltin("|", 0), "(Self, Self) -> Self"),
			"^": wrapped(binaryBuiltin("^", 0), "(Self, Self) -> Self"),
			"+=": wrapped(updateBuiltin("+", 0), "(inout Self, Self) -> Void"),
			"-=": wrapped(updateBuiltin("-", 0), "(inout Self, Self) -> Void"),
			"*=": wrapped(updateBuiltin("*", 0), "(inout Self, Self) -> Void"),
			"/=": wrapped(updateBuiltin("/", 0), "(inout Self, Self) -> Void"),
			"hashValue": wrapped((scope, arg) => {
				// TODO: Find a good hash strategy for floating point types
				return binary("|", arg(0, "float"), literal(0), scope);
			}, "(Self) -> Int"),
		} as FunctionMap),
		conformances: applyDefaultConformances({
			Equatable: {
				functions: {
					"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
					"!=": wrapped(binaryBuiltin("!==", 0), "(Self, Self) -> Bool"),
				},
				requirements: [],
			},
			SignedNumeric: {
				functions: {
					"-": wrapped((scope, arg) => unary("-", arg(0, "value"), scope), "(Self) -> Self"),
				},
				requirements: [],
			},
			FloatingPoint: {
				functions: {
					"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
					"!=": wrapped(binaryBuiltin("!==", 0), "(Self, Self) -> Bool"),
					"squareRoot()": (scope, arg, type) => {
						return callable(() => call(member("Math", "sqrt", scope), [arg(0, "value")], ["Double"], scope), "() -> Self");
					},
				},
				requirements: [],
			},
			LosslessStringConvertible: {
				functions: {
					"init(_:)": wrapped((scope, arg) => {
						const input = read(arg(0, "description"), scope);
						const value = expressionLiteralValue(input);
						if (typeof value === "string") {
							const convertedValue = Number(value);
							return literal(isNaN(convertedValue) ? null : convertedValue);
						}
						const result = uniqueName(scope, "number");
						return statements([
							addVariable(scope, result, "Int", call(expr(identifier("Number")), [
								expr(input),
							], ["String"], scope), DeclarationFlags.Const),
							returnStatement(
								read(conditional(
									binary("===",
										lookup(result, scope),
										lookup(result, scope),
										scope,
									),
									literal(null),
									lookup(result, scope),
									scope,
								), scope),
							),
						]);
					}, "(String) -> Self?"),
				},
				requirements: [],
			},
		}, globalScope),
		possibleRepresentations: PossibleRepresentation.Number,
		defaultValue() {
			return literal(0);
		},
		innerTypes: {
			Type: cachedBuilder(() => primitive(PossibleRepresentation.Undefined, undefinedValue)),
		},
	};
	return reifiedType;
}

function resolveMethod(type: Value, name: string, scope: Scope, additionalArgs: Value[] = [], additionalTypes: Value[] = []) {
	const functionBuilder = typeFromValue(type, scope).functions(name);
	if (typeof functionBuilder !== "function") {
		throw new TypeError(`Could not find ${name} in ${stringifyValue(type)}`);
	}
	return functionBuilder(scope, (i) => {
		if (i === 0) {
			return type;
		}
		if (i > additionalArgs.length) {
			throw new RangeError(`Asked for argument ${i}, but only ${additionalArgs.length} are available (shifted for hidden protocol self value)`);
		}
		return additionalArgs[i - 1];
	}, name, concat([typeValue("Type")], additionalTypes));
}

interface NumericRange {
	min: Value;
	max: Value;
}

function rangeForNumericType(type: Value, scope: Scope): NumericRange {
	return {
		min: call(resolveMethod(type, "min", scope), [], [], scope),
		max: call(resolveMethod(type, "max", scope), [], [], scope),
	};
}

function possiblyGreaterThan(left: NumericRange, right: NumericRange, scope: Scope): boolean {
	const leftMax = expressionLiteralValue(read(left.max, scope));
	const rightMax = expressionLiteralValue(read(right.max, scope));
	return typeof leftMax !== "number" || typeof rightMax !== "number" || leftMax > rightMax;
}

function possiblyLessThan(left: NumericRange, right: NumericRange, scope: Scope): boolean {
	const leftMin = expressionLiteralValue(read(left.min, scope));
	const rightMin = expressionLiteralValue(read(right.min, scope));
	return typeof leftMin !== "number" || typeof rightMin !== "number" || leftMin < rightMin;
}

function integerRangeCheck(scope: Scope, value: Value, source: NumericRange, dest: NumericRange) {
	const requiresGreaterThanCheck = possiblyGreaterThan(source, dest, scope);
	const requiresLessThanCheck = possiblyLessThan(source, dest, scope);
	if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
		return value;
	}
	const expression = read(value, scope);
	const constant = expressionLiteralValue(expression);
	const constantMin = expressionLiteralValue(read(dest.min, scope));
	const constantMax = expressionLiteralValue(read(dest.max, scope));
	if (typeof constant === "number" && typeof constantMin === "number" && typeof constantMax === "number" && constant >= constantMin && constant <= constantMax) {
		return expr(expression);
	}
	return reuse(expr(expression), scope, "integer", (reusableValue) => {
		let check;
		if (requiresGreaterThanCheck && requiresLessThanCheck) {
			check = logical(
				"||",
				binary("<", reusableValue, dest.min, scope),
				binary(">", reusableValue, dest.max, scope),
				scope,
			);
		} else if (requiresGreaterThanCheck) {
			check = binary(">", reusableValue, dest.max, scope);
		} else {
			check = binary("<", reusableValue, dest.min, scope);
		}
		const functionType: Function = { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] };
		return conditional(
			check,
			call(functionValue("Swift.(swift-to-js).numericRangeFailed()", undefined, functionType), [], [], scope),
			reusableValue,
			scope,
		);
	});
}

function closedRangeIterate(range: Value, scope: Scope, body: (value: Value) => Statement): Statement[] {
	let end;
	const contents = [];
	const i = uniqueName(scope, "i");
	if (range.kind === "tuple" && range.values.length === 2) {
		contents.push(addVariable(scope, i, "Int", range.values[0]));
		const endExpression = read(range.values[1], scope);
		if (isPure(endExpression)) {
			end = expr(endExpression);
		} else {
			const endIdentifier = uniqueName(scope, "end");
			contents.push(addVariable(scope, endIdentifier, "Int", expr(endExpression)));
			end = lookup(endIdentifier, scope);
		}
	} else {
		addVariable(scope, i, "Int");
		const iExpression = read(lookup(i, scope), scope);
		if (iExpression.type !== "Identifier") {
			throw new TypeError(`Expected i to be an identifier, got a ${iExpression.type}`);
		}
		const endIdentifier = uniqueName(scope, "end");
		addVariable(scope, endIdentifier, "Int");
		const endIdentifierExpression = read(lookup(endIdentifier, scope), scope);
		if (endIdentifierExpression.type !== "Identifier") {
			throw new TypeError(`Expected end to be an identifier, got a ${endIdentifierExpression.type}`);
		}
		contents.push(variableDeclaration("const", [variableDeclarator(arrayPattern([iExpression, endIdentifierExpression]), read(range, scope))]));
		end = lookup(endIdentifier, scope);
	}
	const result = forStatement(
		contents.length === 1 ? contents[0] : undefined,
		read(binary("<=", lookup(i, scope), end, scope), scope),
		updateExpression("++", read(lookup(i, scope), scope)),
		body(lookup(i, scope)),
	);
	if (contents.length === 1) {
		return [result];
	} else {
		return concat(contents as Statement[], [result]);
	}
}

function adaptedMethod(otherMethodName: string, conformanceName: string | undefined, otherType: Function | string, adapter: (otherValue: Value, scope: Scope, type: Value, arg: ArgGetter) => Value, ourType: Function | string) {
	return wrapped((scope, arg, type) => {
		const conformedType = typeof conformanceName !== "undefined" ? conformance(type, conformanceName, scope) : type;
		const otherMethod = call(functionValue(otherMethodName, conformedType, otherType), [type], [typeTypeValue], scope);
		return adapter(otherMethod, scope, type, arg);
	}, ourType);
}

function updateMethod(otherMethodName: string, conformanceName: string | undefined) {
	return adaptedMethod(otherMethodName, conformanceName, "(Self, Self) -> Self", (targetMethod, scope, type, arg) => {
		const lhs = arg(0, "lhs");
		const rhs = arg(1, "rhs");
		return set(lhs, call(targetMethod, [lhs, rhs], [type, type], scope), scope);
	}, "(inout Self, Self) -> Void");
}

function applyDefaultConformances(conformances: ProtocolConformanceMap, scope: Scope): ProtocolConformanceMap {
	const result: ProtocolConformanceMap = Object.create(null);
	for (const key of Object.keys(conformances)) {
		const reified = reifyType(key, scope);
		if (!Object.hasOwnProperty.call(reified.conformances, key)) {
			throw new TypeError(`${key} is not a protocol`);
		}
		const base = conformances[key];
		result[key] = {
			functions: {...reified.conformances[key].functions, ...base.functions},
			requirements: base.requirements,
		};
	}
	return result;
}

function reuseArgs<T extends string[]>(arg: ArgGetter, offset: number, scope: Scope, names: T, callback: (...values: { [P in keyof T]: ExpressionValue | MappedNameValue }) => Value): Value {
	if (names.length === 0) {
		return (callback as () => Value)();
	}
	const [name, ...remaining] = names;
	if (names.length === 1) {
		return reuse(arg(offset, name), scope, name, callback as unknown as (value: ExpressionValue | MappedNameValue) => Value);
	}
	return reuse(arg(offset, name), scope, name, (value) => reuseArgs(arg, offset + 1, scope, remaining, callback.bind(null, value)));
}

const dummyType = typeValue({ kind: "name", name: "Dummy" });

export interface BuiltinConfiguration {
	checkedIntegers: boolean;
	simpleStrings: boolean;
}

function defaultTypes({ checkedIntegers, simpleStrings }: BuiltinConfiguration): TypeMap {
	const protocolTypes: TypeMap = Object.create(null);
	function addProtocol(name: string, functionMap: { [functionName: string]: FunctionBuilder } = Object.create(null), ...requirements: string[]) {
		const result = protocol({
			[name]: {
				functions: functionMap,
				requirements,
			},
		});
		protocolTypes[name] = () => result;
	}

	addProtocol("Equatable", {
		"==": abstractMethod,
		"!=": adaptedMethod("==", "Equatable", "(Self, Self) -> Bool", (equalsMethod, scope, type, arg) => unary("!", call(equalsMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), scope), "(Self, Self) -> Bool"),
		"~=": adaptedMethod("==", "Equatable", "(Self, Self) -> Bool", (equalsMethod, scope, type, arg) => call(equalsMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), "(Self, Self) -> Bool"),
	});
	addProtocol("Comparable", {
		"<": abstractMethod,
		">": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => call(lessThanMethod, [arg(1, "rhs"), arg(0, "lhs")], [type, type], scope), "(Self, Self) -> Bool"),
		"<=": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => unary("!", call(lessThanMethod, [arg(1, "rhs"), arg(0, "lhs")], [type, type], scope), scope), "(Self, Self) -> Bool"),
		">=": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => unary("!", call(lessThanMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), scope), "(Self, Self) -> Bool"),
	}, "Equatable");
	addProtocol("ExpressibleByIntegerLiteral", {
		"init(integerLiteral:)": abstractMethod,
	});
	addProtocol("ExpressibleByFloatLiteral", {
		"init(floatLiteral:)": abstractMethod,
	});
	addProtocol("Numeric", {
		"init(exactly:)": abstractMethod,
		"+": abstractMethod,
		"+=": updateMethod("+", "Numeric"),
		"-": abstractMethod,
		"-=": updateMethod("-", "Numeric"),
		"*": abstractMethod,
		"*=": updateMethod("*", "Numeric"),
	}, "Equatable", "ExpressibleByIntegerLiteral");
	addProtocol("SignedNumeric", {
		"-": adaptedMethod("-", "Numeric", "(Self, Self) -> Self", (subtractMethod, scope, type, arg) => {
			// TODO: Call ExpressibleByIntegerLiteral
			return call(subtractMethod, [literal(0), arg(0, "self")], ["Int", type], scope);
		}, "(Self) -> Self"),
		"negate": adaptedMethod("-", "SignedNumeric", "(Self, Self) -> Self", (negateMethod, scope, type, arg) => {
			return reuseArgs(arg, 0, scope, ["self"], (self) => {
				return set(self, call(negateMethod, [self], [type], scope), scope);
			});
		}, "(inout Self) -> Void"),
	}, "Numeric");
	addProtocol("BinaryInteger", {
		"init(exactly:)": abstractMethod,
		"init(truncatingIfNeeded:)": abstractMethod,
		"init(clamping:)": abstractMethod,
		"/": abstractMethod,
		"/=": updateMethod("/", "BinaryInteger"),
		"%": abstractMethod,
		"%=": updateMethod("%", "BinaryInteger"),
		"+": abstractMethod,
		"+=": updateMethod("+", "BinaryInteger"),
		"-": abstractMethod,
		"-=": updateMethod("-", "BinaryInteger"),
		"*": abstractMethod,
		"*=": updateMethod("*", "BinaryInteger"),
		"~": abstractMethod,
		"&": abstractMethod,
		"&=": updateMethod("&", "BinaryInteger"),
		"|": abstractMethod,
		"|=": updateMethod("|", "BinaryInteger"),
		"^": abstractMethod,
		"^=": updateMethod("^", "BinaryInteger"),
		">>": abstractMethod,
		">>=": updateMethod(">>", "BinaryInteger"),
		"<<": abstractMethod,
		"<<=": updateMethod("<<", "BinaryInteger"),
		"quotientAndRemainder(dividingBy:)": abstractMethod,
		"signum": abstractMethod,
		"isSigned": abstractMethod,
	}, "CustomStringConvertible", "Hashable", "Numeric", "Strideable");
	addProtocol("SignedInteger", {
		"max": abstractMethod,
		"min": abstractMethod,
		"&+": abstractMethod,
		"&-": abstractMethod,
	}, "BinaryInteger", "SignedNumeric");
	addProtocol("UnsignedInteger", {
		max: abstractMethod,
		min: abstractMethod,
		magnitude: abstractMethod,
	}, "BinaryInteger", "SignedNumeric");
	addProtocol("FixedWidthInteger", {
		"max": abstractMethod,
		"min": abstractMethod,
		"init(_:radix)": abstractMethod,
		"init(bigEndian:)": abstractMethod,
		"init(littleEndian:)": abstractMethod,
		"bigEndian": abstractMethod,
		"byteSwapped": abstractMethod,
		"leadingZeroBitCount": abstractMethod,
		"littleEndian": abstractMethod,
		"nonzeroBitCount": abstractMethod,
		"bitWidth": abstractMethod,
		"addingReportingOverflow(_:)": abstractMethod,
		"dividedReportingOverflow(by:)": abstractMethod,
		"dividingFullWidth(_:)": abstractMethod,
		"multipliedFullWidth(by:)": abstractMethod,
		"multipliedReportingOverflow(by:)": abstractMethod,
		"remainderReportingOverflow(dividingBy:)": abstractMethod,
		"subtractingReportingOverflow(_:)": abstractMethod,
		"&*": abstractMethod,
		"&*=": abstractMethod,
		"&+": abstractMethod,
		"&+=": abstractMethod,
		"&-": abstractMethod,
		"&-=": abstractMethod,
		"&<<": abstractMethod,
		"&<<=": abstractMethod,
		"&>>": abstractMethod,
		"&>>=": abstractMethod,
	}, "BinaryInteger", "LosslessStringConvertible");
	addProtocol("FloatingPoint", {
		"init(_:)": abstractMethod,
		// properties
		"exponent": abstractMethod,
		"floatingPointClass": abstractMethod,
		"isCanonical": abstractMethod,
		"isFinite": abstractMethod,
		"isInfinite": abstractMethod,
		"isNaN": abstractMethod,
		"isSignalingNaN": abstractMethod,
		"isSubnormal": abstractMethod,
		"isZero": abstractMethod,
		"nextDown": abstractMethod,
		"nextUp": abstractMethod,
		"sign": abstractMethod,
		"significand": abstractMethod,
		"ulp": abstractMethod,
		// static properties
		"greatestFiniteMagnitude": abstractMethod,
		"infinity": abstractMethod,
		"leastNonzeroMagnitude": abstractMethod,
		"leastNormalMagnitude": abstractMethod,
		"nan": abstractMethod,
		"pi": abstractMethod,
		"radix": abstractMethod,
		"signalingNaN": abstractMethod,
		"ulpOfOne": abstractMethod,
		// methods
		"addProduct(_:_:)": abstractMethod,
		"addingProduct(_:_:)": abstractMethod,
		"formRemainder(dividingBy:)": abstractMethod,
		"formSquareRoot(_:)": abstractMethod,
		"formTruncatingRemainder(dividingBy:)": abstractMethod,
		"isEqual(to:)": abstractMethod,
		"isLess(than:)": abstractMethod,
		"isLessThanOrEqualTo(_:)": abstractMethod,
		"isTotallyOrdered(belowOrEqualTo:)": abstractMethod,
		"negate()": abstractMethod,
		"remainder(dividingBy:)": abstractMethod,
		"round()": abstractMethod,
		"round(_:)": abstractMethod,
		"rounded()": abstractMethod,
		"rounded(_:)": abstractMethod,
		"squareRoot()": abstractMethod,
		"truncatingRemainder(dividingBy:)": abstractMethod,
		// static methods
		"maximum(_:_:)": abstractMethod,
		"maximumMagnitude(_:_:)": abstractMethod,
		"minimum(_:_:)": abstractMethod,
		"minimumMagnitude(_:_:)": abstractMethod,
		// operators
		"*": abstractMethod,
		"*=": abstractMethod,
		"+": abstractMethod,
		"+=": abstractMethod,
		"-": abstractMethod,
		"-=": abstractMethod,
		"/": abstractMethod,
		"/=": abstractMethod,
		"==": abstractMethod,
	}, "Hashable", "SignedNumeric", "Strideable");
	addProtocol("BinaryFloatingPoint", {
		// initializers
		"init(_:)": abstractMethod,
		"init(exactly:)": abstractMethod,
		"init(sign:exponentBitPattern:significandBitPattern:)": abstractMethod,
		// properties
		"binade": abstractMethod,
		"exponentBitPattern": abstractMethod,
		"significandBitPattern": abstractMethod,
		"significandWidth": abstractMethod,
		// static properties
		"exponentBitCount": abstractMethod,
		"significandBitCount": abstractMethod,
	}, "ExpressibleByFloatLiteral", "FloatingPoint");
	addProtocol("Sequence", {
		"makeIterator()": abstractMethod,
		"contains(_:)": adaptedMethod("contains(where:)", "Sequence", "(Self, (Self.Element) -> Bool) -> Bool", (containsWhere, scope, type, arg) => {
			return call(
				containsWhere,
				[
					arg(0, "sequence"),
					callable((innerScope, innerArg) => {
						// TODO: Check if equal
						return literal(true);
					}, "(Self.Element) -> Bool"),
				],
				[
					"Self",
					"(Self.Element) -> Bool",
				],
				scope,
			);
		}, "(Self, Self.Element) -> Bool"),
		"contains(where:)": abstractMethod,
		"first(where:)": abstractMethod,
		"min()": abstractMethod,
		"min(by:)": abstractMethod,
		"max()": abstractMethod,
		"max(by:)": abstractMethod,
		"dropFirst()": abstractMethod,
		"dropLast()": abstractMethod,
		"sorted()": abstractMethod,
		"sorted(by:)": abstractMethod,
		"reversed()": abstractMethod,
		"underestimatedCount": abstractMethod,
		"allSatisfy(_:)": abstractMethod,
	});
	addProtocol("Collection", {
		"subscript(_:)": abstractMethod,
		"startIndex": abstractMethod,
		"endIndex": abstractMethod,
		"index(after:)": abstractMethod,
		"index(_:offsetBy:)": wrappedSelf((scope, arg, type, collection) => {
			const collectionType = conformance(type, "Collection", scope);
			const indexType = typeValue("Self.Index");
			return reuseArgs(arg, 0, scope, ["index", "distance"], (index, distance) => {
				const current = uniqueName(scope, "current");
				const i = uniqueName(scope, "i");
				return statements([
					addVariable(scope, current, "Self.Index", index),
					forStatement(
						addVariable(scope, i, "Int", literal(0)),
						read(binary("<", lookup(i, scope), distance, scope), scope),
						read(set(lookup(i, scope), literal(1), scope, "+="), scope),
						blockStatement(
							ignore(
								set(
									lookup(current, scope),
									call(
										resolveMethod(collectionType, "index(after:)", scope, [collection], [type]),
										[lookup(current, scope)],
										[indexType],
										scope,
									),
									scope,
								),
								scope,
							),
						),
					),
					returnStatement(read(lookup(current, scope), scope)),
				]);
			});
		}, "(Self, Self.Index, Int) -> Self.Index"),
		"index(_:offsetBy:limitedBy:)": wrappedSelf((scope, arg, type, collection) => {
			const collectionType = conformance(type, "Collection", scope);
			const indexType = typeValue("Self.Index");
			return reuseArgs(arg, 0, scope, ["index", "distance", "limit"], (index, distance, limit) => {
				const current = uniqueName(scope, "current");
				const i = uniqueName(scope, "i");
				return statements([
					addVariable(scope, current, "Self.Index", index),
					forStatement(
						addVariable(scope, i, "Int", literal(0)),
						read(logical("&&",
							binary("<", lookup(i, scope), distance, scope),
							call(
								resolveMethod(conformance(indexType, "Equatable", scope), "!=", scope),
								[lookup(current, scope), limit],
								[indexType, indexType],
								scope,
							),
							scope,
						), scope),
						read(set(lookup(i, scope), literal(1), scope, "+="), scope),
						blockStatement(
							ignore(
								set(
									lookup(current, scope),
									call(
										resolveMethod(collectionType, "index(after:)", scope, [collection], [type]),
										[lookup(current, scope)],
										[indexType],
										scope,
									),
									scope,
								),
								scope,
							),
						),
					),
					returnStatement(read(lookup(current, scope), scope)),
				]);
			});
		}, "(Self, Self.Index, Int, Self.Index) -> Self.Index"),
		"distance(from:to:)": wrappedSelf((scope, arg, type, collection) => {
			const collectionType = conformance(type, "Collection", scope);
			const indexType = typeValue("Self.Index");
			const indexTypeEquatable = conformance(indexType, "Equatable", scope);
			return reuseArgs(arg, 0, scope, ["start", "end"], (start, end) => {
				const current = uniqueName(scope, "current");
				const count = uniqueName(scope, "count");
				return statements([
					addVariable(scope, current, "Self.Index", start),
					addVariable(scope, count, "Int", literal(0)),
					whileStatement(
						read(call(
							resolveMethod(indexTypeEquatable, "!=", scope),
							[lookup(current, scope), end],
							[indexType, indexType],
							scope,
						), scope),
						blockStatement(concat(
							ignore(set(lookup(count, scope), literal(1), scope, "+="), scope),
							ignore(
								set(
									lookup(current, scope),
									call(
										resolveMethod(collectionType, "index(after:)", scope, [collection], [type]),
										[lookup(current, scope)],
										[indexType],
										scope,
									),
									scope,
								),
								scope,
							),
						)),
					),
					returnStatement(read(lookup(count, scope), scope)),
				]);
			});
		}, "(Self, Self.Index, Self.Index) -> Int"),
		"count": wrapped((scope, arg, type) => {
			return reuseArgs(arg, 0, scope, ["collection"], (collection) => {
				const collectionType = conformance(type, "Collection", scope);
				const indexType = typeValue("Self.Index");
				return call(
					call(
						functionValue("distance(from:to:)", collectionType, "(Type, Self) -> (Self.Index, Self.Index) -> Self.Index"),
						[type, collection],
						["Type", type],
						scope,
					),
					[
						call(resolveMethod(collectionType, "startIndex", scope), [collection], ["Self"], scope),
						call(resolveMethod(collectionType, "endIndex", scope), [collection], ["Self"], scope),
					],
					[
						indexType,
						indexType,
					],
					scope,
				);
			});
		}, "(Self) -> Int"),
		"formIndex(after:)": wrapped((scope, arg, type) => {
			const indexType = typeValue("Self.Index");
			const collectionType = conformance(type, "Collection", scope);
			return reuseArgs(arg, 0, scope, ["collection", "index"], (collection, index) => {
				return set(
					index,
					call(
						resolveMethod(collectionType, "index(after:)", scope, [collection], [type]),
						[index],
						[indexType],
						scope,
					),
					scope,
				);
			});
		}, "(Self, inout Self.Index) -> Void"),
		"formIndex(_:offsetBy:)": wrapped((scope, arg, type) => {
			const indexType = typeValue("Self.Index");
			const collectionType = conformance(type, "Collection", scope);
			return reuseArgs(arg, 0, scope, ["collection", "index", "distance"], (collection, index, distance) => {
				return set(
					index,
					call(
						resolveMethod(collectionType, "index(_:offsetBy:)", scope, [collection], [type]),
						[index, distance],
						[indexType, "Int"],
						scope,
					),
					scope,
				);
			});
		}, "(Self, inout Self.Index, Int) -> Void"),
		"formIndex(_:offsetBy:limitedBy:)": wrapped((scope, arg, type) => {
			const indexType = typeValue("Self.Index");
			const collectionType = conformance(type, "Collection", scope);
			return reuseArgs(arg, 0, scope, ["collection", "index", "distance", "limit"], (collection, index, distance, limit) => {
				return set(
					index,
					call(
						resolveMethod(collectionType, "index(_:offsetBy:limitedBy:)", scope, [collection], [type]),
						[index, distance, limit],
						[indexType, "Int", indexType],
						scope,
					),
					scope,
				);
			});
		}, "(Self, inout Self.Index, Int, Self.Index) -> Void"),
		"lazy": abstractMethod,
		"first": wrapped((scope, arg, type) => {
			return reuseArgs(arg, 0, scope, ["collection"], (collection) => {
				const collectionType = conformance(type, "Collection", scope);
				const elementType = typeValue("Self.Element");
				return conditional(
					call(resolveMethod(collectionType, "isEmpty", scope), [collection], ["Self"], scope),
					wrapInOptional(
						call(
							resolveMethod(collectionType, "subscript(_:)", scope),
							[collection, call(resolveMethod(collectionType, "startIndex", scope), [collection], ["Self"], scope)],
							["Self", "Self.Index"],
							scope,
						),
						elementType,
						scope,
					),
					emptyOptional(elementType, scope),
					scope,
				);
			});
		}, "(Self) -> Self.Element?"),
		"isEmpty": wrapped((scope, arg, type) => {
			return reuseArgs(arg, 0, scope, ["collection"], (collection) => {
				const collectionType = conformance(type, "Collection", scope);
				const indexType = typeValue("Self.Index");
				return call(
					resolveMethod(conformance(indexType, "Equatable", scope), "!=", scope),
					[
						call(resolveMethod(collectionType, "endIndex", scope), [collection], ["Self"], scope),
						call(resolveMethod(collectionType, "startIndex", scope), [collection], ["Self"], scope),
					],
					[
						indexType,
						indexType,
					],
					scope,
				);
			});
		}, "(Self) -> Bool"),
		"makeIterator()": abstractMethod,
		"prefix(upTo:)": abstractMethod,
		"prefix(through:)": wrappedSelf((scope, arg, type, self) => {
			const collectionType = conformance(type, "Collection", scope);
			const indexType = typeValue("Self.Index");
			return reuseArgs(arg, 0, scope, ["position"], (position) => {
				return call(
					call(
						functionValue("prefix(upTo:)", collectionType, "(Collection) -> (Self.Index) -> Self.SubSequence"),
						[type, self],
						["Type", type],
						scope,
					),
					[
						call(
							resolveMethod(collectionType, "index(after:)", scope, [self], [type]),
							[position],
							[indexType],
							scope,
						),
					],
					[
						indexType,
					],
					scope,
				);
			});
		}, "(Self, Self.Index) -> Self.SubSequence"),
	}, "Sequence");
	addProtocol("BidirectionalCollection", {
		"index(before:)": abstractMethod,
		"formIndex(before:)": wrapped((scope, arg, type) => {
			const indexType = typeValue("Self.Index");
			const collectionType = conformance(type, "BidirectionalCollection", scope);
			return reuseArgs(arg, 0, scope, ["collection", "index"], (collection, index) => {
				return set(
					index,
					call(
						resolveMethod(collectionType, "index(before:)", scope, [collection], [type]),
						[index],
						[indexType],
						scope,
					),
					scope,
				);
			});
		}, "(Self, inout Self.Index) -> Void"),
	}, "Collection");
	addProtocol("Strideable", {
		"+": abstractMethod,
		"+=": abstractMethod,
		"-": abstractMethod,
		"-=": abstractMethod,
		"==": abstractMethod,
		"...": abstractMethod,
		"distance(to:)": adaptedMethod("-", "Strideable", "(Self, Self) -> Self", (subtractMethod, scope, type, arg) => {
			return call(subtractMethod, [arg(1, "rhs"), arg(0, "lhs")], [type, type], scope);
		}, "(Self, Self) -> Bool"),
		"advanced(by:)": adaptedMethod("+", "Strideable", "(Self, Self) -> Self", (addMethod, scope, type, arg) => {
			return call(addMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope);
		}, "(Self, Self) -> Bool"),
	}, "Comparable");
	addProtocol("Hashable", {
		"hashValue": abstractMethod,
		"hash(into:)": adaptedMethod("hashValue", "Hashable", "(Self) -> Int", (hashValueMethod, scope, type, arg) => {
			return reuse(call(hashValueMethod, [arg(0, "self")], ["Self"], scope), scope, "hashValue", (hashValue) => {
				const hasherType = typeValue("Hasher");
				const combine = call(functionValue("combine()", hasherType, "(Type) -> (inout Hasher, Int) -> Void"), [hasherType], [typeTypeValue], scope);
				return call(combine, [arg(1, "hasher"), hashValue], ["Hasher", "Int"], scope);
			});
		}, "(Self, inout Hasher) -> Bool"),
	}, "Equatable");
	addProtocol("CustomStringConvertible", {
		description: abstractMethod,
	});
	addProtocol("LosslessStringConvertible", {
		"init(_:)": abstractMethod,
	}, "CustomStringConvertible");

	const BoolType = cachedBuilder((globalScope: Scope) => primitive(PossibleRepresentation.Boolean, literal(false), {
		"init(_builtinBooleanLiteral:)": wrapped(returnOnlyArgument, "(Bool) -> Bool"),
		"init(_:)": wrapped((scope, arg) => {
			// Optional init from string
			return reuseArgs(arg, 0, scope, ["string"], (stringValue) => {
				return logical("||",
					binary("===",
						stringValue,
						literal("True"),
						scope,
					),
					logical("&&",
						binary("!==",
							stringValue,
							literal("False"),
							scope,
						),
						literal(null),
						scope,
					),
					scope,
				);
			});
		}, "(String) -> Self?"),
		"_getBuiltinLogicValue()": (scope, arg, type) => callable(() => arg(0, "literal"), "() -> Int1"),
		"&&": wrapped((scope, arg) => logical("&&", arg(0, "lhs"), call(arg(1, "rhs"), [], [], scope), scope), "(Bool, () -> Bool) -> Bool"),
		"||": wrapped((scope, arg) => logical("||", arg(0, "lhs"), call(arg(1, "rhs"), [], [], scope), scope), "(Bool, () -> Bool) -> Bool"),
		"!": wrapped((scope, arg) => unary("!", arg(0, "value"), scope), "(Self) -> Bool"),
		"random": wrapped((scope, arg) => binary("<", call(member("Math", "random", scope), [], [], scope), literal(0.5), scope), "() -> Bool"),
		"description": wrapped((scope, arg) => {
			return conditional(arg(0, "self"), literal("True"), literal("False"), scope);
		}, "(Bool) -> String"),
	}, applyDefaultConformances({
		Equatable: {
			functions: {
				"==": wrapped(binaryBuiltin("===", 0), "(Bool, Bool) -> Bool"),
				"!=": wrapped(binaryBuiltin("!==", 0), "(Bool, Bool) -> Bool"),
			},
			requirements: [],
		},
	}, globalScope), {
		Type: cachedBuilder(() => primitive(PossibleRepresentation.Undefined, undefinedValue)),
	}));

	return {
		...protocolTypes,
		Bool: BoolType,
		Int1: BoolType,
		UInt: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 4294967295, checkedIntegers, (value, scope) => binary(">>>", value, literal(0), scope))),
		Int: cachedBuilder((globalScope) => buildIntegerType(globalScope, -2147483648, 2147483647, checkedIntegers, (value, scope) => binary("|", value, literal(0), scope))),
		UInt8: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 255, checkedIntegers, (value, scope) => binary("&", value, literal(0xFF), scope))),
		Int8: cachedBuilder((globalScope) => buildIntegerType(globalScope, -128, 127, checkedIntegers, (value, scope) => binary(">>", binary("<<", value, literal(24), scope), literal(24), scope))),
		UInt16: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 65535, checkedIntegers, (value, scope) => binary("&", value, literal(0xFFFF), scope))),
		Int16: cachedBuilder((globalScope) => buildIntegerType(globalScope, -32768, 32767, checkedIntegers, (value, scope) => binary(">>", binary("<<", value, literal(16), scope), literal(16), scope))),
		UInt32: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 4294967295, checkedIntegers, (value, scope) => binary(">>>", value, literal(0), scope))),
		Int32: cachedBuilder((globalScope) => buildIntegerType(globalScope, -2147483648, 2147483647, checkedIntegers, (value, scope) => binary("|", value, literal(0), scope))),
		UInt64: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, Number.MAX_SAFE_INTEGER, checkedIntegers, (value) => value)), // 52-bit integers
		Int64: cachedBuilder((globalScope) => buildIntegerType(globalScope, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, checkedIntegers, (value) => value)), // 53-bit integers
		Float: cachedBuilder(buildFloatingType),
		Double: cachedBuilder(buildFloatingType),
		String: cachedBuilder((globalScope) => {
			const UnicodeScalarView = primitive(PossibleRepresentation.Array, literal([]), {
				count: wrapped((scope, arg) => {
					return member(arg(0, "view"), "length", scope);
				}, "(Self) -> Int"),
				startIndex: wrapped((scope, arg) => {
					return literal(0);
				}, "(Self) -> Int"),
				endIndex: wrapped((scope, arg) => {
					return member(arg(0, "view"), "length", scope);
				}, "(Self) -> Int"),
			});
			const UTF16View = primitive(PossibleRepresentation.String, literal(""), {
				count: wrapped((scope, arg) => {
					return member(arg(0, "view"), "length", scope);
				}, "(Self) -> Int"),
				startIndex: wrapped((scope, arg) => {
					return literal(0);
				}, "(Self) -> Int"),
				endIndex: wrapped((scope, arg) => {
					return member(arg(0, "view"), "length", scope);
				}, "(Self) -> Int"),
			});
			const UTF8View = primitive(PossibleRepresentation.Array, literal([]), {
				count: wrapped((scope, arg) => {
					return member(arg(0, "view"), "length", scope);
				}, "(Self) -> Int"),
				startIndex: wrapped((scope, arg) => {
					return literal(0);
				}, "(Self) -> Int"),
				endIndex: wrapped((scope, arg) => {
					return member(arg(0, "view"), "length", scope);
				}, "(Self) -> Int"),
			});
			const hashValue = wrapped((scope, arg) => {
				return reuseArgs(arg, 0, scope, ["string"], (str) => {
					const hash = uniqueName(scope, "hash");
					const i = uniqueName(scope, "i");
					return statements([
						addVariable(scope, hash, "Int", literal(0)),
						forStatement(
							addVariable(scope, i, "Int", literal(0)),
							read(binary("<", lookup(i, scope), member(str, "length", scope), scope), scope),
							updateExpression("++", mangleName(i)),
							blockStatement(
								ignore(set(
									lookup(hash, scope),
									binary("-",
										binary("+",
											binary("<<",
												lookup(hash, scope),
												literal(5),
												scope,
											),
											call(member(str, "charCodeAt", scope), [lookup(i, scope)], ["Int"], scope),
											scope,
										),
										lookup(hash, scope),
										scope,
									),
									scope,
								), scope),
							),
						),
						returnStatement(read(binary("|", lookup(hash, scope), literal(0), scope), scope)),
					]);
				});
			}, "(String) -> Int");
			const collectionFunctions: FunctionMap = {
				"startIndex": wrapped((scope, arg) => {
					return literal(0);
				}, "(Self) -> Self.Index"),
				"endIndex": wrapped((scope, arg) => {
					return member(arg(0, "string"), "length", scope);
				}, "(Self) -> Self.Index"),
				"prefix(upTo:)": wrappedSelf((scope, arg, type, self) => {
					return call(
						member(self, "substring", scope),
						[literal(0), arg(0, "end")],
						["Int", "Int"],
						scope,
					);
				}, "(Self, Self.Index) -> Self.SubSequence"),
			};
			if (simpleStrings) {
				collectionFunctions["subscript(_:)"] = wrapped((scope, arg) => {
					return stringBoundsCheck(arg(0, "str"), arg(1, "i"), scope, "read");
				}, "(Self, Self.Index) -> Self.Element");
				collectionFunctions["index(after:)"] = (scope, arg, name) => {
					const arg0 = arg(1, "string");
					return callable((innerScope, innerArg, length) => {
						return reuse(arg0, innerScope, "string", (str) => {
							return reuseArgs(innerArg, 0, innerScope, ["index"], (index) => {
								return conditional(
									binary(">",
										member(str, "length", innerScope),
										index,
										scope,
									),
									binary("+", index, literal(1), innerScope),
									stringBoundsFailed(innerScope),
									innerScope,
								);
							});
						});
					}, "(String, String.Index) -> String.Index");
				};
				collectionFunctions.count = wrapped((scope, arg) => {
					return member(arg(0, "string"), "length", scope);
				}, "(String) -> Int");
				collectionFunctions["distance(from:to:)"] = wrappedSelf((scope, arg, type) => {
					return reuseArgs(arg, 0, scope, ["start"], (start) => {
						return binary("-", arg(1, "end"), start, scope);
					});
				}, "(Self, Self.Index, Self.Index) -> Int");
				collectionFunctions["index(_:offsetBy:)"] = wrappedSelf((scope, arg, type, collection) => {
					return reuseArgs(arg, 0, scope, ["index", "distance"], (index, distance) => {
						return reuse(binary("+", index, distance, scope), scope, "result", (result) => {
							return conditional(
								binary(">", result, member(collection, "length", scope), scope),
								stringBoundsFailed(scope),
								result,
								scope,
							);
						});
					});
				}, "(Self, Self.Index, Int) -> Self.Index");
				collectionFunctions["index(_:offsetBy:limitedBy:)"] = wrappedSelf((scope, arg, type, collection) => {
					return reuseArgs(arg, 0, scope, ["index", "distance", "limit"], (index, distance, limit) => {
						return reuse(binary("+", index, distance, scope), scope, "result", (result) => {
							return conditional(
								binary(">", result, limit, scope),
								limit,
								conditional(
									binary(">", result, member(collection, "length", scope), scope),
									stringBoundsFailed(scope),
									result,
									scope,
								),
								scope,
							);
						});
					});
				}, "(Self, Self.Index, Int) -> Self.Index");
			} else {
				collectionFunctions["subscript(_:)"] = wrapped((scope, arg) => {
					return stringBoundsCheck(arg(0, "str"), arg(1, "i"), scope, "read");
				}, "(Self, Self.Index) -> Self.Element");
				collectionFunctions["index(after:)"] = (scope, arg, name) => {
					const arg0 = arg(1, "string");
					return callable((innerScope, innerArg, length) => {
						return reuse(arg0, innerScope, "string", (str) => {
							return reuseArgs(innerArg, 0, innerScope, ["index"], (index) => {
								return conditional(
									binary(">",
										member(str, "length", innerScope),
										index,
										scope,
									),
									binary("+", index, literal(1), innerScope),
									stringBoundsFailed(innerScope),
									innerScope,
								);
							});
						});
					}, "(String, String.Index) -> String.Index");
				};
			}
			return primitive(PossibleRepresentation.String, literal(""), {
				"init()": wrapped((scope, arg) => literal(""), "(String) -> String"),
				"init(_:)": wrapped((scope, arg) => call(expr(identifier("String")), [arg(0, "value")], [typeValue("String")], scope), "(String) -> String"),
				"init(repeating:count:)": wrapped((scope, arg) => {
					return reuseArgs(arg, 0, scope, ["source", "count"], (source, count) => {
						const result = uniqueName(scope, "result");
						const i = uniqueName(scope, "i");
						return statements([
							addVariable(scope, result, "String", literal("")),
							forStatement(
								addVariable(scope, i, "Int", literal(0)),
								read(binary("<",
									lookup(i, scope),
									count,
									scope,
								), scope),
								updateExpression("++", read(lookup(i, scope), scope)),
								blockStatement(
									ignore(set(lookup(result, scope), source, scope, "+="), scope),
								),
							),
							returnStatement(read(lookup(result, scope), scope)),
						]);
					});
				}, "(String, Int) -> String"),
				"+": wrapped(binaryBuiltin("+", 0), "(String, String) -> String"),
				"+=": wrapped((scope, arg) => {
					return set(arg(0, "lhs"), arg(1, "rhs"), scope, "+=");
				}, "(inout String, String) -> Void"),
				"write(_:)": wrapped((scope, arg) => {
					return set(arg(0, "lhs"), arg(1, "rhs"), scope, "+=");
				}, "(inout String, String) -> Void"),
				"append(_:)": wrapped((scope, arg) => {
					return set(arg(0, "lhs"), arg(1, "rhs"), scope, "+=");
				}, "(inout String, String) -> Void"),
				"insert(_:at:)": wrapped((scope, arg) => {
					return reuseArgs(arg, 0, scope, ["string", "character", "index"], (self, character, index) => {
						return set(
							self,
							binary(
								"+",
								binary(
									"+",
									call(member(self, "substring", scope), [literal(0), index], ["Int", "Int"], scope),
									character,
									scope,
								),
								call(member(self, "substring", scope), [index], ["Int"], scope),
								scope,
							),
							scope,
						);
					});
				}, "(inout String, Character, Int) -> Void"),
				// "insert(contentsOf:at:)": wrapped((scope, arg) => {
				// }, "(inout String, ?, String.Index) -> Void"),
				// "replaceSubrange(_:with:)": wrapped((scope, arg) => {
				// }, "(inout String, ?, ?) -> Void"),
				"remove(at:)": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string", "index"], (self, index) => {
						const removed = uniqueName(scope, "removed");
						return statements(concat(
							[addVariable(scope, removed, "String", member(self, index, scope)) as Statement],
							ignore(set(
								self,
								binary(
									"+",
									call(member(self, "substring", scope), [literal(0), index], ["Int", "Int"], scope),
									call(member(self, "substring", scope), [binary("+", index, literal(1), scope)], ["Int"], scope),
									scope,
								),
								scope,
							), scope),
							[returnStatement(read(lookup(removed, scope), scope))],
						));
					});
				}, "(inout String, String.Index) -> Character"),
				"removeAll(keepingCapacity:)": wrapped((scope, arg) => {
					return set(arg(0, "string"), literal(""), scope);
				}, "(inout String, Bool) -> Void"),
				// "removeAll(where:)": wrapped((scope, arg) => {
				// 	return reuseArgs(arg, 0, scope, ["string", "predicate"], (string, predicate) => {
				// 	});
				// }, "(inout String, (Character) throws -> Bool) rethrows -> Void"),
				"removeFirst()": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (self) => {
						const first = uniqueName(scope, "first");
						return statements(concat(
							[addVariable(scope, first, "Character", member(self, 0, scope)) as Statement],
							ignore(set(
								self,
								call(member(self, "substring", scope), [literal(1)], ["Int"], scope),
								scope,
							), scope),
							[returnStatement(read(lookup(first, scope), scope))],
						));
						return member(arg(0, "string"), 0, scope);
					});
				}, "(inout String) -> Character"),
				"removeFirst(_:)": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (self) => {
						return set(
							self,
							call(member(self, "substring", scope), [arg(1, "k")], ["Int"], scope),
							scope,
						);
					});
				}, "(inout String, Int) -> Void"),
				"removeLast()": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (self) => {
						const index = uniqueName(scope, "index");
						const last = uniqueName(scope, "last");
						return statements(concat(
							[
								addVariable(scope, index, "Int", binary("-", member(self, "length", scope), literal(1), scope)) as Statement,
								addVariable(scope, last, "Character", member(self, lookup(index, scope), scope)) as Statement,
							],
							ignore(set(
								self,
								call(
									member(self, "substring", scope),
									[binary("-", member(self, "length", scope), lookup(index, scope), scope)],
									["Int"],
									scope,
								),
								scope,
							), scope),
							[returnStatement(read(lookup(last, scope), scope))],
						));
						return member(arg(0, "string"), 0, scope);
					});
				}, "(inout String) -> Character"),
				"removeLast(_:)": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (self) => {
						return set(
							self,
							call(
								member(self, "substring", scope),
								[binary("-", member(self, "length", scope), arg(1, "k"), scope)],
								["Int"],
								scope,
							),
							scope,
						);
					});
				}, "(inout String, Int) -> Void"),
				// "removeSubrange()": wrapped((scope, arg) => {
				// }, "(inout String, Range<String.Index>) -> Void"),
				// "filter(_:)": wrapped((scope, arg) => {
				// }, "(String, (Character) -> Bool) -> String"),
				// "drop(while:)": wrapped((scope, arg) => {
				// }, "(String, (Character) -> Bool) -> Substring"),
				"dropFirst()": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return call(
						member(arg(0, "string"), "substring", scope),
						[literal(1)],
						["Int"],
						scope,
					);
				}, "(String) -> Void"),
				"dropFirst(_:)": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return call(
						member(arg(0, "string"), "substring", scope),
						[arg(1, "k")],
						["Int"],
						scope,
					);
				}, "(String, Int) -> Void"),
				"dropLast()": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (self) => {
						return call(
							member(self, "substring", scope),
							[binary("-", member(self, "length", scope), literal(1), scope)],
							["Int"],
							scope,
						);
					});
				}, "(String) -> Void"),
				"dropLast(_:)": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (self) => {
						return call(
							member(self, "substring", scope),
							[binary("-", member(self, "length", scope), arg(1, "k"), scope)],
							["Int"],
							scope,
						);
					});
				}, "(String, Int) -> Void"),
				"popLast()": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (self) => {
						const characterType = typeValue("Character");
						return conditional(
							binary("!==", member(self, "length", scope), literal(0), scope),
							wrapInOptional(member(self, binary("-", member(self, "length", scope), literal(1), scope), scope), characterType, scope),
							emptyOptional(characterType, scope),
							scope,
						);
					});
				}, "(inout String) -> Character?"),
				"hasPrefix(_:)": wrapped((scope, arg) => {
					return call(member(arg(0, "string"), "hasPrefix", scope), [arg(1, "prefix")], ["String"], scope);
				}, "(String, String) -> Bool"),
				"hasSuffix(_:)": wrapped((scope, arg) => {
					return call(member(arg(0, "string"), "hasSuffix", scope), [arg(1, "suffix")], ["String"], scope);
				}, "(String, String) -> Bool"),
				"contains(_:)": wrapped((scope, arg) => {
					return binary("!==",
						call(member(arg(0, "string"), "indexOf", scope), [arg(1, "element")], ["Character"], scope),
						literal(0),
						scope,
					);
				}, "(String, Character) -> Bool"),
				// "allSatisfy(_:)": wrapped((scope, arg) => {
				// }, "(String, (Character) throws -> Bool) rethrows -> Bool"),
				// "contains(where:)": wrapped((scope, arg) => {
				// }, "(String, (Character) -> Bool) -> Bool"),
				// "first(where:)": wrapped((scope, arg) => {
				// }, "(String, (Character) -> Bool) -> Character?"),
				"subscript(_:)": wrapped((scope, arg) => {
					return stringBoundsCheck(arg(0, "str"), arg(1, "i"), scope, "read");
				}, "(String, String.Index) -> Character"),
				"firstIndex(of:)": wrapped((scope, arg) => {
					const index = call(member(arg(0, "string"), "indexOf", scope), [arg(1, "element")], ["Character"], scope);
					return reuse(index, scope, "index", (reusedIndex) => {
						const indexType = typeValue("Int");
						return conditional(
							binary("!==", reusedIndex, literal(-1), scope),
							wrapInOptional(reusedIndex, indexType, scope),
							emptyOptional(indexType, scope),
							scope,
						);
					});
				}, "(String, Character) -> String.Index?"),
				// "firstIndex(where:)": wrapped((scope, arg) => {
				// }, "(String, (Character) throws -> Bool) rethrows -> String.Index?"),
				"index(after:)": (scope, arg, name) => {
					const arg1 = arg(0, "string");
					return callable((innerScope, innerArg, length) => {
						return reuse(arg1, innerScope, "string", (str) => {
							return reuseArgs(innerArg, 0, innerScope, ["string"], (index) => {
								return conditional(
									binary(">",
										member(str, "length", innerScope),
										index,
										scope,
									),
									binary("+", index, literal(1), innerScope),
									stringBoundsFailed(innerScope),
									innerScope,
								);
							});
						});
					}, "(String, String.Index) -> String.Index");
				},
				"formIndex(after:)": wrapped((scope, arg) => {
					// TODO: Use grapheme clusters
					return set(arg(1, "index"), literal(1), scope, "+=");
				}, "(String, inout String.Index) -> Void"),
				"index(before:)": wrapped((scope, arg) => {
					// TODO: Use grapheme clusters
					return reuseArgs(arg, 0, scope, ["index"], (index) => {
						return conditional(
							index,
							binary("-", index, literal(1), scope),
							stringBoundsFailed(scope),
							scope,
						);
					});
				}, "(String, String.Index) -> String.Index"),
				"formIndex(before:)": wrapped((scope, arg) => {
					// TODO: Use grapheme clusters
					return set(arg(1, "index"), literal(1), scope, "-=");
				}, "(String, inout String.Index) -> Void"),
				"index(_:offsetBy:)": wrapped((scope, arg) => {
					// TODO: Use grapheme clusters
					return binary("+", arg(1, "index"), arg(2, "distance"), scope);
				}, "(String, String.Index, String.IndexDistance) -> String.Index"),
				"index(_:offsetBy:limitedBy:)": wrapped((scope, arg) => {
					// TODO: Use grapheme clusters
					return reuseArgs(arg, 1, scope, ["i", "distance"], (i, distance) => {
						return reuse(binary("+", i, distance, scope), scope, "result", (result) => {
							const indexType = typeValue("String.Index");
							return conditional(
								conditional(
									binary(">",
										distance,
										literal(0),
										scope,
									),
									binary(">",
										result,
										arg(3, "limit"),
										scope,
									),
									binary("<",
										result,
										arg(3, "limit"),
										scope,
									),
									scope,
								),
								emptyOptional(indexType, scope),
								wrapInOptional(result, indexType, scope),
								scope,
							);
						});
					});
				}, "(String, String.Index, String.IndexDistance, String.Index) -> String.Index?"),
				"distance(from:to:)": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 1, scope, ["from"], (from) => {
						return binary("-", arg(2, "to"), from, scope);
					});
				}, "(String, String.Index, String.Index) -> String.IndexDistance"),
				// "prefix(while:)": wrapped((scope, arg) => {
				// }, "(String, (Character) -> Bool) -> Substring"),
				"suffix(from:)": wrapped((scope, arg) => {
					return call(
						member(arg(0, "string"), "substring", scope),
						[arg(1, "start")],
						["Int"],
						scope,
					);
				}, "(String, String.Index) -> Substring"),
				"split(separator:maxSplits:omittingEmptySubsequences:)": wrapped((scope, arg) => {
					return reuseArgs(arg, 0, scope, ["string", "separator", "maxSplits", "omittingEmptySubsequences"], (str, separator, maxSplits, omittingEmptySubsequences) => {
						const omitting = expressionLiteralValue(read(omittingEmptySubsequences, scope));
						if (omitting === false) {
							return call(
								member(str, "split", scope),
								[separator, maxSplits],
								["Character", "Int"],
								scope,
							);
						}
						throw new Error(`String.split(separator:maxSplits:omittingEmptySubsequences:) with omittingEmptySubsequences !== false not implemented yet`);
					});
				}, "(String, Character, Int, Bool) -> [Substring]"),
				"lowercased()": (scope, arg, type) => callable(() => call(member(arg(0, "value"), "toLowerCase", scope), [], [], scope), "(String) -> String"),
				"uppercased()": (scope, arg, type) => callable(() => call(member(arg(0, "value"), "toUpperCase", scope), [], [], scope), "(String) -> String"),
				"reserveCapacity(_:)": wrapped((scope, arg) => {
					return statements([]);
				}, "(String, String) -> Void"),
				"unicodeScalars": wrapped((scope, arg) => {
					return call(member("Array", "from", scope), [arg(0, "value")], [typeValue("String")], scope);
				}, "(String) -> String.UnicodeScalarView"),
				"utf16": wrapped((scope, arg) => {
					return arg(0, "value");
				}, "(String) -> String.UTF16View"),
				"utf8": wrapped((scope, arg) => {
					return call(member(expr(newExpression(identifier("TextEncoder"), [read(literal("utf-8"), scope)])), "encode", scope), [arg(0, "value")], [typeValue("String")], scope);
				}, "(String) -> String.UTF8View"),
				"isEmpty": wrapped((scope, arg) => {
					return binary("===", member(arg(0, "string"), "length", scope), literal(0), scope);
				}, "(String) -> Bool"),
				"count": wrapped((scope, arg) => {
					// TODO: Count grapheme clusters
					return member(arg(0, "string"), "length", scope);
				}, "(String) -> Int"),
				"startIndex": wrapped((scope, arg) => {
					return literal(0);
				}, "(String) -> Int"),
				"endIndex": wrapped((scope, arg) => {
					return member(arg(0, "string"), "length", scope);
				}, "(String) -> Int"),
				"first": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (str) => {
						const characterType = typeValue("Character");
						return conditional(
							member(str, "length", scope),
							wrapInOptional(member(str, literal(0), scope), characterType, scope),
							emptyOptional(characterType, scope),
							scope,
						);
					});
				}, "(String) -> Character?"),
				"last": wrapped((scope, arg) => {
					// TODO: Support grapheme clusters
					return reuseArgs(arg, 0, scope, ["string"], (str) => {
						const characterType = typeValue("Character");
						return conditional(
							member(str, "length", scope),
							wrapInOptional(member(str, binary("-", member(str, "length", scope), literal(1), scope), scope), characterType, scope),
							emptyOptional(characterType, scope),
							scope,
						);
					});
				}, "(String) -> Character?"),
				hashValue,
			}, applyDefaultConformances({
				Equatable: {
					functions: {
						"==": wrapped(binaryBuiltin("===", 0), "(String, String) -> Bool"),
						"!=": wrapped(binaryBuiltin("!==", 0), "(String, String) -> Bool"),
					},
					requirements: [],
				},
				Hashable: {
					functions: {
						hashValue,
					},
					requirements: [],
				},
				Collection: {
					functions: collectionFunctions,
					requirements: [],
				},
			}, globalScope), {
				Type: cachedBuilder(() => primitive(PossibleRepresentation.Undefined, undefinedValue)),
				UnicodeScalarView: () => UnicodeScalarView,
				UTF16View: () => UTF16View,
				UTF8View: () => UTF8View,
			});
		}),
		StaticString: cachedBuilder(() => primitive(PossibleRepresentation.String, literal(""), {
		})),
		Character: cachedBuilder((globalScope) => {
			return primitive(PossibleRepresentation.String, literal(""), {
				"init(_:)": wrapped((scope, arg) => {
					return arg(0, "character");
				}, "(String) -> Character"),
				"==": wrapped(binaryBuiltin("===", 0), "(Character, Character) -> Bool"),
				"!=": wrapped(binaryBuiltin("!==", 0), "(Character, Character) -> Bool"),
				"<": wrapped(binaryBuiltin("<", 0), "(Character, Character) -> Bool"),
				"<=": wrapped(binaryBuiltin("<=", 0), "(Character, Character) -> Bool"),
				">": wrapped(binaryBuiltin(">", 0), "(Character, Character) -> Bool"),
				">=": wrapped(binaryBuiltin(">=", 0), "(Character, Character) -> Bool"),
			});
		}),
		Optional: (globalScope, typeParameters) => {
			const [ wrappedType ] = typeParameters("Wrapped");
			const reified = typeFromValue(wrappedType, globalScope);
			if (wrappedType.kind !== "type") {
				// TODO: Support runtime types
				throw new TypeError(`Runtime types are not supported as Self in Self?`);
			}
			// Assume values that can be represented as boolean, number or string can be value-wise compared
			const isDirectlyComparable = (reified.possibleRepresentations & ~(PossibleRepresentation.Boolean | PossibleRepresentation.Number | PossibleRepresentation.String)) === PossibleRepresentation.None;
			const compareEqual = wrapped(isDirectlyComparable ? binaryBuiltin("===", 0) : (scope: Scope, arg: ArgGetter) => {
				const equalMethod = call(functionValue("==", conformance(wrappedType, "Equatable", scope), "() -> () -> Bool"), [wrappedType], [typeTypeValue], scope);
				return reuseArgs(arg, 0, scope, ["lhs", "rhs"], (lhs, rhs) => {
					return conditional(
						optionalIsNone(lhs, wrappedType, scope),
						optionalIsNone(rhs, wrappedType, scope),
						logical("&&",
							optionalIsSome(rhs, wrappedType, scope),
							call(equalMethod, [
								unwrapOptional(lhs, wrappedType, scope),
								unwrapOptional(rhs, wrappedType, scope),
							], [wrappedType, wrappedType], scope),
							scope,
						),
						scope,
					);
				});
			}, "(Self?, Self?) -> Bool");
			const compareUnequal = wrapped(isDirectlyComparable ? binaryBuiltin("!==", 0) : (scope: Scope, arg: ArgGetter) => {
				const unequalMethod = call(functionValue("!=", conformance(wrappedType, "Equatable", scope), "() -> () -> Bool"), [wrappedType], [typeTypeValue], scope);
				return reuseArgs(arg, 0, scope, ["lhs", "rhs"], (lhs, rhs) => {
					return conditional(
						optionalIsNone(lhs, wrappedType, scope),
						optionalIsSome(rhs, wrappedType, scope),
						logical("||",
							optionalIsNone(rhs, wrappedType, scope),
							call(unequalMethod, [
								unwrapOptional(lhs, wrappedType, scope),
								unwrapOptional(rhs, wrappedType, scope),
							], [wrappedType, wrappedType], scope),
							scope,
						),
						scope,
					);
				});
			}, "(Self?, Self?) -> Bool");
			return {
				fields: [],
				functions: lookupForMap({
					"none": (scope) => emptyOptional(wrappedType, scope),
					"some": wrapped((scope, arg) => wrapInOptional(arg(0, "wrapped"), wrappedType, scope), "(Self) -> Self?"),
					"==": compareEqual,
					"!=": compareUnequal,
					"flatMap": returnTodo,
				} as FunctionMap),
				conformances: applyDefaultConformances({
					Equatable: {
						functions: {
							"==": compareEqual,
							"!=": compareUnequal,
						},
						requirements: [],
					},
				}, globalScope),
				possibleRepresentations: PossibleRepresentation.All, // TODO: Make possible representations computed at runtime
				defaultValue(scope) {
					return emptyOptional(wrappedType, scope);
				},
				copy: /*reified.copy || wrappedIsOptional*/ true ? (value, scope) => {
					const expression = read(value, scope);
					if (expressionSkipsCopy(expression)) {
						return expr(expression);
					}
					const copier = reified.copy;
					if (copier) {
						// Nested optionals require special support since they're stored as [] for .none, [null] for .some(.none) and [v] for .some(.some(v))
						return reuse(expr(expression), scope, "copyValue", (source) => {
							return conditional(
								optionalIsNone(source, wrappedType, scope),
								emptyOptional(wrappedType, scope),
								wrapInOptional(copier.call(reified, source, scope), wrappedType, scope),
								scope,
							);
						});
					} else {
						return optionalOperation(
							wrappedType,
							value,
							call(member(expr(expression), "slice", scope), [], [], scope),
							scope,
						);
					}
				} : undefined,
				innerTypes: {},
			};
		},
		// Should be represented as an empty struct, but we currently
		_OptionalNilComparisonType: cachedBuilder(() => primitive(PossibleRepresentation.Null, literal(null), {
			"init(nilLiteral:)": wrapped((scope, arg, type) => literal(null), "() -> _OptionalNilComparisonType"),
		}, Object.create(null), {
			Type: cachedBuilder(() => primitive(PossibleRepresentation.Undefined, undefinedValue)),
		})),
		Array: (globalScope, typeParameters) => {
			const [ valueType ] = typeParameters("Value");
			const reified = typeFromValue(valueType, globalScope);
			if (valueType.kind !== "type") {
				// TODO: Support runtime types
				throw new TypeError(`Runtime types are not supported as Self in [Self]`);
			}
			const optionalValueType = typeValue({ kind: "optional", type: valueType.type });
			function arrayCompare(comparison: "equal" | "unequal") {
				return wrapped((scope, arg) => {
					return reuseArgs(arg, 0, scope, ["lhs", "rhs"], (lhs, rhs) => {
						const result = uniqueName(scope, comparison);
						const i = uniqueName(scope, "i");
						return statements([
							addVariable(scope, result, "Bool"),
							ifStatement(
								read(binary("!==",
									member(lhs, "length", scope),
									member(rhs, "length", scope),
									scope,
								), scope),
								blockStatement(ignore(set(lookup(result, scope), literal(comparison === "unequal"), scope), scope)),
								blockStatement(concat(
									[
										addVariable(scope, i, "Int", literal(0)),
										whileStatement(
											read(binary("<",
												lookup(i, scope),
												member(lhs, "length", scope),
												scope,
											), scope),
											blockStatement(concat(
												ignore(
													transform(
														call(
															call(
																functionValue("!=", conformance(valueType, "Equatable", scope), "(Type) -> (Self, Self) -> Bool"),
																[valueType],
																[typeTypeValue],
																scope,
															),
															[
																member(lhs, lookup(i, scope), scope),
																member(rhs, lookup(i, scope), scope),
															],
															[
																valueType,
																valueType,
															],
															scope,
														),
														scope,
														(expression) => statements([
															ifStatement(expression, breakStatement()),
														]),
													),
													scope,
												),
												ignore(expr(updateExpression("++", read(lookup(i, scope), scope))), scope),
											)),
										),
									],
									ignore(set(
										lookup(result, scope),
										binary(comparison === "unequal" ? "!==" : "===",
											lookup(i, scope),
											member(lhs, "length", scope),
											scope,
										),
										scope,
									), scope),
								)),
							),
							returnStatement(read(lookup(result, scope), scope)),
						]);
					});
				}, "(Self, Self) -> Bool");
			}
			return {
				functions: lookupForMap({
					// TODO: Fill in proper init
					"init(_:)": wrapped((scope, arg) => call(member("Array", "from", scope), [arg(0, "iterable")], [dummyType], scope), "(Any) -> Self"),
					"subscript(_:)": wrapped((scope, arg) => {
						return arrayBoundsCheck(arg(0, "array"), arg(1, "index"), scope, "read");
					}, "(Self, Int) -> Self.Wrapped"),
					"subscript(_:)_set": wrapped((scope, arg) => {
						return set(
							arrayBoundsCheck(arg(0, "array"), arg(1, "index"), scope, "write"),
							copy(arg(2, "value"), valueType),
							scope,
						);
					}, "(inout Self, Int, Self.Wrapped) -> Void"),
					"append()": wrapped((scope, arg) => {
						const pushExpression = member(arg(2, "array"), "push", scope);
						const newElement = copy(arg(2, "newElement"), valueType);
						return call(pushExpression, [newElement], [valueType], scope);
					}, "(inout Self, Self.Element) -> Void"),
					"insert(at:)": wrapped((scope, arg) => {
						const arrayValue = arg(1, "array");
						const newElement = copy(arg(2, "newElement"), valueType);
						const i = arg(3, "i");
						return call(functionValue("Swift.(swift-to-js).arrayInsertAt()", undefined, { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] }), [arrayValue, newElement, i], [dummyType, valueType, dummyType], scope);
					}, "(inout Self, Self.Element, Int) -> Void"),
					"remove(at:)": wrapped((scope, arg) => {
						const arrayValue = arg(1, "array");
						const i = arg(2, "i");
						return call(functionValue("Swift.(swift-to-js).arrayRemoveAt()", undefined, { kind: "function", arguments: { kind: "tuple", types: [] }, return: voidType, throws: true, rethrows: false, attributes: [] }), [arrayValue, i], [dummyType, valueType], scope);
					}, "(inout Self, Int) -> Self.Element"),
					"removeFirst()": wrapped((scope, arg) => {
						return reuse(call(member(arg(1, "array"), "shift", scope), [], [], scope), scope, "element", (reusableArray) => {
							return conditional(
								binary("!==",
									reusableArray,
									undefinedValue,
									scope,
								),
								reusableArray,
								arrayBoundsFailed(scope),
								scope,
							);
						});
					}, "(inout Self) -> Self.Element"),
					"removeLast()": wrapped((scope, arg) => {
						return reuse(call(member(arg(1, "array"), "pop", scope), [], [], scope), scope, "element", (reusableArray) => {
							return conditional(
								binary("!==",
									reusableArray,
									undefinedValue,
									scope,
								),
								reusableArray,
								arrayBoundsFailed(scope),
								scope,
							);
						});
					}, "(inout Self) -> Self.Element"),
					"popLast()": wrapped((scope, arg) => {
						return reuse(call(member(arg(1, "array"), "pop", scope), [], [], scope), scope, "element", (reusableArray) => {
							return conditional(
								binary("!==",
									reusableArray,
									undefinedValue,
									scope,
								),
								wrapInOptional(reusableArray, optionalValueType, scope),
								emptyOptional(optionalValueType, scope),
								scope,
							);
						});
					}, "(inout Self) -> Self.Element?"),
					"removeAll(keepingCapacity:)": wrapped((scope, arg) => {
						return set(member(arg(1, "array"), "length", scope), literal(0), scope);
					}, "(inout Self, Bool) -> Void"),
					"reserveCapacity()": wrapped((scope, arg) => undefinedValue, "(inout Self, Int) -> Void"),
					"index(after:)": wrapped((scope, arg) => {
						const arrayValue = arg(0, "array");
						return reuseArgs(arg, 2, scope, ["index"], (index) => {
							return conditional(
								binary("<", arrayValue, index, scope),
								binary("+", index, literal(1), scope),
								arrayBoundsFailed(scope),
								scope,
							);
						});
					}, "(inout Self, Int) -> Int"),
					"index(before:)": wrapped((scope, arg) => {
						return reuseArgs(arg, 2, scope, ["index"], (index) => {
							return conditional(
								binary(">", index, literal(0), scope),
								binary("-", index, literal(1), scope),
								arrayBoundsFailed(scope),
								scope,
							);
						});
					}, "(inout Self, Int) -> Int"),
					"distance(from:to:)": wrapped((scope, arg) => {
						return reuseArgs(arg, 2, scope, ["start"], (start) => {
							const end = arg(3, "end");
							return binary("-", end, start, scope);
						});
					}, "(inout Self, Int, Int) -> Int"),
					"joined(separator:)": (scope, arg, type) => {
						return callable((innerScope, innerArg) => {
							return call(
								member(arg(1, "collection"), "join", scope),
								[innerArg(0, "separator")],
								[dummyType],
								scope,
							);
						}, "(Self, String) -> String");
					},
					"count": readLengthField,
					"isEmpty": isEmptyFromLength,
					"capacity": readLengthField,
					"startIndex": startIndexOfZero,
					"endIndex": readLengthField,
					"first"(scope: Scope, arg: ArgGetter) {
						return reuseArgs(arg, 0, scope, ["array"], (reusableValue) => {
							return conditional(
								member(reusableValue, "length", scope),
								wrapInOptional(member(reusableValue, 0, scope), optionalValueType, scope),
								emptyOptional(optionalValueType, scope),
								scope,
							);
						});
					},
					"last"(scope: Scope, arg: ArgGetter) {
						return reuseArgs(arg, 0, scope, ["array"], (reusableValue) => {
							return conditional(
								member(reusableValue, "length", scope),
								wrapInOptional(member(reusableValue, binary("-", member(reusableValue, "length", scope), literal(1), scope), scope), optionalValueType, scope),
								emptyOptional(optionalValueType, scope),
								scope,
							);
						});
					},
				} as FunctionMap),
				conformances: applyDefaultConformances({
					Equatable: {
						functions: {
							"==": arrayCompare("equal"),
							"!=": arrayCompare("unequal"),
						},
						requirements: [],
					},
					BidirectionalCollection: {
						functions: {
							"joined(separator:)": (scope, arg, type) => {
								const collection = arg(0, "collection");
								return callable((innerScope, innerArg) => {
									return call(
										member(collection, "join", scope),
										[innerArg(0, "separator")],
										[dummyType],
										scope,
									);
								}, "(String) -> String");
							},
						},
						requirements: [],
					},
				}, globalScope),
				possibleRepresentations: PossibleRepresentation.Array,
				defaultValue() {
					return literal([]);
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
						// addVariable();
						const converter = functionExpression(undefined, [identifier(id)], blockStatement([returnStatement(read(reified.copy(expr(identifier(id)), scope), scope))]));
						return call(member(expr(expression), "map", scope), [expr(converter)], ["Any"], scope);
					} else {
						// Simple arrays are sliced
						return call(member(expr(expression), "slice", scope), [], [], scope);
					}
				},
				innerTypes: {},
			};
		},
		Dictionary: (globalScope, typeParameters) => {
			const [ keyType, valueType ] = typeParameters("Key", "Value");
			if (keyType.kind !== "type") {
				// TODO: Support runtime types
				throw new TypeError(`Runtime types are not supported as K in [K: V]`);
			}
			if (valueType.kind !== "type") {
				// TODO: Support runtime types
				throw new TypeError(`Runtime types are not supported as V in [K: V]`);
			}
			const keysType = typeValue({ kind: "array", type: keyType.type });
			const reifiedKeyType = typeFromValue(keyType, globalScope);
			const reifiedValueType = typeFromValue(valueType, globalScope);
			function objectDictionaryImplementation(converter?: Value): ReifiedType {
				const reifiedKeysType = typeFromValue(keysType, globalScope);
				return {
					functions: lookupForMap({
						"subscript(_:)": wrapped((scope, arg, type) => {
							return reuseArgs(arg, 0, scope, ["dict", "index"], (dict, index) => {
								return conditional(
									call(
										member(
											member(
												expr(identifier("Object")),
												"hasOwnProperty",
												scope,
											),
											"call",
											scope,
										),
										[dict, index],
										["Any", "String"],
										scope,
									),
									wrapInOptional(copy(member(dict, index, scope), valueType), valueType, scope),
									emptyOptional(valueType, scope),
									scope,
								);
							});
						}, "(Self, Self.Key) -> Self.Value?"),
						"subscript(_:)_set": wrapped((scope, arg, type) => {
							const dict = arg(0, "dict");
							const index = arg(1, "index");
							const valueExpression = read(arg(2, "value"), scope);
							const valueIsOptional = hasRepresentation(valueType, PossibleRepresentation.Null, scope);
							if (valueIsOptional.kind === "expression" && valueIsOptional.expression.type === "BooleanLiteral") {
								if (valueIsOptional.expression.value) {
									if (valueExpression.type === "ArrayExpression" && valueExpression.elements.length === 0) {
										return unary("delete", member(dict, index, scope), scope);
									}
								} else {
									if (valueExpression.type === "NullLiteral") {
										return unary("delete", member(dict, index, scope), scope);
									}
								}
							}
							if (isLiteral(valueExpression) || valueExpression.type === "ArrayExpression" || valueExpression.type === "ObjectExpression") {
								return set(member(dict, index, scope), expr(valueExpression), scope);
							}
							return reuse(expr(valueExpression), scope, "value", (reusableValue) => {
								return conditional(
									optionalIsSome(reusableValue, valueType, scope),
									set(member(dict, index, scope), copy(unwrapOptional(reusableValue, valueType, scope), valueType), scope),
									unary("delete", member(dict, index, scope), scope),
									scope,
								);
							});
						}, "(Self, Self.Key, Self.Value?) -> Void"),
						"count": wrapped((scope, arg) => {
							return member(call(member("Object", "keys", scope), [arg(0, "self")], ["[String]"], scope), "length", scope);
						}, "(Self) -> Int"),
						"keys": wrapped((scope, arg) => {
							return call(member("Object", "keys", scope), [arg(0, "self")], ["[String]"], scope);
						}, "(Self) -> Self.Keys"),
					} as FunctionMap),
					conformances: applyDefaultConformances({
						// TODO: Implement Equatable
						Equatable: {
							functions: {
								"==": wrapped((innerScope, arg) => {
									return reuseArgs(arg, 0, innerScope, ["lhs", "rhs"], (lhs, rhs) => {
										const key = uniqueName(innerScope, "key");
										const equal = uniqueName(innerScope, "equal");
										return statements([
											addVariable(innerScope, equal, "Bool", literal(true)),
											addVariable(innerScope, key, "T"),
											forInStatement(
												read(lookup(key, innerScope), innerScope) as Node as Identifier,
												read(lhs, innerScope),
												blockStatement([
													ifStatement(
														read(
															logical(
																"||",
																unary("!", call(member(member("Object", "hasOwnProperty", innerScope), "call", innerScope), [rhs, lookup(key, innerScope)], ["Self", "String"], innerScope), innerScope),
																call(
																	call(
																		functionValue("!=", conformance(valueType, "Equatable", innerScope), "(Type) -> (Self, Self) -> Bool"),
																		[valueType],
																		[typeTypeValue],
																		innerScope,
																	),
																	[
																		member(lhs, lookup(key, innerScope), innerScope),
																		member(rhs, lookup(key, innerScope), innerScope),
																	],
																	[
																		valueType,
																		valueType,
																	],
																	innerScope,
																),
																innerScope,
															),
															innerScope,
														),
														blockStatement(concat(
															ignore(set(lookup(equal, innerScope), literal(false), innerScope), innerScope),
															[breakStatement()],
														)),
													),
												]),
											),
											ifStatement(
												read(lookup(equal, innerScope), innerScope),
												forInStatement(
													read(lookup(key, innerScope), innerScope) as Node as Identifier,
													read(rhs, innerScope),
													blockStatement([
														ifStatement(
															read(
																unary("!", call(member(member("Object", "hasOwnProperty", innerScope), "call", innerScope), [lhs, lookup(key, innerScope)], ["Self", "String"], innerScope), innerScope),
																innerScope,
															),
															blockStatement(concat(
																ignore(set(lookup(equal, innerScope), literal(false), innerScope), innerScope),
																[breakStatement()],
															)),
														),
													]),
												),
											),
											returnStatement(read(lookup(equal, innerScope), innerScope)),
										]);
									});
								}, "(Self, Self) -> Bool"),
							},
							requirements: [],
						},
					}, globalScope),
					possibleRepresentations: PossibleRepresentation.Object,
					defaultValue() {
						return literal({});
					},
					copy(value, scope) {
						const expression = read(value, scope);
						if (expressionSkipsCopy(expression)) {
							return expr(expression);
						}
						if (reifiedValueType.copy) {
							throw new TypeError(`Copying dictionaries with non-simple values is not yet implemented!`);
						}
						return call(
							member("Object", "assign", scope),
							[literal({}), expr(expression)],
							["Any", "Any"],
							scope,
						);
					},
					innerTypes: {
						Keys() {
							return inheritLayout(reifiedKeysType, {
								count: readLengthField,
								isEmpty: isEmptyFromLength,
								startIndex: startIndexOfZero,
								endIndex: readLengthField,
								first: wrapped((scope, arg) => {
									return reuseArgs(arg, 0, scope, ["keys"], (keys) => {
										const stringKey = member(keys, 0, scope);
										const convertedKey = typeof converter !== "undefined" ? call(converter, [stringKey], ["String"], scope) : stringKey;
										return conditional(
											member(keys, "length", scope),
											wrapInOptional(convertedKey, keyType, scope),
											emptyOptional(keyType, scope),
											scope,
										);
									});
								}, "(Self) -> Self.Wrapped?"),
								underestimatedCount: wrapped((scope, arg) => {
									return member(arg(0, "self"), "length", scope);
								}, "(Self) -> Int"),
							});
						},
					},
				};
			}
			switch (reifiedKeyType.possibleRepresentations) {
				case PossibleRepresentation.String:
					return objectDictionaryImplementation();
				case PossibleRepresentation.Boolean:
					return objectDictionaryImplementation(expr(identifier("Boolean")));
				case PossibleRepresentation.Number:
					return objectDictionaryImplementation(expr(identifier("Number")));
				default:
					throw new Error(`No dictionary implementation for keys of type ${stringifyValue(keyType)}`);
			}
		},
		Error: cachedBuilder((globalScope) => primitive(PossibleRepresentation.Number, literal(0), {
			hashValue(scope, arg) {
				return arg(0, "self");
			},
		})),
		ClosedRange: cachedBuilder(() => primitive(PossibleRepresentation.Array, tuple([literal(0), literal(0)]), {
			map: (scope, arg, type) => {
				const range = arg(1, "range");
				return callable((innerScope, innerArg) => {
					const mapped = uniqueName(innerScope, "mapped");
					const callback = innerArg(0, "callback");
					return statements(concat(
						[addVariable(innerScope, mapped, dummyType, literal([]), DeclarationFlags.Const)],
						closedRangeIterate(range, innerScope, (i) => blockStatement(
							ignore(call(
								member(lookup(mapped, scope), "push", scope),
								[call(callback, [i], [dummyType], scope)],
								[dummyType],
								scope,
							), scope),
						)),
						[returnStatement(read(lookup(mapped, scope), scope))],
					));
				}, "((Self) -> V) -> [V]");
			},
			reduce: (scope, arg, type) => {
				const range = arg(1, "range");
				return callable((innerScope, innerArg) => {
					const result = uniqueName(innerScope, "result");
					const initialResult = innerArg(0, "initialResult");
					const next = innerArg(1, "next");
					return statements(concat(
						[addVariable(innerScope, result, dummyType, initialResult)],
						closedRangeIterate(range, innerScope, (i) => blockStatement(
							ignore(set(lookup(result, scope), call(next, [lookup(result, scope), i], [dummyType, dummyType], scope), scope), scope),
						)),
						[returnStatement(read(lookup(result, scope), scope))],
					));
				}, "(Result, (Result, Self.Element) -> Result) -> Result");
			},
		}, {
			// TODO: Implement Equatable
			Equatable: {
				functions: {
					"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
					"!=": wrapped(binaryBuiltin("!==", 0), "(Self, Self) -> Bool"),
				},
				requirements: [],
			},
		})),
		Hasher: cachedBuilder((globalScope) => primitive(PossibleRepresentation.Array, array([literal(0)], globalScope), {
			"combine()": wrapped((scope, arg) => {
				return reuseArgs(arg, 0, scope, ["hasher"], (hasher) => {
					return set(
						member(hasher, 0, scope),
						binary("-",
							binary("+",
								binary("<<",
									member(hasher, 0, scope),
									literal(5),
									scope,
								),
								arg(1, "value"), // TODO: Call hashValue
								scope,
							),
							member(hasher, 0, scope),
							scope,
						),
						scope,
					);
				});
			}, "(inout Hasher, Int) -> Void"),
			"finalize()": wrapped((scope, arg) => {
				return binary("|", member(arg(0, "hasher"), 0, scope), literal(0), scope);
			}, "(Hasher) -> Int"),
		})),
	};
}

function optionalOperation(innerType: Value, normalOperation: Value, nestedOperation: Value, scope: Scope) {
	// Should be peephole optimized when types are fully known, and deferred until runtime if not
	return conditional(
		hasRepresentation(innerType, PossibleRepresentation.Null, scope),
		nestedOperation,
		normalOperation,
		scope,
	);
}

export function emptyOptional(type: Value, scope: Scope) {
	return optionalOperation(
		type,
		literal(null),
		literal([]),
		scope,
	);
}

export function wrapInOptional(value: Value, type: Value, scope: Scope): Value {
	return optionalOperation(
		type,
		value,
		array([value], scope),
		scope,
	);
}

export function unwrapOptional(value: Value, type: Value, scope: Scope): Value {
	return optionalOperation(
		type,
		value,
		member(value, 0, scope),
		scope,
	);
}

export function optionalIsNone(value: Value, type: Value, scope: Scope): Value {
	return optionalOperation(
		type,
		binary("===",
			value,
			literal(null),
			scope,
		),
		binary("===",
			member(value, "length", scope),
			literal(0),
			scope,
		),
		scope,
	);
}

export function optionalIsSome(value: Value, type: Value, scope: Scope): Value {
	return optionalOperation(
		type,
		binary("!==",
			value,
			literal(null),
			scope,
		),
		binary("!==",
			member(value, "length", scope),
			literal(0),
			scope,
		),
		scope,
	);
}

function arrayBoundsFailed(scope: Scope) {
	return call(functionValue("Swift.(swift-to-js).arrayBoundsFailed()", undefined, { kind: "function", arguments: voidType, return: voidType, throws: true, rethrows: false, attributes: [] }), [], [], scope);
}

function arrayBoundsCheck(arrayValue: Value, index: Value, scope: Scope, mode: "read" | "write") {
	return reuse(arrayValue, scope, "array", (reusableArray) => {
		return reuse(index, scope, "index", (reusableIndex) => {
			return member(
				reusableArray,
				conditional(
					logical(
						"&&",
						binary(mode === "write" ? ">=" : ">",
							member(reusableArray, "length", scope),
							reusableIndex,
							scope,
						),
						binary(">=",
							reusableIndex,
							literal(0),
							scope,
						),
						scope,
					),
					reusableIndex,
					arrayBoundsFailed(scope),
					scope,
				),
				scope,
			);
		});
	});
}

function stringBoundsFailed(scope: Scope) {
	return call(functionValue("Swift.(swift-to-js).stringBoundsFailed()", undefined, { kind: "function", arguments: voidType, return: voidType, throws: true, rethrows: false, attributes: [] }), [], [], scope);
}

function stringBoundsCheck(stringValue: Value, index: Value, scope: Scope, mode: "read" | "write") {
	return reuse(stringValue, scope, "string", (reusableString) => {
		return reuse(index, scope, "index", (reusableIndex) => {
			return member(
				reusableString,
				conditional(
					binary(mode === "write" ? ">=" : ">",
						member(reusableString, "length", scope),
						reusableIndex,
						scope,
					),
					reusableIndex,
					stringBoundsFailed(scope),
					scope,
				),
				scope,
			);
		});
	});
}

function throwHelper(type: "Error" | "TypeError" | "RangeError", text: string) {
	return noinline((scope, arg) => statements([throwStatement(newExpression(identifier(type), [literal(text).expression]))]), "() throws -> Void");
}

export const functions: FunctionMap = {
	"Swift.(swift-to-js).numericRangeFailed()": throwHelper("RangeError", "Not enough bits to represent the given value"),
	"Swift.(swift-to-js).forceUnwrapFailed()": throwHelper("TypeError", "Unexpectedly found nil while unwrapping an Optional value"),
	"Swift.(swift-to-js).arrayBoundsFailed()": throwHelper("RangeError", "Array index out of range"),
	"Swift.(swift-to-js).stringBoundsFailed()": throwHelper("RangeError", "String index out of range"),
	"Swift.(swift-to-js).arrayInsertAt()": noinline((scope, arg) => {
		return statements([
			ifStatement(
				read(logical("||",
					binary(">",
						arg(2, "i"),
						member(arg(0, "array"), "length", scope),
						scope,
					),
					binary("<",
						arg(2, "i"),
						literal(0),
						scope,
					),
					scope,
				), scope),
				blockStatement(
					ignore(arrayBoundsFailed(scope), scope),
				),
				blockStatement(
					ignore(call(
						// TODO: Remove use of splice, since it's slow
						member(arg(0, "array"), "splice", scope),
						[
							arg(2, "i"),
							literal(0),
							arg(1, "newElement"),
						],
						[
							"Int",
							"Int",
							"Any",
						],
						scope,
					), scope),
				),
			),
		]);
	}, "(inout Self, Self.Element, Int) -> Void"),
	"Swift.(swift-to-js).arrayRemoveAt()": noinline((scope, arg) => {
		return statements([
			ifStatement(
				read(logical("||",
					binary(">=",
						arg(1, "i"),
						member(arg(0, "array"), "length", scope),
						scope,
					),
					binary("<",
						arg(1, "i"),
						literal(0),
						scope,
					),
					scope,
				), scope),
				blockStatement(
					ignore(arrayBoundsFailed(scope), scope),
				),
			),
			// TODO: Remove use of splice, since it's slow
			returnStatement(
				read(member(
					call(
						member(arg(0, "array"), "splice", scope),
						[
							arg(1, "i"),
							literal(1),
						],
						[
							"Int",
							"Int",
						],
						scope,
					),
					literal(0),
					scope,
				), scope),
			),
		]);
	}, "(inout Self, Int) -> Self.Element"),
	"Sequence.reduce": (scope, arg, type) => callable((innerScope, innerArg) => {
		return call(expr(identifier("Sequence$reduce")), [arg(0), arg(1)], [dummyType, dummyType], scope);
	}, "(Result, (Result, Self.Element) -> Result) -> Result"),
	"??": (scope, arg, type) => {
		const typeArg = arg(0, "type");
		if (typeArg.kind !== "type") {
			throw new TypeError(`Expected a type, got a ${typeArg.kind}`);
		}
		return reuseArgs(arg, 1, scope, ["lhs"], (lhs) => {
			return conditional(
				optionalIsSome(lhs, typeArg, scope),
				unwrapOptional(lhs, typeArg, scope),
				call(arg(2, "rhs"), [], [], scope),
				scope,
			);
		});
	},
	"~=": (scope, arg) => {
		const T = arg(0, "T");
		const result = call(functionValue("~=", conformance(T, "Equatable", scope), "(T.Type, T, T) -> () -> Bool"), [T, arg(1, "pattern"), arg(2, "value")], [typeValue("Type"), T, T], scope);
		return call(result, [], [], scope);
	},
	"print(_:separator:terminator:)": (scope, arg, type) => call(member("console", "log", scope), [arg(0, "items")], [dummyType], scope),
	"precondition(_:_:file:line:)": (scope, arg, type) => statements([
		ifStatement(
			read(unary("!", call(arg(0, "condition"), [], [], scope), scope), scope),
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
	"isKnownUniquelyReferenced": () => literal(false),
	"withExtendedLifetime": (scope, arg) => call(arg(3, "body"), [
		arg(2, "preserve"),
	], ["Any"], scope),
	"withUnsafePointer": unavailableFunction,
	"withUnsafeMutablePointer": unavailableFunction,
	"withUnsafeBytes": unavailableFunction,
	"withUnsafeMutableBytes": unavailableFunction,
	"unsafeDowncast(to:)": unavailableFunction,
	"unsafeBitCast(to:)": unavailableFunction,
	"withVaList": unavailableFunction,
	"getVaList": unavailableFunction,
	"swap": (scope, arg) => {
		const type = arg(0, "type");
		const a = arg(1, "a");
		const b = arg(2, "b");
		const temp = uniqueName(scope, "temp");
		return statements(concat(
			[addVariable(scope, temp, type, a, DeclarationFlags.Const)],
			ignore(set(a, b, scope), scope),
			ignore(set(b, lookup(temp, scope), scope), scope),
		));
	},
};

export function newScopeWithBuiltins(): Scope {
	return {
		name: "global",
		declarations: Object.create(null),
		types: defaultTypes({
			checkedIntegers: false,
			simpleStrings: true,
		}),
		functions: Object.assign(Object.create(null), functions),
		functionUsage: Object.create(null),
		mapping: Object.create(null),
		parent: undefined,
	};
}
