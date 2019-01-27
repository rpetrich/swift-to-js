import { wrapped } from "../functions";
import { primitive, PossibleRepresentation } from "../reified";
import { literal, undefinedValue } from "../values";
import { cachedBuilder } from "./common";

export const OptionalNilComparisonType = cachedBuilder(() => {
	return primitive(PossibleRepresentation.Null, literal(null), {
		"init(nilLiteral:)": wrapped((scope, arg, type) => literal(null), "() -> _OptionalNilComparisonType"),
	}, Object.create(null), {
		Type: cachedBuilder(() => primitive(PossibleRepresentation.Undefined, undefinedValue)),
	});
});
