import { arrayExpression, ArrayExpression, assignmentExpression, binaryExpression, blockStatement, booleanLiteral, BooleanLiteral, callExpression, conditionalExpression, Expression, ExpressionStatement, functionExpression, Identifier, identifier, logicalExpression, memberExpression, MemberExpression, nullLiteral, NullLiteral, numericLiteral, NumericLiteral, objectExpression, ObjectExpression, objectProperty, returnStatement, sequenceExpression, Statement, stringLiteral, StringLiteral, thisExpression, ThisExpression } from "babel-types";

import { functionize, insertFunction } from "./functions";
import { ReifiedType, reifyType } from "./reified";
import { addVariable, emitScope, fullPathOfScope, mangleName, newScope, rootScope, Scope, undefinedLiteral, uniqueIdentifier } from "./scope";
import { Function, parse as parseType, Type } from "./types";
import { concat } from "./utils";

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
	return { kind: "expression", expression: simplify(expression), pointer };
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
				return expr(sequenceExpression(concat(exceptLast.map((statement) => (statement as ExpressionStatement).expression), [last])));
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
	type: Function;
}

export function callable(call: (scope: Scope, arg: ArgGetter) => Value, type: Type): CallableValue {
	if (type.kind !== "function") {
		throw new TypeError(`Expected a function type when constructing a callable, got a ${type.kind}!`);
	}
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
	contents: VariableValue | SubscriptValue;
}

export function boxed(contents: Value): BoxedValue {
	if (contents.kind !== "direct" && contents.kind !== "subscript") {
		throw new TypeError(`Unable to box a ${contents.kind}`);
	}
	return { kind: "boxed", contents };
}


export interface FunctionValue {
	kind: "function";
	name: string;
	parentType: ReifiedType | undefined;
	type: Function;
}

export function functionValue(name: string, parentType: ReifiedType | undefined, type: Function): FunctionValue {
	return { kind: "function", name, parentType, type };
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
	getter: Value;
	setter: Value;
	args: Value[];
}

export function subscript(getter: Value, setter: Value, args: Value[]): SubscriptValue {
	return { kind: "subscript", getter, setter, args };
}


export interface CopiedValue {
	kind: "copied";
	value: Value;
	type: Type;
}

export function copy(value: Value, type: Type): CopiedValue {
	return {
		kind: "copied",
		value,
		type,
	};
}


export type Value = ExpressionValue | CallableValue | VariableValue | FunctionValue | TupleValue | BoxedValue | StatementsValue | SubscriptValue | CopiedValue;



const baseProperty = identifier("base");
const offsetProperty = identifier("offset");

export function newPointer(base: Expression, offset: Expression): Value {
	return expr(objectExpression([objectProperty(baseProperty, base), objectProperty(offsetProperty, offset)]), true);
}

export function unbox(value: Value, scope: Scope): VariableValue | SubscriptValue {
	if (value.kind === "boxed") {
		return value.contents;
	} else if (value.kind === "direct") {
		return value;
	} else if (value.kind === "subscript") {
		return value;
	} else {
		throw new Error(`Unable to unbox from ${value.kind} value as pointer`);
	}
}

export function set(dest: Value, source: Value, scope: Scope, operator: "=" | "+=" | "-=" | "*=" | "/=" | "|=" | "&=" = "="): Value {
	switch (dest.kind) {
		case "boxed":
			return set(dest.contents, source, scope, operator);
		case "direct":
			if (dest.ref.type === "ThisExpression") {
				throw new Error("Cannot assign to a this expression!");
			}
			return expr(assignmentExpression(operator, dest.ref, read(source, scope)));
		case "subscript":
			const value = operator === "=" ? source : expr(binaryExpression(operator.substr(0, operator.length - 1) as any, read(dest, scope), read(source, scope)));
			return call(dest.setter, undefinedValue, concat(dest.args, [source]), scope, "set");
		default:
			throw new TypeError(`Unable to set a ${dest.kind} value!`);
	}
}


export function read(value: VariableValue, scope: Scope): Identifier | MemberExpression;
export function read(value: Value, scope: Scope): Expression;
export function read(value: Value, scope: Scope): Expression {
	switch (value.kind) {
		case "copied":
			const reified = reifyType(value.type, scope);
			if (reified.copy) {
				return read(reified.copy(value.value, scope), scope);
			}
			return read(value.value, scope);
		case "function":
			const functions = typeof value.parentType !== "undefined" ? value.parentType.functions : scope.functions;
			return insertFunction(value.name, scope, value.type, scope.functions[value.name]);
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
			return read(call(value.getter, undefinedValue, value.args, scope, "get"), scope);
		case "boxed":
			return read(value.contents, scope);
		default:
			throw new TypeError(`Received an unexpected value of type ${(value as Value).kind}`);
	}
}

export const undefinedValue = expr(undefinedLiteral);

export function call(target: Value, thisArgument: Value, args: ReadonlyArray<Value>, scope: Scope, type: "call" | "get" | "set" = "call"): Value {
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
			const functions = typeof target.parentType !== "undefined" ? target.parentType.functions : scope.functions;
			if (Object.hasOwnProperty.call(functions, target.name)) {
				const fn = functions[target.name];
				switch (type) {
					case "call":
						if (typeof fn !== "function") {
							throw new Error(`Expected a callable function!`);
						}
						return fn(scope, getter, target.type, target.name);
					default:
						if (typeof fn === "function") {
							throw new Error(`Expected a ${type}ter!`);
						}
						return fn[type](scope, getter, target.type, target.name);
				}
			} else {
				if (type !== "call") {
					throw new Error(`Unable to call a ${type}ter on a function!`);
				}
				return call(expr(insertFunction(target.name, scope, target.type, functions[target.name])), thisArgument, args, scope);
			}
		case "callable":
			if (type !== "call") {
				throw new Error(`Unable to call a ${type}ter on a function!`);
			}
			return target.call(scope, getter);
		default:
			break;
	}
	if (type !== "call") {
		throw new Error(`Unable to call a ${type}ter on a function!`);
	}
	if (thisArgument.kind === "expression" && thisArgument.expression === undefinedLiteral) {
		return expr(callExpression(memberExpression(read(target, scope), identifier("call")), concat([thisArgument as Value], args).map((value) => read(value, scope))));
	} else {
		return expr(callExpression(read(target, scope), args.map((value) => read(value, scope))));
	}
}

export function isPure(expression: Expression): boolean {
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

export function simplify(expression: Expression): Expression {
	const value = valueOfExpression(expression);
	if (typeof value !== "undefined") {
		return literal(value);
	}
	switch (expression.type) {
		case "ConditionalExpression":
			const testValue = valueOfExpression(expression.test);
			if (typeof testValue !== "undefined") {
				return simplify(testValue ? expression.consequent : expression.alternate);
			}
			return conditionalExpression(simplify(expression.test), simplify(expression.consequent), simplify(expression.alternate));
		case "LogicalExpression":
			return logicalExpression(expression.operator, simplify(expression.left), simplify(expression.right));
		case "BinaryExpression":
			return binaryExpression(expression.operator, simplify(expression.left), simplify(expression.right));
		case "MemberExpression":
			if (!expression.computed && expression.property.type === "Identifier") {
				const objectValue = valueOfExpression(expression.object);
				if (typeof objectValue !== "undefined" && objectValue !== null && Object.hasOwnProperty.call(objectValue, expression.property.name)) {
					const propertyValue = (objectValue as any)[expression.property.name];
					if (typeof propertyValue === "boolean" || typeof propertyValue === "number" || typeof propertyValue === "string" || typeof propertyValue === "object") {
						return literal(propertyValue);
					}
				}
			}
		default:
			break;
	}
	return expression;
}

export function valueOfExpression(expression: Expression): undefined | boolean | number | string | null {
	switch (expression.type) {
		case "BooleanLiteral":
		case "NumericLiteral":
		case "StringLiteral":
			return expression.value;
		case "NullLiteral":
			return null;
		case "UnaryExpression": {
			const value = valueOfExpression(expression.argument);
			if (typeof value !== "undefined") {
				switch (expression.operator) {
					case "!":
						return !value;
					case "-":
						return -(value as number);
					case "+":
						return -(value as number);
					case "~":
						return ~(value as number);
					case "typeof":
						return typeof value;
					case "void":
						return undefined;
					default:
						break;
				}
			}
			break;
		}
		case "LogicalExpression":
		case "BinaryExpression": {
			const left = valueOfExpression(expression.left);
			if (typeof left !== "undefined") {
				const right = valueOfExpression(expression.right);
				if (typeof right !== "undefined") {
					switch (expression.operator) {
						case "&&":
							return left && right;
						case "||":
							return left || right;
						case "+":
							return (left as number) + (right as number);
						case "-":
							return (left as number) - (right as number);
						case "*":
							return (left as number) * (right as number);
						case "/":
							return (left as number) / (right as number);
						case "%":
							return (left as number) % (right as number);
						case "**":
							return (left as number) ** (right as number);
						case "&":
							return (left as number) & (right as number);
						case "|":
							return (left as number) | (right as number);
						case ">>":
							return (left as number) >> (right as number);
						case ">>>":
							return (left as number) >>> (right as number);
						case "<<":
							return (left as number) << (right as number);
						case "^":
							return (left as number) ^ (right as number);
						case "==":
							// tslint:disable-next-line:triple-equals
							return left == right;
						case "===":
							return left === right;
						case "!=":
							// tslint:disable-next-line:triple-equals
							return left != right;
						case "!==":
							return left !== right;
						case "<":
							return (left as number) < (right as number);
						case "<=":
							return (left as number) <= (right as number);
						case "<":
							return (left as number) > (right as number);
						case ">=":
							return (left as number) >= (right as number);
						default:
							break;
					}
				}
			}
			break;
		}
		case "ConditionalExpression": {
			const test = valueOfExpression(expression.test);
			if (typeof test !== "undefined") {
				return valueOfExpression(test ? expression.consequent : expression.alternate);
			}
			break;
		}
		case "SequenceExpression": {
			for (const ignoredExpression of expression.expressions.slice(expression.expressions.length - 1)) {
				if (typeof valueOfExpression(ignoredExpression) === "undefined") {
					return undefined;
				}
			}
			return valueOfExpression(expression.expressions[expression.expressions.length - 1]);
		}
		default:
			break;
	}
	return undefined;
}

interface LiteralMap {
	readonly [name: string]: LiteralValue;
}
interface LiteralArray extends ReadonlyArray<LiteralValue> {
}
type LiteralValue = boolean | number | string | null | LiteralArray | LiteralMap;

export function literal(value: boolean): BooleanLiteral;
export function literal(value: number): NumericLiteral;
export function literal(value: string): StringLiteral;
export function literal(value: null): NullLiteral;
export function literal(value: ReadonlyArray<LiteralValue>): ArrayExpression;
export function literal(value: LiteralMap): ObjectExpression;
export function literal(value: LiteralValue): BooleanLiteral | NumericLiteral | StringLiteral | NullLiteral | ArrayExpression | ObjectExpression;
export function literal(value: LiteralValue): BooleanLiteral | NumericLiteral | StringLiteral | NullLiteral | ArrayExpression | ObjectExpression {
	if (typeof value === "boolean") {
		return booleanLiteral(value);
	} else if (typeof value === "number") {
		return numericLiteral(value);
	} else if (typeof value === "string") {
		return stringLiteral(value);
	} else if (value === null) {
		return nullLiteral();
	} else if (Array.isArray(value)) {
		return arrayExpression(value.map(literal));
	} else if (typeof value === "object") {
		return objectExpression(Object.keys(value).map((key) => objectProperty(identifier(key), literal((value as LiteralMap)[key]))));
	} else {
		throw new TypeError(`Expected to receive a valid literal type, instead got ${typeof value}`);
	}
}

export function reuseExpression(expression: Expression, scope: Scope): [Expression, Expression] {
	const simplified = simplify(expression);
	if (isPure(simplified)) {
		return [simplified, simplified];
	} else {
		const temp = uniqueIdentifier(scope);
		addVariable(scope, temp);
		return [assignmentExpression("=", temp, simplified), temp];
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
			return "(" + type.types.map(stringifyType).join(", ") + ")";
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

export function isNestedOptional(type: Type): boolean {
	if (type.kind !== "optional") {
		throw new Error(`Expected an optional, instead got a ${type.kind}!`);
	}
	return type.type.kind === "optional";
}
