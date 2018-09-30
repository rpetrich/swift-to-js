import { FunctionBuilder, GetterSetterBuilder } from "./functions";
import { parseType } from "./parse";
import { lookup, mangleName, Scope } from "./scope";
import { Type } from "./types";
import { concat, lookupForMap } from "./utils";
import { array, call, contentsOfBox, expr, functionValue, member, read, reuse, set, stringifyType, stringifyValue, typeFromValue, typeValue, undefinedValue, Value } from "./values";

import { isLiteral, objectExpression, objectProperty, Expression } from "babel-types";

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
	store?(target: Value, value: Value, scope: Scope): Value;
}

export type TypeParameterHost = <T extends Array<unknown>>(...args: T) => { [K in keyof T]: T[K] extends string ? Value : T[K] } & Iterable<Value>;

export interface TypeMap {
	[name: string]: (globalScope: Scope, typeParameters: TypeParameterHost) => ReifiedType;
}

export interface FunctionMap {
	[name: string]: FunctionBuilder | GetterSetterBuilder;
}

export interface ProtocolConformance {
	functions: { [functionName: string]: FunctionBuilder };
	conformances: ProtocolConformanceMap;
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

function representationForFields(onlyStoredFields: ReadonlyArray<Field>) {
	switch (onlyStoredFields.length) {
		case 0:
			return PossibleRepresentation.Undefined;
		case 1:
			return onlyStoredFields[0].type.possibleRepresentations;
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
				return call(functionValue(functionName, typeArg, type), type.arguments.types.map((_, i) => i ? arg(i) : typeArg), type.arguments.types.map((innerType) => typeValue(innerType)), scope);
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
					return expr(objectExpression(onlyStored.map((fieldDeclaration) => {
						let value = consume(fieldDeclaration.name);
						if (typeof value === "undefined") {
							const defaultValue = fieldDeclaration.type.defaultValue;
							if (typeof defaultValue === "undefined") {
								throw new TypeError(`Cannot default instantiate ${fieldDeclaration.name}`);
							}
							value = read(defaultValue(scope, alwaysUndefined), scope);
						}
						return objectProperty(mangleName(fieldDeclaration.name), value);
					})));
				},
				copy(value, scope) {
					const usedFirst = false;
					const expression = read(value, scope);
					if (expressionSkipsCopy(expression)) {
						return expr(expression);
					}
					return reuse(expr(expression), scope, "copySource", (source) => {
						return expr(objectExpression(onlyStored.map((fieldDeclaration, index) => {
							const propertyExpr = member(source, mangleName(fieldDeclaration.name).name, scope);
							const copiedValue = fieldDeclaration.type.copy ? fieldDeclaration.type.copy(propertyExpr, scope) : propertyExpr;
							return objectProperty(mangleName(fieldDeclaration.name), read(copiedValue, scope));
						})));
					});
				},
				// store(target, value, scope) {
				//  	let usedFirst = false;
				//  	return reuse(value, scope, (first, after) => {
				// 		return onlyStored.reduce((existing, fieldLayout) => {
				// 			const identifier = usedFirst ? after : (usedFirst = true, first);
				// 			return existing.concat(storeValue(mangleName(fieldLayout.name), getField(expr(identifier), fieldLayout, scope), fieldLayout.type, scope));
				// 		}, [] as Expression[]);
				// 	});
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

function isStored(fieldDeclaration: Field) {
	return fieldDeclaration.stored;
}

function storedFields(fields: ReadonlyArray<Field>) {
	return fields.filter(isStored);
}

export function expressionSkipsCopy(expression: Expression): boolean {
	switch (expression.type) {
		case "ObjectExpression":
		case "ArrayExpression":
		case "CallExpression":
			return true;
		case "ConditionalExpression":
			return expressionSkipsCopy(expression.consequent) && expressionSkipsCopy(expression.alternate);
		default:
			return isLiteral(expression);
	}
}

export function store(dest: Value, source: Value, type: Value, scope: Scope): Value {
	switch (dest.kind) {
		case "boxed":
			return store(contentsOfBox(dest, scope), source, type, scope);
		case "direct":
			const reified = typeFromValue(type, scope);
			if (reified.store) {
				return reified.store(dest, source, scope);
			} else {
				return set(dest, source, scope, "=");
			}
		case "subscript":
			return set(dest, source, scope, "=");
		default:
			throw new TypeError(`Unable to store to a ${dest.kind} value`);
	}
}

export function getField(value: Value, fieldDeclaration: Field, scope: Scope) {
	if (fieldDeclaration.stored) {
		return member(value, fieldDeclaration.name, scope);
	} else {
		return fieldDeclaration.getter(value, scope);
	}
}

export function defaultInstantiateType(type: Value, scope: Scope, consume: (fieldName: string) => Expression | undefined): Value {
	const reified = typeFromValue(type, scope);
	if (!reified.defaultValue) {
		throw new Error(`Cannot default instantiate ${stringifyValue(type)}`);
	}
	return reified.defaultValue(scope, consume);
}

function typeArgumentsForArray(args: ReadonlyArray<Value>): TypeParameterHost {
	return ((...requested: string[]) => {
		if (requested.length > args.length) {
			throw new TypeError(`Requested ${requested.length} type arguments from array that only contains ${args.length} elements`);
		}
		return args.slice(0, args.length);
	}) as TypeParameterHost;
}

export function reifyType(typeOrTypeName: Type | string, scope: Scope, typeArguments: ReadonlyArray<Value> = [], types?: ReadonlyArray<Readonly<TypeMap>>): ReifiedType {
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
			return typeFromValue(lookup(type.name, scope), scope);
			// throw new TypeError(`Cannot resolve type named ${type.name}`);
		case "array":
			return reifyType({ kind: "name", name: "Array" }, scope, [typeValue(type.type)]);
		case "modified":
			return reifyType(type.type, scope);
		case "dictionary":
			return reifyType({ kind: "name", name: "Dictionary" }, scope, [typeValue(type.keyType), typeValue(type.valueType)]);
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
								return call(member(expr(expression), "slice", scope), [], [], scope);
							}
							return reuse(expr(expression), innerScope, "copySource", (source) => {
								return array(reifiedTypes.map((elementType, index) => {
									const fieldValue = member(source, index, innerScope);
									return elementType.copy ? elementType.copy(fieldValue, innerScope) : fieldValue;
								}), scope);
							});
						},
						innerTypes: noInnerTypes,
					};
			}
		case "generic":
			return reifyType(type.base, scope, concat(typeArguments, type.arguments.map((innerType) => typeValue(innerType))));
		case "metatype":
			const reified = reifyType(type.base, scope, typeArguments);
			if (!Object.hasOwnProperty.call(reified.innerTypes, type.as)) {
				throw new TypeError(`${stringifyType(type.base)} does not have a ${type.as} inner type`);
			}
			return reified.innerTypes[type.as](scope, typeArgumentsForArray([]));
		case "function":
			return primitive(PossibleRepresentation.Function, undefinedValue);
		case "namespaced":
			return reifyType(type.type, scope, [], [reifyType(type.namespace, scope, typeArguments).innerTypes]);
		case "optional":
			return reifyType({ kind: "name", name: "Optional" }, scope, [typeValue(type.type)]);
		default:
			throw new TypeError(`Received an unexpected type ${(type as Type).kind}`);
	}
}

function alwaysUndefined(): undefined {
	return undefined;
}
