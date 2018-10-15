import { abstractMethod, noinline, wrapped } from "./functions";
import { parseType } from "./parse";
import { expressionSkipsCopy, field, inheritLayout, primitive, protocol, reifyType, Field, FunctionMap, PossibleRepresentation, ProtocolConformance, ProtocolConformanceMap, ReifiedType, TypeMap } from "./reified";
import { addVariable, lookup, mangleName, uniqueName, DeclarationFlags, Scope } from "./scope";
import { Function, Tuple } from "./types";
import { cached, concat, lookupForMap } from "./utils";
import { array, binary, call, callable, conditional, conformance, copy, expr, expressionLiteralValue, functionValue, hasRepresentation, ignore, isPure, literal, logical, member, read, reuse, set, statements, stringifyValue, transform, tuple, typeFromValue, typeTypeValue, typeValue, unary, undefinedValue, update, updateOperatorForBinaryOperator, variable, ArgGetter, BinaryOperator, Value } from "./values";

import { arrayPattern, blockStatement, breakStatement, expressionStatement, forStatement, functionExpression, identifier, ifStatement, isLiteral, newExpression, returnStatement, throwStatement, updateExpression, variableDeclaration, variableDeclarator, whileStatement, Statement } from "@babel/types";

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

function returnLength(scope: Scope, arg: ArgGetter): Value {
	const arg0 = arg(0);
	return arg0.kind === "direct" ? variable(read(arg0, scope)) : expr(read(arg0, scope));
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

const readLengthField = (name: string, globalScope: Scope) => field("count", reifyType("Int", globalScope), (value, scope) => {
	return member(value, "length", scope);
});

const isEmptyFromLength = (globalScope: Scope) => field("isEmpty", reifyType("Bool", globalScope), (value, scope) => {
	return binary("!==", member(value, "length", scope), literal(0), scope);
});

const startIndexOfZero = (globalScope: Scope) => field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => {
	return literal(0);
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
	function initExactly(outerScope: Scope, outerArg: ArgGetter): Value {
		const sourceTypeArg = outerArg(1, "Self");
		return callable((scope: Scope, arg: ArgGetter) => {
			const sourceIntConformance = conformance(sourceTypeArg, integerTypeName, scope);
			const source = rangeForNumericType(typeFromValue(sourceIntConformance, scope), scope);
			const requiresGreaterThanCheck = possiblyGreaterThan(source, range, scope);
			const requiresLessThanCheck = possiblyLessThan(source, range, scope);
			if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
				return arg(0, "value");
			}
			return reuse(arg(0, "value"), scope, "value", (value) => {
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
		},
		conformances: {
		},
	};
	const hashableConformance: ProtocolConformance = {
		functions: {
		},
		conformances: {
		},
	};
	const equatableConformance: ProtocolConformance = {
		functions: {
			"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
			"!=": wrapped(binaryBuiltin("!==", 0), "(Self, Self) -> Bool"),
		},
		conformances: Object.create(null),
	};
	const numericConformance: ProtocolConformance = {
		functions: {
			"init(exactly:)": initExactly,
			"+": wrapped(binaryBuiltin("+", 0, (value, scope) => integerRangeCheck(scope, value, widerHigh, range)), "(Self, Self) -> Self"),
			"-": wrapped(binaryBuiltin("-", 0, (value, scope) => integerRangeCheck(scope, value, widerLow, range)), "(Self, Self) -> Self"),
			"*": wrapped(binaryBuiltin("*", 0, (value, scope) => integerRangeCheck(scope, value, widerBoth, range)), "(Self, Self) -> Self"),
		},
		conformances: {
			Equatable: equatableConformance,
		},
	};
	const signedNumericConformance: ProtocolConformance = {
		functions: {
			"-": wrapped((scope, arg) => unary("-", arg(0, "value"), scope), "(Self) -> Self"),
		},
		conformances: {
			Numeric: numericConformance,
		},
	};
	const comparableConformance: ProtocolConformance = {
		functions: {
			"<": wrapped(binaryBuiltin("<", 0), "(Self, Self) -> Bool"),
			">": wrapped(binaryBuiltin(">", 0), "(Self, Self) -> Bool"),
			"<=": wrapped(binaryBuiltin("<=", 0), "(Self, Self) -> Bool"),
			">=": wrapped(binaryBuiltin(">=", 0), "(Self, Self) -> Bool"),
		},
		conformances: {
			Equatable: equatableConformance,
		},
	};
	const strideableConformance: ProtocolConformance = {
		functions: {
			"...": wrapped((scope, arg) => {
				return tuple([arg(0, "start"), arg(1, "end")]);
			}, "(Self, Self) -> Self"),
		},
		conformances: {
			Equatable: equatableConformance,
			Comparable: comparableConformance,
		},
	};
	const binaryIntegerConformance: ProtocolConformance = {
		functions: {
		},
		conformances: {
			CustomStringConvertible: customStringConvertibleConformance,
			Numeric: numericConformance,
			Hashable: hashableConformance,
			Strideable: strideableConformance,
		},
	};
	const fixedWidthIntegerConformance: ProtocolConformance = {
		functions: {
			"&+": wrapped(binaryBuiltin("+", 0, wrap), "(Self, Self) -> Self"),
			"&*": wrapped(binaryBuiltin("*", 0, wrap), "(Self, Self) -> Self"),
			"&-": wrapped(binaryBuiltin("-", 0, wrap), "(Self, Self) -> Self"),
			"&<<": wrapped(binaryBuiltin("<<", 0, wrap), "(Self, Self) -> Self"),
			"&>>": wrapped(binaryBuiltin(">>", 0, wrap), "(Self, Self) -> Self"),
		},
		conformances: {
			BinaryInteger: binaryIntegerConformance,
			// LosslessStringConvertible: losslessStringConvertibleConformance,
		},
	};
	const integerConformance: ProtocolConformance = {
		functions: {
			"min"() {
				return literal(min);
			},
			"max"() {
				return literal(max);
			},
			"init(_:)": (outerScope, outerArg, type) => {
				const sourceTypeArg = outerArg(1, "Self");
				return callable((scope, arg) => {
					const sourceType = typeFromValue(conformance(sourceTypeArg, integerTypeName, scope), scope);
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
		conformances: {
			FixedWidthInteger: fixedWidthIntegerConformance,
			BinaryInteger: binaryIntegerConformance,
			SignedNumeric: signedNumericConformance,
		},
	};
	const reifiedType: ReifiedType = {
		fields,
		functions: lookupForMap({
			"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument, "(Self) -> Self"),
			"init(clamping:)": (scope: Scope, arg: ArgGetter, name: string) => {
				const source = rangeForNumericType(typeFromValue(conformance(arg(1, "Other"), integerTypeName, scope), scope), scope);
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
			"+": wrapped((scope, arg, type) => integerRangeCheck(scope, binary("+", arg(0, "lhs"), arg(1, "rhs"), scope), widerHigh, range), "(Self) -> Self"),
			"-": wrapped((scope, arg, type, length) => {
				if (length === 1) {
					return integerRangeCheck(scope, unary("-", arg(0, "value"), scope), widerLow, range);
				}
				return integerRangeCheck(scope, binary("-", arg(0, "lhs"), arg(1, "rhs"), scope), widerLow, range);
			}, "(Self) -> Self"),
			"*": wrapped((scope, arg, type) => integerRangeCheck(scope, binary("*", arg(0, "lhs"), arg(1, "rhs"), scope), widerBoth, range), "(Self) -> Self"),
			"/": (scope, arg) => binary("|", binary("/", arg(0, "lhs"), arg(1, "rhs"), scope), literal(0), scope),
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
		} as FunctionMap),
		conformances: applyDefaultConformances({
			Equatable: equatableConformance,
			Numeric: numericConformance,
			[integerTypeName]: integerConformance,
			SignedNumeric: signedNumericConformance,
			FixedWidthInteger: fixedWidthIntegerConformance,
			Strideable: strideableConformance,
			CustomStringConvertible: {
				functions: {
				},
				conformances: Object.create(null),
			},
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
				conformances: Object.create(null),
			},
		}, globalScope),
		possibleRepresentations: PossibleRepresentation.Number,
		defaultValue() {
			return literal(0);
		},
		innerTypes: {
			Type: cached(() => primitive(PossibleRepresentation.Object, literal({}), [
				field("min", reifiedType, () => literal(min)),
				field("max", reifiedType, () => literal(max)),
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
			"init(_:)": wrapped(returnOnlyArgument, "(Self) -> Self"),
			"init(_builtinIntegerLiteral:)": wrapped(returnOnlyArgument, "(Self) -> Self"),
			"init(_builtinFloatLiteral:)": wrapped(returnOnlyArgument, "(Self) -> Self"),
			"+": wrapped((scope, arg, type) => binary("+", arg(0, "lhs"), arg(1, "rhs"), scope), "(Self, Self) -> Self"),
			"-": wrapped((scope, arg, type, length) => {
				if (length === 1) {
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
		} as FunctionMap),
		conformances: applyDefaultConformances({
			Equatable: {
				functions: {
					"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
					"!=": wrapped(binaryBuiltin("!==", 0), "(Self, Self) -> Bool"),
				},
				conformances: Object.create(null),
			},
			SignedNumeric: {
				functions: {
					"-": wrapped((scope, arg) => unary("-", arg(0, "value"), scope), "(Self) -> Self"),
				},
				conformances: Object.create(null),
			},
			FloatingPoint: {
				functions: {
					"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
					"!=": wrapped(binaryBuiltin("!==", 0), "(Self, Self) -> Bool"),
					"squareRoot()": (scope, arg, type) => {
						return callable(() => call(member(expr(identifier("Math")), "sqrt", scope), [arg(1, "value")], ["Double"], scope), "() -> Self");
					},
				},
				conformances: Object.create(null),
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
				conformances: Object.create(null),
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
	}, methodName, 0);
}

interface NumericRange {
	min: Value;
	max: Value;
}

function rangeForNumericType(type: ReifiedType, scope: Scope): NumericRange {
	return {
		min: callSimpleMethod(type, "min", scope),
		max: callSimpleMethod(type, "max", scope),
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
			conformances: applyDefaultConformances(base.conformances, scope),
		};
	}
	return result;
}

const dummyType = typeValue({ kind: "name", name: "Dummy" });

function defaultTypes(checkedIntegers: boolean): TypeMap {
	const protocolTypes: TypeMap = Object.create(null);
	function addProtocol(name: string, emptyConformance?: ProtocolConformance) {
		const result = protocol({
			[name]: typeof emptyConformance !== "undefined" ? emptyConformance : {
				functions: Object.create(null),
				conformances: Object.create(null),
			} as ProtocolConformance,
		});
		protocolTypes[name] = () => result;
	}

	addProtocol("Equatable", {
		functions: {
			"==": abstractMethod,
			"!=": adaptedMethod("==", "Equatable", "(Self, Self) -> Bool", (equalsMethod, scope, type, arg) => unary("!", call(equalsMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), scope), "(Self, Self) -> Bool"),
			"~=": adaptedMethod("==", "Equatable", "(Self, Self) -> Bool", (equalsMethod, scope, type, arg) => call(equalsMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), "(Self, Self) -> Bool"),
		},
		conformances: Object.create(null),
	});
	addProtocol("Comparable", {
		functions: {
			"<": abstractMethod,
			">": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => call(lessThanMethod, [arg(1, "rhs"), arg(0, "lhs")], [type, type], scope), "(Self, Self) -> Bool"),
			"<=": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => unary("!", call(lessThanMethod, [arg(1, "rhs"), arg(0, "lhs")], [type, type], scope), scope), "(Self, Self) -> Bool"),
			">=": adaptedMethod("<", "Comparable", "(Self, Self) -> Bool", (lessThanMethod, scope, type, arg) => unary("!", call(lessThanMethod, [arg(0, "lhs"), arg(1, "rhs")], [type, type], scope), scope), "(Self, Self) -> Bool"),
		},
		conformances: Object.create(null),
	});
	addProtocol("Numeric", {
		functions: {
			"init(exactly:)": abstractMethod,
			"+": abstractMethod,
			"+=": updateMethod("+", "Numeric"),
			"-": abstractMethod,
			"-=": updateMethod("-", "Numeric"),
			"*": abstractMethod,
			"*=": updateMethod("*", "Numeric"),
		},
		conformances: Object.create(null),
	});
	addProtocol("SignedNumeric", {
		functions: {
			"-": abstractMethod, // TODO: Implement - in terms of negate
			"negate": adaptedMethod("-", "SignedNumeric", "(Self) -> Self", (negateMethod, scope, type, arg) => {
				return set(arg(0, "lhs"), call(negateMethod, [arg(0, "rhs")], [type], scope), scope);
			}, "(inout Self) -> Void"),
		},
		conformances: Object.create(null),
	});
	addProtocol("BinaryInteger", {
		functions: {
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
		},
		conformances: Object.create(null),
	});
	addProtocol("SignedInteger");
	addProtocol("UnsignedInteger");
	addProtocol("FixedWidthInteger");
	addProtocol("FloatingPoint", {
		functions: {
			formSquareRoot: abstractMethod,
			squareRoot: abstractMethod,
		},
		conformances: Object.create(null),
	});
	addProtocol("Sequence");
	addProtocol("Collection");
	addProtocol("BidirectionalCollection");
	addProtocol("Strideable", {
		functions: {
			"distance(to:)": abstractMethod,
			"advanced(by:)": abstractMethod,
		},
		conformances: Object.create(null),
	});
	addProtocol("Hashable", {
		functions: {
			"hash(hasher:)": abstractMethod,
		},
		conformances: Object.create(null),
	});
	addProtocol("CustomStringConvertible");
	addProtocol("LosslessStringConvertible", {
		functions: {
			"init(_:)": abstractMethod,
		},
		conformances: Object.create(null),
	});

	const BoolType = cachedBuilder((globalScope: Scope) => primitive(PossibleRepresentation.Boolean, literal(false), [
		field("description", reifyType(parseType("String"), globalScope), (target, scope) => {
			return conditional(target, literal("True"), literal("False"), scope);
		}),
	], {
		"init(_builtinBooleanLiteral:)": wrapped(returnOnlyArgument, "(Bool) -> Bool"),
		"init(_:)": wrapped((scope, arg) => {
			// Optional init from string
			return reuse(arg(0, "string"), scope, "string", (stringValue) => {
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
		"random": wrapped((scope, arg) => binary("<", call(member(expr(identifier("Math")), "random", scope), [], [], scope), literal(0.5), scope), "() -> Bool"),
	}, applyDefaultConformances({
		Equatable: {
			functions: {
				"==": wrapped(binaryBuiltin("===", 0), "(Bool, Bool) -> Bool"),
				"!=": wrapped(binaryBuiltin("!==", 0), "(Bool, Bool) -> Bool"),
			},
			conformances: Object.create(null),
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
			const UnicodeScalarView = primitive(PossibleRepresentation.Array, literal([]), [
				field("count", reifyType("Int", globalScope), (value, scope) => member(value, "length", scope)),
				field("startIndex", reifyType("Int64", globalScope), (value, scope) => literal(0)),
				field("endIndex", reifyType("Int64", globalScope), (value, scope) => member(value, "length", scope)),
			]);
			const UTF16View = primitive(PossibleRepresentation.String, literal(""), [
				field("count", reifyType("Int", globalScope), (value: Value, scope: Scope) => member(value, "length", scope)),
				field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => literal(0)),
				field("endIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => member(value, "length", scope)),
			]);
			const UTF8View = primitive(PossibleRepresentation.Array, literal([]), [
				field("count", reifyType("Int", globalScope), (value: Value, scope: Scope) => member(value, "length", scope)),
				field("startIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => literal(0)),
				field("endIndex", reifyType("Int64", globalScope), (value: Value, scope: Scope) => member(value, "length", scope)),
			]);
			return primitive(PossibleRepresentation.String, literal(""), [
				field("unicodeScalars", UnicodeScalarView, (value, scope) => call(member(expr(identifier("Array")), "from", scope), [value], [typeValue("String")], scope)),
				field("utf16", UTF16View, (value) => value),
				field("utf8", UTF8View, (value, scope) => call(member(expr(newExpression(identifier("TextEncoder"), [read(literal("utf-8"), scope)])), "encode", scope), [value], [typeValue("String")], scope)),
			], {
				"init(_:)": wrapped((scope, arg) => call(expr(identifier("String")), [arg(0, "value")], [typeValue("String")], scope), "(String) -> String" ),
				"+": wrapped(binaryBuiltin("+", 0), "(String, String) -> String"),
				"lowercased()": (scope, arg, type) => callable(() => call(member(arg(0, "value"), "toLowerCase", scope), [], [], scope), "(String) -> String"),
				"uppercased()": (scope, arg, type) => callable(() => call(member(arg(0, "value"), "toUpperCase", scope), [], [], scope), "(String) -> String"),
			}, {
				Equatable: {
					functions: {
						"==": wrapped(binaryBuiltin("===", 0), "(String, String) -> Bool"),
						"!=": wrapped(binaryBuiltin("!==", 0), "(String, String) -> Bool"),
					},
					conformances: Object.create(null),
				},
			}, {
				Type: cachedBuilder(() => primitive(PossibleRepresentation.Undefined, undefinedValue)),
				UnicodeScalarView: () => UnicodeScalarView,
				UTF16View: () => UTF16View,
				UTF8View: () => UTF8View,
			});
		}),
		StaticString: cachedBuilder(() => primitive(PossibleRepresentation.String, literal(""), [
		], {
		})),
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
				return reuse(arg(0, "lhs"), scope, "lhs", (lhs) => {
					return reuse(arg(1, "rhs"), scope, "rhs", (rhs) => {
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
				});
			}, "(Self?, Self?) -> Bool");
			const compareUnequal = wrapped(isDirectlyComparable ? binaryBuiltin("!==", 0) : (scope: Scope, arg: ArgGetter) => {
				const unequalMethod = call(functionValue("!=", conformance(wrappedType, "Equatable", scope), "() -> () -> Bool"), [wrappedType], [typeTypeValue], scope);
				return reuse(arg(0, "lhs"), scope, "lhs", (lhs) => {
					return reuse(arg(1, "rhs"), scope, "rhs", (rhs) => {
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
						conformances: Object.create(null),
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
		_OptionalNilComparisonType: cachedBuilder(() => primitive(PossibleRepresentation.Null, literal(null), [], {
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
			const reifiedOptional = typeFromValue(optionalValueType, globalScope);
			function arrayCompare(comparison: "equal" | "unequal") {
				return wrapped((scope, arg) => {
					return reuse(arg(0, "lhs"), scope, "lhs", (lhs) => {
						return reuse(arg(1, "rhs"), scope, "rhs", (rhs) => {
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
					});
				}, "(Self, Self) -> Bool");
			}
			return {
				fields: [
					readLengthField("count", globalScope),
					isEmptyFromLength(globalScope),
					readLengthField("capacity", globalScope),
					startIndexOfZero(globalScope),
					readLengthField("endIndex", globalScope),
					field("first", reifiedOptional, (value: Value, scope: Scope) => {
						return reuse(value, scope, "array", (reusableValue) => {
							return conditional(
								member(reusableValue, "length", scope),
								wrapInOptional(member(reusableValue, 0, scope), optionalValueType, scope),
								emptyOptional(optionalValueType, scope),
								scope,
							);
						});
					}),
					field("last", reifiedOptional, (value: Value, scope: Scope) => {
						return reuse(value, scope, "array", (reusableValue) => {
							return conditional(
								member(reusableValue, "length", scope),
								wrapInOptional(member(reusableValue, binary("-", member(reusableValue, "length", scope), literal(1), scope), scope), optionalValueType, scope),
								emptyOptional(optionalValueType, scope),
								scope,
							);
						});
					}),
				],
				functions: lookupForMap({
					// TODO: Fill in proper init
					"init(_:)": wrapped((scope, arg) => call(member(expr(identifier("Array")), "from", scope), [arg(0, "iterable")], [dummyType], scope), "(Any) -> Self"),
					"count": returnLength,
					"subscript(_:)": {
						get(scope, arg) {
							return arrayBoundsCheck(arg(1, "array"), arg(2, "index"), scope, "read");
						},
						set(scope, arg) {
							return set(
								arrayBoundsCheck(arg(1, "array"), arg(2, "index"), scope, "write"),
								copy(arg(3, "value"), valueType),
								scope,
							);
						},
					},
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
						const arrayValue = arg(1, "array");
						return reuse(arg(2, "index"), scope, "index", (index) => {
							return conditional(
								binary("<", arrayValue, index, scope),
								binary("+", index, literal(1), scope),
								arrayBoundsFailed(scope),
								scope,
							);
						});
					}, "(inout Self, Int) -> Int"),
					"index(before:)": wrapped((scope, arg) => {
						return reuse(arg(2, "index"), scope, "index", (index) => {
							return conditional(
								binary(">", index, literal(0), scope),
								binary("-", index, literal(1), scope),
								arrayBoundsFailed(scope),
								scope,
							);
						});
					}, "(inout Self, Int) -> Int"),
					"distance(from:to:)": wrapped((scope, arg) => {
						const start = arg(2, "start");
						const end = arg(3, "end");
						return binary("-", end, start, scope);
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
				} as FunctionMap),
				conformances: applyDefaultConformances({
					Equatable: {
						functions: {
							"==": arrayCompare("equal"),
							"!=": arrayCompare("unequal"),
						},
						conformances: Object.create(null),
					},
					BidirectionalCollection: {
						functions: {
							"joined(separator:)": (scope, arg, type) => {
								return callable((innerScope, innerArg) => {
									return call(
										member(arg(1, "collection"), "join", scope),
										[innerArg(0, "separator")],
										[dummyType],
										scope,
									);
								}, "(String) -> String");
							},
						},
						conformances: Object.create(null),
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
			const possibleKeyType = typeValue({ kind: "optional", type: keyType.type });
			const reifiedKeyType = typeFromValue(keyType, globalScope);
			const reifiedValueType = typeFromValue(valueType, globalScope);
			function objectDictionaryImplementation(converter?: Value): ReifiedType {
				const reifiedKeysType = typeFromValue(keysType, globalScope);
				return {
					fields: [
						field("count", reifyType("Int", globalScope), (value, scope) => {
							return member(call(member(expr(identifier("Object")), "keys", scope), [value], ["Any"], scope), "length", scope);
						}),
						field("keys", reifiedKeysType, (value: Value, scope: Scope) => {
							return call(member(expr(identifier("Object")), "keys", scope), [value], ["Any"], scope);
						}),
					],
					functions: lookupForMap({
						"subscript(_:)": {
							get(scope, arg, type) {
								return reuse(arg(2, "dict"), scope, "dict", (dict) => {
									return reuse(arg(3, "index"), scope, "index", (index) => {
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
								});
							},
							set(scope, arg, type) {
								const dict = arg(2, "dict");
								const index = arg(3, "index");
								const valueExpression = read(arg(4, "value"), scope);
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
							},
						},
					} as FunctionMap),
					conformances: applyDefaultConformances({
						// TODO: Implement Equatable
						Equatable: {
							functions: {
							},
							conformances: Object.create(null),
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
							member(expr(identifier("Object")), "assign", scope),
							[literal({}), expr(expression)],
							["Any", "Any"],
							scope,
						);
					},
					innerTypes: {
						Keys: () => {
							return inheritLayout(reifiedKeysType, [
								readLengthField("count", globalScope),
								isEmptyFromLength(globalScope),
								startIndexOfZero(globalScope),
								readLengthField("endIndex", globalScope),
								field("first", typeFromValue(possibleKeyType, globalScope), (value: Value, scope: Scope) => {
									return reuse(value, scope, "keys", (keys) => {
										const stringKey = member(keys, 0, scope);
										const convertedKey = typeof converter !== "undefined" ? call(converter, [stringKey], ["String"], scope) : stringKey;
										return conditional(
											member(keys, "length", scope),
											wrapInOptional(convertedKey, keyType, scope),
											emptyOptional(keyType, scope),
											scope,
										);
									});
								}),
								field("underestimatedCount", reifyType("Int", globalScope), (value: Value, scope: Scope) => {
									return member(value, "length", scope);
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
					return objectDictionaryImplementation(expr(identifier("Boolean")));
				case PossibleRepresentation.Number:
					return objectDictionaryImplementation(expr(identifier("Number")));
				default:
					throw new Error(`No dictionary implementation for keys of type ${stringifyValue(keyType)}`);
			}
		},
		Error: cachedBuilder((globalScope) => primitive(PossibleRepresentation.Number, literal(0), [
			field("hashValue", reifyType("Int", globalScope), (value) => value),
		], {
		})),
		ClosedRange: cachedBuilder(() => primitive(PossibleRepresentation.Array, tuple([literal(0), literal(0)]), [], {
			map: (scope, arg, type) => {
				const range = arg(2, "range");
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
				const range = arg(2, "range");
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
				conformances: Object.create(null),
			},
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

function throwHelper(type: "Error" | "TypeError" | "RangeError", text: string) {
	return noinline((scope, arg) => statements([throwStatement(newExpression(identifier(type), [literal(text).expression]))]), "() throws -> Void");
}

export const functions: FunctionMap = {
	"Swift.(swift-to-js).numericRangeFailed()": throwHelper("RangeError", "Not enough bits to represent the given value"),
	"Swift.(swift-to-js).forceUnwrapFailed()": throwHelper("TypeError", "Unexpectedly found nil while unwrapping an Optional value"),
	"Swift.(swift-to-js).arrayBoundsFailed()": throwHelper("RangeError", "Array index out of range"),
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
		return reuse(arg(1, "lhs"), scope, "lhs", (lhs) => {
			return conditional(
				optionalIsSome(lhs, typeArg, scope),
				unwrapOptional(lhs, typeArg, scope),
				call(arg(2, "rhs"), [], [], scope),
				scope,
			);
		});
	},
	"~=": (scope, arg) => binary("===", arg(1, "pattern"), arg(2, "value"), scope),
	"print(_:separator:terminator:)": (scope, arg, type) => call(member(expr(identifier("console")), "log", scope), [arg(0, "items")], [dummyType], scope),
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
		types: defaultTypes(false),
		functions: Object.assign(Object.create(null), functions),
		functionUsage: Object.create(null),
		mapping: Object.create(null),
		parent: undefined,
	};
}
