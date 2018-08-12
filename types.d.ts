export function parse(text: string): Type;

export type Type = Function | Optional | MetaType | Generic | Dictionary | Array | Tuple | Modified | Name;

export interface Optional {
	kind: "optional";
	type: Type;
	depth: number
}

export interface Generic {
	kind: "generic";
	base: Type;
	arguments: Type;
}

export interface Function {
	kind: "function";
	arguments: Tuple;
	return: Type;
	throws: boolean;
	rethrows: boolean;
	attributes: string[]
}

export interface Tuple {
	kind: "tuple";
	types: Type[];
}

export interface Array {
	kind: "array";
	type: Type;
}

export interface Dictionary {
	kind: "dictionary";
	keyType: Type;
	valueType: Type;
}

export interface MetaType {
	kind: "metatype";
	base: Type;
	as: "Type" | "Protocol"
}

export interface Modified {
	kind: "modified";
	modifier: string;
	type: Type;
}

export interface Name {
	kind: "name";
	name: string;
}
