import { identifier, variableDeclaration, variableDeclarator, exportNamedDeclaration, Identifier, Expression, Declaration, Statement, ThisExpression } from "babel-types";
import { FunctionBuilder } from "./functions";
import { functions as builtinFunctions } from "./builtins";

export const undefinedLiteral = identifier("undefined");

export interface Scope {
	name: string;
	declarations: { [name: string]: Declaration | undefined };
	functions: { [name: string]: FunctionBuilder };
	functionUsage: { [name: string]: true };
	mapping: { [name: string]: ThisExpression | Identifier };
	parent: Scope | undefined;
};

export function addVariable(scope: Scope, name: Identifier, initializer: Expression | undefined = undefinedLiteral) {
	if (Object.hasOwnProperty.call(scope.declarations, name.name)) {
		throw new Error(`Declaration of ${name.name} already exists`);
	}
	scope.declarations[name.name] = typeof initializer === "undefined" ? undefined : variableDeclaration("let", [variableDeclarator(name, initializer === undefinedLiteral ? undefined : initializer)]);
}

export function addExternalVariable(scope: Scope, name: Identifier, initializer: Expression = undefinedLiteral) {
	if (Object.hasOwnProperty.call(scope.declarations, name.name)) {
		throw new Error(`Declaration of ${name.name} already exists`);
	}
	scope.declarations[name.name] = exportNamedDeclaration(variableDeclaration("let", [variableDeclarator(name, initializer === undefinedLiteral ? undefined : initializer)]), []);
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
		declarations: Object.create(null),
		functions: Object.assign(Object.create(null), builtinFunctions),
		functionUsage: Object.create(null),
		mapping: Object.create(null),
		parent: undefined
	};
}

export function newScope(name: string, parent: Scope): Scope {
	return {
		name,
		declarations: Object.create(null),
		functions: parent.functions,
		functionUsage: parent.functionUsage,
		mapping: Object.create(null),
		parent
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
	return identifier(name);
}

export function emitScope(scope: Scope, statements: Statement[]): Statement[] {
	const keys = Object.keys(scope.declarations);
	if (keys.length === 0) {
		return statements;
	}
	return (keys.filter((key) => typeof scope.declarations[key] !== "undefined").map((key) => scope.declarations[key]) as Statement[]).concat(statements);
}
