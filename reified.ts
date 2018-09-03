import { mangleName, Scope } from "./scope";
import { parse as parseType, Type } from "./types";
import { expr, read, reuseExpression, undefinedValue, Value } from "./values";

import { arrayExpression, assignmentExpression, booleanLiteral, Expression, Identifier, isLiteral, memberExpression, MemberExpression, nullLiteral, numericLiteral, objectExpression, objectProperty, stringLiteral } from "babel-types";

export enum PossibleRepresentation {
	None,
	Undefined = 1 << 0,
	Boolean = 1 << 1,
	Number = 1 << 2,
	String = 1 << 3,
	Function = 1 << 4, // Not used currently
	Object = 1 << 5,
	Symbol = 1 << 6, // Not used currently, possibly ever
	Null = 1 << 7, // Not referenced by typeof, but modeled in our system
	Array = 1 << 8, // Supported via Array.isArray
}

export interface ReifiedType {
	fields: ReadonlyArray<Field>;
	possibleRepresentations: PossibleRepresentation;
	defaultValue(scope: Scope, consume: (fieldName: string) => Expression | undefined): Value;
	copy?(value: Value, scope: Scope): Value;
	store?(target: Identifier | MemberExpression, value: Value, scope: Scope): Expression[];
}

export type Field = {
	name: string;
	type: ReifiedType;
} & ({ stored: true } | { stored: false; getter: (target: Value, scope: Scope) => Value; });

function representationForFields(storedFields: ReadonlyArray<Field>) {
	switch (storedFields.length) {
		case 0:
			return PossibleRepresentation.Undefined;
		case 1:
			return storedFields[0].type.possibleRepresentations;
		default:
			return PossibleRepresentation.Object;
	}
}

export function primitive(possibleRepresentations: PossibleRepresentation, defaultValue: Value, fields: ReadonlyArray<Field> = []): ReifiedType {
	return {
		fields,
		possibleRepresentations,
		defaultValue() {
			return defaultValue;
		},
	};
}

function inheritLayout(type: ReifiedType, fields: ReadonlyArray<Field>) {
	return {
		fields,
		possibleRepresentations: type.possibleRepresentations,
		defaultValue: type.defaultValue,
		copy: type.copy,
		store: type.store,
	};
}

export function struct(fields: ReadonlyArray<Field>): ReifiedType {
	const onlyStored = storedFields(fields);
	switch (onlyStored.length) {
		case 0:
			return {
				fields,
				possibleRepresentations: PossibleRepresentation.Undefined,
				defaultValue() {
					return undefinedValue;
				},
			};
		case 1:
			// TODO: Map fields appropriately on unary structs
			return inheritLayout(onlyStored[0].type, fields);
		default:
			return {
				fields,
				possibleRepresentations: PossibleRepresentation.Object,
				defaultValue(scope, consume) {
					return expr(objectExpression(onlyStored.map((field) => {
						const value = consume(field.name);
						return objectProperty(mangleName(field.name), value ? value : read(field.type.defaultValue(scope, alwaysUndefined), scope));
					})));
				},
				copy(value, scope) {
					let usedFirst = false;
					const expression = read(value, scope);
					if (expressionSkipsCopy(expression)) {
						return expr(expression);
					}
					const [first, after] = reuseExpression(expression, scope);
					return expr(objectExpression(onlyStored.map((field) => {
						const identifier = usedFirst ? after : (usedFirst = true, first);
						const propertyExpr = memberExpression(identifier, mangleName(field.name));
						const copiedValue = field.type.copy ? read(field.type.copy(expr(propertyExpr), scope), scope) : propertyExpr;
						return objectProperty(mangleName(field.name), copiedValue);
					})));
				},
				// store(target, value, scope) {
				// 	let usedFirst = false;
				// 	const [first, after] = reuseExpression(read(value, scope), scope);
				// 	return onlyStored.reduce((existing, fieldLayout) => {
				// 		const identifier = usedFirst ? after : (usedFirst = true, first);
				// 		return existing.concat(storeValue(mangleName(fieldLayout.name), getField(expr(identifier), fieldLayout, scope), fieldLayout.type, scope));
				// 	}, [] as Expression[]);
				// },
			};
	}
}

export function newClass(fields: ReadonlyArray<Field>): ReifiedType {
	return {
		fields,
		possibleRepresentations: PossibleRepresentation.Object,
		defaultValue() {
			throw new Error(`Cannot default instantiate a class!`);
		},
	};
}

export function field(name: string, type: ReifiedType, getter?: (target: Value, scope: Scope) => Value): Field {
	if (getter) {
		return {
			name,
			type,
			stored: false,
			getter,
		};
	}
	return {
		name,
		type,
		stored: true,
	};
}

function isStored(field: Field) {
	return field.stored;
}

function storedFields(fields: ReadonlyArray<Field>) {
	return fields.filter(isStored);
}

export function expressionSkipsCopy(expr: Expression): boolean {
	switch (expr.type) {
		case "ObjectExpression":
		case "ArrayExpression":
		case "CallExpression":
			return true;
		case "ConditionalExpression":
			return expressionSkipsCopy(expr.consequent) && expressionSkipsCopy(expr.alternate);
		default:
			return isLiteral(expr);
	}
}

export function copyValue(value: Value, type: Type, scope: Scope): Value {
	// if (value.kind === "expression") {
	// 	if (expressionSkipsCopy(value.expression)) {
	// 		return value;
	// 	} else {
	// 		// console.log("copy required for expression", value.expression);
	// 	}
	// } else {
	// 	// console.log("copy required for value", value);
	// }
	const reified = reifyType(type, scope);
	if (reified.copy) {
		return reified.copy(value, scope);
	}
	return value;
}

export function storeValue(dest: Identifier | MemberExpression, value: Value, type: Type, scope: Scope): Expression[] {
	const reified = reifyType(type, scope);
	if (reified.store) {
		return reified.store(dest, value, scope);
	} else {
		return [assignmentExpression("=", dest, read(copyValue(value, type, scope), scope))];
	}
}

export function defaultInstantiateType(type: Type, scope: Scope, consume: (fieldName: string) => Expression | undefined): Value {
	return reifyType(type, scope).defaultValue(scope, consume);
}


export function reifyType(typeOrTypeName: Type | string, scope: Scope): ReifiedType {
	const type = typeof typeOrTypeName === "string" ? parseType(typeOrTypeName) : typeOrTypeName;
	switch (type.kind) {
		case "name":
			if (Object.hasOwnProperty.call(scope.types, type.name)) {
				return scope.types[type.name](type, scope);
			}
			throw new TypeError(`Cannot resolve type named ${type.name}`);
		case "array":
			return scope.types.Array(type, scope);
		case "modified":
			return reifyType(type.type, scope);
		case "dictionary":
			return scope.types.Dictionary(type, scope);
		case "tuple":
			const reifiedTypes = type.types.map((inner) => reifyType(inner, scope));
			switch (type.types.length) {
				case 0:
					return primitive(PossibleRepresentation.Undefined, undefinedValue);
				case 1:
					return reifiedTypes[0];
				default:
					return {
						fields: [],
						possibleRepresentations: PossibleRepresentation.Array,
						defaultValue(innerScope) {
							return expr(arrayExpression(reifiedTypes.map((inner) => read(inner.defaultValue(innerScope, alwaysUndefined), innerScope))));
						},
						copy: reifiedTypes.some((elementType) => typeof elementType.copy !== "undefined") ? (value, innerScope) => {
							const expression = read(value, innerScope);
							if (expressionSkipsCopy(expression)) {
								return expr(expression);
							}
							let usedFirst = false;
							const [first, after] = reuseExpression(expression, innerScope);
							return expr(arrayExpression(reifiedTypes.map((elementType, index) => {
								const identifier = usedFirst ? after : (usedFirst = true, first);
								const field = memberExpression(identifier, numericLiteral(index), true);
								return elementType.copy ? read(elementType.copy(expr(field), innerScope), innerScope) : field;
							})));
						} : undefined,
					};
			}
		case "generic":
			// TODO: Handle generics!
			if (type.base.kind === "name") {
				if (Object.hasOwnProperty.call(scope.types, type.base.name)) {
					return scope.types[type.base.name](type, scope);
				}
				throw new TypeError(`Cannot resolve type named ${type.base.name}`);
			}
			throw new TypeError(`Unable to reify a generic of ${type.kind}!`);
		case "metatype":
			return primitive(PossibleRepresentation.Object, expr(objectExpression([])));
		case "function":
			return primitive(PossibleRepresentation.Function, undefinedValue);
		case "namespaced":
			// TODO: Handle namespacing!
			return reifyType(type.type, scope);
		case "optional":
			return scope.types.Optional(type, scope);
		default:
			throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
	}
}

function alwaysUndefined() {
	return undefined;
}
