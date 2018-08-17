export function parse(text: string): Term;

export interface Term {
	name: string;
	args: string[];
	properties: { [name: string]: Property };
	children: Term[];
	location: Location;
}

export type Property = string | Range | string[];

export interface Range {
	from: string;
	to: string;
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
