import { identifier, variableDeclaration, variableDeclarator, Identifier, Expression, Statement, ThisExpression } from "babel-types";
import { FunctionBuilder } from "./functions";
import { functions as builtinFunctions } from "./builtins";

export const undefinedLiteral = identifier("undefined");

export interface Scope {
	name: string;
	variables: { [name: string]: Expression | undefined };
	functions: { [name: string]: FunctionBuilder };
	mapping: { [name: string]: ThisExpression | Identifier };
	parent: Scope | undefined;
};

export function addVariable(scope: Scope, name: string | Identifier, initializer: Expression | undefined = undefinedLiteral): boolean {
	const nameString = typeof name === "string" ? name : name.name;
	if (Object.hasOwnProperty.call(scope.variables, nameString)) {
		return false;
	}
	scope.variables[nameString] = initializer;
	return true;
}

export function rootScope(scope: Scope) {
	let result = scope;
	while (typeof result.parent !== "undefined") {
		result = result.parent;
	}
	return result;
}

export function newRootScope(): Scope {
	return {
		name: "global",
		variables: Object.create(null),
		functions: Object.assign(Object.create(null), builtinFunctions),
		mapping: Object.create(null),
		parent: undefined
	};
}

export function newScope(name: string, parent: Scope) {
	return {
		name,
		variables: Object.create(null),
		functions: parent.functions,
		mapping: Object.create(null),
		parent
	};
}

export function hasNameInScope(scope: Scope, name: string): boolean {
	let current: Scope | undefined = scope;
	while (typeof current !== "undefined") {
		if (Object.hasOwnProperty.call(current.variables, name)) {
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
	} while (current = current.parent);
	if (result.length > 1) {
		result.shift();
	}
	return result.join(".");
}

const mangledSymbols: { [symbol: string]: string } = {
	"Swift.(file).": "$$",
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
	return identifier(name.replace(/\b_:/g, mangleSymbol).replace(/(Swift\.\(file\).|\(\)|\W)/g, mangleSymbol));
}

export function lookup(name: string, scope: Scope): Identifier | ThisExpression {
	return Object.hasOwnProperty.call(scope.mapping, name) ? scope.mapping[name] : mangleName(name);
}

export function uniqueIdentifier(scope: Scope, prefix: string = "$temp") {
	let i = 0;
	let name = prefix;
	while (hasNameInScope(scope, name)) {
		name = prefix + i++;
	}
	scope.variables[name] = undefinedLiteral;
	return identifier(name);
}

export function emitScope(scope: Scope, statements: Statement[]): Statement[] {
	const keys = Object.keys(scope.variables);
	if (keys.length === 0) {
		return statements;
	}
	return ([variableDeclaration("var", keys.filter((key) => scope.variables[key]).map((key) => variableDeclarator(identifier(key), scope.variables[key] !== undefinedLiteral ? scope.variables[key] : undefined)))] as Statement[]).concat(statements);
}
