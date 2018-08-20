import { arrayExpression, assignmentExpression, blockStatement, callExpression, Expression, ExpressionStatement, functionExpression, Identifier, identifier, memberExpression, MemberExpression, nullLiteral, NullLiteral, numericLiteral, objectExpression, objectProperty, returnStatement, sequenceExpression, Statement, stringLiteral, thisExpression, ThisExpression } from "babel-types";

import { functionize, insertFunction } from "./functions";
import { addVariable, emitScope, fullPathOfScope, mangleName, newScope, rootScope, Scope, undefinedLiteral, uniqueIdentifier } from "./scope";
import { parse as parseType, Type } from "./types";

export type ArgGetter = (index: number | "this", desiredName?: string) => Value;

export interface ExpressionValue {
	kind: "expression";
	expression: Expression;
	pointer?: boolean;
}

export function expr(expression: Identifier | ThisExpression, pointer?: boolean): VariableValue;
export function expr(expression: Expression, pointer?: boolean): ExpressionValue | VariableValue;
export function expr(expression: Expression, pointer: boolean = false): ExpressionValue | ReturnType<typeof variable> {
	if (expression.type === "Identifier" || expression.type === "ThisExpression" || (expression.type === "MemberExpression" && isPure(expression.object) && (!expression.computed || isPure(expression.property)))) {
		return variable(expression);
	}
	return { kind: "expression", expression, pointer };
}


export interface StatementsValue {
	kind: "statements";
	statements: Statement[];
}

export function statements(statements: Statement[]): StatementsValue | ReturnType<typeof expr> {
	if (statements.length >= 1) {
		const lastStatement = statements[statements.length - 1];
		if (lastStatement.type === "ReturnStatement") {
			const last = lastStatement.argument === null ? undefinedLiteral : lastStatement.argument;
			if (statements.length === 1) {
				return expr(last);
			}
			const exceptLast = statements.slice(0, statements.length - 1);
			if (exceptLast.every((statement) => statement.type === "ExpressionStatement")) {
				return expr(sequenceExpression(exceptLast.map((statement) => (statement as ExpressionStatement).expression).concat(last)));
			}
		}
	}
	return {
		kind: "statements",
		statements,
	};
}

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
	ref: Identifier | MemberExpression | ThisExpression;
}

export function variable(ref: Identifier | MemberExpression | ThisExpression): VariableValue {
	return { kind: "direct", ref };
}


export interface BoxedValue {
	kind: "boxed";
	contents: VariableValue;
}

export function boxed(contents: Value): BoxedValue {
	if (contents.kind !== "direct") {
		throw new TypeError(`Unable to box a ${contents.kind}`);
	}
	return { kind: "boxed", contents };
}


export interface FunctionValue {
	kind: "function";
	name: string;
	type: Type;
}

export function functionValue(name: string, type: Type): FunctionValue {
	return { kind: "function", name, type };
}


export interface TupleValue {
	kind: "tuple";
	values: Value[];
}

export function tuple(values: Value[]): TupleValue {
	return { kind: "tuple", values };
}


export interface SubscriptValue {
	kind: "subscript";
	function: Value;
	args: Value[];
}

export function subscript(fn: Value, args: Value[]): SubscriptValue {
	return { kind: "subscript", function: fn, args };
}


export type Value = ExpressionValue | CallableValue | VariableValue | FunctionValue | TupleValue | BoxedValue | StatementsValue | SubscriptValue;


export type StructField = {
	name: string;
	type: Type;
} & ({ stored: true } | { stored: false; getter: (target: Value, scope: Scope) => Value; });

export function structField(name: string, type: Type | string, getter?: (target: Value, scope: Scope) => Value): StructField {
	const resolvedType = typeof type === "string" ? parseType(type) : type;
	if (getter) {
		return {
			name,
			type: resolvedType,
			stored: false,
			getter,
		};
	}
	return {
		name,
		type: resolvedType,
		stored: true,
	};
}


const baseProperty = identifier("base");
const offsetProperty = identifier("offset");

export function newPointer(base: Expression, offset: Expression): Value {
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


export function read(value: VariableValue, scope: Scope): Identifier | MemberExpression;
export function read(value: Value, scope: Scope): Expression;
export function read(value: Value, scope: Scope): Expression {
	switch (value.kind) {
		case "function":
			return insertFunction(value.name, scope, value.type);
		case "tuple":
			switch (value.values.length) {
				case 0:
					return undefinedLiteral;
				case 1:
					return read(value.values[0], scope);
				default:
					return arrayExpression(value.values.map((child) => read(child, scope)));
			}
		case "expression":
			if (value.pointer) {
				const [first, second] = reuseExpression(value.expression, scope);
				return memberExpression(memberExpression(first, baseProperty), memberExpression(second, offsetProperty), true);
			} else {
				return value.expression;
			}
		case "callable":
			const [args, statements] = functionize(scope, value.type, value.call);
			return functionExpression(undefined, args, blockStatement(statements));
		case "direct":
			return value.ref;
		case "statements":
			return callExpression(functionExpression(undefined, [], blockStatement(value.statements)), []);
		case "subscript":
			return read(call(value.function, undefinedValue, value.args, scope), scope);
		case "boxed":
			if (value.contents.kind === "direct") {
				return read(value.contents, scope);
				// const ref = value.contents.ref;
				// switch (ref.type) {
				// 	case "Identifier":
				// 		return identifier("unboxable$" + ref.name);
				// 	case "ThisExpression":
				// 		return identifier("unboxable$this");
				// 	case "MemberExpression":
				// 		return read(newPointer(ref.object, ref.computed ? ref.property : stringLiteral((ref.property as Identifier).name)), scope);
				// 	default:
				// 		break;
				// }
			// } else if (value.contents.kind === "expression") {
			// 	if (value.contents.pointer) {
			// 		return value.contents;
			// 	}
			// 	return newPointer(arrayExpression([value.contents.expression]), numericLiteral(0));
			}
			throw new TypeError(`Unable to box a ${value.contents.kind} value as pointer`);
		default:
			throw new TypeError(`Received an unexpected value of type ${(value as Value).kind}`);
	}
}

export const undefinedValue = expr(undefinedLiteral);

export function call(target: Value, thisArgument: Value, args: Value[], scope: Scope): Value {
	const getter: ArgGetter = (i) => {
		if (i === "this") {
			return thisArgument;
		}
		if (i < args.length) {
			return args[i];
		}
		throw new Error(`${target.kind === "function" ? target.name : "Callable"} asked for argument ${i + 1}, but only ${args.length} arguments provided!`);
	};
	switch (target.kind) {
		case "function":
			if (Object.hasOwnProperty.call(scope.functions, target.name)) {
				const fn = scope.functions[target.name];
				return (typeof fn === "function" ? fn : fn.get)(scope, getter, target.type, target.name);
			} else {
				return call(expr(insertFunction(target.name, scope, target.type)), thisArgument, args, scope);
			}
		case "callable":
			return target.call(scope, getter);
		default:
			break;
	}
	if (thisArgument.kind === "expression" && thisArgument.expression === undefinedLiteral) {
		return expr(callExpression(memberExpression(read(target, scope), identifier("call")), [thisArgument as Value].concat(args).map((value) => read(value, scope))));
	} else {
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
		case "ThisExpression":
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
		addVariable(scope, temp);
		return [assignmentExpression("=", temp, expression), temp];
	}
}

export function hoistToIdentifier(expression: Expression, scope: Scope, name: string = "temp"): Identifier | ThisExpression {
	if (expression.type === "Identifier" || expression.type === "ThisExpression") {
		return expression;
	}
	const result = uniqueIdentifier(scope, name);
	addVariable(scope, result, expression);
	return result;
}

export function stringifyType(type: Type): string {
	switch (type.kind) {
		case "optional":
			return stringifyType(type.type) + "?";
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
		default:
			throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
	}
}
