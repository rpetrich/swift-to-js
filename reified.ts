import { FunctionBuilder } from "./functions";
import { parseType } from "./parse";
import { lookup, Scope } from "./scope";
import { Type } from "./types";
import { concat, lookupForMap } from "./utils";
import { array, call, conditional, expr, extractContentOfBox, member, read, reuse, set, stringifyType, stringifyValue, typeFromValue, typeRequiresBox, typeValue, undefinedValue, Value } from "./values";

import { isLiteral, Expression } from "@babel/types";

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
	functions: (name: string) => FunctionBuilder | undefined;
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
	[name: string]: FunctionBuilder;
}

export interface ProtocolConformance {
	functions: { [functionName: string]: FunctionBuilder };
	requirements: string[];
}

export interface ProtocolConformanceMap {
	[protocolName: string]: ProtocolConformance;
}

export interface EnumCase {
	name: string;
	fieldTypes: ReadonlyArray<ReifiedType>;
}

const emptyConformances: ProtocolConformanceMap = Object.create(null);
const noFunctions: Readonly<FunctionMap> = Object.create(null);
const noInnerTypes: Readonly<TypeMap> = Object.create(null);

export function primitive(possibleRepresentations: PossibleRepresentation, defaultValue: Value, functions: FunctionMap = noFunctions, conformances: ProtocolConformanceMap = emptyConformances, innerTypes: Readonly<TypeMap> = noInnerTypes): ReifiedType {
	return {
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
		functions(functionName) {
			return (scope, arg, name, argTypes) => {
				const typeArg = arg(0, "Self");
				const fn = typeFromValue(typeArg, scope).functions(functionName);
				if (typeof fn !== "function") {
					throw new TypeError(`Could not find ${functionName} on ${stringifyValue(typeArg)}`);
				}
				return fn(scope, arg, name, argTypes);
			};
		},
		conformances,
		possibleRepresentations: PossibleRepresentation.All,
		innerTypes: noInnerTypes,
	};
}

export function inheritLayout(type: ReifiedType, functions: FunctionMap = noFunctions, conformances: ProtocolConformanceMap = emptyConformances, innerTypes: Readonly<TypeMap> = noInnerTypes) {
	return {
		functions: functions !== noFunctions ? lookupForMap(functions) : alwaysUndefined,
		conformances,
		possibleRepresentations: type.possibleRepresentations,
		defaultValue: type.defaultValue,
		copy: type.copy,
		store: type.store,
		innerTypes,
	};
}

function cannotDefaultInstantiateClass(): never {
	throw new TypeError(`Cannot default instantiate a class`);
}

export function newClass(functions: FunctionMap = noFunctions, conformances: ProtocolConformanceMap = emptyConformances, innerTypes: Readonly<TypeMap> = noInnerTypes, defaultValue: (scope: Scope, consume: (fieldName: string) => Expression | undefined) => Value = cannotDefaultInstantiateClass): ReifiedType {
	return {
		functions: lookupForMap(functions),
		conformances,
		possibleRepresentations: PossibleRepresentation.Object,
		defaultValue,
		innerTypes,
	};
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
			return conditional(
				typeRequiresBox(dest.type, scope),
				store(extractContentOfBox(dest, scope), source, type, scope),
				store(dest.contents, source, type, scope),
				scope,
			);
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
			return reified;
			// if (!Object.hasOwnProperty.call(reified.innerTypes, type.as)) {
			// 	throw new TypeError(`${stringifyType(type.base)} does not have a ${type.as} inner type`);
			// }
			// return reified.innerTypes[type.as](scope, typeArgumentsForArray([]));
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
