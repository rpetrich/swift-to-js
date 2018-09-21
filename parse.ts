import { parse as ast } from "./ast";
import { parse as declaration } from "./declaration";
import { parse as type } from "./types";

export const parseDeclaration = parse(declaration, "declaration");
export const parseType = parse(type, "type");
export const parseAST = parse(ast, "ast");

function parse<T>(parser: (text: string) => T, description: string): (text: string) => T {
	// const memoized: { [name: string]: T } = Object.create(null);
	return (text: string) => {
		try {
			return parser(text);
			// if (Object.hasOwnProperty.call(memoized, text)) {
			// 	return memoized[text];
			// } else {
			// 	return memoized[text] = parser(text);
			// }
		} catch (e) {
			console.error(`${description}: ${text}`);
			throw e;
		}
	};
}
