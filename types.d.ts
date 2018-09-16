export function parse(text: string): Type;

export type Type = Function | Optional | MetaType | Generic | Dictionary | Array | Tuple | Modified | Name | Namespaced | Constrained;

export interface Optional {
	kind: "optional";
	type: Type;
	location?: Location;
}

export interface Generic {
	kind: "generic";
	base: Type;
	arguments: Type[];
	location?: Location;
}

export interface Function {
	kind: "function";
	arguments: Tuple;
	return: Type;
	throws: boolean;
	rethrows: boolean;
	attributes: string[]
	location?: Location;
}

export interface Tuple {
	kind: "tuple";
	types: Type[];
	location?: Location;
}

export interface Array {
	kind: "array";
	type: Type;
	location?: Location;
}

export interface Dictionary {
	kind: "dictionary";
	keyType: Type;
	valueType: Type;
	location?: Location;
}

export interface MetaType {
	kind: "metatype";
	base: Type;
	as: "Type" | "Protocol"
	location?: Location;
}

export interface Modified {
	kind: "modified";
	modifier: string;
	type: Type;
	location?: Location;
}

export interface Name {
	kind: "name";
	name: string;
	location?: Location;
}

export interface Namespaced {
	kind: "namespaced";
	namespace: Generic | Name;
	type: Type;
	location?: Location;
}

export interface Constrained {
	kind: "constrained";
	type: Type;
	constraint: Type;
	location?: Location;
}


export interface Location {
	start: Position;
	end: Position;
}

export interface Position {
	offset: number;
	line: number;
	column: number;
}
