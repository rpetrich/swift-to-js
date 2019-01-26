import { wrapped } from "../functions";
import { withPossibleRepresentations, FunctionMap, PossibleRepresentation, ReifiedType } from "../reified";
import { addVariable, lookup, uniqueName, DeclarationFlags, Scope } from "../scope";
import { lookupForMap } from "../utils";
import { binary, call, callable, conditional, expr, expressionLiteralValue, literal, member, read, statements, unary } from "../values";
import { applyDefaultConformances, binaryBuiltin, updateBuiltin } from "./common";

import { identifier, returnStatement } from "@babel/types";

export function buildFloatingType(globalScope: Scope): ReifiedType {
	const reifiedType: ReifiedType = {
		functions: lookupForMap({
			"init(_:)": wrapped((scope, arg) => arg(0, "value"), "(Self) -> Self"),
			"init(_builtinIntegerLiteral:)": wrapped((scope, arg) => arg(0, "value"), "(Self) -> Self"),
			"init(_builtinFloatLiteral:)": wrapped((scope, arg) => arg(0, "value"), "(Self) -> Self"),
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
		conformances: withPossibleRepresentations(applyDefaultConformances({
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
						return callable(() => call(member("Math", "sqrt", scope), [arg(1, "value")], ["Double"], scope), "() -> Self");
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
		}, globalScope), PossibleRepresentation.Number),
		defaultValue() {
			return literal(0);
		},
		innerTypes: {
		},
	};
	return reifiedType;
}
