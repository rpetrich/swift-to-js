import { arrayExpression, BooleanLiteral, Declaration, exportNamedDeclaration, Expression, identifier, Identifier, memberExpression, NullLiteral, NumericLiteral, Statement, StringLiteral, ThisExpression, variableDeclaration, variableDeclarator } from "babel-types";
import { functions as builtinFunctions } from "./builtins";
import { FunctionBuilder, GetterSetterBuilder } from "./functions";
import { ReifiedType, TypeMap } from "./reified";
import { Type } from "./types";
import { concat } from "./utils";
import { boxed, BoxedValue, constructBox, expr, ExpressionValue, literal, stringifyType, SubscriptValue, typeRequiresBox, VariableValue } from "./values";

export enum DeclarationFlags {
	None = 0,
	Export = 1 << 0,
	Const = 1 << 1,
	Boxed = 1 << 2,
}

type MappedValue = BoxedValue | ExpressionValue | SubscriptValue | VariableValue;

export interface Scope {
	name: string;
	declarations: { [name: string]: { flags: DeclarationFlags; declaration?: Declaration; } };
	types: TypeMap;
	functions: typeof builtinFunctions;
	functionUsage: { [name: string]: true };
	mapping: { [name: string]: MappedValue };
	parent: Scope | undefined;
}

export function addDeclaration(scope: Scope, name: string, callback: (id: Identifier) => Declaration, flags: DeclarationFlags = DeclarationFlags.None) {
	if (Object.hasOwnProperty.call(scope.declarations, name)) {
		throw new Error(`Declaration of ${name} already exists`);
	}
	const identifier = mangleName(name);
	const result = expr(identifier);
	scope.mapping[name] = result;
	scope.declarations[name] = { flags, declaration: callback(identifier) };
	return result;
}

export function addVariable(scope: Scope, name: string, type: Type, init?: Expression, flags: DeclarationFlags = DeclarationFlags.None) {
	if (Object.hasOwnProperty.call(scope.declarations, name)) {
		throw new Error(`Declaration of ${name} already exists`);
	}
	const isBoxed = flags & DeclarationFlags.Boxed;
	scope.mapping[name] = isBoxed ? boxed(expr(mangleName(name)), type) : expr(mangleName(name));
	scope.declarations[name] = { flags, declaration: undefined };
	const requiresBox = isBoxed && typeRequiresBox(type, scope);
	return variableDeclaration(flags & DeclarationFlags.Const || requiresBox ? "const" : "let", [variableDeclarator(mangleName(name), requiresBox ? constructBox(init, type, scope) : init)]);
}

export function rootScope(scope: Scope) {
	let result = scope;
	while (typeof result.parent !== "undefined") {
		result = result.parent;
	}
	return result;
}

export function newScope(name: string, parent: Scope, types: TypeMap = parent.types): Scope {
	return {
		name,
		declarations: Object.create(null),
		types,
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
	"==": "$equals$",
	"!=": "$notequals$",
	"~=": "$match$",
	"<=": "$lessequal$",
	">=": "$greaterequal$",
	"+=": "$added$",
	"-=": "$subtracted$",
	"*=": "$multiplied$",
	"/=": "$divided$",
};

function mangleSymbol(symbol: string) {
	return Object.hasOwnProperty.call(mangledSymbols, symbol) ? mangledSymbols[symbol] : "$" + symbol.charCodeAt(0) + "$";
}

export function mangleName(name: string) {
	return identifier(name.replace(/\b_:/g, mangleSymbol).replace(/(Swift\.\((file|swift-to-js)\).|[=!~<>+\-*/]=|\(\)|\W)/g, mangleSymbol));
}

export function lookup(name: string, scope: Scope): MappedValue {
	let targetScope: Scope | undefined = scope;
	do {
		if (Object.hasOwnProperty.call(targetScope.mapping, name)) {
			return targetScope.mapping[name];
		}
		targetScope = targetScope.parent;
	} while (targetScope);
	return expr(mangleName(name));
}

export function uniqueName(scope: Scope, prefix: string = "$temp") {
	let i = 0;
	let name = prefix;
	while (hasNameInScope(scope, name)) {
		name = prefix + i++;
	}
	return name;
}

export function emitScope(scope: Scope, statements: Statement[]): Statement[] {
	const keys = Object.keys(scope.declarations);
	if (keys.length === 0) {
		return statements;
	}
	const result: Statement[] = [];
	for (const key of keys) {
		const declaration = scope.declarations[key];
		if (typeof declaration.declaration !== "undefined") {
			result.push(declaration.flags & DeclarationFlags.Export ? exportNamedDeclaration(declaration.declaration, []) : declaration.declaration);
		}
	}
	return concat(result, statements);
}
