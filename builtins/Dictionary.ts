import { wrapped } from "../functions";
import { expressionSkipsCopy, inheritLayout, withPossibleRepresentations, FunctionMap, PossibleRepresentation, ReifiedType, TypeParameterHost } from "../reified";
import { addVariable, lookup, uniqueName, Scope } from "../scope";
import { concat, lookupForMap } from "../utils";
import { call, conditional, conformance, copy, expr, expressionLiteralValue, functionValue, hasRepresentation, ignore, literal, logical, member, read, representationsForTypeValue, reuse, set, statements, stringifyValue, typeFromValue, typeTypeValue, typeValue, unary, Value } from "../values";
import { applyDefaultConformances, isEmptyFromLength, readLengthField, reuseArgs, startIndexOfZero } from "./common";
import { emptyOptional, optionalIsSome, unwrapOptional, wrapInOptional } from "./Optional";

import { blockStatement, breakStatement, forInStatement, identifier, ifStatement, isLiteral, returnStatement, Identifier, Node } from "@babel/types";

export function Dictionary(globalScope: Scope, typeParameters: TypeParameterHost): ReifiedType {
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
			conformances: withPossibleRepresentations(applyDefaultConformances({
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
			}, globalScope), PossibleRepresentation.Object),
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
	const representationsValue = expressionLiteralValue(read(representationsForTypeValue(keyType, globalScope), globalScope));
	switch (representationsValue) {
		case PossibleRepresentation.String:
			return objectDictionaryImplementation();
		case PossibleRepresentation.Boolean:
			return objectDictionaryImplementation(expr(identifier("Boolean")));
		case PossibleRepresentation.Number:
			return objectDictionaryImplementation(expr(identifier("Number")));
		default:
			throw new Error(`No dictionary implementation for keys of type ${stringifyValue(keyType)}`);
	}
}
