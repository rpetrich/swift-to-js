import { parse as parseAST, Property, Term } from "./ast";
import { forceUnwrapFailed, newScopeWithBuiltins, optionalIsSome, unwrapOptional, wrapInOptional } from "./builtins";
import { Declaration, parse as parseDeclaration } from "./declaration";
import { insertFunction, noinline, returnType, wrapped } from "./functions";
import { copyValue, defaultInstantiateType, field, Field, FunctionMap, newClass, PossibleRepresentation, ReifiedType, reifyType, storeValue, struct } from "./reified";
import { addExternalVariable, addVariable, emitScope, lookup, mangleName, newScope, rootScope, Scope, undefinedLiteral, uniqueIdentifier } from "./scope";
import { Function, parse as parseType, Type } from "./types";
import { expectLength } from "./utils";
import { ArgGetter, boxed, call, callable, expr, ExpressionValue, FunctionValue, functionValue, hoistToIdentifier, isNestedOptional, isPure, newPointer, read, reuseExpression, set, statements, stringifyType, subscript, tuple, TupleValue, unbox, undefinedValue, Value, variable, VariableValue } from "./values";

import { transformFromAst } from "babel-core";
import { ArrayExpression, arrayExpression, assignmentExpression, binaryExpression, blockStatement, booleanLiteral, callExpression, classBody, classDeclaration, conditionalExpression, exportNamedDeclaration, exportSpecifier, Expression, expressionStatement, functionDeclaration, functionExpression, identifier, Identifier, IfStatement, ifStatement, isLiteral, logicalExpression, LVal, MemberExpression, memberExpression, newExpression, numericLiteral, objectExpression, objectProperty, ObjectProperty, program, Program, returnStatement, ReturnStatement, sequenceExpression, Statement, stringLiteral, switchCase, SwitchCase, switchStatement, thisExpression, ThisExpression, unaryExpression, variableDeclaration, variableDeclarator, whileStatement } from "babel-types";
import { spawn } from "child_process";
import { readdirSync } from "fs";
import { argv } from "process";

const hasOwnProperty = Object.hasOwnProperty.call.bind(Object.hasOwnProperty);

function concat<T>(head: T[], tail: T[]): T[];
function concat<T>(head: ReadonlyArray<T>, tail: ReadonlyArray<T>): ReadonlyArray<T>;
function concat<T>(head: ReadonlyArray<T>, tail: ReadonlyArray<T>): ReadonlyArray<T> | T[] {
	if (head.length) {
		return tail.length ? head.concat(tail) : head;
	} else {
		return tail;
	}
}

function getField(value: Value, field: Field, scope: Scope) {
	if (field.stored) {
		return expr(memberExpression(read(value, scope), mangleName(field.name)));
	} else {
		return field.getter(value, scope);
	}
}

const emptyStatements: Statement[] = [];

function termsWithName(terms: Term[], name: string): Term[] {
	return terms.filter((term) => term.name === name);
}

function findTermWithName(terms: Term[], name: string | RegExp): Term | undefined {
	if (typeof name === "string") {
		for (const term of terms) {
			if (term.name === name) {
				return term;
			}
		}
	} else {
		for (const term of terms) {
			if (name.test(term.name)) {
				return term;
			}
		}
	}
	return undefined;
}

function termWithName(terms: Term[], name: string | RegExp): Term {
	const result = findTermWithName(terms, name);
	if (typeof result === "undefined") {
		throw new Error(`Could not find ${name} term: ${terms.map((term) => term.name).join(", ")}`);
	}
	return result;
}

function isString(value: any): value is string {
	return typeof value === "string";
}

function getProperty<T extends Property>(term: Term, key: string, checker: (prop: Property) => prop is T): T {
	const props = term.properties;
	if (hasOwnProperty(props, key)) {
		const value = props[key];
		if (checker(value)) {
			return value;
		}
		throw new Error(`Value for ${key} on ${term.name} is of the wrong type: ${JSON.stringify(term.properties)}`);
	}
	throw new Error(`Could not find ${key} in ${term.name}. Keys are ${Object.keys(props).join(", ")}`);
}

function constructTypeFromNames(baseType: string, typeParameters?: ReadonlyArray<string>): Type {
	if (typeof typeParameters === "undefined") {
		return parseType(baseType);
	}
	switch (baseType) {
		case "Optional":
			if (typeParameters.length < 1) {
				throw new TypeError(`Expected at least one type parameter for Optional`);
			}
			return { kind: "optional", type: parseType(typeParameters[0]) };
		case "Tuple":
			return { kind: "tuple", types: typeParameters.map((type) => parseType(type)) };
		case "Array":
			if (typeParameters.length < 1) {
				throw new TypeError(`Expected at least one type parameter for Array`);
			}
			return { kind: "array", type: parseType(typeParameters[0]) };
		case "Dictionary":
			if (typeParameters.length < 2) {
				throw new TypeError(`Expected at least two type parameters for Dictionary`);
			}
			return { kind: "dictionary", keyType: parseType(typeParameters[0]), valueType: parseType(typeParameters[1]) };
		default:
			return { kind: "generic", base: parseType(baseType), arguments: typeParameters.map((type) => parseType(type)) };
	}
}

function extractReference(term: Term, scope: Scope, type?: Function): Value {
	const decl = getProperty(term, "decl", isString);
	const declaration = parseDeclaration(decl);
	if (typeof declaration.local === "string") {
		if (declaration.local === "$match") {
			return variable(identifier("$match"));
		}
		return variable(lookup(declaration.local, scope));
	}
	if (typeof declaration.member === "string") {
		const functionType = typeof declaration.type === "string" ? reifyType(constructTypeFromNames(declaration.type, declaration.substitutions), scope) : undefined;
		if (Object.hasOwnProperty.call(functionType !== undefined ? functionType.functions : scope.functions, declaration.member)) {
			return functionValue(declaration.member, functionType, type || getFunctionType(term));
		}
		return variable(lookup(declaration.member, scope));
	}
	throw new TypeError(`Unable to parse and locate declaration: ${decl} (got ${JSON.stringify(declaration)})`);
}

function getType(term: Term) {
	try {
		return parseType(getProperty(term, "type", isString));
	} catch (e) {
		console.log(term);
		throw e;
	}
}

function getFunctionType(term: Term) {
	const result = getType(term);
	if (result.kind !== "function") {
		throw new TypeError(`Expected a function, got ${stringifyType(result)}`);
	}
	return result;
}

function collapseToExpression(expressions: Expression[]): Expression {
	return expressions.length === 0 ? undefinedLiteral : expressions.length === 1 ? expressions[0] : sequenceExpression(expressions);
}

function noSemanticExpressions(term: Term) {
	return term.name !== "semantic_expr";
}

function requiresGetter(term: Term): boolean {
	if (Object.hasOwnProperty.call(term.properties, "storage_kind")) {
		return getProperty(term, "storage_kind", isString) === "computed";
	}
	return getProperty(term, "readImpl", isString) !== "stored";
}

function returnUndef() {
	return undefined;
}

interface PatternOutput {
	prefix: Statement[];
	value: Value;
}

const trueValue = expr(booleanLiteral(true));

const emptyPattern: PatternOutput = {
	prefix: [],
	value: trueValue,
};

function mergePatterns(first: PatternOutput, second: PatternOutput, scope: Scope): PatternOutput {
	const firstExpression = read(first.value, scope);
	const prefix = first.prefix.concat(second.prefix);
	if (firstExpression.type === "BooleanLiteral" && firstExpression.value === true) {
		return {
			prefix,
			value: second.value,
		};
	}
	const secondExpression = read(second.value, scope);
	if (secondExpression.type === "BooleanLiteral" && secondExpression.value === true) {
		return {
			prefix,
			value: expr(firstExpression),
		};
	}
	return {
		prefix,
		value: expr(logicalExpression("&&", firstExpression, secondExpression)),
	};
}

export function convertToPattern(value: Value): PatternOutput {
	let prefix: Statement[] = [];
	if (value.kind === "statements") {
		const returningIndex = value.statements.findIndex((statements) => statements.type === "ReturnStatement");
		if (returningIndex === value.statements.length - 1) {
			prefix = value.statements.slice(0, value.statements.length - 1);
			value = expr((value.statements[value.statements.length - 1] as ReturnStatement).argument);
		}
	}
	return {
		prefix,
		value,
	};
}

function translatePattern(term: Term, value: Value, scope: Scope): PatternOutput {
	switch (term.name) {
		case "pattern_optional_some": // Development
		case "optional_some_element": { // Swift 4.1
			expectLength(term.children, 1);
			const type = getType(term);
			const [first, second] = reuseExpression(read(value, scope), scope);
			const assign = translatePattern(term.children[0], unwrapOptional(expr(first), type, scope), scope);
			return mergePatterns(assign, {
				prefix: [],
				value: expr(optionalIsSome(second, type)),
			}, scope);
		}
		case "case_label_item":
		case "pattern_let": {
			expectLength(term.children, 1);
			return translatePattern(term.children[0], value, scope);
		}
		case "pattern_expr": {
			expectLength(term.children, 1);
			return {
				prefix: [],
				value: translateTermToValue(term.children[0], scope),
			};
		}
		case "pattern_typed": {
			expectLength(term.children, 2);
			return translatePattern(term.children[0], value, scope);
		}
		case "pattern_named": {
			expectLength(term.children, 0);
			expectLength(term.args, 1);
			const name = mangleName(term.args[0]);
			const type = getType(term);
			if (Object.hasOwnProperty.call(scope.declarations, name)) {
				return {
					prefix: storeValue(name, value, type, scope).map((expression) => expressionStatement(expression)),
					value: trueValue,
				};
			} else {
				addVariable(scope, name);
				const pattern = convertToPattern(value);
				return {
					prefix: pattern.prefix.concat([expressionStatement(assignmentExpression("=", name, read(copyValue(pattern.value, type, scope), scope)))]),
					value: trueValue,
				};
			}
		}
		case "pattern_tuple": {
			const type = getType(term);
			if (type.kind !== "tuple") {
				throw new TypeError(`Expected a tuple, got a ${stringifyType(type)}`);
			}
			const [first, second] = reuseExpression(read(value, scope), scope);
			let prefix: Statement[] = [];
			return term.children.reduce((existing, child, i) => {
				const childPattern = translatePattern(child, expr(memberExpression(i ? second : first, numericLiteral(i), true)), scope);
				return mergePatterns(existing, childPattern, scope);
			}, emptyPattern);
		}
		case "pattern_any": {
			return emptyPattern;
		}
		default: {
			console.log(term);
			return {
				prefix: [],
				value: expr(identifier("unknown_pattern_type$" + term.name)),
			};
		}
	}
}

function translateExpression(term: Term, scope: Scope): Expression {
	return read(translateTermToValue(term, scope), scope);
}

function valueForPattern(pattern: PatternOutput, scope: Scope): Value {
	if (pattern.prefix.length) {
		return statements(pattern.prefix.concat([returnStatement(read(pattern.value, scope))]));
	}
	return pattern.value;
}

function translateTermToValue(term: Term, scope: Scope): Value {
	switch (term.name) {
		case "member_ref_expr": {
			expectLength(term.children, 1);
			const child = term.children[0];
			const type = getType(child);
			const decl = getProperty(term, "decl", isString);
			const { member } = parseDeclaration(decl);
			if (typeof member !== "string") {
				throw new TypeError(`Expected a member expression when parsing declaration: ${decl}`);
			}
			for (const field of reifyType(type, scope).fields) {
				if (field.name === member) {
					return getField(translateTermToValue(term.children[0], scope), field, scope);
				}
			}
			throw new TypeError(`Could not find ${member} in ${stringifyType(type)}`);
		}
		case "tuple_element_expr": {
			expectLength(term.children, 1);
			const child = term.children[0];
			const tupleType = getType(child);
			if (tupleType.kind !== "tuple") {
				throw new TypeError(`Expected a tuple, got a ${stringifyType(tupleType)}`);
			}
			if (tupleType.types.length === 1) {
				return translateTermToValue(child, scope);
			}
			return variable(memberExpression(
				translateExpression(child, scope),
				numericLiteral(+getProperty(term, "field", isString)),
				true,
			));
		}
		case "pattern_typed": {
			expectLength(term.children, 2);
			return translateTermToValue(term.children[0], scope);
		}
		case "declref_expr": {
			expectLength(term.children, 0);
			return extractReference(term, scope);
		}
		case "subscript_expr": {
			expectLength(term.children, 2);
			const type = getType(term);
			const getterType: Function = {
				kind: "function",
				arguments: {
					kind: "tuple",
					types: term.children.map(getType),
					location: type.location,
				},
				return: type,
				throws: false,
				rethrows: false,
				attributes: [],
				location: type.location,
			};
			const getter = extractReference(term, scope, getterType);
			// TODO: Define the setter type
			const setterType: Function = {
				kind: "function",
				arguments: {
					kind: "tuple",
					types: term.children.map(getType),
					location: type.location,
				},
				return: type,
				throws: false,
				rethrows: false,
				attributes: [],
				location: type.location,
			};
			const setter = extractReference(term, scope, setterType);
			return subscript(getter, setter, term.children.map((child) => translateTermToValue(child, scope)));
		}
		case "prefix_unary_expr":
		case "call_expr":
		case "constructor_ref_call_expr":
		case "dot_syntax_call_expr":
		case "binary_expr": {
			expectLength(term.children, 2);
			const target = term.children[0];
			const args = term.children[1];
			const peekedTarget = translateTermToValue(target, scope);
			const type = getType(args);
			const argsValue = type.kind === "tuple" && type.types.length !== 1 ? translateTermToValue(args, scope) : tuple([translateTermToValue(args, scope)]);
			if (argsValue.kind === "tuple") {
				return call(peekedTarget, undefinedValue, argsValue.values, scope);
			} else {
				return call(expr(memberExpression(read(peekedTarget, scope), identifier("apply"))), undefinedValue, [expr(undefinedLiteral) as Value].concat(argsValue), scope);
			}
		}
		case "tuple_expr": {
			if (term.children.length === 1) {
				return translateTermToValue(term.children[0], scope);
			}
			return {
				kind: "tuple",
				values: term.children.map((child) => translateTermToValue(child, scope)),
			};
		}
		case "type_expr": {
			expectLength(term.children, 0);
			return expr(mangleName(getProperty(term, "type", isString)));
		}
		case "boolean_literal_expr": {
			expectLength(term.children, 0);
			return expr(booleanLiteral(getProperty(term, "value", isString) === "true"));
		}
		case "integer_literal_expr": {
			expectLength(term.children, 0);
			return expr(numericLiteral(+getProperty(term, "value", isString)));
		}
		case "string_literal_expr": {
			expectLength(term.children, 0);
			return expr(stringLiteral(getProperty(term, "value", isString)));
		}
		case "array_expr": {
			const type = getType(term);
			if (type.kind !== "array") {
				throw new TypeError(`Expected an array type, got a ${stringifyType(type)}`);
			}
			return expr(arrayExpression(term.children.filter(noSemanticExpressions).map((child) => translateExpression(child, scope))));
		}
		case "dictionary_expr": {
			const type = getType(term);
			if (type.kind !== "dictionary") {
				throw new TypeError(`Expected a dictionary type, got a ${stringifyType(type)}`);
			}
			reifyType(type, scope);
			const properties: ObjectProperty[] = [];
			for (const child of term.children.filter(noSemanticExpressions)) {
				if (child.name !== "tuple_expr") {
					throw new TypeError(`Expected a tuple_expr, got a ${child.name}`);
				}
				expectLength(child.children, 2);
				properties.push(objectProperty(translateExpression(child.children[0], scope), translateExpression(child.children[1], scope), true));
			}
			return expr(objectExpression(properties));
		}
		case "paren_expr": {
			expectLength(term.children, 1);
			return translateTermToValue(term.children[0], scope);
		}
		case "if_expr": {
			expectLength(term.children, 3);
			return expr(conditionalExpression(
				translateExpression(term.children[0], scope),
				translateExpression(term.children[1], scope),
				translateExpression(term.children[2], scope),
			));
		}
		case "inject_into_optional": {
			expectLength(term.children, 1);
			return wrapInOptional(translateTermToValue(term.children[0], scope), getType(term), scope);
		}
		case "function_conversion_expr": {
			expectLength(term.children, 1);
			return translateTermToValue(term.children[0], scope);
		}
		case "load_expr": {
			expectLength(term.children, 1);
			return unbox(translateTermToValue(term.children[0], scope), scope);
		}
		case "assign_expr": {
			expectLength(term.children, 2);
			const type = getType(term.children[0]);
			const dest = translateTermToValue(term.children[0], scope);
			const source = translateTermToValue(term.children[1], scope);
			return set(dest, source, scope);
		}
		case "inout_expr": {
			expectLength(term.children, 1);
			return boxed(translateTermToValue(term.children[0], scope));
		}
		case "pattern": {
			expectLength(term.children, 2);
			return valueForPattern(translatePattern(term.children[0], translateTermToValue(term.children[1], scope), scope), scope);
		}
		case "closure_expr":
		case "autoclosure_expr": {
			expectLength(term.children, 2);
			const parameterList = termWithName(term.children, "parameter_list");
			return callable((innerScope, arg) => {
				const childScope = newScope("anonymous", innerScope);
				termsWithName(parameterList.children, "parameter").forEach((param, index) => {
					const name = param.args[0];
					childScope.mapping[name] = hoistToIdentifier(read(arg(index, name), childScope), childScope, name);
				});
				return translateTermToValue(term.children[1], childScope);
			}, getType(term));
		}
		case "tuple_shuffle_expr": {
			const elements = getProperty(term, "elements", Array.isArray);
			const variadicSources = getProperty(term, "variadic_sources", Array.isArray).slice();
			expectLength(term.children, variadicSources.length);
			const type = getType(term);
			if (type.kind !== "tuple") {
				throw new Error(`Expected a tuple type, got ${stringifyType(type)}`);
			}
			const valueTypes = type.types.slice();
			return tuple(elements.map((source) => {
				switch (parseInt(source, 10)) {
					case -1: { // DefaultInitialize
						if (valueTypes.length) {
							return defaultInstantiateType(valueTypes.shift()!, scope, returnUndef);
						} else {
							throw new Error(`Tried to default instantiate more types than we have in the tuple`);
						}
					}
					case -2: { // Variadic
						valueTypes.shift();
						if (variadicSources.length === 0) {
							throw new Error(`Used more variadic sources than we have`);
						}
						const index = parseInt(variadicSources.shift(), 10);
						if (Number.isNaN(index) || index < 0 || index >= term.children.length) {
							throw new Error(`Invalid variadic index`);
						}
						return translateTermToValue(term.children[index], scope);
					}
					case -3: // CallerDefaultInitialize
					default: {
						throw new Error(`Unknown variadic element type ${source}`);
					}
				}
			}));
		}
		case "force_value_expr": {
			expectLength(term.children, 1);
			const value = translateTermToValue(term.children[0], scope);
			const [first, after] = reuseExpression(read(value, scope), scope);
			// TODO: Optimize some cases where we can prove it to be a .some
			const type = getType(term.children[0]);
			return expr(conditionalExpression(
				optionalIsSome(first, type),
				read(unwrapOptional(expr(after), type, scope), scope),
				read(call(forceUnwrapFailed, undefinedValue, [], scope), scope),
			));
		}
		case "erasure_expr": {
			// TODO: Support runtime Any type that can be inspected
			return translateTermToValue(term.children[0], scope);
		}
		default: {
			console.log(term);
			return variable(identifier("unknown_term_type$" + term.name));
		}
	}
}

function translateAllStatements(terms: Term[], scope: Scope, functions: FunctionMap): Statement[] {
	return terms.reduce((statements: Statement[], term: Term) => {
		return concat(statements, translateStatement(term, scope, functions));
	}, emptyStatements);
}

function translateStatement(term: Term, scope: Scope, functions: FunctionMap): Statement[] {
	switch (term.name) {
		case "source_file": {
			return translateAllStatements(term.children, scope, functions);
		}
		case "accessor_decl":
			if (Object.hasOwnProperty.call(term.properties, "materializeForSet_for")) {
				return emptyStatements;
			}
		case "constructor_decl":
		case "func_decl": {
			const isConstructor = term.name === "constructor_decl";
			expectLength(term.args, 1);
			const name = term.args[0];

			function constructCallable(parameterList: Term[], remainingLists: Term[][], functionType: Type, initialScope?: Scope): (scope: Scope, arg: ArgGetter) => Value {
				return (targetScope: Scope, arg: ArgGetter) => {
					const childScope = typeof initialScope !== "undefined" ? initialScope : newScope(name, targetScope);
					termsWithName(parameterList, "parameter").forEach((param, index) => {
						expectLength(param.args, 1);
						const parameterName = param.args[0];
						targetScope.mapping[parameterName] = hoistToIdentifier(read(arg(index, parameterName), childScope), childScope, parameterName);
					});
					if (remainingLists.length) {
						return callable(constructCallable(remainingLists[0], remainingLists.slice(1), returnType(functionType), initialScope), functionType);
					}
					const brace = findTermWithName(term.children, "brace_stmt");
					if (brace) {
						const body = termWithName(term.children, "brace_stmt").children.slice();
						if (isConstructor) {
							const typeOfResult = returnType(returnType(getType(term)));
							const selfMapping = childScope.mapping.self = uniqueIdentifier(childScope, "self");
							const defaultInstantiation = defaultInstantiateType(typeOfResult, scope, (fieldName) => {
								if (body.length && body[0].name === "assign_expr") {
									const children = body[0].children;
									expectLength(children, 2);
									if (children[0].name === "member_ref_expr") {
										if (parseDeclaration(getProperty(children[0], "decl", isString)).member === fieldName) {
											body.shift();
											return translateExpression(children[1], childScope);
										}
									}
								}
								return undefined;
							});
							if (body.length === 1 && body[0].name === "return_stmt" && body[0].properties.implicit) {
								return statements(emitScope(childScope, [returnStatement(read(defaultInstantiation, scope))]));
							}
							addVariable(childScope, selfMapping, read(defaultInstantiation, scope));
						}
						return statements(emitScope(childScope, translateAllStatements(body, childScope, functions)));
					} else {
						if (isConstructor) {
							const typeOfResult = returnType(returnType(getType(term)));
							const selfMapping = childScope.mapping.self = uniqueIdentifier(childScope, "self");
							const defaultInstantiation = defaultInstantiateType(typeOfResult, scope, () => undefined);
							return statements(emitScope(childScope, [returnStatement(read(defaultInstantiation, scope))]));
						} else {
							return statements([]);
						}
					}
				};
			}

			// Workaround differences in AST between swift 4.1 and development
			const parameters = termsWithName(term.children, "parameter");
			const parameterLists = concat(parameters.length ? [parameters] : [], termsWithName(term.children, "parameter_list").map((paramList) => paramList.children));
			if (parameterLists.length === 0) {
				throw new Error(`Expected a parameter list for a function declaration`);
			}

			const fn = constructCallable(parameterLists[0], parameterLists.slice(1), getType(term));
			if (/^anonname=/.test(name)) {
				scope.functions[name] = fn;
			} else if (!isConstructor && term.properties.access === "public") {
				functions[name] = noinline(fn);
				insertFunction(name, scope, getFunctionType(term), fn, true);
			} else {
				functions[name] = isConstructor ? fn : noinline(fn);
			}
			return emptyStatements;
		}
		case "return_stmt": {
			expectLength(term.children, 0, 1);
			if (term.children.length) {
				const value = translateTermToValue(term.children[0], scope);
				if (value.kind === "statements") {
					return value.statements;
				}
				const copied = copyValue(value, getType(term.children[0]), scope);
				return [returnStatement(read(copied, scope))];
			} else if (term.properties.implicit) {
				return [returnStatement(lookup("self", scope))];
			} else {
				return [returnStatement()];
			}
		}
		case "top_level_code_decl": {
			return translateAllStatements(term.children, scope, functions);
		}
		case "var_decl": {
			expectLength(term.children, 0);
			const name = mangleName(term.args[0]);
			if (Object.hasOwnProperty.call(scope.declarations, name.name)) {
				if (term.properties.access === "public") {
					scope.declarations[name.name] = exportNamedDeclaration(scope.declarations[name.name], []);
				}
			} else {
				const defaultInstantiation = read(defaultInstantiateType(getType(term), scope, returnUndef), scope);
				if (term.properties.access === "public") {
					addExternalVariable(scope, name, defaultInstantiation);
				} else {
					addVariable(scope, name, defaultInstantiation);
				}
			}
			return emptyStatements;
		}
		case "brace_stmt": {
			return translateAllStatements(term.children, scope, functions);
		}
		case "if_stmt": {
			const children = term.children;
			if (children.length === 3) {
				return [ifStatement(translateExpression(children[0], scope), blockStatement(translateStatement(children[1], scope, functions)), blockStatement(translateStatement(children[2], scope, functions)))];
			}
			if (children.length === 2) {
				return [ifStatement(translateExpression(children[0], scope), blockStatement(translateStatement(children[1], scope, functions)))];
			}
			throw new Error(`Expected 2 or 3 terms, got ${children.length}`);
		}
		case "while_stmt": {
			expectLength(term.children, 2);
			return [whileStatement(translateExpression(term.children[0], scope), blockStatement(translateStatement(term.children[1], scope, functions)))];
		}
		case "switch_stmt": {
			if (term.children.length < 1) {
				throw new Error(`Expected at least one term, got ${term.children.length}`);
			}
			const declaration = variableDeclaration("var", [variableDeclarator(identifier("$match"), translateExpression(term.children[0], scope))]);
			const cases = term.children.slice(1).reduceRight((previous: Statement | undefined, childTerm: Term): Statement => {
				if (childTerm.name !== "case_stmt") {
					throw new Error(`Expected a case_stmt, got a ${childTerm.name}`);
				}
				if (childTerm.children.length < 1) {
					throw new Error(`Expected at least one term, got ${childTerm.children.length}`);
				}
				const remainingChildren = childTerm.children.slice(0, childTerm.children.length - 1);
				const patterns = remainingChildren.map((child) => translatePattern(child, expr(identifier("$match")), scope));
				const expressions = patterns.map((pattern) => read(valueForPattern(pattern, scope), scope));
				const predicate = expressions.reduce((left, right) => logicalExpression("||", left, right));
				const body = blockStatement(translateStatement(childTerm.children[childTerm.children.length - 1], scope, functions));
				// Basic optimization for else case in switch statement
				if (typeof previous === "undefined" && predicate.type === "BooleanLiteral" && predicate.value === true) {
					return body;
				}
				return ifStatement(predicate, body, previous);
			}, undefined);
			return typeof cases !== "undefined" ? [declaration, cases] : [declaration];
		}
		case "enum_decl": {
			console.log(term);
			expectLength(term.args, 1);
			if (getProperty(term, "inherits", isString) !== "Int") {
				throw new TypeError(`Only Int enums are supported!`);
			}
			const members: FunctionMap = {};
			termsWithName(term.children, "enum_case_decl").forEach((caseDecl, index) => {
				const elementDecl = termWithName(caseDecl.children, "enum_element_decl");
				expectLength(elementDecl.args, 1);
				// TODO: Extract the actual rawValue and use this as the discriminator
				members[elementDecl.args[0]] = () => expr(numericLiteral(index));
			});
			scope.types[term.args[0]] = () => {
				return {
					fields: [
						field("rawValue", reifyType("Int", scope), (value) => value),
					],
					functions: members,
					possibleRepresentations: PossibleRepresentation.Number,
					defaultValue() {
						throw new Error(`Unable to default instantiate enums`);
					},
					innerTypes: {},
				};
			};
			return emptyStatements;
		}
		case "struct_decl": {
			expectLength(term.args, 1);
			let statements: Statement[] = [];
			const layout: Field[] = [];
			const methods: FunctionMap = {};
			for (const child of term.children) {
				if (child.name === "var_decl") {
					expectLength(child.args, 1);
					if (requiresGetter(child)) {
						expectLength(child.children, 1);
						layout.push(field(child.args[0], reifyType(getType(child), scope), (value: Value, innerScope: Scope) => {
							const declaration = findTermWithName(child.children, "func_decl") || termWithName(child.children, "accessor_decl");
							return call(call(functionValue(declaration.args[0], undefined, getFunctionType(declaration)), undefinedValue, [value], innerScope), undefinedValue, [], innerScope);
						}));
						statements = concat(statements, translateStatement(child.children[0], scope, methods));
					} else {
						layout.push(field(child.args[0], reifyType(getType(child), scope)));
					}
				} else {
					statements = concat(statements, translateStatement(child, scope, methods));
				}
			}
			scope.types[term.args[0]] = () => struct(layout, methods);
			return statements;
		}
		case "pattern_binding_decl": {
			if (term.children.length === 2) {
				const value = translateTermToValue(term.children[1], scope);
				const pattern = translatePattern(term.children[0], value, scope);
				const expression = read(pattern.value, scope);
				if (isPure(expression)) {
					return pattern.prefix;
				} else {
					return pattern.prefix.concat([expressionStatement(expression)]);
				}
			}
			if (term.children.length === 1) {
				return emptyStatements;
			}
			throw new Error(`Expected 1 or 2 terms, got ${term.children.length}`);
		}
		case "class_decl": {
			expectLength(term.args, 1);
			const layout: Field[] = [];
			const methods: FunctionMap = {};
			for (const child of term.children) {
				if (child.name === "var_decl") {
					expectLength(child.args, 1);
					if (requiresGetter(child)) {
						// TODO: Implement getters/setters
						layout.push(field(child.args[0], reifyType(getType(child), scope)));
						// expectLength(child.children, 1);
						// layout.push(structField(child.args[0], getType(child), (value: Value, innerScope: Scope) => {
						// 	const declaration = findTermWithName(child.children, "func_decl") || termWithName(child.children, "accessor_decl");
						// 	return call(call(functionValue(declaration.args[0], getType(declaration)), undefinedValue, [value], innerScope), undefinedValue, [], innerScope);
						// }));
					} else {
						layout.push(field(child.args[0], reifyType(getType(child), scope)));
					}
				}
			}
			scope.types[term.args[0]] = () => newClass(layout, methods);
			// TODO: Fill in body
			return [classDeclaration(mangleName(term.args[0]), undefined, classBody([]), [])];
		}
		default: {
			return [expressionStatement(translateExpression(term, scope))];
		}
	}
}

export function compileTermToProgram(root: Term): Program {
	const programScope = newScopeWithBuiltins();
	return program(emitScope(programScope, translateStatement(root, programScope, programScope.functions)));
}

function readAsString(stream: NodeJS.ReadableStream): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		stream.setEncoding("utf8");
		stream.resume();
		const input: any[] = [];
		stream.on("data", (chunk) => input.push(chunk));
		stream.on("end", () => resolve(input.join("")));
		stream.on("error", reject);
	});
}

const swiftPath: string = (() => {
	try {
		// Search toolchains
		let hasLatest: boolean = false;
		const developmentToolchains: string[] = [];
		for (const subpath of readdirSync("/Library/Developer/Toolchains/")) {
			if (/^swift-DEVELOPMENT-SNAPSHOT-.*\.xctoolchain$/.test(subpath)) {
				developmentToolchains.push(`/Library/Developer/Toolchains/${subpath}/usr/bin/swiftc`);
			} else if (subpath === "swift-latest.xctoolchain") {
				hasLatest = true;
			}
		}
		// Attempt to use the latest development toolchain
		if (developmentToolchains.length) {
			developmentToolchains.sort();
			return developmentToolchains[developmentToolchains.length - 1];
		}
		// Or the latest symlink
		if (hasLatest) {
			return "/Library/Developer/Toolchains/swift-latest.xctoolchain/usr/bin/swiftc";
		}
		// Or whatever the installed Xcode version has
		return "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc";
	} catch (e) {
		// Or the swiftc in the user's path
		return "swiftc";
	}
})();

export interface CompilerOutput {
	code: string | undefined;
	ast: string;
}

export async function compile(path: string): Promise<CompilerOutput> {
	const process = spawn(swiftPath, ["-dump-ast", "--", path]);
	const stdout = readAsString(process.stdout);
	const stderr = readAsString(process.stderr);
	await new Promise((resolve, reject) => {
		process.on("exit", async (code, signal) => {
			if (code !== 0) {
				const lines = (await stderr).split(/\r\n|\r|\n/g);
				const bracketIndex = lines.findIndex((line) => /^\(/.test(line));
				const filteredLines = bracketIndex !== -1 ? lines.slice(0, bracketIndex) : lines;
				reject(new Error(filteredLines.join("\n")));
			} else {
				resolve();
			}
		});
	});
	const ast = await stderr;
	// console.log(ast);
	const rootTerm = parseAST(ast);
	await stdout;
	const program = compileTermToProgram(rootTerm);
	return { code: transformFromAst(program).code, ast };
}

if (require.main === module) {
	compile(argv[argv.length - 1]).then((result) => console.log(result.code)).catch((e) => {
		// console.error(e instanceof Error ? e.message : e);
		console.error(e);
		process.exit(1);
	});
}
