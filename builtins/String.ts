import { wrapped, wrappedSelf } from "../functions";
import { primitive, FunctionMap, PossibleRepresentation } from "../reified";
import { addVariable, lookup, mangleName, uniqueName, Scope } from "../scope";
import { concat } from "../utils";
import { binary, call, callable, conditional, expr, expressionLiteralValue, functionValue, ignore, literal, member, read, reuse, set, statements, typeTypeValue, typeValue, undefinedValue, Value } from "../values";
import { applyDefaultConformances, binaryBuiltin, cachedBuilder, reuseArgs, voidType } from "./common";
import { emptyOptional, wrapInOptional } from "./Optional";

import { blockStatement, forStatement, identifier, newExpression, returnStatement, updateExpression, Statement } from "@babel/types";

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

export function String(simpleStrings: boolean) {
	return cachedBuilder((globalScope) => {
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
					"hash(into:)": wrapped((scope, arg) => {
						return reuseArgs(arg, 0, scope, ["string", "hasher"], (str, hasher) => {
							const hasherType = typeValue("Hasher");
							const combine = call(functionValue("combine()", hasherType, "(Type) -> (inout Hasher, Int) -> Void"), [hasherType], [typeTypeValue], scope);
							const i = uniqueName(scope, "i");
							return statements([
								forStatement(
									addVariable(scope, i, "Int", literal(0)),
									read(binary("<", lookup(i, scope), member(str, "length", scope), scope), scope),
									updateExpression("++", mangleName(i)),
									blockStatement(
										ignore(call(combine, [arg(1, "hasher"), call(member(str, "charCodeAt", scope), [lookup(i, scope)], ["Int"], scope)], ["Hasher", "Int"], scope), scope),
									),
								),
							]);
						});
					}, "(Self, inout Hasher) -> Bool"),
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
	});
}
