import { parse as ast } from "./ast";
import { parse as declaration } from "./declaration";
import { parse as type, Function } from "./types";

export const parseDeclaration = parse(declaration, "declaration");
export const parseType = parse(type, "type", "Bool", "Int", "String", "Hashable", "Hasher", "Equatable", "Comparable", "BinaryInteger", "Numeric", "SignedInteger", "SignedNumeric", "FixedWidthInteger", "Strideable", "CustomStringConvertible", "LosslessStringConvertible", "Collection", "BidirectionalCollection", "Type", "T", "T.Type", "() -> Void", "(Self, Self) -> Self", "(inout Self, Self) -> Void", "(Self, Self) -> Bool", "(Self, inout Hasher) -> Bool", "(Self) -> Int");
export const parseAST = parse(ast, "ast");

export function parseFunctionType(text: string): Function {
	const result = parseType(text);
	if (result.kind !== "function") {
		throw new TypeError(`Expected a function, got a ${result.kind} from ${text}`);
	}
	return result;
}

function parse<T>(parser: (text: string) => T, description: string, ...precomputedKeys: string[]): (text: string) => T {
	if (precomputedKeys.length === 0) {
		return (text: string): T => {
			try {
				return parser(text);
			} catch (e) {
				console.error(`${description}: ${text}`);
				throw e;
			}
		};
	}
	const precomputed: { [name: string]: T } = Object.create(null);
	for (const key of precomputedKeys) {
		precomputed[key] = parser(key);
	}
	return (text: string): T => {
		if (Object.hasOwnProperty.call(precomputed, text)) {
			return precomputed[text];
		}
		try {
			return parser(text);
		} catch (e) {
			console.error(`${description}: ${text}`);
			throw e;
		}
	};
}
