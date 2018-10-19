import generate from "@babel/generator";
import { arrayExpression, assignmentExpression, binaryExpression, blockStatement, booleanLiteral, callExpression, conditionalExpression, expressionStatement, functionDeclaration, functionExpression, identifier, ifStatement, isExpression as isExpression_, isFunction, isLiteral, isReturnStatement, logicalExpression, memberExpression, nullLiteral, numericLiteral, objectExpression, objectMethod, objectProperty, returnStatement, sequenceExpression, stringLiteral, traverse, unaryExpression, variableDeclaration, variableDeclarator, Expression, Identifier, MemberExpression, Node, PatternLike, SpreadElement, Statement, ThisExpression } from "@babel/types";

import { Term } from "./ast";
import { functionize, insertFunction, FunctionBuilder } from "./functions";
import { parseFunctionType, parseType } from "./parse";
import { reifyType, PossibleRepresentation, ProtocolConformance, ReifiedType, TypeMap } from "./reified";
import { addVariable, lookup, mangleName, mappedValueForName, rootScope, uniqueName, DeclarationFlags, MappedNameValue, Scope } from "./scope";
import { Function, Type } from "./types";
import { concat, expectLength, lookupForMap } from "./utils";

export type ArgGetter = (index: number, desiredName?: string) => Value;

const isExpression = isExpression_ as (node: Node) => node is Expression;

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

type LocationSource = Location | Term | null;

function readLocation(source?: LocationSource): Location | undefined {
	if (typeof source === "undefined" || source === null) {
		return undefined;
	}
	return !Object.hasOwnProperty.call(source, "properties") ? source as unknown as Location : locationForTerm(source as unknown as Term);
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
	call: (scope: Scope, arg: ArgGetter, length: number) => Value;
	type: Function;
	location?: Location;
}

export function callable(callback: (scope: Scope, arg: ArgGetter, length: number) => Value, functionType: Function | string, location?: LocationSource): CallableValue {
	const type = typeof functionType === "string" ? parseFunctionType(functionType) : functionType;
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

export function functionValue(name: string, parentType: Value | undefined, functionType: Function | string, substitutions: Value[] = [], location?: LocationSource): FunctionValue {
	const type = typeof functionType === "string" ? parseFunctionType(functionType) : functionType;
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
	types: Value[];
	location?: Location;
}

export function subscript(getter: Value, setter: Value, args: Value[], types: Value[], location?: LocationSource): SubscriptValue {
	return { kind: "subscript", getter, setter, args, types, location: readLocation(location) };
}


export function conditional(predicate: Value, consequent: Value, alternate: Value, scope: Scope, location?: LocationSource): Value {
	return transform(predicate, scope, (predicateExpression) => {
		const predicateValue = expressionLiteralValue(predicateExpression);
		if (typeof predicateValue !== "undefined") {
			return predicateValue ? consequent : alternate;
		} else {
			return expr(conditionalExpression(
				predicateExpression,
				read(consequent, scope),
				read(alternate, scope),
			), location);
		}
	});
}

export function unary(operator: "!" | "-" | "~" | "delete" | "void", operand: Value, scope: Scope, location?: LocationSource): Value {
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
export function member(object: Value | string, property: string | number | Value, scope: Scope, location?: LocationSource): Value;
export function member(object: Value | string, property: string | number | Value, scope: Scope, location?: LocationSource): Value {
	const objectValue = typeof object === "string" ? expr(identifier(object)) : object;
	return transform(objectValue, scope, (expression) => {
		const idExpression = typeof property === "object" ? read(property, scope) : literal(property, location).expression;
		const builder = typeof expressionLiteralValue(idExpression) !== "undefined" && objectValue.kind === "direct" ? variable as typeof expr : expr;
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
	while (type.kind === "conformance") {
		type = type.type;
	}
	return { kind: "conformance", type, conformance: name, location: readLocation(location) };
}

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
					functions: lookupForMap<FunctionBuilder | undefined>(reified.conformances[conformanceName].functions),
					conformances: {
						[conformanceName]: reified.conformances[conformanceName],
						...reified.conformances[conformanceName].conformances,
					},
					innerTypes: {},
					possibleRepresentations: PossibleRepresentation.All,
				};
			} else {
				return {
					conformances: {},
					functions: (functionName) => (innerScope) => member(member(value.type, conformanceName, innerScope), mangleName(functionName).name, innerScope),
					innerTypes: {},
					possibleRepresentations: PossibleRepresentation.Object,
				};
			}
		}
		default: {
			return {
				conformances: {},
				functions: (functionName) => (innerScope) => member(value, mangleName(functionName).name, innerScope),
				innerTypes: {},
				possibleRepresentations: PossibleRepresentation.Object,
			};
		}
	}
}


export type Value = ExpressionValue | CallableValue | VariableValue | FunctionValue | TupleValue | BoxedValue | StatementsValue | SubscriptValue | CopiedValue | TypeValue | ConformanceValue;


export function unbox(value: Value, scope: Scope): VariableValue | SubscriptValue {
	if (value.kind === "boxed") {
		return annotateValue(value.contents, value.location);
	}
	throw new Error(`Unable to unbox from ${value.kind} value`);
}

const unboxedRepresentations = PossibleRepresentation.Function | PossibleRepresentation.Object | PossibleRepresentation.Symbol | PossibleRepresentation.Array;

export function typeRequiresBox(type: Value, scope: Scope): Value {
	const possibleRepresentations = typeFromValue(type, scope).possibleRepresentations;
	return literal((possibleRepresentations & unboxedRepresentations) !== possibleRepresentations);
}

export function extractContentOfBox(target: BoxedValue, scope: Scope) {
	return member(target.contents, 0, scope);
}

export type UpdateOperator = "=" | "+=" | "-=" | "*=" | "/=" | "|=" | "&=";

type Mapped<T extends string | number, U> = { [K in T]: U };

export const binaryOperatorForUpdateOperator: Mapped<Exclude<UpdateOperator, "=">, BinaryOperator> = {
	"+=": "+",
	"-=": "-",
	"*=": "*",
	"/=": "/",
	"|=": "|",
	"&=": "&",
};

export const updateOperatorForBinaryOperator: Mapped<"+" | "-" | "*" | "/" | "|" | "&", UpdateOperator> = {
	"+": "+=",
	"-": "-=",
	"*": "*=",
	"/": "/=",
	"|": "|=",
	"&": "&=",
};

export function set(dest: Value, source: Value, scope: Scope, operator: UpdateOperator = "=", location?: LocationSource): Value {
	let result: Value;
	switch (dest.kind) {
		case "boxed":
			result = conditional(
				typeRequiresBox(dest.type, scope),
				set(extractContentOfBox(dest, scope), source, scope, operator, location),
				set(dest.contents, source, scope, operator, location),
				scope,
				location,
			);
			break;
		case "direct": {
			if (dest.expression.type === "ThisExpression") {
				throw new Error("Cannot assign to a this expression!");
			}
			result = expr(assignmentExpression(operator, dest.expression, read(source, scope)));
			break;
		}
		case "subscript": {
			if (operator !== "=") {
				result = update(dest, scope, (value) => {
					return binary(binaryOperatorForUpdateOperator[operator], value, source, scope);
				}, location);
			} else {
				// TODO: Populate with correct type
				result = call(dest.setter, concat(dest.args, [source]), concat(dest.types, [typeValue("Any")]), scope, location);
			}
			break;
		}
		case "expression": {
			switch (dest.expression.type) {
				case "Identifier":
				case "MemberExpression":
					result = expr(assignmentExpression(operator, dest.expression, read(source, scope)));
					break;
				default:
					throw new TypeError(`Unable to set an expression with a ${dest.expression.type} value`);
			}
			break;
		}
		default: {
			throw new TypeError(`Unable to set a ${dest.kind} value`);
		}
	}
	return statements(ignore(result, scope), location);
}

export function update(dest: Value, scope: Scope, updater: (value: Value) => Value, location?: LocationSource): Value {
	switch (dest.kind) {
		case "boxed":
			return conditional(
				typeRequiresBox(dest.type, scope),
				set(extractContentOfBox(dest, scope), updater(extractContentOfBox(dest, scope)), scope, "=", location),
				set(dest.contents, updater(extractContentOfBox(dest, scope)), scope, "=", location),
				scope,
				location,
			);
		case "direct":
			switch (dest.expression.type) {
				case "ThisExpression":
					throw new Error("Cannot update a this expression!");
				case "MemberExpression":
					const memberDest = dest.expression;
					if (memberDest.object.type !== "Identifier" || (memberDest.computed && typeof expressionLiteralValue(memberDest.property) === "undefined")) {
						return reuse(expr(dest.expression.object), scope, "object", (object) => {
							const property = memberDest.property;
							if (memberDest.computed) {
								return reuse(expr(property), scope, "property", (reusableProperty) => {
									return set(
										member(object, reusableProperty, scope),
										updater(member(object, reusableProperty, scope)),
										scope,
										"=",
										location,
									);
								});
							}
							if (property.type !== "Identifier") {
								throw new TypeError(`Expected an Identifier, got a ${property.type}`);
							}
							return set(
								member(object, property.name, scope),
								updater(member(object, property.name, scope)),
								scope,
								"=",
								location,
							);
						});
					}
				case "Identifier":
				default:
					return set(dest, updater(dest), scope, "=", location);
			}
			break;
		case "subscript":
			// Call the getter, apply the operation, then apply the setter
			let i = -1;
			const reusableArgs: Value[] = [];
			const { args, types, getter, setter } = dest;
			function iterate(): Value {
				if (++i < args.length) {
					return reuse(args[i], scope, "subscript", (argValue) => {
						reusableArgs.push(argValue);
						return iterate();
					});
				} else {
					const valueFetched = call(getter, reusableArgs, types, scope, location);
					const result = updater(valueFetched);
					// TODO: Pass correct type
					return call(setter, concat(reusableArgs, [result]), concat(types, [typeValue("Any")]), scope, location);
				}
			}
			return iterate();
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
		if (value.kind === "statements") {
			const parsed = parseStatementsValue(value, containsNoReturnStatements);
			if (typeof parsed !== "undefined") {
				let newStatements = parsed.statements.slice();
				if (typeof parsed.value === "undefined") {
					elements.unshift(undefinedLiteral);
				} else if (parsed.value.type === "Identifier") {
					elements.unshift(parsed.value);
				} else {
					const temp = uniqueName(scope, "element");
					newStatements = concat(newStatements, [addVariable(scope, temp, dummyType, expr(parsed.value), DeclarationFlags.Const)]);
					elements.unshift(read(lookup(temp, scope), scope));
				}
				prefixStatements = concat(newStatements, prefixStatements);
				continue;
			}
		}
		const expression = read(value, scope);
		if (prefixStatements.length !== 0 && !isPure(expression)) {
			const temp = uniqueName(scope, "element");
			prefixStatements.push(addVariable(scope, temp, dummyType, expr(expression), DeclarationFlags.Const));
			elements.unshift(read(lookup(temp, scope), scope));
		} else {
			elements.unshift(expression);
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

function isExpressionStatement(node: Node): boolean {
	return node.type === "ExpressionStatement";
}

function expressionFromStatement(statement: Statement): Expression {
	if (statement.type === "ExpressionStatement") {
		return statement.expression;
	}
	throw new TypeError(`Expected expression statment, got a ${statement.type}`);
}

function parseStatementsValue(value: StatementsValue, allowedStatement: (statement: Statement) => boolean): { statements: Statement[], value?: Expression } | undefined {
	const body = value.statements;
	if (body.length === 0) {
		return { statements: body };
	}
	// Avoid generating an IIFE for statements list
	const lastStatement = body[body.length - 1];
	if (lastStatement.type === "ReturnStatement") {
		const exceptLast = body.slice(0, body.length - 1);
		if (exceptLast.every(allowedStatement)) {
			return lastStatement.argument === null ? { statements: exceptLast } : { statements: exceptLast, value: lastStatement.argument };
		}
	} else if (body.every(allowedStatement)) {
		return { statements: body };
	}
	return undefined;
}

interface ContainsNoReturnStatementsState {
	result: boolean;
	ignoreCount: number;
}

const containsNoReturnStatementsHandler = {
	enter(current: Node, parent: unknown, state: ContainsNoReturnStatementsState) {
		if (state.ignoreCount === 0 && isReturnStatement(current)) {
			state.result = true;
		}
		if (isFunction(current)) {
			state.ignoreCount++;
		}
	},
	exit(current: Node, parent: unknown, state: ContainsNoReturnStatementsState) {
		if (isFunction(current)) {
			state.ignoreCount--;
		}
	},
};

function containsNoReturnStatements(node: Node): boolean {
	if (isReturnStatement(node)) {
		return false;
	}
	if (isExpressionStatement(node)) {
		return true;
	}
	const state: ContainsNoReturnStatementsState = {
		result: true,
		ignoreCount: 0,
	};
	traverse(node, containsNoReturnStatementsHandler, state);
	return state.result;
}

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
			const unbound = annotateValue(insertFunction(value.name, scope, builder, value.type), value.location);
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
			// TODO: Include length to value.call
			const [args, body] = functionize(scope, "anonymous", (innerScope, arg) => value.call(innerScope, arg, 0), value.type, undefined, value.location);
			return annotate(functionExpression(undefined, args, annotate(blockStatement(body), value.location)), value.location);
		}
		case "direct": {
			return annotate(value.expression, value.location);
		}
		case "statements": {
			const parsed = parseStatementsValue(value, isExpressionStatement);
			if (typeof parsed === "undefined") {
				return annotate(callExpression(annotate(functionExpression(undefined, [], annotate(blockStatement(value.statements), value.location)), value.location), []), value.location);
			}
			const result = typeof parsed.value !== "undefined" ? parsed.value : undefinedLiteral;
			if (parsed.statements.length === 0) {
				return result;
			}
			return sequenceExpression(concat(parsed.statements.map(expressionFromStatement), [result]));
		}
		case "subscript": {
			return annotate(read(call(value.getter, value.args, value.types, scope, value.location), scope), value.location);
		}
		case "boxed": {
			return read(conditional(
				typeRequiresBox(value.type, scope),
				extractContentOfBox(value, scope),
				value.contents,
				scope,
				value.location,
			), scope);
		}
		case "conformance":
		case "type": {
			const type = value.kind === "conformance" ? value.type : value;
			if (type.kind !== "type") {
				throw new TypeError(`Expected a type, got a ${type.kind}`);
			}
			// Direct remapping
			if (type.type.kind === "name") {
				const result = mappedValueForName(type.type.name, scope);
				if (typeof result !== "undefined") {
					return read(result, scope);
				}
			}
			// Deep-remap types, replacing with a placeholder so that similar type patterns are specialized and a standardized name is generated
			const substitutionNames: string[] = [];
			const substitutions: Value[] = [];
			const stringified = stringifyType(type.type, (innerType) => {
				if (innerType.kind === "name") {
					const result = mappedValueForName(innerType.name, scope);
					if (typeof result !== "undefined") {
						substitutionNames.push(innerType.name);
						substitutions.push(result);
						return {
							kind: "name",
							name: "_",
						};
					}
				}
				return innerType;
			});
			const name: string = `:${stringified}.Type`;
			const mangled = mangleName(name);
			const globalScope = rootScope(scope);
			// Emit a type table if one doesn't exist
			if (!Object.hasOwnProperty.call(globalScope.declarations, name)) {
				function returnValue() {
					return value;
				}
				const reified = typeFromValue(value, scope);
				function typeConformancesObject(innerScope: Scope) {
					function witnessTableForConformance(current: ProtocolConformance) {
						const properties = Object.keys(current.functions).map((key) => {
							const scopeName = `${stringified}.${key}`;
							const result = current!.functions[key](innerScope, returnValue, scopeName, 1);
							if (result.kind === "callable") {
								// TODO: Pass real argument count
								const [args, methodBody] = functionize(innerScope, scopeName, (innerMostScope, arg) => result.call(innerMostScope, arg, 0), result.type);
								return objectMethod("method", mangleName(key), args, blockStatement(methodBody));
							} else {
								return objectProperty(mangleName(key), read(result, innerScope));
							}
						});
						for (const key of Object.keys(current.conformances)) {
							properties.push(objectProperty(mangleName(key), witnessTableForConformance(current.conformances[key])));
						}
						return objectExpression(properties);
					}
					return objectExpression(Object.keys(reified.conformances).map((key) => {
						return objectProperty(mangleName(key), witnessTableForConformance(reified.conformances[key]));
					}));
				}
				// Placeholder to avoid infinite recursion in tables that are self-referential
				globalScope.declarations[name] = {
					flags: DeclarationFlags.Const,
					declaration: variableDeclaration("const", [variableDeclarator(mangled)]),
				};
				if (substitutions.length === 0) {
					// Emit direct able
					globalScope.declarations[name] = {
						flags: DeclarationFlags.Const,
						declaration: variableDeclaration("const", [variableDeclarator(mangled, typeConformancesObject(globalScope))]),
					};
				} else {
					// Emit function that returns a table based on parameters
					const typeMapping: TypeMap = Object.create(null);
					const functionized = functionize(globalScope, stringified, (innerScope) => {
						substitutionNames.forEach((key, i) => {
							typeMapping[key] = (innerMostScope) => typeFromValue(substitutions[i], innerMostScope);
							innerScope.mapping[key] = variable(mangleName(key));
						});
						return expr(typeConformancesObject(innerScope));
					}, {
						kind: "function",
						arguments: {
							kind: "tuple",
							types: substitutions.map(() => typeType),
						},
						return: typeType,
						throws: false,
						rethrows: false,
						attributes: [],
					}, typeMapping);
					globalScope.declarations[name] = {
						flags: DeclarationFlags.Const,
						declaration: functionDeclaration(mangled, substitutionNames.map(mangleName), blockStatement(functionized[1])),
					};
				}
			}
			// Emit reference to table
			if (substitutions.length === 0) {
				// Directly as there are no substitutions
				return annotate(mangled, value.location);
			} else {
				// Parameterized by substitutions
				return annotate(callExpression(mangled, substitutions.map((substitution) => read(substitution, scope))), value.location);
			}
		}
		default: {
			throw new TypeError(`Received an unexpected value of type ${(value as Value).kind}`);
		}
	}
}

function ignoreExpression(expression: Expression, scope: Scope): Statement[] {
	outer:
	switch (expression.type) {
		case "Identifier":
			if (expression.name === "undefined") {
				return [];
			}
			break;
		case "SequenceExpression": {
			let body: Statement[] = [];
			for (const ignoredExpression of expression.expressions) {
				if (!isPure(ignoredExpression)) {
					body = concat(body, ignore(expr(ignoredExpression), scope));
				}
			}
			return body;
		}
		case "BinaryExpression": {
			let body: Statement[] = [];
			if (!isPure(expression.left)) {
				body = concat(body, ignore(expr(expression.left), scope));
			}
			if (!isPure(expression.right)) {
				body = concat(body, ignore(expr(expression.right), scope));
			}
			return body;
		}
		case "UnaryExpression": {
			switch (expression.operator) {
				case "!":
				case "+":
				case "-":
				case "~":
				case "typeof":
					if (isPure(expression.argument)) {
						return [];
					} else {
						return ignore(expr(expression.argument), scope);
					}
					break;
				default:
					break;
			}
			break;
		}
		case "ArrayExpression": {
			let body: Statement[] = [];
			for (const ignoredExpression of expression.elements) {
				if (ignoredExpression === null || ignoredExpression.type != null) {
					break outer;
				}
				body = concat(body, ignore(expr(ignoredExpression), scope));
			}
			return body;
		}
		case "ObjectExpression": {
			let body: Statement[] = [];
			for (const prop of expression.properties) {
				if (prop.type !== "ObjectProperty") {
					break outer;
				}
				if (prop.computed && !isPure(prop.key)) {
					body = concat(body, ignore(expr(prop.key), scope));
				}
				if (!isPure(prop.value)) {
					if (isExpression(prop.value)) {
						body = concat(body, ignore(expr(prop.value), scope));
					} else {
						break outer;
					}
				}
			}
			return body;
		}
		case "ConditionalExpression": {
			return [ifStatement(
				expression.test,
				blockStatement(ignoreExpression(expression.consequent, scope)),
				blockStatement(ignoreExpression(expression.alternate, scope)),
			)];
		}
		default:
			if (isLiteral(expression)) {
				return [];
			}
			break;
	}
	return [expressionStatement(expression)];
}

export function ignore(value: Value, scope: Scope): Statement[] {
	const transformed = transform(value, scope, expr);
	switch (transformed.kind) {
		case "statements":
			const parsed = parseStatementsValue(transformed, containsNoReturnStatements);
			if (typeof parsed !== "undefined") {
				if (typeof parsed.value !== "undefined" && !isPure(parsed.value)) {
					return concat(parsed.statements, [expressionStatement(parsed.value)]);
				} else {
					return parsed.statements;
				}
			}
			break;
		case "expression":
			return ignoreExpression(transformed.expression, scope);
		default:
			break;
	}
	return ignoreExpression(read(value, scope), scope);
}

export function transform(value: Value, scope: Scope, callback: (expression: Expression) => Value): Value {
	for (;;) {
		if (value.kind === "tuple" && value.values.length > 1) {
			value = array(value.values, scope, value.location);
		} else if (value.kind === "subscript") {
			value = call(value.getter, value.args, value.types, scope, value.location);
		} else {
			break;
		}
	}
	if (value.kind === "statements") {
		// TODO: Disallow return statements nested inside other statements
		const parsed = parseStatementsValue(value, containsNoReturnStatements);
		if (typeof parsed !== "undefined") {
			const tail = callback(typeof parsed.value !== "undefined" ? parsed.value : undefinedLiteral);
			return statements(concat(
				parsed.statements,
				tail.kind === "statements" ? tail.statements : [returnStatement(simplifyExpression(read(tail, scope)))],
			), tail.location);
		}
	}
	return callback(simplifyExpression(read(value, scope)));
}

export const undefinedLiteral = identifier("undefined");
export const undefinedValue = expr(undefinedLiteral);

export const typeType: Type = { kind: "name", name: "Type" };
export const typeTypeValue = typeValue(typeType);

export function call(target: Value, args: ReadonlyArray<Value>, argTypes: Array<Value | string>, scope: Scope, location?: LocationSource): Value {
	const getter: ArgGetter = (i) => {
		if (i < 0) {
			throw new RangeError(`Asked for a negative argument index`);
		}
		if (i >= args.length) {
			throw new RangeError(`${target.kind === "function" ? target.name : "Callable"} asked for argument ${i + 1}, but only ${args.length} arguments provided`);
		}
		return args[i];
	};
	if (args.length !== argTypes.length) {
		throw new RangeError(`Expected arguments and argument types to have the same length`);
	}
	switch (target.kind) {
		case "function":
			if (target.substitutions.length !== 0) {
				// Type substitutions are passed as prefix arguments
				args = concat(target.substitutions, args);
				argTypes = concat(target.substitutions.map((): Value | string => typeTypeValue), argTypes);
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
				const func = memberExpression(read(target.parentType, scope), mangleName(target.name));
				return call(expr(func, target.location), args, argTypes, scope, location);
			}
			return annotateValue(fn(scope, getter, target.name, args.length), location);
		case "callable":
			// Inlining is responsible for making the codegen even remotely sane
			// return call(expr(read(target, scope)), args, scope, location);
			return annotateValue(target.call(scope, getter, args.length), location);
		default:
			break;
	}
	if (argTypes.length !== args.length) {
		throw new RangeError(`Expected the number argument types to be the same as the number of arguments`);
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

export function isPure(expression: Expression | PatternLike | SpreadElement): boolean {
	switch (expression.type) {
		case "Identifier":
		case "StringLiteral":
		case "BooleanLiteral":
		case "NumericLiteral":
		case "NullLiteral":
		case "RegExpLiteral":
		case "ThisExpression":
			return true;
		case "MemberExpression":
			return isPure(expression.object) && expression.object.type !== "Identifier" && expression.object.type !== "MemberExpression" && expression.object.type !== "ThisExpression" && (!expression.computed || isPure(expression.property));
		case "ArrayExpression":
			for (const element of expression.elements) {
				if (element !== null) {
					if (element.type === "SpreadElement" || !isPure(element)) {
						return false;
					}
				}
			}
			return true;
		case "ObjectExpression":
			for (const prop of expression.properties) {
				if (prop.type !== "ObjectProperty" || !isPure(prop.value) || (prop.computed && !isPure(prop.key))) {
					return false;
				}
			}
			return true;
		default:
			return false;
	}
}

function returnsInt32(expression: Expression): Boolean {
	switch (expression.type) {
		case "UnaryExpression":
			return expression.operator === "~";
		case "BinaryExpression":
			switch (expression.operator) {
				case ">>":
				case "<<":
				case "|":
				case "&":
				case "^":
					return true;
				default:
					return false;
			}
		default:
			return false;
	}
}

function simplifyExpression(expression: Expression): Expression;
function simplifyExpression(expression: Expression | PatternLike): Expression | PatternLike;
function simplifyExpression(expression: Expression | PatternLike | SpreadElement): Expression | PatternLike | SpreadElement;
function simplifyExpression(expression: Expression | PatternLike | SpreadElement): Expression | PatternLike | SpreadElement {
	switch (expression.type) {
		case "ArrayExpression": {
			return annotate(arrayExpression(expression.elements.map((element) => {
				if (element !== null && isExpression(element)) {
					return simplifyExpression(element);
				} else {
					return element;
				}
			})), expression.loc);
		}
		case "ObjectExpression": {
			return annotate(objectExpression(expression.properties.map((prop) => {
				if (prop.type === "ObjectProperty") {
					if (prop.computed) {
						return annotate(objectProperty(simplifyExpression(prop.key), simplifyExpression(prop.value), true), prop.loc);
					} else {
						return annotate(objectProperty(prop.key, simplifyExpression(prop.value)), prop.loc);
					}
				} else {
					return prop;
				}
			})), expression.loc);
		}
		case "ConditionalExpression": {
			const testValue = expressionLiteralValue(expression.test);
			if (typeof testValue !== "undefined") {
				return annotate(simplifyExpression(testValue ? expression.consequent : expression.alternate), expression.loc);
			}
			return annotate(conditionalExpression(simplifyExpression(expression.test), simplifyExpression(expression.consequent), simplifyExpression(expression.alternate)), expression.loc);
		}
		case "LogicalExpression": {
			const left = simplifyExpression(expression.left);
			const leftValue = expressionLiteralValue(left);
			const right = simplifyExpression(expression.right);
			const rightValue = expressionLiteralValue(right);
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
		}
		case "BinaryExpression": {
			const value = expressionLiteralValue(expression);
			if (typeof value !== "undefined") {
				return literal(value, expression.loc).expression;
			}
			if (expression.operator === "|") {
				if (expression.right.type === "NumericLiteral" && expression.right.value === 0 && returnsInt32(expression.left)) {
					return annotate(expression.left, expression.loc);
				}
				if (expression.left.type === "NumericLiteral" && expression.left.value === 0 && returnsInt32(expression.right)) {
					return annotate(expression.right, expression.loc);
				}
			}
			return annotate(binaryExpression(expression.operator, simplifyExpression(expression.left), simplifyExpression(expression.right)), expression.loc);
		}
		case "UnaryExpression": {
			const value = expressionLiteralValue(expression);
			if (typeof value !== "undefined") {
				return literal(value, expression.loc).expression;
			}
			return annotate(unaryExpression(expression.operator, simplifyExpression(expression.argument)), expression.loc);
		}
		case "MemberExpression": {
			const value = expressionLiteralValue(expression);
			if (typeof value !== "undefined") {
				return literal(value, expression.loc).expression;
			}
			if (!expression.computed && expression.property.type === "Identifier") {
				const objectValue = expressionLiteralValue(expression.object);
				if (typeof objectValue === "object" && !Array.isArray(objectValue) && objectValue !== null && Object.hasOwnProperty.call(objectValue, expression.property.name)) {
					const propertyValue = (objectValue as LiteralMap)[expression.property.name];
					if (typeof propertyValue === "boolean" || typeof propertyValue === "number" || typeof propertyValue === "string" || typeof propertyValue === "object") {
						return literal(propertyValue, expression.loc).expression;
					}
				} else {
					return annotate(memberExpression(simplifyExpression(expression.object), expression.property), expression.loc);
				}
			} else if (expression.computed) {
				return annotate(memberExpression(simplifyExpression(expression.object), simplifyExpression(expression.property), true), expression.loc);
			}
			break;
		}
		case "SequenceExpression": {
			const oldExpressions = expression.expressions;
			if (oldExpressions.length === 0) {
				return annotate(undefinedLiteral, expression.loc);
			}
			const newExpressions: Expression[] = [];
			for (let i = 0; i < oldExpressions.length - 1; i++) {
				const simplified = simplifyExpression(oldExpressions[i]);
				if (simplified.type === "SequenceExpression" && isPure(simplified.expressions[simplified.expressions.length - 1])) {
					for (const element of simplified.expressions) {
						if (!isPure(element)) {
							newExpressions.push(element);
						}
					}
				} else if (!isPure(simplified)) {
					newExpressions.push(simplified);
				}
			}
			if (newExpressions.length === 0) {
				return simplifyExpression(oldExpressions[oldExpressions.length - 1]);
			} else {
				newExpressions.push(simplifyExpression(oldExpressions[oldExpressions.length - 1]));
				if (newExpressions.length === 1) {
					return annotate(newExpressions[0], expression.loc);
				}
				return annotate(sequenceExpression(newExpressions), expression.loc);
			}
		}
		default: {
			break;
		}
	}
	return expression;
}

export function expressionLiteralValue(expression: Expression | Node): LiteralValue | undefined {
	switch (expression.type) {
		case "BooleanLiteral":
		case "NumericLiteral":
		case "StringLiteral":
			return expression.value;
		case "NullLiteral":
			return null;
		case "UnaryExpression": {
			const value = expressionLiteralValue(expression.argument);
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
			const left = expressionLiteralValue(expression.left);
			if (typeof left !== "undefined") {
				const right = expressionLiteralValue(expression.right);
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
			const test = expressionLiteralValue(expression.test);
			if (typeof test !== "undefined") {
				return expressionLiteralValue(test ? expression.consequent : expression.alternate);
			}
			break;
		}
		case "SequenceExpression": {
			for (const ignoredExpression of expression.expressions.slice(expression.expressions.length - 1)) {
				if (typeof expressionLiteralValue(ignoredExpression) === "undefined") {
					return undefined;
				}
			}
			return expressionLiteralValue(expression.expressions[expression.expressions.length - 1]);
		}
		case "ArrayExpression": {
			const result: LiteralValue[] = [];
			for (const element of expression.elements) {
				if (element === null || element.type === "SpreadElement") {
					return undefined;
				}
				const elementValue = expressionLiteralValue(element);
				if (typeof elementValue === "undefined") {
					return undefined;
				}
				result.push(elementValue);
			}
			return result;
		}
		case "ObjectExpression": {
			const result: { [name: string]: LiteralValue } = Object.create(null);
			for (const prop of expression.properties) {
				if (prop.type !== "ObjectProperty") {
					return undefined;
				}
				const value = expressionLiteralValue(prop.value);
				if (typeof value === "undefined") {
					return undefined;
				}
				let key: string;
				if (prop.computed) {
					const keyValue = expressionLiteralValue(prop.key);
					if (typeof keyValue !== "string") {
						return undefined;
					}
					key = keyValue;
				} else {
					if (prop.key.type !== "Identifier") {
						return undefined;
					}
					key = prop.key.name;
				}
				result[key] = value;
			}
			return result;
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

export function reuse(value: Value, scope: Scope, uniqueNamePrefix: string, callback: (reusableValue: ExpressionValue | MappedNameValue) => Value): Value {
	if (value.kind === "direct") {
		return callback(value);
	}
	return transform(value, scope, (expression) => {
		if (isPure(expression)) {
			return callback(expr(expression));
		}
		const tempName = uniqueName(scope, uniqueNamePrefix);
		const head = addVariable(scope, tempName, "Any", expr(expression), DeclarationFlags.Const);
		const temp = annotateValue(lookup(tempName, scope), expression.loc);
		const tail = callback(temp);
		if (tail.kind === "statements") {
			return statements(concat([head], tail.statements));
		} else {
			return statements([head, returnStatement(read(tail, scope))]);
		}
	});
}

function passthrough(type: Type) {
	return type;
}

export function stringifyType(type: Type, replacer: (type: Type) => Type = passthrough): string {
	type = replacer(type);
	switch (type.kind) {
		case "optional":
			return stringifyType(type.type, replacer) + "?";
		case "generic":
			if (type.base.kind === "function") {
				return "<" + type.arguments.map((innerType) => stringifyType(type, replacer)).join(", ") + "> " + stringifyType(type.base, replacer);
			} else {
				return stringifyType(type.base, replacer) + "<" + type.arguments.map((innerType) => stringifyType(type, replacer)).join(", ") + ">";
			}
		case "function":
			// TODO: Handle attributes
			return stringifyType(type.arguments, replacer) + (type.throws ? " throws" : "") + (type.rethrows ? " rethrows" : "") + " -> " + stringifyType(type.return, replacer);
		case "tuple":
			return "(" + type.types.map((innerType) => stringifyType(type, replacer)).join(", ") + ")";
		case "array":
			return "[" + stringifyType(type.type, replacer) + "]";
		case "dictionary":
			return "[" + stringifyType(type.keyType, replacer) + ": " + stringifyType(type.valueType, replacer) + "]";
		case "metatype":
			return stringifyType(type.base, replacer) + "." + type.as;
		case "modified":
			return type.modifier + " " + stringifyType(type.type, replacer);
		case "namespaced":
			return stringifyType(type.namespace, replacer) + "." + stringifyType(type.type, replacer);
		case "name":
			return type.name;
		case "constrained":
			return stringifyType(type.type, replacer) + " where " + stringifyType(type.type, replacer) + " : " + stringifyType(type.constraint, replacer);
		default:
			throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
	}
}

function stringifyNode(node: Node): string {
	const result = generate(node, {
		compact: true,
	});
	return result.code;
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

function representationsForTypeValue(type: Value, scope: Scope): Value {
	if (type.kind === "type") {
		return literal(typeFromValue(type, scope).possibleRepresentations);
	} else {
		return member(type, "$rep", scope);
	}
}

export function hasRepresentation(type: Value, representation: PossibleRepresentation | Value, scope: Scope): Value {
	return binary("!==",
		binary("&",
			representationsForTypeValue(type, scope),
			typeof representation === "object" ? representation : literal(representation),
			scope,
		),
		literal(0),
		scope,
	);
}
