export function parse(text: string): Declaration;

export interface Declaration {
	type?: string;
	member?: string;
	local?: string;
	substitutions?: ReadonlyArray<string>;
}
