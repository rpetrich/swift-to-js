export function parse(text: string): Declaration;

export interface Declaration {
	type?: string;
	member?: string;
	local?: string;
	substitutions?: ReadonlyArray<Substitution>;
	signature?: ReadonlyArray<GenericConformance>;
}

export interface Substitution {
	from: string;
	to: string;
}

export interface GenericConformance {
	name: string;
	protocol?: string;
}
