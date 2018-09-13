import { FunctionBuilder, GetterSetterBuilder } from "./functions";
import { mangleName, Scope } from "./scope";
import { parse as parseType, Type } from "./types";
import { concat } from "./utils";
import { copy, expr, literal, read, reuseExpression, undefinedValue, Value } from "./values";

import { arrayExpression, assignmentExpression, Expression, Identifier, isLiteral, memberExpression, MemberExpression, objectExpression, objectProperty } from "babel-types";

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
	functions: FunctionMap;
	innerTypes: Readonly<TypeMap>;
	possibleRepresentations: PossibleRepresentation;
	cases?: ReadonlyArray<EnumCase>;
	defaultValue(scope: Scope, consume: (fieldName: string) => Expression | undefined): Value;
	copy?(value: Value, scope: Scope): Value;
	store?(target: Identifier | MemberExpression, value: Value, scope: Scope): Expression[];
}

export interface TypeParameterHost {
	(parameterCount: 0): [];
	(parameterCount: 1): [Type];
	(parameterCount: 2): [Type, Type];
	(parameterCount: 3): [Type, Type, Type];
	(parameterCount: 4): [Type, Type, Type, Type];
	(parameterCount: 5): [Type, Type, Type, Type, Type];
	(parameterCount: 6): [Type, Type, Type, Type, Type, Type];
	(parameterCount: 7): [Type, Type, Type, Type, Type, Type, Type];
	(parameterCount: 8): [Type, Type, Type, Type, Type, Type, Type, Type];
	(parameterCount: number): Type[];
}

export interface TypeMap {
	[name: string]: (globalScope: Scope, typeParameters: TypeParameterHost) => ReifiedType;
}

export interface FunctionMap {
	[name: string]: FunctionBuilder | GetterSetterBuilder;
}

export type Field = {
	name: string;
	type: ReifiedType;
} & ({ stored: true } | { stored: false; getter: (target: Value, scope: Scope) => Value; });

export interface EnumCase {
	name: string;
	fieldTypes: ReadonlyArray<ReifiedType>;
}

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

const emptyTypeParameters: ReadonlyArray<string> = [];
const emptyTypes: ReadonlyArray<Type> = [];
const emptyFields: ReadonlyArray<Field> = [];
const noFunctions: Readonly<FunctionMap> = {};
const noInnerTypes: Readonly<TypeMap> = {};

export function primitive(possibleRepresentations: PossibleRepresentation, defaultValue: Value, fields: ReadonlyArray<Field> = emptyFields, functions: FunctionMap = noFunctions, innerTypes: Readonly<TypeMap> = noInnerTypes): ReifiedType {
	return {
		fields,
		functions,
		possibleRepresentations,
		defaultValue() {
			return defaultValue;
		},
		innerTypes,
	};
}

export function inheritLayout(type: ReifiedType, fields: ReadonlyArray<Field>, functions: FunctionMap = noFunctions, innerTypes: Readonly<TypeMap> = noInnerTypes) {
	return {
		fields,
		functions,
		possibleRepresentations: type.possibleRepresentations,
		defaultValue: type.defaultValue,
		copy: type.copy,
		store: type.store,
		innerTypes,
	};
}

export function struct(fields: ReadonlyArray<Field>, functions: FunctionMap = noFunctions, innerTypes: Readonly<TypeMap> = noInnerTypes): ReifiedType {
	const onlyStored = storedFields(fields);
	switch (onlyStored.length) {
		case 0:
			return {
				fields,
				functions,
				possibleRepresentations: PossibleRepresentation.Undefined,
				defaultValue() {
					return undefinedValue;
				},
				innerTypes,
			};
		case 1:
			// TODO: Map fields appropriately on unary structs
			return inheritLayout(onlyStored[0].type, fields, {}, innerTypes);
		default:
			return {
				fields,
				functions,
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
				innerTypes,
			};
	}
}

export function newClass(fields: ReadonlyArray<Field>, functions: FunctionMap = noFunctions, innerTypes: Readonly<TypeMap> = noInnerTypes): ReifiedType {
	return {
		fields,
		functions,
		possibleRepresentations: PossibleRepresentation.Object,
		defaultValue() {
			throw new Error(`Cannot default instantiate a class!`);
		},
		innerTypes,
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

export function storeValue(dest: Identifier | MemberExpression, value: Value, type: Type, scope: Scope): Expression[] {
	const reified = reifyType(type, scope);
	if (reified.store) {
		return reified.store(dest, value, scope);
	} else {
		return [assignmentExpression("=", dest, read(copy(value, type), scope))];
	}
}

export function getField(value: Value, field: Field, scope: Scope) {
	if (field.stored) {
		return expr(memberExpression(read(value, scope), mangleName(field.name)));
	} else {
		return field.getter(value, scope);
	}
}

export function defaultInstantiateType(type: Type, scope: Scope, consume: (fieldName: string) => Expression | undefined): Value {
	return reifyType(type, scope).defaultValue(scope, consume);
}

function typeArgumentsForArray(args: ReadonlyArray<Type>) {
	return ((count: number) => {
		return args.slice(0, count) as any;
	}) as TypeParameterHost;
}

export function reifyType(typeOrTypeName: Type | string, scope: Scope, typeArguments: ReadonlyArray<Type> = emptyTypes, types: Readonly<TypeMap> = scope.types): ReifiedType {
	const type = typeof typeOrTypeName === "string" ? parseType(typeOrTypeName) : typeOrTypeName;
	switch (type.kind) {
		case "name":
			if (Object.hasOwnProperty.call(types, type.name)) {
				return types[type.name](scope, typeArgumentsForArray(typeArguments));
			}
			throw new TypeError(`Cannot resolve type named ${type.name}`);
		case "array":
			return scope.types.Array(scope, typeArgumentsForArray([type.type]));
		case "modified":
			return reifyType(type.type, scope);
		case "dictionary":
			return scope.types.Dictionary(scope, typeArgumentsForArray([type.keyType, type.valueType]));
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
						functions: noFunctions,
						possibleRepresentations: PossibleRepresentation.Array,
						defaultValue(innerScope) {
							return expr(arrayExpression(reifiedTypes.map((inner) => read(inner.defaultValue(innerScope, alwaysUndefined), innerScope))));
						},
						copy: reifiedTypes.some((elementType) => typeof elementType.copy !== "undefined") ? (value, innerScope) => {
							if (value.kind === "tuple") {
								return value;
							}
							const expression = read(value, innerScope);
							if (expressionSkipsCopy(expression)) {
								return expr(expression);
							}
							let usedFirst = false;
							const [first, after] = reuseExpression(expression, innerScope);
							return expr(arrayExpression(reifiedTypes.map((elementType, index) => {
								const identifier = usedFirst ? after : (usedFirst = true, first);
								const field = memberExpression(identifier, literal(index), true);
								return elementType.copy ? read(elementType.copy(expr(field), innerScope), innerScope) : field;
							})));
						} : undefined,
						innerTypes: noInnerTypes,
					};
			}
		case "generic":
			return reifyType(type.base, scope, concat(typeArguments, type.arguments));
		case "metatype":
			return primitive(PossibleRepresentation.Object, expr(literal({})));
		case "function":
			return primitive(PossibleRepresentation.Function, undefinedValue);
		case "namespaced":
			return reifyType(type.type, scope, emptyTypes, reifyType(type.namespace, scope, typeArguments).innerTypes);
		case "optional":
			return scope.types.Optional(scope, typeArgumentsForArray([type.type]));
		default:
			throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
	}
}

function alwaysUndefined() {
	return undefined;
}
