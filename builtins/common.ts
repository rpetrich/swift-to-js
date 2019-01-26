import { wrapped } from "../functions";
import { reifyType, ProtocolConformanceMap, ReifiedType } from "../reified";
import { mangleName, MappedNameValue, Scope } from "../scope";
import { Tuple } from "../types";
import { concat } from "../utils";
import { binary, call, expr, functionValue, literal, member, reuse, set, stringifyValue, typeFromValue, typeValue, update, updateOperatorForBinaryOperator, ArgGetter, BinaryOperator, ExpressionValue, Value } from "../values";

export function returnTodo(scope: Scope, arg: ArgGetter, name: string): Value {
	console.error(name);
	return call(expr(mangleName("todo_missing_builtin$" + name)), [], [], scope);
}

export function binaryBuiltin(operator: BinaryOperator, typeArgumentCount: number, valueChecker?: (value: Value, scope: Scope) => Value) {
	return (scope: Scope, arg: ArgGetter) => {
		const unchecked = binary(operator,
			arg(typeArgumentCount, "lhs"),
			arg(typeArgumentCount + 1, "rhs"),
			scope,
		);
		return typeof valueChecker !== "undefined" ? valueChecker(unchecked, scope) : unchecked;
	};
}

export function updateBuiltin(operator: keyof typeof updateOperatorForBinaryOperator, typeArgumentCount: number, valueChecker?: (value: Value, scope: Scope) => Value) {
	if (typeof valueChecker !== "undefined") {
		return (scope: Scope, arg: ArgGetter) => update(arg(typeArgumentCount, "target"), scope, (value) => valueChecker(binary(operator, value, arg(typeArgumentCount + 1, "value"), scope), scope));
	}
	return (scope: Scope, arg: ArgGetter) => set(arg(typeArgumentCount, "target"), arg(typeArgumentCount + 1, "value"), scope, updateOperatorForBinaryOperator[operator]);
}

export const readLengthField = wrapped((scope: Scope, arg: ArgGetter) => {
	return member(arg(0, "self"), "length", scope);
}, "(Any) -> Int");

export const isEmptyFromLength = wrapped((scope: Scope, arg: ArgGetter) => {
	return binary("!==", member(arg(0, "self"), "length", scope), literal(0), scope);
}, "(Any) -> Bool");

export const startIndexOfZero = wrapped((scope: Scope, arg: ArgGetter) => {
	return literal(0);
}, "(Any) -> Int");

export const voidType: Tuple = { kind: "tuple", types: [] };

export const forceUnwrapFailed: Value = functionValue("Swift.(swift-to-js).forceUnwrapFailed()", undefined, { kind: "function", arguments: voidType, return: voidType, throws: true, rethrows: false, attributes: [] });

export function cachedBuilder(fn: (scope: Scope) => ReifiedType): (scope: Scope) => ReifiedType {
	let value: ReifiedType | undefined;
	return (scope: Scope) => {
		if (typeof value === "undefined") {
			return value = fn(scope);
		}
		return value;
	};
}

export function resolveMethod(type: Value, name: string, scope: Scope, additionalArgs: Value[] = [], additionalTypes: Value[] = []) {
	const functionBuilder = typeFromValue(type, scope).functions(name);
	if (typeof functionBuilder !== "function") {
		throw new TypeError(`Could not find ${name} in ${stringifyValue(type)}`);
	}
	return functionBuilder(scope, (i) => {
		if (i === 0) {
			return type;
		}
		if (i > additionalArgs.length) {
			throw new RangeError(`Asked for argument ${i}, but only ${additionalArgs.length} are available (shifted for hidden protocol self value)`);
		}
		return additionalArgs[i - 1];
	}, name, concat([typeValue("Type")], additionalTypes));
}

export function applyDefaultConformances(conformances: ProtocolConformanceMap, scope: Scope): ProtocolConformanceMap {
	const result: ProtocolConformanceMap = Object.create(null);
	for (const key of Object.keys(conformances)) {
		const reified = reifyType(key, scope);
		if (!Object.hasOwnProperty.call(reified.conformances, key)) {
			throw new TypeError(`${key} is not a protocol`);
		}
		const base = conformances[key];
		result[key] = {
			functions: {...reified.conformances[key].functions, ...base.functions},
			requirements: base.requirements,
		};
	}
	return result;
}

export function reuseArgs<T extends string[]>(arg: ArgGetter, offset: number, scope: Scope, names: T, callback: (...values: { [P in keyof T]: (ExpressionValue | MappedNameValue) }) => Value): Value {
	if (names.length === 0) {
		return (callback as () => Value)();
	}
	const [name, ...remaining] = names;
	if (names.length === 1) {
		return reuse(arg(offset, name), scope, name, callback as unknown as (value: ExpressionValue | MappedNameValue) => Value);
	}
	return reuse(arg(offset, name), scope, name, (value) => reuseArgs(arg, offset + 1, scope, remaining, (callback as unknown as (identifier: ExpressionValue | MappedNameValue, ...remaining: Array<ExpressionValue | MappedNameValue>) => Value).bind(null, value)));
}

