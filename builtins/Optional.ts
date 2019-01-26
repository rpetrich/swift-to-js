import { applyDefaultConformances, binaryBuiltin, returnTodo, reuseArgs } from "../builtins";
import { wrapped } from "../functions";
import { expressionSkipsCopy, FunctionMap, PossibleRepresentation, ReifiedType, TypeParameterHost } from "../reified";
import { Scope } from "../scope";
import { lookupForMap } from "../utils";
import { array, binary, call, conditional, conformance, expr, functionValue, hasRepresentation, literal, logical, member, read, representationsForTypeValue, reuse, typeFromValue, typeIsDirectlyComparable, typeTypeValue, ArgGetter, Value } from "../values";

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

export function Optional(globalScope: Scope, typeParameters: TypeParameterHost): ReifiedType {
	const [ wrappedType ] = typeParameters("Wrapped");
	const reified = typeFromValue(wrappedType, globalScope);
	if (wrappedType.kind !== "type") {
		// TODO: Support runtime types
		throw new TypeError(`Runtime types are not supported as Self in Self?`);
	}
	// Assume values that can be represented as boolean, number or string can be value-wise compared
	const isDirectlyComparable = typeIsDirectlyComparable(wrappedType, globalScope);
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
		functions: lookupForMap({
			"none": (scope) => emptyOptional(wrappedType, scope),
			"some": wrapped((scope, arg) => wrapInOptional(arg(0, "wrapped"), wrappedType, scope), "(Self) -> Self?"),
			"==": compareEqual,
			"!=": compareUnequal,
			"flatMap": returnTodo,
		} as FunctionMap),
		conformances: applyDefaultConformances({
			Object: {
				functions: {
					":rep": wrapped((innerScope) => {
						return conditional(
							binary("&",
								representationsForTypeValue(wrappedType, innerScope),
								literal(PossibleRepresentation.Null),
								innerScope,
							),
							literal(PossibleRepresentation.Array),
							binary("|",
								representationsForTypeValue(wrappedType, innerScope),
								literal(PossibleRepresentation.Null),
								innerScope,
							),
							innerScope,
						);
					}, "() -> Int"),
				},
				requirements: [],
			},
			ExpressibleByNilLiteral: {
				functions: {
					"init(nilLiteral:)": wrapped((scope) => emptyOptional(wrappedType, scope), "() -> Self"),
				},
				requirements: [],
			},
			Equatable: {
				functions: {
					"==": compareEqual,
					"!=": compareUnequal,
				},
				requirements: [],
			},
		}, globalScope),
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
}
