import { arrayExpression, ArrayExpression, assignmentExpression, binaryExpression, blockStatement, booleanLiteral, BooleanLiteral, callExpression, conditionalExpression, Expression, ExpressionStatement, functionExpression, Identifier, identifier, logicalExpression, memberExpression, MemberExpression, Node, nullLiteral, NullLiteral, numericLiteral, NumericLiteral, objectExpression, ObjectExpression, objectProperty, returnStatement, sequenceExpression, Statement, stringLiteral, StringLiteral, thisExpression, ThisExpression } from "babel-types";

import { Term } from "./ast";
import { functionize, insertFunction } from "./functions";
import { ReifiedType, reifyType } from "./reified";
import { addVariable, emitScope, fullPathOfScope, mangleName, newScope, rootScope, Scope, undefinedLiteral, uniqueIdentifier } from "./scope";
import { Function, parse as parseType, Type } from "./types";
import { concat } from "./utils";
import { expectLength } from "./utils";

export type ArgGetter = (index: number | "this", desiredName?: string) => Value;


export interface Position {
	line: number;
	column: number;
}

export interface Location {
	start: Position;
	end: Position;
}

const locationRangeRegex = /^(.*):(\d+):(\d+)$/;

function parseLineAndColumn(position: string): Position {
	const matched = position.match(locationRangeRegex);
	if (matched === null) {
		throw new Error(`Source range does not match expected format: ${position}`);
	}
	expectLength(matched as ReadonlyArray<string>, 4);
	return {
		line: parseInt(matched[2], 10),
		column: parseInt(matched[3], 10),
	};
}

export function locationForTerm(term: Term): Location | undefined {
	if (Object.hasOwnProperty.call(term.properties, "range")) {
		const range = term.properties.range;
		if (typeof range === "object" && !Array.isArray(range) && Object.hasOwnProperty.call(range, "from") && Object.hasOwnProperty.call(range, "to")) {
			return {
				start: parseLineAndColumn(range.from),
				end: parseLineAndColumn(range.to),
			};
		}
	}
	return undefined;
}

function readLocation(locationOrTerm?: Term | Location): Location | undefined {
	return typeof locationOrTerm === "undefined" || !Object.hasOwnProperty.call(locationOrTerm, "properties") ? locationOrTerm as any as Location : locationForTerm(locationOrTerm as any as Term);
}


export interface ExpressionValue {
	kind: "expression";
	expression: Expression;
	location?: Location;
}

export function expr(expression: Identifier | ThisExpression, location?: Term | Location): VariableValue;
export function expr(expression: Expression, location?: Term | Location): ExpressionValue | VariableValue;
export function expr(expression: Expression, location?: Term | Location): ExpressionValue | ReturnType<typeof variable> {
	if (expression.type === "Identifier" || expression.type === "ThisExpression" || (expression.type === "MemberExpression" && isPure(expression.object) && (!expression.computed || isPure(expression.property)))) {
		return variable(expression, location);
	}
	return { kind: "expression", expression: simplify(expression), location: readLocation(location) };
}


export interface StatementsValue {
	kind: "statements";
	statements: Statement[];
	location?: Location;
}

export function statements(statements: Statement[], location?: Term | Location): StatementsValue | ReturnType<typeof expr> {
	if (statements.length >= 1) {
		const lastStatement = statements[statements.length - 1];
		if (lastStatement.type === "ReturnStatement") {
			const last = lastStatement.argument === null ? undefinedLiteral : lastStatement.argument;
			if (statements.length === 1) {
				return expr(last, lastStatement.loc || location);
			}
			const exceptLast = statements.slice(0, statements.length - 1);
			if (exceptLast.every((statement) => statement.type === "ExpressionStatement")) {
				return expr(sequenceExpression(concat(exceptLast.map((statement) => (statement as ExpressionStatement).expression), [last])), lastStatement.loc || location);
			}
		}
	}
	return {
		kind: "statements",
		statements,
		location: readLocation(location),
	};
}

export interface CallableValue {
	kind: "callable";
	call: (scope: Scope, arg: ArgGetter) => Value;
	type: Function;
	location?: Location;
}

export function callable(call: (scope: Scope, arg: ArgGetter) => Value, type: Type, location?: Term | Location): CallableValue {
	if (type.kind !== "function") {
		throw new TypeError(`Expected a function type when constructing a callable, got a ${type.kind}!`);
	}
	return { kind: "callable", call, type, location: readLocation(location) };
}


export interface VariableValue {
	kind: "direct";
	ref: Identifier | MemberExpression | ThisExpression;
	location?: Location;
}

export function variable(ref: Identifier | MemberExpression | ThisExpression, location?: Term | Location): VariableValue {
	return { kind: "direct", ref, location: readLocation(location) };
}


export interface BoxedValue {
	kind: "boxed";
	contents: VariableValue | SubscriptValue;
	location?: Location;
}

export function boxed(contents: Value, location?: Term | Location): BoxedValue {
	if (contents.kind !== "direct" && contents.kind !== "subscript") {
		throw new TypeError(`Unable to box a ${contents.kind}`);
	}
	return { kind: "boxed", contents, location: readLocation(location) };
}


export interface FunctionValue {
	kind: "function";
	name: string;
	parentType: ReifiedType | undefined;
	type: Function;
	location?: Location;
}

export function functionValue(name: string, parentType: ReifiedType | undefined, type: Function, location?: Term | Location): FunctionValue {
	return { kind: "function", name, parentType, type, location: readLocation(location) };
}


export interface TupleValue {
	kind: "tuple";
	values: Value[];
	location?: Location;
}

export function tuple(values: Value[], location?: Term | Location): TupleValue {
	return { kind: "tuple", values, location: readLocation(location) };
}


export interface SubscriptValue {
	kind: "subscript";
	getter: Value;
	setter: Value;
	args: Value[];
	location?: Location;
}

export function subscript(getter: Value, setter: Value, args: Value[], location?: Term | Location): SubscriptValue {
	return { kind: "subscript", getter, setter, args, location: readLocation(location) };
}


export interface CopiedValue {
	kind: "copied";
	value: Value;
	type: Type;
	location?: Location;
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

export function unbox(value: Value, scope: Scope): VariableValue | SubscriptValue {
	if (value.kind === "boxed") {
		return annotateValue(value.contents, value.location);
	} else if (value.kind === "direct") {
		return value;
	} else if (value.kind === "subscript") {
		return value;
	} else {
		throw new Error(`Unable to unbox from ${value.kind} value as pointer`);
	}
}

export function set(dest: Value, source: Value, scope: Scope, operator: "=" | "+=" | "-=" | "*=" | "/=" | "|=" | "&=" = "=", location?: Term | Location): Value {
	switch (dest.kind) {
		case "boxed":
			return set(dest.contents, source, scope, operator, location);
		case "direct":
			if (dest.ref.type === "ThisExpression") {
				throw new Error("Cannot assign to a this expression!");
			}
			return expr(assignmentExpression(operator, dest.ref, read(source, scope)), location);
		case "subscript":
			let setterArgs: Value[] = dest.args;
			if (operator !== "=") {
				// Call the getter, apply the operation, then apply the setter
				let reused = dest.args.map((value) => reuseExpression(read(value, scope), scope));
				const valueFetched = call(dest.getter, undefinedValue, reused.map(([_, after]) => expr(after)), scope, location, "get");
				source = expr(binaryExpression(operator.substr(0, operator.length - 1) as any, read(valueFetched, scope), read(source, scope)));
				setterArgs = reused.map(([first]) => expr(first));
			}
			return call(dest.setter, undefinedValue, concat(setterArgs, [source]), scope, location, "set");
		default:
			throw new TypeError(`Unable to set a ${dest.kind} value!`);
	}
}

export function update(dest: Value, scope: Scope, updater: (value: Value) => Value, location?: Term | Location): Value {
	switch (dest.kind) {
		case "boxed":
			return update(dest.contents, scope, updater);
		case "direct":
			switch (dest.ref.type) {
				case "ThisExpression":
					throw new Error("Cannot update a this expression!");
				case "MemberExpression":
					if (dest.ref.object.type !== "Identifier" || (dest.ref.computed && typeof valueOfExpression(dest.ref.property) === "undefined")) {
						const [firstObject, afterObject] = reuseExpression(dest.ref.object, scope);
						const [firstProperty, afterProperty] = reuseExpression(dest.ref.object, scope);
						const first = annotate(memberExpression(firstObject, firstProperty, dest.ref.computed), dest.ref.loc);
						const after = annotate(memberExpression(afterObject, afterProperty, dest.ref.computed), dest.ref.loc);
						return expr(assignmentExpression("=", first, read(updater(expr(after)), scope)), location);
					}
				case "Identifier":
				default:
					return expr(assignmentExpression("=", dest.ref, read(updater(dest), scope)), location);
			}
			break;
		case "subscript":
			// Call the getter, apply the operation, then apply the setter
			let reused = dest.args.map((value) => reuseExpression(read(value, scope), scope));
			const valueFetched = call(dest.getter, undefinedValue, reused.map(([_, after]) => expr(after)), scope, location, "get");
			const result = updater(valueFetched);
			return call(dest.setter, undefinedValue, concat(reused.map(([first]) => expr(first)), [result]), scope, location, "set");
		default:
			break;
	}
	throw new TypeError(`Unable to set a ${dest.kind} value!`);
}


export function annotate<T extends Node>(node: T, location?: Location | Term): T {
	if (typeof location !== "undefined" && !Object.hasOwnProperty.call(node, "loc")) {
		return Object.assign(Object.create(Object.getPrototypeOf(node)), {
			loc: readLocation(location),
		}, node);
	}
	return node;
}

export function annotateValue<T extends Value>(value: T, location?: Location | Term): T {
	if (typeof location !== "undefined" && !Object.hasOwnProperty.call(value, "location")) {
		return Object.assign(Object.create(Object.getPrototypeOf(value)), {
			location: readLocation(location),
		}, value);
	}
	return value;
}

export function read(value: VariableValue, scope: Scope): Identifier | MemberExpression;
export function read(value: Value, scope: Scope): Expression;
export function read(value: Value, scope: Scope): Expression {
	switch (value.kind) {
		case "copied":
			const reified = reifyType(value.type, scope);
			if (reified.copy) {
				return annotate(read(reified.copy(value.value, scope), scope), value.location);
			}
			return annotate(read(value.value, scope), value.location);
		case "function":
			const functions = typeof value.parentType !== "undefined" ? value.parentType.functions : scope.functions;
			return annotate(insertFunction(value.name, scope, value.type, scope.functions[value.name]), value.location);
		case "tuple":
			switch (value.values.length) {
				case 0:
					return annotate(undefinedLiteral, value.location);
				case 1:
					return annotate(read(value.values[0], scope), value.location);
				default:
					return annotate(arrayExpression(value.values.map((child) => read(child, scope))), value.location);
			}
		case "expression":
			return annotate(value.expression, value.location);
		case "callable":
			const [args, statements] = functionize(scope, value.type, value.call, value.location);
			return annotate(functionExpression(undefined, args, annotate(blockStatement(statements), value.location)), value.location);
		case "direct":
			return annotate(value.ref, value.location);
		case "statements":
			return annotate(callExpression(annotate(functionExpression(undefined, [], annotate(blockStatement(value.statements), value.location)), value.location), []), value.location);
		case "subscript":
			return annotate(read(call(value.getter, undefinedValue, value.args, scope, value.location, "get"), scope), value.location);
		case "boxed":
			return annotate(read(value.contents, scope), value.location);
		default:
			throw new TypeError(`Received an unexpected value of type ${(value as Value).kind}`);
	}
}

export const undefinedValue = expr(undefinedLiteral);

export function call(target: Value, thisArgument: Value, args: ReadonlyArray<Value>, scope: Scope, location?: Term | Location, type: "call" | "get" | "set" = "call"): Value {
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
						return annotateValue(fn(scope, getter, target.type, target.name), location);
					default:
						if (typeof fn === "function") {
							throw new Error(`Expected a ${type}ter!`);
						}
						return annotateValue(fn[type](scope, getter, target.type, target.name), location);
				}
			} else {
				if (type !== "call") {
					throw new Error(`Unable to call a ${type}ter on a function!`);
				}
				return call(expr(insertFunction(target.name, scope, target.type, functions[target.name]), location), thisArgument, args, scope, location);
			}
		case "callable":
			if (type !== "call") {
				throw new Error(`Unable to call a ${type}ter on a function!`);
			}
			return annotateValue(target.call(scope, getter), location);
		default:
			break;
	}
	if (type !== "call") {
		throw new Error(`Unable to call a ${type}ter on a function!`);
	}
	if (thisArgument.kind === "expression" && thisArgument.expression === undefinedLiteral) {
		return expr(callExpression(memberExpression(read(target, scope), identifier("call")), concat([thisArgument as Value], args).map((value) => read(value, scope))), location);
	} else {
		return expr(callExpression(read(target, scope), args.map((value) => read(value, scope))), location);
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
		return annotate(literal(value), expression.loc);
	}
	switch (expression.type) {
		case "ConditionalExpression":
			const testValue = valueOfExpression(expression.test);
			if (typeof testValue !== "undefined") {
				return annotate(simplify(testValue ? expression.consequent : expression.alternate), expression.loc);
			}
			return annotate(conditionalExpression(simplify(expression.test), simplify(expression.consequent), simplify(expression.alternate)), expression.loc);
		case "LogicalExpression":
			const left = simplify(expression.left);
			const leftValue = valueOfExpression(left);
			const right = simplify(expression.right);
			const rightValue = valueOfExpression(right);
			if (expression.operator === "&&") {
				if (typeof leftValue !== "undefined") {
					return annotate(leftValue ? right : left, expression.loc);
				}
				if (rightValue === true && left.type === "BinaryExpression") {
					switch (left.operator) {
						case "==":
						case "!=":
						case "===":
						case "!==":
						case "<":
						case "<=":
						case ">":
						case ">=":
							return annotate(left, expression.loc);
							break;
						default:
							break;
					}
				}
			} else if (expression.operator === "||") {
				if (typeof leftValue !== "undefined") {
					return annotate(leftValue ? left : right, expression.loc);
				}
			}
			return annotate(logicalExpression(expression.operator, left, right), expression.loc);
		case "BinaryExpression": {
			return annotate(binaryExpression(expression.operator, expression.left, expression.right), expression.loc);
		}
		case "MemberExpression":
			if (!expression.computed && expression.property.type === "Identifier") {
				const objectValue = valueOfExpression(expression.object);
				if (typeof objectValue !== "undefined" && objectValue !== null && Object.hasOwnProperty.call(objectValue, expression.property.name)) {
					const propertyValue = (objectValue as any)[expression.property.name];
					if (typeof propertyValue === "boolean" || typeof propertyValue === "number" || typeof propertyValue === "string" || typeof propertyValue === "object") {
						return annotate(literal(propertyValue), expression.loc);
					}
				} else {
					return annotate(memberExpression(simplify(expression.object), expression.property), expression.loc);
				}
			} else if (expression.computed) {
				return annotate(memberExpression(simplify(expression.object), simplify(expression.property), true), expression.loc);
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
	const simplified = annotate(simplify(expression), expression.loc);
	if (isPure(simplified)) {
		return [simplified, simplified];
	} else if (expression.type === "AssignmentExpression" && expression.operator === "=" && expression.left.type === "Identifier") {
		return [expression, expression.left];
	} else {
		const temp = annotate(uniqueIdentifier(scope), expression.loc);
		addVariable(scope, temp);
		return [annotate(assignmentExpression("=", temp, simplified), expression.loc), temp];
	}
}

export function hoistToIdentifier(expression: Expression, scope: Scope, name: string = "temp"): Identifier | ThisExpression {
	if (expression.type === "Identifier" || expression.type === "ThisExpression") {
		return expression;
	}
	const result = annotate(uniqueIdentifier(scope, name), expression.loc);
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
