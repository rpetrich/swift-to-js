import { Term } from "./ast";
import { parseFunctionType } from "./parse";
import { TypeMap } from "./reified";
import { addDeclaration, lookup, mangleName, newScope, rootScope, DeclarationFlags, Scope } from "./scope";
import { Function, Type } from "./types";
import { boxed, call, callable, expr, read, reuse, stringifyType, typeFromValue, typeValue, ArgGetter, Location, Value } from "./values";

import { blockStatement, functionDeclaration, identifier, returnStatement, Identifier, Statement } from "@babel/types";

export type FunctionBuilder = (scope: Scope, arg: ArgGetter, name: string, argumentTypes: Value[]) => Value;

export function statementsInValue(value: Value, scope: Scope): Statement[] {
	return value.kind === "statements" ? value.statements : [returnStatement(read(value, scope))];
}

export function functionize(scope: Scope, name: string, expression: (scope: Scope, arg: ArgGetter) => Value, functionType: Function | string, types?: TypeMap, location?: Location | Term): [Identifier[], Statement[]] {
	const type = parseFunctionType(functionType);
	const args: Identifier[] = [];
	return [args, statementsInValue(newScope(name, scope, (inner) => {
		let usedCount = 0;
		const identifiers: { [index: number]: Identifier } = Object.create(null);
		const newValue = expression(inner, (i, argumentName) => {
			if (usedCount === -1) {
				throw new Error(`Requested access to scope after it was generated!`);
			}
			if (usedCount <= i) {
				usedCount = i + 1;
			}
			if (i < 0) {
				throw new RangeError(`Asked for a negative argument index`);
			}
			if (i >= type.arguments.types.length) {
				throw new RangeError(`Asked for argument ${i + 1} of ${name}, but only ${type.arguments.types.length} arguments provided in ${stringifyType(type)}`);
			}
			let result: Identifier;
			if (Object.hasOwnProperty.call(identifiers, i)) {
				result = identifiers[i];
			} else {
				result = identifiers[i] = identifier(typeof argumentName === "string" ? argumentName : "$" + String(i));
			}
			const argType = type.arguments.types[i];
			return argType.kind === "modified" && argType.modifier === "inout" ? boxed(expr(result), typeValue(argType.type)) : expr(result);
		});
		for (let i = 0; i < usedCount; i++) {
			args[i] = Object.hasOwnProperty.call(identifiers, i) ? identifiers[i] : identifier("$" + String(i));
		}
		usedCount = -1;
		return newValue;
	}, types), scope)];
}

export function insertFunction(name: string, scope: Scope, builder: FunctionBuilder, functionType: Function | string, location?: Location | Term, shouldExport: boolean = false): Value {
	if (typeof builder === "undefined") {
		throw new Error(`Cannot find function named ${name}`);
	}
	if (Object.hasOwnProperty.call(scope.functionUsage, name)) {
		return lookup(name, scope);
	}
	scope.functionUsage[name] = true;
	const globalScope = rootScope(scope);
	const type = parseFunctionType(functionType);
	const [args, statements] = functionize(globalScope, name, (inner, arg) => builder(inner, arg, name, type.arguments.types.map((typeArgument) => typeValue(typeArgument))), type, undefined, location);
	return addDeclaration(globalScope, name, (id) => functionDeclaration(id, args, blockStatement(statements)), shouldExport ? DeclarationFlags.Export : DeclarationFlags.None);
}

export function customInlined(builder: FunctionBuilder, functionType: string | Function, shouldInline: (scope: Scope, arg: ArgGetter) => boolean): FunctionBuilder {
	const type = parseFunctionType(functionType);
	return (scope, arg, name, argumentTypes) => {
		if (type.kind !== "function") {
			throw new Error(`Expected function, got ${stringifyType(type)}`);
		}
		if (shouldInline(scope, arg)) {
			return builder(scope, arg, name, argumentTypes);
		}
		return call(insertFunction(name, scope, builder, type), type.arguments.types.map((_, i) => arg(i)), type.arguments.types.map((innerType) => typeValue(innerType)), scope);
	};
}

function never() {
	return false;
}

export function noinline(builder: FunctionBuilder, functionType: string | Function) {
	return customInlined(builder, functionType, never);
}

export function wrapped(fn: (scope: Scope, arg: ArgGetter, typeArgument: Value, argTypes: Value[], outerArg: ArgGetter) => Value, functionType: string | Function): FunctionBuilder {
	return (scope: Scope, arg: ArgGetter, name: string): Value => {
		const typeArgument = arg(0, "Self");
		const innerType = parseFunctionType(functionType);
		return callable((innerScope, innerArg, argTypes) => newScope("wrapped", innerScope, (innerInner) => fn(innerInner, innerArg, typeArgument, argTypes, arg), {
			Self(innerInner) {
				return typeFromValue(typeArgument, innerInner);
			},
		}), innerType);
	};
}

export function wrappedSelf(fn: (scope: Scope, arg: ArgGetter, typeArgument: Value, self: Value, argTypes: Value[]) => Value, functionType: string | Function): FunctionBuilder {
	return (scope: Scope, arg: ArgGetter, name: string): Value => {
		const typeArgument = arg(0, "Self");
		const selfArgument = arg(1, "self");
		const innerType = parseFunctionType(functionType);
		return callable((innerScope, innerArg, argTypes) => newScope("wrapped", innerScope, (innerInner) => {
			return reuse(selfArgument, innerInner, "self", (self) => {
				return fn(innerInner, innerArg, typeArgument, self, argTypes);
			});
		}, {
			Self(innerInner) {
				return typeFromValue(typeArgument, innerInner);
			},
		}), innerType);
	};
}

export const abstractMethod: FunctionBuilder = (scope, arg, name) => {
	return expr(mangleName("abstract:" + name));
	throw new TypeError(`Abstract method ${name} not overridden`);
};

export function returnType(type: Type) {
	if (type.kind === "function") {
		return type.return;
	}
	throw new Error(`Expected a function type, got a ${type.kind} type`);
}

export function returnFunctionType(type: Type): Function {
	const result = returnType(type);
	if (result.kind !== "function") {
		throw new Error(`Expected to recieve a function that returns a function, instead it returns ${stringifyType(result)}`);
	}
	return result;
}
