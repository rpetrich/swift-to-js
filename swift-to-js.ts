import { parse as parseAST, Property, Term } from "./ast";
import { defaultValues as builtinDefaultValues, structTypes as builtinStructTypes } from "./builtins";
import { FunctionBuilder, insertFunction, noinline, returnType, wrapped } from "./functions";
import { addExternalVariable, addVariable, emitScope, lookup, mangleName, newRootScope, newScope, rootScope, Scope, undefinedLiteral, uniqueIdentifier } from "./scope";
import { parse as parseType, Type } from "./types";
import { ArgGetter, boxed, call, callable, expr, ExpressionValue, functionValue, FunctionValue, hoistToIdentifier, newPointer, read, reuseExpression, statements, stringifyType, StructField, structField, tuple, TupleValue, unbox, undefinedValue, Value, variable, VariableValue } from "./values";

import { transformFromAst } from "babel-core";
import { ArrayExpression, arrayExpression, assignmentExpression, binaryExpression, blockStatement, booleanLiteral, callExpression, classBody, classDeclaration, conditionalExpression, exportNamedDeclaration, exportSpecifier, Expression, expressionStatement, functionDeclaration, functionExpression, identifier, Identifier, IfStatement, ifStatement, isLiteral, logicalExpression, LVal, memberExpression, MemberExpression, newExpression, nullLiteral, numericLiteral, objectExpression, objectProperty, program, Program, returnStatement, sequenceExpression, Statement, stringLiteral, switchCase, SwitchCase, switchStatement, thisExpression, ThisExpression, unaryExpression, variableDeclaration, variableDeclarator, whileStatement } from "babel-types";
import { spawn } from "child_process";
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

function getField(value: Value, field: StructField, scope: Scope) {
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

function extractReference(term: Term, scope: Scope): Value {
	// TODO: Parse declarations correctly via PEG
	const decl = nameForDeclRefExpr(term);
	const match = decl.match(/\.([^.]+)(@)/);
	if (match && match.length === 3) {
		const extracted = match[1];
		if (Object.hasOwnProperty.call(scope.functions, extracted)) {
			return functionValue(extracted, getType(term));
		}
		if (extracted === "$match") {
			return variable(identifier("$match"));
		}
		return variable(lookup(extracted, scope));
	}
	const specializationStripped = decl.replace(/ .*/, "");
	if (hasOwnProperty(scope.functions, specializationStripped)) {
		return functionValue(specializationStripped, getType(term));
	}
	throw new Error(`Unable to parse declaration: ${decl}`);
}

function expectLength<T extends any[]>(array: T, ...lengths: number[]) {
	for (const length of lengths) {
		if (array.length === length) {
			return;
		}
	}
	console.error(array);
	throw new Error(`Expected ${lengths.join(" or ")} items, but got ${array.length}`);
}

function isNestedOptional(type: Type): boolean {
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
	const structTypes: typeof builtinStructTypes = Object.assign(Object.create(null), builtinStructTypes);
	const defaultValues: typeof builtinDefaultValues = Object.assign(Object.create(null), builtinDefaultValues);
	const classTypes: { [name: string]: StructField[] } = Object.create(null);

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
				if (isNestedOptional(type)) {
					return true;
				}
				return typeRequiresCopy(type.type);
			default:
				throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
		}
	}

	function copyValue(value: Value, type: Type, scope: Scope): Value {
		// if (value.kind === "direct" && value.ref.type === "Identifier" && Object.hasOwnProperty.call(scope.declarations, value.ref.name)) {
		// 	return value;
		// }
		if (value.kind === "expression" && (value.expression.type === "ObjectExpression" || value.expression.type === "ArrayExpression" || value.expression.type === "CallExpression" || isLiteral(value.expression))) {
			return value;
		}
		switch (type.kind) {
			case "name":
				if (hasOwnProperty(structTypes, type.name)) {
					let usedFirst = false;
					const onlyStored = storedFields(structTypes[type.name]);
					switch (onlyStored.length) {
						case 0:
							// Empty structs should be passed through in case value has side effects
							return value;
						case 1:
							// Unary structs are unwrapped
							return copyValue(value, onlyStored[0].type, scope);
						default:
							// Binary and larger structs are copied field by field in order
							const [first, after] = reuseExpression(read(value, scope), scope);
							return expr(objectExpression(onlyStored.map((fieldLayout) => {
								const identifier = usedFirst ? after : (usedFirst = true, first);
								return objectProperty(mangleName(fieldLayout.name), read(copyValue(getField(expr(identifier), fieldLayout, scope), fieldLayout.type, scope), scope));
							})));
					}
				}
				return value;
			case "array": {
				const expression = read(value, scope);
				if (expression.type === "ArrayExpression") {
					return expr(expression);
				}
				if (typeRequiresCopy(type.type)) {
					// Arrays of complex types are mapped using a generated copy function
					const id = uniqueIdentifier(scope, "value");
					const converter = functionExpression(undefined, [id], blockStatement([returnStatement(read(copyValue(expr(id), type.type, scope), scope))]));
					return expr(callExpression(memberExpression(expression, identifier("map")), [converter]));
				} else {
					// Arrays of simple types are sliced
					return expr(callExpression(memberExpression(expression, identifier("slice")), []));
				}
			}
			case "modified":
				return copyValue(value, type.type, scope);
			case "dictionary":
				// TODO: Support dictionary types
				return value;
			case "tuple":
				switch (type.types.length) {
					case 0:
						// Empty tuples should be passed through in case value has side effects
						return value;
					case 1:
						// Unary tuples are unwrapped
						return copyValue(value, type.types[0], scope);
					default:
						const expression = read(value, scope);
						if (expression.type === "ArrayExpression") {
							return expr(expression);
						}
						// Binary and larger structs are copied
						if (type.types.some(typeRequiresCopy)) {
							// Tuples containing complex types need to be copied
							const [first, after] = reuseExpression(expression, scope);
							return expr(arrayExpression(type.types.map((t, i) => read(copyValue(expr(memberExpression(i ? after : first, numericLiteral(i), true)), t, scope), scope))));
						} else {
							// If all fields are simple, tuple can be sliced
							return expr(callExpression(memberExpression(expression, identifier("slice")), []));
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
				if (isNestedOptional(type)) {
					// Nested optionals require special support since they're stored as [] for .none, [null] for .some(.none) and [v] for .some(.some(v))
					if (typeRequiresCopy(type.type)) {
						// Nested optional of a non-simple type
						const [first, after] = reuseExpression(read(value, scope), scope);
						return expr(conditionalExpression(
							binaryExpression("===", memberExpression(first, identifier("length")), numericLiteral(0)),
							arrayExpression([]),
							read(copyValue(expr(after), type.type, scope), scope),
						));
					} else {
						// Nested Optionals of simple value are sliced
						return expr(callExpression(memberExpression(read(value, scope), identifier("slice")), []));
					}
				} else if (typeRequiresCopy(type.type)) {
					// Optionals are copied by-value if non-null
					const [first, after] = reuseExpression(read(value, scope), scope);
					return expr(conditionalExpression(
						binaryExpression("===", first, nullLiteral()),
						nullLiteral(),
						read(copyValue(expr(after), type.type, scope), scope),
					));
				} else {
					// Optionals of simple value are passed through
					return value;
				}
			}
			case "namespaced":
				return copyValue(value, type.type, scope);
			default:
				throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
		}
	}

	function storeValue(dest: Identifier | MemberExpression, value: Value, type: Type, scope: Scope): Expression[] {
		switch (type.kind) {
			case "name":
				if (hasOwnProperty(structTypes, type.name)) {
					const onlyStored = storedFields(structTypes[type.name]);
					switch (onlyStored.length) {
						case 0:
						case 1:
							break;
						default:
							const [first, after] = reuseExpression(read(value, scope), scope);
							let usedFirst = false;
							return onlyStored.reduce((existing, fieldLayout) => {
								const identifier = usedFirst ? after : (usedFirst = true, first);
								return concat(existing, storeValue(mangleName(fieldLayout.name), getField(expr(identifier), fieldLayout, scope), fieldLayout.type, scope));
							}, [] as Expression[]);
					}
				}
				break;
			default:
				// TODO: support other types
				break;
		}
		return [assignmentExpression("=", dest, read(copyValue(value, type, scope), scope))];
	}

	function returnUndef() {
		return undefined;
	}

	function defaultInstantiateType(type: Type, consume: (fieldName: string) => Expression | undefined): Expression {
		switch (type.kind) {
			case "name": {
				if (hasOwnProperty(defaultValues, type.name)) {
					return defaultValues[type.name];
				}
				if (hasOwnProperty(structTypes, type.name)) {
					const onlyStored = storedFields(structTypes[type.name]);
					if (onlyStored.length !== 0) {
						return objectExpression(onlyStored.map((field: StructField) => {
							const name = field.name;
							const value = consume(name);
							return objectProperty(mangleName(name), value ? value : defaultInstantiateType(field.type, returnUndef));
						}));
					}
				}
				return undefinedLiteral;
			}
			case "array": {
				return arrayExpression([]);
			}
			case "modified": {
				return defaultInstantiateType(type.type, returnUndef);
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
						return defaultInstantiateType(type.types[0], returnUndef);
					default:
						return arrayExpression(type.types.map((innerType) => defaultInstantiateType(innerType, returnUndef)));
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
				return defaultInstantiateType(type.type, returnUndef);
			}
			default:
				throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
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
				if (isNestedOptional(type)) {
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
				if (Object.hasOwnProperty.call(scope.declarations, name)) {
					return collapseToExpression(storeValue(name, expr(value), type, scope));
				} else {
					addVariable(scope, name);
					return assignmentExpression("=", name, read(copyValue(expr(value), type, scope), scope));
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
				return copyValue(expr(memberExpression(translateExpression(term.children[0], scope), translateExpression(term.children[1], scope), true)), getType(term), scope);
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
				return expr(arrayExpression(term.children.map((child) => translateExpression(child, scope))));
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
				const expressions = storeValue(read(dest, scope), translateTermToValue(term.children[1], scope), type, scope);
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
				const isConstructor = term.name === "constructor_decl";
				expectLength(term.args, 1);
				const name = term.args[0];

				function constructCallable(parameterList: Term, remainingLists: Term[], functionType: Type, initialScope?: Scope): (scope: Scope, arg: ArgGetter) => Value {
					return (targetScope: Scope, arg: ArgGetter) => {
						const childScope = typeof initialScope !== "undefined" ? initialScope : newScope(name, targetScope);
						termsWithName(parameterList.children, "parameter").forEach((param, index) => {
							expectLength(param.args, 1);
							const parameterName = param.args[0];
							targetScope.mapping[parameterName] = hoistToIdentifier(read(arg(index, parameterName), childScope), childScope, parameterName);
						});
						if (remainingLists.length) {
							return callable(constructCallable(remainingLists[0], remainingLists.slice(1), returnType(functionType), initialScope), functionType);
						}
						const body = termWithName(term.children, "brace_stmt").children.slice();
						if (isConstructor) {
							const typeOfResult = returnType(returnType(getType(term)));
							const selfMapping = childScope.mapping.self = uniqueIdentifier(childScope, "self");
							const defaultInstantiation = defaultInstantiateType(typeOfResult, (fieldName) => {
								if (body.length && body[0].name === "assign_expr") {
									const children = body[0].children;
									expectLength(children, 2);
									if (children[0].name === "member_ref_expr") {
										const [fieldType, member] = extractMember(getProperty(children[0], "decl", isString));
										if (member === fieldName) {
											body.shift();
											return translateExpression(children[1], childScope);
										}
									}
								}
								return undefined;
							});
							if (body.length === 1 && body[0].name === "return_stmt" && body[0].properties.implicit) {
								return statements(emitScope(childScope, [returnStatement(defaultInstantiation)]));
							}
							addVariable(childScope, selfMapping, defaultInstantiation);
						}
						return statements(emitScope(childScope, translateAllStatements(body, childScope)));
					};
				}

				const parameterLists = termsWithName(term.children, "parameter_list");
				if (parameterLists.length === 0) {
					throw new Error(`Expected a parameter list for a function declaration`);
				}

				const fn = constructCallable(parameterLists[0], parameterLists.slice(1), getType(term));
				if (!isConstructor && term.properties.access === "public") {
					insertFunction(name, scope, getType(term), fn, true);
				} else {
					scope.functions[name] = isConstructor || /^anonname=/.test(name) ? fn : noinline(fn);
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
				return translateAllStatements(term.children, scope);
			}
			case "var_decl": {
				expectLength(term.children, 0);
				const name = mangleName(term.args[0]);
				if (Object.hasOwnProperty.call(scope.declarations, name.name)) {
					if (term.properties.access === "public") {
						scope.declarations[name.name] = exportNamedDeclaration(scope.declarations[name.name], []);
					}
				} else {
					const defaultInstantiation = defaultInstantiateType(getType(term), returnUndef);
					if (term.properties.access === "public") {
						addExternalVariable(scope, name, defaultInstantiation);
					} else {
						addVariable(scope, name, defaultInstantiation);
					}
				}
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
				const cases = term.children.slice(1).reduceRight((previous: Statement | undefined, childTerm: Term): Statement => {
					if (childTerm.name !== "case_stmt") {
						throw new Error(`Expected a case_stmt, got a ${childTerm.name}`);
					}
					if (childTerm.children.length < 1) {
						throw new Error(`Expected at least one term, got ${childTerm.children.length}`);
					}
					const predicate = childTerm.children.slice(0, childTerm.children.length - 1).map((child) => translatePattern(child, identifier("$match"), scope)).reduce((left, right) => logicalExpression("||", left, right));
					const body = blockStatement(translateStatement(childTerm.children[childTerm.children.length - 1], scope));
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
				let statements: Statement[] = [];
				const layout: StructField[] = [];
				structTypes[term.args[0]] = layout;
				for (const child of term.children) {
					if (child.name === "var_decl") {
						expectLength(child.args, 1);
						if (getProperty(child, "storage_kind", isString) !== "computed") {
							layout.push(structField(child.args[0], getType(child)));
						} else {
							expectLength(child.children, 1);
							layout.push(structField(child.args[0], getType(child), (value: Value, innerScope: Scope) => {
								const declaration = termWithName(child.children, "func_decl");
								return call(call(functionValue(declaration.args[0], getType(declaration)), undefinedValue, [value], innerScope), undefinedValue, [], innerScope);
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
				const layout: StructField[] = [];
				classTypes[term.args[0]] = layout;
				for (const child of term.children) {
					if (child.name === "var_decl") {
						expectLength(child.args, 1);
						if (getProperty(child, "storage_kind", isString) !== "computed") {
							layout.push(structField(child.args[0], getType(child)));
						} else {
							expectLength(child.children, 1);
							layout.push(structField(child.args[0], getType(child), (value: Value, innerScope: Scope) => {
								const declaration = termWithName(child.children, "func_decl");
								return call(call(functionValue(declaration.args[0], getType(declaration)), undefinedValue, [value], innerScope), undefinedValue, [], innerScope);
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
	const rootTerm = parseAST(await stderr);
	await stdout;
	const program = compileTermToProgram(rootTerm);
	return transformFromAst(program).code;
}

if (require.main === module) {
	compile(argv[argv.length - 1]).then(console.log).catch((e) => {
		// console.error(e instanceof Error ? e.message : e);
		console.error(e);
		process.exit(1);
	});
}
