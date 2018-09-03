import { Declaration, exportNamedDeclaration, Expression, identifier, Identifier, Statement, ThisExpression, variableDeclaration, variableDeclarator } from "babel-types";
import { functions as builtinFunctions } from "./builtins";
import { FunctionBuilder, GetterSetterBuilder } from "./functions";
import { ReifiedType, TypeMap } from "./reified";
import { Type } from "./types";

export const undefinedLiteral = identifier("undefined");

export interface Scope {
	name: string;
	declarations: { [name: string]: Declaration | undefined };
	types: TypeMap;
	functions: typeof builtinFunctions;
	functionUsage: { [name: string]: true };
	mapping: { [name: string]: ThisExpression | Identifier };
	parent: Scope | undefined;
}

export function addVariable(scope: Scope, name: Identifier, initializer: Expression | undefined = undefinedLiteral) {
	if (Object.hasOwnProperty.call(scope.declarations, name.name)) {
		throw new Error(`Declaration of ${name.name} already exists`);
	}
	scope.mapping[name.name] = name;
	scope.declarations[name.name] = typeof initializer === "undefined" ? undefined : variableDeclaration("let", [variableDeclarator(name, initializer === undefinedLiteral ? undefined : initializer)]);
}

export function addExternalVariable(scope: Scope, name: Identifier, initializer: Expression = undefinedLiteral) {
	if (Object.hasOwnProperty.call(scope.declarations, name.name)) {
		throw new Error(`Declaration of ${name.name} already exists`);
	}
	scope.mapping[name.name] = name;
	scope.declarations[name.name] = exportNamedDeclaration(variableDeclaration("let", [variableDeclarator(name, initializer === undefinedLiteral ? undefined : initializer)]), []);
}

export function rootScope(scope: Scope) {
	let result = scope;
	while (typeof result.parent !== "undefined") {
		result = result.parent;
	}
	return result;
}

export function newScope(name: string, parent: Scope): Scope {
	return {
		name,
		declarations: Object.create(null),
		types: parent.types,
		functions: parent.functions,
		functionUsage: parent.functionUsage,
		mapping: Object.create(null),
		parent,
	};
}

export function hasNameInScope(scope: Scope, name: string): boolean {
	let current: Scope | undefined = scope;
	while (typeof current !== "undefined") {
		if (Object.hasOwnProperty.call(current.declarations, name)) {
			return true;
		}
		current = current.parent;
	}
	return false;
}

export function fullPathOfScope(scope: Scope) {
	const result: string[] = [];
	let current: Scope | undefined = scope;
	do {
		result.unshift(current.name);
		current = current.parent;
	} while (current);
	if (result.length > 1) {
		result.shift();
	}
	return result.join(".");
}

const mangledSymbols: { [symbol: string]: string } = {
	"Swift.(file).": "$$",
	"Swift.(swift-to-js).": "$$",
	"_:": "",
	"()": "",
	":": "$",
	".": "$",
	"_": "_",
	"(": "$",
	")": "",
	"[": "$open$",
	"]": "$close$",
	"$": "$dollar$",
	" ": "$space$",
	"+": "$plus$",
	"-": "$minus$",
	"*": "$multiply$",
	"/": "$divide$",
	"%": "$mod$",
	"<": "$less$",
	">": "$greater$",
	"=": "$equal$",
	"&": "$and$",
	"|": "$or$",
	"^": "$xor$",
	"!": "$not$",
	"?": "$question$",
	",": "$comma$",
	"~": "$tilde$",
};

function mangleSymbol(symbol: string) {
	return Object.hasOwnProperty.call(mangledSymbols, symbol) ? mangledSymbols[symbol] : "$" + symbol.charCodeAt(0) + "$";
}

export function mangleName(name: string) {
	return identifier(name.replace(/\b_:/g, mangleSymbol).replace(/(Swift\.\((file|swift-to-js)\).|\(\)|\W)/g, mangleSymbol));
}

export function lookup(name: string, scope: Scope): Identifier | ThisExpression {
	let targetScope: Scope | undefined = scope;
	do {
		if (Object.hasOwnProperty.call(targetScope.mapping, name)) {
			return targetScope.mapping[name];
		}
		targetScope = targetScope.parent;
	} while (targetScope);
	return mangleName(name);
}

export function uniqueIdentifier(scope: Scope, prefix: string = "$temp") {
	let i = 0;
	let name = prefix;
	while (hasNameInScope(scope, name)) {
		name = prefix + i++;
	}
	return identifier(name);
}

export function emitScope(scope: Scope, statements: Statement[]): Statement[] {
	const keys = Object.keys(scope.declarations);
	if (keys.length === 0) {
		return statements;
	}
	return (keys.filter((key) => typeof scope.declarations[key] !== "undefined").map((key) => scope.declarations[key]) as Statement[]).concat(statements);
}
