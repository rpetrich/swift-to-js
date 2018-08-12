export function parse(text: string): Term;

export interface Term {
	name: string;
	args: string[];
	properties: { [name: string]: Property };
	children: Term[];
}

export type Property = string | Range | string[];

export interface Range {
	from: string;
	to: string;
}
