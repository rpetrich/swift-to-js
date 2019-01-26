import { wrapped } from "../functions";
import { primitive, PossibleRepresentation, ReifiedType, TypeParameterHost } from "../reified";
import { addVariable, lookup, uniqueName, DeclarationFlags, Scope } from "../scope";
import { concat } from "../utils";
import { binary, call, callable, expr, ignore, isPure, literal, member, read, set, statements, tuple, typeValue, Value } from "../values";
import { applyDefaultConformances, binaryBuiltin } from "./common";

import { arrayPattern, blockStatement, forStatement, returnStatement, updateExpression, variableDeclaration, variableDeclarator, Statement } from "@babel/types";

const dummyType = typeValue({ kind: "name", name: "Dummy" });

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

export function ClosedRange(globalScope: Scope, typeParameters: TypeParameterHost): ReifiedType {
	return primitive(PossibleRepresentation.Array, tuple([literal(0), literal(0)]), {
	}, applyDefaultConformances({
		// TODO: Implement Equatable
		Equatable: {
			functions: {
				"==": wrapped(binaryBuiltin("===", 0), "(Self, Self) -> Bool"),
			},
			requirements: [],
		},
		Sequence: {
			functions: {
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
			},
			requirements: [],
		},
		Collection: {
			functions: {
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
			},
			requirements: [],
		},
	}, globalScope));
}
