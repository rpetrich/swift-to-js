import { wrapped } from "../functions";
import { primitive, PossibleRepresentation } from "../reified";
import { literal } from "../values";
import { binaryBuiltin, cachedBuilder } from "./common";

export const Character = cachedBuilder((globalScope) => {
	return primitive(PossibleRepresentation.String, literal(""), {
		"init(_:)": wrapped((scope, arg) => {
			return arg(0, "character");
		}, "(String) -> Character"),
		"==": wrapped(binaryBuiltin("===", 0), "(Character, Character) -> Bool"),
		"!=": wrapped(binaryBuiltin("!==", 0), "(Character, Character) -> Bool"),
		"<": wrapped(binaryBuiltin("<", 0), "(Character, Character) -> Bool"),
		"<=": wrapped(binaryBuiltin("<=", 0), "(Character, Character) -> Bool"),
		">": wrapped(binaryBuiltin(">", 0), "(Character, Character) -> Bool"),
		">=": wrapped(binaryBuiltin(">=", 0), "(Character, Character) -> Bool"),
	});
});
