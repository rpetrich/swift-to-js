import { Property, Term } from "./ast";
import { emptyOptional, forceUnwrapFailed, newScopeWithBuiltins, optionalIsSome, unwrapOptional, wrapInOptional } from "./builtins";
import { functionize, insertFunction, noinline, returnType, statementsInValue, wrapped, FunctionBuilder } from "./functions";
import { parseAST, parseDeclaration, parseType } from "./parse";
import { defaultInstantiateType, expressionSkipsCopy, field, getField, newClass, primitive, reifyType, store, struct, EnumCase, Field, FunctionMap, PossibleRepresentation, ProtocolConformanceMap, ReifiedType, TypeMap } from "./reified";
import { addVariable, emitScope, lookup, mangleName, newScope, uniqueName, DeclarationFlags, MappedNameValue, Scope } from "./scope";
import { Function, Type } from "./types";
import { camelCase, concat, expectLength, lookupForMap } from "./utils";
import { annotate, annotateValue, array, binary, boxed, call, callable, conditional, conformance, copy, expr, expressionLiteralValue, functionValue, ignore, isPure, literal, locationForTerm, logical, member, read, reuse, set, statements, stringifyType, stringifyValue, subscript, tuple, typeFromValue, typeValue, unary, undefinedLiteral, undefinedValue, variable, ArgGetter, Value } from "./values";

import { transformFromAst } from "babel-core";
import { blockStatement, catchClause, classBody, classDeclaration, classMethod, doWhileStatement, exportNamedDeclaration, forOfStatement, identifier, ifStatement, isIdentifier, logicalExpression, newExpression, objectExpression, objectProperty, program, returnStatement, sequenceExpression, templateElement, templateLiteral, thisExpression, throwStatement, tryStatement, variableDeclaration, variableDeclarator, whileStatement, ClassMethod, ClassProperty, Expression, Identifier, ObjectProperty, Program, ReturnStatement, Statement, TemplateElement, ThisExpression } from "babel-types";
import { spawn } from "child_process";
import { readdirSync } from "fs";
import { argv } from "process";

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

function checkTermName(term: Term, expectedName: string, errorPrefix?: string) {
	if (term.name !== expectedName) {
		throw new TypeError(`Expected a ${expectedName}${typeof errorPrefix !== "undefined" ? " " + errorPrefix : ""}, got a ${term.name}`);
	}
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function getProperty<T extends Property>(term: Term, key: string, checker: (prop: Property) => prop is T): T {
	const props = term.properties;
	if (Object.hasOwnProperty.call(props, key)) {
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
			return variable(identifier("$match"), term);
		}
		return annotateValue(lookup(declaration.local, scope), term);
	}
	if (typeof declaration.member === "string") {
		let parentType: Value | undefined;
		if (typeof declaration.type === "string") {
			parentType = typeValue(constructTypeFromNames(declaration.type, typeof declaration.substitutions !== "undefined" ? declaration.substitutions.map((sub) => sub.to) : undefined));
		} else if (!Object.hasOwnProperty.call(scope.functions, declaration.member)) {
			return annotateValue(lookup(declaration.member, scope), term);
		}
		let substitutionValues: Value[];
		if (typeof declaration.substitutions !== "undefined") {
			substitutionValues = declaration.substitutions.map((substitution) => {
				let result: Value = typeValue(parseType(substitution.to));
				if (typeof declaration.signature !== "undefined") {
					for (const element of declaration.signature.slice().reverse()) {
						if (typeof element !== "undefined" && element.name === substitution.from && typeof element.protocol !== "undefined") {
							result = conformance(result, element.protocol, scope);
						}
					}
				}
				return result;
			});
		} else {
			substitutionValues = [];
		}
		return functionValue(declaration.member, parentType, type || getFunctionType(term), substitutionValues, term);
	}
	throw new TypeError(`Unable to parse and locate declaration: ${decl} (got ${JSON.stringify(declaration)})`);
}

function getType(term: Term) {
	try {
		return parseType(getProperty(term, "type", isString));
	} catch (e) {
		console.error(term);
		throw e;
	}
}

function getTypeValue(term: Term) {
	return typeValue(getType(term), term);
}

function findFunctionType(type: Type): Function {
	switch (type.kind) {
		case "generic":
			return findFunctionType(type.base);
		case "function":
			return type;
		default:
			throw new TypeError(`Expected a function, got ${stringifyType(type)}`);
	}
}

function getFunctionType(term: Term) {
	return findFunctionType(getType(term));
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

function returnUndef(): undefined {
	return undefined;
}

interface PatternOutput {
	prefix: Statement[];
	test: Value;
	next?: PatternOutput;
}

const trueValue = literal(true);

function isTrueExpression(expression: Expression) {
	return expression.type === "BooleanLiteral" && expression.value;
}

const emptyPattern: PatternOutput = {
	prefix: emptyStatements,
	test: trueValue,
};

function mergeDeclarationStatements(body: Statement[]) {
	let result = body;
	let i = body.length - 1;
	if (i >= 0) {
		while (i--) {
			const current = body[i];
			const previous = body[i + 1];
			if (current.type === "VariableDeclaration" && previous.type === "VariableDeclaration" && current.kind === previous.kind) {
				if (result === body) {
					result = body.slice();
				}
				result.splice(i, 2, variableDeclaration(current.kind, concat(current.declarations, previous.declarations)));
			}
		}
	}
	return result;
}

function mergePatterns(first: PatternOutput, second: PatternOutput, scope: Scope, term: Term): PatternOutput {
	const prefix = mergeDeclarationStatements(concat(first.prefix, second.prefix));
	const next = first.next ? (second.next ? mergePatterns(first.next, second.next, scope, term) : first.next) : second.next;
	const firstExpression = read(first.test, scope);
	if (isTrueExpression(firstExpression)) {
		return {
			prefix,
			test: second.test,
			next,
		};
	}
	const secondExpression = read(second.test, scope);
	if (isTrueExpression(secondExpression)) {
		return {
			prefix,
			test: expr(firstExpression, first.test.location),
			next,
		};
	}
	return {
		prefix,
		test: logical("&&", expr(firstExpression), expr(secondExpression), scope, term),
		next,
	};
}

export function convertToPattern(value: Value): PatternOutput {
	if (value.kind === "copied") {
		const inner = convertToPattern(value.value);
		return {
			prefix: inner.prefix,
			test: copy(inner.test, value.type),
		};
	}
	let prefix: Statement[] = emptyStatements;
	if (value.kind === "statements") {
		const returningIndex = value.statements.findIndex((statement) => statement.type === "ReturnStatement");
		if (returningIndex === value.statements.length - 1) {
			prefix = value.statements.slice(0, value.statements.length - 1);
			value = expr((value.statements[value.statements.length - 1] as ReturnStatement).argument, value.location);
		} else if (returningIndex === -1) {
			prefix = value.statements;
			value = expr(identifier("undefined"), value.location);
		}
	}
	return {
		prefix,
		test: value,
	};
}

function discriminantForPatternTerm(term: Term): string {
	for (const key of Object.keys(term.properties)) {
		if (term.properties[key] === true) {
			const match = key.match(/\.(.+?)$/);
			if (match) {
				return match[1];
			}
		}
	}
	throw new Error(`Expected to have a discriminant property!`);
}

function unwrapCopies(value: Value): Value {
	while (value.kind === "copied") {
		value = value.value;
	}
	return value;
}

function translatePattern(term: Term, value: Value, scope: Scope, declarationFlags: DeclarationFlags = DeclarationFlags.None): PatternOutput {
	switch (term.name) {
		case "pattern_optional_some": {
			expectLength(term.children, 1);
			const type = getTypeValue(term.children[0]);
			let next: PatternOutput | undefined;
			const test = reuse(value, scope, "optional", (reusableValue) => {
				next = translatePattern(term.children[0], unwrapOptional(reusableValue, type, scope), scope, declarationFlags);
				return annotateValue(optionalIsSome(reusableValue, type, scope), term);
			});
			return {
				prefix: emptyStatements,
				test,
				next,
			};
		}
		case "case_label_item": {
			expectLength(term.children, 1);
			return translatePattern(term.children[0], value, scope, declarationFlags);
		}
		case "pattern_let": {
			expectLength(term.children, 1);
			// TODO: Figure out how to avoid the copy here since it should only be necessary on var patterns
			return translatePattern(term.children[0], copy(value, getTypeValue(term)), scope, declarationFlags | DeclarationFlags.Const);
		}
		case "pattern_var": {
			expectLength(term.children, 1);
			return translatePattern(term.children[0], copy(value, getTypeValue(term)), scope, declarationFlags & ~DeclarationFlags.Const);
		}
		case "pattern_expr": {
			expectLength(term.children, 1);
			return {
				prefix: emptyStatements,
				test: translateTermToValue(term.children[0], scope),
			};
		}
		case "pattern_typed": {
			expectLength(term.children, 2);
			return translatePattern(term.children[0], value, scope, declarationFlags);
		}
		case "pattern_named": {
			expectLength(term.children, 0);
			expectLength(term.args, 1);
			const name = term.args[0];
			const type = getTypeValue(term);
			if (Object.hasOwnProperty.call(scope.declarations, name)) {
				return {
					prefix: ignore(store(lookup(name, scope), value, type, scope), scope),
					test: trueValue,
				};
			} else {
				const pattern = convertToPattern(copy(value, type));
				const hasMapping = Object.hasOwnProperty.call(scope.mapping, name);
				let result: Statement[];
				if (hasMapping) {
					result = ignore(set(lookup(name, scope), pattern.test, scope, "=", term), scope);
				} else {
					const namedDeclaration = addVariable(scope, name, type, pattern.test, declarationFlags);
					if (declarationFlags & DeclarationFlags.Export) {
						result = [annotate(exportNamedDeclaration(namedDeclaration, []), term)];
					} else {
						result = [namedDeclaration];
					}
				}
				return {
					prefix: concat(pattern.prefix, result),
					test: trueValue,
				};
			}
		}
		case "pattern_tuple": {
			const type = getType(term);
			if (type.kind !== "tuple") {
				throw new TypeError(`Expected a tuple, got a ${stringifyType(type)}`);
			}
			const innerValue = unwrapCopies(value);
			if (innerValue.kind === "tuple") {
				return term.children.reduce((existing, child, i) => {
					if (innerValue.values.length <= i) {
						expectLength(innerValue.values, i);
					}
					const childPattern = translatePattern(child, innerValue.values[i], scope, declarationFlags);
					return mergePatterns(existing, childPattern, scope, term);
				}, emptyPattern);
			}
			let prefix: Statement[] = emptyPattern.prefix;
			let next: PatternOutput | undefined;
			const test = reuse(value, scope, "tuple", (reusableValue) => {
				return term.children.reduce((partialTest, child, i) => {
					const childPattern = translatePattern(child, member(reusableValue, i, scope, term), scope, declarationFlags);
					const merged = mergePatterns({ prefix, test: partialTest, next }, childPattern, scope, term);
					prefix = merged.prefix;
					next = merged.next;
					return merged.test;
				}, emptyPattern.test);
			});
			return {
				prefix,
				test,
				next,
			};
		}
		case "pattern_enum_element": {
			const type = getTypeValue(term);
			const reified = typeFromValue(type, scope);
			const cases = reified.cases;
			if (typeof cases === "undefined") {
				throw new TypeError(`Expected ${stringifyValue(type)} to be an enum, but it didn't have any cases.`);
			}
			const discriminant = discriminantForPatternTerm(term);
			const index = cases.findIndex((possibleCase) => possibleCase.name === discriminant);
			if (index === -1) {
				throw new TypeError(`Could not find the ${discriminant} case in ${stringifyValue(type)}, only found ${cases.map((enumCase) => enumCase.name).join(", ")}`);
			}
			const isDirectRepresentation = reified.possibleRepresentations !== PossibleRepresentation.Array;
			let next: PatternOutput | undefined;
			const test = reuse(value, scope, "enum", (reusableValue) => {
				const discriminantValue = isDirectRepresentation ? reusableValue : member(reusableValue, 0, scope, term);
				const result = binary("===", discriminantValue, literal(index), scope, term);
				expectLength(term.children, 0, 1);
				if (term.children.length === 0) {
					return result;
				}
				const child = term.children[0];
				let patternValue: Value;
				switch (cases[index].fieldTypes.length) {
					case 0:
						throw new Error(`Tried to use a pattern on an enum case that has no fields`);
					case 1:
						// Index 1 to account for the discriminant
						patternValue = member(reusableValue, 1, scope, term);
						// Special-case pattern matching using pattern_paren on a enum case with one field
						if (child.name === "pattern_paren") {
							next = translatePattern(child.children[0], patternValue, scope, declarationFlags);
							return result;
						}
						break;
					default:
						// Special-case pattern matching using pattern_tuple on a enum case with more than one field
						if (child.name === "pattern_tuple") {
							next = child.children.reduce((existing, tupleChild, i) => {
								// Offset by 1 to account for the discriminant
								const childPattern = translatePattern(tupleChild, member(reusableValue, i + 1, scope, term), scope, declarationFlags);
								return mergePatterns(existing, childPattern, scope, term);
							}, emptyPattern);
							return result;
						}
						// Remove the discriminant
						patternValue = call(member(reusableValue, "slice", scope, term), [literal(1)], ["Int"], scope, term);
						break;
				}
				// General case pattern matching on an enum
				next = translatePattern(child, patternValue, scope, declarationFlags);
				return result;
			});
			return {
				prefix: emptyStatements,
				test,
				next,
			};
		}
		case "pattern_any": {
			return emptyPattern;
		}
		default: {
			console.error(term);
			return {
				prefix: emptyStatements,
				test: expr(identifier("unknown_pattern_type$" + term.name), term),
			};
		}
	}
}

function valueForPattern(pattern: PatternOutput, scope: Scope, term: Term): Value {
	let test: Value;
	if (typeof pattern.next !== "undefined") {
		test = logical("&&", pattern.test, valueForPattern(pattern.next, scope, term), scope, term);
	} else {
		test = pattern.test;
	}
	if (pattern.prefix.length) {
		return statements(pattern.prefix.concat([annotate(returnStatement(read(test, scope)), term)]));
	}
	return test;
}

function flattenPattern(pattern: PatternOutput, scope: Scope, term: Term): { prefix: Statement[]; test: Expression; suffix: Statement[] } {
	let prefix: Statement[] = emptyStatements;
	let test: Value = literal(true, term);
	let currentPattern: PatternOutput | undefined = pattern;
	while (currentPattern) {
		prefix = concat(prefix, currentPattern.prefix);
		const currentTest = read(currentPattern.test, scope);
		currentPattern = currentPattern.next;
		if (!isTrueExpression(currentTest)) {
			test = expr(currentTest);
			break;
		}
	}
	let suffix: Statement[] = emptyStatements;
	while (currentPattern) {
		suffix = concat(suffix, currentPattern.prefix);
		const currentTest = read(currentPattern.test, scope);
		currentPattern = currentPattern.next;
		if (!isTrueExpression(currentTest)) {
			test = logical("&&", test, statements(concat(suffix, [annotate(returnStatement(currentTest), term)])), scope, term);
			suffix = emptyStatements;
		}
	}
	return {
		prefix,
		test: read(test, scope),
		suffix,
	};
}

function translateTermToValue(term: Term, scope: Scope, bindingContext?: (value: Value, optionalType: Value) => Value): Value {
	switch (term.name) {
		case "member_ref_expr": {
			expectLength(term.children, 1);
			const child = term.children[0];
			const type = getTypeValue(child);
			const decl = getProperty(term, "decl", isString);
			const { member: memberName } = parseDeclaration(decl);
			if (typeof memberName !== "string") {
				throw new TypeError(`Expected a member expression when parsing declaration: ${decl}`);
			}
			for (const fieldDeclaration of typeFromValue(type, scope).fields) {
				if (fieldDeclaration.name === memberName) {
					return annotateValue(getField(translateTermToValue(term.children[0], scope, bindingContext), fieldDeclaration, scope), term);
				}
			}
			throw new TypeError(`Could not find ${memberName} in ${stringifyValue(type)}`);
		}
		case "tuple_element_expr": {
			expectLength(term.children, 1);
			const child = term.children[0];
			const tupleType = getType(child);
			if (tupleType.kind !== "tuple") {
				throw new TypeError(`Expected a tuple, got a ${stringifyType(tupleType)}`);
			}
			if (tupleType.types.length === 1) {
				return annotateValue(translateTermToValue(child, scope, bindingContext), term);
			}
			return member(
				translateTermToValue(child, scope, bindingContext),
				literal(+getProperty(term, "field", isString)),
				scope,
				term,
			);
		}
		case "pattern_typed": {
			expectLength(term.children, 2);
			return translateTermToValue(term.children[0], scope, bindingContext);
		}
		case "declref_expr": {
			expectLength(term.children, 0);
			const type = getTypeValue(term);
			return annotateValue(extractReference(term, scope), term);
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
			return subscript(getter, setter, term.children.map((child) => translateTermToValue(child, scope, bindingContext)), term);
		}
		case "prefix_unary_expr":
		case "call_expr":
		case "constructor_ref_call_expr":
		case "dot_syntax_call_expr":
		case "binary_expr": {
			expectLength(term.children, 2);
			const target = term.children[0];
			const args = term.children[1];
			const targetValue = translateTermToValue(target, scope, bindingContext);
			const type = getType(args);
			const argsValue = type.kind === "tuple" && type.types.length !== 1 ? translateTermToValue(args, scope, bindingContext) : tuple([translateTermToValue(args, scope, bindingContext)]);
			const argTypes = type.kind === "tuple" ? type.types.map((innerType) => typeValue(innerType)) : [typeValue(type)];
			if (argsValue.kind === "tuple") {
				return call(targetValue, argsValue.values, argTypes, scope, term);
			} else {
				let updatedArgs: Value = argsValue;
				if (targetValue.kind === "function" && targetValue.substitutions.length !== 0) {
					// Insert substitutions as a [Foo$Type].concat(realArgs) expression
					updatedArgs = call(
						member(array(targetValue.substitutions, scope, term), "concat", scope, term),
						[argsValue],
						argTypes,
						scope,
						argsValue.location,
					);
				}
				return call(
					member(targetValue, "apply", scope, term),
					[undefinedValue, updatedArgs],
					argTypes,
					scope,
					term,
				);
			}
		}
		case "tuple_expr": {
			if (term.children.length === 1) {
				return annotateValue(translateTermToValue(term.children[0], scope, bindingContext), term);
			}
			return tuple(term.children.map((child) => translateTermToValue(child, scope, bindingContext)), term);
		}
		case "type_expr": {
			expectLength(term.children, 0);
			return annotateValue(getTypeValue(term), term);
		}
		case "boolean_literal_expr": {
			expectLength(term.children, 0);
			return literal(getProperty(term, "value", isString) === "true", term);
		}
		case "float_literal_expr":
		case "integer_literal_expr": {
			expectLength(term.children, 0);
			return literal(+getProperty(term, "value", isString), term);
		}
		case "string_literal_expr": {
			expectLength(term.children, 0);
			return literal(getProperty(term, "value", isString), term);
		}
		case "magic_identifier_literal_expr": {
			const location = locationForTerm(term);
			if (typeof location === "undefined") {
				throw new TypeError(`Expected location information for a magic identifier`);
			}
			const kind = getProperty(term, "kind", isString);
			let value: string | number = "unknown";
			switch (kind) {
				case "#file":
					const range = term.properties.range;
					value = "unknown";
					if (typeof range === "object" && !Array.isArray(range) && Object.hasOwnProperty.call(range, "from") && Object.hasOwnProperty.call(range, "to")) {
						const match = range.from.match(/^(.*):\d+:\d+$/);
						if (match !== null) {
							value = match[1];
						}
					}
					break;
				case "#function":
					value = scope.name;
					break;
				case "#line":
					value = location.start.line;
					break;
				case "#column":
					value = location.start.column;
					break;
				default:
					throw new TypeError(`Expected a valid kind of magic, got ${kind}`);
			}
			return literal(value, term);
		}
		case "object_literal": {
			throw new TypeError(`Playground literals are not supported`);
		}
		case "interpolated_string_literal_expr": {
			const elements: TemplateElement[] = [];
			const expressions: Expression[] = [];
			for (const child of term.children) {
				switch (child.name) {
					case "string_literal_expr":
						const value = getProperty(child, "value", isString);
						elements.push(templateElement({ cooked: value, raw: value }));
						break;
					case "semantic_expr":
						break;
					default:
						expressions.push(read(translateTermToValue(child, scope, bindingContext), scope));
						break;
				}
			}
			return expr(templateLiteral(elements, expressions), term);
		}
		case "array_expr": {
			const type = getType(term);
			if (type.kind !== "array") {
				throw new TypeError(`Expected an array type, got a ${stringifyType(type)}`);
			}
			return array(term.children.filter(noSemanticExpressions).map((child) => translateTermToValue(child, scope, bindingContext)), scope, term);
		}
		case "dictionary_expr": {
			const type = getType(term);
			if (type.kind !== "dictionary") {
				console.error(term);
				throw new TypeError(`Expected a dictionary type, got a ${stringifyType(type)}`);
			}
			// Reify type so that if the dictionary type isn't supported we throw
			reifyType(type, scope);
			const properties: ObjectProperty[] = [];
			for (const child of term.children.filter(noSemanticExpressions)) {
				checkTermName(child, "tuple_expr", "as child of a dictionary expression");
				expectLength(child.children, 2);
				const keyChild = child.children[0];
				const valueChild = child.children[1];
				properties.push(objectProperty(read(translateTermToValue(keyChild, scope, bindingContext), scope), read(translateTermToValue(valueChild, scope, bindingContext), scope), true));
			}
			return expr(objectExpression(properties), term);
		}
		case "paren_expr": {
			expectLength(term.children, 1);
			return annotateValue(translateTermToValue(term.children[0], scope, bindingContext), term);
		}
		case "if_expr": {
			expectLength(term.children, 3);
			return conditional(
				translateTermToValue(term.children[0], scope, bindingContext),
				translateTermToValue(term.children[1], scope, bindingContext),
				translateTermToValue(term.children[2], scope, bindingContext),
				scope,
				term,
			);
		}
		case "inject_into_optional": {
			expectLength(term.children, 1);
			return annotateValue(wrapInOptional(translateTermToValue(term.children[0], scope, bindingContext), getTypeValue(term.children[0]), scope), term);
		}
		case "function_conversion_expr": {
			expectLength(term.children, 1);
			return annotateValue(translateTermToValue(term.children[0], scope, bindingContext), term);
		}
		case "load_expr": {
			expectLength(term.children, 1);
			return annotateValue(translateTermToValue(term.children[0], scope, bindingContext), term);
		}
		case "assign_expr": {
			expectLength(term.children, 2);
			const type = getTypeValue(term.children[0]);
			const destTerm = term.children[0];
			if (destTerm.name === "discard_assignment_expr") {
				return translateTermToValue(term.children[1], scope, bindingContext);
			}
			const dest = translateTermToValue(destTerm, scope, bindingContext);
			const source = translateTermToValue(term.children[1], scope, bindingContext);
			return set(dest, source, scope, "=", term);
		}
		case "discard_assignment_expr": {
			return annotateValue(undefinedValue, term);
		}
		case "inout_expr": {
			expectLength(term.children, 1);
			// return boxed(translateTermToValue(term.children[0], scope, bindingContext));
			return annotateValue(translateTermToValue(term.children[0], scope, bindingContext), term);
		}
		case "pattern": {
			expectLength(term.children, 2);
			return annotateValue(valueForPattern(translatePattern(term.children[0], translateTermToValue(term.children[1], scope, bindingContext), scope), scope, term), term);
		}
		case "closure_expr":
		case "autoclosure_expr": {
			expectLength(term.children, 2);
			const parameterList = termWithName(term.children, "parameter_list");
			return callable((innerScope, arg) => {
				return newScope("anonymous", innerScope, (childScope) => {
					const paramStatements = applyParameterMappings(0, termsWithName(parameterList.children, "parameter"), arg, innerScope, childScope);
					const result = translateTermToValue(term.children[1], childScope, bindingContext);
					if (paramStatements.length) {
						return statements(concat(paramStatements, [returnStatement(read(result, childScope))]));
					} else {
						return result;
					}
				});
			}, getType(term), term);
		}
		case "tuple_shuffle_expr": {
			const elements = getProperty(term, "elements", Array.isArray);
			const variadicSources = getProperty(term, "variadic_sources", Array.isArray).slice();
			const type = getType(term);
			if (type.kind !== "tuple") {
				throw new Error(`Expected a tuple type, got ${stringifyType(type)}`);
			}
			const values = term.children.map((childTerm) => translateTermToValue(childTerm, scope, bindingContext));
			const valueTypes = type.types;
			return tuple(elements.map((source, i) => {
				const numeric = parseInt(source, 10);
				switch (numeric) {
					case -1: { // DefaultInitialize
						return defaultInstantiateType(typeValue(valueTypes[i]), scope, returnUndef);
					}
					case -2: { // Variadic
						if (variadicSources.length === 0) {
							throw new Error(`Used more variadic sources than we have`);
						}
						const index = parseInt(variadicSources.shift(), 10);
						if (Number.isNaN(index) || index < 0 || index >= term.children.length) {
							throw new Error(`Invalid variadic index`);
						}
						return values[index];
					}
					case -3: { // CallerDefaultInitialize
						return defaultInstantiateType(typeValue(valueTypes[i]), scope, returnUndef);
					}
					default: {
						if (numeric < 0) {
							throw new Error(`Unknown variadic element type ${source}`);
						}
						if (values.length < 1) {
							expectLength(values, 1);
						}
						const firstValue = values[0];
						if (firstValue.kind === "tuple") {
							if (firstValue.values.length <= numeric) {
								expectLength(firstValue.values, 1);
							}
							return firstValue.values[numeric];
						} else {
							return member(firstValue, numeric, scope, term);
						}
					}
				}
			}), term);
		}
		case "force_value_expr": {
			expectLength(term.children, 1);
			const type = getTypeValue(term);
			const value = translateTermToValue(term.children[0], scope, bindingContext);
			return reuse(value, scope, "optional", (reusableValue) => {
				// TODO: Optimize some cases where we can prove it to be a .some
				return conditional(
					optionalIsSome(reusableValue, type, scope),
					unwrapOptional(reusableValue, type, scope),
					call(forceUnwrapFailed, [], [], scope),
					scope,
					term,
				);
			});
		}
		case "try_expr":
		case "force_try_expr": {
			expectLength(term.children, 1);
			// Errors are dispatched via the native throw mechanism in JavaScript, so try expressions don't need special handling
			return annotateValue(translateTermToValue(term.children[0], scope, bindingContext), term);
		}
		case "optional_try_expr": {
			expectLength(term.children, 1);
			const type = getTypeValue(term.children[0]);
			const temp = uniqueName(scope, ":try");
			return statements([
				addVariable(scope, temp, type),
				tryStatement(
					blockStatement(
						ignore(set(lookup(temp, scope), wrapInOptional(translateTermToValue(term.children[0], scope, bindingContext), type, scope), scope), scope),
					),
					catchClause(identifier("e"), blockStatement(
						ignore(set(lookup(temp, scope), emptyOptional(type, scope), scope), scope),
					)),
				),
				annotate(returnStatement(read(lookup(temp, scope), scope)), term),
			], term);
		}
		case "erasure_expr": {
			// TODO: Support runtime Any type that can be inspected
			expectLength(term.children, 1, 2);
			return annotateValue(translateTermToValue(term.children[term.children.length - 1], scope, bindingContext), term);
		}
		case "normal_conformance": {
			// TODO: Wrap with runtime type information
			expectLength(term.children, 1);
			return annotateValue(translateTermToValue(term.children[0], scope, bindingContext), term);
		}
		case "optional_evaluation_expr": {
			expectLength(term.children, 1);
			const type = getType(term);
			if (type.kind !== "optional") {
				throw new TypeError(`Expected an optional type, got a ${type.kind}`);
			}
			const innerType = typeValue(type.type);
			let testValue: Value | undefined;
			const someCase = translateTermToValue(term.children[0], scope, (value: Value) => {
				if (typeof testValue !== "undefined") {
					throw new Error(`Expected only one binding expression to bind to this optional evaluation`);
				}
				return reuse(value, scope, "optional", (reusableValue) => {
					testValue = optionalIsSome(reusableValue, innerType, scope);
					return unwrapOptional(reusableValue, innerType, scope);
				});
			});
			if (typeof testValue === "undefined") {
				throw new Error(`Expected a binding expression to bind to this optional evaluation`);
			}
			return conditional(
				testValue,
				wrapInOptional(someCase, innerType, scope),
				emptyOptional(innerType, scope),
				scope,
				term,
			);
		}
		case "bind_optional_expr": {
			if (typeof bindingContext !== "function") {
				throw new Error(`Expected a binding context in order to bind an optional expression`);
			}
			expectLength(term.children, 1);
			const expressionTerm = term.children[0];
			const wrappedValue = translateTermToValue(expressionTerm, scope);
			return annotateValue(bindingContext(wrappedValue, getTypeValue(expressionTerm)), term);
		}
		case "make_temporarily_escapable_expr": {
			expectLength(term.children, 3);
			const closure = translateTermToValue(term.children[1], scope, bindingContext);
			const callTerm = term.children[2];
			if (callTerm.name !== "call_expr") {
				throw new TypeError(`Expected a call expression as the child of a temporarily escapable expression, got a ${callTerm.name}`);
			}
			const receiver = translateTermToValue(callTerm.children[0], scope, bindingContext);
			return call(receiver, [closure], ["Any"], scope, term);
		}
		default: {
			console.error(term);
			return variable(identifier("unknown_term_type$" + term.name), term);
		}
	}
}

function translateAllStatements(terms: Term[], scope: Scope, functions: FunctionMap, nextTerm?: Term): Statement[] {
	let tailStatements = emptyStatements;
	let headStatements = emptyStatements;
	for (let i = 0; i < terms.length; i++) {
		const term = terms[i];
		if (term.name === "defer_stmt") {
			tailStatements = concat(translateStatement(term, scope, functions, terms[i + 1] || nextTerm), tailStatements);
		} else {
			headStatements = concat(headStatements, translateStatement(term, scope, functions, terms[i + 1] || nextTerm));
		}
	}
	if (tailStatements.length) {
		return headStatements.length ? [tryStatement(blockStatement(headStatements), undefined, blockStatement(tailStatements))] : tailStatements;
	} else {
		return headStatements;
	}
}

function applyParameterMappings(typeParameterCount: number, parameterTerms: Term[], arg: ArgGetter, scope: Scope, childScope: Scope, ignoreSelf: boolean = false): Statement[] {
	return parameterTerms.reduce((body, param, index) => {
		expectLength(param.args, 1);
		const parameterName = param.args[0];
		const value = arg(index + typeParameterCount, parameterName);
		const type = getTypeValue(param);
		if (Object.hasOwnProperty.call(param.properties, "inout") && (index !== 0 || !ignoreSelf)) {
			// if (value.kind !== "boxed") {
			// 	throw new TypeError(`Expected a boxed value, got a ${value.kind}`);
			// }
			// childScope.mapping[parameterName] = value.kind === "boxed" ? value : boxed(value, { kind: "modified", type, modifier: "inout" });
			childScope.mapping[parameterName] = value.kind === "boxed" ? value : boxed(value, type);
			return body;
		} else if (value.kind === "type" || value.kind === "conformance") {
			childScope.mapping[parameterName] = value;
			return body;
		} else {
			const expression = read(value, scope);
			if (isIdentifier(expression) || expression.type === "ThisExpression") {
				childScope.mapping[parameterName] = expr(expression);
				return body;
			}
			const literalValue = expressionLiteralValue(expression);
			if (typeof literalValue === "boolean" || typeof literalValue === "number" || typeof literalValue === "string" || literalValue === null) {
				childScope.mapping[parameterName] = literal(literalValue);
				return body;
			}
			const temporary = uniqueName(scope, parameterName);
			childScope.mapping[parameterName] = expr(identifier(temporary), expression.loc);
			return concat(body, [addVariable(scope, temporary, type, expr(expression), DeclarationFlags.Const)]);
		}
	}, emptyStatements);
}

function flagsForDeclarationTerm(term: Term): DeclarationFlags {
	let flags: DeclarationFlags = DeclarationFlags.None;
	if (term.properties.let || term.properties.immutable) {
		flags |= DeclarationFlags.Const;
	} else {
		flags |= DeclarationFlags.Boxed;
	}
	if (term.properties.access === "public") {
		flags |= DeclarationFlags.Export;
	}
	return flags;
}

function typeMappingForGenericArguments(typeArguments: Type, arg: ArgGetter): TypeMap {
	if (typeArguments.kind !== "generic") {
		throw new TypeError(`Expected a generic type, got a ${typeArguments.kind}`);
	}
	const result: TypeMap = Object.create(null);
	for (let i = 0; i < typeArguments.arguments.length; i++) {
		const typeParameter = typeArguments.arguments[i];
		let name: string;
		if (typeParameter.kind === "name") {
			name = typeParameter.name;
		} else if (typeParameter.kind === "constrained") {
			if (typeParameter.type.kind === "name") {
				name = typeParameter.type.name;
			} else {
				throw new Error(`Expected a type name or a constrained type name, got a ${typeParameter.type.kind}`);
			}
		} else {
			throw new Error(`Expected a type name or a constrained type name, got a ${typeParameter.kind}`);
		}
		result[name] = (scope: Scope) => typeFromValue(arg(i, name), scope);
	}
	return result;
}

function translateFunctionTerm(name: string, term: Term, parameterLists: Term[][], constructedTypeName: string | undefined, scope: Scope, functions: FunctionMap, selfValue?: MappedNameValue): (scope: Scope, arg: ArgGetter) => Value {
	function constructCallable(head: Statement[], parameterListIndex: number, functionType: Type, isInitial: boolean): (scope: Scope, arg: ArgGetter) => Value {
		return (targetScope: Scope, arg: ArgGetter) => {
			// Apply generic function mapping for outermost function
			let typeMap: TypeMap | undefined;
			if (isInitial && term.args.length >= 2) {
				typeMap = typeMappingForGenericArguments(parseType("Base" + term.args[1]), arg);
			}
			return newScope(isInitial ? name : "inner", targetScope, (childScope) => {
				if (typeof selfValue !== "undefined") {
					childScope.mapping.self = selfValue;
				}
				let typeArgumentCount: number = 0;
				if (typeof typeMap !== "undefined") {
					const typeArgumentKeys = Object.keys(typeMap);
					typeArgumentCount = typeArgumentKeys.length;
					for (let i = 0; i < typeArgumentCount; i++) {
						const argValue = arg(i, typeArgumentKeys[i]);
						if (argValue.kind !== "direct") {
							throw new TypeError(`Expected a direct value, got a ${argValue.kind}`);
						}
						childScope.mapping[typeArgumentKeys[i]] = argValue;
					}
				}
				// Apply parameters
				const parameterList = parameterLists[parameterListIndex];
				const parameterStatements = concat(head, applyParameterMappings(typeArgumentCount, termsWithName(parameterList, "parameter"), arg, targetScope, childScope, isInitial && !!constructedTypeName));
				if (parameterListIndex !== parameterLists.length - 1) {
					// Not the innermost function, emit a wrapper. If we were clever we could curry some of the body
					return callable(constructCallable(parameterStatements, parameterListIndex + 1, returnType(functionType), false), functionType);
				}
				// Emit the innermost function
				const brace = findTermWithName(term.children, "brace_stmt");
				if (brace) {
					const body = termWithName(term.children, "brace_stmt").children.slice();
					if (typeof constructedTypeName === "string") {
						const typeOfResult = returnType(returnType(getType(term)));
						const nonOptionalResult = typeOfResult.kind === "optional" ? typeOfResult.type : typeOfResult;
						const selfMapping = uniqueName(childScope, camelCase(constructedTypeName));
						childScope.mapping.self = expr(identifier(selfMapping));
						const defaultInstantiation = defaultInstantiateType(typeValue(nonOptionalResult), scope, (fieldName) => {
							if (body.length && body[0].name === "assign_expr") {
								const children = body[0].children;
								expectLength(children, 2);
								if (children[0].name === "member_ref_expr") {
									if (parseDeclaration(getProperty(children[0], "decl", isString)).member === fieldName) {
										body.shift();
										return read(translateTermToValue(children[1], childScope), childScope);
									}
								}
							}
							return undefined;
						});
						if (body.length === 1 && body[0].name === "return_stmt" && body[0].properties.implicit) {
							const defaultStatements = defaultInstantiation.kind === "statements" ? defaultInstantiation.statements : [annotate(returnStatement(read(defaultInstantiation, scope)), brace)];
							return statements(concat(parameterStatements, defaultStatements), brace);
						}
						if (defaultInstantiation.kind === "statements" && defaultInstantiation.statements.length !== 0) {
							const finalStatement = defaultInstantiation.statements[defaultInstantiation.statements.length - 1];
							if (finalStatement.type === "ReturnStatement" && finalStatement.argument !== null && typeof finalStatement.argument !== "undefined" && finalStatement.argument.type === "Identifier") {
								childScope.mapping.self = expr(finalStatement.argument);
								const optimizedConstructorBody: Statement[] = translateAllStatements(body, childScope, functions);
								return statements(concat(concat(parameterStatements, defaultInstantiation.statements.slice(0, defaultInstantiation.statements.length - 1)), optimizedConstructorBody), brace);
							}
						}
						const declarations: Statement[] = [addVariable(childScope, selfMapping, typeValue(typeOfResult), defaultInstantiation)];
						const constructorBody: Statement[] = translateAllStatements(body, childScope, functions);
						return statements(concat(concat(parameterStatements, declarations), constructorBody), brace);
					}
					return statements(concat(parameterStatements, translateAllStatements(body, childScope, functions)), brace);
				} else {
					if (typeof constructedTypeName === "string") {
						const typeOfResult = returnType(returnType(getType(term)));
						const selfMapping = uniqueName(childScope, camelCase(constructedTypeName));
						childScope.mapping.self = expr(identifier(selfMapping));
						const defaultInstantiation = defaultInstantiateType(typeValue(typeOfResult), scope, () => undefined);
						return statements(concat(parameterStatements, [annotate(returnStatement(read(defaultInstantiation, scope)), term)]), term);
					} else {
						return statements(parameterStatements, term);
					}
				}
			}, typeMap);
		};
	}

	return constructCallable(emptyStatements, 0, getType(term), true);
}

function noArguments(): never {
	throw new Error(`Did not expect getters to inspect arguments`);
}

function nameForFunctionTerm(term: Term): string {
	expectLength(term.args, 1, 2);
	return term.args[0].replace(/\((_:)+\)$/, "");
}

function addFunctionToType(functions: FunctionMap, conformances: ProtocolConformanceMap | undefined, name: string, builder: FunctionBuilder) {
	functions[name] = builder;
	if (typeof conformances !== "undefined") {
		for (const key of Object.keys(conformances)) {
			const protocolConformance = conformances[key].functions;
			if (Object.hasOwnProperty.call(protocolConformance, name)) {
				protocolConformance[name] = builder;
			}
		}
	}
}

function translateStatement(term: Term, scope: Scope, functions: FunctionMap, nextTerm?: Term): Statement[] {
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
			expectLength(term.args, 1, 2);
			const name = nameForFunctionTerm(term);
			const parameters = termsWithName(term.children, "parameter");
			const parameterLists = concat(parameters.length ? [parameters] : [], termsWithName(term.children, "parameter_list").map((paramList) => paramList.children));
			if (parameterLists.length === 0) {
				throw new Error(`Expected a parameter list for a function declaration`);
			}
			const fn = translateFunctionTerm(name, term, parameterLists, isConstructor ? "self" : undefined, scope, functions);
			if (/^anonname=/.test(name)) {
				scope.functions[name] = fn;
			} else if (!isConstructor && (flagsForDeclarationTerm(term) & DeclarationFlags.Export) && functions === scope.functions) {
				addFunctionToType(functions, undefined, name, noinline(fn));
				insertFunction(name, scope, getFunctionType(term), fn, undefined, true);
			} else {
				addFunctionToType(functions, undefined, name, isConstructor ? fn : noinline(fn));
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
				const expression = read(value, scope);
				if (isIdentifier(expression) && Object.hasOwnProperty.call(scope.declarations, expression.name)) {
					return [annotate(returnStatement(expression), term)];
				}
				const copied = copy(expr(expression), getTypeValue(term.children[0]));
				return [annotate(returnStatement(read(copied, scope)), term)];
			} else if (term.properties.implicit) {
				return [annotate(returnStatement(read(lookup("self", scope), scope)), term)];
			} else {
				return [annotate(returnStatement(), term)];
			}
		}
		case "fail_stmt": {
			return [annotate(returnStatement(read(literal(null), scope)), term)];
		}
		case "top_level_code_decl": {
			return translateAllStatements(term.children, scope, functions, nextTerm);
		}
		case "var_decl": {
			expectLength(term.children, 0);
			const name = term.args[0];
			if (Object.hasOwnProperty.call(scope.declarations, name)) {
				if (term.properties.access === "public") {
					scope.declarations[name].flags |= DeclarationFlags.Export;
				}
				return emptyStatements;
			} else {
				const type = getTypeValue(term);
				const defaultInstantiation = defaultInstantiateType(type, scope, returnUndef);
				return [addVariable(scope, name, type, defaultInstantiation, flagsForDeclarationTerm(term))];
			}
			break;
		}
		case "brace_stmt": {
			return translateAllStatements(term.children, scope, functions, nextTerm);
		}
		case "if_stmt": {
			const children = term.children;
			expectLength(children, 2, 3);
			let pattern: PatternOutput;
			const testTerm = children[0];
			if (testTerm.name === "pattern") {
				pattern = translatePattern(testTerm.children[0], translateTermToValue(testTerm.children[1], scope), scope);
			} else {
				pattern = convertToPattern(translateTermToValue(testTerm, scope));
			}
			const { prefix, test, suffix } = flattenPattern(pattern, scope, term);
			const consequent = concat(suffix, translateInNewScope(children[1], scope, functions, "consequent"));
			if (isTrueExpression(test)) {
				return concat(prefix, consequent);
			}
			const alternate = children.length === 3 ? blockStatement(translateInNewScope(children[2], scope, functions, "alternate")) : undefined;
			return concat(prefix, [annotate(ifStatement(test, blockStatement(consequent), alternate), term)]);
		}
		case "while_stmt": {
			expectLength(term.children, 2);
			const testTerm = term.children[0];
			const bodyTerm = term.children[1];
			return [annotate(whileStatement(read(translateTermToValue(testTerm, scope), scope), blockStatement(translateInNewScope(bodyTerm, scope, functions, "body"))), term)];
		}
		case "repeat_while_stmt": {
			expectLength(term.children, 2);
			const bodyTerm = term.children[0];
			const testTerm = term.children[1];
			return [annotate(doWhileStatement(read(translateTermToValue(testTerm, scope), scope), blockStatement(translateInNewScope(bodyTerm, scope, functions, "body"))), term)];
		}
		case "for_each_stmt": {
			expectLength(term.children, 6);
			const patternTerm = term.children[0];
			if (patternTerm.name !== "pattern_named") {
				throw new TypeError(`Only named patterns are supported in for each iteration, got a ${patternTerm.name}`);
			}
			expectLength(patternTerm.args, 1);
			const targetTerm = term.children[2];
			const targetType = getType(targetTerm);
			if (targetType.kind !== "array") {
				throw new TypeError(`Only array types are supported in for each iterations, got a ${stringifyType(targetType)}`);
			}
			const bodyTerm = term.children[5];
			return [annotate(forOfStatement(
				addVariable(scope, patternTerm.args[0], typeValue(getType(patternTerm)), undefined, DeclarationFlags.Const),
				read(translateTermToValue(targetTerm, scope), scope),
				blockStatement(translateInNewScope(bodyTerm, scope, functions, "body")),
			), term)];
		}
		case "switch_stmt": {
			if (term.children.length < 1) {
				throw new Error(`Expected at least one term, got ${term.children.length}`);
			}
			const discriminantTerm = term.children[0];
			const declaration = annotate(variableDeclaration("var", [variableDeclarator(identifier("$match"), read(translateTermToValue(discriminantTerm, scope), scope))]), term);
			const cases = term.children.slice(1).reduceRight((previous: Statement | undefined, childTerm: Term): Statement => {
				checkTermName(childTerm, "case_stmt", "as child of a switch statement");
				if (childTerm.children.length < 1) {
					throw new Error(`Expected at least one term, got ${childTerm.children.length}`);
				}
				let mergedPrefix: Statement[] = emptyStatements;
				let mergedTest: Expression = literal(false).expression;
				let mergedSuffix: Statement[] = emptyStatements;
				const body = newScope("case", scope, (childScope) => {
					const remainingChildren = childTerm.children.slice(0, childTerm.children.length - 1);
					for (const child of remainingChildren) {
						const { prefix, test, suffix } = flattenPattern(translatePattern(child, expr(identifier("$match")), childScope), scope, term);
						mergedPrefix = concat(mergedPrefix, prefix);
						if (expressionLiteralValue(mergedTest) === false) {
							mergedTest = test;
						} else if (!isTrueExpression(mergedTest)) {
							mergedTest = logicalExpression("||", mergedTest, test);
						}
						mergedSuffix = concat(mergedSuffix, suffix);
					}
					return statements(concat(mergedSuffix, translateStatement(childTerm.children[childTerm.children.length - 1], childScope, functions)));
				});
				// Basic optimization for else case in switch statement
				if (typeof previous === "undefined" && isTrueExpression(mergedTest)) {
					return blockStatement(concat(mergedPrefix, statementsInValue(body, scope)));
				}
				// Push the if statement into a block if the test required prefix statements
				const pendingStatement = ifStatement(mergedTest, blockStatement(statementsInValue(body, scope)), previous);
				if (mergedPrefix.length) {
					return blockStatement(concat(mergedPrefix, [pendingStatement]));
				}
				return pendingStatement;
			}, undefined);
			return typeof cases !== "undefined" ? [declaration, cases] : [declaration];
		}
		case "throw_stmt": {
			expectLength(term.children, 1);
			const expressionTerm = term.children[0];
			return [annotate(throwStatement(read(translateTermToValue(expressionTerm, scope), scope)), term)];
		}
		case "guard_stmt": {
			expectLength(term.children, 2);
			const testTerm = term.children[0];
			const bodyTerm = term.children[1];
			return [annotate(ifStatement(
				read(unary("!", translateTermToValue(testTerm, scope), scope), scope),
				blockStatement(translateInNewScope(bodyTerm, scope, functions, "alternate")),
			), term)];
		}
		case "do_catch_stmt": {
			if (term.children.length < 2) {
				expectLength(term.children, 2);
			}
			const bodyTerm = term.children[0];
			checkTermName(bodyTerm, "brace_stmt", "as first child of a do catch statement");
			return term.children.slice(1).reduce((body, catchTerm) => {
				checkTermName(catchTerm, "catch", "as non-first child of a do catch");
				expectLength(catchTerm.children, 2);
				const patternTerm = catchTerm.children[0];
				checkTermName(patternTerm, "pattern_let", "as child of a catch pattern");
				expectLength(patternTerm.children, 1);
				const letPatternChild = patternTerm.children[0];
				checkTermName(letPatternChild, "pattern_named", "as child of a catch pattern let expression");
				expectLength(letPatternChild.args, 1);
				const catchClauseExpression = identifier(letPatternChild.args[0]);
				const catchBodyTerm = catchTerm.children[1];
				checkTermName(catchBodyTerm, "brace_stmt", "as only child of a catch clause");
				const catchBodyStatements = translateInNewScope(catchBodyTerm, scope, functions, "catch");
				return [tryStatement(blockStatement(body), catchClause(catchClauseExpression, blockStatement(catchBodyStatements)))];
			}, translateInNewScope(bodyTerm, scope, functions, "body"));
		}
		case "do_stmt": {
			return translateAllStatements(term.children, scope, functions, nextTerm);
		}
		case "defer_stmt": {
			expectLength(term.children, 2);
			const firstChild = term.children[0];
			checkTermName(firstChild, "func_decl", "as second child of a defer statement");
			expectLength(firstChild.children, 2);
			checkTermName(firstChild.children[0], "parameter_list", "as first child of defer statement function");
			expectLength(firstChild.children[0].children, 0);
			checkTermName(firstChild.children[1], "brace_stmt", "as second child of defer statement function");
			checkTermName(term.children[1], "call_expr", "as second child of a defer statement");
			return translateInNewScope(firstChild.children[1], scope, functions, "deferred");
		}
		case "enum_decl": {
			expectLength(term.args, 1);
			const inherits = term.properties.inherits;
			const baseType = typeof inherits === "string" ? parseType(inherits) : undefined;
			const baseReifiedType = typeof baseType !== "undefined" ? reifyType(baseType, scope) : undefined;
			let body = emptyStatements;
			const enumName = term.args[0];
			const copyFunctionName = `${enumName}.copy`;
			const methods: FunctionMap = {
				[copyFunctionName]: noinline((innerScope, arg) => copyHelper(arg(0, "source"), innerScope)),
			};
			function copyHelper(value: Value, innerScope: Scope): Value {
				// Passthrough to the underlying type, which should generally be simple
				if (baseReifiedType) {
					return baseReifiedType.copy ? baseReifiedType.copy(value, innerScope) : value;
				}
				const expression = read(value, innerScope);
				if (expressionSkipsCopy(expression)) {
					return expr(expression);
				}
				if (requiresCopyHelper) {
					// Emit checks for cases that have field that require copying
					return reuse(expr(expression), scope, "copySource", (reusableValue) => {
						return cases.reduce(
							(previous, enumCase, i) => {
								if (enumCase.fieldTypes.some((fieldType) => !!fieldType.copy)) {
									const test = binary("===",
										member(reusableValue, 0, scope),
										literal(i),
										scope,
									);
									const copyCase = array(concat([literal(i)], enumCase.fieldTypes.map((fieldType, fieldIndex) => {
										// if (fieldType === baseReifiedType) {
											// TODO: Avoid resetting this each time
											// methods["$copy"] = noinline((innermostScope, arg) => copyHelper(arg(0), innermostScope));
										// }
										const fieldValue = member(reusableValue, fieldIndex + 1, scope);
										return fieldType.copy ? fieldType.copy(fieldValue, scope) : fieldValue;
									})), scope);
									return conditional(test, copyCase, previous, scope);
								} else {
									return previous;
								}
							},
							// Fallback to slicing the array for remaining simple cases
							call(member(reusableValue, "slice", scope), [], [], scope),
						);
					});
				} else {
					return call(member(expr(expression), "slice", scope), [], [], innerScope);
				}
			}
			const layout: Field[] = [];
			let requiresCopyHelper: boolean = false;
			const cases: EnumCase[] = [];
			const selfType: Type = {
				kind: "name",
				name: enumName,
			};
			const innerTypes: TypeMap = Object.create(null);
			innerTypes.Type = () => primitive(PossibleRepresentation.Undefined, undefinedValue);
			// Reify self
			const reifiedSelfType: ReifiedType = {
				fields: layout,
				functions: lookupForMap(methods),
				conformances: Object.create(null),
				possibleRepresentations: baseReifiedType ? baseReifiedType.possibleRepresentations : PossibleRepresentation.Array,
				innerTypes,
				copy: baseReifiedType ? baseReifiedType.copy : (value, innerScope) => {
					// Skip the copy if we can—must be done on this side of the inlining boundary
					const expression = read(value, scope);
					if (expressionSkipsCopy(expression)) {
						return expr(expression);
					}
					if (!requiresCopyHelper) {
						return copyHelper(expr(expression), innerScope);
					}
					// Dispatch through the function so that recursion doesn't kill us
					const copyFunctionType: Function = { kind: "function", arguments: { kind: "tuple", types: [selfType] }, return: selfType, throws: false, rethrows: false, attributes: [] };
					return call(functionValue(copyFunctionName, typeValue(selfType), copyFunctionType), [expr(expression)], [typeValue(selfType)], scope);
				},
				cases,
			};
			scope.types[enumName] = () => reifiedSelfType;
			// Populate each case
			termsWithName(term.children, "enum_case_decl").forEach((caseDecl, index) => {
				const elementDecl = termWithName(caseDecl.children, "enum_element_decl");
				expectLength(elementDecl.args, 1);
				// TODO: Extract the actual rawValue and use this as the discriminator
				const name = elementDecl.args[0].match(/^[^\(]*/)![0];
				const type = returnType(getType(elementDecl));
				if (type.kind === "function") {
					methods[name] = wrapped((innerScope, arg) => {
						const args = type.arguments.types.map((argType, argIndex) => copy(arg(argIndex), typeValue(argType)));
						return array(concat([literal(index) as Value], args), scope);
					});
					cases.push({
						name,
						fieldTypes: type.arguments.types.map((argType) => {
							const reified = reifyType(argType, scope);
							if (reified.copy) {
								requiresCopyHelper = true;
							}
							return reified;
						}),
					});
					return;
				}
				if (baseType) {
					// TODO: Extract the underlying value, which may actually not be numeric!
					methods[name] = () => literal(index);
				} else {
					methods[name] = () => literal([index]);
				}
				cases.push({
					name,
					fieldTypes: [],
				});
			});
			// Populate fields and members
			for (const child of term.children) {
				if (child.name === "var_decl") {
					expectLength(child.args, 1);
					if (requiresGetter(child)) {
						expectLength(child.children, 1);
						const declaration = findTermWithName(child.children, "func_decl") || termWithName(child.children, "accessor_decl");
						const fieldName = child.args[0];
						if (fieldName === "rawValue") {
							// The built-in rawValue accessors don't have proper pattern matching :(
							if (typeof baseType !== "undefined" && typeof baseReifiedType !== "undefined") {
								layout.push(field("rawValue", baseReifiedType, (value, innerScope) => copy(value, typeValue(baseType))));
							} else {
								throw new TypeError(`Unable to synthesize rawValue for ${enumName}`);
							}
						} else if (fieldName === "hashValue") {
							// The built-in hashValue accessors don't have proper pattern matching :(
							if (baseReifiedType) {
								const passthroughField = baseReifiedType.fields.find((fieldDeclaration) => fieldDeclaration.name === "hashValue");
								if (!passthroughField) {
									throw new Error(`Unable to synthsize hashValue for ${enumName} because underlying type ${inherits} does not have a hashValue`);
								}
								layout.push(passthroughField);
							} else {
								throw new TypeError(`Unable to synthesize hashValue for ${enumName}`);
							}
						} else {
							const fieldType = getTypeValue(child);
							layout.push(field(fieldName, typeFromValue(fieldType, scope), (value: Value, innerScope: Scope) => {
								return call(call(functionValue(declaration.args[0], undefined, getFunctionType(declaration)), [value], [fieldType], innerScope), [], [], innerScope);
							}));
						}
						body = concat(body, translateStatement(child.children[0], scope, methods));
					} else {
						throw new TypeError(`Enums should not have any stored fields`);
					}
				} else if (child.name !== "enum_case_decl" && child.name !== "enum_element_decl" && child.name !== "typealias") {
					body = concat(body, translateStatement(child, scope, methods));
				}
			}
			return body;
		}
		case "struct_decl": {
			expectLength(term.args, 1);
			let body: Statement[] = [];
			const layout: Field[] = [];
			const methods: FunctionMap = {};
			const structName = term.args[0];
			const conformances: ProtocolConformanceMap = Object.create(null);
			if (Object.hasOwnProperty.call(term.properties, "inherits")) {
				const inherits = term.properties.inherits;
				if (typeof inherits === "string") {
					const inheritsReified = reifyType(inherits, scope);
					conformances[inherits] = { ...inheritsReified.conformances[inherits] };
				}
			}
			const innerTypes: TypeMap = Object.create(null);
			innerTypes.Type = () => primitive(PossibleRepresentation.Undefined, undefinedValue);
			scope.types[structName] = () => struct(layout, methods, conformances, innerTypes);
			for (const child of term.children) {
				switch (child.name) {
					case "var_decl": {
						expectLength(child.args, 1);
						const childTypeValue = getTypeValue(child);
						if (requiresGetter(child)) {
							expectLength(child.children, 1);
							layout.push(field(child.args[0], typeFromValue(childTypeValue, scope), (value: Value, innerScope: Scope) => {
								const declaration = findTermWithName(child.children, "func_decl") || termWithName(child.children, "accessor_decl");
								return call(call(functionValue(declaration.args[0], undefined, getFunctionType(declaration)), [value], [childTypeValue], innerScope), [], [], innerScope);
							}));
							body = concat(body, translateStatement(child.children[0], scope, methods));
						} else {
							layout.push(field(child.args[0], typeFromValue(childTypeValue, scope)));
						}
						break;
					}
					case "constructor_decl":
					case "func_decl": {
						const isConstructor = child.name === "constructor_decl";
						expectLength(child.args, 1, 2);
						const name = nameForFunctionTerm(child);
						const parameters = termsWithName(child.children, "parameter");
						const parameterLists = concat(parameters.length ? [parameters] : [], termsWithName(child.children, "parameter_list").map((paramList) => paramList.children));
						if (parameterLists.length === 0) {
							throw new Error(`Expected a parameter list for a function declaration`);
						}
						const fn = translateFunctionTerm(name, child, parameterLists, isConstructor ? structName : undefined, scope, functions);
						addFunctionToType(methods, conformances, name, fn);
						break;
					}
					default: {
						body = concat(body, translateStatement(child, scope, methods));
					}
				}
			}
			return body;
		}
		case "pattern_binding_decl": {
			if (term.children.length === 2) {
				const valueChild = term.children[1];
				// const value = copy(translateTermToValue(valueChild, scope), getTypeValue(valueChild));
				const value = translateTermToValue(valueChild, scope);
				const flags: DeclarationFlags = typeof nextTerm !== "undefined" && nextTerm.name === "var_decl" ? flagsForDeclarationTerm(nextTerm) : DeclarationFlags.None;
				const pattern = translatePattern(term.children[0], value, scope, flags);
				if (typeof pattern.next !== "undefined") {
					throw new Error(`Chained patterns are not supported on binding declarations`);
				}
				const expression = read(pattern.test, scope);
				if (isPure(expression)) {
					return pattern.prefix;
				} else {
					return concat(pattern.prefix, ignore(expr(expression), scope));
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
			const methods: FunctionMap = Object.create(null);
			const classIdentifier = mangleName(term.args[0]);
			const className = term.args[0];
			const selfType = typeValue({ kind: "name", name: className });
			const conformances: ProtocolConformanceMap = Object.create(null);
			const innerTypes: TypeMap = Object.create(null);
			innerTypes.Type = () => primitive(PossibleRepresentation.Undefined, undefinedValue);
			scope.types[className] = () => newClass(layout, methods, conformances, innerTypes, (innerScope: Scope, consume: (fieldName: string) => Expression | undefined) => {
				const self = uniqueName(innerScope, camelCase(className));
				const newExpr = newExpression(classIdentifier, []);
				let bodyStatements: Statement[] = [addVariable(innerScope, self, selfType, expr(newExpr), DeclarationFlags.Const)];
				const selfValue = lookup(self, scope);
				for (const fieldDeclaration of layout) {
					if (fieldDeclaration.stored) {
						const fieldExpression = consume(fieldDeclaration.name);
						let fieldValue;
						if (typeof fieldExpression === "undefined") {
							const defaultValue = fieldDeclaration.type.defaultValue;
							if (typeof defaultValue === "undefined") {
								// Swift always ensures all mandatory fields are filled, so we can be certain that later in the body it will be assigned
								continue;
							}
							fieldValue = defaultValue(innerScope, () => undefined);
						} else {
							fieldValue = expr(fieldExpression);
						}
						bodyStatements = concat(bodyStatements, ignore(set(member(selfValue, fieldDeclaration.name, scope), fieldValue, scope), scope));
					}
				}
				if (bodyStatements.length === 1) {
					return expr(newExpr);
				} else {
					bodyStatements.push(returnStatement(read(selfValue, scope)));
					return statements(bodyStatements);
				}
			});
			const bodyContents: Array<ClassProperty | ClassMethod> = [];
			for (const child of term.children) {
				switch (child.name) {
					case "var_decl": {
						if (child.args.length < 1) {
							expectLength(child.args, 1);
						}
						const propertyName = child.args[0];
						if (requiresGetter(child)) {
							// TODO: Implement getters/setters
							if (child.children.length < 1) {
								expectLength(child.children, 1);
							}
							const childDeclaration = findTermWithName(child.children, "func_decl") || termWithName(child.children, "accessor_decl");
							const type = getTypeValue(childDeclaration);
							if (flagsForDeclarationTerm(child) & DeclarationFlags.Export) {
								const fn = translateFunctionTerm(propertyName + ".get", childDeclaration, [[]], undefined, scope, functions, expr(thisExpression()));
								const [args, body] = functionize(scope, (innerScope) => fn(innerScope, () => expr(thisExpression())));
								bodyContents.push(classMethod("get", identifier(propertyName), args, blockStatement(body)));
								// Default implementation will call getter/setter
								layout.push(field(child.args[0], typeFromValue(getTypeValue(child), scope)));
							} else {
								// layout.push(field(child.args[0], typeFromValue(getTypeValue(child), scope), (value: Value, innerScope: Scope) => {
								// 	return callable(fn, type, childDeclaration);
								// }));
								const childType = getTypeValue(child);
								layout.push(field(child.args[0], typeFromValue(childType, scope), (value: Value, innerScope: Scope) => {
									const selfExpression = read(value, innerScope);
									if (selfExpression.type === "Identifier" || selfExpression.type === "ThisExpression") {
										return translateFunctionTerm(propertyName + ".get", childDeclaration, [[]], undefined, scope, functions, expr(selfExpression))(scope, noArguments);
									} else {
										const self = uniqueName(innerScope, "self");
										const head = addVariable(innerScope, self, childType, expr(selfExpression), DeclarationFlags.Const);
										const selfValue = lookup(self, scope);
										const func = translateFunctionTerm(propertyName + ".get", childDeclaration, [[]], undefined, scope, functions, selfValue);
										const result = func(scope, noArguments);
										if (result.kind === "statements") {
											return statements(concat([head], result.statements), result.location);
										} else {
											return statements([head, returnStatement(read(result, innerScope))], result.location);
										}
									}
								}));
							}
						} else {
							layout.push(field(child.args[0], typeFromValue(getTypeValue(child), scope)));
						}
						break;
					}
					case "destructor_decl": {
						const brace = findTermWithName(child.children, "brace_stmt");
						if (typeof brace !== "undefined" && brace.children.length > 0) {
							console.warn(`Non-trivial deinit method found on ${className}, will never be called at runtime`);
						}
						break;
					}
					case "constructor_decl":
					case "func_decl": {
						const isConstructor = child.name === "constructor_decl";
						expectLength(child.args, 1, 2);
						const name = nameForFunctionTerm(child);
						const parameters = termsWithName(child.children, "parameter");
						const parameterLists = concat(parameters.length ? [parameters] : [], termsWithName(child.children, "parameter_list").map((paramList) => paramList.children));
						if (parameterLists.length === 0) {
							throw new Error(`Expected a parameter list for a function declaration`);
						}
						const fn = translateFunctionTerm(name, child, parameterLists, isConstructor ? className : undefined, scope, functions);
						addFunctionToType(methods, conformances, name, fn);
						break;
					}
					default:
						break;
				}
			}
			const flags = flagsForDeclarationTerm(term);
			const declaration = classDeclaration(classIdentifier, undefined, classBody(bodyContents), []);
			return [flags & DeclarationFlags.Export ? exportNamedDeclaration(declaration, []) : declaration];
		}
		default: {
			const value = translateTermToValue(term, scope);
			const pattern = convertToPattern(value);
			const { prefix, test, suffix } = flattenPattern(pattern, scope, term);
			let result = prefix;
			if (!isPure(test)) {
				if (test.type === "ConditionalExpression") {
					result = concat(result, [ifStatement(
						test.test,
						blockStatement(isPure(test.consequent) ? [] : ignore(expr(test.consequent), scope)),
						isPure(test.alternate) ? undefined : blockStatement(ignore(expr(test.alternate), scope)),
					)]);
				} else {
					result = concat(result, ignore(expr(test), scope));
				}
			}
			return concat(result, suffix);
		}
	}
}

function translateInNewScope(term: Term, scope: Scope, functions: FunctionMap, scopeName: string): Statement[] {
	return statementsInValue(newScope(scopeName, scope, (childScope) => statements(translateStatement(term, childScope, functions))), scope);
}

export function compileTermToProgram(root: Term): Program {
	const programScope = newScopeWithBuiltins();
	const programValue = emitScope(programScope, statements(translateStatement(root, programScope, programScope.functions)));
	if (programValue.kind !== "statements") {
		throw new TypeError(`Expected program to emit statements, not a ${programValue.kind}`);
	}
	return program(programValue.statements);
}

function readAsString(stream: NodeJS.ReadableStream): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		stream.setEncoding("utf8");
		stream.resume();
		const input: Array<unknown> = [];
		stream.on("data", (chunk) => input.push(chunk));
		stream.on("end", () => {
			resolve(input.join(""));
		});
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
	code: string;
	map: object;
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
	let ast = await stderr;
	if (ast[0] !== "(") {
		const lines = (await stderr).split(/\r\n|\r|\n/g);
		const bracketIndex = lines.findIndex((line) => /^\(/.test(line));
		console.error(lines.slice(0, bracketIndex).join("\n"));
		ast = lines.slice(bracketIndex).join("\n");
	}
	// console.log(ast);
	const rootTerm = parseAST(ast);
	await stdout;
	const convertedProgram = compileTermToProgram(rootTerm);
	const result = transformFromAst(convertedProgram, undefined, {
		babelrc: false,
		filename: path,
		code: true,
		compact: false,
		sourceMaps: true,
	});
	// console.log(rootTerm.children);
	// console.log(JSON.stringify(result.ast, null, 2));
	// console.log(result.map);
	return {
		code: result.code!,
		map: result.map!,
		ast,
	};
}

if (require.main === module) {
	compile(argv[argv.length - 1]).then((result) => {
		console.log(result.code);
	}).catch((e) => {
		// console.error(e instanceof Error ? e.message : e);
		console.error(e);
		process.exit(1);
	});
}
