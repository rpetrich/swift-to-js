import { transformFromAst } from "babel-core";
import { arrayExpression, ArrayExpression, assignmentExpression, binaryExpression, blockStatement, booleanLiteral, BooleanLiteral, callExpression, conditionalExpression, Expression, expressionStatement, ExpressionStatement, functionExpression, Identifier, identifier, isLiteral, logicalExpression, memberExpression, MemberExpression, Node, nullLiteral, NullLiteral, numericLiteral, NumericLiteral, objectExpression, ObjectExpression, objectMethod, objectProperty, returnStatement, sequenceExpression, Statement, stringLiteral, StringLiteral, thisExpression, ThisExpression, unaryExpression, variableDeclaration, variableDeclarator } from "babel-types";

import { Term } from "./ast";
import { FunctionBuilder, functionize, GetterSetterBuilder, insertFunction } from "./functions";
import { parseFunctionType, parseType } from "./parse";
import { FunctionMap, PossibleRepresentation, ReifiedType, reifyType } from "./reified";
import { addDeclaration, addVariable, DeclarationFlags, emitScope, fullPathOfScope, lookup, mangleName, newScope, rootScope, Scope, uniqueName } from "./scope";
import { Function, Type } from "./types";
import { concat, expectLength, lookupForMap } from "./utils";

export type ArgGetter = (index: number, desiredName?: string) => Value;


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

type LocationSource = Location | Term;

function readLocation(source?: LocationSource): Location | undefined {
	return typeof source === "undefined" || !Object.hasOwnProperty.call(source, "properties") ? source as any as Location : locationForTerm(source as any as Term);
}


export interface ExpressionValue {
	kind: "expression";
	expression: Expression;
	location?: Location;
}

export function expr(expression: Identifier | ThisExpression, location?: LocationSource): VariableValue;
export function expr(expression: Expression, location?: LocationSource): ExpressionValue | VariableValue;
export function expr(expression: Expression, location?: LocationSource): ExpressionValue | ReturnType<typeof variable> {
	if (expression.type === "Identifier" || expression.type === "ThisExpression" || (expression.type === "MemberExpression" && isPure(expression.object) && (!expression.computed || isPure(expression.property)))) {
		return variable(expression, location);
	}
	return { kind: "expression", expression: simplifyExpression(expression), location: readLocation(location) };
}


export interface StatementsValue {
	kind: "statements";
	statements: Statement[];
	location?: Location;
}

export function statements(body: Statement[], location?: LocationSource): StatementsValue | ReturnType<typeof expr> {
	if (body.length >= 1) {
		const lastStatement = body[body.length - 1];
		if (lastStatement.type === "ReturnStatement") {
			const last = lastStatement.argument === null ? undefinedLiteral : lastStatement.argument;
			if (body.length === 1) {
				return expr(last, lastStatement.loc || location);
			}
			const exceptLast = body.slice(0, body.length - 1);
			if (exceptLast.every((statement) => statement.type === "ExpressionStatement")) {
				return expr(sequenceExpression(concat(exceptLast.map((statement) => (statement as ExpressionStatement).expression), [last])), lastStatement.loc || location);
			}
		}
	}
	return {
		kind: "statements",
		statements: body,
		location: readLocation(location),
	};
}

export interface CallableValue {
	kind: "callable";
	call: (scope: Scope, arg: ArgGetter) => Value;
	type: Function;
	location?: Location;
}

export function callable(callback: (scope: Scope, arg: ArgGetter) => Value, type: Type, location?: LocationSource): CallableValue {
	if (type.kind !== "function") {
		throw new TypeError(`Expected a function type when constructing a callable, got a ${type.kind}!`);
	}
	return { kind: "callable", call: callback, type, location: readLocation(location) };
}


export interface VariableValue {
	kind: "direct";
	expression: Identifier | MemberExpression | ThisExpression;
	location?: Location;
}

export function variable(expression: Identifier | MemberExpression | ThisExpression, location?: LocationSource): VariableValue {
	return { kind: "direct", expression, location: readLocation(location) };
}


export interface BoxedValue {
	kind: "boxed";
	contents: VariableValue | SubscriptValue;
	type: Value;
	location?: Location;
}

export function boxed(contents: Value, type: Value, location?: LocationSource): BoxedValue {
	if (contents.kind !== "direct" && contents.kind !== "subscript") {
		throw new TypeError(`Unable to box a ${contents.kind}`);
	}
	return { kind: "boxed", contents, type, location: readLocation(location) };
}


export interface FunctionValue {
	kind: "function";
	name: string;
	parentType: Value | undefined;
	type: Function;
	substitutions: Value[];
	location?: Location;
}

export function functionValue(name: string, parentType: Value | undefined, type: Function, substitutions: Value[] = [], location?: LocationSource): FunctionValue {
	return { kind: "function", name, parentType, type, substitutions, location: readLocation(location) };
}


export interface TupleValue {
	kind: "tuple";
	values: Value[];
	location?: Location;
}

export function tuple(values: Value[], location?: LocationSource): TupleValue {
	return { kind: "tuple", values, location: readLocation(location) };
}


export interface SubscriptValue {
	kind: "subscript";
	getter: Value;
	setter: Value;
	args: Value[];
	location?: Location;
}

export function subscript(getter: Value, setter: Value, args: Value[], location?: LocationSource): SubscriptValue {
	return { kind: "subscript", getter, setter, args, location: readLocation(location) };
}


export function conditional(predicate: Value, consequent: Value, alternate: Value, scope: Scope, location?: LocationSource): Value {
	return transform(predicate, scope, (predicateExpression) => expr(conditionalExpression(
		predicateExpression,
		read(consequent, scope),
		read(alternate, scope),
	), location));
}

export function unary(operator: "!" | "-" | "delete" | "void", operand: Value, scope: Scope, location?: LocationSource): Value {
	return transform(operand, scope, (operandExpression) => expr(unaryExpression(
		operator,
		operandExpression,
	), location));
}

export type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "&" | "|" | "^" | "==" | "===" | "!=" | "!==" | "<<" | ">>" | ">>>";

export function binary(operator: BinaryOperator, left: Value, right: Value, scope: Scope, location?: LocationSource): Value {
	return transform(left, scope, (leftExpression) => expr(binaryExpression(
		operator,
		leftExpression,
		read(right, scope),
	), location));
}

export function logical(operator: "||" | "&&", left: Value, right: Value, scope: Scope, location?: LocationSource): Value {
	return transform(left, scope, (leftExpression) => expr(logicalExpression(
		operator,
		leftExpression,
		read(right, scope),
	), location));
}

const validIdentifier = /^[a-zA-Z$_][a-zA-Z$_0-9]*$/;

export function member(object: VariableValue, property: string | number, scope: Scope, location?: LocationSource): VariableValue;
export function member(object: Value, property: string | number | Value, scope: Scope, location?: LocationSource): Value;
export function member(object: Value, property: string | number | Value, scope: Scope, location?: LocationSource): Value {
	return transform(object, scope, (expression) => {
		const idExpression = typeof property === "object" ? read(property, scope) : literal(property, location).expression;
		const builder = typeof valueOfExpression(idExpression) !== "undefined" && object.kind === "direct" ? variable as typeof expr : expr;
		if (idExpression.type === "StringLiteral" && validIdentifier.test(idExpression.value)) {
			return builder(memberExpression(
				expression,
				identifier(idExpression.value),
			), location);
		}
		return builder(memberExpression(
			expression,
			idExpression,
			true,
		), location);
	});
}

export interface CopiedValue {
	kind: "copied";
	value: Value;
	type: Value;
	location?: Location;
}

export function copy(value: Value, type: Value): CopiedValue {
	return {
		kind: "copied",
		value,
		type,
	};
}


export interface TypeValue {
	kind: "type";
	type: Type;
	location?: Location;
}

export function typeValue(typeOrString: Type | string, location?: LocationSource): TypeValue {
	return { kind: "type", type: typeof typeOrString === "string" ? parseType(typeOrString) : typeOrString, location: readLocation(location) };
}

export interface ConformanceValue {
	kind: "conformance";
	type: Value;
	conformance: string;
	location?: Location;
}

export function conformance(type: Value, name: string, scope: Scope, location?: LocationSource): ConformanceValue {
	return { kind: "conformance", type, conformance: name, location: readLocation(location) };
}

const isValidIdentifier = /^[A-Z_$][A-Z_$0-9]*$/;

export function typeFromValue(value: Value, scope: Scope): ReifiedType {
	switch (value.kind) {
		case "type":
			return reifyType(value.type, scope);
		case "conformance": {
			const reified = typeFromValue(value.type, scope);
			const conformanceName = value.conformance;
			if (Object.hasOwnProperty.call(reified.conformances, conformanceName)) {
				// throw new TypeError(`${stringifyValue(value.type)} does not conform to ${value.conformance}`);
				return {
					fields: [],
					functions: lookupForMap<FunctionBuilder | GetterSetterBuilder | undefined>(reified.conformances[conformanceName].functions),
					conformances: Object.assign({
						[conformanceName]: reified.conformances[conformanceName],
					}, reified.conformances[conformanceName].conformances),
					innerTypes: {},
					possibleRepresentations: PossibleRepresentation.All,
				};
			} else {
				return {
					fields: [],
					conformances: {},
					functions: (functionName) => (innerScope) => member(member(value.type, conformanceName, innerScope), mangleName(functionName).name, innerScope),
					innerTypes: {},
					possibleRepresentations: PossibleRepresentation.Object,
				};
			}
		}
		default: {
			const expression = read(value, scope);
			return {
				fields: [],
				conformances: {},
				functions: (functionName) => (innerScope) => member(value, mangleName(functionName).name, innerScope),
				innerTypes: {},
				possibleRepresentations: PossibleRepresentation.Object,
			};
		}
	}
}


export type Value = ExpressionValue | CallableValue | VariableValue | FunctionValue | TupleValue | BoxedValue | StatementsValue | SubscriptValue | CopiedValue | TypeValue | ConformanceValue;


const baseProperty = identifier("base");
const offsetProperty = identifier("offset");

export function unbox(value: Value, scope: Scope): VariableValue | SubscriptValue {
	if (value.kind === "boxed") {
		return annotateValue(value.contents, value.location);
	// } else if (value.kind === "direct") {
	// 	// TODO: Introduce real type for this case
	// 	if (value.expression.type === "MemberExpression" && value.expression.property.type === "NumericLiteral" && value.expression.property.value === 0) {
	// 		console.log(value);
	// 		return annotateValue(expr(value.expression.object) as VariableValue, value.location);
	// 	}
	// } else if (value.kind === "subscript") {
	// 	return value;
	}
	throw new Error(`Unable to unbox from ${value.kind} value`);
}

const unboxedRepresentations = PossibleRepresentation.Function | PossibleRepresentation.Object | PossibleRepresentation.Symbol | PossibleRepresentation.Array;

export function typeRequiresBox(type: Type, scope: Scope): boolean {
	switch (type.kind) {
		case "array":
		case "dictionary":
			return false;
		case "modified":
			return typeRequiresBox(type.type, scope);
		default:
			const possibleRepresentations = reifyType(type, scope).possibleRepresentations;
			return (possibleRepresentations & unboxedRepresentations) !== possibleRepresentations;
	}
}

export function constructBox(value: Value | undefined, type: Type, scope: Scope): Value {
	return array(typeof value !== "undefined" ? [value] : [], scope);
}

export function contentsOfBox(target: BoxedValue, scope: Scope): Value {
	if (target.type.kind === "type") {
		if (typeRequiresBox(target.type.type, scope)) {
			return member(target.contents, 0, scope);
		}
	} else {
		// TODO: Support runtime types
		throw new TypeError(`Do not support runtime types in contentsOfBox!`);
	}
	return target.contents;
}

export function set(dest: Value, source: Value, scope: Scope, operator: "=" | "+=" | "-=" | "*=" | "/=" | "|=" | "&=" = "=", location?: LocationSource): Value {
	switch (dest.kind) {
		case "boxed":
			return set(contentsOfBox(dest, scope), source, scope, operator, location);
		case "direct": {
			if (dest.expression.type === "ThisExpression") {
				throw new Error("Cannot assign to a this expression!");
			}
			const result = assignmentExpression(operator, dest.expression, read(source, scope));
			return expr(result);
			// return statements([annotate(expressionStatement(result), location)], location);
		}
		case "subscript": {
			let setterArgs: Value[] = dest.args;
			if (operator !== "=") {
				// Call the getter, apply the operation, then apply the setter
				const reused = dest.args.map((value) => reuse(value, scope, "subscripted"));
				const valueFetched = call(dest.getter, reused.map(([_, after]) => after), [], scope, location, "get");
				source = expr(binaryExpression(operator.substr(0, operator.length - 1) as any, read(valueFetched, scope), read(source, scope)));
				setterArgs = reused.map(([first]) => first);
			}
			return call(dest.setter, concat(setterArgs, [source]), [], scope, location, "set");
		}
		case "expression": {
			switch (dest.expression.type) {
				case "Identifier":
				case "MemberExpression":
					const result = assignmentExpression(operator, dest.expression, read(source, scope));
					return expr(result);
					// return statements([annotate(expressionStatement(result), location)], location);
				default:
					break;
			}
		}
		default: {
			throw new TypeError(`Unable to set a ${dest.kind} value`);
		}
	}
}

export function update(dest: Value, scope: Scope, updater: (value: Value) => Value, location?: LocationSource): Value {
	switch (dest.kind) {
		case "boxed":
			return update(contentsOfBox(dest, scope), scope, updater);
		case "direct":
			switch (dest.expression.type) {
				case "ThisExpression":
					throw new Error("Cannot update a this expression!");
				case "MemberExpression":
					if (dest.expression.object.type !== "Identifier" || (dest.expression.computed && typeof valueOfExpression(dest.expression.property) === "undefined")) {
						const [firstObject, afterObject] = reuse(expr(dest.expression.object), scope, "object");
						const property = dest.expression.property;
						if (dest.expression.computed) {
							const [firstProperty, afterProperty] = reuse(expr(property), scope, "property");
							return set(
								member(firstObject, firstProperty, scope),
								updater(member(afterObject, afterProperty, scope)),
								scope,
								"=",
								location,
							);
						}
						if (property.type !== "Identifier") {
							throw new TypeError(`Expected an Identifier, got a ${property.type}`);
						}
						return set(
							member(firstObject, property.name, scope),
							updater(member(afterObject, property.name, scope)),
							scope,
							"=",
							location,
						);
					}
				case "Identifier":
				default:
					return set(dest, updater(dest), scope, "=", location);
			}
			break;
		case "subscript":
			// Call the getter, apply the operation, then apply the setter
			const reused = dest.args.map((value) => reuse(value, scope, "subscripted"));
			const valueFetched = call(dest.getter, reused.map(([_, after]) => after), [], scope, location, "get");
			const result = updater(valueFetched);
			return call(dest.setter, concat(reused.map(([first]) => first), [result]), [], scope, location, "set");
		default:
			break;
	}
	throw new TypeError(`Unable to set a ${dest.kind} value!`);
}

// TODO: Avoid using dummy types
const dummyType = typeValue({ kind: "name", name: "Dummy" });

export function array(values: Value[], scope: Scope, location?: LocationSource) {
	let prefixStatements: Statement[] = [];
	const elements: Expression[] = [];
	for (const value of values.slice().reverse()) {
		if (value.kind === "statements" && value.statements[value.statements.length - 1].type === "ReturnStatement") {
			const argument = (value.statements[value.statements.length - 1] as ReturnType<typeof returnStatement>).argument;
			const newStatements = value.statements.slice(0, value.statements.length - 1);
			if (argument.type === "Identifier") {
				elements.unshift(argument);
			} else {
				const temp = uniqueName(scope, "element");
				newStatements.push(addVariable(scope, temp, dummyType, expr(argument), DeclarationFlags.Const));
				elements.unshift(read(lookup(temp, scope), scope));
			}
			prefixStatements = concat(newStatements, prefixStatements);
		} else {
			const expression = read(value, scope);
			if (prefixStatements.length !== 0 && !isPure(expression)) {
				const temp = uniqueName(scope, "element");
				prefixStatements.push(addVariable(scope, temp, dummyType, expr(expression), DeclarationFlags.Const));
				elements.unshift(read(lookup(temp, scope), scope));
			} else {
				elements.unshift(expression);
			}
		}
	}
	if (prefixStatements.length === 0) {
		return expr(arrayExpression(elements));
	}
	prefixStatements.push(returnStatement(arrayExpression(elements)));
	return statements(prefixStatements);
}


export function annotate<T extends Node>(node: T, location?: LocationSource): T {
	if (typeof location !== "undefined" && !Object.hasOwnProperty.call(node, "loc")) {
		return Object.assign(Object.create(Object.getPrototypeOf(node)), {
			loc: readLocation(location),
		}, node);
	}
	return node;
}

export function annotateValue<T extends Value>(value: T, location?: LocationSource): T {
	if (typeof location !== "undefined" && !Object.hasOwnProperty.call(value, "location")) {
		return Object.assign(Object.create(Object.getPrototypeOf(value)), {
			location: readLocation(location),
		}, value);
	}
	return value;
}

const voidToVoid = parseFunctionType(`() -> () -> ()`); // TODO: Replace with proper type extracted from the context

export function read(value: VariableValue, scope: Scope): Identifier | MemberExpression;
export function read(value: Value, scope: Scope): Expression;
export function read(value: Value, scope: Scope): Expression {
	switch (value.kind) {
		case "copied": {
			const reified = typeFromValue(value.type, scope);
			if (reified.copy) {
				return annotate(read(reified.copy(value.value, scope), scope), value.location);
			}
			return annotate(read(value.value, scope), value.location);
		}
		case "function": {
			let builder;
			if (typeof value.parentType === "undefined") {
				if (Object.hasOwnProperty.call(scope.functions, value.name)) {
					builder = scope.functions[value.name];
				}
			} else if (value.parentType.kind === "type") {
				builder = reifyType(value.parentType.type, scope).functions(value.name);
			}
			if (typeof builder === "undefined") {
				throw new Error(`Could not find function to read for ${value.name}`);
			}
			const unbound = annotateValue(insertFunction(value.name, scope, value.type, builder), value.location);
			let func;
			if (value.substitutions.length) {
				func = call(
					member(unbound, "bind", scope),
					concat([literal(null)], value.substitutions),
					[], // TODO: Add types for this call expression
					scope,
				);
			} else {
				func = unbound;
			}
			return read(func, scope);
		}
		case "tuple": {
			switch (value.values.length) {
				case 0:
					return annotate(undefinedLiteral, value.location);
				case 1:
					return annotate(read(value.values[0], scope), value.location);
				default:
					return annotate(read(array(value.values, scope), scope), value.location);
			}
		}
		case "expression": {
			return annotate(value.expression, value.location);
		}
		case "callable": {
			const [args, body] = functionize(scope, value.call, value.location);
			return annotate(functionExpression(undefined, args, annotate(blockStatement(body), value.location)), value.location);
		}
		case "direct": {
			return annotate(value.expression, value.location);
		}
		case "statements": {
			return annotate(callExpression(annotate(functionExpression(undefined, [], annotate(blockStatement(value.statements), value.location)), value.location), []), value.location);
		}
		case "subscript": {
			return annotate(read(call(value.getter, value.args, [], scope, value.location, "get"), scope), value.location);
		}
		case "boxed": {
			return annotate(read(contentsOfBox(value, scope), scope), value.location);
		}
		case "conformance":
		case "type": {
			let stringified: string;
			let suffix: string;
			if (value.kind === "type") {
				stringified = stringifyType(value.type);
				suffix = "Type";
			} else {
				if (value.type.kind !== "type") {
					throw new TypeError(`Expected a type, got a ${value.type.kind}`);
				}
				stringified = stringifyType(value.type.type);
				suffix = value.conformance;
			}
			const name: string = `:${stringified}.${suffix}`;
			const mangled = mangleName(name);
			const reified = typeFromValue(value, scope);
			const witnessTable = objectExpression([]);
			const globalScope = rootScope(scope);
			globalScope.declarations[name] = {
				flags: DeclarationFlags.Const,
				declaration: variableDeclaration("const", [variableDeclarator(mangled, witnessTable)]),
			};
			// if (typeof value.protocol !== "undefined") {
			// 	const globalScope = rootScope(scope);
			// 	if (!Object.hasOwnProperty.call(globalScope.declarations, name)) {
			// 		if (!Object.hasOwnProperty.call(reified.conformances, value.protocol)) {
			// 			throw new TypeError(`${stringifyType(value.type)} does not conform to ${value.protocol}`);
			// 		}
			// 		globalScope.declarations[name] = {
			// 			flags: DeclarationFlags.Const,
			// 		};
			// 		const protocol = reified.conformances[value.protocol];
			// 		function returnValue() {
			// 			return value;
			// 		}
			// 		const witnessTable = objectExpression(Object.keys(protocol).map((key) => {
			// 			const result = protocol[key](globalScope, returnValue, voidToVoid, `${stringified}.${key}`);
			// 			if (result.kind === "callable") {
			// 				const [args, statements] = functionize(globalScope, result.call);
			// 				return objectMethod("method", mangleName(key), args, blockStatement(statements));
			// 			} else {
			// 				return objectProperty(mangleName(key), read(result, scope));
			// 			}
			// 		}));
			// 		globalScope.declarations[name] = {
			// 			flags: DeclarationFlags.Const,
			// 			declaration: variableDeclaration("const", [variableDeclarator(mangled, witnessTable)]),
			// 		};
			// 	}
			// }
			return annotate(mangled, value.location);
		}
		default: {
			throw new TypeError(`Received an unexpected value of type ${(value as Value).kind}`);
		}
	}
}

export function ignore(value: Value, scope: Scope): Statement[] {
	switch (value.kind) {
		case "statements":
			return value.statements;
		default:
			return [expressionStatement(read(value, scope))];
	}
}


export function transform(value: Value, scope: Scope, callback: (expression: Expression) => Value): Value {
	if (value.kind === "statements") {
		const contents = value.statements;
		if (contents.length === 0) {
			return callback(undefinedLiteral);
		}
		const lastStatement = contents[contents.length - 1];
		let head: Statement[];
		let tail: Value;
		if (lastStatement.type === "ReturnStatement") {
			head = contents.slice(0, contents.length - 1);
			tail = callback(lastStatement.argument);
		} else {
			head = contents;
			tail = callback(undefinedLiteral);
		}
		if (tail.kind === "statements") {
			return statements(concat(head, tail.statements));
		} else {
			return statements(concat(
				head,
				[returnStatement(read(tail, scope))],
			));
		}
	}
	return callback(read(value, scope));
}

export const undefinedLiteral = identifier("undefined");
export const undefinedValue = expr(undefinedLiteral);

export const typeType: Type = { kind: "name", name: "Type" };
export const typeTypeValue = typeValue(typeType);

export function call(target: Value, args: ReadonlyArray<Value>, argTypes: Array<Value | string>, scope: Scope, location?: LocationSource, type: "call" | "get" | "set" = "call"): Value {
	const getter: ArgGetter = (i) => {
		if (i < args.length) {
			return args[i];
		}
		throw new Error(`${target.kind === "function" ? target.name : "Callable"} asked for argument ${i + 1}, but only ${args.length} arguments provided!`);
	};
	switch (target.kind) {
		case "function":
			let targetFunctionType: Function;
			if (target.substitutions.length !== 0) {
				// Type substitutions are passed as prefix arguments
				args = concat(target.substitutions, args);
				const subsitutionTypes = target.substitutions.map(() => typeType);
				argTypes = concat(argTypes, target.type.arguments.types.map((innerType) => typeValue(innerType)));
				targetFunctionType = {
					kind: "function",
					arguments: {
						kind: "tuple",
						types: concat(subsitutionTypes, target.type.arguments.types),
					},
					return: target.type.return,
					attributes: target.type.attributes,
					throws: target.type.throws,
					rethrows: target.type.rethrows,
				};
			} else {
				targetFunctionType = target.type;
			}
			let fn;
			if (typeof target.parentType === "undefined") {
				// Global functions
				fn = lookupForMap(scope.functions)(target.name);
				if (typeof fn === "undefined") {
					throw new Error(`Could not find function to call for ${target.name}`);
				}
			} else if (target.parentType.kind === "type" || target.parentType.kind === "conformance") {
				const parentType = target.parentType;
				const reified = typeFromValue(parentType, scope);
				// Member functions
				fn = reified.functions(target.name);
				if (typeof fn === "undefined") {
					throw new Error(`${stringifyValue(parentType)} does not have a ${target.name} function`);
				}
			} else {
				// Function from a vtable at runtime
				if (type !== "call") {
					throw new Error(`Unable to runtime dispatch a ${type}ter!`);
				}
				const func = memberExpression(read(target.parentType, scope), mangleName(target.name));
				return call(expr(func, target.location), args, argTypes, scope, location);
			}
			switch (type) {
				case "call":
					if (typeof fn !== "function") {
						throw new Error(`Expected a callable function!`);
					}
					return annotateValue(fn(scope, getter, targetFunctionType, target.name), location);
				default:
					if (typeof fn === "function") {
						throw new Error(`Expected a ${type}ter!`);
					}
					return annotateValue(fn[type](scope, getter, targetFunctionType, target.name), location);
			}
		case "callable":
			if (type !== "call") {
				throw new Error(`Unable to call a ${type}ter on a function!`);
			}
			// Inlining is responsible for making the codegen even remotely sane
			// return call(expr(read(target, scope)), args, scope, location);
			return annotateValue(target.call(scope, getter), location);
		default:
			break;
	}
	if (type !== "call") {
		throw new Error(`Unable to call a ${type}ter on a function!`);
	}
	return transform(target, scope, (targetExpression) => {
		const argExpressions: Expression[] = [];
		for (let i = 0; i < args.length; i++) {
			const argType = argTypes[i];
			const innerType = typeof argType === "string" ? typeValue(parseType(argType)) : argType;
			argExpressions.push(innerType.kind === "type" && innerType.type.kind === "modified" && innerType.type.modifier === "inout" ? read(unbox(args[i], scope), scope) : read(args[i], scope));
		}
		return expr(callExpression(targetExpression, argExpressions), location);
	});
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

function simplifyExpression(expression: Expression): Expression {
	if (isLiteral(expression)) {
		return expression;
	}
	const value = valueOfExpression(expression);
	if (typeof value !== "undefined") {
		return literal(value, expression.loc).expression;
	}
	switch (expression.type) {
		case "ConditionalExpression":
			const testValue = valueOfExpression(expression.test);
			if (typeof testValue !== "undefined") {
				return annotate(simplifyExpression(testValue ? expression.consequent : expression.alternate), expression.loc);
			}
			return annotate(conditionalExpression(simplifyExpression(expression.test), simplifyExpression(expression.consequent), simplifyExpression(expression.alternate)), expression.loc);
		case "LogicalExpression":
			const left = simplifyExpression(expression.left);
			const leftValue = valueOfExpression(left);
			const right = simplifyExpression(expression.right);
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
						return literal(propertyValue, expression.loc).expression;
					}
				} else {
					return annotate(memberExpression(simplifyExpression(expression.object), expression.property), expression.loc);
				}
			} else if (expression.computed) {
				return annotate(memberExpression(simplifyExpression(expression.object), simplifyExpression(expression.property), true), expression.loc);
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

export function literal(value: LiteralValue, location?: LocationSource): ExpressionValue | VariableValue {
	if (typeof value === "boolean") {
		return expr(booleanLiteral(value), location);
	} else if (typeof value === "number") {
		return expr(numericLiteral(value), location);
	} else if (typeof value === "string") {
		return expr(stringLiteral(value), location);
	} else if (value === null) {
		return expr(nullLiteral(), location);
	} else if (Array.isArray(value)) {
		return expr(arrayExpression(value.map((element) => literal(element, location).expression)), location);
	} else if (typeof value === "object") {
		return expr(objectExpression(Object.keys(value).map((key) => {
			const expression = literal((value as LiteralMap)[key], location).expression;
			if (validIdentifier.test(key)) {
				return objectProperty(identifier(key), expression);
			} else {
				// Case where key is not a valid identifier
				return objectProperty(stringLiteral(key), expression, true);
			}
		})), location) as ExpressionValue;
	} else {
		throw new TypeError(`Expected to receive a valid literal type, instead got ${typeof value}`);
	}
}

export function reuse(value: Value, scope: Scope, uniqueNamePrefix: string): [Value, Value] {
	if (value.kind === "direct") {
		return [value, value];
	}
	const expression = simplifyExpression(read(value, scope));
	if (isPure(expression)) {
		const result = expr(expression);
		return [result, result];
	} else if (expression.type === "AssignmentExpression" && expression.operator === "=" && expression.left.type === "Identifier") {
		return [expr(expression), expr(expression.left)];
	} else {
		const tempName = uniqueName(scope, uniqueNamePrefix);
		addDeclaration(scope, tempName, (id) => variableDeclaration("let", [variableDeclarator(id)]));
		const temp = annotateValue(lookup(tempName, scope), expression.loc);
		return [set(temp, expr(expression), scope, "=", expression.loc), temp];
	}
}

export function stringifyType(type: Type): string {
	switch (type.kind) {
		case "optional":
			return stringifyType(type.type) + "?";
		case "generic":
			if (type.base.kind === "function") {
				return "<" + type.arguments.map(stringifyType).join(", ") + "> " + stringifyType(type.base);
			} else {
				return stringifyType(type.base) + "<" + type.arguments.map(stringifyType).join(", ") + ">";
			}
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
		case "constrained":
			return stringifyType(type.type) + " where " + stringifyType(type.type) + " : " + stringifyType(type.constraint);
		default:
			throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
	}
}

function stringifyNode(node: Node): string {
	const result = transformFromAst(node, undefined, {
		babelrc: false,
		code: true,
		compact: true,
		sourceMaps: false,
	});
	return result.code!;
}

export function stringifyValue(value: Value): string {
	switch (value.kind) {
		case "copied": {
			return `copy of ${stringifyValue(value.value)}`;
		}
		case "function": {
			if (typeof value.parentType === "undefined") {
				return `${value.name} function`;
			}
			return `${value.name} function in ${stringifyValue(value.parentType)}`;
		}
		case "tuple": {
			return `(${value.values.map(stringifyValue).join(", ")})`;
		}
		case "direct":
		case "expression": {
			return `${stringifyNode(value.expression)} (${value.kind})`;
		}
		case "callable": {
			return `anonymous ${stringifyType(value.type)} function`;
		}
		case "statements": {
			return `${stringifyNode(blockStatement(value.statements))} (${value.kind})`;
		}
		case "type": {
			return `${stringifyType(value.type)} (as type)`;
		}
		case "conformance": {
			return `${value.conformance} conformance of ${stringifyValue(value.type)}`;
		}
		case "boxed":
		case "subscript":
		default: {
			return value.kind;
		}
	}
}

export function isNestedOptional(type: Type): boolean {
	if (type.kind !== "optional") {
		throw new Error(`Expected an optional, instead got a ${type.kind}!`);
	}
	return type.type.kind === "optional";
}
