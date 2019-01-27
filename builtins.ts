import { primitive, PossibleRepresentation, TypeMap } from "./reified";
import { Scope } from "./scope";
import { binary, literal } from "./values";

import { OptionalNilComparisonType as OptionalNilComparisonTypeBuiltin } from "./builtins/_OptionalNilComparisonType";
import { Array as ArrayBuiltin } from "./builtins/Array";
import { Bool as BoolBuiltin } from "./builtins/Bool";
import { Character as CharacterBuiltin } from "./builtins/Character";
import { ClosedRange as ClosedRangeBuiltin } from "./builtins/ClosedRange";
import { cachedBuilder } from "./builtins/common";
import { DefaultStringInterpolation as DefaultStringInterpolationBuiltin } from "./builtins/DefaultStringInterpolation";
import { Dictionary as DictionaryBuiltin } from "./builtins/Dictionary";
import { buildFloatingType } from "./builtins/floats";
import { functions } from "./builtins/functions";
import { Hasher as HasherBuiltin } from "./builtins/Hasher";
import { IndexingIterator as IndexingIteratorBuiltin } from "./builtins/IndexingIterator";
import { buildIntegerType } from "./builtins/integers";
import { Optional as OptionalBuiltin } from "./builtins/Optional";
import { addDefaultProtocols } from "./builtins/protocols";
import { String as StringBuiltin } from "./builtins/String";

export interface BuiltinConfiguration {
	checkedIntegers: boolean;
	simpleStrings: boolean;
}

function defaultTypes({ checkedIntegers, simpleStrings }: BuiltinConfiguration): TypeMap {
	const protocolTypes: TypeMap = Object.create(null);

	addDefaultProtocols(protocolTypes);

	const BoolType = cachedBuilder(BoolBuiltin);

	return {
		...protocolTypes,
		Bool: BoolType,
		Int1: BoolType,
		UInt: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 4294967295, 32, checkedIntegers, (value, scope) => binary(">>>", value, literal(0), scope))),
		Int: cachedBuilder((globalScope) => buildIntegerType(globalScope, -2147483648, 2147483647, 32, checkedIntegers, (value, scope) => binary("|", value, literal(0), scope))),
		UInt8: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 255, 8, checkedIntegers, (value, scope) => binary("&", value, literal(0xFF), scope))),
		Int8: cachedBuilder((globalScope) => buildIntegerType(globalScope, -128, 127, 8, checkedIntegers, (value, scope) => binary(">>", binary("<<", value, literal(24), scope), literal(24), scope))),
		UInt16: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 65535, 16, checkedIntegers, (value, scope) => binary("&", value, literal(0xFFFF), scope))),
		Int16: cachedBuilder((globalScope) => buildIntegerType(globalScope, -32768, 32767, 16, checkedIntegers, (value, scope) => binary(">>", binary("<<", value, literal(16), scope), literal(16), scope))),
		UInt32: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, 4294967295, 32, checkedIntegers, (value, scope) => binary(">>>", value, literal(0), scope))),
		Int32: cachedBuilder((globalScope) => buildIntegerType(globalScope, -2147483648, 2147483647, 32, checkedIntegers, (value, scope) => binary("|", value, literal(0), scope))),
		UInt64: cachedBuilder((globalScope) => buildIntegerType(globalScope, 0, Number.MAX_SAFE_INTEGER, 53, checkedIntegers, (value) => value)), // 53-bit integers
		Int64: cachedBuilder((globalScope) => buildIntegerType(globalScope, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 53, checkedIntegers, (value) => value)), // 53-bit integers
		Float: cachedBuilder(buildFloatingType),
		Double: cachedBuilder(buildFloatingType),
		String: StringBuiltin(simpleStrings),
		StaticString: cachedBuilder(() => primitive(PossibleRepresentation.String, literal(""), {
		})),
		DefaultStringInterpolation: DefaultStringInterpolationBuiltin,
		Character: CharacterBuiltin,
		Optional: OptionalBuiltin,
		_OptionalNilComparisonType: OptionalNilComparisonTypeBuiltin,
		Array: ArrayBuiltin,
		IndexingIterator: IndexingIteratorBuiltin,
		Dictionary: DictionaryBuiltin,
		Error: cachedBuilder((globalScope) => primitive(PossibleRepresentation.Number, literal(0), {
			hashValue(scope, arg) {
				return arg(0, "self");
			},
		})),
		ClosedRange: ClosedRangeBuiltin,
		Hasher: HasherBuiltin,
	};
}

export function newScopeWithBuiltins(): Scope {
	return {
		name: "global",
		declarations: Object.create(null),
		types: defaultTypes({
			checkedIntegers: false,
			simpleStrings: true,
		}),
		functions: Object.assign(Object.create(null), functions),
		functionUsage: Object.create(null),
		mapping: Object.create(null),
		parent: undefined,
	};
}
