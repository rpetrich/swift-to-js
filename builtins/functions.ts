import { noinline } from "../functions";
import { FunctionMap } from "../reified";
import { addVariable, lookup, uniqueName, DeclarationFlags, Scope } from "../scope";
import { concat } from "../utils";
import { binary, call, callable, conditional, conformance, expr, functionValue, ignore, literal, logical, member, read, set, statements, typeValue, unary, ArgGetter, Value } from "../values";

import { arrayBoundsFailed } from "./Array";
import { reuseArgs } from "./common";
import { optionalIsSome, unwrapOptional } from "./Optional";

import { blockStatement, expressionStatement, identifier, ifStatement, newExpression, returnStatement, throwStatement } from "@babel/types";

function unavailableFunction(scope: Scope, arg: ArgGetter, name: string): Value {
	throw new Error(`${name} is not available`);
}

function throwHelper(type: "Error" | "TypeError" | "RangeError", text: string) {
	return noinline((scope, arg) => statements([throwStatement(newExpression(identifier(type), [literal(text).expression]))]), "() throws -> Void");
}

const dummyType = typeValue({ kind: "name", name: "Dummy" });

export const functions: FunctionMap = {
	"Swift.(swift-to-js).numericRangeFailed()": throwHelper("RangeError", "Not enough bits to represent the given value"),
	"Swift.(swift-to-js).forceUnwrapFailed()": throwHelper("TypeError", "Unexpectedly found nil while unwrapping an Optional value"),
	"Swift.(swift-to-js).arrayBoundsFailed()": throwHelper("RangeError", "Array index out of range"),
	"Swift.(swift-to-js).stringBoundsFailed()": throwHelper("RangeError", "String index out of range"),
	"Swift.(swift-to-js).notImplemented()": throwHelper("Error", "Not implemented!"),
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
		const result = call(functionValue("~=", conformance(T, "Equatable", scope), "(T.Type) -> (T, T) -> Bool"), [T], [dummyType], scope);
		return call(result, [arg(1, "pattern"), arg(2, "value")], [T, T], scope);
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

