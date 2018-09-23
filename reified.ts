import { FunctionBuilder, GetterSetterBuilder } from "./functions";
import { parseType } from "./parse";
import { mangleName, Scope } from "./scope";
import { Function, Type } from "./types";
import { concat, lookupForMap } from "./utils";
import { array, call, copy, expr, functionValue, literal, read, reuseExpression, stringifyType, undefinedValue, Value } from "./values";

import { assignmentExpression, Expression, identifier, Identifier, isLiteral, memberExpression, MemberExpression, objectExpression, objectProperty } from "babel-types";

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
	All = ~0,
}

export interface ReifiedType {
	fields: ReadonlyArray<Field>;
	functions: (name: string) => FunctionBuilder | GetterSetterBuilder | undefined;
	conformances: ProtocolConformanceMap;
	innerTypes: Readonly<TypeMap>;
	possibleRepresentations: PossibleRepresentation;
	cases?: ReadonlyArray<EnumCase>;
	defaultValue?(scope: Scope, consume: (fieldName: string) => Expression | undefined): Value;
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

export interface ProtocolConformance {
	[functionName: string]: FunctionBuilder;
}

export interface ProtocolConformanceMap {
	[protocolName: string]: ProtocolConformance;
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
const emptyConformances: ProtocolConformanceMap = Object.create(null);
const noFunctions: Readonly<FunctionMap> = Object.create(null);
const noInnerTypes: Readonly<TypeMap> = Object.create(null);

export function primitive(possibleRepresentations: PossibleRepresentation, defaultValue: Value, fields: ReadonlyArray<Field> = emptyFields, functions: FunctionMap = noFunctions, conformances: ProtocolConformanceMap = emptyConformances, innerTypes: Readonly<TypeMap> = noInnerTypes): ReifiedType {
	return {
		fields,
		functions: functions !== noFunctions ? lookupForMap(functions) : alwaysUndefined,
		conformances,
		possibleRepresentations,
		defaultValue() {
			return defaultValue;
		},
		innerTypes,
	};
}

export function protocol(conformances: ProtocolConformanceMap = emptyConformances): ReifiedType {
	return {
		fields: emptyFields,
		functions(functionName) {
			return (scope, arg, type) => {
				const typeArg = arg(0, "T");
				return call(functionValue(functionName, typeArg, type), type.arguments.types.map((_, i) => i ? arg(i) : typeArg), scope);
			};
		},
		conformances,
		possibleRepresentations: PossibleRepresentation.All,
		innerTypes: noInnerTypes,
	};
}

export function inheritLayout(type: ReifiedType, fields: ReadonlyArray<Field>, functions: FunctionMap = noFunctions, conformances: ProtocolConformanceMap = emptyConformances, innerTypes: Readonly<TypeMap> = noInnerTypes) {
	return {
		fields,
		functions: functions !== noFunctions ? lookupForMap(functions) : alwaysUndefined,
		conformances,
		possibleRepresentations: type.possibleRepresentations,
		defaultValue: type.defaultValue,
		copy: type.copy,
		store: type.store,
		innerTypes,
	};
}

export function struct(fields: ReadonlyArray<Field>, functions: FunctionMap = noFunctions, conformances: ProtocolConformanceMap = emptyConformances, innerTypes: Readonly<TypeMap> = noInnerTypes): ReifiedType {
	const onlyStored = storedFields(fields);
	switch (onlyStored.length) {
		case 0:
			return {
				fields,
				functions: functions !== noFunctions ? lookupForMap(functions) : alwaysUndefined,
				conformances,
				possibleRepresentations: PossibleRepresentation.Undefined,
				defaultValue() {
					return undefinedValue;
				},
				innerTypes,
			};
		case 1:
			// TODO: Map fields appropriately on unary structs
			return inheritLayout(onlyStored[0].type, fields, functions, conformances, innerTypes);
		default:
			return {
				fields,
				functions: functions !== noFunctions ? lookupForMap(functions) : alwaysUndefined,
				conformances,
				possibleRepresentations: PossibleRepresentation.Object,
				defaultValue(scope, consume) {
					return expr(objectExpression(onlyStored.map((field) => {
						let value = consume(field.name);
						if (typeof value === "undefined") {
							const defaultValue = field.type.defaultValue;
							if (typeof defaultValue === "undefined") {
								throw new TypeError(`Cannot default instantiate ${field.name}`);
							}
							value = read(defaultValue(scope, alwaysUndefined), scope);
						}
						return objectProperty(mangleName(field.name), value);
					})));
				},
				copy(value, scope) {
					let usedFirst = false;
					const expression = read(value, scope);
					if (expressionSkipsCopy(expression)) {
						return expr(expression);
					}
					const [first, after] = reuseExpression(expression, scope, "copySource");
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

function cannotDefaultInstantiateClass(): never {
	throw new TypeError(`Cannot default instantiate a class`);
}

export function newClass(fields: ReadonlyArray<Field>, functions: FunctionMap = noFunctions, conformances: ProtocolConformanceMap = emptyConformances, innerTypes: Readonly<TypeMap> = noInnerTypes, defaultValue: (scope: Scope, consume: (fieldName: string) => Expression | undefined) => Value = cannotDefaultInstantiateClass): ReifiedType {
	return {
		fields,
		functions: lookupForMap(functions),
		conformances,
		possibleRepresentations: PossibleRepresentation.Object,
		defaultValue,
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
	const reified = reifyType(type, scope);
	if (!reified.defaultValue) {
		throw new Error(`Cannot default instantiate ${stringifyType(type)}`);
	}
	return reified.defaultValue(scope, consume);
}

function typeArgumentsForArray(args: ReadonlyArray<Type>) {
	return ((count: number) => {
		return args.slice(0, count) as any;
	}) as TypeParameterHost;
}

export function reifyType(typeOrTypeName: Type | string, scope: Scope, typeArguments: ReadonlyArray<Type> = emptyTypes, types?: ReadonlyArray<Readonly<TypeMap>>): ReifiedType {
	const type = typeof typeOrTypeName === "string" ? parseType(typeOrTypeName) : typeOrTypeName;
	switch (type.kind) {
		case "name":
			if (typeof types !== "undefined") {
				// Search the provided types only
				for (const map of types) {
					if (Object.hasOwnProperty.call(map, type.name)) {
						return map[type.name](scope, typeArgumentsForArray(typeArguments));
					}
				}
			} else {
				// Search up the scope chain
				let currentScope: Scope | undefined = scope;
				while (typeof currentScope !== "undefined") {
					const map = currentScope.types;
					if (Object.hasOwnProperty.call(map, type.name)) {
						return map[type.name](scope, typeArgumentsForArray(typeArguments));
					}
					currentScope = currentScope.parent;
				}
			}
			throw new TypeError(`Cannot resolve type named ${type.name}`);
		case "array":
			return reifyType({ kind: "name", name: "Array" }, scope, [type.type]);
		case "modified":
			return reifyType(type.type, scope);
		case "dictionary":
			return reifyType({ kind: "name", name: "Dictionary" }, scope, [type.keyType, type.valueType]);
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
						functions: lookupForMap(noFunctions),
						conformances: {},
						possibleRepresentations: PossibleRepresentation.Array,
						defaultValue(innerScope) {
							return array(reifiedTypes.map((inner, i) => {
								const defaultValue = inner.defaultValue;
								if (typeof defaultValue === "undefined") {
									throw new TypeError(`Tuple field ${i} of type ${stringifyType(type.types[i])} is not default instantiable`);
								}
								return defaultValue(innerScope, alwaysUndefined);
							}), innerScope);
						},
						copy(value, innerScope) {
							if (value.kind === "tuple") {
								return value;
							}
							const expression = read(value, innerScope);
							if (expressionSkipsCopy(expression)) {
								return expr(expression);
							}
							if (!reifiedTypes.some((elementType) => typeof elementType.copy !== "undefined")) {
								return call(expr(memberExpression(expression, identifier("slice"))), [], scope);
							}
							let usedFirst = false;
							const [first, after] = reuseExpression(expression, innerScope, "copySource");
							return array(reifiedTypes.map((elementType, index) => {
								const identifier = usedFirst ? after : (usedFirst = true, first);
								const field = memberExpression(identifier, literal(index), true);
								return elementType.copy ? elementType.copy(expr(field), innerScope) : expr(field);
							}), scope);
						},
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
			return reifyType(type.type, scope, emptyTypes, [reifyType(type.namespace, scope, typeArguments).innerTypes]);
		case "optional":
			return reifyType({ kind: "name", name: "Optional" }, scope, [type.type]);
		default:
			throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
	}
}

function alwaysUndefined() {
	return undefined;
}
