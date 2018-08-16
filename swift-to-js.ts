import { parse as parseAST, Property, Term } from "./ast";
import { parse as parseType, Type } from "./types";
import { undefinedLiteral, addVariable, emitScope, newScope, rootScope, mangleName, Scope } from "./scope";
import { newPointer, boxed, call, unbox, tuple, variable, expr, read, reuseExpression, ExpressionValue, VariableValue, BuiltinValue, TupleValue, Value } from "./values";
import { builtinFunctions } from "./builtins";

import { stdin } from "process";
import { switchStatement, switchCase, sequenceExpression, objectExpression, thisExpression, objectProperty, assignmentExpression, arrayExpression, memberExpression, functionExpression, program, binaryExpression, blockStatement, booleanLiteral, nullLiteral, stringLiteral, callExpression, conditionalExpression, expressionStatement, ifStatement, identifier, functionDeclaration, numericLiteral, returnStatement, variableDeclaration, variableDeclarator, classDeclaration, logicalExpression, classBody, unaryExpression, whileStatement, Expression, LVal, Statement, Identifier, SwitchCase, IfStatement, MemberExpression, ArrayExpression } from "babel-types";
import { transformFromAst } from "babel-core";

const hasOwnProperty = Object.hasOwnProperty.call.bind(Object.hasOwnProperty);

const structTypes: { [name: string]: Array<[Identifier, Type]> } = Object.create(null);
const defaultValues: { [name: string]: Expression } = {
	"Bool": booleanLiteral(false),
	"Int": numericLiteral(0),
	"Float": numericLiteral(0),
	"Double": numericLiteral(0),
	"String": stringLiteral(""),
	"String.UTF16View": stringLiteral(""),
	"Optional": nullLiteral(),
	"Array": arrayExpression([]),
};

const emptyStatements: Statement[] = [];

function termsWithName(terms: Term[], name: string): Term[] {
	return terms.filter(term => term.name === name);
}

function termWithName(terms: Term[], name: string | RegExp): Term {
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
	throw new Error(`Could not find ${name} term!`);
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

function translateAllStatements(terms: Term[], scope: Scope): Statement[] {
	return terms.reduce((statements: Statement[], term: Term) => {
		const translated = translateStatement(term, scope);
		return translated.length ? statements.concat(translated) : statements;
	}, emptyStatements);
}

function extractMember(decl: string): Identifier {
	// TODO: Parse declarations correctly via PEG
	const match = decl.match(/\.([^.]+)(@|$)/);
	if (match && match.length === 3) {
		return mangleName(match[1]);
	}
	throw new Error(`Unable to parse member: ${decl}`);
}

function extractReference(decl: string): Identifier | string {
	// TODO: Parse declarations correctly via PEG
	const match = decl.match(/\.([^.]+)(@)/);
	if (match && match.length === 3) {
		if (match[1] === "$match") {
			return identifier("$match");
		}
		return mangleName(match[1]);
	}
	const specializationStripped = decl.replace(/ .*/, "");
	if (hasOwnProperty(builtinFunctions, specializationStripped)) {
		return specializationStripped;
	}
	throw new Error(`Unable to parse declaration: ${decl}`);
}

function expectLength<T extends any[]>(array: T, length: number) {
	if (array.length !== length) {
		console.error(array);
		throw new Error(`Expected ${length} items, but got ${array.length}`);
	}
}

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
			return typeRequiresCopy(type.type);
	}
}

function copyValue(value: Expression, type: Type, scope: Scope): Expression {
	switch (type.kind) {
		case "name":
			if (hasOwnProperty(structTypes, type.name) && value.type !== "ObjectExpression") {
				const [first, after] = reuseExpression(value, scope);
				let usedFirst = false;
				return objectExpression(structTypes[type.name].map(([memberIdentifier, memberType]: [Identifier, Type]) => {
					const identifier = usedFirst ? after : (usedFirst = true, first);
					return objectProperty(memberIdentifier, copyValue(memberExpression(identifier, memberIdentifier), memberType, scope));
				}));
			} else {
				return value;
			}
			break;
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
			if (value.type === "ArrayExpression") {
				return value;
			}
			switch (type.types.length) {
				case 0:
					return arrayExpression([]);
				case 1:
					return arrayExpression([copyValue(memberExpression(value, numericLiteral(0), true), type.types[0], scope)]);
				default:
					if (type.types.some(typeRequiresCopy)) {
						const [first, after] = reuseExpression(value, scope);
						const head = copyValue(memberExpression(first, numericLiteral(0), true), type.types[0], scope);
						const tail = type.types.slice(1).map((t, i) => copyValue(memberExpression(after, numericLiteral(i), true), t, scope));
						return arrayExpression([head].concat(tail));
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
			if (typeRequiresCopy(type.type)) {
				const [first, after] = reuseExpression(value, scope);
				// TODO: Support multiple levels of optional
				return conditionalExpression(binaryExpression("===", first, nullLiteral()), nullLiteral(), copyValue(after, type.type, scope));
			} else {
				return value;
			}
		}
		case "namespaced":
			return copyValue(value, type, scope);
	}
}

function storeValue(dest: Identifier | MemberExpression, value: Expression, type: Type, scope: Scope): Expression[] {
	switch (type.kind) {
		case "name":
			if (hasOwnProperty(structTypes, type.name)) {
				const [first, after] = reuseExpression(value, scope);
				let usedFirst = false;
				return structTypes[type.name].reduce((existing, [memberIdentifier, memberType]: [Identifier, Type]) => {
					const identifier = usedFirst ? after : (usedFirst = true, first);
					return existing.concat(storeValue(memberExpression(dest, memberIdentifier), memberExpression(identifier, memberIdentifier), memberType, scope));
				}, [] as Expression[]);
			}
			break;
	}
	// TODO: Actually copy into existing value
	return [assignmentExpression("=", dest, copyValue(value, type, scope))];
}

function defaultInstantiateType(type: Type): Expression {
	switch (type.kind) {
		case "name": {
			if (hasOwnProperty(structTypes, type.name)) {
				return objectExpression(structTypes[type.name].map(([memberIdentifier, memberType]: [Identifier, Type]) => {
					return objectProperty(memberIdentifier, defaultInstantiateType(memberType));
				}));
			}
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
			return arrayExpression(type.types.map(defaultInstantiateType));
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
			return binaryExpression("!==", translatePattern(term.children[0], value, scope), nullLiteral());
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
			const [first, second] = reuseExpression(value, scope);
			return collapseToExpression(term.children.map((child, i) => translatePattern(child, memberExpression(i ? second : first, numericLiteral(i), true), scope)));
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

function translateExpression(term: Term, scope: Scope): Expression {
	return read(translateTermToValue(term, scope), scope);
}

function translateTermToValue(term: Term, scope: Scope): Value {
	switch (term.name) {
		case "member_ref_expr": {
			expectLength(term.children, 1);
			return {
				kind: "direct",
				ref: memberExpression(
					translateExpression(term.children[0], scope),
					extractMember(getProperty(term, "decl", isString))
				)
			};
		}
		case "tuple_element_expr": {
			expectLength(term.children, 1);
			return {
				kind: "direct",
				ref: memberExpression(
					translateExpression(term.children[0], scope),
					numericLiteral(+getProperty(term, "field", isString)),
					true
				)
			};
		}
		case "pattern_typed": {
			expectLength(term.children, 2);
			return translateTermToValue(term.children[0], scope);
		}
		case "declref_expr": {
			expectLength(term.children, 0);
			const name = nameForDeclRefExpr(term);
			const id = extractReference(name);
			if (typeof id === "string") {
				return { kind: "builtin", name: id, type: getType(term) };
			}
			return { kind: "direct", ref: id };
		}
		case "prefix_unary_expr":
		case "call_expr":
		case "constructor_ref_call_expr":
		case "dot_syntax_call_expr":
		case "subscript_expr":
		case "binary_expr": {
			expectLength(term.children, 2);
			const target = term.children[0];
			const args = term.children[1];
			const peekedTarget = translateTermToValue(target, scope);
			const argsValue = getType(args).kind === "tuple" ? translateTermToValue(args, scope) : tuple([translateTermToValue(args, scope)]);
			if (argsValue.kind === "tuple") {
				return call(peekedTarget, argsValue.values, scope);
			} else {
				return expr(callExpression(memberExpression(read(peekedTarget, scope), identifier("apply")), [undefinedLiteral, read(argsValue, scope)]))
			}
		}
		case "tuple_expr": {
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
			return tuple([translateTermToValue(term.children[0], scope)]);
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
			const params: LVal[] = [];
			const parameter_list = termWithName(term.children, "parameter_list");
			for (const param of termsWithName(parameter_list.children, "parameter")) {
				params.push(mangleName(param.args[0]));
			}
			return expr(functionExpression(undefined, params, blockStatement([returnStatement(translateExpression(term.children[1], scope))])));
		}
		default: {
			console.log(term);
			return variable(identifier("unknown_term_type$" + term.name));
		}
	}
}

function translateStatement(term: Term, scope: Scope): Statement[] {
	switch (term.name) {
		case "source_file": {
			return translateAllStatements(term.children, scope);
		}
		case "func_decl": {
			expectLength(term.args, 1);
			const params: LVal[] = [];
			const parameter_list = termWithName(term.children, "parameter_list");
			for (const param of termsWithName(parameter_list.children, "parameter")) {
				params.push(mangleName(param.args[0]));
			}
			const childScope = newScope(term.args[0], scope);
			const statements = translateStatement(termWithName(term.children, "brace_stmt"), childScope);
			return [functionDeclaration(mangleName(term.args[0]), params, blockStatement(emitScope(childScope, statements)))];
		}
		case "return_stmt": {
			expectLength(term.children, 1);
			const expression = translateExpression(term.children[0], scope);
			const expressionCopy = copyValue(expression, getType(term.children[0]), scope);
			return [returnStatement(expressionCopy)];
		}
		case "top_level_code_decl": {
			return translateAllStatements(term.children, scope);
		}
		case "var_decl": {
			expectLength(term.children, 0);
			const name = mangleName(term.args[0]);
			if (addVariable(scope, name, undefined)) {
				const defaultValue = defaultInstantiateType(getType(term));
				if (defaultValue !== undefinedLiteral) {
					return [variableDeclaration("var", [variableDeclarator(name, defaultValue)])];
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
		case "enum_decl":
		case "struct_decl": {
			expectLength(term.args, 1);
			const layout: Array<[Identifier, Type]> = [];
			for (const child of term.children) {
				if (child.name === "var_decl" && getProperty(child, "storage_kind", isString) !== "computed") {
					expectLength(child.args, 1);
					layout.push([mangleName(child.args[0]), getType(child)]);
				}
			}
			structTypes[term.args[0]] = layout;
			return emptyStatements;
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
			// TODO: Fill in body
			return [classDeclaration(mangleName(term.args[0]), undefined, classBody([]), [])];
		}
		default: {
			return [expressionStatement(translateExpression(term, scope))];
		}
	}
}

function main() {
	const input: any[] = [];
	stdin.setEncoding("utf8");
	stdin.resume();
	stdin.on("data", (chunk) => input.push(chunk));
	stdin.on("end", () => {
		const parsed = parseAST(input.join(""));
		const programScope = newScope("global");
		const mapped = program(emitScope(programScope, translateStatement(parsed, programScope)));
		console.log(transformFromAst(mapped).code);
	});
}

main();
