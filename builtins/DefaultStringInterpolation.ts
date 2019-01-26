import { wrapped } from "../functions";
import { primitive, PossibleRepresentation } from "../reified";
import { literal, set, statements } from "../values";
import { cachedBuilder } from "./common";

export const DefaultStringInterpolation = cachedBuilder((globalScope) => primitive(PossibleRepresentation.String, literal(""), {
	"init(literalCapacity:interpolationCount:)": wrapped(() => literal(""), `(Int, Int) -> Self`),
	"appendLiteral": wrapped((scope, arg, type, argTypes, outerArg) => {
		const interpolationArg = outerArg(0, "interpolation");
		const literalArg = arg(0, "literal");
		if (literalArg.kind === "expression" && literalArg.expression.type === "StringLiteral" && literalArg.expression.value === "") {
			return statements([]);
		} else {
			return set(interpolationArg, literalArg, scope, "+=");
		}
	}, `(String) -> Void`),
	"appendInterpolation": wrapped((scope, arg, type, argTypes, outerArg) => {
		return set(outerArg(1, "interpolation"), arg(0, "value"), scope, "+=");
	}, `(String) -> Void`),
}));
