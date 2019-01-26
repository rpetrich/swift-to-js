import { wrapped } from "../functions";
import { primitive, PossibleRepresentation } from "../reified";
import { Scope } from "../scope";
import { binary, call, callable, conditional, literal, logical, member, unary, undefinedValue } from "../values";
import { applyDefaultConformances, binaryBuiltin, cachedBuilder, reuseArgs } from "./common";

export function Bool(globalScope: Scope) {
	return primitive(PossibleRepresentation.Boolean, literal(false), {
		"init(_builtinBooleanLiteral:)": wrapped((scope, arg) => arg(0, "value"), "(Bool) -> Bool"),
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
		ExpressibleByBooleanLiteral: {
			functions: {
				"init(booleanLiteral:)": wrapped((scope, arg) => arg(0, "value"), "(Bool) -> Bool"),
			},
			requirements: [],
		},
	}, globalScope), {
		Type: cachedBuilder(() => primitive(PossibleRepresentation.Undefined, undefinedValue)),
	});
}
