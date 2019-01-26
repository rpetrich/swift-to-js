import { applyDefaultConformances, binaryBuiltin, resolveMethod, reuseArgs, updateBuiltin, voidType } from "../builtins";
import { wrapped } from "../functions";
import { withPossibleRepresentations, FunctionMap, PossibleRepresentation, ProtocolConformance, ReifiedType } from "../reified";
import { addVariable, lookup, uniqueName, DeclarationFlags, Scope } from "../scope";
import { Function } from "../types";
import { concat, lookupForMap } from "../utils";
import { binary, call, callable, conditional, conformance, expr, expressionLiteralValue, functionValue, ignore, literal, logical, member, read, reuse, set, statements, tuple, unary, ArgGetter, Value } from "../values";

import { blockStatement, identifier, returnStatement, updateExpression, whileStatement } from "@babel/types";

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

export function buildIntegerType(globalScope: Scope, min: number, max: number, bitWidth: number, checked: boolean, wrap: (value: Value, scope: Scope) => Value): ReifiedType {
	const range: NumericRange = { min: literal(min), max: literal(max) };
	const widerHigh: NumericRange = checked ? { min: literal(min), max: literal(max + 1) } : range;
	const widerLow: NumericRange = checked ? { min: literal(min - 1), max: literal(max) } : range;
	const widerBoth: NumericRange = checked ? { min: literal(min - 1), max: literal(max + 1) } : range;
	const integerTypeName = min < 0 ? "SignedInteger" : "UnsignedInteger";
	function initExactly(outerScope: Scope, outerArg: ArgGetter): Value {
		const destTypeArg = outerArg(1, "T");
		return callable((scope: Scope, arg: ArgGetter) => {
			const destIntConformance = conformance(destTypeArg, integerTypeName, scope);
			const dest = rangeForNumericType(destIntConformance, scope);
			const requiresGreaterThanCheck = possiblyGreaterThan(range, dest, scope);
			const requiresLessThanCheck = possiblyLessThan(range, dest, scope);
			if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
				return arg(0, "value");
			}
			return reuseArgs(arg, 0, scope, ["value"], (value) => {
				let check;
				if (requiresGreaterThanCheck && requiresLessThanCheck) {
					check = logical(
						"||",
						binary(">", value, dest.min, scope),
						binary("<", value, dest.max, scope),
						scope,
					);
				} else if (requiresGreaterThanCheck) {
					check = binary(">", value, dest.max, scope);
				} else if (requiresLessThanCheck) {
					check = binary("<", value, dest.min, scope);
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
	const additiveArithmeticConformance: ProtocolConformance = {
		functions: {
			"zero": wrapped(() => literal(0), "() -> Self"),
			"+": wrapped(binaryBuiltin("+", 0, (value, scope) => integerRangeCheck(scope, value, widerHigh, range)), "(Self, Self) -> Self"),
			"-": wrapped(binaryBuiltin("-", 0, (value, scope) => integerRangeCheck(scope, value, widerLow, range)), "(Self, Self) -> Self"),
		},
		requirements: [],
	};
	const numericConformance: ProtocolConformance = {
		functions: {
			"init(exactly:)": initExactly,
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
			"init(truncatingIfNeeded:)": wrapped((scope: Scope, arg: ArgGetter) => {
				return wrap(arg(0, "source"), scope);
			}, "(T) -> Self"),
			"init(clamping:)": (scope: Scope, arg: ArgGetter, name: string) => {
				const dest = rangeForNumericType(conformance(arg(1, "T"), integerTypeName, scope), scope);
				return callable((innerScope, innerArg) => {
					const requiresGreaterThanCheck = possiblyGreaterThan(range, dest, scope);
					const requiresLessThanCheck = possiblyLessThan(range, dest, scope);
					if (!requiresGreaterThanCheck && !requiresLessThanCheck) {
						return innerArg(0, "value");
					}
					return reuse(innerArg(0, "value"), innerScope, "value", (value) => {
						if (requiresGreaterThanCheck && requiresLessThanCheck) {
							return conditional(
								binary(">", value, dest.max, innerScope),
								dest.max,
								conditional(
									binary("<", value, dest.min, innerScope),
									dest.min,
									value,
									innerScope,
								),
								innerScope,
							);
						} else if (requiresGreaterThanCheck) {
							return conditional(
								binary(">", value, dest.max, innerScope),
								dest.max,
								value,
								innerScope,
							);
						} else {
							return conditional(
								binary("<", value, dest.min, innerScope),
								dest.min,
								value,
								innerScope,
							);
						}
					});
				}, "(Self) -> Self");
			},
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
	const byteSwapped = wrapped((scope, arg) => {
		if (bitWidth <= 8) {
			return arg(0, "value");
		}
		return reuseArgs(arg, 0, scope, ["value"], (self) => {
			let result: Value = literal(0);
			for (let i = 0; i < bitWidth; i += 8) {
				const shiftAmount = bitWidth - 8 - i * 2;
				const shifted = binary(shiftAmount > 0 ? ">>" : "<<", self, literal(shiftAmount > 0 ? shiftAmount : -shiftAmount), scope);
				result = binary("|",
					result,
					shiftAmount !== -24 ? binary("&", shifted, literal(0xFF << i), scope) : shifted,
					scope,
				);
			}
			return result;
		});
	}, "(Self) -> Self");
	const fixedWidthIntegerConformance: ProtocolConformance = {
		functions: {
			"init(_:radix:)": wrapped((scope, arg) => {
				const input = read(arg(0, "text"), scope);
				const result = uniqueName(scope, "integer");
				return statements([
					addVariable(scope, result, "Int", call(expr(identifier("parseInt")), [
						expr(input),
						arg(1, "radix"),
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
			}, "(String, Int) -> Self?"),
			"min": wrapped((scope, arg) => literal(min), "() -> Self"),
			"max": wrapped((scope, arg) => literal(max), "() -> Self"),
			"littleEndian": wrapped((scope, arg) => arg(0, "self"), "(Self) -> Self"),
			"bigEndian": byteSwapped,
			"byteSwapped": byteSwapped,
			"bitWidth": wrapped((scope, arg) => literal(bitWidth), "() -> Self"),
			"&+": wrapped(binaryBuiltin("+", 0, wrap), "(Self, Self) -> Self"),
			"&*": wrapped(binaryBuiltin("*", 0, wrap), "(Self, Self) -> Self"),
			"&-": wrapped(binaryBuiltin("-", 0, wrap), "(Self, Self) -> Self"),
			"&<<": wrapped(binaryBuiltin("<<", 0, wrap), "(Self, Self) -> Self"),
			"&>>": wrapped(binaryBuiltin(">>", 0, wrap), "(Self, Self) -> Self"),
			"addingReportingOverflow(_:)": wrapped((scope, arg) => reuse(binary("+", arg(0, "lhs"), arg(1, "rhs"), scope), scope, "full", (full) => {
				return reuse(wrap(full, scope), scope, "truncated", (truncated) => {
					return tuple([truncated, binary("!==", truncated, full, scope)]);
				});
			}), "(Self, Self) -> (Self, Bool)"),
			"subtractingReportingOverflow(_:)": wrapped((scope, arg) => reuse(binary("-", arg(0, "lhs"), arg(1, "rhs"), scope), scope, "full", (full) => {
				return reuse(wrap(full, scope), scope, "truncated", (truncated) => {
					return tuple([truncated, binary("!==", truncated, full, scope)]);
				});
			}), "(Self, Self) -> (Self, Bool)"),
			"multipliedReportingOverflow(by:)": wrapped((scope, arg) => reuse(binary("*", arg(0, "lhs"), arg(1, "rhs"), scope), scope, "full", (full) => {
				return reuse(wrap(full, scope), scope, "truncated", (truncated) => {
					return tuple([truncated, binary("!==", truncated, full, scope)]);
				});
			}), "(Self, Self) -> (Self, Bool)"),
			"dividedReportingOverflow(by:)": wrapped((scope, arg) => reuse(binary("|", binary("/", arg(0, "lhs"), arg(1, "rhs"), scope), literal(0), scope), scope, "full", (full) => {
				return reuse(wrap(full, scope), scope, "truncated", (truncated) => {
					return tuple([truncated, binary("!==", truncated, full, scope)]);
				});
			}), "(Self, Self) -> (Self, Bool)"),
			"remainderReportingOverflow(dividingBy:)": wrapped((scope, arg) => reuse(binary("%", arg(0, "lhs"), arg(1, "rhs"), scope), scope, "full", (full) => {
				return reuse(wrap(full, scope), scope, "truncated", (truncated) => {
					return tuple([truncated, binary("!==", truncated, full, scope)]);
				});
			}), "(Self, Self) -> (Self, Bool)"),
			"nonzeroBitCount": wrapped((scope, arg) => reuse(arg(0, "value"), scope, "value", (value, literalValue) => {
				if (typeof literalValue === "number") {
					// Population count of a literal
					let count: number = 0;
					let current = literalValue;
					while (current) {
						count++;
						current &= current - 1;
					}
					return literal(count);
				}
				// Population count at runtime
				const currentName = uniqueName(scope, "current");
				const currentDeclaration = addVariable(scope, currentName, "Self", value);
				const countName = uniqueName(scope, "count");
				const countDeclaration = addVariable(scope, countName, "Self", literal(0));
				return statements([
					currentDeclaration,
					countDeclaration,
					whileStatement(
						identifier(currentName),
						blockStatement(concat(
							ignore(set(
								lookup(countName, scope),
								literal(1),
								scope,
								"+=",
							), scope),
							ignore(set(
								lookup(currentName, scope),
								binary("-", lookup(currentName, scope), literal(1), scope),
								scope,
								"&=",
							), scope),
						)),
					),
					returnStatement(identifier(countName)),
				]);
			}), "(Self) -> Self"),
			"leadingZeroBitCount": wrapped((scope, arg) => reuse(arg(0, "value"), scope, "value", (value, literalValue) => {
				if (typeof literalValue === "number") {
					// Count leading zero bits of literal
					let shift = bitWidth;
					// tslint:disable-next-line:no-empty
					while (literalValue >> --shift === 0 && shift >= 0) {
					}
					return literal(bitWidth - 1 - shift);
				}
				// Count leading zero bits at runtime
				const shiftName = uniqueName(scope, "shift");
				const shiftDeclaration = addVariable(scope, shiftName, "Self", literal(bitWidth));
				return statements([
					shiftDeclaration,
					whileStatement(
						read(
							logical("&&",
								binary("===",
									binary(">>",
										value,
										expr(updateExpression("--", identifier(shiftName), true)),
										scope,
									),
									literal(0),
									scope,
								),
								binary(">=",
									lookup(shiftName, scope),
									literal(0),
									scope,
								),
								scope,
							),
							scope,
						),
						blockStatement([]),
					),
					returnStatement(read(binary("-", literal(bitWidth - 1), lookup(shiftName, scope), scope), scope)),
				]);
			}), "(Self) -> Self"),
			"multipliedFullWidth(by:)": wrapped((scope, arg) => {
				const magnitudeBitWidth = min < 0 ? bitWidth - 1 : bitWidth;
				if (bitWidth <= 16) {
					return reuse(binary("*", arg(0, "lhs"), arg(1, "rhs"), scope), scope, "multiplied", (multiplied) => {
						return tuple([
							binary(">>", multiplied, literal(magnitudeBitWidth), scope),
							binary("&", multiplied, literal((1 << magnitudeBitWidth) - 1), scope),
						]);
					});
				}
				return reuse(arg(0, "lhs"), scope, "lhs", (lhs, lhsLiteral) => {
					return reuse(arg(1, "rhs"), scope, "rhs", (rhs, rhsLiteral) => {
						return tuple([
							binary("|", binary("/", binary("*", lhs, rhs, scope), literal(Math.pow(2, 32)), scope), literal(0), scope),
							typeof lhsLiteral === "number" && typeof rhsLiteral === "number" ?
								literal(Math.imul(lhsLiteral, rhsLiteral)) :
								call(member(expr(identifier("Math")), "imul", scope), [
									lhs,
									rhs,
								], ["String", "Int"], scope),
						]);
					});
				});
			}, "(Self, Self) -> Self"),
			"dividingFullWidth(_:)": wrapped((scope) => {
				return call(functionValue("Swift.(swift-to-js).notImplemented()", undefined, { kind: "function", arguments: voidType, return: voidType, throws: true, rethrows: false, attributes: [] }), [], [], scope);
			}, "((Self, Self)) -> (Self, Self)"),
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
			"init(_:)": (outerScope, outerArg) => {
				const sourceTypeArg = outerArg(1, "T");
				return callable((scope, arg) => {
					const sourceType = conformance(sourceTypeArg, integerTypeName, scope);
					return integerRangeCheck(
						scope,
						arg(0, "value"),
						range,
						rangeForNumericType(sourceType, scope),
					);
				}, "(Self) -> Self");
			},
			"init(exactly:)": initExactly,
		},
		requirements: [],
	};
	if (min < 0) {
		// Only SignedInteger has these methods
		integerConformance.functions["&+"] = wrapped(binaryBuiltin("+", 0, wrap), "(Self, Self) -> Self");
		integerConformance.functions["&-"] = wrapped(binaryBuiltin("-", 0, wrap), "(Self, Self) -> Self");
	}
	const reifiedType: ReifiedType = {
		functions: lookupForMap({
			"init(_builtinIntegerLiteral:)": wrapped((scope, arg) => arg(0, "value"), "(Self) -> Self"),
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
		conformances: withPossibleRepresentations(applyDefaultConformances({
			Hashable: hashableConformance,
			Equatable: equatableConformance,
			Comparable: comparableConformance,
			BinaryInteger: binaryIntegerConformance,
			AdditiveArithmetic: additiveArithmeticConformance,
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
		}, globalScope), PossibleRepresentation.Number),
		defaultValue() {
			return literal(0);
		},
		innerTypes: {
		},
	};
	return reifiedType;
}
