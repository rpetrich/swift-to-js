import { parse as parseAST, Property, Term } from "./ast";
import { parse as parseType, Type } from "./types";
import { undefinedLiteral, addVariable, emitScope, newScope, newRootScope, rootScope, lookup, mangleName, Scope } from "./scope";
import { newPointer, insertFunction, statements, boxed, call, callable, functionValue, unbox, tuple, variable, expr, read, structField, reuseExpression, hoistToIdentifier, stringifyType, ExpressionValue, VariableValue, FunctionValue, StructField, TupleValue, Value } from "./values";
import { functions as builtinFunctions, structTypes as builtinStructTypes, defaultValues as builtinDefaultValues } from "./builtins";

import { spawn } from "child_process";
import { argv } from "process";
import { switchStatement, switchCase, directive, exportSpecifier, exportNamedDeclaration, directiveLiteral, sequenceExpression, objectExpression, newExpression, thisExpression, objectProperty, assignmentExpression, arrayExpression, memberExpression, functionExpression, program, binaryExpression, blockStatement, booleanLiteral, nullLiteral, stringLiteral, callExpression, conditionalExpression, expressionStatement, ifStatement, identifier, functionDeclaration, numericLiteral, returnStatement, variableDeclaration, variableDeclarator, classDeclaration, logicalExpression, classBody, unaryExpression, whileStatement, Expression, LVal, Statement, Identifier, SwitchCase, IfStatement, MemberExpression, ArrayExpression, Program, ThisExpression } from "babel-types";
import { transformFromAst } from "babel-core";

const hasOwnProperty = Object.hasOwnProperty.call.bind(Object.hasOwnProperty);

function concat<T>(head: Array<T>, tail: Array<T>): Array<T>;
function concat<T>(head: ReadonlyArray<T>, tail: ReadonlyArray<T>): ReadonlyArray<T>;
function concat<T>(head: ReadonlyArray<T>, tail: ReadonlyArray<T>): ReadonlyArray<T> | Array<T> {
	if (head.length) {
		return tail.length ? head.concat(tail) : head;
	} else {
		return tail;
	}
}

function getField(value: Value, field: StructField, scope: Scope) {
	if (field.stored) {
		return expr(memberExpression(read(value, scope), mangleName(field.name)));
	} else {
		return field.getter(value, scope);
	}
}

const emptyStatements: Statement[] = [];

function termsWithName(terms: Term[], name: string): Term[] {
	return terms.filter(term => term.name === name);
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
		throw new Error(`Could not find ${name} term!`);
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
	throw new Error(`Could not find ${key} in ${term.name}. Keys are ${Object.keys(props)}`);
}

function extractMember(decl: string): [Type, string] {
	// TODO: Parse declarations correctly via PEG
	const match = decl.match(/([^.]+)\.([^. ]+)(@|$| \[)/);
	if (match && match.length === 4) {
		return [parseType(match[1]), match[2]];
	}
	throw new Error(`Unable to parse member from declaration: ${decl}`);
}

function extractReference(decl: string, scope: Scope): Identifier | ThisExpression | string {
	// TODO: Parse declarations correctly via PEG
	const match = decl.match(/\.([^.]+)(@)/);
	if (match && match.length === 3) {
		if (match[1] === "$match") {
			return identifier("$match");
		}
		return lookup(match[1], scope);
	}
	const specializationStripped = decl.replace(/ .*/, "");
	if (hasOwnProperty(builtinFunctions, specializationStripped)) {
		return specializationStripped;
	}
	throw new Error(`Unable to parse declaration: ${decl}`);
}

function expectLength<T extends any[]>(array: T, ...lengths: number[]) {
	for (let i = 0; i < lengths.length; i++) {
		if (array.length === lengths[i]) {
			return;
		}
	}
	console.error(array);
	throw new Error(`Expected ${lengths.join(" or ")} items, but got ${array.length}`);
}

function isOptionalOfOptional(type: Type): boolean {
	return type.kind === "optional" && type.type.kind === "optional";
}

function isStored(field: StructField) {
	return field.stored;
}

function storedFields(fields: StructField[]) {
	return fields.filter(isStored);
}

function nameForDeclRefExpr(term: Term) {
	if (hasOwnProperty(term.properties, "discriminator")) {
		return getProperty(term, "discriminator", isString);
	}
	return getProperty(term, "decl", isString);
}

function getType(term: Term) {
	try {
		return parseType(getProperty(term, "type", isString));
	} catch (e) {
		console.log(term);
		throw e;
	}
}

function collapseToExpression(expressions: Expression[]): Expression {
	return expressions.length === 0 ? undefinedLiteral : expressions.length === 1 ? expressions[0] : sequenceExpression(expressions);
}

export function compileTermToProgram(root: Term): Program {
	const programScope = newRootScope();
	const structTypes = Object.assign(Object.create(null), builtinStructTypes);
	const defaultValues = Object.assign(Object.create(null), builtinDefaultValues);
	const classTypes: { [name: string]: Array<StructField> } = Object.create(null);

	function typeRequiresCopy(type: Type): boolean {
		switch (type.kind) {
			case "name":
				return hasOwnProperty(structTypes, type.name);
			case "array":
				return true;
			case "modified":
				return typeRequiresCopy(type.type);
			case "dictionary":
				return true;
			case "tuple":
				return true;
			case "generic":
				return typeRequiresCopy(type.base);
			case "metatype":
			case "function":
				return false;
			case "namespaced":
				return typeRequiresCopy(type.type);
			case "optional":
				if (isOptionalOfOptional(type)) {
					return true;
				}
				return typeRequiresCopy(type.type);
		}
	}

	function copyValue(value: Expression, type: Type, scope: Scope): Expression {
		switch (type.kind) {
			case "name":
				if (hasOwnProperty(structTypes, type.name) && value.type !== "ObjectExpression") {
					let usedFirst = false;
					const onlyStored = storedFields(structTypes[type.name]);
					switch (onlyStored.length) {
						case 0:
							break;
						case 1:
							return objectExpression([objectProperty(lookup(onlyStored[0].name, scope), copyValue(read(getField(expr(value), onlyStored[0], scope), scope), onlyStored[0].type, scope))]);
						default:
							const [first, after] = reuseExpression(value, scope);
							return objectExpression(onlyStored.map((fieldLayout) => {
								const identifier = usedFirst ? after : (usedFirst = true, first);
								return objectProperty(mangleName(fieldLayout.name), copyValue(read(getField(expr(identifier), fieldLayout, scope), scope), fieldLayout.type, scope));
							}));
					}
				}
				return value;
			case "array":
				if (value.type === "ArrayExpression") {
					return value;
				}
				if (typeRequiresCopy(type.type)) {
					const id = identifier("v");
					const converter = functionExpression(undefined, [id], blockStatement([returnStatement(copyValue(id, type.type, scope))]));
					return callExpression(memberExpression(value, identifier("map")), [converter]);
				} else {
					return callExpression(memberExpression(value, identifier("slice")), []); 
				}
			case "modified":
				return copyValue(value, type.type, scope);
			case "dictionary":
				// TODO: Support dictionary types
				return value;
			case "tuple":
				switch (type.types.length) {
					case 0:
						return undefinedLiteral;
					case 1:
						return value;
					default:
						if (value.type === "ArrayExpression") {
							return value;
						}
						if (type.types.some(typeRequiresCopy)) {
							const [first, after] = reuseExpression(value, scope);
							return arrayExpression(type.types.map((t, i) => copyValue(memberExpression(i ? after : first, numericLiteral(i), true), t, scope)));
						} else {
							return callExpression(memberExpression(value, identifier("slice")), []); 
						}
				}
				break;
			case "generic":
				// TODO: Support generic types
				return value;
			case "metatype":
			case "function":
				return value;
			case "optional": {
				if (isOptionalOfOptional(type)) {
					if (typeRequiresCopy(type.type)) {
						const [first, after] = reuseExpression(value, scope);
						return conditionalExpression(binaryExpression("===", memberExpression(first, identifier("length")), numericLiteral(0)), arrayExpression([]), copyValue(after, type.type, scope));
					} else {
						return callExpression(memberExpression(value, identifier("slice")), []);
					}
				} else if (typeRequiresCopy(type.type)) {
					const [first, after] = reuseExpression(value, scope);
					return conditionalExpression(binaryExpression("===", first, nullLiteral()), nullLiteral(), copyValue(after, type.type, scope));
				} else {
					return value;
				}
			}
			case "namespaced":
				return copyValue(value, type.type, scope);
		}
	}

	function storeValue(dest: Identifier | MemberExpression, value: Expression, type: Type, scope: Scope): Expression[] {
		switch (type.kind) {
			case "name":
				if (hasOwnProperty(structTypes, type.name)) {
					const onlyStored = storedFields(structTypes[type.name]);
					if (onlyStored.length) {
						const [first, after] = reuseExpression(value, scope);
						let usedFirst = false;
						return onlyStored.reduce((existing, fieldLayout) => {
							const identifier = usedFirst ? after : (usedFirst = true, first);
							return concat(existing, storeValue(mangleName(fieldLayout.name), read(getField(expr(identifier), fieldLayout, scope), scope), fieldLayout.type, scope));
						}, [] as Expression[]);
					}
				}
				break;
		}
		return [assignmentExpression("=", dest, copyValue(value, type, scope))];
	}

	function defaultInstantiateType(type: Type): Expression {
		switch (type.kind) {
			case "name": {
				if (hasOwnProperty(defaultValues, type.name)) {
					return defaultValues[type.name];
				}
				if (hasOwnProperty(structTypes, type.name)) {
					const onlyStored = storedFields(structTypes[type.name]);
					if (onlyStored.length !== 0) {
						return objectExpression(onlyStored.map((field: StructField) => {
							return objectProperty(mangleName(field.name), defaultInstantiateType(field.type));
						}));
					}
				}
				return undefinedLiteral;
			}
			case "array": {
				return arrayExpression([]); 
			}
			case "modified": {
				return defaultInstantiateType(type.type);
			}
			case "dictionary": {
				// TODO: Support dictionary types
				return undefinedLiteral;
			}
			case "tuple": {
				switch (type.types.length) {
					case 0:
						return undefinedLiteral;
					case 1:
						return defaultInstantiateType(type.types[0]);
					default:
						return arrayExpression(type.types.map(defaultInstantiateType));
				}
			}
			case "generic": {
				// TODO: Support generic types
				return undefinedLiteral;
			}
			case "metatype":
			case "function": {
				// Not even clear what should be done here
				return undefinedLiteral;
			}
			case "optional": {
				return nullLiteral();
			}
			case "namespaced": {
				return defaultInstantiateType(type.type);
			}
		}
	}

	function translatePattern(term: Term, value: Expression, scope: Scope): Expression {
		switch (term.name) {
			case "optional_some_element": {
				expectLength(term.children, 1);
				const type = getType(term);
				if (type.kind !== "optional") {
					throw new TypeError(`Expected optional, got ${stringifyType(type)}`);
				}
				const translated = translatePattern(term.children[0], value, scope);
				if (isOptionalOfOptional(type)) {
					return binaryExpression("!==", memberExpression(translated, identifier("length")), numericLiteral(0));
				}
				return binaryExpression("!==", translated, nullLiteral());
			}
			case "case_label_item":
			case "pattern_let": {
				expectLength(term.children, 1);
				return translatePattern(term.children[0], value, scope);
			}
			case "pattern_expr": {
				expectLength(term.children, 1);
				return translateExpression(term.children[0], scope);
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
				if (addVariable(scope, name)) {
					return assignmentExpression("=", name, copyValue(value, type, scope));
				} else {
					return collapseToExpression(storeValue(name, value, type, scope));
				}
			}
			case "pattern_tuple": {
				const type = getType(term);
				if (type.kind !== "tuple") {
					throw new TypeError(`Expected a tuple, got a ${stringifyType(type)}`);
				}
				switch (type.types.length) {
					case 0:
						return undefinedLiteral;
					case 1:
						return value;
					default:
						const [first, second] = reuseExpression(value, scope);
						return collapseToExpression(term.children.map((child, i) => translatePattern(child, memberExpression(i ? second : first, numericLiteral(i), true), scope)));
				}
			}
			case "pattern_any": {
				return booleanLiteral(true);
			}
			default: {
				console.log(term);
				return identifier("unknown_pattern_type$" + term.name);
			}
		}
	}

	function getStructOrClassForType(type: Type) {
		switch (type.kind) {
			case "name":
				if (hasOwnProperty(structTypes, type.name)) {
					return structTypes[type.name];
				}
				if (hasOwnProperty(classTypes, type.name)) {
					return classTypes[type.name];
				}
				throw new TypeError(`Could not find type ${stringifyType(type)}`);
			default:
				throw new TypeError(`Type is not a struct: ${stringifyType(type)}`);
		}
	}


	function translateExpression(term: Term, scope: Scope): Expression {
		return read(translateTermToValue(term, scope), scope);
	}

	function translateTermToValue(term: Term, scope: Scope): Value {
		switch (term.name) {
			case "member_ref_expr": {
				expectLength(term.children, 1);
				const [type, member] = extractMember(getProperty(term, "decl", isString));
				for (const field of getStructOrClassForType(type)) {
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
					true
				));
			}
			case "pattern_typed": {
				expectLength(term.children, 2);
				return translateTermToValue(term.children[0], scope);
			}
			case "declref_expr": {
				expectLength(term.children, 0);
				const name = nameForDeclRefExpr(term);
				const id = extractReference(name, scope);
				if (typeof id === "string") {
					return functionValue(id, getType(term));
				}
				return variable(id);
			}
			case "subscript_expr": {
				expectLength(term.children, 2);
				return expr(copyValue(memberExpression(translateExpression(term.children[0], scope), translateExpression(term.children[1], scope), true), getType(term), scope));
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
					return call(peekedTarget, argsValue.values, scope);
				} else {
					return expr(callExpression(memberExpression(read(peekedTarget, scope), identifier("apply")), [undefinedLiteral, read(argsValue, scope)]))
				}
			}
			case "tuple_expr": {
				if (term.children.length === 1) {
					return translateTermToValue(term.children[0], scope);
				}
				return {
					kind: "tuple",
					values: term.children.map((child) => translateTermToValue(child, scope))
				};
			}
			case "type_expr": {
				expectLength(term.children, 0);
				return expr(mangleName(getProperty(term, "type", isString)));
			}
			case "boolean_literal_expr": {
				expectLength(term.children, 0);
				return expr(booleanLiteral(getProperty(term, "value", isString) === "true"))
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
				return tuple(term.children.map((child) => translateTermToValue(child, scope)));
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
					translateExpression(term.children[2], scope)
				));
			}
			case "inject_into_optional":
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
				const dest = unbox(translateTermToValue(term.children[0], scope), scope);
				const expressions = storeValue(read(dest, scope), translateExpression(term.children[1], scope), type, scope);
				return expr(collapseToExpression(expressions));
			}
			case "inout_expr": {
				expectLength(term.children, 1);
				return boxed(translateTermToValue(term.children[0], scope));
			}
			case "pattern": {
				expectLength(term.children, 2);
				return expr(translatePattern(term.children[0], translateExpression(term.children[1], scope), scope));
			}
			case "closure_expr":
			case "autoclosure_expr": {
				expectLength(term.children, 2);
				const parameter_list = termWithName(term.children, "parameter_list");
				return callable((scope, arg) => {
					const childScope = newScope("anonymous", scope);
					termsWithName(parameter_list.children, "parameter").forEach((param, index) => {
						childScope.mapping[param.args[0]] = hoistToIdentifier(read(arg(index, param.args[0]), childScope), childScope);
					});
					const expression = translateTermToValue(term.children[1], childScope);
					return expression;
				}, getType(term));
			}
			default: {
				console.log(term);
				return variable(identifier("unknown_term_type$" + term.name));
			}
		}
	}

	function translateAllStatements(terms: Term[], scope: Scope): Statement[] {
		return terms.reduce((statements: Statement[], term: Term) => {
			return concat(statements, translateStatement(term, scope));
		}, emptyStatements);
	}

	function translateStatement(term: Term, scope: Scope): Statement[] {
		switch (term.name) {
			case "source_file": {
				return translateAllStatements(term.children, scope);
			}
			case "constructor_decl":
			case "func_decl": {
				expectLength(term.args, 1);
				const braceStatement = findTermWithName(term.children, "brace_stmt");
				if (typeof braceStatement === "undefined") {
					return emptyStatements;
				}
				const parameterLists = termsWithName(term.children, "parameter_list");
				let selfParameterList: Term | undefined;
				let parameterList: Term;
				expectLength(parameterLists, 1, 2);
				switch (parameterLists.length) {
					case 1:
						parameterList = parameterLists[0];
						break;
					default:
						selfParameterList = parameterLists[0];
						parameterList = parameterLists[1];
						break;
				}
				scope.functions[term.args[0]] = (scope, arg, type) => {
					const childScope = newScope(term.args[0], scope);
					if (selfParameterList) {
						childScope.mapping["self"] = thisExpression();
					}
					termsWithName(parameterList.children, "parameter").forEach((param, index) => {
						childScope.mapping[param.args[0]] = hoistToIdentifier(read(arg(index, param.args[0]), childScope), childScope);
					});
					const stmts = emitScope(childScope, translateStatement(braceStatement, childScope));
					return statements(stmts);
				};
				if (term.properties.access === "public") {
					const identifier = insertFunction(term.args[0], scope, getType(term));
					return [exportNamedDeclaration(undefined, [exportSpecifier(identifier, identifier)])];
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
					const expression = copyValue(read(value, scope), getType(term.children[0]), scope);
					return [returnStatement(expression)];
				} else {
					return [returnStatement()];
				}
			}
			case "top_level_code_decl": {
				return translateAllStatements(term.children, scope);
			}
			case "var_decl": {
				expectLength(term.children, 0);
				const name = mangleName(term.args[0]);
				addVariable(scope, name, defaultInstantiateType(getType(term)));
				return emptyStatements;	
			}
			case "brace_stmt": {
				return translateAllStatements(term.children, scope);
			}
			case "if_stmt": {
				const children = term.children;
				if (children.length === 3) {
					return [ifStatement(translateExpression(children[0], scope), blockStatement(translateStatement(children[1], scope)), blockStatement(translateStatement(children[2], scope)))];
				}
				if (children.length === 2) {
					return [ifStatement(translateExpression(children[0], scope), blockStatement(translateStatement(children[1], scope)))];
				}
				throw new Error(`Expected 2 or 3 terms, got ${children.length}`);
			}
			case "while_stmt": {
				expectLength(term.children, 2);
				return [whileStatement(translateExpression(term.children[0], scope), blockStatement(translateStatement(term.children[1], scope)))];
			}
			case "switch_stmt": {
				if (term.children.length < 1) {
					throw new Error(`Expected at least one term, got ${term.children.length}`);
				}
				const declaration = variableDeclaration("var", [variableDeclarator(identifier("$match"), translateExpression(term.children[0], scope))]);
				const cases = term.children.slice(1).reduceRight((previous: Statement | undefined, term: Term): Statement => {
					if (term.name !== "case_stmt") {
						throw new Error(`Expected a case_stmt, got a ${term.name}`);
					}
					if (term.children.length < 1) {
						throw new Error(`Expected at least one term, got ${term.children.length}`);
					}
					const predicate = term.children.slice(0, term.children.length - 1).map(child => translatePattern(child, identifier("$match"), scope)).reduce((previous, current) => logicalExpression("||", previous, current));
					const body = blockStatement(translateStatement(term.children[term.children.length - 1], scope));
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
				return emptyStatements;
			}
			case "struct_decl": {
				expectLength(term.args, 1);
				let statements: Array<Statement> = [];
				const layout: Array<StructField> = [];
				structTypes[term.args[0]] = layout;
				for (const child of term.children) {
					if (child.name === "var_decl") {
						expectLength(child.args, 1);
						if (getProperty(child, "storage_kind", isString) !== "computed") {
							layout.push(structField(child.args[0], getType(child)));
						} else {
							expectLength(child.children, 1);
							layout.push(structField(child.args[0], getType(child), (value: Value, scope: Scope) => {
								console.log("computedStruct invoked", child.children[0]);
								return value;
							}));
							statements = concat(statements, translateStatement(child.children[0], scope));
						}
					} else {
						statements = concat(statements, translateStatement(child, scope));
					}
				}
				return statements;
			}
			case "pattern_binding_decl": {
				if (term.children.length === 2) {
					return [expressionStatement(translatePattern(term.children[0], translateExpression(term.children[1], scope), scope))];
				}
				if (term.children.length === 1) {
					return emptyStatements;
				}
				throw new Error(`Expected 1 or 2 terms, got ${term.children.length}`);
			}
			case "class_decl": {
				expectLength(term.args, 1);
				const layout: Array<StructField> = [];
				classTypes[term.args[0]] = layout;
				for (const child of term.children) {
					if (child.name === "var_decl") {
						expectLength(child.args, 1);
						if (getProperty(child, "storage_kind", isString) !== "computed") {
							layout.push(structField(child.args[0], getType(child)));
						} else {
							expectLength(child.children, 1);
							layout.push(structField(child.args[0], getType(child), (value: Value, scope: Scope) => {
								console.log("computedStruct invoked", child.children[0]);
								return value;
							}));
						}
					}
				}
				// TODO: Fill in body
				return [classDeclaration(mangleName(term.args[0]), undefined, classBody([]), [])];
			}
			default: {
				return [expressionStatement(translateExpression(term, scope))];
			}
		}
	}

	return program(emitScope(programScope, translateStatement(root, programScope)));
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

export async function compile(path: string): Promise<string | undefined> {
	const process = spawn("swiftc", ["-dump-ast", path]);
	const stdout = readAsString(process.stdout);
	const stderr = readAsString(process.stderr);
	await new Promise((resolve, reject) => {
		process.on("exit", (code, signal) => {
			if (code !== 0) {
				reject(new Error(`swiftc failed with ${code}`));
			} else {
				resolve();
			}
		});
	});
	const rootTerm = parseAST(await stderr);
	await stdout;
	const program = compileTermToProgram(rootTerm);
	return transformFromAst(program).code;
}

if (require.main === module) {
	compile(argv[argv.length - 1]).then(console.log);
}
