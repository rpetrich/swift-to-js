import { wrapped } from "../functions";
import { expressionSkipsCopy, withPossibleRepresentations, FunctionMap, PossibleRepresentation, ReifiedType, TypeParameterHost } from "../reified";
import { addVariable, lookup, uniqueName, Scope } from "../scope";
import { concat, lookupForMap } from "../utils";
import { array, binary, call, callable, conditional, conformance, copy, expr, functionValue, ignore, literal, logical, member, read, reuse, set, statements, transform, typeFromValue, typeTypeValue, typeValue, undefinedValue, ArgGetter, Value } from "../values";
import { applyDefaultConformances, isEmptyFromLength, readLengthField, reuseArgs, startIndexOfZero, voidType } from "./common";

import { emptyOptional, wrapInOptional } from "./Optional";

import { blockStatement, breakStatement, forStatement, functionExpression, identifier, ifStatement, returnStatement, updateExpression, whileStatement } from "@babel/types";

const dummyType = typeValue({ kind: "name", name: "Dummy" });

export function arrayBoundsFailed(scope: Scope) {
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

export function Array(globalScope: Scope, typeParameters: TypeParameterHost): ReifiedType {
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
						member(arg(2, "collection"), "join", scope),
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
		conformances: withPossibleRepresentations(applyDefaultConformances({
			ExpressibleByArrayLiteral: {
				functions: {
					"init(arrayLiteral:)": wrapped((scope, arg) => {
						return arg(0, "array");
					}, "(Self.ArrayLiteralElement...) -> Self"),
				},
				requirements: [],
			},
			Equatable: {
				functions: {
					"==": arrayCompare("equal"),
					"!=": arrayCompare("unequal"),
				},
				requirements: [],
			},
			Hashable: {
				functions: {
					"hashValue": wrapped((scope, arg) => {
						const hashValue = call(functionValue("hashValue", conformance(valueType, "Hashable", scope), "(Type) -> (Self) -> Int"), [valueType], [typeTypeValue], scope);
						const hasherType = typeValue("Hasher");
						const combine = call(functionValue("combine()", hasherType, "(Type) -> (inout Hasher, Int) -> Void"), [hasherType], [typeTypeValue], scope);
						return reuseArgs(arg, 0, scope, ["array"], (arrayValue) => {
							const result = uniqueName(scope, "hash");
							const i = uniqueName(scope, "i");
							return statements([
								addVariable(scope, result, "Int", array([literal(0)], scope)),
								forStatement(
									addVariable(scope, i, "Int", literal(0)),
									read(binary("<",
										lookup(i, scope),
										member(arrayValue, "length", scope),
										scope,
									), scope),
									updateExpression("++", read(lookup(i, scope), scope)),
									blockStatement(
										ignore(
											transform(
												call(
													hashValue,
													[member(arrayValue, lookup(i, scope), scope)],
													["Self"],
													scope,
												),
												scope,
												(elementHashValue) => call(
													combine,
													[
														lookup(result, scope),
														expr(elementHashValue),
													],
													[
														"Hasher",
														"Int",
													],
													scope,
												),
											),
											scope,
										),
									),
								),
								returnStatement(read(binary("|", member(lookup(result, scope), 0, scope), literal(0), scope), scope)),
							]);
						});
					}, "(Self) -> Int"),
					"hash(into:)": wrapped((scope, arg) => {
						const hashValue = call(functionValue("hashValue", conformance(valueType, "Hashable", scope), "(Type) -> (Self) -> Int"), [valueType], [typeTypeValue], scope);
						const hasherType = typeValue("Hasher");
						const combine = call(functionValue("combine()", hasherType, "(Type) -> (inout Hasher, Int) -> Void"), [hasherType], [typeTypeValue], scope);
						return reuseArgs(arg, 0, scope, ["array", "hasher"], (arrayValue, hasher) => {
							const i = uniqueName(scope, "i");
							return statements([
								forStatement(
									addVariable(scope, i, "Int", literal(0)),
									read(binary("<",
										lookup(i, scope),
										member(arrayValue, "length", scope),
										scope,
									), scope),
									updateExpression("++", read(lookup(i, scope), scope)),
									blockStatement(
										ignore(
											transform(
												call(
													hashValue,
													[member(arrayValue, lookup(i, scope), scope)],
													["Self"],
													scope,
												),
												scope,
												(elementHashValue) => call(
													combine,
													[
														hasher,
														expr(elementHashValue),
													],
													[
														"inout Hasher",
														"Int",
													],
													scope,
												),
											),
											scope,
										),
									),
								),
							]);
						});
					}, "(Self, inout Hasher) -> Void"),
				},
				requirements: [],
			},
			Collection: {
				functions: {
					"Element": wrapped(() => valueType, "() -> Type"),
					"subscript(_:)": wrapped((scope, arg) => member(arg(0, "array"), arg(1, "index"), scope), "(Self, Self.Index) -> Self.Element"),
					"startIndex": wrapped(() => literal(0), "(Self) -> Self.Index"),
					"endIndex": wrapped((scope, arg) => member(arg(0, "array"), "length", scope), "(Self) -> Self.Index"),
					"index(after:)": wrapped((scope, arg) => binary("+", arg(0, "index"), literal(1), scope), "(Self, Self.Index) -> Self.Index"),
				},
				requirements: ["Sequence"],
			},
			BidirectionalCollection: {
				functions: {
					"index(before:)": wrapped((scope, arg) => {
						return binary("-", arg(0, "index"), literal(1), scope);
					}, "(String, String.Index) -> String.Index"),
					"joined(separator:)": (scope, arg, type) => {
						const collection = arg(1, "collection");
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
				requirements: ["Collection"],
			},
			Sequence: {
				functions: {
					"makeIterator()": wrapped((scope, arg) => {
						const iteratorType = typeValue({ kind: "generic", base: { kind: "name", name: "IndexingIterator" }, arguments: [{ kind: "generic", base: { kind: "name", name: "Array" }, arguments: [valueType.type] }] });
						const iteratorInit = functionValue("init(_elements:)", iteratorType, "(Type) -> (Self.Elements) -> Self");
						return call(call(iteratorInit, [iteratorType], ["Type"], scope), [arg(0, "array")], ["Self.Elements"], scope);
					}, "(Self) -> Self.Iterator"),
					"Iterator": (scope, arg) => {
						return typeValue({ kind: "generic", base: { kind: "name", name: "IndexingIterator" }, arguments: [{ kind: "generic", base: { kind: "name", name: "Array" }, arguments: [valueType.type] }] });
					},
				},
				requirements: [],
			},
		}, globalScope), PossibleRepresentation.Array),
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
}
