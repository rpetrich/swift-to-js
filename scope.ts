import { exportNamedDeclaration, identifier, returnStatement, variableDeclaration, variableDeclarator, Declaration, Identifier, Statement } from "babel-types";
import { functions as builtinFunctions } from "./builtins";
import { parseType } from "./parse";
import { TypeMap } from "./reified";
import { concat } from "./utils";
import { boxed, constructBox, expr, read, statements, typeRequiresBox, typeValue, BoxedValue, ConformanceValue, ExpressionValue, SubscriptValue, TypeValue, Value, VariableValue } from "./values";

export enum DeclarationFlags {
	None = 0,
	Export = 1 << 0,
	Const = 1 << 1,
	Boxed = 1 << 2,
}

export type MappedNameValue = BoxedValue | ExpressionValue | SubscriptValue | VariableValue | TypeValue | ConformanceValue;

export interface Scope {
	name: string;
	declarations: { [name: string]: { flags: DeclarationFlags; declaration?: Declaration; } };
	types: TypeMap;
	functions: typeof builtinFunctions;
	functionUsage: { [name: string]: true };
	mapping: { [name: string]: MappedNameValue };
	parent: Scope | undefined;
}

export function addDeclaration(scope: Scope, name: string, callback: (id: Identifier) => Declaration, flags: DeclarationFlags = DeclarationFlags.None) {
	if (Object.hasOwnProperty.call(scope.declarations, name)) {
		throw new Error(`Declaration of ${name} already exists`);
	}
	const id = mangleName(name);
	const result = expr(id);
	scope.mapping[name] = result;
	scope.declarations[name] = { flags, declaration: callback(id) };
	return result;
}

export function addVariable(scope: Scope, name: string, typeOrTypeString: string | Value, init?: Value, flags: DeclarationFlags = DeclarationFlags.None) {
	if (Object.hasOwnProperty.call(scope.declarations, name)) {
		throw new Error(`Declaration of ${name} already exists`);
	}
	const type = typeof typeOrTypeString === "string" ? typeValue(parseType(typeOrTypeString)) : typeOrTypeString;
	const isBoxed = flags & DeclarationFlags.Boxed;
	const mangled = mangleName(name);
	scope.mapping[name] = isBoxed ? boxed(expr(mangled), type) : expr(mangled);
	scope.declarations[name] = { flags, declaration: undefined };
	if (type.kind !== "type") {
		// TODO: Support runtime types
		throw new TypeError(`Do not support runtime types in addVariable!`);
	}
	const requiresBox = isBoxed && typeRequiresBox(type.type, scope);
	if (requiresBox) {
		init = constructBox(init, type.type, scope);
	}
	const initExpression = typeof init !== "undefined" ? read(init, scope) : undefined;
	return variableDeclaration(
		flags & DeclarationFlags.Const || requiresBox ? "const" : "let",
		[variableDeclarator(mangled, typeof initExpression !== "undefined" && (initExpression.type !== "Identifier" || initExpression.name !== "undefined") ? initExpression : undefined)],
	);
}

export function rootScope(scope: Scope) {
	let result = scope;
	while (typeof result.parent !== "undefined") {
		result = result.parent;
	}
	return result;
}

export function newScope(name: string, parent: Scope, callback: (scope: Scope) => Value, types: TypeMap = parent.types): Value {
	const scope: Scope = {
		name,
		declarations: Object.create(null),
		types,
		functions: parent.functions,
		functionUsage: parent.functionUsage,
		mapping: Object.create(null),
		parent,
	};
	return emitScope(scope, callback(scope));
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

export function lookup(name: string, scope: Scope): MappedNameValue {
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

export function emitScope<T extends Value>(scope: Scope, value: Value): Value {
	const keys = Object.keys(scope.declarations);
	if (keys.length === 0) {
		return value;
	}
	// Because reading can add declarations
	const tail = value.kind !== "statements" ? [returnStatement(read(value, scope))] : [];
	const result: Statement[] = [];
	for (const key of keys) {
		const declaration = scope.declarations[key];
		if (typeof declaration.declaration !== "undefined") {
			result.push(declaration.flags & DeclarationFlags.Export ? exportNamedDeclaration(declaration.declaration, []) : declaration.declaration);
		}
	}
	if (value.kind === "statements") {
		return statements(concat(result, value.statements));
	}
	return statements(concat(result, tail));
}
