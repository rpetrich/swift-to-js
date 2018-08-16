import { assignmentExpression, objectExpression, callExpression, objectProperty, functionExpression, thisExpression, blockStatement, returnStatement, arrayExpression, numericLiteral, identifier, stringLiteral, memberExpression, Expression, Identifier, MemberExpression } from "babel-types";

import { builtinFunctions, insertBuiltin } from "./builtins";
import { undefinedLiteral, uniqueIdentifier, emitScope, newScope, fullPathOfScope, Scope } from "./scope";
import { Type } from "./types";

export type ArgGetter = (index: number | "this") => Value;

export interface ExpressionValue {
	kind: "expression";
	expression: Expression;
	pointer?: boolean;
}

export function expr(expression: Expression, pointer: boolean = false): ExpressionValue {
	return { kind: "expression", expression, pointer };
}


// export interface StatementsValue {
// 	kind: "statements";
// 	statements: Statement[];
// }

// export function statements(statements: Statement[]): StatementsValue | Value {
// 	if (statements.length === 1 && statements[0].type === "ReturnStatement") {
// 		return statements[0].argument === null ? identifier("undefined") : expr(statements[0].argument);
// 	}
// 	return 
// }

export interface CallableValue {
	kind: "callable";
	call: (scope: Scope, arg: ArgGetter) => Value;
	type: Type;
}

export function callable(call: (scope: Scope, arg: ArgGetter) => Value, type: Type): CallableValue {
	return { kind: "callable", call, type };
}


export interface VariableValue {
	kind: "direct";
	ref: Identifier | MemberExpression;
}

export function variable(ref: Identifier | MemberExpression): VariableValue {
	return { kind: "direct", ref };
}


export interface BoxedValue {
	kind: "boxed";
	contents: VariableValue;
}

export function boxed(contents: Value): BoxedValue {
	if (contents.kind !== "direct") {
		throw new TypeError(`Unable to box a $(contents.kind)}`);
	}
	return { kind: "boxed", contents };
}


export interface BuiltinValue {
	kind: "builtin";
	name: string;
	type: Type;
}

export function builtin(name: string, type: Type): BuiltinValue {
	return { kind: "builtin", name, type };
}


export interface TupleValue {
	kind: "tuple";
	values: Value[];
}

export function tuple(values: Value[]): TupleValue {
	return { kind: "tuple", values };
}

export type Value = ExpressionValue | CallableValue | VariableValue | BuiltinValue | TupleValue | BoxedValue;


const baseProperty = identifier("base");
const offsetProperty = identifier("offset");

export function newPointer(base: Expression, offset: Expression): ExpressionValue {
	return expr(objectExpression([objectProperty(baseProperty, base), objectProperty(offsetProperty, offset)]), true);
}

export function unbox(value: Value, scope: Scope): VariableValue {
	if (value.kind === "expression") {
		if (value.pointer) {
			const [first, second] = reuseExpression(value.expression, scope);
			return variable(memberExpression(memberExpression(first, baseProperty), memberExpression(second, offsetProperty), true));
		} else {
			console.log(value);
			throw new Error(`Unable to unbox an expression that's not a pointer`);
		}
	} else if (value.kind === "boxed") {
		return value.contents;
	} else if (value.kind === "direct") {
		return value;
	} else {
		throw new Error(`Unable to unbox from ${value.kind} value as pointer`);
	}
}

function getArgumentPointers(type: Type): boolean[] {
	if (type.kind === "function") {
		return type.arguments.types.map((arg) => arg.kind === "modified" && arg.modifier === "inout");
	}
	throw new TypeError(expectedMessage("function", type));
}

export function functionize(scope: Scope, type: Type, expression: (scope: Scope, arg: ArgGetter) => Value): Expression {
	const inner: Scope = newScope("anonymous", scope);
	let usedCount = 0;
	const pointers = getArgumentPointers(type);
	const newValue = expression(inner, (i) => {
		if (usedCount === -1) {
			throw new Error(`Requested access to scope after it was generated!`);
		}
		if (i === "this") {
			return expr(thisExpression());
		}
		if (usedCount <= i) {
			usedCount = i + 1;
		}
		return expr(identifier("$" + i), pointers[i]);
	});
	const args: Identifier[] = [];
	for (let i = 0; i < usedCount; i++) {
		args[i] = identifier("$" + i);
	}
	const result = functionExpression(undefined, args, blockStatement(emitScope(inner, [returnStatement(read(newValue, inner))])));
	usedCount = -1;
	return result;
}

export function read(value: VariableValue, scope: Scope): Identifier | MemberExpression;
export function read(value: Value, scope: Scope): Expression;
export function read(value: Value, scope: Scope): Expression {
	switch (value.kind) {
		case "builtin":
			return insertBuiltin(value.name, scope, value.type);
		case "tuple":
			return arrayExpression(value.values.map((child) => read(child, scope)));
		case "expression":
			if (value.pointer) {
				const [first, second] = reuseExpression(value.expression, scope);
				return memberExpression(memberExpression(first, baseProperty), memberExpression(second, offsetProperty), true);
			} else {
				return value.expression;
			}
		case "callable":
			return functionize(scope, value.type, value.call);
		case "direct":
			return value.ref;
		case "boxed":
			if (value.contents.kind === "direct") {
				const ref = value.contents.ref;
				if (ref.type === "Identifier") {
					return identifier("unboxable$" + ref.name);
					// throw new Error(`Unable to box ${ref.name} as it's a simple variable (in ${fullPathOfScope(scope)})`);
				}
				return newPointer(ref.object, ref.computed ? ref.property : stringLiteral((ref.property as Identifier).name)).expression;
			// } else if (value.contents.kind === "expression") {
			// 	if (value.contents.pointer) {
			// 		return value.contents;
			// 	}
			// 	return newPointer(arrayExpression([value.contents.expression]), numericLiteral(0));
			}
			throw new Error(`Unable to box a ${value.contents.kind} value as pointer`);
	}
}

export function call(target: Value, args: Value[], scope: Scope): Value {
	const getter: ArgGetter = (i) => {
		if (i === "this") {
			return expr(undefinedLiteral);
		}
		if (i < args.length) {
			return args[i];
		}
		throw new Error(`${target.kind === "builtin" ? target.name : "Callable"} asked for argument ${i}, but only ${args.length} arguments provided!`);
	}
	switch (target.kind) {
		case "builtin":
			return builtinFunctions[target.name](scope, getter, target.type, target.name);
		case "callable":
			return target.call(scope, getter);
		default:
			return expr(callExpression(read(target, scope), args.map((value) => read(value, scope))));
	}
}

function isPure(expression: Expression): boolean {
	switch (expression.type) {
		case "Identifier":
		case "StringLiteral":
		case "BooleanLiteral":
		case "NumericLiteral":
		case "NullLiteral":
			return true;
		case "MemberExpression":
			return isPure(expression.property) && (!expression.computed || isPure(expression.property));
		case "ArrayExpression":
			for (const element of expression.elements) {
				if (element !== null) {
					if (element.type === "SpreadElement" || !isPure(element)) {
						return false;
					}
				}
			}
			return true;
		default:
			return false;
	}
}

export function reuseExpression(expression: Expression, scope: Scope): [Expression, Expression] {
	if (isPure(expression)) {
		return [expression, expression];
	} else {
		const temp = uniqueIdentifier(scope);
		return [assignmentExpression("=", temp, expression), temp];
	}
}

function expectedMessage(name: string, type: Type) {
	return `Expected a ${name}, got a ${type.kind}: ${stringifyType(type)}`;
}

function stringifyType(type: Type): string {
	switch (type.kind) {
		case "optional":
			// TODO: Handle multiple levels of optional
			return stringifyType(type.type) + "!";
		case "generic":
			return stringifyType(type.base) + "<" + type.arguments.map(stringifyType).join(", ") + ">";
		case "function":
			// TODO: Handle attributes
			return stringifyType(type.arguments) + (type.throws ? " throws" : "") + (type.rethrows ? " rethrows" : "") + " -> " + stringifyType(type.return);
		case "tuple":
			return "(" + type.types.map(stringifyType) + ")";
		case "array":
			return "[" + stringifyType(type.type) + "]";
		case "dictionary":
			return "[" + stringifyType(type.keyType) + ": " + stringifyType(type.valueType) + "]";
		case "metatype":
			return stringifyType(type.base) + "." + type.as;
		case "modified":
			return type.modifier + " " + stringifyType(type.type);
		case "namespaced":
			return stringifyType(type.namespace) + "." + stringifyType(type.type);
		case "name":
			return type.name;
	}
}
