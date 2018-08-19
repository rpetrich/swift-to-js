import { stringifyType, expr, call, read, callable, ArgGetter, Value } from "./values";
import { Type } from "./types";
import { addVariable, mangleName, emitScope, rootScope, newScope, Scope } from "./scope";

import { identifier, blockStatement, functionExpression, returnStatement, thisExpression, Identifier, Expression, Statement } from "babel-types";

export type FunctionBuilder = (scope: Scope, arg: ArgGetter, type: Type, name: string) => Value;

function getArgumentPointers(type: Type): boolean[] {
	if (type.kind === "function") {
		return type.arguments.types.map((arg) => arg.kind === "modified" && arg.modifier === "inout");
	}
	throw new TypeError(`Expected a function, got a ${type.kind}: ${stringifyType(type)}`);
}

export function functionize(scope: Scope, type: Type, expression: (scope: Scope, arg: ArgGetter) => Value): Expression {
	const inner: Scope = newScope("anonymous", scope);
	inner.mapping["self"] = thisExpression();
	let usedCount = 0;
	const identifiers: { [index: number]: Identifier } = Object.create(null);
	const pointers = getArgumentPointers(type);
	const newValue = expression(inner, (i, name) => {
		if (usedCount === -1) {
			throw new Error(`Requested access to scope after it was generated!`);
		}
		if (i === "this") {
			return expr(thisExpression());
		}
		if (usedCount <= i) {
			usedCount = i + 1;
		}
		let result: Identifier;
		if (Object.hasOwnProperty.call(identifiers, i)) {
			result = identifiers[i];
		} else {
			result = identifiers[i] = identifier(typeof name === "string" ? name : "$" + i);
		}
		return expr(result, pointers[i]);
	});
	const args: Identifier[] = [];
	for (let i = 0; i < usedCount; i++) {
		args[i] = Object.hasOwnProperty.call(identifiers, i) ? identifiers[i] : identifier("$" + i);
	}
	let statements: Statement[];
	if (newValue.kind === "statements") {
		statements = newValue.statements;
	} else {
		statements = [returnStatement(read(newValue, inner))];
	}
	const result = functionExpression(undefined, args, blockStatement(emitScope(inner, statements)));
	usedCount = -1;
	return result;
}

export function insertFunction(name: string, scope: Scope, type: Type, builder: FunctionBuilder | undefined = scope.functions[name]): Identifier {
	if (typeof builder === "undefined") {
		throw new Error(`Cannot find function named ${name}`);
	}
	if (type.kind !== "function") {
		throw new Error(`Expected function, got ${stringifyType(type)}`);
	}
	const argTypes = type.arguments.types;
	const mangled = mangleName(name);
	const globalScope = rootScope(scope);
	scope.functions[name] = (scope, arg) => call(expr(mangled), argTypes.map((_, i) => arg(i)), scope);
	addVariable(globalScope, mangled, functionize(globalScope, type, (inner, arg) => builder(inner, arg, type, name)));
	return mangled;
}

export function noinline(builder: FunctionBuilder): FunctionBuilder {
	return (scope: Scope, arg: ArgGetter, type: Type, name: string) => {
		return expr(insertFunction(name, scope, type, builder));
	};
}
